// Obras: cadastro, fases (cronograma), equipe e presença, diário, agenda e medições.
// Valores em centavos; datas em YYYY-MM-DD (America/Sao_Paulo).
import { query, one, tx } from './db.js';
import { ErroNegocio, isData, isMes, hoje, addDias, intervaloMes } from './services.js';
import { indicadoresDe } from './indicadores.js';
import { listarAditivos } from './contratos.js';

export const TIPOS = { residencial: 'Residencial', condominio: 'Condomínio', comercial: 'Comercial', reforma: 'Reforma', piscina: 'Piscina e lazer', fachada: 'Fachada', infraestrutura: 'Infraestrutura', outro: 'Outro' };
export const STATUS = { planejamento: 'Planejamento', em_andamento: 'Em andamento', pausada: 'Pausada', concluida: 'Concluída', cancelada: 'Cancelada' };
export const SITUACOES_PRESENCA = { presente: 'Presente', falta: 'Falta', atestado: 'Atestado', atraso: 'Atraso', folga: 'Folga' };
export const TIPOS_EVENTO = { entrega: 'Entrega de material', concretagem: 'Concretagem', vistoria: 'Vistoria', reuniao: 'Reunião', medicao: 'Medição', entrega_cliente: 'Entrega ao cliente', outro: 'Outro' };
export const STATUS_MEDICAO = { prevista: 'Prevista', faturada: 'Faturada', recebida: 'Recebida' };

// Modelos de etapas por tipo de obra: [nome, peso]. A gestão ajusta depois na tela.
const BASE = {
  residencial: [['Canteiro e serviços preliminares', 4], ['Fundação', 10], ['Estrutura', 18], ['Alvenaria', 12], ['Cobertura', 8], ['Instalações elétricas e hidráulicas', 12], ['Reboco e contrapiso', 8], ['Esquadrias', 5], ['Acabamentos', 15], ['Limpeza e entrega', 3]],
  condominio: [['Canteiro e mobilização', 3], ['Terraplenagem', 10], ['Drenagem e pavimentação', 18], ['Redes de água e esgoto', 14], ['Rede elétrica e iluminação', 14], ['Áreas comuns e paisagismo', 20], ['Fachadas e portaria', 15], ['Vistoria e entrega', 6]],
  comercial: [['Canteiro e preliminares', 4], ['Fundação', 10], ['Estrutura', 22], ['Vedações', 12], ['Instalações', 18], ['Revestimentos', 12], ['Acabamentos', 16], ['Entrega e habite-se', 6]],
  reforma: [['Demolições e preparação', 10], ['Instalações', 20], ['Alvenaria e regularização', 20], ['Revestimentos', 20], ['Acabamentos e pintura', 22], ['Limpeza e entrega', 8]],
  piscina: [['Locação e escavação', 15], ['Estrutura e armação', 25], ['Hidráulica e casa de máquinas', 20], ['Revestimento', 20], ['Enchimento e testes', 10], ['Paisagismo e entrega', 10]],
  fachada: [['Montagem de andaime', 10], ['Preparo da superfície', 25], ['Revestimento / pintura', 40], ['Instalações complementares (LED, iluminação)', 15], ['Desmontagem e limpeza', 10]],
  infraestrutura: [['Mobilização', 5], ['Serviços topográficos', 10], ['Escavação e terraplenagem', 25], ['Drenagem', 20], ['Pavimentação', 30], ['Sinalização e entrega', 10]],
};
BASE.outro = BASE.reforma;
export const FASES_MODELO = BASE;

const txt = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());
const dias = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);
const pct = (n) => Math.max(0, Math.min(100, Math.round(n)));

// ---------- acesso ----------
// Gestão (admin) vê e edita tudo. Engenheiro só vê e edita as obras sob sua responsabilidade.
// Sócio, leitor, operador e financeiro só consultam. O engenheiro não enxerga valores de contrato nem margem.
export async function idsFuncionarioDoUsuario(usuario) {
  return (await query('SELECT id FROM funcionarios WHERE usuario_id = $1', [usuario.id])).map((r) => r.id);
}
export async function acesso(usuario, obraId, { escrita = false } = {}) {
  const o = await one('SELECT * FROM obras WHERE id = $1', [obraId]);
  if (!o) throw new ErroNegocio('Obra não encontrada.', 404);
  if (usuario.papel === 'admin') return o;
  if (usuario.papel === 'engenheiro') {
    const meus = await idsFuncionarioDoUsuario(usuario);
    if (!meus.includes(o.engenheiro_id)) throw new ErroNegocio('Esta obra não está sob sua responsabilidade.', 403);
    return o;
  }
  if (escrita) throw new ErroNegocio('Seu perfil só consulta as obras.', 403);
  return o;
}
const soGestao = (usuario) => { if (usuario.papel !== 'admin') throw new ErroNegocio('Só a gestão pode fazer esta alteração.', 403); };

