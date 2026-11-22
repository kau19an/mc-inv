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
import java.util.List;
import java.util.Locale;
import net.minecraft.SharedConstants;
import net.minecraft.commands.Commands;
import net.minecraft.core.RegistryAccess;
import net.minecraft.core.component.DataComponentPatch;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.ComponentSerialization;
import net.minecraft.server.Bootstrap;
import net.minecraft.server.WorldLoader;
import net.minecraft.server.packs.repository.PackRepository;
import net.minecraft.server.packs.repository.ServerPacksSource;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.util.Util;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.ItemStack;

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
    WorldLoader.InitConfig init = new WorldLoader.InitConfig(
        new WorldLoader.PackConfig(packs, dataConfig, false, true),
        Commands.CommandSelection.DEDICATED,
        LevelBasedPermissionSet.GAMEMASTER);
    RegistryAccess.Frozen registries = WorldLoader.<Void, RegistryAccess.Frozen>load(
        init,
        context -> new WorldLoader.DataLoadOutput<>(null, context.datapackDimensions()),
        (resources, reloadable, layers, cookie) -> {
          reloadable.updateComponentsAndStaticRegistryTags();
          return layers.compositeAccess();
        },
        Util.backgroundExecutor(),
        Util.backgroundExecutor()).join();

    // com permissão de operador, pra aba "Utilidades de operador" vir junto
    CreativeModeTabs.tryRebuildTabContents(dataConfig.enabledFeatures(), true, registries);
    DynamicOps<JsonElement> ops = registries.createSerializationContext(JsonOps.INSTANCE);
    Item.TooltipContext tooltipContext = Item.TooltipContext.of(registries);

    JsonArray tabs = new JsonArray();
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
      for (ItemStack item : tab.getDisplayItems()) items.add(stack(item, ops, tooltipContext));
      json.add("items", items);
      tabs.add(json);
    }

    JsonObject root = new JsonObject();
    root.addProperty("version", SharedConstants.getCurrentVersion().name());
    root.add("tabs", tabs);
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

  // linhas da tooltip como componentes de texto (com chaves de tradução, cores e estilos). se algum item
  // pedir algo que só existe com o jogo aberto, fica só o nome — o resto do dump segue
  private static JsonArray tooltip(ItemStack stack, DynamicOps<JsonElement> ops, Item.TooltipContext context, TooltipFlag flag) {
    JsonArray lines = new JsonArray();
    List<Component> components;
    try {
      components = stack.getTooltipLines(context, null, flag);
    } catch (RuntimeException error) {
      System.err.println("tooltip de " + BuiltInRegistries.ITEM.getKey(stack.getItem()) + " falhou: " + error);
      components = List.of(stack.getStyledHoverName());
    }
    for (Component line : components) lines.add(ComponentSerialization.CODEC.encodeStart(ops, line).getOrThrow());
    return lines;
  }
}
