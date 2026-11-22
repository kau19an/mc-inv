// dump dos modelos "especiais" (baú, shulker, estandarte, cabeça, escudo, vaso, conduíte, estátua de golem):
// o jogo desenha esses itens com modelos de entidade, não com modelos de bloco. aqui a gente monta o
// renderizador de cada um do mesmo jeito que o jogo e entrega pra ele um destino falso que, em vez de
// mandar pra placa de vídeo, anota cada quadrado já na posição final, com a textura e a cor.
//
// duas épocas de desenho, as duas atendidas (tudo por reflexão, pra compilar contra qualquer versão):
// - SubmitNodeCollector (25w21a em diante): o renderizador entrega modelos inteiros (submitModel) ou peças
//   soltas (submitModelPart); a gente percorre os cubos e calcula os vértices;
// - MultiBufferSource (antes): o renderizador escreve os vértices prontos num VertexConsumer; a gente grava
//   cada vértice e junta de 4 em 4.
//
// entrada: json com os modelos especiais (o "model" de dentro de cada { "type": "minecraft:special" })
// saída:   json com a malha de cada um
//
// uso: java -cp <classes>:<jar>:<libs> SpecialModelsDump <entrada.json> <saida.json>
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.serialization.Codec;
import com.mojang.serialization.Lifecycle;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.JsonOps;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.IdentityHashMap;
import java.util.Map;
import net.minecraft.SharedConstants;
import net.minecraft.core.MappedRegistry;
import net.minecraft.resources.ResourceKey;
import net.minecraft.client.model.geom.EntityModelSet;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.server.Bootstrap;
import org.joml.Matrix4f;
import org.joml.Vector3f;

public final class SpecialModelsDump {
  // sprites "de mentirinha": o jogo pede um sprite pela id e depois só repassa adiante.
  // como a gente não tem atlas de texturas (não há placa de vídeo), cria um objeto vazio e lembra de qual id ele é.
  // a id é um SpriteId (26.1-pre-1 em diante) ou um Material (antes): os dois têm atlasLocation() e texture()
  private static final Map<Object, Object> FAKE_SPRITES = new IdentityHashMap<>();
  // na época do MultiBufferSource, o sprite não chega junto com os vértices: vale o último que o renderizador pediu
  private static Object lastSprite;

  public static void main(String[] args) throws Exception {
    Path input = Path.of(args[0]);
    Path output = Path.of(args[1]);

    SharedConstants.tryDetectVersion();
    Bootstrap.bootStrap();
    JsonObject result = new JsonObject();
    JsonObject entries = JsonParser.parseString(Files.readString(input)).getAsJsonObject();

    // os modelos especiais (definições de item "minecraft:special") só existem da 1.21.4 em diante
    Class<?> renderers;
    try {
      renderers = Class.forName(SPECIAL + "SpecialModelRenderers");
    } catch (ClassNotFoundException older) {
      for (String key : entries.keySet()) {
        JsonObject failed = new JsonObject();
        failed.addProperty("error", "versão sem modelos especiais (antes da 1.21.4)");
        result.add(key, failed);
      }
      Files.writeString(output, new GsonBuilder().disableHtmlEscaping().create().toJson(result));
      return;
    }
    Codec<?> codec = specialModelCodec(renderers);
    EntityModelSet models = DumpUtil.entityModels();
    if (bufferEra()) installFakeAtlases();

    for (Map.Entry<String, JsonElement> entry : entries.entrySet()) {
      try {
        Object unbaked = codec.parse(JsonOps.INSTANCE, entry.getValue()).getOrThrow();
        Object renderer = bake(unbaked, models);
        JsonArray parts = new JsonArray();
        lastSprite = null;
        // sem dados do item (padrão): estandarte liso, vaso sem cacos, cabeça com a skin padrão…
        if (renderer != null) draw(renderer, parts);
        JsonObject model = new JsonObject();
        model.add("parts", parts);
        result.add(entry.getKey(), model);
      } catch (Exception error) {
        Throwable cause = error.getCause() != null ? error.getCause() : error;
        JsonObject failed = new JsonObject();
        failed.addProperty("error", String.valueOf(cause));
        result.add(entry.getKey(), failed);
      }
    }
    Files.writeString(output, new GsonBuilder().disableHtmlEscaping().create().toJson(result));
  }

  private static final String SPECIAL = "net.minecraft.client.renderer.special.";

  // id de um sprite pedido pelo caminho antigo (atlas + textura), com os mesmos nomes do SpriteId/Material
  record SpriteKey(Object atlasLocation, Object texture) {}