// ---------- cálculo de avanço ----------
export function ritmo(o, progresso, h = hoje()) {
  if (o.status !== 'em_andamento' || !o.data_inicio || !o.previsao_fim) return null;
  const total = Math.max(1, dias(o.data_inicio, o.previsao_fim));
  const esperado = pct((dias(o.data_inicio, h) / total) * 100);
  const desvio = Math.round(progresso - esperado);
  let situacao = desvio >= -8 ? 'no_prazo' : desvio >= -20 ? 'atencao' : 'atrasada';
  if (o.previsao_fim < h) situacao = 'atrasada';
  return { esperado, desvio, situacao, dias_restantes: dias(h, o.previsao_fim) };
}

const SELECT_OBRA = `
  SELECT o.*, c.nome AS cliente, c.telefone AS cliente_telefone, e.nome AS engenheiro, m.nome AS mestre,
    COALESCE((SELECT SUM(f.progresso * f.peso)::float8 / NULLIF(SUM(f.peso), 0) FROM obra_fases f WHERE f.obra_id = o.id), 0) AS progresso,
    (SELECT f.nome FROM obra_fases f WHERE f.obra_id = o.id AND f.progresso < 100 ORDER BY f.ordem, f.id LIMIT 1) AS fase_atual,
    (SELECT COUNT(*) FROM obra_fases f WHERE f.obra_id = o.id AND f.progresso < 100 AND f.fim_prev < $1) AS fases_atrasadas,
    (SELECT COALESCE(SUM(l.valor), 0) FROM lancamentos l WHERE l.obra_id = o.id AND l.tipo = 'saida') AS custo_pago,
    (SELECT COALESCE(SUM(round(mt.quantidade * mt.valor_unit)), 0) FROM obra_materiais mt WHERE mt.obra_id = o.id AND mt.status NOT IN ('cancelado','recusado','aguardando_aprovacao') AND mt.lancamento_id IS NULL) AS material_a_pagar,
    (SELECT COALESCE(SUM(t.valor - t.pago), 0) FROM obra_terceiros t WHERE t.obra_id = o.id AND t.status <> 'cancelada') AS terceiros_a_pagar,
    (SELECT COALESCE(SUM(md.valor), 0) FROM obra_medicoes md WHERE md.obra_id = o.id AND md.status = 'recebida') AS recebido,
    (SELECT COALESCE(SUM(md.valor), 0) FROM obra_medicoes md WHERE md.obra_id = o.id AND md.status <> 'recebida') AS a_receber,
    (SELECT COUNT(*) FROM obra_equipe q WHERE q.obra_id = o.id AND (q.ate IS NULL OR q.ate >= $1)) AS equipe_total,
    (SELECT COUNT(*) FROM obra_presencas p WHERE p.obra_id = o.id AND p.data = $1 AND p.situacao IN ('presente','atraso')) AS presentes_hoje,
    (SELECT COUNT(*) FROM obra_documentos d WHERE d.obra_id = o.id AND d.status IN ('pendente','solicitado') AND d.tipo NOT IN ('HABITESE','AS_BUILT','CND_OBRA')) AS docs_pendentes,
    (SELECT COUNT(*) FROM obra_documentos d WHERE d.obra_id = o.id AND d.status = 'emitido' AND d.validade IS NOT NULL AND d.validade < $1) AS docs_vencidos,
    (SELECT COUNT(*) FROM obra_documentos d WHERE d.obra_id = o.id AND d.tipo NOT IN ('HABITESE','AS_BUILT','CND_OBRA')) AS docs_total,
    (SELECT COUNT(*) FROM obra_documentos d WHERE d.obra_id = o.id AND d.status IN ('emitido','dispensado') AND d.tipo NOT IN ('HABITESE','AS_BUILT','CND_OBRA')) AS docs_ok
  FROM obras o
  LEFT JOIN clientes c ON c.id = o.cliente_id
  LEFT JOIN funcionarios e ON e.id = o.engenheiro_id
  LEFT JOIN funcionarios m ON m.id = o.mestre_id`;

function montar(o, usuario, h) {
  const progresso = Math.round(o.progresso);
  const custo_comprometido = o.custo_pago + o.material_a_pagar + o.terceiros_a_pagar;
  const r = {
    ...o, progresso, ritmo: ritmo(o, progresso, h),
    custo_comprometido, margem_prevista: o.valor_contrato - Math.max(o.orcamento_custo, custo_comprometido),
    desempenho: o.status === 'em_andamento' ? indicadoresDe({ esperado: ritmo(o, progresso, h)?.esperado ?? 0, progresso, orcamento_custo: o.orcamento_custo, custo: custo_comprometido }) : null,
    estouro: o.orcamento_custo > 0 && custo_comprometido > o.orcamento_custo,
  };
  if (usuario?.papel === 'engenheiro') { r.valor_contrato = null; r.recebido = null; r.a_receber = null; r.margem_prevista = null; }
  return r;
}

