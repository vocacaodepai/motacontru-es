// Marca da empresa (nome, cor e logo) e configurações simples. Permite trocar a logo sem mexer no código.
import { query, one } from './db.js';
import { ErroNegocio } from './services.js';

const LOGO_MAX = 300 * 1024;
export async function config(chave, padrao = null) { return (await one('SELECT valor FROM configuracoes WHERE chave = $1', [chave]))?.valor ?? padrao; }
export const salvarConfig = (chave, valor) => query(`INSERT INTO configuracoes (chave, valor) VALUES ($1,$2)
  ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = (now() AT TIME ZONE 'America/Sao_Paulo')`, [chave, String(valor)]);

export async function marca() {
  const [nome, cor, logo] = await Promise.all([config('marca_nome', 'Mota Construções'), config('marca_cor', ''), one('SELECT tipo, atualizado_em FROM marca_logo WHERE id = 1')]);
  return { nome, cor, tem_logo: !!logo, v: logo ? String(logo.atualizado_em).replace(/\D/g, '') : '0' };
}

export async function salvarMarca(b) {
  const nome = String(b.nome || '').trim();
  if (!nome) throw new ErroNegocio('Informe o nome da empresa.');
  const cor = String(b.cor || '').trim();
  if (cor && !/^#[0-9a-fA-F]{6}$/.test(cor)) throw new ErroNegocio('Cor inválida (use o formato #RRGGBB).');
  await salvarConfig('marca_nome', nome.slice(0, 60));
  await salvarConfig('marca_cor', cor);
}

function tipoDe(buf) {
  const h = buf.subarray(0, 12).toString('hex');
  if (h.startsWith('89504e47')) return 'image/png';
  if (h.startsWith('ffd8ff')) return 'image/jpeg';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  const ini = buf.subarray(0, 200).toString('utf8').trimStart().toLowerCase();
  if (ini.startsWith('<svg') || (ini.startsWith('<?xml') && ini.includes('<svg'))) return 'image/svg+xml';
  return null;
}
export async function salvarLogo(base64) {
  const buf = Buffer.from(String(base64 || ''), 'base64');
  if (!buf.length) throw new ErroNegocio('Escolha o arquivo da logo.');
  if (buf.length > LOGO_MAX) throw new ErroNegocio('A logo passa de 300 KB. Reduza a imagem.');
  const tipo = tipoDe(buf);
  if (!tipo) throw new ErroNegocio('Envie a logo em PNG, JPG, WebP ou SVG.');
  await query(`INSERT INTO marca_logo (id, tipo, dados) VALUES (1,$1,$2) ON CONFLICT (id) DO UPDATE SET tipo = EXCLUDED.tipo, dados = EXCLUDED.dados, atualizado_em = (now() AT TIME ZONE 'America/Sao_Paulo')`, [tipo, buf]);
}
export const removerLogo = () => query('DELETE FROM marca_logo WHERE id = 1');
export async function lerLogo() {
  const r = await one('SELECT tipo, dados FROM marca_logo WHERE id = 1');
  return r ? { tipo: r.tipo, buf: Buffer.from(r.dados) } : null;
}