  // época do MultiBufferSource: o renderizador desenha com render(..., MultiBufferSource, ...)
  private static boolean bufferEra() throws ClassNotFoundException {
    for (Method method : Class.forName(SPECIAL + "SpecialModelRenderer").getMethods()) if (method.getName().equals("render")) return true;
    return false;
  }

  // na época do MultiBufferSource, Material.sprite() pede o sprite pro jogo aberto:
  // Minecraft.getInstance().getTextureAtlas(atlas) → ModelManager.getAtlas → AtlasSet → TextureAtlas.getSprite.
  // sem jogo aberto, monta essa corrente com objetos vazios (achados pelo tipo de cada campo) e um mapa que devolve
  // um sprite falso pra qualquer textura pedida — e lembra qual foi, como no caminho novo
  @SuppressWarnings({"unchecked", "rawtypes"})
  private static void installFakeAtlases() {
    try {
      Class<?> minecraftClass = Class.forName("net.minecraft.client.Minecraft");
      Class<?> modelManagerClass = Class.forName("net.minecraft.client.resources.model.ModelManager");
      Class<?> atlasSetClass = Class.forName("net.minecraft.client.resources.model.AtlasSet");
      Class<?> atlasClass = Class.forName("net.minecraft.client.renderer.texture.TextureAtlas");
      Object minecraft = allocate(minecraftClass);
      setField(minecraftClass, null, minecraftClass, minecraft, true); // Minecraft.instance
      Object modelManager = allocate(modelManagerClass);
      setField(minecraftClass, minecraft, modelManagerClass, modelManager, false);
      Object atlasSet = allocate(atlasSetClass);
      setField(modelManagerClass, modelManager, atlasSetClass, atlasSet, false);
      // o valor do mapa é o AtlasEntry (o StitchResult também guarda um TextureAtlas, mas é outra coisa)
      Class<?> entryClass = null;
      for (Class<?> nested : atlasSetClass.getDeclaredClasses()) {
        boolean holdsAtlas = false;
        for (Field field : nested.getDeclaredFields()) if (field.getType() == atlasClass) holdsAtlas = true;
        if (holdsAtlas && (entryClass == null || nested.getSimpleName().equals("AtlasEntry"))) entryClass = nested;
      }
      Class<?> finalEntryClass = entryClass;
      Map<Object, Object> entries = new java.util.HashMap<>() {
        @Override public Object get(Object location) {
          return computeIfAbsent(location, key -> {
            try {
              Object atlas = fakeAtlas(atlasClass, key);
              if (finalEntryClass == null) return atlas;
              Object entry = allocate(finalEntryClass);
              setField(finalEntryClass, entry, atlasClass, atlas, false);
              return entry;
            } catch (ReflectiveOperationException error) {
              throw new IllegalStateException(error);
            }
          });
        }
        @Override public Object getOrDefault(Object key, Object fallback) { return get(key); }
      };
      setField(atlasSetClass, atlasSet, Map.class, entries, false);
    } catch (ReflectiveOperationException | RuntimeException error) {
      System.err.println("atlas falso não montado: " + error);
    }
  }

  private static Object fakeAtlas(Class<?> atlasClass, Object location) throws ReflectiveOperationException {
    Object atlas = allocate(atlasClass);
    Map<Object, Object> sprites = new java.util.HashMap<>() {
      @Override public Object get(Object name) { return fakeSprite(new SpriteKey(location, name)); }
      @Override public Object getOrDefault(Object name, Object fallback) { return get(name); }
    };
    for (Class<?> type = atlasClass; type != null; type = type.getSuperclass()) {
      for (Field field : type.getDeclaredFields()) {
        if (java.lang.reflect.Modifier.isStatic(field.getModifiers())) continue;
        field.setAccessible(true);
        if (Map.class.isAssignableFrom(field.getType())) field.set(atlas, sprites);
        else if (location != null && field.getType().isInstance(location)) field.set(atlas, location);
        else if (field.getType() == TextureAtlasSprite.class) field.set(atlas, fakeSprite(new SpriteKey(location, "missingno")));
      }
    }
    return atlas;
  }

  private static Object allocate(Class<?> type) throws ReflectiveOperationException {
    Field field = Class.forName("sun.misc.Unsafe").getDeclaredField("theUnsafe");
    field.setAccessible(true);
    Object unsafe = field.get(null);
    return unsafe.getClass().getMethod("allocateInstance", Class.class).invoke(unsafe, type);
  }