export async function listar(usuario, { status } = {}) {
  const h = hoje();
  const w = [], p = [h];
  if (status) { p.push(status); w.push(`o.status = $${p.length}`); }
  if (usuario.papel === 'engenheiro') { p.push(usuario.id); w.push(`o.engenheiro_id IN (SELECT id FROM funcionarios WHERE usuario_id = $${p.length})`); }
  const l = await query(`${SELECT_OBRA} ${w.length ? 'WHERE ' + w.join(' AND ') : ''}
    ORDER BY CASE o.status WHEN 'em_andamento' THEN 0 WHEN 'planejamento' THEN 1 WHEN 'pausada' THEN 2 WHEN 'concluida' THEN 3 ELSE 4 END, o.previsao_fim NULLS LAST, o.id`, p);
  return l.map((o) => montar(o, usuario, h));
}

export async function opcoes() {
  const [engenheiros, funcionarios, clientes] = await Promise.all([
    query("SELECT id, nome, funcao_obra, conselho, registro_profissional FROM funcionarios WHERE ativo = 1 AND funcao_obra IN ('engenheiro','arquiteto') ORDER BY nome"),
    query("SELECT id, nome, funcao_obra, regime, vinculo FROM funcionarios WHERE ativo = 1 AND grupo = 'funcionario' ORDER BY nome"),
    query('SELECT id, nome FROM clientes ORDER BY lower(nome) LIMIT 500'),
  ]);
  return { tipos: TIPOS, status: STATUS, engenheiros, funcionarios, clientes, presencas: SITUACOES_PRESENCA, tipos_evento: TIPOS_EVENTO, status_medicao: STATUS_MEDICAO };
}

// ---------- detalhe ----------
export async function detalhe(usuario, id) {
  await acesso(usuario, id);
  const h = hoje();
  const base = montar(await one(`${SELECT_OBRA} WHERE o.id = $2`, [h, id]), usuario, h);
  const [fases, equipe, terceiros, materiais, documentos, diario, eventos, medicoes, financeiro, lancamentos, avisos, aditivos] = await Promise.all([
    query('SELECT * FROM obra_fases WHERE obra_id = $1 ORDER BY ordem, id', [id]),
    query(`SELECT q.id, q.funcionario_id, q.funcao, q.desde, q.ate, f.nome, f.funcao_obra, f.regime, f.vinculo, f.telefone, f.valor_diaria,
        p.situacao AS situacao_hoje
      FROM obra_equipe q JOIN funcionarios f ON f.id = q.funcionario_id
      LEFT JOIN obra_presencas p ON p.obra_id = q.obra_id AND p.funcionario_id = q.funcionario_id AND p.data = $2
      WHERE q.obra_id = $1 ORDER BY (q.ate IS NOT NULL AND q.ate < $2), f.nome`, [id, h]),
    query('SELECT t.*, x.nome AS terceirizada, x.especialidade, x.telefone FROM obra_terceiros t JOIN terceirizadas x ON x.id = t.terceirizada_id WHERE t.obra_id = $1 ORDER BY t.id', [id]),
    query(`SELECT m.*, f.nome AS fornecedor, fs.nome AS fase, round(m.quantidade * m.valor_unit)::bigint AS total, m.quantidade::float8 AS quantidade
      FROM obra_materiais m LEFT JOIN fornecedores f ON f.id = m.fornecedor_id LEFT JOIN obra_fases fs ON fs.id = m.fase_id WHERE m.obra_id = $1 ORDER BY m.data_pedido DESC, m.id DESC`, [id]),
    query(`SELECT d.id, d.obra_id, d.tipo, d.numero, d.status, d.emitido_por_id, d.emissor_externo, d.emitido_em, d.validade, d.obs, d.anexo_nome, d.anexo_tamanho, d.atualizado_em,
        pr.nome AS emitido_por, pr.conselho, pr.registro_profissional
      FROM obra_documentos d LEFT JOIN funcionarios pr ON pr.id = d.emitido_por_id WHERE d.obra_id = $1 ORDER BY d.id`, [id]),
    query('SELECT d.*, u.nome AS autor FROM obra_diario d LEFT JOIN usuarios u ON u.id = d.autor_id WHERE d.obra_id = $1 ORDER BY d.data DESC LIMIT 20', [id]),
    query("SELECT * FROM obra_eventos WHERE obra_id = $1 AND data >= $2 ORDER BY data, hora NULLS LAST, id", [id, addDias(h, -7)]),
    usuario.papel === 'engenheiro' ? [] : query('SELECT * FROM obra_medicoes WHERE obra_id = $1 ORDER BY numero', [id]),
    query(`SELECT cat.grupo, cat.nome AS categoria, SUM(l.valor) AS valor FROM lancamentos l JOIN categorias cat ON cat.id = l.categoria_id
      WHERE l.obra_id = $1 AND l.tipo = 'saida' GROUP BY cat.grupo, cat.nome ORDER BY valor DESC`, [id]),
    usuario.papel === 'engenheiro' ? [] : query(`SELECT l.id, l.data, l.tipo, l.valor, l.descricao, cat.nome AS categoria, c.nome AS conta
      FROM lancamentos l JOIN contas c ON c.id = l.conta_id LEFT JOIN categorias cat ON cat.id = l.categoria_id WHERE l.obra_id = $1 ORDER BY l.data DESC, l.id DESC LIMIT 40`, [id]),
    query('SELECT a.*, u.nome AS autor FROM avisos a LEFT JOIN usuarios u ON u.id = a.criado_por_id WHERE a.obra_id = $1 ORDER BY a.criado_em DESC LIMIT 10', [id]),
    usuario.papel === 'engenheiro' ? [] : listarAditivos(id),
  ]);
  return {
    obra: base, fases: fases.map((f) => ({ ...f, atrasada: f.progresso < 100 && !!f.fim_prev && f.fim_prev < h, em_andamento: f.progresso > 0 && f.progresso < 100 })),
    equipe, terceiros, materiais, documentos, diario, eventos, medicoes, lancamentos, avisos, aditivos,
    financeiro: { por_categoria: financeiro, total_pago: base.custo_pago },
    hoje: h,
  };
}

