// dump do modelo do jogador (braços largos = Steve, braços finos = Alex), pra desenhar o personagem na aba
// "Inventário". diferente dos modelos especiais, aqui as peças saem SEPARADAS e na posição de descanso (cada uma
// com o seu "pivô" e rotação), porque a cabeça e o corpo giram pra seguir o cursor, como no jogo.
//
// capa: a malha sai à parte, só os quadrados ("cape"). a partir da 1.21.2 ela é a peça "cape" do PlayerCapeModel
// (camada PLAYER_CAPE); antes, a peça "cloak" do próprio modelo do jogador, que o jogo não desenhava junto com a
// skin (só a CapeLayer, com a textura da capa) — por isso "cloak" e "ear" (as orelhas do deadmau5) saem do modelo.
// a pose da capa (2 px atrás do corpo, 6° de inclinação, virada 180°) é a mesma em todas as épocas e fica no site
//
// saída: { "wide": peça, "slim": peça, "cape": quadrados }, onde peça = { pose: [x, y, z, rotX, rotY, rotZ], scale: [x, y, z],
//          quads: [[[x, y, z, u, v] × 4], …] (no espaço da própria peça), children: { nome: peça } }
//
// uso: java -cp <classes>:<jar>:<libs> PlayerModelDump <saida.json>
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import net.minecraft.SharedConstants;
import net.minecraft.client.model.geom.EntityModelSet;
import net.minecraft.client.model.geom.ModelLayerLocation;
import net.minecraft.client.model.geom.ModelLayers;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.server.Bootstrap;

public final class PlayerModelDump {
  // encerra a JVM no fim (com código 1 se der erro): threads do jogo que não são "daemon" (executores de algumas
  // versões) deixariam o processo aberto pra sempre depois do main, e o grupo inteiro do CI travaria
  public static void main(String[] args) {
    try {
      dump(args);
    } catch (Throwable error) {
      error.printStackTrace();
      System.exit(1);
    }
    System.exit(0);
  }

  private static void dump(String[] args) throws Exception {
    Path output = Path.of(args[0]);
    SharedConstants.tryDetectVersion();
    Bootstrap.bootStrap();

    EntityModelSet models = DumpUtil.entityModels();
    JsonObject result = new JsonObject();
    ModelPart wide = models.bakeLayer(layer("PLAYER"));
    result.add("wide", part(wide));
    result.add("slim", part(models.bakeLayer(layer("PLAYER_SLIM"))));
    ModelPart cape = hasLayer("PLAYER_CAPE") ? find(models.bakeLayer(layer("PLAYER_CAPE")), "cape") : find(wide, "cloak");
    if (cape != null) result.add("cape", part(cape).get("quads"));
    else System.err.println("aviso: capa não encontrada");
    Files.writeString(output, new GsonBuilder().disableHtmlEscaping().create().toJson(result));
  }

  // as constantes de ModelLayers por nome (por reflexão: o nome da classe que guarda pode mudar entre versões,
  // mas os campos PLAYER e PLAYER_SLIM existem há muito tempo)
  private static ModelLayerLocation layer(String name) throws ReflectiveOperationException {
    Field field = ModelLayers.class.getField(name);
    return (ModelLayerLocation) field.get(null);
  }

  private static boolean hasLayer(String name) {
    try {
      ModelLayers.class.getField(name);
      return true;
    } catch (NoSuchFieldException e) {
      return false;
    }
  }

  // peça pelo nome, em qualquer nível
  @SuppressWarnings("unchecked")
  private static ModelPart find(ModelPart part, String name) throws ReflectiveOperationException {
    for (Map.Entry<String, ModelPart> child : ((Map<String, ModelPart>) privateField(part, "children")).entrySet()) {
      if (child.getKey().equals(name)) return child.getValue();
      ModelPart found = find(child.getValue(), name);
      if (found != null) return found;
    }
    return null;
  }

  // peças que o jogo não desenha com a skin (ver o topo)
  private static final java.util.Set<String> NOT_SKIN = java.util.Set.of("cloak", "ear");

  @SuppressWarnings("unchecked")
  private static JsonObject part(ModelPart part) throws ReflectiveOperationException {
    JsonObject json = new JsonObject();
    JsonArray pose = new JsonArray();
    for (float value : new float[] {part.x, part.y, part.z, part.xRot, part.yRot, part.zRot}) pose.add(round(value));
    json.add("pose", pose);
    JsonArray scale = new JsonArray();
    for (float value : new float[] {part.xScale, part.yScale, part.zScale}) scale.add(round(value));
    json.add("scale", scale);

    JsonArray quads = new JsonArray();
    for (Object cube : (List<?>) privateField(part, "cubes")) {
      for (float[][] polygon : DumpUtil.cubeQuads(cube)) {
        JsonArray quad = new JsonArray();
        for (float[] vertex : polygon) {
          JsonArray point = new JsonArray();
          for (float value : vertex) point.add(round(value));
          quad.add(point);
        }
        quads.add(quad);
      }
    }
    json.add("quads", quads);

    JsonObject children = new JsonObject();
    for (Map.Entry<String, ModelPart> child : ((Map<String, ModelPart>) privateField(part, "children")).entrySet()) {
      if (!NOT_SKIN.contains(child.getKey())) children.add(child.getKey(), part(child.getValue()));
    }
    json.add("children", children);
    return json;
  }

  private static Object privateField(Object owner, String name) throws ReflectiveOperationException {
    for (Field field : owner.getClass().getDeclaredFields()) {
      if (field.getName().equals(name) && !Modifier.isStatic(field.getModifiers())) {
        field.setAccessible(true);
        return field.get(owner);
      }
    }
    throw new NoSuchFieldException(owner.getClass().getName() + "." + name);
  }

  private static double round(float value) {
    return Math.round(value * 100000.0) / 100000.0;
  }
}
