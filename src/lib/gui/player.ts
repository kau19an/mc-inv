// o jogador na aba "Inventário", seguindo o cursor — do mesmo jeito que o jogo desenha
// (InventoryScreen.extractEntityInInventoryFollowsMouse + GuiEntityRenderer + LivingEntityRenderer, 26.3):
//
//   ângulos:  xAngle = atan((centroX − mouseX) / 40),  yAngle = atan((centroY − mouseY) / 40)
//             corpo gira 180 + xAngle·20°, cabeça gira mais xAngle·20° e inclina −yAngle·20°
//   cadeia (do ponto da peça até a tela): peça (pivô + rotação Z·Y·X) → desce 1,501 → escala 0,9375 (jogador)
//             → espelha X e Y → gira o corpo no Y (180 − corpo) → gira Z 180° e X (yAngle·20°)
//             → sobe metade da altura (0,9 + 0,0625) → escala 20 px/bloco (Z invertido) → centro do recorte
//   luz:      ENTITY_IN_UI = duas lâmpadas direcionais, brilho = mín(1, (l0 + l1) × 0,6 + 0,4)
//   braços:   "respiração" (AnimationUtils.bobModelPart) com o tempo do jogo (20 ticks por segundo)
//   capa:     CapeLayer + PlayerCapeModel: presa às costas (corpo → desce 0 e recua 2 px), inclinada 6° pra trás e
//             virada 180°; parado, o balanço (capeLean/capeFlap) é zero. textura própria (64×32) e sólida, sem recorte
//
// sem dependências e sem apis do navegador: recebe a skin decodificada e devolve os pixels do recorte

export interface PlayerPart {
  pose: number[]; // [x, y, z, rotX, rotY, rotZ] — posição em pixels do modelo, rotação em radianos
  scale: number[];
  quads: number[][][]; // [[x, y, z, u, v] × 4] em blocos (pixels / 16), no espaço da peça
  children: Record<string, PlayerPart>;
}

export type PlayerModelKind = 'wide' | 'slim';
// cape: quadrados da capa no espaço dela (a peça "cape" do PlayerCapeModel, ou "cloak" do PlayerModel antigo).
// dados publicados antes da capa entrar não têm
export type PlayerModels = Record<PlayerModelKind, PlayerPart> & { cape?: number[][][] };

