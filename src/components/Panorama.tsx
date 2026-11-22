// panorama do menu principal da versão escolhida, girando atrás do site, desfocado como os menus do jogo.
// reproduz o CubeMap do jogo (26.3) em webgl:
// - um cubo de −1 a 1 em volta da câmera, amostrando um cubemap pela direção (shaders panorama.vsh/.fsh);
// - faces do cubemap: +X = panorama_1, −X = _3, +Y = _5, −Y = _4, +Z = _0, −Z = _2, cada uma virada de cabeça pra
//   baixo na hora de montar (CubeMapTexture);
// - projeção em perspectiva com campo de visão vertical de 85° (perto 0,05, longe 10);
// - câmera: rotação de 180° em x, depois 10° em x (olha um pouco pra baixo) e o giro em y;
// - giro de 0,1° por tick (20 ticks/s = 2°/s, uma volta em 3 min), na velocidade padrão da opção;
// - desfoque dos menus (box_blur de raio 5, a opção padrão, em 3 idas e voltas ≈ gaussiano de 5,5 px reais):
//   filtro css com a variável --menu-blur.
// como vai desfocado, desenha na metade da resolução (menos trabalho pro celular). sem webgl, ou sem panorama
// publicado na versão, não aparece nada. com "reduzir movimento", fica parado
import { useEffect, useRef, useState } from 'preact/hooks';

// ordem das camadas do cubemap (+X, −X, +Y, −Y, +Z, −Z) → número do arquivo panorama_<n>
const LAYER_FILES = [1, 3, 5, 4, 0, 2];
const FOV = (85 * Math.PI) / 180;
const PITCH = (10 * Math.PI) / 180;
const DEGREES_PER_SECOND = 0.1 * 20;
const RESOLUTION = 0.5; // fração da resolução da tela

// as 6 faces do cubo, na ordem do CubeMap.initializeVertices (cada quadrado vira 2 triângulos)
const QUADS = [
  [-1, -1, 1, -1, 1, 1, 1, 1, 1, 1, -1, 1],
  [1, -1, 1, 1, 1, 1, 1, 1, -1, 1, -1, -1],
  [1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, -1],
  [-1, -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1],
  [-1, -1, -1, -1, -1, 1, 1, -1, 1, 1, -1, -1],
  [-1, 1, 1, -1, 1, -1, 1, 1, -1, 1, 1, 1],
];

const VERTEX = `
attribute vec3 position;
uniform mat4 transform;
varying vec3 direction;
void main() {
  gl_Position = transform * vec4(position, 1.0);
  direction = position;
}`;
const FRAGMENT = `
precision mediump float;
uniform samplerCube faces;
varying vec3 direction;
void main() {
  gl_FragColor = textureCube(faces, direction);
}`;

// matrizes 4×4 em colunas (como o webgl espera)
type Matrix = Float32Array;
function multiply(a: Matrix, b: Matrix): Matrix {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) out[col * 4 + row]! += a[k * 4 + row]! * b[col * 4 + k]!;
  return out;
}
function rotationX(angle: number): Matrix {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}
function rotationY(angle: number): Matrix {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}
function perspective(fovY: number, aspect: number, near: number, far: number): Matrix {
  const f = 1 / Math.tan(fovY / 2);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0]);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

export default function Panorama({ baseUrl }: { baseUrl: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' });
    if (!canvas || !gl) return;
    let running = true;
    let frame = 0;

    const shader = (type: number, source: string) => {
      const created = gl.createShader(type)!;
      gl.shaderSource(created, source);
      gl.compileShader(created);
      return created;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    gl.useProgram(program);

    const vertices = new Float32Array(QUADS.flatMap((quad) => [0, 1, 2, 0, 2, 3].flatMap((i) => [quad[i * 3]!, quad[i * 3 + 1]!, quad[i * 3 + 2]!])));
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
    const transform = gl.getUniformLocation(program, 'transform');

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const started = performance.now();
    const draw = () => {
      if (!running) return;
      const width = Math.max(1, Math.round(canvas.clientWidth * RESOLUTION));
      const height = Math.max(1, Math.round(canvas.clientHeight * RESOLUTION));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
      const spin = still ? 0 : (((performance.now() - started) / 1000) * DEGREES_PER_SECOND) % 360;
      // modelView = rotX(180°) · rotX(10°) · rotY(−giro), como o CubeMap.render
      const view = multiply(multiply(rotationX(Math.PI), rotationX(PITCH)), rotationY((-spin * Math.PI) / 180));
      gl.uniformMatrix4fv(transform, false, multiply(perspective(FOV, width / height, 0.05, 10), view));
      gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 3);
      if (!still) frame = requestAnimationFrame(draw);
    };

    Promise.all(LAYER_FILES.map((file) => loadImage(`${baseUrl}/panorama/${file}.webp`))).then(
      (images) => {
        if (!running) return;
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, gl.createTexture());
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // as faces entram de cabeça pra baixo, como no jogo
        images.forEach((image, layer) => gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + layer, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image));
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        draw();
        setVisible(true);
      },
      () => setVisible(false),
    );

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      setVisible(false);
    };
  }, [baseUrl]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      // um pouco maior que a tela: o desfoque não deixa borda escura
      class="pointer-events-none fixed -inset-8 -z-10 h-[calc(100%+4rem)] w-[calc(100%+4rem)] transition-opacity duration-700 [image-rendering:auto]"
      style={{ filter: 'blur(var(--menu-blur))', opacity: visible ? 1 : 0 }}
    />
  );
}
