// Histórico de alterações: quem mudou o quê e quando. Registra toda ação de escrita que deu certo.
// Só guarda um resumo legível (nunca senhas, fotos ou arquivos).
import { query } from './db.js';
import { ErroNegocio, isData } from './services.js';

const SUBSTANTIVO = {
  obras: 'obra', fases: 'etapa', equipe: 'pessoa na equipe', presenca: 'presença', diario: 'diário de obra', eventos: 'compromisso', medicoes: 'medição',
  terceiros: 'contrato de terceirizada', materiais: 'material', documentos: 'documento', fotos: 'foto', aditivos: 'aditivo de contrato', pendencias: 'pendência',
  cotacoes: 'cotação', lancamentos: 'lançamento', usuarios: 'usuário', fornecedores: 'fornecedor', terceirizadas: 'empresa terceirizada', avisos: 'aviso',
  contas: 'conta', categorias: 'categoria', pessoas: 'pessoa', recorrencias: 'recorrência', patrimonio: 'item de patrimônio', socios: 'sócio',
  clientes: 'cliente', orcamentos: 'orçamento', funcionarios: 'funcionário', ausencias: 'ausência', campanhas: 'campanha', dias: 'números de campanha',
  itens: 'item de estoque', movimentos: 'movimentação de estoque', extratos: 'extrato', epi: 'entrega de EPI', treinamentos: 'treinamento', inspecoes: 'inspeção de segurança',
  folha: 'folha de diárias', marca: 'marca', logo: 'logo', config: 'configuração', cliente: 'acesso de cliente', nota: 'comentário do relatório', acessos: 'acesso',
};
const ACOES = { pagar: 'Pagou', receber: 'Recebeu', status: 'Mudou a situação de', lido: 'Marcou como lido o', checklist: 'Gerou o checklist de', modelo: 'Gerou etapas sugeridas de', fechar: 'Fechou o dia —',
  adiar: 'Adiou o follow-up de', contato: 'Registrou contato em', 'followup-enviado': 'Confirmou follow-up de', anexo: 'Anexou arquivo em', arquivo: 'Removeu o arquivo de', lancar: 'Lançou', aprovar: 'Aprovou', recusar: 'Recusou', vencedora: 'Escolheu a vencedora da', importar: 'Importou' };
const CAMPOS = ['nome', 'titulo', 'descricao', 'status', 'tipo', 'data', 'quantidade', 'progresso', 'situacao', 'escopo', 'numero', 'legenda'];
const DINHEIRO = ['valor', 'valor_contrato', 'valor_unit', 'orcamento_custo', 'valor_delta', 'pago'];
const brl = (c) => (Number(c) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function descrever(metodo, caminho, corpo = {}) {
  const partes = caminho.split('?')[0].split('/').filter(Boolean).slice(1); // sem "api"
  const obraIdx = partes.indexOf('obras');
  const obraId = obraIdx >= 0 && /^\d+$/.test(partes[obraIdx + 1] || '') ? Number(partes[obraIdx + 1]) : (Number(corpo?.obra_id) || null);
  const nomes = partes.filter((p) => !/^\d+$/.test(p) && !/^\d{4}-\d{2}/.test(p));
  const ultimo = nomes.at(-1) || '';
  let acao;
  if (ACOES[ultimo]) {
    const base = nomes.at(-2);
    acao = `${ACOES[ultimo]} ${ultimo === 'fechar' ? '' : SUBSTANTIVO[base] || base || ''}`.trim();
  } else {
    const verbo = metodo === 'POST' ? 'Criou' : metodo === 'PUT' ? 'Alterou' : metodo === 'DELETE' ? 'Excluiu' : metodo;
    acao = `${verbo} ${SUBSTANTIVO[ultimo] || ultimo}`;
  }
  const detalhe = [];
  for (const k of CAMPOS) if (corpo?.[k] != null && typeof corpo[k] !== 'object' && String(corpo[k]).trim() !== '') detalhe.push(`${k}: ${String(corpo[k]).slice(0, 80)}`);
  for (const k of DINHEIRO) if (Number.isFinite(Number(corpo?.[k])) && corpo[k] !== '' && corpo[k] !== null) detalhe.push(`${k}: ${brl(corpo[k])}`);
  return { acao: acao.charAt(0).toUpperCase() + acao.slice(1), obraId, detalhe: detalhe.slice(0, 5).join(' · ') || null };
}

export async function registrar(req) {
  const u = req.usuario;
  if (!u) return;
  const d = descrever(req.method, req.originalUrl, req.body);
  await query('INSERT INTO auditoria (usuario_id, usuario_nome, papel, metodo, rota, acao, obra_id, detalhe) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [u.id, u.nome, u.papel, req.method, req.originalUrl.split('?')[0].slice(0, 200), d.acao, d.obraId, d.detalhe]);
}

// Middleware: grava depois que a ação deu certo e antes de terminar a resposta (funciona também na Vercel)
export function middleware(req, res, next) {
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) || req.originalUrl.startsWith('/api/auth/')) return next();
  const fim = res.end.bind(res);
  res.end = (...a) => {
    res.end = fim;
    if (res.statusCode < 400 && req.usuario) registrar(req).catch((e) => console.error('auditoria:', e.message)).finally(() => fim(...a));
    else fim(...a);
    return res;
  };
  next();
}

export async function listar({ usuario_id, obra_id, de, ate, q } = {}) {
  const w = [], p = [];
  const add = (sql, v) => { p.push(v); w.push(sql.replace('?', '$' + p.length)); };
  if (usuario_id) add('a.usuario_id = ?', Number(usuario_id));
  if (obra_id) add('a.obra_id = ?', Number(obra_id));
  if (de) { if (!isData(de)) throw new ErroNegocio('Data inicial inválida.'); add('a.em >= ?', de); }
  if (ate) { if (!isData(ate)) throw new ErroNegocio('Data final inválida.'); add("a.em < (?::date + 1)", ate); }
  if (q) { p.push(`%${String(q).toLowerCase()}%`); w.push(`(lower(a.acao) LIKE $${p.length} OR lower(coalesce(a.detalhe,'')) LIKE $${p.length})`); }
  return query(`SELECT a.id, a.usuario_id, a.usuario_nome, a.papel, a.acao, a.detalhe, a.obra_id, a.em, o.codigo AS obra_codigo, o.nome AS obra
    FROM auditoria a LEFT JOIN obras o ON o.id = a.obra_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY a.id DESC LIMIT 300`, p);
}
