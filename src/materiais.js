// Materiais da obra (pedido → entrega → aplicado), fornecedores, terceirizadas e seus contratos por obra.
import { query, one, tx } from './db.js';
import { ErroNegocio, isData, hoje } from './services.js';
import { acesso } from './obras.js';
import { config } from './marca.js';

export const STATUS_MATERIAL = { aguardando_aprovacao: 'Aguardando aprovação da gestão', recusado: 'Compra recusada', solicitado: 'Solicitado', pedido: 'Pedido ao fornecedor', entregue: 'Entregue na obra', aplicado: 'Aplicado', cancelado: 'Cancelado' };
export const STATUS_TERCEIRO = { cotacao: 'Em cotação', contratada: 'Contratada', em_execucao: 'Em execução', concluida: 'Concluída', cancelada: 'Cancelada' };
export const ESPECIALIDADES = ['Painel de LED e comunicação visual', 'Piscinas', 'Elétrica', 'Hidráulica', 'Esquadrias e vidros', 'Ar-condicionado', 'Elevadores', 'Gesso e forro', 'Pintura', 'Paisagismo', 'Impermeabilização', 'Marcenaria', 'Serralheria', 'Automação e segurança', 'Terraplenagem', 'Outra'];
export const CATEGORIAS_FORNECEDOR = ['Cimento e concreto', 'Aço e ferragens', 'Material básico', 'Elétrica e hidráulica', 'Acabamentos', 'Madeira', 'Locação de equipamentos', 'Ferramentas', 'Outros'];

const txt = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());
const cnpjOk = (c) => { const d = String(c || '').replace(/\D/g, ''); return d === '' || d.length === 14; };
const num2 = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; };

// ---------- fornecedores ----------
export const listarFornecedores = () => query(`SELECT f.*, (SELECT COUNT(*) FROM obra_materiais m WHERE m.fornecedor_id = f.id) AS pedidos,
    (SELECT COALESCE(SUM(round(m.quantidade * m.valor_unit)), 0) FROM obra_materiais m WHERE m.fornecedor_id = f.id AND m.status <> 'cancelado') AS total_comprado
  FROM fornecedores f ORDER BY f.ativo DESC, lower(f.nome)`);

export async function salvarFornecedor(id, b) {
  const nome = txt(b.nome);
  if (!nome) throw new ErroNegocio('Informe o nome do fornecedor.');
  if (!cnpjOk(b.cnpj)) throw new ErroNegocio('CNPJ inválido (14 números).');
  const prazo = b.prazo_dias == null || b.prazo_dias === '' ? null : Number(b.prazo_dias);
  if (prazo != null && (!Number.isInteger(prazo) || prazo < 0)) throw new ErroNegocio('Prazo de entrega inválido (em dias).');
  const v = [nome, txt(b.cnpj), txt(b.categoria) || 'Material básico', txt(b.contato), txt(b.telefone), txt(b.email), prazo, txt(b.obs), b.ativo === 0 || b.ativo === false ? 0 : 1];
  try {
    if (id) {
      const r = await one('UPDATE fornecedores SET nome=$1,cnpj=$2,categoria=$3,contato=$4,telefone=$5,email=$6,prazo_dias=$7,obs=$8,ativo=$9 WHERE id=$10 RETURNING id', [...v, id]);
      if (!r) throw new ErroNegocio('Fornecedor não encontrado.', 404);
      return id;
    }
    return (await one('INSERT INTO fornecedores (nome,cnpj,categoria,contato,telefone,email,prazo_dias,obs,ativo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id', v)).id;
  } catch (e) {
    if (e.code === '23505') throw new ErroNegocio('Já existe um fornecedor com este nome.', 409);
    throw e;
  }
}

// ---------- materiais ----------
const SELECT_MAT = `SELECT m.*, m.quantidade::float8 AS quantidade, round(m.quantidade * m.valor_unit)::bigint AS total, f.nome AS fornecedor, o.nome AS obra, o.codigo AS obra_codigo, fs.nome AS fase
  FROM obra_materiais m JOIN obras o ON o.id = m.obra_id LEFT JOIN fornecedores f ON f.id = m.fornecedor_id LEFT JOIN obra_fases fs ON fs.id = m.fase_id`;

