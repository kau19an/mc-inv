// dump das abas do inventário criativo: liga o jogo "sem tela", pede pra ele montar as abas
// exatamente como faz no criativo e salva tudo em json (ordem, ícone, nome, componentes de cada item e as
// linhas da tooltip — normal e avançada (F3+H) — do jeito que o próprio jogo monta).
//
// compilado e executado pelo scripts/data/dump.ts contra o jar oficial da versão (sem fabric/gradle:
// desde a 26.1 o jar vem sem ofuscação, com os nomes reais das classes).
//
// uso: java -cp <classes>:<jar>:<libs> CreativeTabsDump <saida.json>
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.DynamicOps;
import com.mojang.serialization.JsonOps;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.Locale;
import java.util.concurrent.ForkJoinPool;
import net.minecraft.SharedConstants;
import net.minecraft.commands.Commands;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.NbtOps;
import net.minecraft.nbt.Tag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.ComponentSerialization;
import net.minecraft.resources.RegistryOps;
import net.minecraft.server.Bootstrap;
import net.minecraft.server.WorldLoader;
import net.minecraft.server.packs.repository.PackRepository;
import net.minecraft.server.packs.repository.ServerPacksSource;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

public final class CreativeTabsDump {
  public static void main(String[] args) throws Exception {
    Path out = Path.of(args[0]);

    SharedConstants.tryDetectVersion();
    Bootstrap.bootStrap();

    // carrega o pacote de dados vanilla do mesmo jeito que um mundo novo carrega (WorldLoader):
    // registros (encantamentos, pinturas, chifres…), tags e componentes padrão dos itens, tudo ligado.
    // sem experimentos: é o inventário que um mundo normal mostra
    WorldDataConfiguration dataConfig = WorldDataConfiguration.DEFAULT;
    PackRepository packs = ServerPacksSource.createVanillaTrustedRepository();
    WorldLoader.InitConfig init = initConfig(new WorldLoader.PackConfig(packs, dataConfig, false, true));
    RegistryAccess.Frozen registries = WorldLoader.<Void, RegistryAccess.Frozen>load(
        init,
        context -> new WorldLoader.DataLoadOutput<>(null, context.datapackDimensions()),
        (resources, reloadable, layers, cookie) -> {
          applyStaticTags(reloadable, layers.compositeAccess());
          return layers.compositeAccess();
        },
        ForkJoinPool.commonPool(),
        ForkJoinPool.commonPool()).join();

    // com permissão de operador, pra aba "Utilidades de operador" vir junto
    CreativeModeTabs.tryRebuildTabContents(dataConfig.enabledFeatures(), true, registries);
    // o mesmo que registries.createSerializationContext (que só existe a partir da 1.20.5)
    DynamicOps<JsonElement> ops = RegistryOps.create(JsonOps.INSTANCE, registries);
    Object tooltipContext = tooltipContext(registries);

    JsonArray tabs = new JsonArray();
    Set<Item> inTabs = new HashSet<>();
    for (CreativeModeTab tab : CreativeModeTabs.allTabs()) {
      JsonObject json = new JsonObject();
      json.addProperty("id", BuiltInRegistries.CREATIVE_MODE_TAB.getKey(tab).toString());
      json.addProperty("type", tab.getType().name().toLowerCase(Locale.ROOT));
      json.addProperty("row", tab.row().name().toLowerCase(Locale.ROOT));
      json.addProperty("column", tab.column());
      json.addProperty("alignedRight", tab.isAlignedRight());
      json.addProperty("showTitle", tab.showTitle());
      json.addProperty("canScroll", tab.canScroll());
      json.addProperty("background", background(tab));
      json.add("name", unwrap(ComponentSerialization.CODEC.encodeStart(ops, tab.getDisplayName())));
      json.add("icon", stack(tab.getIconItem(), ops, null, false));
      JsonArray items = new JsonArray();
      for (ItemStack item : tab.getDisplayItems()) {
        items.add(stack(item, ops, tooltipContext, true));
        inTabs.add(item.getItem());
      }
      json.add("items", items);
      tabs.add(json);
    }

    // itens que existem no jogo (pegáveis por comando, achados no mundo) mas não estão em nenhuma aba do criativo,
    // nem na de operador. ex.: chiseled_soulshale na 26.4-snapshot-10. só os ligados nesta versão (sem experimentos)
    JsonArray searchOnly = new JsonArray();
    for (Item item : BuiltInRegistries.ITEM) {
      if (item == Items.AIR || inTabs.contains(item) || !item.isEnabled(dataConfig.enabledFeatures())) continue;
      searchOnly.add(stack(new ItemStack(item), ops, tooltipContext, true));
    }

    JsonObject root = new JsonObject();
    root.addProperty("version", versionName());
    root.add("tabs", tabs);
    root.add("searchOnly", searchOnly);
    Files.writeString(out, new GsonBuilder().disableHtmlEscaping().create().toJson(root));
  }

