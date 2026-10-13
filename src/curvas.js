// Indicadores de obra: curva S (previsto × realizado), custos por etapa e fluxo de caixa projetado.
import { query, one } from './db.js';
import { ErroNegocio, hoje, addDias, saldos, intervaloMes } from './services.js';
import { acesso } from './obras.js';
import { indicadoresDe } from './indicadores.js';
export { indicadoresDe };

const dias = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);
const clamp = (n, a = 0, b = 100) => Math.max(a, Math.min(b, n));

// Quanto da obra deveria estar pronto em cada data, pelo cronograma das etapas (ponderado pelo peso)
export function previstoEm(fases, data) {
  const total = fases.reduce((a, f) => a + f.peso, 0);
  if (!total) return 0;
  let acc = 0;
  for (const f of fases) {
    if (!f.inicio_prev || !f.fim_prev) continue;
    const dur = Math.max(1, dias(f.inicio_prev, f.fim_prev) + 1);
    acc += f.peso * clamp(((dias(f.inicio_prev, data) + 1) / dur) * 100) / 100;
  }
  return Math.round((acc / total) * 1000) / 10;
}

// Curva S: planejado (cronograma) × realizado (histórico de avanço) × custo acumulado (% do orçamento de custo)
export async function curvaS(usuario, obraId) {
  const o = await acesso(usuario, obraId);
  const [fases, avancos, custos] = await Promise.all([
    query('SELECT peso, inicio_prev, fim_prev, progresso FROM obra_fases WHERE obra_id = $1', [obraId]),
    query('SELECT data, progresso FROM obra_avancos WHERE obra_id = $1 ORDER BY data', [obraId]),
    query("SELECT data, SUM(valor) AS valor FROM lancamentos WHERE obra_id = $1 AND tipo = 'saida' GROUP BY data ORDER BY data", [obraId]),
  ]);
  const h = hoje();
  const datasFase = fases.flatMap((f) => [f.inicio_prev, f.fim_prev]).filter(Boolean).sort();
  const ini = o.data_inicio || datasFase[0], fim = [o.previsao_fim, datasFase.at(-1), h].filter(Boolean).sort().at(-1);
  if (!ini || !fim || fim <= ini) return { vazio: true, motivo: 'Defina o início da obra e as datas das etapas para ver a curva S.' };
  const passo = Math.max(1, Math.ceil(dias(ini, fim) / 60));
  const pontos = [];
  for (let d = ini; d < fim; d = addDias(d, passo)) pontos.push(d);
  pontos.push(fim);
  const pesoTotal = fases.reduce((a, f) => a + f.peso, 0);
  const atual = pesoTotal ? Math.round(fases.reduce((a, f) => a + f.progresso * f.peso, 0) / pesoTotal) : 0;
  if (!avancos.length || avancos.at(-1).data < h) avancos.push({ data: h, progresso: atual }); // o ponto de hoje é sempre o avanço atual
  const real = (d) => { if (d > h) return null; let v = 0; for (const a of avancos) if (a.data <= d) v = a.progresso; return v; };
  let acum = 0, i = 0;
  const custoEm = (d) => { while (i < custos.length && custos[i].data <= d) acum += custos[i++].valor; return acum; };
  const orc = o.orcamento_custo;
  const serie = pontos.map((d) => ({ data: d, planejado: previstoEm(fases, d), realizado: d <= h ? real(d) : null, custo: d <= h && orc > 0 ? Math.round((custoEm(d) / orc) * 1000) / 10 : null }));
  const esperado = previstoEm(fases, h) || 0;
  const pagoTotal = custos.reduce((a, c) => a + c.valor, 0);
  return { vazio: false, hoje: h, serie, orcamento_custo: orc, custo_pago: pagoTotal, indicadores: indicadoresDe({ esperado, progresso: atual, orcamento_custo: orc, custo: pagoTotal }) };
}