// ---------- cadastro da obra ----------
function lerObra(b) {
  const nome = txt(b.nome);
  if (!nome) throw new ErroNegocio('Informe o nome da obra.');
  if (!Object.hasOwn(TIPOS, b.tipo || 'residencial')) throw new ErroNegocio('Tipo de obra inválido.');
  const status = b.status || 'planejamento';
  if (!Object.hasOwn(STATUS, status)) throw new ErroNegocio('Situação da obra inválida.');
  for (const c of ['data_inicio', 'previsao_fim', 'fim_real']) if (txt(b[c]) && !isData(b[c])) throw new ErroNegocio(`Data inválida em "${c.replace(/_/g, ' ')}".`);
  if (txt(b.data_inicio) && txt(b.previsao_fim) && b.previsao_fim < b.data_inicio) throw new ErroNegocio('A previsão de término não pode ser antes do início.');
  const cent = (v, rot) => { const n = v == null || v === '' ? 0 : Math.round(Number(v)); if (!Number.isFinite(n) || n < 0) throw new ErroNegocio(`${rot} inválido.`); return n; };
  const area = b.area_m2 == null || b.area_m2 === '' ? null : Number(b.area_m2);
  if (area != null && !(area >= 0)) throw new ErroNegocio('Área inválida.');
  const pav = b.pavimentos == null || b.pavimentos === '' ? null : Number(b.pavimentos);
  if (pav != null && !Number.isInteger(pav)) throw new ErroNegocio('Número de pavimentos inválido.');
  const uf = (txt(b.uf) || 'RJ').toUpperCase().slice(0, 2);
  return {
    nome, tipo: b.tipo || 'residencial', status, endereco: txt(b.endereco), bairro: txt(b.bairro), cidade: txt(b.cidade) || 'Rio de Janeiro', uf, cep: txt(b.cep),
    area_m2: area, pavimentos: pav, data_inicio: txt(b.data_inicio), previsao_fim: txt(b.previsao_fim), fim_real: txt(b.fim_real),
    valor_contrato: cent(b.valor_contrato, 'Valor do contrato'), orcamento_custo: cent(b.orcamento_custo, 'Orçamento de custo'),
    cliente_id: b.cliente_id ? Number(b.cliente_id) : null, orcamento_id: b.orcamento_id ? Number(b.orcamento_id) : null,
    engenheiro_id: b.engenheiro_id ? Number(b.engenheiro_id) : null, mestre_id: b.mestre_id ? Number(b.mestre_id) : null, descricao: txt(b.descricao),
  };
}
const CAMPOS_OBRA = ['nome', 'tipo', 'status', 'endereco', 'bairro', 'cidade', 'uf', 'cep', 'area_m2', 'pavimentos', 'data_inicio', 'previsao_fim', 'fim_real', 'valor_contrato', 'orcamento_custo', 'cliente_id', 'orcamento_id', 'engenheiro_id', 'mestre_id', 'descricao'];

async function proximoCodigo(ano) {
  const r = await one("SELECT COUNT(*) AS n FROM obras WHERE codigo LIKE $1", [`MC-${ano}-%`]);
  let n = r.n + 1, codigo;
  do { codigo = `MC-${ano}-${String(n++).padStart(3, '0')}`; } while (await one('SELECT 1 AS x FROM obras WHERE codigo = $1', [codigo]));
  return codigo;
}

export async function salvar(usuario, id, b) {
  soGestao(usuario);
  const o = lerObra(b);
  if (id) {
    const r = await one(`UPDATE obras SET ${CAMPOS_OBRA.map((c, i) => `${c}=$${i + 1}`).join(',')} WHERE id=$${CAMPOS_OBRA.length + 1} RETURNING id`, [...CAMPOS_OBRA.map((c) => o[c]), id]);
    if (!r) throw new ErroNegocio('Obra não encontrada.', 404);
    return id;
  }
  return tx(async () => {
    await query('SELECT pg_advisory_xact_lock(724530)');
    const codigo = await proximoCodigo((o.data_inicio || hoje()).slice(0, 4));
    const r = await one(`INSERT INTO obras (codigo, ${CAMPOS_OBRA.join(',')}, criado_por_id) VALUES ($1, ${CAMPOS_OBRA.map((_, i) => '$' + (i + 2)).join(',')}, $${CAMPOS_OBRA.length + 2}) RETURNING id`,
      [codigo, ...CAMPOS_OBRA.map((c) => o[c]), usuario.id]);
    return r.id;
  });
}

