// Documentação técnica e legal das obras (ART, RRT, alvará, habite-se...), com o profissional que emitiu e o arquivo anexado.
// O checklist por tipo de obra é uma SUGESTÃO inicial: o responsável técnico confirma o que cada obra exige.
import { query, one } from './db.js';
import { ErroNegocio, isData, hoje, addDias } from './services.js';
import { acesso } from './obras.js';

const ANEXO_MAX = 3 * 1024 * 1024; // cabe no limite de 4,5 MB do corpo da requisição na Vercel (base64 cresce ~33%)

// tipo → [rótulo, órgão/emissor usual, etapa]
export const TIPOS_DOC = {
  ART: ['ART — Anotação de Responsabilidade Técnica', 'CREA-RJ', 'inicio'],
  RRT: ['RRT — Registro de Responsabilidade Técnica', 'CAU/RJ', 'inicio'],
  CONTRATO: ['Contrato assinado com o cliente', 'Mota Construções', 'inicio'],
  MATRICULA: ['Matrícula / escritura do imóvel', 'Cartório de registro de imóveis', 'inicio'],
  PROJETO_APROVADO: ['Projeto aprovado na Prefeitura', 'Prefeitura do Rio (SMU)', 'inicio'],
  ALVARA: ['Alvará de construção / licença de obra', 'Prefeitura do Rio (SMU)', 'inicio'],
  CNO: ['CNO — Cadastro Nacional de Obras', 'Receita Federal', 'inicio'],
  PGR: ['PGR — Programa de Gerenciamento de Riscos (NR-1/NR-18)', 'Técnico de segurança', 'inicio'],
  PCMSO: ['PCMSO — Programa de Controle Médico (NR-7)', 'Médico do trabalho', 'inicio'],
  SEGURO: ['Seguro de risco de engenharia / responsabilidade civil', 'Seguradora', 'inicio'],
  BOMBEIROS: ['Aprovação do Corpo de Bombeiros (CBMERJ)', 'CBMERJ', 'durante'],
  LICENCA_AMBIENTAL: ['Licença ambiental', 'Órgão ambiental (INEA/SMAC)', 'durante'],
  AS_BUILT: ['Projeto "as built" (como construído)', 'Engenharia', 'final'],
  CND_OBRA: ['CND da obra (INSS)', 'Receita Federal', 'final'],
  HABITESE: ['Habite-se', 'Prefeitura do Rio (SMU)', 'final'],
  OUTRO: ['Outro documento', '', 'durante'],
};
const BASICOS = ['ART', 'CONTRATO', 'ALVARA', 'CNO', 'PGR', 'PCMSO', 'SEGURO'];
export const MODELO_POR_TIPO = {
  residencial: [...BASICOS, 'MATRICULA', 'PROJETO_APROVADO', 'AS_BUILT', 'CND_OBRA', 'HABITESE'],
  condominio: [...BASICOS, 'MATRICULA', 'PROJETO_APROVADO', 'LICENCA_AMBIENTAL', 'BOMBEIROS', 'AS_BUILT', 'CND_OBRA', 'HABITESE'],
  comercial: [...BASICOS, 'MATRICULA', 'PROJETO_APROVADO', 'BOMBEIROS', 'AS_BUILT', 'CND_OBRA', 'HABITESE'],
  reforma: ['ART', 'CONTRATO', 'PGR', 'SEGURO', 'ALVARA'],
  piscina: ['ART', 'CONTRATO', 'PGR', 'SEGURO'],
  fachada: ['ART', 'CONTRATO', 'ALVARA', 'PGR', 'SEGURO'],
  infraestrutura: [...BASICOS, 'LICENCA_AMBIENTAL', 'AS_BUILT'],
  outro: ['ART', 'CONTRATO', 'PGR'],
};
export const STATUS_DOC = { pendente: 'Pendente', solicitado: 'Solicitado / em andamento', emitido: 'Emitido', dispensado: 'Dispensado' };

const txt = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());

