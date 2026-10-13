// Compras: limite de aprovação e cotação de materiais (compara fornecedores e fecha a compra com o melhor preço).
import { query, one, tx } from './db.js';
import { ErroNegocio, hoje, addDias } from './services.js';
import { acesso } from './obras.js';
import { salvarMaterial } from './materiais.js';
import { config, salvarConfig } from './marca.js';

const txt = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());
const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; };

export const limiteAprovacao = async () => Number(await config('limite_aprovacao', '0')) || 0;
export async function definirLimite(usuario, valor) {
  if (usuario.papel !== 'admin') throw new ErroNegocio('Só a gestão define o limite de aprovação.', 403);
  const v = valor == null || valor === '' ? 0 : Math.round(Number(valor));
  if (!Number.isFinite(v) || v < 0) throw new ErroNegocio('Limite inválido.');
  await salvarConfig('limite_aprovacao', v);
  return v;
}

async function comItens(c) {
  const itens = await query(`SELECT i.id, i.fornecedor_id, f.nome AS fornecedor, i.valor_unit, i.prazo_dias, i.obs, round($2::numeric * i.valor_unit)::bigint AS total
    FROM cotacao_itens i JOIN fornecedores f ON f.id = i.fornecedor_id WHERE i.cotacao_id = $1 ORDER BY i.valor_unit, i.id`, [c.id, c.quantidade]);
  const totais = itens.map((i) => i.total);
  return { ...c, itens, melhor_item_id: itens[0]?.id ?? null, economia: itens.length > 1 ? Math.max(...totais) - Math.min(...totais) : 0 };
}

export async function listarCotacoes(usuario, { obra_id, status } = {}) {
  const w = [], p = [];
  const add = (sql, v) => { p.push(v); w.push(sql.replace('?', '$' + p.length)); };
  if (obra_id) add('c.obra_id = ?', Number(obra_id));
  if (status) add('c.status = ?', String(status));
  if (usuario.papel === 'engenheiro') add('o.engenheiro_id IN (SELECT id FROM funcionarios WHERE usuario_id = ?)', usuario.id);
  const l = await query(`SELECT c.id, c.obra_id, c.descricao, c.unidade, c.quantidade::float8 AS quantidade, c.status, c.vencedora_id, c.material_id, c.criado_em, o.codigo AS obra_codigo, o.nome AS obra, u.nome AS criado_por
    FROM cotacoes c JOIN obras o ON o.id = c.obra_id LEFT JOIN usuarios u ON u.id = c.criado_por_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY (c.status = 'aberta') DESC, c.id DESC LIMIT 100`, p);
  return Promise.all(l.map(comItens));
}

function lerItem(b) {
  const valor = b.valor_unit == null || b.valor_unit === '' ? NaN : Math.round(Number(b.valor_unit));
  if (!Number.isFinite(valor) || valor < 0) throw new ErroNegocio('Informe o valor unitário de cada fornecedor.');
  const prazo = b.prazo_dias == null || b.prazo_dias === '' ? null : Number(b.prazo_dias);
  if (prazo != null && (!Number.isInteger(prazo) || prazo < 0 || prazo > 365)) throw new ErroNegocio('Prazo de entrega inválido (em dias).');
  return { fornecedor_id: Number(b.fornecedor_id), valor, prazo, obs: txt(b.obs) };
}

export async function criarCotacao(usuario, obraId, b) {
  await acesso(usuario, obraId, { escrita: true });
  const descricao = txt(b.descricao);
  if (!descricao) throw new ErroNegocio('Descreva o material a cotar.');
  const quantidade = num(b.quantidade);
  if (!(quantidade > 0)) throw new ErroNegocio('Informe a quantidade (maior que zero).');
  const itens = (Array.isArray(b.itens) ? b.itens : []).map(lerItem);
  if (itens.length < 2) throw new ErroNegocio('Cotação precisa de pelo menos 2 fornecedores para comparar.');
  if (new Set(itens.map((i) => i.fornecedor_id)).size !== itens.length) throw new ErroNegocio('Há fornecedor repetido na cotação.');
  return tx(async () => {
    for (const i of itens) if (!(await one('SELECT 1 AS x FROM fornecedores WHERE id = $1', [i.fornecedor_id]))) throw new ErroNegocio('Fornecedor inválido.');
    const c = await one('INSERT INTO cotacoes (obra_id, descricao, unidade, quantidade, criado_por_id) VALUES ($1,$2,$3,$4,$5) RETURNING id', [obraId, descricao, txt(b.unidade) || 'un', quantidade, usuario.id]);
    for (const i of itens) await query('INSERT INTO cotacao_itens (cotacao_id, fornecedor_id, valor_unit, prazo_dias, obs) VALUES ($1,$2,$3,$4,$5)', [c.id, i.fornecedor_id, i.valor, i.prazo, i.obs]);
    return c.id;
  });
}

async function cotacaoAberta(usuario, id) {
  const c = await one('SELECT * FROM cotacoes WHERE id = $1', [id]);
  if (!c) throw new ErroNegocio('Cotação não encontrada.', 404);
  await acesso(usuario, c.obra_id, { escrita: true });
  if (c.status !== 'aberta') throw new ErroNegocio('Esta cotação já foi encerrada.', 409);
  return c;
}
export async function registrarPreco(usuario, id, b) {
  await cotacaoAberta(usuario, id);
  const i = lerItem(b);
  if (!(await one('SELECT 1 AS x FROM fornecedores WHERE id = $1', [i.fornecedor_id]))) throw new ErroNegocio('Fornecedor inválido.');
  await query(`INSERT INTO cotacao_itens (cotacao_id, fornecedor_id, valor_unit, prazo_dias, obs) VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (cotacao_id, fornecedor_id) DO UPDATE SET valor_unit = EXCLUDED.valor_unit, prazo_dias = EXCLUDED.prazo_dias, obs = EXCLUDED.obs`, [id, i.fornecedor_id, i.valor, i.prazo, i.obs]);
}

// Escolhe o fornecedor: cria o pedido de material (sujeito à aprovação por limite) e encerra a cotação
export async function escolher(usuario, id, itemId) {
  const c = await cotacaoAberta(usuario, id);
  const item = await one('SELECT * FROM cotacao_itens WHERE id = $1 AND cotacao_id = $2', [Number(itemId), id]);
  if (!item) throw new ErroNegocio('Escolha um dos fornecedores da cotação.');
  return tx(async () => {
    const materialId = await salvarMaterial(usuario, c.obra_id, null, {
      descricao: c.descricao, unidade: c.unidade, quantidade: c.quantidade, valor_unit: item.valor_unit, fornecedor_id: item.fornecedor_id, status: 'pedido',
      data_pedido: hoje(), entrega_prevista: item.prazo_dias != null ? addDias(hoje(), item.prazo_dias) : null, obs: `Cotação nº ${c.id}`,
    });
    await query("UPDATE cotacoes SET status = 'fechada', vencedora_id = $1, material_id = $2 WHERE id = $3", [item.id, materialId, id]);
    return { material_id: materialId, status: (await one('SELECT status FROM obra_materiais WHERE id = $1', [materialId])).status };
  });
}
export async function cancelarCotacao(usuario, id) {
  await cotacaoAberta(usuario, id);
  await query("UPDATE cotacoes SET status = 'cancelada' WHERE id = $1", [id]);
}