export async function listarMateriais(usuario, { obra_id, status, de, ate } = {}) {
  const w = [], p = [];
  const add = (sql, v) => { p.push(v); w.push(sql.replace('?', '$' + p.length)); };
  if (obra_id) add('m.obra_id = ?', Number(obra_id));
  if (status) add('m.status = ?', String(status));
  if (de) { if (!isData(de)) throw new ErroNegocio('Data inicial inválida.'); add('m.data_pedido >= ?', de); }
  if (ate) { if (!isData(ate)) throw new ErroNegocio('Data final inválida.'); add('m.data_pedido <= ?', ate); }
  if (usuario.papel === 'engenheiro') add('o.engenheiro_id IN (SELECT id FROM funcionarios WHERE usuario_id = ?)', usuario.id);
  return query(`${SELECT_MAT} ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY m.data_pedido DESC, m.id DESC LIMIT 400`, p);
}

// Resumo para a tela de Materiais: o que está a caminho, o que chega hoje, quanto está a pagar
export async function resumoMateriais(usuario) {
  const h = hoje();
  const eng = usuario.papel === 'engenheiro' ? 'AND o.engenheiro_id IN (SELECT id FROM funcionarios WHERE usuario_id = $2)' : '';
  const p = usuario.papel === 'engenheiro' ? [h, usuario.id] : [h];
  const r = await one(`SELECT
      COUNT(*) FILTER (WHERE m.status = 'aguardando_aprovacao') AS aguardando_aprovacao,
      COALESCE(SUM(round(m.quantidade * m.valor_unit)) FILTER (WHERE m.status = 'aguardando_aprovacao'), 0) AS valor_aguardando,
      COUNT(*) FILTER (WHERE m.status IN ('solicitado','pedido')) AS a_caminho,
      COUNT(*) FILTER (WHERE m.status IN ('solicitado','pedido') AND m.entrega_prevista = $1) AS chegam_hoje,
      COUNT(*) FILTER (WHERE m.status IN ('solicitado','pedido') AND m.entrega_prevista < $1) AS atrasados,
      COALESCE(SUM(round(m.quantidade * m.valor_unit)) FILTER (WHERE m.status NOT IN ('cancelado','recusado','aguardando_aprovacao') AND m.lancamento_id IS NULL), 0) AS a_pagar,
      COALESCE(SUM(round(m.quantidade * m.valor_unit)) FILTER (WHERE m.status NOT IN ('cancelado','recusado','aguardando_aprovacao') AND date_trunc('month', m.data_pedido) = date_trunc('month', $1::date)), 0) AS comprado_mes
    FROM obra_materiais m JOIN obras o ON o.id = m.obra_id WHERE true ${eng}`, p);
  return r;
}

function lerMaterial(b) {
  const descricao = txt(b.descricao);
  if (!descricao) throw new ErroNegocio('Descreva o material (ex.: cimento CP-II 50 kg).');
  const quantidade = num2(b.quantidade);
  if (!(quantidade > 0)) throw new ErroNegocio('Informe a quantidade (maior que zero).');
  const valor_unit = b.valor_unit == null || b.valor_unit === '' ? 0 : Math.round(Number(b.valor_unit));
  if (!Number.isFinite(valor_unit) || valor_unit < 0) throw new ErroNegocio('Valor unitário inválido.');
  const status = b.status || 'pedido';
  if (!Object.hasOwn(STATUS_MATERIAL, status)) throw new ErroNegocio('Situação do material inválida.');
  const data_pedido = b.data_pedido || hoje();
  if (!isData(data_pedido)) throw new ErroNegocio('Data do pedido inválida.');
  for (const c of ['entrega_prevista', 'entregue_em']) if (txt(b[c]) && !isData(b[c])) throw new ErroNegocio('Data de entrega inválida.');
  let entregue_em = txt(b.entregue_em);
  if (['entregue', 'aplicado'].includes(status) && !entregue_em) entregue_em = hoje();
  return { descricao, unidade: txt(b.unidade) || 'un', quantidade, valor_unit, nf_numero: txt(b.nf_numero), status, data_pedido, entrega_prevista: txt(b.entrega_prevista), entregue_em, obs: txt(b.obs), fornecedor_id: b.fornecedor_id ? Number(b.fornecedor_id) : null };
}