function lerAnexo(a) {
  if (!a) return null;
  const buf = Buffer.from(String(a.base64 || ''), 'base64');
  if (!buf.length) throw new ErroNegocio('Arquivo vazio.');
  if (buf.length > ANEXO_MAX) throw new ErroNegocio('O arquivo passa de 3 MB. Envie um PDF mais leve ou uma foto menor.');
  const h = buf.subarray(0, 4).toString('hex');
  const tipo = h.startsWith('25504446') ? 'application/pdf' : h.startsWith('ffd8ff') ? 'image/jpeg' : h === '89504e47' ? 'image/png' : null;
  if (!tipo) throw new ErroNegocio('Anexe um PDF, JPG ou PNG.');
  return { buf, tipo, nome: String(a.nome || 'documento').replace(/[^\w.\- ]+/g, '_').slice(0, 80) };
}

const COLS = `d.id, d.obra_id, d.tipo, d.numero, d.status, d.emitido_por_id, d.emissor_externo, d.emitido_em, d.validade, d.obs, d.anexo_nome, d.anexo_tamanho, d.atualizado_em,
  pr.nome AS emitido_por, pr.conselho, pr.registro_profissional`;

export async function gerarChecklist(usuario, obraId) {
  const o = await acesso(usuario, obraId, { escrita: true });
  const modelo = MODELO_POR_TIPO[o.tipo] || MODELO_POR_TIPO.outro;
  let criados = 0;
  for (const tipo of modelo) {
    const r = await one('INSERT INTO obra_documentos (obra_id, tipo, atualizado_por_id) VALUES ($1,$2,$3) ON CONFLICT (obra_id, tipo) DO NOTHING RETURNING id', [obraId, tipo, usuario.id]);
    if (r) criados++;
  }
  return criados;
}

// Cria/atualiza um documento da obra. Quando "emitido", exige data; ART/RRT exigem número e quem emitiu.
export async function salvarDocumento(usuario, obraId, b) {
  await acesso(usuario, obraId, { escrita: true });
  const tipo = txt(b.tipo);
  if (!tipo || !Object.hasOwn(TIPOS_DOC, tipo)) throw new ErroNegocio('Tipo de documento inválido.');
  const status = b.status || 'pendente';
  if (!Object.hasOwn(STATUS_DOC, status)) throw new ErroNegocio('Situação do documento inválida.');
  for (const c of ['emitido_em', 'validade']) if (txt(b[c]) && !isData(b[c])) throw new ErroNegocio(`Data inválida em "${c === 'validade' ? 'validade' : 'emissão'}".`);
  const emissorId = b.emitido_por_id ? Number(b.emitido_por_id) : null;
  if (emissorId && !(await one('SELECT 1 AS x FROM funcionarios WHERE id = $1', [emissorId]))) throw new ErroNegocio('Profissional inválido.');
  if (status === 'emitido') {
    if (!txt(b.emitido_em)) throw new ErroNegocio('Informe a data de emissão.');
    if (['ART', 'RRT'].includes(tipo)) {
      if (!txt(b.numero)) throw new ErroNegocio(`Informe o número da ${tipo}.`);
      if (!emissorId) throw new ErroNegocio(`Informe quem emitiu a ${tipo} (o profissional responsável).`);
    }
  }
  if (txt(b.validade) && txt(b.emitido_em) && b.validade < b.emitido_em) throw new ErroNegocio('A validade não pode ser antes da emissão.');
  const anexo = lerAnexo(b.anexo);
  const v = [txt(b.numero), status, emissorId, txt(b.emissor_externo), txt(b.emitido_em), txt(b.validade), txt(b.obs), usuario.id];
  const r = await one(`INSERT INTO obra_documentos (obra_id, tipo, numero, status, emitido_por_id, emissor_externo, emitido_em, validade, obs, atualizado_por_id)
    VALUES ($9,$10,$1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (obra_id, tipo) DO UPDATE SET numero=EXCLUDED.numero, status=EXCLUDED.status, emitido_por_id=EXCLUDED.emitido_por_id, emissor_externo=EXCLUDED.emissor_externo,
      emitido_em=EXCLUDED.emitido_em, validade=EXCLUDED.validade, obs=EXCLUDED.obs, atualizado_por_id=EXCLUDED.atualizado_por_id, atualizado_em=(now() AT TIME ZONE 'America/Sao_Paulo')
    RETURNING id`, [...v, obraId, tipo]);
  if (anexo) await query('UPDATE obra_documentos SET anexo_nome=$1, anexo_tipo=$2, anexo_tamanho=$3, anexo=$4 WHERE id=$5', [anexo.nome, anexo.tipo, anexo.buf.length, anexo.buf, r.id]);
  return r.id;
}