  // uma pilha de itens: id, quantidade (se não for 1), nome (como componente de texto, com a chave de tradução),
  // os componentes que diferem do padrão do item (poção, encantamento, duração do foguete…) e a tooltip.
  // tooltipContext: Item.TooltipContext (24w12a em diante) ou null (antes dele a tooltip não pede contexto)
  private static JsonObject stack(ItemStack stack, DynamicOps<JsonElement> ops, Object tooltipContext, boolean withTooltip) throws ReflectiveOperationException {
    JsonObject json = new JsonObject();
    json.addProperty("id", BuiltInRegistries.ITEM.getKey(stack.getItem()).toString());
    if (stack.getCount() != 1) json.addProperty("count", stack.getCount());
    // brilho de encantamento (livros encantados, garrafa de experiência, estrela do nether…): a regra do jogo
    if (stack.hasFoil()) json.addProperty("foil", true);
    // cor da poção (tint "potion" das poções e flechas): depende dos efeitos, que ficam no código do jogo
    Integer potionColor = potionColor(stack);
    if (potionColor != null) json.addProperty("potionColor", potionColor);
    // ovos de geração antes da 1.21.5: o modelo é um ovo cinza pintado com duas cores que ficam no código
    // (SpawnEggItem.getColor(camada)). da 1.21.5 em diante cada ovo tem a própria textura e o método não existe
    int[] eggColors = eggColors(stack);
    if (eggColors != null) {
      JsonArray colors = new JsonArray();
      for (int color : eggColors) colors.add(color);
      json.add("tintColors", colors);
    }
    json.add("name", unwrap(ComponentSerialization.CODEC.encodeStart(ops, stack.getHoverName())));
    JsonElement components = components(stack, ops);
    if (components != null) json.add("components", components);
    if (withTooltip) {
      // as mesmas opções da tela do criativo (sem jogador: o que depende dele, como o mapa, fica de fora)
      json.add("tooltip", tooltip(stack, ops, tooltipContext, TooltipFlag.NORMAL.asCreative()));
      json.add("tooltipAdvanced", tooltip(stack, ops, tooltipContext, TooltipFlag.ADVANCED.asCreative()));
    }
    return json;
  }

  private static int[] eggColors(ItemStack stack) {
    Item item = stack.getItem();
    if (!item.getClass().getSimpleName().equals("SpawnEggItem")) return null;
    try {
      java.lang.reflect.Method method = item.getClass().getMethod("getColor", int.class);
      return new int[] {(int) method.invoke(item, 0), (int) method.invoke(item, 1)};
    } catch (ReflectiveOperationException | RuntimeException newer) {
      return null;
    }
  }

  // componentes que diferem do padrão do item (DataComponentPatch, 24w09a em diante). antes disso (era da NBT, até
  // 24w07a) os dados extras ficavam na tag NBT do item: vai como { "minecraft:nbt": tag } — serve pra separar
  // pilhas do mesmo item (cada poção, cada livro encantado) — e o BlockStateTag também como "minecraft:block_state"
  // (o nível da luz, que o ícone usa)
  @SuppressWarnings({"unchecked", "rawtypes"})
  private static JsonElement components(ItemStack stack, DynamicOps<JsonElement> ops) throws ReflectiveOperationException {
    Method patchMethod = method(ItemStack.class, "getComponentsPatch", 0);
    if (patchMethod != null) {
      Object patch = patchMethod.invoke(stack);
      if ((boolean) patch.getClass().getMethod("isEmpty").invoke(patch)) return null;
      Codec codec = (Codec) Class.forName("net.minecraft.core.component.DataComponentPatch").getField("CODEC").get(null);
      return unwrap(codec.encodeStart(ops, patch));
    }
    Object tag = ItemStack.class.getMethod("getTag").invoke(stack);
    if (tag == null) return null;
    JsonElement nbt = NbtOps.INSTANCE.convertTo(JsonOps.INSTANCE, (Tag) tag);
    JsonObject json = new JsonObject();
    json.add("minecraft:nbt", nbt);
    if (nbt.isJsonObject() && nbt.getAsJsonObject().has("BlockStateTag")) json.add("minecraft:block_state", nbt.getAsJsonObject().get("BlockStateTag"));
    return json;
  }

