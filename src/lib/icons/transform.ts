// transformação local do jogo (Transformation), usada nos nós da definição do item ("transformation"):
// translação · rotação esquerda · escala · rotação direita, em blocos (1 = 16 pixels do modelo).
// compartilhada entre o build (malhas dos modelos especiais) e o renderizador (modelos de bloco, ex.: o pé da cama)
import type { LocalTransform, Vec3 } from './types.ts';

// rotação de um vetor por um quaternion [x, y, z, w]
export function rotateByQuaternion([qx, qy, qz, qw]: [number, number, number, number], [x, y, z]: Vec3): Vec3 {
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
}

export function applyLocal(local: LocalTransform, point: Vec3): Vec3 {
  const [rx, ry, rz] = rotateByQuaternion(local.rightRotation, point);
  const [lx, ly, lz] = rotateByQuaternion(local.leftRotation, [rx * local.scale[0], ry * local.scale[1], rz * local.scale[2]]);
  return [lx + local.translation[0], ly + local.translation[1], lz + local.translation[2]];
}

// várias transformações (da de fora pra de dentro, como na definição do item): composição como no jogo
// (pai · filho), então o ponto passa primeiro pela mais de dentro
export function applyLocalChain(transforms: LocalTransform[], point: Vec3): Vec3 {
  return transforms.reduceRight((current, local) => applyLocal(local, current), point);
}
