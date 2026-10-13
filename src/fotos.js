// Fotos da obra: o navegador reduz a imagem (JPEG) e manda também uma miniatura; aqui só validamos e guardamos.
import { query, one } from './db.js';
import { ErroNegocio, isData, hoje } from './services.js';
import { acesso } from './obras.js';

const MAX_FOTO = 1_600_000, MAX_MINI = 200_000;
const txt = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());
function jpeg(b64, rotulo, max) {
  const buf = Buffer.from(String(b64 || ''), 'base64');
  if (buf.length < 200 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) throw new ErroNegocio(`${rotulo} inválida: envie uma foto em JPEG.`);
  if (buf.length > max) throw new ErroNegocio(`${rotulo} grande demais.`, 413);
  return buf;
}

export async function adicionar(usuario, obraId, b) {
  await acesso(usuario, obraId, { escrita: true });
  const dados = jpeg(b.dados, 'Foto', MAX_FOTO), mini = jpeg(b.miniatura, 'Miniatura', MAX_MINI);
  const data = b.data || hoje();
  if (!isData(data) || data > hoje()) throw new ErroNegocio('Data da foto inválida.');
  let faseId = null;
  if (b.fase_id) {
    faseId = Number(b.fase_id);
    if (!(await one('SELECT 1 AS x FROM obra_fases WHERE id = $1 AND obra_id = $2', [faseId, obraId]))) throw new ErroNegocio('Etapa inválida para esta obra.');
  }
  return (await one(`INSERT INTO obra_fotos (obra_id, fase_id, data, legenda, visivel_cliente, tamanho, dados, miniatura, autor_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [obraId, faseId, data, txt(b.legenda), b.visivel_cliente ? 1 : 0, dados.length, dados, mini, usuario.id])).id;
}

export async function listar(usuario, obraId) {
  await acesso(usuario, obraId);
  return query(`SELECT f.id, f.obra_id, f.fase_id, f.data, f.legenda, f.visivel_cliente, f.tamanho, f.criado_em, fs.nome AS fase, u.nome AS autor
    FROM obra_fotos f LEFT JOIN obra_fases fs ON fs.id = f.fase_id LEFT JOIN usuarios u ON u.id = f.autor_id WHERE f.obra_id = $1 ORDER BY f.data DESC, f.id DESC LIMIT 400`, [obraId]);
}

// Quem pode ver o arquivo: a equipe (conforme o acesso à obra) e o cliente dono da obra, só nas fotos liberadas
export async function ler(usuario, id, tipo = 'dados') {
  const f = await one(`SELECT obra_id, visivel_cliente, ${tipo === 'miniatura' ? 'miniatura' : 'dados'} AS conteudo FROM obra_fotos WHERE id = $1`, [id]);
  if (!f) throw new ErroNegocio('Foto não encontrada.', 404);
  if (usuario.papel === 'cliente') {
    const liga = await one('SELECT 1 AS x FROM cliente_acessos WHERE usuario_id = $1 AND obra_id = $2', [usuario.id, f.obra_id]);
    if (!liga || !f.visivel_cliente) throw new ErroNegocio('Foto não disponível.', 403);
  } else await acesso(usuario, f.obra_id);
  return Buffer.from(f.conteudo);
}

export async function atualizar(usuario, id, b) {
  const f = await one('SELECT obra_id FROM obra_fotos WHERE id = $1', [id]);
  if (!f) throw new ErroNegocio('Foto não encontrada.', 404);
  await acesso(usuario, f.obra_id, { escrita: true });
  let faseId = null;
  if (b.fase_id) {
    faseId = Number(b.fase_id);
    if (!(await one('SELECT 1 AS x FROM obra_fases WHERE id = $1 AND obra_id = $2', [faseId, f.obra_id]))) throw new ErroNegocio('Etapa inválida para esta obra.');
  }
  await query('UPDATE obra_fotos SET legenda = $1, visivel_cliente = $2, fase_id = $3 WHERE id = $4', [txt(b.legenda), b.visivel_cliente ? 1 : 0, faseId, id]);
}

export async function excluir(usuario, id) {
  const f = await one('SELECT obra_id FROM obra_fotos WHERE id = $1', [id]);
  if (!f) throw new ErroNegocio('Foto não encontrada.', 404);
  await acesso(usuario, f.obra_id, { escrita: true });
  await query('DELETE FROM obra_fotos WHERE id = $1', [id]);
}