export async function salvarMaterial(usuario, obraId, id, b) {
  await acesso(usuario, obraId, { escrita: true });
  const m = lerMaterial(b);
  if (m.fornecedor_id && !(await one('SELECT 1 AS x FROM fornecedores WHERE id = $1', [m.fornecedor_id]))) throw new ErroNegocio('Fornecedor inválido.');
  const faseId = b.fase_id ? Number(b.fase_id) : null;
  if (faseId && !(await one('SELECT 1 AS x FROM obra_fases WHERE id = $1 AND obra_id = $2', [faseId, obraId]))) throw new ErroNegocio('Etapa inválida para esta obra.');
  const atual = id ? await one('SELECT status FROM obra_materiais WHERE id = $1 AND obra_id = $2', [id, obraId]) : null;
  if (id && !atual) throw new ErroNegocio('Material não encontrado.', 404);
  const gestao = usuario.papel === 'admin';
  if (atual && ['aguardando_aprovacao', 'recusado'].includes(atual.status) && !gestao) {
    if (atual.status === 'recusado') throw new ErroNegocio('Esta compra foi recusada pela gestão.', 409);
    m.status = 'aguardando_aprovacao'; // enquanto espera, o engenheiro só corrige os dados
  } else if (!id && !gestao && ['solicitado', 'pedido'].includes(m.status)) {
    // compra grande feita pelo engenheiro espera a aprovação da gestão
    const limite = Number(await config('limite_aprovacao', '0')) || 0;
    if (limite > 0 && Math.round(m.quantidade * m.valor_unit) >= limite) m.status = 'aguardando_aprovacao';
  } else if (id && !gestao && atual.status !== m.status && ['aguardando_aprovacao'].includes(m.status)) m.status = atual.status;
  const v = [m.fornecedor_id, m.descricao, m.unidade, m.quantidade, m.valor_unit, m.nf_numero, m.status, m.data_pedido, m.entrega_prevista, m.entregue_em, m.obs, faseId];
  if (id) {
    await one('UPDATE obra_materiais SET fornecedor_id=$1,descricao=$2,unidade=$3,quantidade=$4,valor_unit=$5,nf_numero=$6,status=$7,data_pedido=$8,entrega_prevista=$9,entregue_em=$10,obs=$11,fase_id=$12 WHERE id=$13 AND obra_id=$14 RETURNING id', [...v, id, obraId]);
    return id;
  }
  return (await one('INSERT INTO obra_materiais (fornecedor_id,descricao,unidade,quantidade,valor_unit,nf_numero,status,data_pedido,entrega_prevista,entregue_em,obs,fase_id,obra_id,criado_por_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id', [...v, obraId, usuario.id])).id;
}

// Aprovação de compras (gestão)
export async function aprovarMaterial(usuario, id) {
  if (usuario.papel !== 'admin') throw new ErroNegocio('Só a gestão aprova compras.', 403);
  const r = await one("UPDATE obra_materiais SET status = 'pedido', aprovado_por_id = $2, aprovado_em = (now() AT TIME ZONE 'America/Sao_Paulo') WHERE id = $1 AND status = 'aguardando_aprovacao' RETURNING id", [id, usuario.id]);
  if (!r) throw new ErroNegocio('Esta compra não está aguardando aprovação.', 409);
}
export async function recusarMaterial(usuario, id, motivo) {
  if (usuario.papel !== 'admin') throw new ErroNegocio('Só a gestão recusa compras.', 403);
  const t = txt(motivo);
  if (!t) throw new ErroNegocio('Informe o motivo da recusa.');
  const r = await one("UPDATE obra_materiais SET status = 'recusado', aprovado_por_id = $2, aprovado_em = (now() AT TIME ZONE 'America/Sao_Paulo'), obs = trim(both ' ' from coalesce(obs,'') || ' [Recusado: ' || $3 || ']') WHERE id = $1 AND status = 'aguardando_aprovacao' RETURNING id", [id, usuario.id, t]);
  if (!r) throw new ErroNegocio('Esta compra não está aguardando aprovação.', 409);
}

