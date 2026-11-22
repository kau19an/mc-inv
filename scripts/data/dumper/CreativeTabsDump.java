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
import com.mojang.serialization.DynamicOps;
import com.mojang.serialization.JsonOps;
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
import net.minecraft.core.component.DataComponentPatch;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.ComponentSerialization;
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
          // 26.1-pre-1 em diante: updateComponentsAndStaticRegistryTags; snapshots da 26.1: updateStaticRegistryTags
          applyStaticTags(reloadable);
          return layers.compositeAccess();
        },
        ForkJoinPool.commonPool(),
        ForkJoinPool.commonPool()).join();

    // com permissão de operador, pra aba "Utilidades de operador" vir junto
    CreativeModeTabs.tryRebuildTabContents(dataConfig.enabledFeatures(), true, registries);
    DynamicOps<JsonElement> ops = registries.createSerializationContext(JsonOps.INSTANCE);
    Item.TooltipContext tooltipContext = Item.TooltipContext.of(registries);

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
      json.addProperty("background", tab.getBackgroundTexture().toString());
      json.add("name", ComponentSerialization.CODEC.encodeStart(ops, tab.getDisplayName()).getOrThrow());
      json.add("icon", stack(tab.getIconItem(), ops, null));
      JsonArray items = new JsonArray();
      for (ItemStack item : tab.getDisplayItems()) {
        items.add(stack(item, ops, tooltipContext));
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
      searchOnly.add(stack(new ItemStack(item), ops, tooltipContext));
    }

    JsonObject root = new JsonObject();
    root.addProperty("version", versionName());
    root.add("tabs", tabs);
    root.add("searchOnly", searchOnly);
    Files.writeString(out, new GsonBuilder().disableHtmlEscaping().create().toJson(root));
  }

  // uma pilha de itens: id, quantidade (se não for 1), nome (como componente de texto, com a chave de tradução),
  // os componentes que diferem do padrão do item (poção, encantamento, duração do foguete…) e a tooltip
  private static JsonObject stack(ItemStack stack, DynamicOps<JsonElement> ops, Item.TooltipContext tooltipContext) {
    JsonObject json = new JsonObject();
    json.addProperty("id", BuiltInRegistries.ITEM.getKey(stack.getItem()).toString());
    if (stack.getCount() != 1) json.addProperty("count", stack.getCount());
    // brilho de encantamento (livros encantados, garrafa de experiência, estrela do nether…): a regra do jogo
    if (stack.hasFoil()) json.addProperty("foil", true);
    // cor da poção (tint "potion" das poções e flechas): depende dos efeitos, que ficam no código do jogo
    Integer potionColor = potionColor(stack);
    if (potionColor != null) json.addProperty("potionColor", potionColor);
    json.add("name", ComponentSerialization.CODEC.encodeStart(ops, stack.getHoverName()).getOrThrow());
    DataComponentPatch patch = stack.getComponentsPatch();
    if (!patch.isEmpty()) json.add("components", DataComponentPatch.CODEC.encodeStart(ops, patch).getOrThrow());
    if (tooltipContext != null) {
      // as mesmas opções da tela do criativo (sem jogador: o que depende dele, como o mapa, fica de fora)
      json.add("tooltip", tooltip(stack, ops, tooltipContext, TooltipFlag.NORMAL.asCreative()));
      json.add("tooltipAdvanced", tooltip(stack, ops, tooltipContext, TooltipFlag.ADVANCED.asCreative()));
    }
    return json;
  }

  // PotionContents.getColorOr(padrão), pelo nome (com reflexão, pra não quebrar a compilação se a assinatura mudar
  // numa versão). sem efeito nem cor própria (ex.: água), devolve null e o site usa o padrão do tint
  private static Integer potionColor(ItemStack stack) {
    Object contents = stack.get(DataComponents.POTION_CONTENTS);
    if (contents == null) return null;
    final int none = 0x01020304;
    try {
      int color = (int) contents.getClass().getMethod("getColorOr", int.class).invoke(contents, none);
      return color == none ? null : color;
    } catch (ReflectiveOperationException | RuntimeException error) {
      return null;
    }
  }

  // linhas da tooltip como componentes de texto (com chaves de tradução, cores e estilos). se algum item
  // pedir algo que só existe com o jogo aberto, fica só o nome — o resto do dump segue
  private static JsonArray tooltip(ItemStack stack, DynamicOps<JsonElement> ops, Item.TooltipContext context, TooltipFlag flag) {
    JsonArray lines = new JsonArray();
    List<Component> components;
    try {
      components = stack.getTooltipLines(context, null, flag);
    } catch (RuntimeException error) {
      System.err.println("tooltip de " + BuiltInRegistries.ITEM.getKey(stack.getItem()) + " falhou: " + error);
      components = List.of(stack.getHoverName());
    }
    for (Component line : components) lines.add(ComponentSerialization.CODEC.encodeStart(ops, line).getOrThrow());
    return lines;
  }

  private static void applyStaticTags(Object reloadable) {
    for (String name : new String[] {"updateComponentsAndStaticRegistryTags", "updateStaticRegistryTags"}) {
      try {
        reloadable.getClass().getMethod(name).invoke(reloadable);
        return;
      } catch (NoSuchMethodException missing) {
        // nome de outra época: tenta o próximo
      } catch (ReflectiveOperationException error) {
        throw new IllegalStateException(error);
      }
    }
    throw new IllegalStateException("ReloadableServerResources sem método de aplicar as tags");
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
