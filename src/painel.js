// Painéis de gestão: visão geral da empresa, "Meu dia" do engenheiro (alertas e avisos) e painel do investidor.
import { query, one } from './db.js';
import { ErroNegocio, hoje, addDias, saldos, intervaloMes } from './services.js';
import { listar as listarObras } from './obras.js';
import { serieMensal } from './societario.js';
import * as P from './patrimonio.js';

const NIVEL = { alta: 0, media: 1, info: 2 };
const diaUtil = (data) => { const d = new Date(data + 'T12:00:00Z').getUTCDay(); return d >= 1 && d <= 5; };
const fmtData = (d) => d.split('-').reverse().join('/');
const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const txt = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());

// ---------- alertas automáticos ----------
// Cada alerta diz o que aconteceu, em qual obra e o que fazer. O engenheiro só recebe os das obras dele.
export async function alertas(usuario) {
  const h = hoje(), amanha = addDias(h, 1), eng = usuario.papel === 'engenheiro', gestao = !eng;
  const obras = await query(`SELECT o.id, o.codigo, o.nome, o.status, o.orcamento_custo FROM obras o WHERE o.status IN ('planejamento','em_andamento','pausada')
    ${eng ? 'AND o.engenheiro_id IN (SELECT id FROM funcionarios WHERE usuario_id = $1)' : ''} ORDER BY o.codigo`, eng ? [usuario.id] : []);
  const ids = obras.map((o) => o.id);
  const nome = Object.fromEntries(obras.map((o) => [o.id, o]));
  const out = [];
  const add = (nivel, tipo, o, titulo, detalhe, data) => out.push({ nivel, tipo, obra_id: o.id, obra: `${o.codigo} · ${o.nome}`, titulo, detalhe: detalhe || null, data: data || null });
  if (!ids.length) return out;

  const [eventos, entregas, atrasados, fases, docs, emAndamento, comPresenca, comDiario] = await Promise.all([
    query("SELECT * FROM obra_eventos WHERE obra_id = ANY($1::bigint[]) AND status = 'agendado' AND data BETWEEN $2 AND $3 ORDER BY data, hora NULLS LAST", [ids, h, amanha]),
    query(`SELECT m.*, m.quantidade::float8 AS qtd, f.nome AS fornecedor FROM obra_materiais m LEFT JOIN fornecedores f ON f.id = m.fornecedor_id
      WHERE m.obra_id = ANY($1::bigint[]) AND m.status IN ('solicitado','pedido') AND m.entrega_prevista BETWEEN $2 AND $3 ORDER BY m.entrega_prevista`, [ids, h, amanha]),
    query(`SELECT m.*, m.quantidade::float8 AS qtd, f.nome AS fornecedor FROM obra_materiais m LEFT JOIN fornecedores f ON f.id = m.fornecedor_id
      WHERE m.obra_id = ANY($1::bigint[]) AND m.status IN ('solicitado','pedido') AND m.entrega_prevista < $2`, [ids, h]),
    query("SELECT f.*, o.status AS obra_status FROM obra_fases f JOIN obras o ON o.id = f.obra_id WHERE f.obra_id = ANY($1::bigint[]) AND f.progresso < 100 AND f.fim_prev < $2 AND o.status = 'em_andamento'", [ids, h]),
    query("SELECT * FROM obra_documentos WHERE obra_id = ANY($1::bigint[]) AND status <> 'dispensado'", [ids]),
    query("SELECT id FROM obras WHERE id = ANY($1::bigint[]) AND status = 'em_andamento'", [ids]),
    query("SELECT DISTINCT obra_id FROM obra_presencas WHERE obra_id = ANY($1::bigint[]) AND data = $2", [ids, h]),
    query("SELECT DISTINCT obra_id FROM obra_diario WHERE obra_id = ANY($1::bigint[]) AND data = $2", [ids, addDias(h, -1)]),
  ]);
  const rotuloDia = (d) => (d === h ? 'HOJE' : 'amanhã');
  for (const e of eventos) add(e.data === h && ['entrega', 'concretagem'].includes(e.tipo) ? 'alta' : 'media', 'agenda', nome[e.obra_id], `${rotuloDia(e.data)}${e.hora ? ' às ' + e.hora : ''}: ${e.titulo}`, e.detalhe, e.data);
  for (const m of entregas) add(m.entrega_prevista === h ? 'alta' : 'media', 'entrega', nome[m.obra_id], `${rotuloDia(m.entrega_prevista)}: chega ${m.qtd} ${m.unidade} de ${m.descricao}`, m.fornecedor ? `Fornecedor: ${m.fornecedor}. Confira a quantidade e a nota na descarga.` : null, m.entrega_prevista);
  for (const m of atrasados) add('alta', 'entrega_atrasada', nome[m.obra_id], `Entrega atrasada: ${m.descricao}`, `Era para ${fmtData(m.entrega_prevista)}${m.fornecedor ? ' — ' + m.fornecedor : ''}. Cobre o fornecedor.`, m.entrega_prevista);
  for (const f of fases) add('media', 'fase_atrasada', nome[f.obra_id], `Etapa atrasada: ${f.nome} (${f.progresso}%)`, `Prevista para terminar em ${fmtData(f.fim_prev)}.`, f.fim_prev);
  for (const d of docs) {
    if (d.status === 'emitido' && d.validade && d.validade < h) add('alta', 'doc_vencido', nome[d.obra_id], `Documento vencido: ${d.tipo}`, `Venceu em ${fmtData(d.validade)}. Renove e anexe o novo.`, d.validade);
    else if (d.status === 'emitido' && d.validade && d.validade <= addDias(h, 30)) add('media', 'doc_vence', nome[d.obra_id], `Documento vence logo: ${d.tipo}`, `Vence em ${fmtData(d.validade)}.`, d.validade);
    else if (['pendente', 'solicitado'].includes(d.status) && nome[d.obra_id].status === 'em_andamento' && !['HABITESE', 'AS_BUILT', 'CND_OBRA'].includes(d.tipo)) add('media', 'doc_pendente', nome[d.obra_id], `Documento ${d.status === 'solicitado' ? 'em andamento' : 'pendente'}: ${d.tipo}`, null, null);
  }
  if (diaUtil(h)) {
    const reg = new Set(comPresenca.map((r) => r.obra_id));
    for (const o of emAndamento) if (!reg.has(o.id)) add('info', 'presenca', nome[o.id], 'Presença de hoje ainda não registrada', 'Marque quem está na obra.', h);
  }
  const ontem = addDias(h, -1);
  if (diaUtil(ontem)) {
    const reg = new Set(comDiario.map((r) => r.obra_id));
    for (const o of emAndamento) if (!reg.has(o.id)) add('info', 'diario', nome[o.id], 'Diário de obra de ontem sem preenchimento', `Registre as atividades de ${fmtData(ontem)}.`, ontem);
  }
  if (gestao) {
    const [cp, md, terc, aso] = await Promise.all([
      query(`SELECT o.id, o.orcamento_custo, (SELECT COALESCE(SUM(l.valor),0) FROM lancamentos l WHERE l.obra_id = o.id AND l.tipo='saida')
          + (SELECT COALESCE(SUM(round(m.quantidade*m.valor_unit)),0) FROM obra_materiais m WHERE m.obra_id = o.id AND m.status <> 'cancelado' AND m.lancamento_id IS NULL)
          + (SELECT COALESCE(SUM(t.valor - t.pago),0) FROM obra_terceiros t WHERE t.obra_id = o.id AND t.status <> 'cancelada') AS comprometido
        FROM obras o WHERE o.id = ANY($1::bigint[]) AND o.orcamento_custo > 0`, [ids]),
      query("SELECT * FROM obra_medicoes WHERE obra_id = ANY($1::bigint[]) AND status <> 'recebida' AND data_prevista < $2 ORDER BY data_prevista", [ids, h]),
      query("SELECT * FROM terceirizadas WHERE ativo = 1 AND (certidoes_validade <= $1 OR seguro_validade <= $1)", [addDias(h, 30)]),
      query("SELECT nome, aso_validade FROM funcionarios WHERE ativo = 1 AND aso_validade IS NOT NULL AND aso_validade <= $1 ORDER BY aso_validade", [addDias(h, 30)]),
    ]);
    for (const c of cp) if (c.comprometido > c.orcamento_custo) add('alta', 'estouro', nome[c.id], 'Custo acima do orçado', `Comprometido ${brl(c.comprometido)} para um orçamento de ${brl(c.orcamento_custo)}.`, null);
    else if (c.comprometido > c.orcamento_custo * 0.9) add('media', 'estouro', nome[c.id], 'Custo chegando ao limite do orçado', `${Math.round((c.comprometido / c.orcamento_custo) * 100)}% do orçamento de custo já comprometido.`, null);
    for (const m of md) add('alta', 'medicao_atrasada', nome[m.obra_id], `Medição ${m.numero} a receber em atraso (${brl(m.valor)})`, `Previsto para ${fmtData(m.data_prevista)}. Acione a cobrança.`, m.data_prevista);
    for (const t of terc) {
      const venc = [t.certidoes_validade && t.certidoes_validade <= addDias(h, 30) && ['certidões', t.certidoes_validade], t.seguro_validade && t.seguro_validade <= addDias(h, 30) && ['seguro', t.seguro_validade]].filter(Boolean);
      for (const [rot, d] of venc) out.push({ nivel: d < h ? 'alta' : 'media', tipo: 'terceirizada', obra_id: null, obra: 'Terceirizadas', titulo: `${t.nome}: ${rot} ${d < h ? 'vencido(as)' : 'vencendo'}`, detalhe: `Validade ${fmtData(d)}. Não libere a entrada na obra sem a regularização.`, data: d });
    }
    for (const a of aso) out.push({ nivel: a.aso_validade < h ? 'alta' : 'media', tipo: 'aso', obra_id: null, obra: 'Equipe', titulo: `ASO ${a.aso_validade < h ? 'vencido' : 'vencendo'}: ${a.nome}`, detalhe: `Validade ${fmtData(a.aso_validade)}.`, data: a.aso_validade });
  }
  return out.sort((a, b) => NIVEL[a.nivel] - NIVEL[b.nivel] || String(a.data || '9').localeCompare(String(b.data || '9')));
}

