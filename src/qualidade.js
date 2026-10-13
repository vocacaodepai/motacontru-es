// Qualidade e segurança: pendências de acabamento (vistoria de entrega) e segurança do trabalho (EPI, treinamentos e inspeções de obra).
import { query, one, tx } from './db.js';
import { ErroNegocio, isData, hoje, addDias } from './services.js';
import { acesso } from './obras.js';

const txt = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());
const soGestao = (u) => { if (u.papel !== 'admin') throw new ErroNegocio('Só a gestão faz esta alteração.', 403); };

// ---------- pendências ----------
export const STATUS_PENDENCIA = { aberta: 'Aberta', em_correcao: 'Em correção', resolvida: 'Resolvida' };

export async function listarPendencias(usuario, obraId) {
  await acesso(usuario, obraId);
  return query(`SELECT p.*, u.nome AS criado_por FROM obra_pendencias p LEFT JOIN usuarios u ON u.id = p.criado_por_id WHERE p.obra_id = $1
    ORDER BY (p.status = 'resolvida'), p.prazo NULLS LAST, p.id`, [obraId]);
}
export async function salvarPendencia(usuario, obraId, id, b) {
  await acesso(usuario, obraId, { escrita: true });
  const descricao = txt(b.descricao);
  if (!descricao) throw new ErroNegocio('Descreva a pendência (ex.: pintura da sala com mancha).');
  const status = b.status || 'aberta';
  if (!STATUS_PENDENCIA[status]) throw new ErroNegocio('Situação inválida.');
  if (txt(b.prazo) && !isData(b.prazo)) throw new ErroNegocio('Prazo inválido.');
  const resolvida = status === 'resolvida' ? hoje() : null;
  if (id) {
    const r = await one('UPDATE obra_pendencias SET local=$1, descricao=$2, responsavel=$3, prazo=$4, status=$5, resolvida_em=CASE WHEN $5 = \'resolvida\' THEN COALESCE(resolvida_em, $6::date) ELSE NULL END WHERE id=$7 AND obra_id=$8 RETURNING id',
      [txt(b.local), descricao, txt(b.responsavel), txt(b.prazo), status, resolvida, id, obraId]);
    if (!r) throw new ErroNegocio('Pendência não encontrada.', 404);
    return id;
  }
  return (await one('INSERT INTO obra_pendencias (obra_id, local, descricao, responsavel, prazo, status, resolvida_em, criado_por_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
    [obraId, txt(b.local), descricao, txt(b.responsavel), txt(b.prazo), status, resolvida, usuario.id])).id;
}
export async function excluirPendencia(usuario, obraId, id) {
  await acesso(usuario, obraId, { escrita: true });
  await query('DELETE FROM obra_pendencias WHERE id = $1 AND obra_id = $2', [id, obraId]);
}

// ---------- segurança do trabalho ----------
export const TREINAMENTOS_SUGERIDOS = ['NR-18 — Integração de segurança (obra)', 'NR-35 — Trabalho em altura', 'NR-10 — Segurança em instalações elétricas', 'NR-33 — Espaço confinado', 'NR-12 — Máquinas e equipamentos', 'NR-6 — Uso de EPI', 'Operador de equipamento (retroescavadeira, munck…)', 'Primeiros socorros', 'CIPA / brigada de incêndio'];
export const CHECKLIST_INSPECAO = [
  'Todos usam os EPIs necessários (capacete, bota, luva, óculos)', 'Proteção de periferia e guarda-corpo instalados', 'Escadas, rampas e passarelas firmes e livres', 'Instalações elétricas protegidas e quadros fechados',
  'Extintores no local, sinalizados e dentro da validade', 'Andaimes inspecionados e liberados para uso', 'Sinalização de segurança e isolamento das áreas de risco', 'Canteiro organizado e limpo',
  'Água potável, sanitários e área de vivência em ordem', 'Materiais armazenados e empilhados com segurança', 'Máquinas e ferramentas com proteções e em bom estado', 'Aberturas no piso e fossos cobertos',
];