  // PotionContents.getColorOr(padrão), pelo nome (com reflexão, pra não quebrar a compilação se a assinatura mudar
  // numa versão). sem efeito nem cor própria (ex.: água), devolve null e o site usa o padrão do tint.
  // era da NBT: PotionUtils.getColor(pilha), só nos itens com poção na tag
  private static Integer potionColor(ItemStack stack) throws ReflectiveOperationException {
    Method get = method(ItemStack.class, "get", 1);
    if (get == null) return legacyPotionColor(stack);
    Object type = Class.forName("net.minecraft.core.component.DataComponents").getField("POTION_CONTENTS").get(null);
    Object contents = get.invoke(stack, type);
    if (contents == null) return null;
    final int none = 0x01020304;
    try {
      int color = (int) contents.getClass().getMethod("getColorOr", int.class).invoke(contents, none);
      return color == none ? null : color;
    } catch (NoSuchMethodException older) {
      // 1.21.x: getColor() (sem efeito, devolve a cor padrão da água, que é a mesma do tint)
      try {
        return (int) contents.getClass().getMethod("getColor").invoke(contents);
      } catch (ReflectiveOperationException | RuntimeException error) {
        return null;
      }
    } catch (ReflectiveOperationException | RuntimeException error) {
      return null;
    }
  }

  // linhas da tooltip como componentes de texto (com chaves de tradução, cores e estilos). se algum item
  // pedir algo que só existe com o jogo aberto, fica só o nome — o resto do dump segue
  // getTooltipLines mudou de assinatura: (contexto, jogador, opções) desde a 24w12a, (jogador, opções) antes.
  // os argumentos saem pelo tipo de cada parâmetro (o jogador vai nulo)
  @SuppressWarnings("unchecked")
  private static JsonArray tooltip(ItemStack stack, DynamicOps<JsonElement> ops, Object context, TooltipFlag flag) throws ReflectiveOperationException {
    JsonArray lines = new JsonArray();
    List<Component> components;
    try {
      Method method = method(ItemStack.class, "getTooltipLines", -1);
      Class<?>[] types = method.getParameterTypes();
      Object[] values = new Object[types.length];
      for (int i = 0; i < types.length; i++) {
        if (TooltipFlag.class.isAssignableFrom(types[i])) values[i] = flag;
        else if (context != null && types[i].isInstance(context)) values[i] = context;
      }
      components = (List<Component>) method.invoke(stack, values);
    } catch (java.lang.reflect.InvocationTargetException wrapped) {
      RuntimeException error = wrapped.getCause() instanceof RuntimeException runtime ? runtime : new RuntimeException(wrapped.getCause());
      System.err.println("tooltip de " + BuiltInRegistries.ITEM.getKey(stack.getItem()) + " falhou: " + error);
      components = List.of(stack.getHoverName());
    }
    for (Component line : components) lines.add(unwrap(ComponentSerialization.CODEC.encodeStart(ops, line)));
    return lines;
  }

  // liga as tags carregadas aos registros. o nome mudou com o tempo:
  //   26.1-pre-1 em diante: updateComponentsAndStaticRegistryTags(); snapshots da 26.1 e 1.21.2+: updateStaticRegistryTags();
  //   1.20.5 a 1.21.1: updateRegistryTags() — e, em algumas épocas, recebendo o RegistryAccess
  private static void applyStaticTags(Object reloadable, RegistryAccess access) {
    for (String name : new String[] {"updateComponentsAndStaticRegistryTags", "updateStaticRegistryTags", "updateRegistryTags"}) {
      for (Method method : reloadable.getClass().getMethods()) {
        if (!method.getName().equals(name)) continue;
        try {
          if (method.getParameterCount() == 0) method.invoke(reloadable);
          else if (method.getParameterCount() == 1 && method.getParameterTypes()[0].isInstance(access)) method.invoke(reloadable, access);
          else continue;
          return;
        } catch (ReflectiveOperationException error) {
          throw new IllegalStateException(error);
        }
      }
    }
    throw new IllegalStateException("ReloadableServerResources sem método de aplicar as tags");
  }

