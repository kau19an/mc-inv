// wawoff2 não traz tipos: só a função usada pelo gerador da fonte web
declare module 'wawoff2' {
  export function compress(data: Uint8Array): Promise<Uint8Array>;
  export function decompress(data: Uint8Array): Promise<Uint8Array>;
}