// Orçado × realizado por etapa (o que foi para cada fase; o resto fica em "sem etapa")
export async function custosPorEtapa(usuario, obraId) {
  await acesso(usuario, obraId);
  const [fases, pago, aPagar, semEtapa, semEtapaAPagar] = await Promise.all([
    query('SELECT id, ordem, nome, custo_orcado, progresso FROM obra_fases WHERE obra_id = $1 ORDER BY ordem, id', [obraId]),
    query("SELECT fase_id, SUM(valor) AS v FROM lancamentos WHERE obra_id = $1 AND tipo = 'saida' AND fase_id IS NOT NULL GROUP BY fase_id", [obraId]),
    query("SELECT fase_id, SUM(round(quantidade * valor_unit)) AS v FROM obra_materiais WHERE obra_id = $1 AND status NOT IN ('cancelado','recusado','aguardando_aprovacao') AND lancamento_id IS NULL AND fase_id IS NOT NULL GROUP BY fase_id", [obraId]),
    one("SELECT COALESCE(SUM(valor),0) AS v FROM lancamentos WHERE obra_id = $1 AND tipo = 'saida' AND fase_id IS NULL", [obraId]),
    one("SELECT COALESCE(SUM(round(quantidade * valor_unit)),0) AS v FROM obra_materiais WHERE obra_id = $1 AND status NOT IN ('cancelado','recusado','aguardando_aprovacao') AND lancamento_id IS NULL AND fase_id IS NULL", [obraId]),
  ]);
  const p = Object.fromEntries(pago.map((x) => [x.fase_id, x.v])), a = Object.fromEntries(aPagar.map((x) => [x.fase_id, x.v]));
  const linhas = fases.map((f) => { const real = (p[f.id] || 0) + (a[f.id] || 0); return { ...f, pago: p[f.id] || 0, a_pagar: a[f.id] || 0, realizado: real, desvio: f.custo_orcado ? real - f.custo_orcado : null, estouro: f.custo_orcado > 0 && real > f.custo_orcado }; });
  return { etapas: linhas, sem_etapa: semEtapa.v + semEtapaAPagar.v, orcado_etapas: linhas.reduce((x, f) => x + f.custo_orcado, 0), realizado_etapas: linhas.reduce((x, f) => x + f.realizado, 0) };
}