  // Item.TooltipContext.of(registros), 24w12a em diante; antes não existe (null)
  private static Object tooltipContext(RegistryAccess registries) {
    try {
      Class<?> type = Class.forName("net.minecraft.world.item.Item$TooltipContext");
      for (Method method : type.getMethods()) {
        if (method.getName().equals("of") && method.getParameterCount() == 1 && method.getParameterTypes()[0].isInstance(registries)) return method.invoke(null, registries);
      }
      return null;
    } catch (ReflectiveOperationException missing) {
      return null;
    }
  }

  // textura de fundo da aba: getBackgroundTexture() (1.21 em diante) ou, antes, o sufixo ("items.png") no caminho
  // que o jogo montava (textures/gui/container/creative_inventory/tab_<sufixo>)
  private static String background(CreativeModeTab tab) throws ReflectiveOperationException {
    Method texture = method(CreativeModeTab.class, "getBackgroundTexture", 0);
    if (texture != null) return texture.invoke(tab).toString();
    return "minecraft:textures/gui/container/creative_inventory/tab_" + CreativeModeTab.class.getMethod("getBackgroundSuffix").invoke(tab);
  }

  private static Integer legacyPotionColor(ItemStack stack) throws ReflectiveOperationException {
    Object tag = ItemStack.class.getMethod("getTag").invoke(stack);
    if (tag == null) return null;
    String nbt = tag.toString();
    if (!nbt.contains("Potion") && !nbt.contains("CustomPotionColor")) return null;
    Class<?> utils = Class.forName("net.minecraft.world.item.alchemy.PotionUtils");
    return (int) utils.getMethod("getColor", ItemStack.class).invoke(null, stack);
  }

  // método público pelo nome e pela quantidade de parâmetros (-1 = qualquer); null se não existir nesta versão
  private static Method method(Class<?> owner, String name, int parameters) {
    for (Method method : owner.getMethods()) {
      if (method.getName().equals(name) && (parameters < 0 || method.getParameterCount() == parameters)) return method;
    }
    return null;
  }

  // DataResult.getOrThrow() sem argumento só existe nas versões novas do DataFixerUpper
  private static <T> T unwrap(DataResult<T> result) {
    return result.result().orElseThrow(() -> new IllegalStateException(result.error().map(Object::toString).orElse("erro desconhecido")));
  }

  // InitConfig(pacotes, seleção de comandos, permissão das funções): a permissão era um número (nível de operador 2)
  // até a 1.21.x e virou LevelBasedPermissionSet.GAMEMASTER depois. por reflexão, pra compilar contra as duas
  private static WorldLoader.InitConfig initConfig(WorldLoader.PackConfig packs) throws ReflectiveOperationException {
    for (java.lang.reflect.Constructor<?> constructor : WorldLoader.InitConfig.class.getConstructors()) {
      Class<?>[] types = constructor.getParameterTypes();
      if (types.length != 3) continue;
      Object permission = types[2] == int.class
          ? (Object) 2
          : Class.forName("net.minecraft.server.permissions.LevelBasedPermissionSet").getField("GAMEMASTER").get(null);
      return (WorldLoader.InitConfig) constructor.newInstance(packs, Commands.CommandSelection.DEDICATED, permission);
    }
    throw new IllegalStateException("WorldLoader.InitConfig sem construtor de 3 parâmetros");
  }

  // nome da versão que o jogo diz ter: name() (26.x) ou getName() (1.21.x)
  private static String versionName() throws ReflectiveOperationException {
    Object version = SharedConstants.getCurrentVersion();
    try {
      return (String) version.getClass().getMethod("name").invoke(version);
    } catch (NoSuchMethodException older) {
      return (String) version.getClass().getMethod("getName").invoke(version);
    }
  }
}
