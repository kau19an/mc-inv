// peças comuns aos dumpers, resolvidas por reflexão pra compilar contra qualquer época da api do jogo
// (26.x com os nomes reais e 1.21.x traduzida dos mappings da Mojang)
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import net.minecraft.client.model.geom.EntityModelSet;

final class DumpUtil {
  private DumpUtil() {}

  // conjunto de modelos de entidade do jogo:
  // - 26.x e 1.21.5+: EntityModelSet.vanilla();
  // - antes: construtor com o mapa de LayerDefinitions.createRoots(), ou vazio + recarregar (que preenche o mesmo mapa)
  static EntityModelSet entityModels() throws ReflectiveOperationException {
    try {
      return (EntityModelSet) EntityModelSet.class.getMethod("vanilla").invoke(null);
    } catch (NoSuchMethodException missing) {
      Object roots = Class.forName("net.minecraft.client.model.geom.LayerDefinitions").getMethod("createRoots").invoke(null);
      for (Constructor<?> constructor : EntityModelSet.class.getDeclaredConstructors()) {
        constructor.setAccessible(true);
        if (constructor.getParameterCount() == 1 && Map.class.isAssignableFrom(constructor.getParameterTypes()[0])) return (EntityModelSet) constructor.newInstance(roots);
      }
      EntityModelSet models = (EntityModelSet) EntityModelSet.class.getDeclaredConstructor().newInstance();
      for (Method method : EntityModelSet.class.getMethods()) {
        if (method.getName().equals("onResourceManagerReload") && method.getParameterCount() == 1) {
          method.invoke(models, new Object[] {null});
          return models;
        }
      }
      throw new IllegalStateException("não consegui montar o EntityModelSet");
    }
  }

  // quadrados de um cubo de ModelPart: [[x, y, z, u, v] × 4] com a posição em blocos (pixels ÷ 16), como o jogo
  // desenha. a 26.x tem worldX/Y/Z no vértice; a 1.21.x guarda pos (em pixels). em algumas versões os campos são
  // privados, então tudo por reflexão
  static List<float[][]> cubeQuads(Object cube) throws ReflectiveOperationException {
    List<float[][]> quads = new ArrayList<>();
    for (Object polygon : (Object[]) field(cube, "polygons")) {
      Object[] vertices = (Object[]) invokeOrField(polygon, "vertices");
      float[][] quad = new float[vertices.length][];
      for (int index = 0; index < vertices.length; index++) {
        Object vertex = vertices[index];
        float x, y, z;
        try {
          x = (float) invoke(vertex, "worldX");
          y = (float) invoke(vertex, "worldY");
          z = (float) invoke(vertex, "worldZ");
        } catch (NoSuchMethodException older) {
          Object pos = invokeOrField(vertex, "pos");
          x = (float) invoke(pos, "x") / 16f;
          y = (float) invoke(pos, "y") / 16f;
          z = (float) invoke(pos, "z") / 16f;
        }
        quad[index] = new float[] {x, y, z, (float) invokeOrField(vertex, "u"), (float) invokeOrField(vertex, "v")};
      }
      quads.add(quad);
    }
    return quads;
  }

  static Object field(Object owner, String name) throws ReflectiveOperationException {
    for (Class<?> type = owner.getClass(); type != null; type = type.getSuperclass()) {
      for (Field field : type.getDeclaredFields()) {
        if (field.getName().equals(name) && !Modifier.isStatic(field.getModifiers())) {
          field.setAccessible(true);
          return field.get(owner);
        }
      }
    }
    throw new NoSuchFieldException(owner.getClass().getName() + "." + name);
  }

  static Object invoke(Object owner, String name, Object... args) throws ReflectiveOperationException {
    for (Class<?> type = owner.getClass(); type != null; type = type.getSuperclass()) {
      for (Method method : type.getDeclaredMethods()) {
        if (method.getName().equals(name) && method.getParameterCount() == args.length && !Modifier.isStatic(method.getModifiers())) {
          method.setAccessible(true);
          return method.invoke(owner, args);
        }
      }
    }
    throw new NoSuchMethodException(owner.getClass().getName() + "." + name);
  }

  // record (vertices()) ou campo (vertices): depende da época
  static Object invokeOrField(Object owner, String name) throws ReflectiveOperationException {
    try {
      return invoke(owner, name);
    } catch (NoSuchMethodException notAMethod) {
      return field(owner, name);
    }
  }

  static double round(float value) {
    return Math.round(value * 100000.0) / 100000.0;
  }
}