export interface Skin {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

// medidas da tela (CreativeModeInventoryScreen): recorte de (73, 6) até (105, 49), 20 px por bloco
export const PLAYER_BOX = { x0: 73, y0: 6, x1: 105, y1: 49, size: 20, offsetY: 0.0625 } as const;
const PLAYER_HEIGHT = 1.8;
const CAPE_OFFSET_Z = 2 / 16; // pivô da capa: 2 px atrás do corpo (PartPose 0, 0, 2 / translate 0,125 nas antigas)
const CAPE_TILT = (6 * Math.PI) / 180; // 6° + capeLean / 2 + capeFlap, com o jogador parado
const PLAYER_SCALE = 0.9375;

type Mat = number[]; // 4×4, por coluna (como o joml)

const identity = (): Mat => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a: Mat, b: Mat): Mat {
  const out = new Array<number>(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[column * 4 + k]!;
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

const translation = (x: number, y: number, z: number): Mat => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const scaling = (x: number, y: number, z: number): Mat => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
function rotationX(angle: number): Mat {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}
function rotationY(angle: number): Mat {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}
function rotationZ(angle: number): Mat {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function transformPoint(m: Mat, x: number, y: number, z: number): [number, number, number] {
  return [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!];
}

// luz de entidade na gui (Lighting.ENTITY_IN_UI)
const normalize = (v: [number, number, number]): [number, number, number] => {
  const length = Math.hypot(...v) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};
const LIGHT_0 = normalize([0.2, -1, 1]);
const LIGHT_1 = normalize([-0.2, -1, 0]);

// pose das peças neste instante (HumanoidModel.setupAnim, parado e de mãos vazias)
function animatedPose(name: string, part: PlayerPart, headYaw: number, headPitch: number, ageInTicks: number): number[] {
  const pose = [...part.pose];
  if (name === 'head') {
    pose[3] = headPitch;
    pose[4] = headYaw;
  } else if (name === 'right_arm' || name === 'left_arm') {
    const side = name === 'right_arm' ? 1 : -1;
    pose[3] = side * Math.sin(ageInTicks * 0.067) * 0.05;
    pose[4] = 0;
    pose[5] = pose[5]! + side * (Math.cos(ageInTicks * 0.09) * 0.05 + 0.05);
  } else if (name === 'right_leg' || name === 'left_leg') {
    const side = name === 'right_leg' ? 1 : -1;
    pose[4] = side * 0.005;
    pose[5] = side * 0.005;
  }
  return pose;
}

// ModelPart.translateAndRotate: pivô (pixels / 16), depois rotação Z·Y·X, depois escala
function partMatrix(pose: number[], scale: number[]): Mat {
  let m = translation(pose[0]! / 16, pose[1]! / 16, pose[2]! / 16);
  m = multiply(m, rotationZ(pose[5]!));
  m = multiply(m, rotationY(pose[4]!));
  m = multiply(m, rotationX(pose[3]!));
  if (scale[0] !== 1 || scale[1] !== 1 || scale[2] !== 1) m = multiply(m, scaling(scale[0]!, scale[1]!, scale[2]!));
  return m;
}

export interface PlayerRender {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

// mouseX/mouseY em pixels da gui, relativos ao canto do fundo do inventário (o mesmo referencial do jogo)
// cape: a textura da capa do jogador e os quadrados dela (PlayerModels.cape); sem os dois, desenha sem capa
export function renderPlayer(
  model: PlayerPart,
  skin: Skin,
  options: { scale: number; mouseX: number; mouseY: number; ageInTicks: number; cape?: { quads: number[][][]; texture: Skin } },
): PlayerRender {
  const { scale, mouseX, mouseY, ageInTicks, cape } = options;
  const box = PLAYER_BOX;
  const width = (box.x1 - box.x0) * scale;
  const height = (box.y1 - box.y0) * scale;
  const out = new Uint8ClampedArray(width * height * 4);
  const depth = new Float32Array(width * height).fill(-Infinity);

  const xAngle = Math.atan(((box.x0 + box.x1) / 2 - mouseX) / 40);
  const yAngle = Math.atan(((box.y0 + box.y1) / 2 - mouseY) / 40);
  const degrees = Math.PI / 180;
  const bodyRot = 180 + xAngle * 20;
  const headYaw = xAngle * 20 * degrees;
  const headPitch = -yAngle * 20 * degrees;

  // da gui (PictureInPictureRenderer + GuiEntityRenderer) até a entidade (LivingEntityRenderer)
  const pixels = scale * box.size;
  let root = translation(width / 2, height / 2, 0);
  root = multiply(root, scaling(pixels, pixels, -pixels));
  root = multiply(root, translation(0, PLAYER_HEIGHT / 2 + box.offsetY, 0));
  root = multiply(root, multiply(rotationZ(Math.PI), rotationX(yAngle * 20 * degrees)));
  root = multiply(root, rotationY((180 - bodyRot) * degrees));
  root = multiply(root, scaling(-1, -1, 1));
  root = multiply(root, scaling(PLAYER_SCALE, PLAYER_SCALE, PLAYER_SCALE));
  root = multiply(root, translation(0, -1.501, 0));

  // texture: de onde vêm as cores; solid: sem recorte pela transparência (a capa usa entitySolid)
  const drawQuad = (m: Mat, quad: number[][], texture: Skin = skin, solid = false) => {
    const points = quad.map(([x, y, z]) => transformPoint(m, x!, y!, z!));
    // descarta a face de trás (entidades desenham só a frente de cada face)
    const [a, b, c] = points as [[number, number, number], [number, number, number], [number, number, number]];
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (cross >= 0) return;
    // normal da face no espaço da tela, pra luz
    const u: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v: [number, number, number] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal = normalize([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
    const dot = (l: [number, number, number]) => Math.max(0, -(l[0] * normal[0] + l[1] * normal[1] + l[2] * normal[2]));
    const light = Math.min(1, (dot(LIGHT_0) + dot(LIGHT_1)) * 0.6 + 0.4);
    // dois triângulos
    for (const [i0, i1, i2] of [[0, 1, 2], [0, 2, 3]] as const) rasterize(points[i0]!, points[i1]!, points[i2]!, quad[i0]!, quad[i1]!, quad[i2]!, light, texture, solid);
  };

  const rasterize = (p0: number[], p1: number[], p2: number[], t0: number[], t1: number[], t2: number[], light: number, texture: Skin, solid: boolean) => {
    const minX = Math.max(0, Math.floor(Math.min(p0[0]!, p1[0]!, p2[0]!)));
    const maxX = Math.min(width - 1, Math.ceil(Math.max(p0[0]!, p1[0]!, p2[0]!)));
    const minY = Math.max(0, Math.floor(Math.min(p0[1]!, p1[1]!, p2[1]!)));
    const maxY = Math.min(height - 1, Math.ceil(Math.max(p0[1]!, p1[1]!, p2[1]!)));
    const area = (p1[0]! - p0[0]!) * (p2[1]! - p0[1]!) - (p1[1]! - p0[1]!) * (p2[0]! - p0[0]!);
    if (Math.abs(area) < 1e-9) return;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const w0 = ((p1[0]! - px) * (p2[1]! - py) - (p1[1]! - py) * (p2[0]! - px)) / area;
        const w1 = ((p2[0]! - px) * (p0[1]! - py) - (p2[1]! - py) * (p0[0]! - px)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * p0[2]! + w1 * p1[2]! + w2 * p2[2]!;
        const index = y * width + x;
        if (z <= depth[index]!) continue;
        const tu = w0 * t0[3]! + w1 * t1[3]! + w2 * t2[3]!;
        const tv = w0 * t0[4]! + w1 * t1[4]! + w2 * t2[4]!;
        const sx = Math.min(texture.width - 1, Math.max(0, Math.floor(tu * texture.width)));
        const sy = Math.min(texture.height - 1, Math.max(0, Math.floor(tv * texture.height)));
        const source = (sy * texture.width + sx) * 4;
        if (!solid && texture.data[source + 3]! < 26) continue; // recorte (alpha < 0,1), como o shader de entidade
        depth[index] = z;
        out[index * 4] = texture.data[source]! * light;
        out[index * 4 + 1] = texture.data[source + 1]! * light;
        out[index * 4 + 2] = texture.data[source + 2]! * light;
        out[index * 4 + 3] = 255;
      }
    }
  };

  let body = root;
  const visit = (name: string, part: PlayerPart, parent: Mat) => {
    const m = multiply(parent, partMatrix(animatedPose(name, part, headYaw, headPitch, ageInTicks), part.scale));
    if (name === 'body') body = m;
    for (const quad of part.quads) drawQuad(m, quad);
    for (const [childName, child] of Object.entries(part.children)) visit(childName, child, m);
  };
  visit('root', model, root);

  if (cape) {
    const m = multiply(multiply(multiply(body, translation(0, 0, CAPE_OFFSET_Z)), rotationX(CAPE_TILT)), rotationY(Math.PI));
    for (const quad of cape.quads) drawQuad(m, quad, cape.texture, true);
  }

  return { width, height, data: out };
}