  // primeiro campo de owner (estático ou não) cujo tipo aceita value
  private static void setField(Class<?> owner, Object target, Class<?> type, Object value, boolean isStatic) throws ReflectiveOperationException {
    for (Field field : owner.getDeclaredFields()) {
      if (java.lang.reflect.Modifier.isStatic(field.getModifiers()) != isStatic || !field.getType().isAssignableFrom(type)) continue;
      field.setAccessible(true);
      field.set(target, value);
      return;
    }
    throw new NoSuchFieldException(owner.getName() + ": campo do tipo " + type.getName());
  }

  // Unbaked.bake(contexto): 1.21.9 em diante recebe um BakingContext (modelos, sprites, skins);
  // antes, só o EntityModelSet
  private static Object bake(Object unbaked, EntityModelSet models) throws ReflectiveOperationException {
    for (Class<?> type = unbaked.getClass(); type != null; type = type.getSuperclass()) {
      for (Method method : type.getDeclaredMethods()) {
        if (!method.getName().equals("bake") || method.getParameterCount() != 1 || method.isSynthetic()) continue;
        Class<?> parameter = method.getParameterTypes()[0];
        method.setAccessible(true);
        return method.invoke(unbaked, parameter.isInstance(models) ? models : bakingContext(parameter, models));
      }
    }
    throw new NoSuchMethodException(unbaked.getClass().getName() + ".bake");
  }

  // a api muda entre versões, então tudo por reflexão (compila contra qualquer uma):
  // - até a 26.3: bootstrap() sem parâmetro preenche um mapa interno, e o CODEC estático usa esse mapa
  // - 26.4: bootstrap(registro) preenche um registro do cliente; a gente cria um registro próprio,
  //   pede pro jogo preencher e monta o mesmo "dispatch" do CODEC em cima dele
  @SuppressWarnings({"unchecked", "rawtypes"})
  private static Codec<?> specialModelCodec(Class<?> renderers) throws ReflectiveOperationException {
    for (Method method : renderers.getMethods()) {
      if (!method.getName().equals("bootstrap")) continue;
      if (method.getParameterCount() == 0) {
        method.invoke(null);
        return (Codec<?>) renderers.getField("CODEC").get(null);
      }
      if (method.getParameterCount() == 1) {
        MappedRegistry registry = new MappedRegistry(registryKey("special_model_renderer_type"), Lifecycle.stable());
        method.invoke(null, registry);
        registry.freeze(); // sem congelar, as entradas ficam "não ligadas" e o codec não acha nada
        Codec<MapCodec> types = registry.byNameCodec();
        return types.dispatch(unbaked -> (MapCodec) call(unbaked, "type"), type -> (MapCodec) type);
      }
    }
    // versões sem bootstrap: o CODEC já vem pronto
    return (Codec<?>) renderers.getField("CODEC").get(null);
  }

  // chave de registro "minecraft:<nome>": Identifier (26.x) ou ResourceLocation (1.21.x)
  @SuppressWarnings("rawtypes")
  private static ResourceKey registryKey(String name) throws ReflectiveOperationException {
    Class<?> idClass;
    try {
      idClass = Class.forName("net.minecraft.resources.Identifier");
    } catch (ClassNotFoundException older) {
      idClass = Class.forName("net.minecraft.resources.ResourceLocation");
    }
    Object id = idClass.getMethod("withDefaultNamespace", String.class).invoke(null, name);
    return (ResourceKey) ResourceKey.class.getMethod("createRegistryKey", idClass).invoke(null, id);
  }

