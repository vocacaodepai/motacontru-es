// Aditivos de contrato: mudança de escopo, valor e prazo, com histórico. Só a gestão mexe.
import { query, one, tx } from './db.js';
import { ErroNegocio, isData, hoje, addDias } from './services.js';

const txt = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());
const soGestao = (u) => { if (u.papel !== 'admin') throw new ErroNegocio('Só a gestão faz aditivos de contrato.', 403); };

export const listarAditivos = (obraId) => query('SELECT a.*, u.nome AS autor FROM obra_aditivos a LEFT JOIN usuarios u ON u.id = a.criado_por_id WHERE a.obra_id = $1 ORDER BY a.numero', [obraId]);

export async function criarAditivo(usuario, obraId, b) {
  soGestao(usuario);
  const descricao = txt(b.descricao);
  if (!descricao) throw new ErroNegocio('Descreva o aditivo (ex.: inclusão de piscina no escopo).');
  const data = b.data || hoje();
  if (!isData(data)) throw new ErroNegocio('Data inválida.');
  const valor = b.valor_delta == null || b.valor_delta === '' ? 0 : Math.round(Number(b.valor_delta));
  const prazo = b.prazo_delta_dias == null || b.prazo_delta_dias === '' ? 0 : Number(b.prazo_delta_dias);
  if (!Number.isFinite(valor)) throw new ErroNegocio('Valor do aditivo inválido.');
  if (!Number.isInteger(prazo) || Math.abs(prazo) > 3650) throw new ErroNegocio('Prazo do aditivo inválido (em dias).');
  if (!valor && !prazo) throw new ErroNegocio('Informe a mudança de valor e/ou de prazo.');
  return tx(async () => {
    await query('SELECT pg_advisory_xact_lock(724531)');
    const o = await one('SELECT valor_contrato, previsao_fim FROM obras WHERE id = $1', [obraId]);
    if (!o) throw new ErroNegocio('Obra não encontrada.', 404);
    if (o.valor_contrato + valor < 0) throw new ErroNegocio('O contrato ficaria com valor negativo.');
    const numero = (await one('SELECT COALESCE(MAX(numero),0)+1 AS n FROM obra_aditivos WHERE obra_id = $1', [obraId])).n;
    await query('INSERT INTO obra_aditivos (obra_id, numero, data, descricao, valor_delta, prazo_delta_dias, valor_antes, previsao_antes, criado_por_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [obraId, numero, data, descricao, valor, prazo, o.valor_contrato, o.previsao_fim, usuario.id]);
    await query('UPDATE obras SET valor_contrato = valor_contrato + $1, previsao_fim = CASE WHEN previsao_fim IS NULL THEN NULL ELSE previsao_fim + $2::int END WHERE id = $3', [valor, prazo, obraId]);
    return numero;
  });
}

// Só o último aditivo pode ser desfeito (restaura valor e prazo de antes)
export async function desfazerAditivo(usuario, obraId, id) {
  soGestao(usuario);
  return tx(async () => {
    const a = await one('SELECT * FROM obra_aditivos WHERE id = $1 AND obra_id = $2', [id, obraId]);
    if (!a) throw new ErroNegocio('Aditivo não encontrado.', 404);
    const ultimo = await one('SELECT MAX(numero) AS n FROM obra_aditivos WHERE obra_id = $1', [obraId]);
    if (a.numero !== ultimo.n) throw new ErroNegocio('Só o último aditivo pode ser desfeito.', 409);
    await query('UPDATE obras SET valor_contrato = $1, previsao_fim = $2 WHERE id = $3', [a.valor_antes, a.previsao_antes, obraId]);
    await query('DELETE FROM obra_aditivos WHERE id = $1', [id]);
  });
}