// ---------- avisos manuais ----------
export async function criarAviso(usuario, b) {
  if (usuario.papel !== 'admin') throw new ErroNegocio('Só a gestão envia avisos.', 403);
  const titulo = txt(b.titulo);
  if (!titulo) throw new ErroNegocio('Escreva o aviso.');
  const prioridade = b.prioridade === 'alta' ? 'alta' : 'normal';
  const obra = b.obra_id ? Number(b.obra_id) : null;
  if (obra && !(await one('SELECT 1 AS x FROM obras WHERE id = $1', [obra]))) throw new ErroNegocio('Obra inválida.');
  const para = b.para_usuario_id ? Number(b.para_usuario_id) : null;
  if (para && !(await one('SELECT 1 AS x FROM usuarios WHERE id = $1', [para]))) throw new ErroNegocio('Destinatário inválido.');
  if (!obra && !para) throw new ErroNegocio('Escolha a obra ou a pessoa que vai receber o aviso.');
  return (await one('INSERT INTO avisos (obra_id, para_usuario_id, titulo, texto, prioridade, criado_por_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [obra, para, titulo, txt(b.texto), prioridade, usuario.id])).id;
}
export async function marcarLido(usuario, id) {
  const a = await one('SELECT * FROM avisos WHERE id = $1', [id]);
  if (!a) throw new ErroNegocio('Aviso não encontrado.', 404);
  if (usuario.papel === 'engenheiro') {
    const meu = a.para_usuario_id === usuario.id || (!a.para_usuario_id && a.obra_id && await one('SELECT 1 AS x FROM obras o JOIN funcionarios f ON f.id = o.engenheiro_id WHERE o.id = $1 AND f.usuario_id = $2', [a.obra_id, usuario.id]));
    if (!meu) throw new ErroNegocio('Este aviso não é para você.', 403);
  }
  await query("UPDATE avisos SET lido_em = (now() AT TIME ZONE 'America/Sao_Paulo') WHERE id = $1 AND lido_em IS NULL", [id]);
}
async function avisosDe(usuario) {
  const eng = usuario.papel === 'engenheiro';
  return query(`SELECT a.*, u.nome AS autor, o.nome AS obra, o.codigo FROM avisos a LEFT JOIN usuarios u ON u.id = a.criado_por_id LEFT JOIN obras o ON o.id = a.obra_id
    WHERE a.criado_em > (now() AT TIME ZONE 'America/Sao_Paulo') - interval '30 days' ${eng ? `AND (a.para_usuario_id = $1 OR (a.para_usuario_id IS NULL AND a.obra_id IN
      (SELECT o2.id FROM obras o2 JOIN funcionarios f ON f.id = o2.engenheiro_id WHERE f.usuario_id = $1)))` : ''}
    ORDER BY (a.lido_em IS NULL) DESC, a.criado_em DESC LIMIT 30`, eng ? [usuario.id] : []);
}
export async function destinatarios() {
  return query("SELECT id, nome, papel FROM usuarios WHERE ativo = 1 AND papel IN ('engenheiro','admin') ORDER BY nome");
}

// ---------- Meu dia (engenheiro) ----------
export async function meuDia(usuario) {
  const h = hoje(), amanha = addDias(h, 1);
  const [obras, al, avisos] = await Promise.all([listarObras(usuario), alertas(usuario), avisosDe(usuario)]);
  const ativas = obras.filter((o) => ['em_andamento', 'planejamento', 'pausada'].includes(o.status));
  const ids = ativas.map((o) => o.id);
  const agenda = ids.length ? await query(`SELECT e.*, o.nome AS obra, o.codigo FROM obra_eventos e JOIN obras o ON o.id = e.obra_id WHERE e.obra_id = ANY($1::bigint[]) AND e.data BETWEEN $2 AND $3 AND e.status = 'agendado' ORDER BY e.data, e.hora NULLS LAST`, [ids, h, addDias(h, 7)]) : [];
  return {
    hoje: h, amanha, usuario: { id: usuario.id, nome: usuario.nome }, obras: ativas, alertas: al, avisos, agenda,
    resumo: { obras: ativas.length, alertas_altos: al.filter((a) => a.nivel === 'alta').length, entregas_hoje: al.filter((a) => a.tipo === 'entrega' && a.data === h).length, pessoas_na_obra_hoje: ativas.reduce((a, o) => a + o.presentes_hoje, 0), avisos_novos: avisos.filter((a) => !a.lido_em).length },
  };
}

// ---------- Visão geral (gestão e sócios) ----------
export async function visao(usuario) {
  const h = hoje(), mes = h.slice(0, 7);
  const [obras, al, caixa, serie, agenda, hojeEq] = await Promise.all([
    listarObras(usuario), alertas(usuario), saldos(h), serieMensal(mes, 6),
    query(`SELECT e.*, o.nome AS obra, o.codigo FROM obra_eventos e JOIN obras o ON o.id = e.obra_id WHERE e.data BETWEEN $1 AND $2 AND e.status = 'agendado' ORDER BY e.data, e.hora NULLS LAST LIMIT 12`, [h, addDias(h, 7)]),
    one("SELECT COUNT(*) FILTER (WHERE situacao IN ('presente','atraso')) AS presentes, COUNT(DISTINCT obra_id) AS obras FROM obra_presencas WHERE data = $1", [h]),
  ]);
  const abertas = obras.filter((o) => ['em_andamento', 'planejamento', 'pausada'].includes(o.status));
  const soma = (l, k) => l.reduce((a, o) => a + (o[k] || 0), 0);
  // documentos "de fim de obra" (habite-se, as built, CND) só entram na conta quando a obra termina
  const docs = await one(`SELECT COUNT(*) FILTER (WHERE d.status IN ('pendente','solicitado')) AS pendentes,
      COUNT(*) FILTER (WHERE d.status = 'emitido' AND d.validade < $1) AS vencidos, COUNT(*) AS total
    FROM obra_documentos d JOIN obras o ON o.id = d.obra_id WHERE o.status IN ('planejamento','em_andamento','pausada') AND d.tipo NOT IN ('HABITESE','AS_BUILT','CND_OBRA')`, [h]);
  const mesAtual = intervaloMes(mes);
  const mensal = serie.at(-1);
  return {
    hoje: h,
    kpis: {
      obras_andamento: obras.filter((o) => o.status === 'em_andamento').length, obras_planejamento: obras.filter((o) => o.status === 'planejamento').length,
      obras_concluidas: obras.filter((o) => o.status === 'concluida').length, obras_pausadas: obras.filter((o) => o.status === 'pausada').length,
      carteira: soma(abertas, 'valor_contrato'), a_receber: soma(abertas, 'a_receber'), recebido: soma(obras, 'recebido'),
      custo_orcado: soma(abertas, 'orcamento_custo'), custo_comprometido: soma(abertas, 'custo_comprometido'), margem_prevista: soma(abertas, 'margem_prevista'),
      avanco_medio: abertas.filter((o) => o.status === 'em_andamento').length ? Math.round(soma(obras.filter((o) => o.status === 'em_andamento'), 'progresso') / obras.filter((o) => o.status === 'em_andamento').length) : 0,
      atrasadas: obras.filter((o) => o.ritmo?.situacao === 'atrasada').length, em_atencao: obras.filter((o) => o.ritmo?.situacao === 'atencao').length,
      pessoas_hoje: hojeEq.presentes, obras_com_equipe_hoje: hojeEq.obras,
      caixa: caixa.reduce((a, c) => a + c.saldo, 0), resultado_mes: mensal.resultado, entradas_mes: mensal.entradas, saidas_mes: mensal.saidas,
      docs_pendentes: docs.pendentes, docs_vencidos: docs.vencidos, docs_total: docs.total,
    },
    obras: obras.filter((o) => o.status !== 'cancelada'), alertas: al.slice(0, 12), alertas_total: al.length, serie, agenda,
    mes: { de: mesAtual.de, ate: mesAtual.ate },
  };
}

// ---------- Painel do investidor / sócio ----------
export async function investidor(usuario) {
  const h = hoje(), mes = h.slice(0, 7), ano = h.slice(0, 4);
  const [obras, socios, distrib, pipeline, pat, ano_fluxo, recebimentos] = await Promise.all([
    listarObras(usuario),
    query('SELECT * FROM socios WHERE ativo = 1 ORDER BY participacao_bp DESC NULLS LAST, nome'),
    query(`SELECT p.nome AS pessoa, SUM(l.valor) AS total FROM lancamentos l JOIN categorias k ON k.id = l.categoria_id JOIN pessoas p ON p.id = l.pessoa_id
      WHERE l.tipo = 'saida' AND k.nome = 'Distribuição de lucros' AND l.data >= $1 GROUP BY p.nome`, [`${ano}-01-01`]),
    query(`SELECT status, COUNT(*) AS qtd, COALESCE(SUM(valor), 0) AS total FROM orcamentos WHERE data >= $1 GROUP BY status`, [`${ano}-01-01`]),
    P.posicao(mes),
    one(`SELECT COALESCE(SUM(CASE WHEN tipo='entrada' THEN valor END),0) AS entradas, COALESCE(SUM(CASE WHEN tipo='saida' THEN valor END),0) AS saidas FROM lancamentos WHERE data >= $1`, [`${ano}-01-01`]),
    query(`SELECT to_char(data_prevista, 'YYYY-MM') AS mes, SUM(valor) AS total, COUNT(*) AS qtd FROM obra_medicoes WHERE status <> 'recebida' GROUP BY 1 ORDER BY 1`),
  ]);
  const abertas = obras.filter((o) => ['em_andamento', 'planejamento', 'pausada'].includes(o.status));
  const soma = (l, k) => l.reduce((a, o) => a + (o[k] || 0), 0);
  const carteira = soma(abertas, 'valor_contrato'), orcado = soma(abertas, 'orcamento_custo'), margem = soma(abertas, 'margem_prevista');
  const dist = Object.fromEntries(distrib.map((d) => [d.pessoa.toLowerCase(), d.total]));
  const capital = socios.reduce((a, s) => a + s.aporte, 0);
  const sal = (await saldos(h)).reduce((a, c) => a + c.saldo, 0);
  const aberto = pipeline.find((x) => x.status === 'aberto'), ganho = pipeline.find((x) => x.status === 'ganho');
  const totalDecididos = pipeline.filter((x) => ['ganho', 'perdido'].includes(x.status)).reduce((a, x) => a + x.qtd, 0);
  return {
    hoje: h, ano,
    capital: { total_aportado: capital, caixa_atual: sal, patrimonio_ativos: pat.total, patrimonio_mes_ref: pat.mes_ref },
    carteira: { contratos: carteira, custo_orcado: orcado, margem_prevista: margem, margem_pct: carteira > 0 ? Math.round((margem / carteira) * 1000) / 10 : null, retorno_sobre_custo: orcado > 0 ? Math.round((margem / orcado) * 1000) / 10 : null, a_receber: soma(abertas, 'a_receber'), recebido: soma(obras, 'recebido'), obras_ativas: abertas.length },
    socios: socios.map((s) => ({
      id: s.id, nome: s.nome, participacao: s.participacao_bp == null ? null : s.participacao_bp / 100, aporte: s.aporte, data_entrada: s.data_entrada,
      lucro_distribuido_ano: dist[s.nome.toLowerCase()] || 0,
      parte_margem_carteira: s.participacao_bp == null ? null : Math.round((margem * s.participacao_bp) / 10000),
      parte_capital_atual: s.participacao_bp == null ? null : Math.round(((sal + pat.total) * s.participacao_bp) / 10000),
    })),
    obras: abertas.map((o) => ({ id: o.id, codigo: o.codigo, nome: o.nome, status: o.status, progresso: o.progresso, valor_contrato: o.valor_contrato, custo_orcado: o.orcamento_custo, custo_comprometido: o.custo_comprometido, margem_prevista: o.margem_prevista, margem_pct: o.valor_contrato > 0 ? Math.round((o.margem_prevista / o.valor_contrato) * 1000) / 10 : null, previsao_fim: o.previsao_fim, situacao: o.ritmo?.situacao || null })),
    recebimentos, resultado_ano: { entradas: ano_fluxo.entradas, saidas: ano_fluxo.saidas, resultado: ano_fluxo.entradas - ano_fluxo.saidas },
    comercial: { em_aberto_qtd: aberto?.qtd || 0, em_aberto_valor: aberto?.total || 0, ganhos_qtd: ganho?.qtd || 0, ganhos_valor: ganho?.total || 0, taxa_conversao: totalDecididos ? Math.round(((ganho?.qtd || 0) / totalDecididos) * 100) : null },
    serie: await serieMensal(mes, 6),
  };
}