export async function excluir(usuario, id) {
  soGestao(usuario);
  const o = await one('SELECT status FROM obras WHERE id = $1', [id]);
  if (!o) throw new ErroNegocio('Obra não encontrada.', 404);
  const mov = await one('SELECT (SELECT COUNT(*) FROM lancamentos WHERE obra_id = $1) + (SELECT COUNT(*) FROM estoque_movimentos WHERE obra_id = $1) AS n', [id]);
  if (mov.n > 0) throw new ErroNegocio('Esta obra já tem lançamentos no caixa ou no almoxarifado. Em vez de excluir, marque como Cancelada ou Concluída.', 409);
  await query('DELETE FROM obras WHERE id = $1', [id]);
}

// ---------- fases ----------
export async function gerarFasesModelo(usuario, obraId) {
  soGestao(usuario);
  const o = await one('SELECT * FROM obras WHERE id = $1', [obraId]);
  if (!o) throw new ErroNegocio('Obra não encontrada.', 404);
  if ((await one('SELECT COUNT(*) AS n FROM obra_fases WHERE obra_id = $1', [obraId])).n) throw new ErroNegocio('Esta obra já tem etapas cadastradas.', 409);
  const modelo = BASE[o.tipo] || BASE.reforma;
  const somaPeso = modelo.reduce((a, [, p]) => a + p, 0);
  const total = o.data_inicio && o.previsao_fim ? Math.max(modelo.length, dias(o.data_inicio, o.previsao_fim)) : null;
  let acum = 0;
  await tx(async () => {
    for (const [i, [nome, peso]] of modelo.entries()) {
      let ini = null, fim = null;
      if (total) { ini = addDias(o.data_inicio, Math.round((acum / somaPeso) * total)); acum += peso; fim = addDias(o.data_inicio, Math.max(0, Math.round((acum / somaPeso) * total) - 1)); }
      await query('INSERT INTO obra_fases (obra_id, ordem, nome, peso, inicio_prev, fim_prev) VALUES ($1,$2,$3,$4,$5,$6)', [obraId, i + 1, nome, peso, ini, fim]);
    }
  });
}

// Guarda o avanço da obra do dia (alimenta a curva S)
async function registrarAvanco(obraId) {
  const r = await one('SELECT COALESCE(SUM(progresso * peso)::float8 / NULLIF(SUM(peso), 0), 0) AS p FROM obra_fases WHERE obra_id = $1', [obraId]);
  await query(`INSERT INTO obra_avancos (obra_id, data, progresso) VALUES ($1,$2,$3) ON CONFLICT (obra_id, data) DO UPDATE SET progresso = EXCLUDED.progresso`, [obraId, hoje(), Math.round(r.p)]);
}