export async function removerAnexo(usuario, docId) {
  const d = await one('SELECT obra_id FROM obra_documentos WHERE id = $1', [docId]);
  if (!d) throw new ErroNegocio('Documento não encontrado.', 404);
  await acesso(usuario, d.obra_id, { escrita: true });
  await query('UPDATE obra_documentos SET anexo_nome=NULL, anexo_tipo=NULL, anexo_tamanho=NULL, anexo=NULL WHERE id=$1', [docId]);
}

export async function excluirDocumento(usuario, docId) {
  const d = await one('SELECT obra_id FROM obra_documentos WHERE id = $1', [docId]);
  if (!d) throw new ErroNegocio('Documento não encontrado.', 404);
  await acesso(usuario, d.obra_id, { escrita: true });
  await query('DELETE FROM obra_documentos WHERE id = $1', [docId]);
}

export async function lerAnexoDocumento(usuario, docId) {
  const r = await one('SELECT obra_id, anexo, anexo_nome, anexo_tipo FROM obra_documentos WHERE id = $1', [docId]);
  if (!r) throw new ErroNegocio('Documento não encontrado.', 404);
  await acesso(usuario, r.obra_id);
  if (!r.anexo) throw new ErroNegocio('Este documento não tem arquivo anexado.', 404);
  return { buf: Buffer.from(r.anexo), nome: r.anexo_nome, tipo: r.anexo_tipo };
}

// Situação de um documento hoje: ok, vence logo, vencido, pendente
export function situacaoDoc(d, h = hoje()) {
  if (d.status === 'dispensado') return 'dispensado';
  if (d.status !== 'emitido') return 'pendente';
  if (d.validade && d.validade < h) return 'vencido';
  if (d.validade && d.validade <= addDias(h, 30)) return 'vence_logo';
  return 'ok';
}

// Painel de conformidade: todas as obras × documentos
export async function conformidade(usuario) {
  const h = hoje();
  const w = [], p = [];
  if (usuario.papel === 'engenheiro') { p.push(usuario.id); w.push('AND o.engenheiro_id IN (SELECT id FROM funcionarios WHERE usuario_id = $1)'); }
  const obras = await query(`SELECT o.id, o.codigo, o.nome, o.status, o.tipo, e.nome AS engenheiro FROM obras o LEFT JOIN funcionarios e ON e.id = o.engenheiro_id
    WHERE o.status IN ('planejamento','em_andamento','pausada') ${w.join(' ')} ORDER BY o.codigo`, p);
  const docs = await query(`SELECT ${COLS} FROM obra_documentos d LEFT JOIN funcionarios pr ON pr.id = d.emitido_por_id
    WHERE d.obra_id = ANY($1::bigint[]) ORDER BY d.id`, [obras.map((o) => o.id)]);
  const por = {};
  for (const d of docs) (por[d.obra_id] ??= []).push({ ...d, situacao: situacaoDoc(d, h) });
  // documentos de fim de obra (habite-se, as built, CND) só pesam nos números quando a obra termina
  const FIM = ['HABITESE', 'AS_BUILT', 'CND_OBRA'];
  const todos = docs.filter((d) => !(FIM.includes(d.tipo) && d.status !== 'emitido')).map((d) => situacaoDoc(d, h));
  const conta = (s) => todos.filter((x) => x === s).length;
  return {
    hoje: h, tipos: Object.fromEntries(Object.entries(TIPOS_DOC).map(([k, [r, org, et]]) => [k, { rotulo: r, orgao: org, etapa: et }])), status: STATUS_DOC,
    resumo: { total: todos.length, ok: conta('ok') + conta('dispensado'), pendentes: conta('pendente'), vencidos: conta('vencido'), vencem_logo: conta('vence_logo') },
    obras: obras.map((o) => ({ ...o, documentos: por[o.id] || [] })),
  };
}
