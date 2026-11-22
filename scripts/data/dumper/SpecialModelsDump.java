// dump dos modelos "especiais" (baú, shulker, estandarte, cabeça, escudo, vaso, conduíte, estátua de golem):
// o jogo desenha esses itens com modelos de entidade, não com modelos de bloco. aqui a gente monta o
// renderizador de cada um do mesmo jeito que o jogo e entrega pra ele um "coletor" falso que, em vez de
// mandar pra placa de vídeo, anota cada quadrado já na posição final, com a textura e a cor.
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
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.client.model.Model;
import net.minecraft.client.model.geom.EntityModelSet;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.PlayerSkinRenderCache;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.special.SpecialModelRenderer;
import net.minecraft.client.renderer.special.SpecialModelRenderers;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.client.resources.model.sprite.SpriteGetter;
import net.minecraft.client.resources.model.sprite.SpriteId;
import net.minecraft.server.Bootstrap;
import org.joml.Matrix4f;
import org.joml.Vector3f;

public final class SpecialModelsDump {
  // sprites "de mentirinha": o jogo pede um sprite pela id e depois só repassa pro coletor.
  // como a gente não tem atlas de texturas (não há placa de vídeo), cria um objeto vazio e lembra de qual id ele é
  private static final Map<Object, SpriteId> FAKE_SPRITES = new IdentityHashMap<>();

  public static void main(String[] args) throws Exception {
    Path input = Path.of(args[0]);
    Path output = Path.of(args[1]);

    SharedConstants.tryDetectVersion();
    Bootstrap.bootStrap();
    Codec<SpecialModelRenderer.Unbaked<?>> codec = specialModelCodec();

    EntityModelSet models = EntityModelSet.vanilla();
    SpriteGetter sprites = SpecialModelsDump::fakeSprite;
    SpecialModelRenderer.BakingContext context = new SpecialModelRenderer.BakingContext() {
      @Override public EntityModelSet entityModelSet() { return models; }
      @Override public SpriteGetter sprites() { return sprites; }
      @Override public PlayerSkinRenderCache playerSkinRenderCache() { return null; }
    };

    JsonObject result = new JsonObject();
    JsonObject entries = JsonParser.parseString(Files.readString(input)).getAsJsonObject();
    for (Map.Entry<String, JsonElement> entry : entries.entrySet()) {
      try {
        SpecialModelRenderer.Unbaked<?> unbaked = codec.parse(JsonOps.INSTANCE, entry.getValue()).getOrThrow();
        @SuppressWarnings("unchecked")
        SpecialModelRenderer<Object> renderer = (SpecialModelRenderer<Object>) unbaked.bake(context);
        JsonArray parts = new JsonArray();
        if (renderer != null) {
          SubmitNodeCollector collector = recorder(parts);
          // sem dados do item (padrão): estandarte liso, vaso sem cacos, cabeça com a skin padrão…
          renderer.submit(null, new PoseStack(), collector, 0xF000F0, 0, false, 0);
        }
        JsonObject model = new JsonObject();
        model.add("parts", parts);
        result.add(entry.getKey(), model);
      } catch (Exception error) {
        JsonObject failed = new JsonObject();
        failed.addProperty("error", String.valueOf(error));
        result.add(entry.getKey(), failed);
      }
    }
    Files.writeString(output, new GsonBuilder().disableHtmlEscaping().create().toJson(result));
  }

  // a api muda entre versões, então tudo por reflexão (compila contra qualquer uma):
  // - 26.3: bootstrap() sem parâmetro preenche um mapa interno, e o CODEC estático usa esse mapa
  // - 26.4: bootstrap(registro) preenche um registro do cliente; a gente cria um registro próprio,
  //   pede pro jogo preencher e monta o mesmo "dispatch" do CODEC em cima dele
  @SuppressWarnings({"unchecked", "rawtypes"})
  private static Codec<SpecialModelRenderer.Unbaked<?>> specialModelCodec() throws ReflectiveOperationException {
    for (Method method : SpecialModelRenderers.class.getMethods()) {
      if (!method.getName().equals("bootstrap")) continue;
      if (method.getParameterCount() == 0) {
        method.invoke(null);
        return (Codec<SpecialModelRenderer.Unbaked<?>>) SpecialModelRenderers.class.getField("CODEC").get(null);
      }
      if (method.getParameterCount() == 1) {
        MappedRegistry registry = new MappedRegistry(
            ResourceKey.createRegistryKey(Identifier.withDefaultNamespace("special_model_renderer_type")), Lifecycle.stable());
        method.invoke(null, registry);
        registry.freeze(); // sem congelar, as entradas ficam "não ligadas" e o codec não acha nada
        Codec<MapCodec> types = registry.byNameCodec();
        return (Codec) types.dispatch(unbaked -> ((SpecialModelRenderer.Unbaked) unbaked).type(), type -> (MapCodec) type);
      }
    }
    throw new IllegalStateException("SpecialModelRenderers.bootstrap não encontrado");
  }

