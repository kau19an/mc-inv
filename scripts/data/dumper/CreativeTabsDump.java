// dump das abas do inventário criativo: liga o jogo "sem tela", pede pra ele montar as abas
// exatamente como faz no criativo e salva tudo em json (ordem, ícone, nome, componentes de cada item).
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
import java.util.Locale;
import net.minecraft.SharedConstants;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.component.DataComponentPatch;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.data.registries.VanillaRegistries;
import net.minecraft.network.chat.ComponentSerialization;
import net.minecraft.server.Bootstrap;
import net.minecraft.world.flag.FeatureFlags;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.CreativeModeTabs;
import net.minecraft.world.item.ItemStack;

public final class CreativeTabsDump {
  public static void main(String[] args) throws Exception {
    Path out = Path.of(args[0]);

    SharedConstants.tryDetectVersion();
    Bootstrap.bootStrap();

    // os mesmos registros que um mundo novo teria (encantamentos, pinturas, músicas de disco…)
    HolderLookup.Provider registries = VanillaRegistries.createWorldLookup();
    // flags padrão (sem experimentos) e com permissão de operador, pra aba "Utilidades de operador" vir junto
    CreativeModeTabs.tryRebuildTabContents(FeatureFlags.DEFAULT_FLAGS, true, registries);
    DynamicOps<JsonElement> ops = registries.createSerializationContext(JsonOps.INSTANCE);

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
      json.add("icon", stack(tab.getIconItem(), ops));
      JsonArray items = new JsonArray();
      for (ItemStack item : tab.getDisplayItems()) items.add(stack(item, ops));
      json.add("items", items);
      tabs.add(json);
    }

    JsonObject root = new JsonObject();
    root.addProperty("version", SharedConstants.getCurrentVersion().name());
    root.add("tabs", tabs);
    Files.writeString(out, new GsonBuilder().disableHtmlEscaping().create().toJson(root));
  }

  // uma pilha de itens: id, quantidade (se não for 1), nome (como componente de texto, com a chave de tradução)
  // e os componentes que diferem do padrão do item (poção, encantamento, duração do foguete…)
  private static JsonObject stack(ItemStack stack, DynamicOps<JsonElement> ops) {
    JsonObject json = new JsonObject();
    json.addProperty("id", BuiltInRegistries.ITEM.getKey(stack.getItem()).toString());
    if (stack.getCount() != 1) json.addProperty("count", stack.getCount());
    json.add("name", ComponentSerialization.CODEC.encodeStart(ops, stack.getHoverName()).getOrThrow());
    DataComponentPatch patch = stack.getComponentsPatch();
    if (!patch.isEmpty()) json.add("components", DataComponentPatch.CODEC.encodeStart(ops, patch).getOrThrow());
    return json;
  }
}