export async function salvarFase(usuario, obraId, faseId, b) {
  const o = await acesso(usuario, obraId, { escrita: true });
  for (const c of ['inicio_prev', 'fim_prev', 'inicio_real', 'fim_real']) if (txt(b[c]) && !isData(b[c])) throw new ErroNegocio(`Data inválida em "${c.replace(/_/g, ' ')}".`);
  const progresso = b.progresso == null || b.progresso === '' ? 0 : Math.round(Number(b.progresso));
  if (!Number.isFinite(progresso) || progresso < 0 || progresso > 100) throw new ErroNegocio('O avanço deve estar entre 0% e 100%.');
  if (faseId) {
    const atual = await one('SELECT * FROM obra_fases WHERE id = $1 AND obra_id = $2', [faseId, obraId]);
    if (!atual) throw new ErroNegocio('Etapa não encontrada.', 404);
    let inicioReal = txt(b.inicio_real) ?? atual.inicio_real, fimReal = txt(b.fim_real) ?? atual.fim_real;
    if (progresso > 0 && !inicioReal) inicioReal = hoje();
    if (progresso === 100 && !fimReal) fimReal = hoje();
    if (progresso < 100) fimReal = null;
    // o engenheiro só atualiza o andamento; nome, peso e prazos previstos são da gestão
    const gestao = usuario.papel === 'admin';
    const custoOrc = b.custo_orcado == null || b.custo_orcado === '' ? atual.custo_orcado : Math.round(Number(b.custo_orcado));
    if (!Number.isFinite(custoOrc) || custoOrc < 0) throw new ErroNegocio('Custo orçado da etapa inválido.');
    await query(`UPDATE obra_fases SET progresso=$1, inicio_real=$2, fim_real=$3, obs=$4${gestao ? ', nome=$6, peso=$7, inicio_prev=$8, fim_prev=$9, ordem=$10, custo_orcado=$11' : ''} WHERE id=$5`,
      gestao ? [progresso, inicioReal, fimReal, txt(b.obs) ?? atual.obs, faseId, txt(b.nome) || atual.nome, Number(b.peso) > 0 ? Math.round(Number(b.peso)) : atual.peso, txt(b.inicio_prev) ?? atual.inicio_prev, txt(b.fim_prev) ?? atual.fim_prev, Number.isInteger(Number(b.ordem)) && b.ordem !== '' ? Number(b.ordem) : atual.ordem, custoOrc]
        : [progresso, inicioReal, fimReal, txt(b.obs) ?? atual.obs, faseId]);
    await registrarAvanco(obraId);
    // obra com avanço > 0 e ainda em planejamento passa a "em andamento"
    if (o.status === 'planejamento' && progresso > 0) await query("UPDATE obras SET status='em_andamento', data_inicio=COALESCE(data_inicio,$2) WHERE id=$1", [obraId, hoje()]);
    return faseId;
  }
  soGestao(usuario);
  if (!txt(b.nome)) throw new ErroNegocio('Informe o nome da etapa.');
  const ordem = (await one('SELECT COALESCE(MAX(ordem),0)+1 AS n FROM obra_fases WHERE obra_id = $1', [obraId])).n;
  const custoOrc = b.custo_orcado == null || b.custo_orcado === '' ? 0 : Math.round(Number(b.custo_orcado));
  if (!Number.isFinite(custoOrc) || custoOrc < 0) throw new ErroNegocio('Custo orçado da etapa inválido.');
  const novo = (await one('INSERT INTO obra_fases (obra_id, ordem, nome, peso, inicio_prev, fim_prev, progresso, custo_orcado) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
    [obraId, ordem, txt(b.nome), Number(b.peso) > 0 ? Math.round(Number(b.peso)) : 10, txt(b.inicio_prev), txt(b.fim_prev), progresso, custoOrc])).id;
  await registrarAvanco(obraId);
  return novo;
}
export async function excluirFase(usuario, obraId, faseId) {
  soGestao(usuario);
  await query('DELETE FROM obra_fases WHERE id = $1 AND obra_id = $2', [faseId, obraId]);
  await registrarAvanco(obraId);
}
export async function fasesDaObra(usuario, obraId) {
  await acesso(usuario, obraId);
  return query('SELECT id, ordem, nome, progresso, custo_orcado FROM obra_fases WHERE obra_id = $1 ORDER BY ordem, id', [obraId]);
}

// ---------- equipe e presença ----------
export async function alocar(usuario, obraId, b) {
  soGestao(usuario);
  const f = await one('SELECT id, funcao_obra FROM funcionarios WHERE id = $1 AND ativo = 1', [Number(b.funcionario_id)]);
  if (!f) throw new ErroNegocio('Escolha uma pessoa do cadastro de funcionários.');
  await acesso(usuario, obraId);
  try {
    await query('INSERT INTO obra_equipe (obra_id, funcionario_id, funcao, desde) VALUES ($1,$2,$3,$4)', [obraId, f.id, txt(b.funcao) || f.funcao_obra, txt(b.desde) || hoje()]);
  } catch (e) {
    if (e.code === '23505') throw new ErroNegocio('Esta pessoa já está na equipe da obra.', 409);
    throw e;
  }
}
export async function desalocar(usuario, obraId, funcionarioId) {
  soGestao(usuario);
  await query('UPDATE obra_equipe SET ate = $3 WHERE obra_id = $1 AND funcionario_id = $2 AND ate IS NULL', [obraId, funcionarioId, hoje()]);
}

export async function presencasDoDia(usuario, obraId, data) {
  await acesso(usuario, obraId);
  if (!isData(data)) throw new ErroNegocio('Data inválida.');
  return query(`SELECT q.funcionario_id, f.nome, COALESCE(q.funcao, f.funcao_obra) AS funcao, p.situacao, p.horas::float8 AS horas
    FROM obra_equipe q JOIN funcionarios f ON f.id = q.funcionario_id
    LEFT JOIN obra_presencas p ON p.obra_id = q.obra_id AND p.funcionario_id = q.funcionario_id AND p.data = $2
    WHERE q.obra_id = $1 AND (q.desde IS NULL OR q.desde <= $2) AND (q.ate IS NULL OR q.ate >= $2) ORDER BY f.nome`, [obraId, data]);
}

export async function registrarPresenca(usuario, obraId, b) {
  await acesso(usuario, obraId, { escrita: true });
  if (!isData(b.data)) throw new ErroNegocio('Data inválida.');
  if (b.data > hoje()) throw new ErroNegocio('Não dá para registrar presença em data futura.');
  const regs = Array.isArray(b.registros) ? b.registros : [];
  if (!regs.length) throw new ErroNegocio('Marque a presença de pelo menos uma pessoa.');
  await tx(async () => {
    for (const r of regs) {
      if (!Object.hasOwn(SITUACOES_PRESENCA, r.situacao)) throw new ErroNegocio('Situação de presença inválida.');
      const horas = r.horas == null || r.horas === '' ? null : Number(r.horas);
      if (horas != null && !(horas >= 0 && horas <= 24)) throw new ErroNegocio('Horas inválidas.');
      const membro = await one('SELECT 1 AS x FROM obra_equipe WHERE obra_id = $1 AND funcionario_id = $2', [obraId, Number(r.funcionario_id)]);
      if (!membro) throw new ErroNegocio('Há uma pessoa que não pertence à equipe desta obra.');
      await query(`INSERT INTO obra_presencas (obra_id, funcionario_id, data, situacao, horas, registrado_por_id) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (obra_id, funcionario_id, data) DO UPDATE SET situacao = EXCLUDED.situacao, horas = EXCLUDED.horas, registrado_por_id = EXCLUDED.registrado_por_id`,
        [obraId, Number(r.funcionario_id), b.data, r.situacao, horas, usuario.id]);
    }
  });
}