// Pessoas que o usuário pode ver na segurança: gestão vê todas; engenheiro, só quem está nas obras dele
async function pessoasVisiveis(usuario) {
  if (usuario.papel === 'admin') return query("SELECT id, nome, funcao_obra FROM funcionarios WHERE ativo = 1 AND grupo = 'funcionario' AND EXISTS (SELECT 1 FROM obra_equipe q WHERE q.funcionario_id = funcionarios.id AND (q.ate IS NULL OR q.ate >= $1)) ORDER BY nome", [hoje()]);
  return query(`SELECT DISTINCT f.id, f.nome, f.funcao_obra FROM funcionarios f JOIN obra_equipe q ON q.funcionario_id = f.id JOIN obras o ON o.id = q.obra_id
    WHERE f.ativo = 1 AND (q.ate IS NULL OR q.ate >= $2) AND o.engenheiro_id IN (SELECT id FROM funcionarios WHERE usuario_id = $1) ORDER BY f.nome`, [usuario.id, hoje()]);
}
async function exigirPessoa(usuario, funcionarioId) {
  if (!(await pessoasVisiveis(usuario)).some((p) => p.id === Number(funcionarioId))) throw new ErroNegocio('Esta pessoa não está nas suas obras.', 403);
}

export async function painelSeguranca(usuario) {
  const h = hoje(), em30 = addDias(h, 30);
  const pessoas = await pessoasVisiveis(usuario), ids = pessoas.map((p) => p.id);
  const [trein, epi, obras, insp] = await Promise.all([
    query('SELECT t.*, u.nome AS registrado_por FROM treinamentos t LEFT JOIN usuarios u ON u.id = t.criado_por_id WHERE t.funcionario_id = ANY($1::bigint[]) ORDER BY t.data DESC, t.id DESC', [ids]),
    query('SELECT e.*, u.nome AS registrado_por FROM epi_entregas e LEFT JOIN usuarios u ON u.id = e.criado_por_id WHERE e.funcionario_id = ANY($1::bigint[]) ORDER BY e.data DESC, e.id DESC', [ids]),
    query(`SELECT o.id, o.codigo, o.nome FROM obras o WHERE o.status = 'em_andamento' ${usuario.papel === 'admin' ? '' : 'AND o.engenheiro_id IN (SELECT id FROM funcionarios WHERE usuario_id = $1)'} ORDER BY o.codigo`, usuario.papel === 'admin' ? [] : [usuario.id]),
    query(`SELECT DISTINCT ON (i.obra_id) i.obra_id, i.data, i.conformes, i.total FROM inspecoes_seguranca i ORDER BY i.obra_id, i.data DESC, i.id DESC`),
  ]);
  const situ = (v) => (!v ? 'ok' : v < h ? 'vencido' : v <= em30 ? 'vence_logo' : 'ok');
  // vale o treinamento mais recente de cada tipo
  const recente = {};
  for (const t of trein) { const k = `${t.funcionario_id}|${t.tipo}`; if (!recente[k]) recente[k] = t; }
  const porPessoa = pessoas.map((p) => {
    const ts = Object.values(recente).filter((t) => t.funcionario_id === p.id).map((t) => ({ ...t, situacao: situ(t.validade) }));
    const es = epi.filter((e) => e.funcionario_id === p.id).slice(0, 8).map((e) => ({ ...e, situacao: situ(e.validade) }));
    const semIntegracao = !ts.some((t) => /NR-18/i.test(t.tipo));
    return { ...p, treinamentos: ts, epi: es, sem_integracao: semIntegracao, vencidos: ts.filter((t) => t.situacao === 'vencido').length + es.filter((e) => e.situacao === 'vencido').length, vencem: ts.filter((t) => t.situacao === 'vence_logo').length + es.filter((e) => e.situacao === 'vence_logo').length };
  });
  const porObra = obras.map((o) => { const i = insp.find((x) => x.obra_id === o.id); return { ...o, ultima: i?.data ?? null, conformes: i?.conformes ?? null, total: i?.total ?? null, atrasada: !i || i.data < addDias(h, -7) }; });
  return {
    hoje: h, pessoas: porPessoa, obras: porObra, tipos: TREINAMENTOS_SUGERIDOS, checklist: CHECKLIST_INSPECAO,
    resumo: { pessoas: pessoas.length, vencidos: porPessoa.reduce((a, p) => a + p.vencidos, 0), vencem: porPessoa.reduce((a, p) => a + p.vencem, 0), sem_integracao: porPessoa.filter((p) => p.sem_integracao).length, inspecoes_atrasadas: porObra.filter((o) => o.atrasada).length },
  };
}