  // contexto de montagem pelos nomes, sem depender dos tipos de cada época:
  // - 26.1-pre-1 em diante: sprites() devolve um SpriteGetter (sprite pela SpriteId)
  // - antes: materials() devolve um MaterialSet (sprite pelo Material)
  // os dois são interfaces de um método só, então um proxy atende qualquer um
  private static Object bakingContext(Class<?> type, EntityModelSet models) {
    InvocationHandler handler = (proxy, method, args) -> switch (method.getName()) {
      case "entityModelSet" -> models;
      case "playerSkinRenderCache" -> null;
      case "sprites", "materials" -> spriteLookup(method.getReturnType());
      default -> method.isDefault() ? InvocationHandler.invokeDefault(proxy, method, args) : defaultValue(method.getReturnType());
    };
    return Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[] {type}, handler);
  }

  private static Object spriteLookup(Class<?> type) {
    InvocationHandler handler = (proxy, method, args) -> {
      if (method.isDefault()) return InvocationHandler.invokeDefault(proxy, method, args);
      if (args != null && args.length == 1 && method.getReturnType() == TextureAtlasSprite.class) return fakeSprite(args[0]);
      return defaultValue(method.getReturnType());
    };
    return Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[] {type}, handler);
  }

  // chama submit() (SubmitNodeCollector) ou render() (MultiBufferSource), montando os argumentos pelos tipos
  private static void draw(Object renderer, JsonArray parts) throws ReflectiveOperationException {
    for (Method method : Class.forName(SPECIAL + "SpecialModelRenderer").getMethods()) {
      if (!method.getName().equals("submit") && !method.getName().equals("render")) continue;
      Class<?>[] types = method.getParameterTypes();
      Object[] args = new Object[types.length];
      int ints = 0;
      for (int index = 0; index < types.length; index++) {
        Class<?> type = types[index];
        String name = type.getSimpleName();
        if (type == PoseStack.class) args[index] = new PoseStack();
        else if (name.equals("SubmitNodeCollector")) args[index] = submitRecorder(type, parts);
        else if (name.equals("MultiBufferSource")) args[index] = bufferRecorder(type, parts);
        else if (type == ItemDisplayContext.class) args[index] = ItemDisplayContext.GUI;
        else if (type == boolean.class) args[index] = false;
        // os ints, na ordem: luz (máxima), overlay, cor do contorno
        else if (type == int.class) args[index] = ints++ == 0 ? 0xF000F0 : 0;
        else args[index] = null; // o argumento do item (padrão)
      }
      method.invoke(renderer, args);
      return;
    }
    throw new IllegalStateException("SpecialModelRenderer sem submit/render");
  }

  private static TextureAtlasSprite fakeSprite(Object id) {
    try {
      Field field = Class.forName("sun.misc.Unsafe").getDeclaredField("theUnsafe");
      field.setAccessible(true);
      Object unsafe = field.get(null);
      Method allocate = unsafe.getClass().getMethod("allocateInstance", Class.class);
      TextureAtlasSprite sprite = (TextureAtlasSprite) allocate.invoke(unsafe, TextureAtlasSprite.class);
      // cantos de 0 a 1: quem converte as coordenadas da textura pro atlas (SpriteCoordinateExpander, na época do
      // MultiBufferSource) devolve as originais, que é o que a gente quer
      for (String[] corner : new String[][] {{"u0", "0"}, {"v0", "0"}, {"u1", "1"}, {"v1", "1"}}) {
        try {
          Field f = TextureAtlasSprite.class.getDeclaredField(corner[0]);
          f.setAccessible(true);
          f.setFloat(sprite, Float.parseFloat(corner[1]));
        } catch (NoSuchFieldException ignored) {
          // época sem esse campo
        }
      }
      FAKE_SPRITES.put(sprite, id);
      lastSprite = id;
      return sprite;
    } catch (ReflectiveOperationException error) {
      throw new IllegalStateException(error);
    }
  }

  // época do SubmitNodeCollector: um proxy que finge ser o coletor. os métodos "atalho" (default) rodam normalmente
  // e acabam chamando o submitModel/submitModelPart completo, que é onde a gente anota a geometria
  private static Object submitRecorder(Class<?> type, JsonArray parts) {
    InvocationHandler handler = (proxy, method, args) -> {
      String name = method.getName();
      if (name.equals("order")) return proxy;
      if (name.equals("submitModel") && !method.isDefault()) {
        // submitModel(model, state, poseStack, renderType, light, overlay, tintedColor, uvMapping, outlineColor)
        Object model = args[0];
        try {
          DumpUtil.invoke(model, "setupAnim", args[1]);
        } catch (NoSuchMethodException ignored) {
          // modelo sem animação
        }
        record(parts, (ModelPart) DumpUtil.invoke(model, "root"), (PoseStack) args[2], args[3], (int) args[6], args[7]);
        return null;
      }
      if (name.equals("submitModelPart") && !method.isDefault()) {
        // uma peça solta, sem modelo (26.1: vaso decorado, conduíte):
        // submitModelPart(part, poseStack, renderType, light, overlay, sprite, sheeted, foil, tintedColor, crumbling, outlineColor)
        record(parts, (ModelPart) args[0], (PoseStack) args[1], args[2], (int) args[8], args[5]);
        return null;
      }
      if (method.isDefault()) return InvocationHandler.invokeDefault(proxy, method, args);
      return defaultValue(method.getReturnType());
    };
    return Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[] {type}, handler);
  }

  private static void record(JsonArray parts, ModelPart root, PoseStack poseStack, Object renderType, int tint, Object uvMapping) throws ReflectiveOperationException {
    // copia a transformação na hora: o renderizador continua mexendo na pilha depois de entregar
    Matrix4f start = new Matrix4f(poseStack.last().pose());
    PoseStack stack = new PoseStack();
    stack.last().pose().set(start);

    JsonObject part = newPart(parts, uvMapping == null ? null : FAKE_SPRITES.get(uvMapping), renderType);
    part.addProperty("tint", tint);
    JsonArray quads = part.getAsJsonArray("quads");
    ReflectiveOperationException[] failure = {null};
    root.visit(stack, (pose, path, index, cube) -> {
      try {
        for (float[][] polygon : DumpUtil.cubeQuads(cube)) {
          JsonArray quad = new JsonArray();
          for (float[] vertex : polygon) {
            Vector3f position = pose.pose().transformPosition(vertex[0], vertex[1], vertex[2], new Vector3f());
            quad.add(point(position.x(), position.y(), position.z(), vertex[3], vertex[4]));
          }
          quads.add(quad);
        }
      } catch (ReflectiveOperationException error) {
        failure[0] = error;
      }
    });
    if (failure[0] != null) throw failure[0];
  }

  // época do MultiBufferSource: cada getBuffer(tipo) abre uma parte nova (com o último sprite pedido) e devolve um
  // VertexConsumer que grava os vértices — o jogo já entrega na posição final — e fecha um quadrado a cada 4
  private static Object bufferRecorder(Class<?> type, JsonArray parts) {
    InvocationHandler handler = (proxy, method, args) -> {
      if (method.getName().equals("getBuffer") && !method.isDefault()) {
        JsonObject part = newPart(parts, lastSprite, args[0]);
        part.addProperty("tint", -1);
        return vertexRecorder(method.getReturnType(), part);
      }
      if (method.isDefault()) return InvocationHandler.invokeDefault(proxy, method, args);
      return defaultValue(method.getReturnType());
    };
    return Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[] {type}, handler);
  }

  private static Object vertexRecorder(Class<?> type, JsonObject part) {
    JsonArray quads = part.getAsJsonArray("quads");
    float[][] quad = new float[4][];
    int[] count = {0};
    InvocationHandler handler = (proxy, method, args) -> {
      if (method.isDefault()) return InvocationHandler.invokeDefault(proxy, method, args);
      String name = method.getName();
      if (name.equals("addVertex") && args != null && args.length == 3 && args[0] instanceof Float) {
        quad[count[0]] = new float[] {(float) args[0], (float) args[1], (float) args[2], 0, 0};
      } else if (name.equals("setUv") && args != null && args.length == 2 && count[0] < 4 && quad[count[0]] != null) {
        quad[count[0]][3] = (float) args[0];
        quad[count[0]][4] = (float) args[1];
      } else if (name.equals("setColor") && args != null && args.length == 4 && args[0] instanceof Integer) {
        int color = ((int) args[3] << 24) | ((int) args[0] << 16) | ((int) args[1] << 8) | (int) args[2];
        if (color != -1) part.addProperty("tint", color);
      } else if (name.equals("setNormal")) {
        // o normal é o último dado de cada vértice: fecha o vértice (e o quadrado, no quarto)
        if (quad[count[0]] != null && ++count[0] == 4) {
          JsonArray json = new JsonArray();
          for (float[] vertex : quad) json.add(point(vertex[0], vertex[1], vertex[2], vertex[3], vertex[4]));
          quads.add(json);
          count[0] = 0;
          java.util.Arrays.fill(quad, null);
        }
      }
      return method.getReturnType().isInstance(proxy) ? proxy : defaultValue(method.getReturnType());
    };
    return Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[] {type}, handler);
  }

  private static JsonObject newPart(JsonArray parts, Object sprite, Object renderType) {
    JsonObject part = new JsonObject();
    if (sprite != null) {
      part.addProperty("atlas", String.valueOf(call(sprite, "atlasLocation")));
      part.addProperty("texture", String.valueOf(call(sprite, "texture")));
    }
    part.addProperty("renderType", String.valueOf(renderType));
    part.add("quads", new JsonArray());
    parts.add(part);
    return part;
  }

  private static JsonArray point(float x, float y, float z, float u, float v) {
    JsonArray point = new JsonArray();
    point.add(DumpUtil.round(x));
    point.add(DumpUtil.round(y));
    point.add(DumpUtil.round(z));
    point.add(DumpUtil.round(u));
    point.add(DumpUtil.round(v));
    return point;
  }

  private static Object call(Object target, String name) {
    try {
      return DumpUtil.invoke(target, name);
    } catch (ReflectiveOperationException error) {
      throw new IllegalStateException(error);
    }
  }

  private static Object defaultValue(Class<?> type) {
    if (!type.isPrimitive() || type == void.class) return null;
    if (type == boolean.class) return false;
    return 0;
  }
}