  private static TextureAtlasSprite fakeSprite(SpriteId id) {
    try {
      Field field = Class.forName("sun.misc.Unsafe").getDeclaredField("theUnsafe");
      field.setAccessible(true);
      Object unsafe = field.get(null);
      Method allocate = unsafe.getClass().getMethod("allocateInstance", Class.class);
      TextureAtlasSprite sprite = (TextureAtlasSprite) allocate.invoke(unsafe, TextureAtlasSprite.class);
      FAKE_SPRITES.put(sprite, id);
      return sprite;
    } catch (ReflectiveOperationException error) {
      throw new IllegalStateException(error);
    }
  }

  // coletor falso: um proxy que finge ser o SubmitNodeCollector. os métodos "atalho" (default) rodam normalmente
  // e acabam chamando o submitModel completo, que é onde a gente anota a geometria
  private static SubmitNodeCollector recorder(JsonArray parts) {
    InvocationHandler handler = new InvocationHandler() {
      @Override
      public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        String name = method.getName();
        if (name.equals("order")) return proxy;
        if (name.equals("submitModel") && !method.isDefault()) {
          // submitModel(model, state, poseStack, renderType, light, overlay, tintedColor, uvMapping, outlineColor)
          record(parts, (Model<?>) args[0], args[1], (PoseStack) args[2], args[3], (int) args[6], args[7]);
          return null;
        }
        if (method.isDefault()) return InvocationHandler.invokeDefault(proxy, method, args);
        return defaultValue(method.getReturnType());
      }
    };
    return (SubmitNodeCollector) Proxy.newProxyInstance(SubmitNodeCollector.class.getClassLoader(), new Class<?>[] {SubmitNodeCollector.class}, handler);
  }

  @SuppressWarnings({"unchecked", "rawtypes"})
  private static void record(JsonArray parts, Model model, Object state, PoseStack poseStack, Object renderType, int tint, Object uvMapping) {
    // copia a transformação na hora: o renderizador continua mexendo na pilha depois de entregar
    Matrix4f start = new Matrix4f(poseStack.last().pose());
    model.setupAnim(state);
    PoseStack stack = new PoseStack();
    stack.last().pose().set(start);

    JsonObject part = new JsonObject();
    SpriteId sprite = uvMapping == null ? null : FAKE_SPRITES.get(uvMapping);
    if (sprite != null) {
      part.addProperty("atlas", sprite.atlasLocation().toString());
      part.addProperty("texture", sprite.texture().toString());
    }
    part.addProperty("renderType", String.valueOf(renderType));
    part.addProperty("tint", tint);

    JsonArray quads = new JsonArray();
    ModelPart root = model.root();
    root.visit(stack, (pose, path, index, cube) -> {
      for (ModelPart.Polygon polygon : cube.polygons) {
        JsonArray quad = new JsonArray();
        for (ModelPart.Vertex vertex : polygon.vertices()) {
          Vector3f position = pose.pose().transformPosition(vertex.worldX(), vertex.worldY(), vertex.worldZ(), new Vector3f());
          JsonArray point = new JsonArray();
          point.add(round(position.x()));
          point.add(round(position.y()));
          point.add(round(position.z()));
          point.add(round(vertex.u()));
          point.add(round(vertex.v()));
          quad.add(point);
        }
        quads.add(quad);
      }
    });
    part.add("quads", quads);
    parts.add(part);
  }

  private static double round(float value) {
    return Math.round(value * 100000.0) / 100000.0;
  }

  private static Object defaultValue(Class<?> type) {
    if (!type.isPrimitive() || type == void.class) return null;
    if (type == boolean.class) return false;
    return 0;
  }
}