export async function registrarTreinamento(usuario, b) {
  await exigirPessoa(usuario, b.funcionario_id);
  const tipo = txt(b.tipo);
  if (!tipo) throw new ErroNegocio('Informe o treinamento (ex.: NR-35).');
  if (!isData(b.data) || b.data > hoje()) throw new ErroNegocio('Data do treinamento inválida.');
  if (txt(b.validade) && (!isData(b.validade) || b.validade < b.data)) throw new ErroNegocio('Validade inválida.');
  const ch = b.carga_horaria == null || b.carga_horaria === '' ? null : Number(b.carga_horaria);
  if (ch != null && (!Number.isInteger(ch) || ch < 0 || ch > 400)) throw new ErroNegocio('Carga horária inválida.');
  return (await one('INSERT INTO treinamentos (funcionario_id, tipo, data, validade, carga_horaria, obs, criado_por_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id', [Number(b.funcionario_id), tipo, b.data, txt(b.validade), ch, txt(b.obs), usuario.id])).id;
}
export async function registrarEpi(usuario, b) {
  await exigirPessoa(usuario, b.funcionario_id);
  const item = txt(b.item);
  if (!item) throw new ErroNegocio('Informe o EPI entregue (ex.: capacete, bota, cinto).');
  if (!isData(b.data) || b.data > hoje()) throw new ErroNegocio('Data da entrega inválida.');
  if (txt(b.validade) && (!isData(b.validade) || b.validade < b.data)) throw new ErroNegocio('Validade inválida.');
  return (await one('INSERT INTO epi_entregas (funcionario_id, item, ca, data, validade, obs, criado_por_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id', [Number(b.funcionario_id), item, txt(b.ca), b.data, txt(b.validade), txt(b.obs), usuario.id])).id;
}
export async function excluirRegistroSeguranca(usuario, tabela, id) {
  const t = { treinamentos: 'treinamentos', epi: 'epi_entregas' }[tabela];
  if (!t) throw new ErroNegocio('Registro inválido.', 404);
  const r = await one(`SELECT funcionario_id FROM ${t} WHERE id = $1`, [id]);
  if (!r) throw new ErroNegocio('Registro não encontrado.', 404);
  await exigirPessoa(usuario, r.funcionario_id);
  await query(`DELETE FROM ${t} WHERE id = $1`, [id]);
}

export async function registrarInspecao(usuario, obraId, b) {
  await acesso(usuario, obraId, { escrita: true });
  const data = b.data || hoje();
  if (!isData(data) || data > hoje()) throw new ErroNegocio('Data da inspeção inválida.');
  const itens = Array.isArray(b.itens) ? b.itens : [];
  if (!itens.length) throw new ErroNegocio('Marque os itens da inspeção.');
  const limpos = itens.map((i) => ({ item: String(i.item || '').slice(0, 160), ok: i.ok === true })).filter((i) => i.item);
  const conformes = limpos.filter((i) => i.ok).length;
  if (conformes < limpos.length && !txt(b.observacoes)) throw new ErroNegocio('Há item não conforme: descreva a providência nas observações.');
  return (await one('INSERT INTO inspecoes_seguranca (obra_id, data, itens, conformes, total, observacoes, responsavel_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [obraId, data, JSON.stringify(limpos), conformes, limpos.length, txt(b.observacoes), usuario.id])).id;
}
export async function listarInspecoes(usuario, obraId) {
  await acesso(usuario, obraId);
  return (await query('SELECT i.*, u.nome AS responsavel FROM inspecoes_seguranca i LEFT JOIN usuarios u ON u.id = i.responsavel_id WHERE i.obra_id = $1 ORDER BY i.data DESC, i.id DESC LIMIT 20', [obraId])).map((i) => ({ ...i, itens: JSON.parse(i.itens) }));
}