// Fluxo de caixa projetado (13 semanas): saldo de hoje + o que entra (medições) − o que sai (materiais, terceirizadas, custos de campo, despesas gerais, recorrências).
// É uma PROJEÇÃO GERENCIAL com premissas simples, mostradas na tela; não é garantia de caixa.
export async function fluxoProjetado() {
  const h = hoje(), SEMANAS = 13;
  const inicioSemana = (d) => { const dt = new Date(d + 'T12:00:00Z'); const dow = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - dow); return dt.toISOString().slice(0, 10); };
  const s0 = inicioSemana(h);
  const idx = (d) => (d < h ? 0 : Math.min(SEMANAS - 1, Math.floor(dias(s0, d) / 7)));
  const semanas = Array.from({ length: SEMANAS }, (_, i) => ({ inicio: addDias(s0, i * 7), entradas: 0, medicoes: 0, materiais: 0, terceiros: 0, campo: 0, gerais: 0, recorrencias: 0 }));
  const limite = addDias(s0, SEMANAS * 7);
  const [sal, meds, mats, terc, rec, campoMedia, gerais] = await Promise.all([
    saldos(h),
    query("SELECT valor, data_prevista FROM obra_medicoes WHERE status <> 'recebida' AND data_prevista < $1", [limite]),
    query(`SELECT m.status, m.entrega_prevista, m.entregue_em, m.data_pedido, round(m.quantidade * m.valor_unit)::bigint AS total FROM obra_materiais m JOIN obras o ON o.id = m.obra_id
      WHERE m.lancamento_id IS NULL AND m.status IN ('solicitado','pedido','entregue','aplicado') AND o.status <> 'cancelada'`),
    query("SELECT t.valor - t.pago AS falta, t.fim_prev FROM obra_terceiros t WHERE t.status IN ('contratada','em_execucao') AND t.valor > t.pago"),
    query('SELECT valor, dia_mes FROM recorrencias WHERE ativo = 1 AND tipo = \'saida\' AND valor IS NOT NULL'),
    one(`SELECT COALESCE(SUM(l.valor),0) AS v FROM lancamentos l JOIN categorias c ON c.id = l.categoria_id JOIN obras o ON o.id = l.obra_id
      WHERE l.tipo = 'saida' AND c.grupo IN ('Mão de obra','Equipamentos','Segurança') AND o.status = 'em_andamento' AND l.data > $1 AND l.data <= $2`, [addDias(h, -56), h]),
    one(`SELECT COALESCE(SUM(valor),0) AS v FROM lancamentos WHERE tipo = 'saida' AND obra_id IS NULL AND categoria_id IN (SELECT id FROM categorias WHERE grupo IN ('Administrativo','Tributos'))
      AND data > $1 AND data <= $2`, [addDias(h, -90), h]),
  ]);
  const emAndamento = (await one("SELECT COUNT(*) AS n FROM obras WHERE status = 'em_andamento'")).n;
  for (const m of meds) { semanas[idx(m.data_prevista < h ? addDias(h, 7) : m.data_prevista)].medicoes += m.valor; } // atrasada: assume recebimento na semana que vem
  for (const m of mats) {
    const base = m.status === 'pedido' || m.status === 'solicitado' ? (m.entrega_prevista || h) : (m.entregue_em || m.data_pedido || h);
    const pagar = addDias(base, 30); // prazo de pagamento padrão do fornecedor (premissa)
    if (pagar < limite) semanas[idx(pagar)].materiais += m.total;
  }
  for (const t of terc) {
    const fim = t.fim_prev && t.fim_prev > h ? t.fim_prev : addDias(h, 21), n = Math.max(1, Math.min(SEMANAS, Math.ceil(dias(h, fim) / 7)));
    for (let i = 0; i < n; i++) semanas[i].terceiros += Math.round(t.falta / n);
  }
  const campoSemana = emAndamento ? Math.round(campoMedia.v / 8) : 0, geraisSemana = Math.round(gerais.v / (90 / 7));
  semanas.forEach((s) => { s.campo = campoSemana; s.gerais = geraisSemana; });
  for (let i = 0; i < SEMANAS; i++) for (const r of rec) { const dia = new Date(semanas[i].inicio + 'T12:00:00Z'); for (let k = 0; k < 7; k++) { const d = new Date(dia); d.setUTCDate(d.getUTCDate() + k); if (d.getUTCDate() === r.dia_mes && d.toISOString().slice(0, 10) >= h) semanas[i].recorrencias += r.valor; } }
  let saldo = sal.reduce((a, c) => a + c.saldo, 0);
  const saldoHoje = saldo;
  for (const s of semanas) {
    s.entradas = s.medicoes;
    s.saidas = s.materiais + s.terceiros + s.campo + s.gerais + s.recorrencias;
    saldo += s.entradas - s.saidas; s.saldo = saldo;
  }
  const pior = semanas.reduce((a, s) => (s.saldo < a.saldo ? s : a), semanas[0]);
  return { hoje: h, saldo_hoje: saldoHoje, semanas, pior_semana: { inicio: pior.inicio, saldo: pior.saldo }, fica_negativo: semanas.some((s) => s.saldo < 0),
    premissas: ['Medições entram na data prevista (as atrasadas, na semana que vem).', 'Materiais a pagar saem 30 dias após a entrega.', 'Terceirizadas: o saldo do contrato é diluído até o fim previsto.',
      `Custos de campo (mão de obra, equipamentos, segurança) seguem a média das últimas 8 semanas das ${emAndamento} obra(s) em andamento.`, 'Despesas gerais (escritório, contabilidade, impostos) seguem a média dos últimos 90 dias.', 'Recorrências cadastradas entram no dia do mês.'] };
}