// ---------- diário de obra ----------
export async function salvarDiario(usuario, obraId, b) {
  await acesso(usuario, obraId, { escrita: true });
  if (!isData(b.data)) throw new ErroNegocio('Data inválida.');
  if (b.data > hoje()) throw new ErroNegocio('O diário não pode ser de uma data futura.');
  const atividades = txt(b.atividades);
  if (!atividades) throw new ErroNegocio('Descreva as atividades do dia.');
  const efetivo = b.efetivo == null || b.efetivo === '' ? null : Number(b.efetivo);
  if (efetivo != null && (!Number.isInteger(efetivo) || efetivo < 0)) throw new ErroNegocio('Efetivo inválido.');
  await query(`INSERT INTO obra_diario (obra_id, data, clima, efetivo, atividades, ocorrencias, autor_id) VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (obra_id, data) DO UPDATE SET clima = EXCLUDED.clima, efetivo = EXCLUDED.efetivo, atividades = EXCLUDED.atividades, ocorrencias = EXCLUDED.ocorrencias, autor_id = EXCLUDED.autor_id`,
    [obraId, b.data, txt(b.clima), efetivo, atividades, txt(b.ocorrencias), usuario.id]);
}

// ---------- agenda ----------
export async function salvarEvento(usuario, obraId, eventoId, b) {
  await acesso(usuario, obraId, { escrita: true });
  if (!isData(b.data)) throw new ErroNegocio('Data inválida.');
  if (!txt(b.titulo)) throw new ErroNegocio('Informe o que vai acontecer (ex.: chegada do caminhão de cimento).');
  const tipo = b.tipo || 'outro';
  if (!Object.hasOwn(TIPOS_EVENTO, tipo)) throw new ErroNegocio('Tipo de compromisso inválido.');
  const hora = txt(b.hora);
  if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new ErroNegocio('Horário inválido (use HH:MM).');
  const status = b.status || 'agendado';
  if (!['agendado', 'concluido', 'cancelado'].includes(status)) throw new ErroNegocio('Situação inválida.');
  if (eventoId) {
    const r = await one('UPDATE obra_eventos SET data=$1, hora=$2, tipo=$3, titulo=$4, detalhe=$5, status=$6 WHERE id=$7 AND obra_id=$8 RETURNING id', [b.data, hora, tipo, txt(b.titulo), txt(b.detalhe), status, eventoId, obraId]);
    if (!r) throw new ErroNegocio('Compromisso não encontrado.', 404);
    return eventoId;
  }
  return (await one('INSERT INTO obra_eventos (obra_id, data, hora, tipo, titulo, detalhe, status, criado_por_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [obraId, b.data, hora, tipo, txt(b.titulo), txt(b.detalhe), status, usuario.id])).id;
}
export async function excluirEvento(usuario, obraId, eventoId) {
  await acesso(usuario, obraId, { escrita: true });
  await query('DELETE FROM obra_eventos WHERE id = $1 AND obra_id = $2', [eventoId, obraId]);
}

// Agenda do mês (todas as obras visíveis para a pessoa)
export async function agendaMes(usuario, mes) {
  if (!isMes(mes)) throw new ErroNegocio('Mês inválido.');
  const { de, ate } = intervaloMes(mes);
  const w = [], p = [de, ate];
  if (usuario.papel === 'engenheiro') { p.push(usuario.id); w.push(`AND o.engenheiro_id IN (SELECT id FROM funcionarios WHERE usuario_id = $3)`); }
  const eventos = await query(`SELECT e.*, o.nome AS obra, o.codigo FROM obra_eventos e JOIN obras o ON o.id = e.obra_id WHERE e.data BETWEEN $1 AND $2 ${w.join(' ')} ORDER BY e.data, e.hora NULLS LAST, e.id`, p);
  const fases = await query(`SELECT f.id, f.nome, f.fim_prev AS data, o.id AS obra_id, o.nome AS obra, o.codigo FROM obra_fases f JOIN obras o ON o.id = f.obra_id
    WHERE f.fim_prev BETWEEN $1 AND $2 AND f.progresso < 100 AND o.status IN ('em_andamento','planejamento') ${w.join(' ')} ORDER BY f.fim_prev`, p);
  const mats = await query(`SELECT m.id, m.descricao, m.entrega_prevista AS data, o.id AS obra_id, o.nome AS obra, o.codigo, f.nome AS fornecedor FROM obra_materiais m JOIN obras o ON o.id = m.obra_id
    LEFT JOIN fornecedores f ON f.id = m.fornecedor_id WHERE m.entrega_prevista BETWEEN $1 AND $2 AND m.status IN ('solicitado','pedido') ${w.join(' ')} ORDER BY m.entrega_prevista`, p);
  const meds = usuario.papel === 'engenheiro' ? [] : await query(`SELECT md.id, md.numero, md.valor, md.data_prevista AS data, md.status, o.id AS obra_id, o.nome AS obra, o.codigo FROM obra_medicoes md JOIN obras o ON o.id = md.obra_id
    WHERE md.data_prevista BETWEEN $1 AND $2 AND md.status <> 'recebida' ORDER BY md.data_prevista`, [de, ate]);
  return { mes, eventos, fases, materiais: mats, medicoes: meds, hoje: hoje() };
}

// ---------- medições (a receber) ----------
export async function salvarMedicao(usuario, obraId, medId, b) {
  soGestao(usuario);
  await acesso(usuario, obraId);
  if (!isData(b.data_prevista)) throw new ErroNegocio('Informe a data prevista de recebimento.');
  const valor = Math.round(Number(b.valor));
  if (!Number.isFinite(valor) || valor <= 0) throw new ErroNegocio('Valor da medição deve ser maior que zero.');
  const status = b.status || 'prevista';
  if (!Object.hasOwn(STATUS_MEDICAO, status) || status === 'recebida') throw new ErroNegocio('Use "Receber" para registrar o recebimento.');
  if (medId) {
    const r = await one('UPDATE obra_medicoes SET descricao=$1, data_prevista=$2, valor=$3, status=$4 WHERE id=$5 AND obra_id=$6 AND status <> \'recebida\' RETURNING id', [txt(b.descricao), b.data_prevista, valor, status, medId, obraId]);
    if (!r) throw new ErroNegocio('Medição não encontrada ou já recebida.', 404);
    return medId;
  }
  const numero = (await one('SELECT COALESCE(MAX(numero),0)+1 AS n FROM obra_medicoes WHERE obra_id = $1', [obraId])).n;
  return (await one('INSERT INTO obra_medicoes (obra_id, numero, descricao, data_prevista, valor, status) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [obraId, numero, txt(b.descricao), b.data_prevista, valor, status])).id;
}

// Recebimento de uma medição: lança a ENTRADA no caixa, ligada à obra, e marca a medição como recebida.
export async function receberMedicao(usuario, medId, b, criarLancamento) {
  soGestao(usuario);
  return tx(async () => {
    const m = await one('SELECT * FROM obra_medicoes WHERE id = $1', [medId]);
    if (!m) throw new ErroNegocio('Medição não encontrada.', 404);
    if (m.status === 'recebida') throw new ErroNegocio('Esta medição já foi recebida.', 409);
    const data = b.data || hoje();
    if (!isData(data)) throw new ErroNegocio('Data inválida.');
    const cat = await one("SELECT id FROM categorias WHERE nome = 'Medição recebida'");
    const obra = await one('SELECT codigo, nome FROM obras WHERE id = $1', [m.obra_id]);
    const l = await criarLancamento({ data, tipo: 'entrada', valor: m.valor, conta_id: b.conta_id, categoria_id: cat?.id, obra_id: m.obra_id,
      descricao: `Medição ${m.numero} — ${obra.codigo} ${obra.nome}`, criado_por: usuario.nome, criado_por_id: usuario.id });
    await query("UPDATE obra_medicoes SET status='recebida', recebido_em=$1, lancamento_id=$2 WHERE id=$3", [data, l.id, medId]);
    return l;
  });
}

// Orçamento ganho vira obra: leva cliente e valor, e a gestão completa o restante (engenheiro, prazos, endereço).
export async function criarDeOrcamento(usuario, orcamentoId, b = {}) {
  soGestao(usuario);
  const o = await one(`SELECT o.*, c.nome AS cliente, p.nome AS produto FROM orcamentos o JOIN clientes c ON c.id = o.cliente_id LEFT JOIN produtos_catalogo p ON p.id = o.produto_id WHERE o.id = $1`, [orcamentoId]);
  if (!o) throw new ErroNegocio('Orçamento não encontrado.', 404);
  if (o.status !== 'ganho') throw new ErroNegocio('Só um orçamento ganho (aprovado) vira obra.', 409);
  if (await one('SELECT 1 AS x FROM obras WHERE orcamento_id = $1', [orcamentoId])) throw new ErroNegocio('Este orçamento já virou obra.', 409);
  const nome = txt(b.nome) || `${o.produto_desc || o.produto || 'Obra'} — ${o.cliente}`;
  return salvar(usuario, null, { ...b, nome, cliente_id: o.cliente_id, orcamento_id: o.id, valor_contrato: b.valor_contrato ?? o.valor, status: 'planejamento', tipo: b.tipo || 'residencial' });
}