// Atalho do dia a dia: marcar como entregue / aplicado
export async function mudarStatusMaterial(usuario, id, status) {
  const m = await one('SELECT obra_id FROM obra_materiais WHERE id = $1', [id]);
  if (!m) throw new ErroNegocio('Material não encontrado.', 404);
  await acesso(usuario, m.obra_id, { escrita: true });
  if (!Object.hasOwn(STATUS_MATERIAL, status) || ['aguardando_aprovacao', 'recusado'].includes(status)) throw new ErroNegocio('Situação inválida.');
  const ant = await one('SELECT status FROM obra_materiais WHERE id = $1', [id]);
  if (['aguardando_aprovacao', 'recusado'].includes(ant.status)) throw new ErroNegocio('Esta compra ainda precisa da aprovação da gestão.', 409);
  await query(`UPDATE obra_materiais SET status = $1, entregue_em = CASE WHEN $1 IN ('entregue','aplicado') THEN COALESCE(entregue_em, $3::date) ELSE entregue_em END WHERE id = $2`, [status, id, hoje()]);
}

export async function excluirMaterial(usuario, id) {
  const m = await one('SELECT obra_id, lancamento_id FROM obra_materiais WHERE id = $1', [id]);
  if (!m) throw new ErroNegocio('Material não encontrado.', 404);
  await acesso(usuario, m.obra_id, { escrita: true });
  if (m.lancamento_id) throw new ErroNegocio('Este material já foi pago no caixa. Exclua o lançamento primeiro ou marque como Cancelado.', 409);
  await query('DELETE FROM obra_materiais WHERE id = $1', [id]);
}

// Paga o material: lança a SAÍDA no caixa (ligada à obra) e guarda o vínculo, para o custo não contar duas vezes.
export async function pagarMaterial(usuario, id, b, criarLancamento) {
  return tx(async () => {
    const m = await one(`${SELECT_MAT} WHERE m.id = $1`, [id]);
    if (!m) throw new ErroNegocio('Material não encontrado.', 404);
    if (m.lancamento_id) throw new ErroNegocio('Este material já foi pago.', 409);
    if (['cancelado', 'recusado'].includes(m.status)) throw new ErroNegocio('Este material está cancelado ou foi recusado.', 409);
    if (m.status === 'aguardando_aprovacao') throw new ErroNegocio('Aprove a compra antes de pagar.', 409);
    if (!(m.total > 0)) throw new ErroNegocio('Informe o valor unitário do material antes de pagar.');
    const categoria = b.categoria_id || (await one("SELECT id FROM categorias WHERE nome = 'Outros materiais'"))?.id;
    const l = await criarLancamento({ data: b.data || hoje(), tipo: 'saida', valor: m.total, conta_id: b.conta_id, categoria_id: categoria, obra_id: m.obra_id, fase_id: m.fase_id,
      descricao: `${m.descricao}${m.fornecedor ? ' — ' + m.fornecedor : ''}${m.nf_numero ? ' (NF ' + m.nf_numero + ')' : ''}`, criado_por: usuario.nome, criado_por_id: usuario.id });
    await query('UPDATE obra_materiais SET lancamento_id = $1 WHERE id = $2', [l.id, id]);
    return l;
  });
}

// ---------- terceirizadas ----------
export const listarTerceirizadas = () => query(`SELECT t.*,
    (SELECT COUNT(*) FROM obra_terceiros o WHERE o.terceirizada_id = t.id AND o.status IN ('contratada','em_execucao')) AS contratos_ativos,
    (SELECT COALESCE(SUM(o.valor), 0) FROM obra_terceiros o WHERE o.terceirizada_id = t.id AND o.status <> 'cancelada') AS total_contratado,
    (SELECT COALESCE(SUM(o.pago), 0) FROM obra_terceiros o WHERE o.terceirizada_id = t.id AND o.status <> 'cancelada') AS total_pago
  FROM terceirizadas t ORDER BY t.ativo DESC, lower(t.nome)`);

