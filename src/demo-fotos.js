// Fotos ILUSTRATIVAS da demonstração: cenas simples desenhadas por código (não são fotos reais de obra).
import jpeg from 'jpeg-js';

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// progresso 0-100: escavação → fundação → estrutura → paredes → acabamento
export function cena(W, H, progresso, semente = 1) {
  const r = rng(semente * 7919), d = Buffer.alloc(W * H * 4);
  const px = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; };
  const rect = (x, y, w, h, c) => { for (let j = Math.max(0, Math.round(y)); j < Math.min(H, Math.round(y + h)); j++) for (let i = Math.max(0, Math.round(x)); i < Math.min(W, Math.round(x + w)); i++) px(i, j, c); };
  const s = W / 640, chao = Math.round(H * 0.72);
  for (let y = 0; y < H; y++) { const t = y / H; for (let x = 0; x < W; x++) px(x, y, [Math.round(120 + 100 * t), Math.round(170 + 60 * t), Math.round(225 + 20 * t)]); } // céu
  for (let k = 0; k < 4; k++) { const cx = r() * W, cy = H * (0.08 + r() * 0.25); for (let j = -8; j <= 8; j++) for (let i = -40; i <= 40; i++) if ((i * i) / 1600 + (j * j) / 64 < 1) px(Math.round(cx + i * s), Math.round(cy + j * s), [245, 247, 250]); } // nuvens
  rect(0, chao, W, H - chao, [120, 96, 70]); rect(0, chao, W, 6 * s, [96, 140, 76]);   // terra e grama
  const bx = W * 0.2, bw = W * 0.6, p = progresso;
  if (p < 15) { rect(bx, chao + 10 * s, bw, 40 * s, [88, 66, 46]); for (let i = 0; i < 8; i++) rect(bx + i * bw / 8, chao + 8 * s, 3 * s, 8 * s, [190, 190, 190]); } // escavação / gabarito
  else {
    rect(bx - 6 * s, chao - 8 * s, bw + 12 * s, 8 * s, [168, 168, 168]);                                     // fundação
    const andares = p < 40 ? 1 : p < 70 ? 2 : 3, altura = 62 * s, pilares = 5;
    for (let a = 0; a < andares; a++) {
      const y0 = chao - 8 * s - (a + 1) * altura, vis = a === andares - 1 ? Math.min(1, (p % 30) / 30 + 0.35) : 1;
      for (let i = 0; i < pilares; i++) rect(bx + i * (bw - 12 * s) / (pilares - 1), y0, 12 * s, altura * vis, [150, 150, 150]);
      rect(bx, y0 - 8 * s, bw, 10 * s, [176, 176, 176]);                                                       // laje
      if (p >= 40) for (let i = 0; i < pilares - 1; i++) { const wx = bx + 12 * s + i * (bw - 12 * s) / (pilares - 1); const corpo = p >= 85 ? [232, 214, 188] : [201, 120, 74]; rect(wx, y0 + 2 * s, (bw - 12 * s) / (pilares - 1) - 12 * s, altura * vis - 2 * s, corpo); if (p >= 55) rect(wx + 14 * s, y0 + 16 * s, 30 * s, 24 * s, [92, 140, 190]); }
    }
    if (p >= 70) { const yt = chao - 8 * s - andares * altura - 8 * s; for (let i = 0; i < 26 * s; i++) rect(bx - 10 * s + i * 1.1, yt - i, bw + 20 * s - i * 2.2, 1.4, [176, 84, 52]); } // telhado
    if (p < 85) { for (let a = 0; a < andares + 1; a++) { rect(bx - 16 * s, chao - a * 66 * s - 4 * s, 3 * s, 70 * s, [233, 150, 40]); rect(bx + bw + 12 * s, chao - a * 66 * s - 4 * s, 3 * s, 70 * s, [233, 150, 40]); } } // andaime
  }
  rect(W * 0.86, chao - 70 * s, 4 * s, 70 * s, [60, 60, 60]); rect(W * 0.78, chao - 72 * s, 80 * s, 5 * s, [233, 150, 40]);  // guindaste simples
  for (let i = 0; i < 30; i++) rect(r() * W, chao + 6 * s + r() * (H - chao - 8 * s), 6 * s * (0.5 + r()), 3 * s, [96 + r() * 30, 76 + r() * 20, 54]); // entulho/terra
  return jpeg.encode({ data: d, width: W, height: H }, 78).data;
}
export const fotoDemo = (progresso, semente) => ({ dados: cena(640, 420, progresso, semente).toString('base64'), miniatura: cena(240, 158, progresso, semente).toString('base64') });