export async function salvarTerceirizada(id, b) {
  const nome = txt(b.nome), especialidade = txt(b.especialidade);
  if (!nome) throw new ErroNegocio('Informe o nome da empresa.');
  if (!especialidade) throw new ErroNegocio('Informe a especialidade (ex.: painel de LED, piscina).');
  if (!cnpjOk(b.cnpj)) throw new ErroNegocio('CNPJ inválido (14 números).');
  const nota = b.nota == null || b.nota === '' ? null : Number(b.nota);
  if (nota != null && (!Number.isInteger(nota) || nota < 1 || nota > 5)) throw new ErroNegocio('A nota vai de 1 a 5.');
  for (const c of ['certidoes_validade', 'seguro_validade']) if (txt(b[c]) && !isData(b[c])) throw new ErroNegocio('Data de validade inválida.');
  const v = [nome, txt(b.cnpj), especialidade, txt(b.responsavel), txt(b.telefone), txt(b.email), nota, txt(b.certidoes_validade), txt(b.seguro_validade), txt(b.obs), b.ativo === 0 || b.ativo === false ? 0 : 1];
  try {
    if (id) {
      const r = await one('UPDATE terceirizadas SET nome=$1,cnpj=$2,especialidade=$3,responsavel=$4,telefone=$5,email=$6,nota=$7,certidoes_validade=$8,seguro_validade=$9,obs=$10,ativo=$11 WHERE id=$12 RETURNING id', [...v, id]);
      if (!r) throw new ErroNegocio('Empresa não encontrada.', 404);
      return id;
    }
    return (await one('INSERT INTO terceirizadas (nome,cnpj,especialidade,responsavel,telefone,email,nota,certidoes_validade,seguro_validade,obs,ativo) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id', v)).id;
  } catch (e) {
    if (e.code === '23505') throw new ErroNegocio('Já existe uma empresa com este nome.', 409);
    throw e;
  }
}

// Contratos da terceirizada dentro de uma obra (só a gestão mexe em valores)
export async function salvarContratoTerceiro(usuario, obraId, id, b) {
  if (usuario.papel !== 'admin') throw new ErroNegocio('Só a gestão faz contratos com terceirizadas.', 403);
  if (!(await one('SELECT 1 AS x FROM obras WHERE id = $1', [obraId]))) throw new ErroNegocio('Obra não encontrada.', 404);
  if (!(await one('SELECT 1 AS x FROM terceirizadas WHERE id = $1', [Number(b.terceirizada_id)]))) throw new ErroNegocio('Escolha a empresa terceirizada.');
  const escopo = txt(b.escopo);
  if (!escopo) throw new ErroNegocio('Descreva o serviço contratado (ex.: instalação do painel de LED da fachada).');
  const valor = b.valor == null || b.valor === '' ? 0 : Math.round(Number(b.valor));
  const pago = b.pago == null || b.pago === '' ? 0 : Math.round(Number(b.pago));
  if (!Number.isFinite(valor) || valor < 0 || !Number.isFinite(pago) || pago < 0) throw new ErroNegocio('Valores inválidos.');
  if (pago > valor) throw new ErroNegocio('O valor pago não pode passar do valor do contrato.');
  const status = b.status || 'contratada';
  if (!Object.hasOwn(STATUS_TERCEIRO, status)) throw new ErroNegocio('Situação inválida.');
  for (const c of ['inicio', 'fim_prev']) if (txt(b[c]) && !isData(b[c])) throw new ErroNegocio('Data inválida.');
  const v = [Number(b.terceirizada_id), escopo, valor, pago, txt(b.inicio), txt(b.fim_prev), status, txt(b.obs)];
  if (id) {
    const r = await one('UPDATE obra_terceiros SET terceirizada_id=$1,escopo=$2,valor=$3,pago=$4,inicio=$5,fim_prev=$6,status=$7,obs=$8 WHERE id=$9 AND obra_id=$10 RETURNING id', [...v, id, obraId]);
    if (!r) throw new ErroNegocio('Contrato não encontrado.', 404);
    return id;
  }
  return (await one('INSERT INTO obra_terceiros (terceirizada_id,escopo,valor,pago,inicio,fim_prev,status,obs,obra_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id', [...v, obraId])).id;
}
export async function excluirContratoTerceiro(usuario, obraId, id) {
  if (usuario.papel !== 'admin') throw new ErroNegocio('Só a gestão faz contratos com terceirizadas.', 403);
  await query('DELETE FROM obra_terceiros WHERE id = $1 AND obra_id = $2', [id, obraId]);
}
// Obras em que a terceirizada atua
export const contratosDaTerceirizada = (id) => query(`SELECT t.*, o.nome AS obra, o.codigo FROM obra_terceiros t JOIN obras o ON o.id = t.obra_id WHERE t.terceirizada_id = $1 ORDER BY t.id DESC`, [id]);
