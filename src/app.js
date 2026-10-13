import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { iniciar, one } from './db.js';
import { seed } from './seed.js';
import * as S from './services.js';
import * as A from './auth.js';
import { excelDia, excelMes } from './export.js';
import * as X from './extratos.js';
import * as P from './patrimonio.js';
import * as SO from './societario.js';
import * as CO from './comercial.js';
import * as CB from './cobranca.js';
import * as ES from './estoque.js';
import * as DP from './dp.js';
import * as MK from './marketing.js';
import * as OB from './obras.js';
import * as MT from './materiais.js';
import * as DC from './documentos.js';
import * as PN from './painel.js';
import * as AU from './auditoria.js';
import * as MA from './marca.js';
import * as FT from './fotos.js';
import * as CV from './curvas.js';
import * as CT from './contratos.js';
import * as CP from './compras.js';
import * as FO from './folha.js';
import * as QU from './qualidade.js';
import * as RL from './relatorios.js';
import * as PT from './portal.js';
import * as IM from './importacao.js';
import * as NT from './notificacoes.js';
import { gerarPdf } from './relatorio.js';

export const app = express();
app.set('trust proxy', 1);
app.post('/api/extratos', express.json({ limit: '5mb' })); // upload em base64; as demais rotas ficam com limite pequeno
app.post('/api/dp/ausencias', express.json({ limit: '5mb' })); // atestado anexado em base64 (até 3 MB)
app.post('/api/dp/ausencias/:id/anexo', express.json({ limit: '5mb' }));
app.post('/api/obras/:id/documentos', express.json({ limit: '5mb' })); // documento da obra (ART, alvará...) anexado em base64 (até 3 MB)
app.post('/api/obras/:id/fotos', express.json({ limit: '3mb' })); // foto já reduzida no navegador + miniatura (base64)
app.post('/api/marca/logo', express.json({ limit: '600kb' }));
app.post('/api/auth/foto', express.json({ limit: '300kb' })); // foto de perfil já reduzida no navegador
app.post('/api/importar/:tipo', express.json({ limit: '600kb' }));
app.use(express.json({ limit: '100kb' }));
app.use((_, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store');
  next();
});
// Em desenvolvimento o Express serve a interface; na Vercel quem serve a pasta public/ é a própria Vercel.
app.use(express.static(join(dirname(fileURLToPath(import.meta.url)), '..', 'public')));

// Garante tabelas + dados iniciais antes de atender qualquer chamada da API.
app.use('/api', async (_req, _res, next) => { try { await iniciar(seed); next(); } catch (e) { next(e); } });

const h = (fn) => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);

// ---------- autenticação ----------
const ip = (req) => req.ip || req.socket.remoteAddress || '';
// Rotina diária (Vercel Cron ou agendador externo): monta e envia os avisos de WhatsApp. Protegida por CRON_SECRET.
app.get('/api/cron/avisos', h(async (req, res) => {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.authorization !== `Bearer ${segredo}`) return res.status(401).json({ erro: 'Não autorizado.' });
  res.json(await NT.rodarCron());
}));
app.use('/api', A.autenticar);
app.use('/api', AU.middleware); // histórico de alterações (quem mudou o quê)

app.get('/api/auth/estado', h(async (req, res) => res.json({ usuario: req.usuario, precisaCriarAdmin: (await A.totalUsuarios()) === 0, exigeCodigo: !!process.env.SETUP_TOKEN })));
app.post('/api/auth/setup', h(async (req, res) => {
  await A.criarPrimeiroAdmin(req.body);
  const { token, usuario } = await A.login(req.body.email, req.body.senha, ip(req));
  A.gravarCookie(req, res, token);
  res.status(201).json({ usuario });
}));
app.post('/api/auth/login', h(async (req, res) => {
  const { token, usuario } = await A.login(req.body.email, req.body.senha, ip(req));
  A.gravarCookie(req, res, token);
  res.json({ usuario });
}));
app.post('/api/auth/logout', h(async (req, res) => { await A.logout(A.lerCookie(req)); A.gravarCookie(req, res, ''); res.status(204).end(); }));
app.post('/api/auth/senha', A.logado, h(async (req, res) => {
  // a senha do acesso comercial é gerida pela administração (o admin redefine em Cadastros); assim o histórico do que cada um fez continua acessível
  if (req.usuario.papel === 'comercial') throw new S.ErroNegocio('A senha deste acesso é gerenciada pela administração. Peça a troca ao administrador.', 403);
  await A.trocarSenha(req.usuario, req.body.atual, req.body.nova); res.status(204).end(); }));

app.post('/api/auth/foto', A.logado, h(async (req, res) => { await A.salvarFoto(req.usuario.id, req.body.imagem); res.status(204).end(); }));
app.delete('/api/auth/foto', A.logado, h(async (req, res) => { await A.removerFoto(req.usuario.id); res.status(204).end(); }));

const ler = A.exigir('leitor'), operar = A.exigir('operador'), admin = A.exigir('admin');

app.get('/api/usuarios/:id/foto', A.logado, h(async (req, res) => {
  if (req.usuario.papel === 'cliente' && idNum(req.params.id) !== req.usuario.id) return res.status(403).end();
  const foto = await A.lerFoto(idNum(req.params.id));
  if (!foto) return res.status(404).end();
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=86400'); // a URL muda (?v=) quando a foto é trocada
  res.end(foto);
}));
app.get('/api/acessos', A.exigirArea('acessos'), h(async (_, res) => res.json(await A.acessos())));
app.get('/api/usuarios', admin, h(async (_, res) => res.json(await A.listarUsuarios())));
app.post('/api/usuarios', admin, h(async (req, res) => res.status(201).json(await A.criarUsuario(req.body))));
app.put('/api/usuarios/:id', admin, h(async (req, res) => res.json(await A.atualizarUsuario(Number(req.params.id), req.body))));

// ---------- dados (leitor consulta · operador lança e fecha · admin configura) ----------
// o nome de quem lançou/fechou vem sempre do usuário logado
const comAutor = (req) => ({ ...req.body, criado_por: req.usuario.nome, criado_por_id: req.usuario.id, fechado_por: req.usuario.nome, fechado_por_id: req.usuario.id });
const idNum = (v) => { const n = Number(v); if (!Number.isInteger(n) || n < 1) throw new S.ErroNegocio('Identificador inválido.'); return n; };

// equipe (nomes, perfis e fotos) para qualquer pessoa logada: usada em "quem fez" e nos avatares
app.get('/api/equipe', A.logado, h(async (req, res) => res.json(req.usuario.papel === 'cliente' ? { equipe: [], hoje: S.hoje() } : { equipe: await A.equipe(), hoje: S.hoje() })));
app.get('/api/meta', ler, h(async (_, res) => res.json({ ...(await S.meta()), equipe: await A.equipe(), hoje: S.hoje() })));

app.get('/api/lancamentos', ler, h(async (req, res) => res.json(await S.listarLancamentos(req.query))));
app.post('/api/lancamentos', operar, h(async (req, res) => res.status(201).json(await S.criarLancamento(comAutor(req)))));
app.put('/api/lancamentos/:id', admin, h(async (req, res) => res.json(await S.atualizarLancamento(idNum(req.params.id), comAutor(req)))));
app.delete('/api/lancamentos/:id', operar, h(async (req, res) => { await S.excluirLancamento(idNum(req.params.id)); res.status(204).end(); }));

const data = (req) => { if (!S.isData(req.params.data)) throw new S.ErroNegocio('Data inválida.'); return req.params.data; };
const mes = (req) => { if (!S.isMes(req.params.mes)) throw new S.ErroNegocio('Mês inválido.'); return req.params.mes; };

app.get('/api/dia/:data', ler, h(async (req, res) => res.json(await S.resumoDia(data(req)))));
app.post('/api/dia/:data/fechar', operar, h(async (req, res) => {
  const confirmacao = await S.validarChecklist(req.body.confirmacao); // sem checklist completo não fecha, nem pela API
  res.json(await S.fecharDia(data(req), { ...comAutor(req), confirmacao }));
}));
app.delete('/api/dia/:data/fechar', admin, h(async (req, res) => { await S.reabrirDia(data(req)); res.status(204).end(); }));

app.get('/api/painel/:mes', ler, h(async (req, res) => {
  const painel = await S.painelMes(mes(req));
  res.json({ ...painel, patrimonio: await P.resumoPainel(req.params.mes, painel) }); // caixa x ativos (containers e estoque)
}));

// ---------- patrimônio em ativos (containers e estoque) ----------
const verPat = A.exigirArea('patrimonio'), verSoc = A.exigirArea('societario');
app.get('/api/patrimonio/:mes', verPat, h(async (req, res) => {
  const m = mes(req);
  res.json({ mes: m, itens: await P.itensDoMes(m), posicao: await P.posicao(m), mes_anterior: P.mesAnterior(m), tipos: P.TIPOS, situacoes: P.SITUACOES });
}));
app.post('/api/patrimonio', admin, h(async (req, res) => res.status(201).json(await P.salvarItem(null, req.body, req.usuario))));
app.put('/api/patrimonio/:id', admin, h(async (req, res) => res.json(await P.salvarItem(idNum(req.params.id), req.body, req.usuario))));
app.delete('/api/patrimonio/:id', admin, h(async (req, res) => { await P.excluirItem(idNum(req.params.id)); res.status(204).end(); }));
app.post('/api/patrimonio/copiar', admin, h(async (req, res) => res.json({ copiados: await P.copiarMes(req.body.de, req.body.para) })));

// ---------- quadro societário e relatório mensal dos sócios ----------
app.get('/api/societario/quadro', verSoc, h(async (_, res) => res.json(await SO.quadro())));
app.post('/api/societario/socios', admin, h(async (req, res) => res.status(201).json(await SO.salvarSocio(null, req.body))));
app.put('/api/societario/socios/:id', admin, h(async (req, res) => res.json(await SO.salvarSocio(idNum(req.params.id), req.body))));
app.get('/api/societario/nota/:mes', verSoc, h(async (req, res) => res.json({ texto: await SO.nota(mes(req)) })));
app.put('/api/societario/nota/:mes', admin, h(async (req, res) => { await SO.salvarNota(mes(req), req.body.texto, req.usuario); res.status(204).end(); }));
app.get('/api/societario/relatorio/:mes', verSoc, h(async (req, res) => {
  const d = await SO.dadosRelatorio(mes(req), req.query.socio ? idNum(req.query.socio) : null, req.usuario);
  const sufixo = d.socio ? '-' + d.socio.nome.normalize('NFD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() : '';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="relatorio-socios-${req.params.mes}${sufixo}.pdf"`);
  gerarPdf(d, res);
}));

// ---------- comercial: clientes, orçamentos, follow-up e painel ao vivo ----------
// 'aovivo' = ver os números (admin, sócio, comercial); 'comercial' = lançar e trabalhar orçamentos/clientes (admin, comercial)
const verVivo = A.exigirArea('aovivo'), trabCom = A.exigirArea('comercial');
app.get('/api/aovivo', verVivo, h(async (_, res) => res.json(await CO.aoVivo())));
app.get('/api/comercial/painel', trabCom, h(async (_, res) => res.json(await CO.painelComercial())));
app.get('/api/comercial/proximo-numero', trabCom, h(async (_, res) => res.json({ numero: await CO.proximoNumero() })));
app.get('/api/comercial/opcoes', trabCom, h(async (_, res) => res.json(await CO.opcoes())));
app.get('/api/comercial/produtos', trabCom, h(async (_, res) => res.json(await CO.produtos())));
app.get('/api/comercial/clientes', trabCom, h(async (req, res) => res.json(await CO.buscarClientes(req.query.q, req.query))));
app.get('/api/comercial/clientes/:id', trabCom, h(async (req, res) => res.json(await CO.cliente(idNum(req.params.id)))));
app.post('/api/comercial/clientes', trabCom, h(async (req, res) => {
  CO.exigirChecklist(req.body.checklist, CO.CHECKLIST_CLIENTE, 'do cliente');
  res.status(201).json(await CO.salvarCliente(null, req.body, req.usuario));
}));
app.put('/api/comercial/clientes/:id', trabCom, h(async (req, res) => res.json(await CO.salvarCliente(idNum(req.params.id), req.body, req.usuario))));
app.get('/api/comercial/orcamentos', trabCom, h(async (req, res) => res.json(await CO.listarOrcamentos(req.query))));
app.post('/api/comercial/orcamentos', trabCom, h(async (req, res) => {
  // primeiro compromisso do dia do comercial: enviar todos os follow-ups pendentes antes de lançar orçamento novo
  if (req.usuario.papel === 'comercial') {
    const pend = await CO.followupsPendentes(req.usuario);
    if (pend.length) throw new S.ErroNegocio(`Antes de lançar um orçamento novo, envie os follow-ups pendentes (${pend.length}).`, 409);
  }
  CO.exigirChecklist(req.body.checklist, CO.CHECKLIST_ORCAMENTO, 'do orçamento');
  res.status(201).json(await CO.criarOrcamento(req.body, req.usuario));
}));
app.put('/api/comercial/orcamentos/:id', trabCom, h(async (req, res) => res.json(await CO.editarOrcamento(idNum(req.params.id), req.body))));
app.post('/api/comercial/orcamentos/:id/status', trabCom, h(async (req, res) => res.json(await CO.mudarStatus(idNum(req.params.id), req.body, req.usuario))));
app.post('/api/comercial/orcamentos/:id/contato', trabCom, h(async (req, res) => res.json(await CO.registrarContato(idNum(req.params.id), req.body, req.usuario))));
app.post('/api/comercial/orcamentos/:id/adiar', trabCom, h(async (req, res) => res.json(await CO.adiar(idNum(req.params.id), req.body.dias))));
// ---------- estoque (administração e quem cuida do estoque) ----------
const estq = A.exigirArea('estoque');
app.get('/api/estoque', estq, h(async (req, res) => res.json({ itens: await ES.listarItens({ todos: req.query.todos === '1' }), movimentos: await ES.listarMovimentos(req.query) })));
app.get('/api/estoque/movimentos', estq, h(async (req, res) => res.json(await ES.listarMovimentos(req.query))));
app.post('/api/estoque/itens', estq, h(async (req, res) => res.status(201).json({ id: await ES.salvarItem(null, req.body) })));
app.put('/api/estoque/itens/:id', estq, h(async (req, res) => res.json({ id: await ES.salvarItem(idNum(req.params.id), req.body) })));
app.post('/api/estoque/movimentos', estq, h(async (req, res) => res.status(201).json(await ES.registrarMovimento(req.body, req.usuario))));
app.delete('/api/estoque/movimentos/:id', admin, h(async (req, res) => { await ES.excluirMovimento(idNum(req.params.id)); res.status(204).end(); }));

// ---------- cobrança dos orçamentos aprovados (financeiro) ----------
const cobr = A.exigirArea('cobranca');
app.get('/api/cobranca', cobr, h(async (req, res) => res.json({ resumo: await CB.resumo(), lista: await CB.listar(req.query), cadencia: CB.CADENCIA_COBRANCA, resultados: CB.RESULTADOS_COBRANCA })));
app.get('/api/cobranca/pendentes', cobr, h(async (_, res) => res.json(await CB.pendentes())));
app.get('/api/cobranca/:id', cobr, h(async (req, res) => res.json(await CB.detalhe(idNum(req.params.id)))));
app.post('/api/cobranca/:id/contato', cobr, h(async (req, res) => res.json(await CB.registrarContato(idNum(req.params.id), req.body, req.usuario))));
app.post('/api/cobranca/:id/pagamento', cobr, h(async (req, res) => res.json(await CB.registrarPagamento(idNum(req.params.id), req.body, req.usuario))));

app.get('/api/comercial/followups', trabCom, h(async (req, res) => res.json(await CO.followupsPendentes(req.usuario))));
app.get('/api/comercial/followup-painel', trabCom, h(async (req, res) => res.json(await CO.painelFollowup(req.query))));
app.post('/api/comercial/orcamentos/:id/followup-enviado', trabCom, h(async (req, res) => res.json(await CO.followupEnviado(idNum(req.params.id), req.body, req.usuario))));

// ---------- Departamento de Pessoas (só administrador: dados pessoais e de saúde) ----------
const verDP = A.exigirArea('dp');
app.get('/api/dp/meta', verDP, h(async (_, res) => res.json({ regimes: DP.REGIMES, grupos: DP.GRUPOS, vinculos: DP.VINCULOS, tipos_ausencia: DP.TIPOS_AUSENCIA, funcoes_obra: DP.FUNCOES_OBRA })));
app.get('/api/dp/funcionarios', verDP, h(async (req, res) => res.json(await DP.listar({ todos: req.query.todos === '1' }))));
app.post('/api/dp/funcionarios', verDP, h(async (req, res) => res.status(201).json(await DP.salvar(null, req.body))));
app.get('/api/dp/funcionarios/:id', verDP, h(async (req, res) => res.json(await DP.ficha(idNum(req.params.id)))));
app.put('/api/dp/funcionarios/:id', verDP, h(async (req, res) => res.json(await DP.salvar(idNum(req.params.id), req.body))));
app.get('/api/dp/resumo/:mes', verDP, h(async (req, res) => res.json(await DP.resumo(mes(req)))));
app.get('/api/dp/ausencias/:mes', verDP, h(async (req, res) => res.json(await DP.listarAusencias(mes(req)))));
app.post('/api/dp/ausencias', verDP, h(async (req, res) => res.status(201).json(await DP.criarAusencia(req.body, req.usuario))));
app.post('/api/dp/ausencias/:id/anexo', verDP, h(async (req, res) => { await DP.anexarAusencia(idNum(req.params.id), req.body.anexo); res.status(204).end(); }));
app.get('/api/dp/ausencias/:id/anexo', verDP, h(async (req, res) => {
  const a = await DP.lerAnexoAusencia(idNum(req.params.id));
  res.setHeader('Content-Type', a.tipo); res.setHeader('Content-Disposition', `inline; filename="${a.nome}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'private, no-store');
  res.end(a.buf);
}));
app.delete('/api/dp/ausencias/:id', verDP, h(async (req, res) => { await DP.excluirAusencia(idNum(req.params.id)); res.status(204).end(); }));

// ---------- obras (engenheiro vê e edita as suas; gestão tudo; demais perfis só consultam) ----------
const verObras = A.exigirArea('obras'), verAgenda = A.exigirArea('agenda'), verMat = A.exigirArea('materiais'), verTerc = A.exigirArea('terceiros'), verDoc = A.exigirArea('documentos');
const verVisao = A.exigirArea('visao'), verEng = A.exigirArea('engenheiro'), verInv = A.exigirArea('investidor');
app.get('/api/visao', verVisao, h(async (req, res) => res.json(await PN.visao(req.usuario))));
app.get('/api/investidor', verInv, h(async (req, res) => res.json(await PN.investidor(req.usuario))));
app.get('/api/engenheiro/meu-dia', verEng, h(async (req, res) => res.json(await PN.meuDia(req.usuario))));
app.get('/api/alertas', verObras, h(async (req, res) => res.json(await PN.alertas(req.usuario))));
app.get('/api/avisos/destinatarios', admin, h(async (_, res) => res.json(await PN.destinatarios())));
app.post('/api/avisos', admin, h(async (req, res) => res.status(201).json({ id: await PN.criarAviso(req.usuario, req.body) })));
app.post('/api/avisos/:id/lido', verEng, h(async (req, res) => { await PN.marcarLido(req.usuario, idNum(req.params.id)); res.status(204).end(); }));

app.get('/api/obras/opcoes', verObras, h(async (_, res) => res.json({ ...(await OB.opcoes()), fases_modelo: Object.fromEntries(Object.entries(OB.FASES_MODELO).map(([k, v]) => [k, v.map(([n]) => n)])), tipos_documento: DC.TIPOS_DOC, status_documento: DC.STATUS_DOC, status_material: MT.STATUS_MATERIAL, status_terceiro: MT.STATUS_TERCEIRO, especialidades: MT.ESPECIALIDADES, categorias_fornecedor: MT.CATEGORIAS_FORNECEDOR })));
app.get('/api/obras', verObras, h(async (req, res) => res.json(await OB.listar(req.usuario, { status: req.query.status }))));
app.post('/api/obras', verObras, h(async (req, res) => res.status(201).json({ id: await OB.salvar(req.usuario, null, req.body) })));
app.post('/api/obras/de-orcamento/:id', verObras, h(async (req, res) => res.status(201).json({ id: await OB.criarDeOrcamento(req.usuario, idNum(req.params.id), req.body) })));
app.get('/api/agenda/:mes', verAgenda, h(async (req, res) => res.json(await OB.agendaMes(req.usuario, mes(req)))));
app.get('/api/documentos', verDoc, h(async (req, res) => res.json(await DC.conformidade(req.usuario))));
app.get('/api/documentos/:id/arquivo', verDoc, h(async (req, res) => {
  const a = await DC.lerAnexoDocumento(req.usuario, idNum(req.params.id));
  res.setHeader('Content-Type', a.tipo); res.setHeader('Content-Disposition', `inline; filename="${a.nome}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'private, no-store');
  res.end(a.buf);
}));
app.delete('/api/documentos/:id/arquivo', verDoc, h(async (req, res) => { await DC.removerAnexo(req.usuario, idNum(req.params.id)); res.status(204).end(); }));
app.delete('/api/documentos/:id', verDoc, h(async (req, res) => { await DC.excluirDocumento(req.usuario, idNum(req.params.id)); res.status(204).end(); }));
app.get('/api/materiais', verMat, h(async (req, res) => res.json({ resumo: await MT.resumoMateriais(req.usuario), lista: await MT.listarMateriais(req.usuario, req.query), fornecedores: await MT.listarFornecedores(), status: MT.STATUS_MATERIAL })));
app.post('/api/materiais/:id/status', verMat, h(async (req, res) => { await MT.mudarStatusMaterial(req.usuario, idNum(req.params.id), req.body.status); res.status(204).end(); }));
app.post('/api/materiais/:id/pagar', operar, h(async (req, res) => res.json(await MT.pagarMaterial(req.usuario, idNum(req.params.id), req.body, S.criarLancamento))));
app.delete('/api/materiais/:id', verMat, h(async (req, res) => { await MT.excluirMaterial(req.usuario, idNum(req.params.id)); res.status(204).end(); }));
app.get('/api/fornecedores', verMat, h(async (_, res) => res.json(await MT.listarFornecedores())));
app.post('/api/fornecedores', admin, h(async (req, res) => res.status(201).json({ id: await MT.salvarFornecedor(null, req.body) })));
app.put('/api/fornecedores/:id', admin, h(async (req, res) => res.json({ id: await MT.salvarFornecedor(idNum(req.params.id), req.body) })));
app.get('/api/terceirizadas', verTerc, h(async (_, res) => res.json({ lista: await MT.listarTerceirizadas(), especialidades: MT.ESPECIALIDADES, status: MT.STATUS_TERCEIRO })));
app.get('/api/terceirizadas/:id/contratos', verTerc, h(async (req, res) => res.json(await MT.contratosDaTerceirizada(idNum(req.params.id)))));
app.post('/api/terceirizadas', admin, h(async (req, res) => res.status(201).json({ id: await MT.salvarTerceirizada(null, req.body) })));
app.put('/api/terceirizadas/:id', admin, h(async (req, res) => res.json({ id: await MT.salvarTerceirizada(idNum(req.params.id), req.body) })));
app.post('/api/medicoes/:id/receber', operar, h(async (req, res) => res.json(await OB.receberMedicao(req.usuario, idNum(req.params.id), req.body, S.criarLancamento))));

app.get('/api/obras/:id', verObras, h(async (req, res) => res.json(await OB.detalhe(req.usuario, idNum(req.params.id)))));
app.put('/api/obras/:id', verObras, h(async (req, res) => res.json({ id: await OB.salvar(req.usuario, idNum(req.params.id), req.body) })));
app.delete('/api/obras/:id', verObras, h(async (req, res) => { await OB.excluir(req.usuario, idNum(req.params.id)); res.status(204).end(); }));
app.post('/api/obras/:id/fases/modelo', verObras, h(async (req, res) => { await OB.gerarFasesModelo(req.usuario, idNum(req.params.id)); res.status(201).json({ ok: true }); }));
app.post('/api/obras/:id/fases', verObras, h(async (req, res) => res.status(201).json({ id: await OB.salvarFase(req.usuario, idNum(req.params.id), null, req.body) })));
app.put('/api/obras/:id/fases/:fase', verObras, h(async (req, res) => res.json({ id: await OB.salvarFase(req.usuario, idNum(req.params.id), idNum(req.params.fase), req.body) })));
app.delete('/api/obras/:id/fases/:fase', verObras, h(async (req, res) => { await OB.excluirFase(req.usuario, idNum(req.params.id), idNum(req.params.fase)); res.status(204).end(); }));
app.post('/api/obras/:id/equipe', verObras, h(async (req, res) => { await OB.alocar(req.usuario, idNum(req.params.id), req.body); res.status(201).json({ ok: true }); }));
app.delete('/api/obras/:id/equipe/:func', verObras, h(async (req, res) => { await OB.desalocar(req.usuario, idNum(req.params.id), idNum(req.params.func)); res.status(204).end(); }));
app.get('/api/obras/:id/presenca/:data', verObras, h(async (req, res) => res.json(await OB.presencasDoDia(req.usuario, idNum(req.params.id), data(req)))));
app.post('/api/obras/:id/presenca', verObras, h(async (req, res) => { await OB.registrarPresenca(req.usuario, idNum(req.params.id), req.body); res.status(204).end(); }));
app.post('/api/obras/:id/diario', verObras, h(async (req, res) => { await OB.salvarDiario(req.usuario, idNum(req.params.id), req.body); res.status(204).end(); }));
app.post('/api/obras/:id/eventos', verObras, h(async (req, res) => res.status(201).json({ id: await OB.salvarEvento(req.usuario, idNum(req.params.id), null, req.body) })));
app.put('/api/obras/:id/eventos/:ev', verObras, h(async (req, res) => res.json({ id: await OB.salvarEvento(req.usuario, idNum(req.params.id), idNum(req.params.ev), req.body) })));
app.delete('/api/obras/:id/eventos/:ev', verObras, h(async (req, res) => { await OB.excluirEvento(req.usuario, idNum(req.params.id), idNum(req.params.ev)); res.status(204).end(); }));
app.post('/api/obras/:id/medicoes', verObras, h(async (req, res) => res.status(201).json({ id: await OB.salvarMedicao(req.usuario, idNum(req.params.id), null, req.body) })));
app.put('/api/obras/:id/medicoes/:med', verObras, h(async (req, res) => res.json({ id: await OB.salvarMedicao(req.usuario, idNum(req.params.id), idNum(req.params.med), req.body) })));
app.post('/api/obras/:id/terceiros', verObras, h(async (req, res) => res.status(201).json({ id: await MT.salvarContratoTerceiro(req.usuario, idNum(req.params.id), null, req.body) })));
app.put('/api/obras/:id/terceiros/:t', verObras, h(async (req, res) => res.json({ id: await MT.salvarContratoTerceiro(req.usuario, idNum(req.params.id), idNum(req.params.t), req.body) })));
app.delete('/api/obras/:id/terceiros/:t', verObras, h(async (req, res) => { await MT.excluirContratoTerceiro(req.usuario, idNum(req.params.id), idNum(req.params.t)); res.status(204).end(); }));
app.post('/api/obras/:id/materiais', verObras, h(async (req, res) => { const id = await MT.salvarMaterial(req.usuario, idNum(req.params.id), null, req.body); res.status(201).json({ id, status: (await one('SELECT status FROM obra_materiais WHERE id = $1', [id])).status }); }));
app.put('/api/obras/:id/materiais/:m', verObras, h(async (req, res) => res.json({ id: await MT.salvarMaterial(req.usuario, idNum(req.params.id), idNum(req.params.m), req.body) })));
app.post('/api/obras/:id/documentos/checklist', verObras, h(async (req, res) => res.status(201).json({ criados: await DC.gerarChecklist(req.usuario, idNum(req.params.id)) })));
app.post('/api/obras/:id/documentos', verObras, h(async (req, res) => res.status(201).json({ id: await DC.salvarDocumento(req.usuario, idNum(req.params.id), req.body) })));

// ---------- marca (nome, cor e logo), histórico e fotos ----------
app.get('/api/marca', h(async (_, res) => res.json(await MA.marca())));
app.get('/api/marca/logo', h(async (_, res) => {
  const l = await MA.lerLogo();
  if (!l) return res.status(404).end();
  res.setHeader('Content-Type', l.tipo); res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox"); // SVG nunca executa script
  res.end(l.buf);
}));
app.put('/api/marca', admin, h(async (req, res) => { await MA.salvarMarca(req.body); res.json(await MA.marca()); }));
app.post('/api/marca/logo', admin, h(async (req, res) => { await MA.salvarLogo(req.body.base64); res.json(await MA.marca()); }));
app.delete('/api/marca/logo', admin, h(async (_, res) => { await MA.removerLogo(); res.status(204).end(); }));
app.get('/api/historico', admin, h(async (req, res) => res.json(await AU.listar(req.query))));
const verFoto = (req, res, next) => (!req.usuario ? res.status(401).json({ erro: 'Faça login para continuar.' }) : ['obras', 'portal'].some((a) => (A.AREAS[req.usuario.papel] || []).includes(a)) ? next() : res.status(403).json({ erro: 'Seu perfil não tem acesso a esta área.' }));
app.get('/api/obras/:id/fotos', verObras, h(async (req, res) => res.json(await FT.listar(req.usuario, idNum(req.params.id)))));
app.post('/api/obras/:id/fotos', verObras, h(async (req, res) => res.status(201).json({ id: await FT.adicionar(req.usuario, idNum(req.params.id), req.body) })));
app.get('/api/fotos/:id/:tipo', verFoto, h(async (req, res) => {
  const buf = await FT.ler(req.usuario, idNum(req.params.id), req.params.tipo === 'miniatura' ? 'miniatura' : 'dados');
  res.setHeader('Content-Type', 'image/jpeg'); res.setHeader('Cache-Control', 'private, max-age=86400');
  res.end(buf);
}));
app.put('/api/fotos/:id', verObras, h(async (req, res) => { await FT.atualizar(req.usuario, idNum(req.params.id), req.body); res.status(204).end(); }));
app.delete('/api/fotos/:id', verObras, h(async (req, res) => { await FT.excluir(req.usuario, idNum(req.params.id)); res.status(204).end(); }));

// ---------- pendências, segurança do trabalho, relatórios em PDF e portal do cliente ----------
const verSeg = A.exigirArea('seguranca'), verPortal = A.exigirArea('portal');
app.get('/api/obras/:id/pendencias', verObras, h(async (req, res) => res.json({ status: QU.STATUS_PENDENCIA, itens: await QU.listarPendencias(req.usuario, idNum(req.params.id)) })));
app.post('/api/obras/:id/pendencias', verObras, h(async (req, res) => res.status(201).json({ id: await QU.salvarPendencia(req.usuario, idNum(req.params.id), null, req.body) })));
app.put('/api/obras/:id/pendencias/:p', verObras, h(async (req, res) => res.json({ id: await QU.salvarPendencia(req.usuario, idNum(req.params.id), idNum(req.params.p), req.body) })));
app.delete('/api/obras/:id/pendencias/:p', verObras, h(async (req, res) => { await QU.excluirPendencia(req.usuario, idNum(req.params.id), idNum(req.params.p)); res.status(204).end(); }));

app.get('/api/seguranca', verSeg, h(async (req, res) => res.json({ ...(await QU.painelSeguranca(req.usuario)), sugestoes: QU.TREINAMENTOS_SUGERIDOS, checklist: QU.CHECKLIST_INSPECAO })));
app.post('/api/seguranca/treinamentos', verSeg, h(async (req, res) => res.status(201).json({ id: await QU.registrarTreinamento(req.usuario, req.body) })));
app.post('/api/seguranca/epi', verSeg, h(async (req, res) => res.status(201).json({ id: await QU.registrarEpi(req.usuario, req.body) })));
app.delete('/api/seguranca/:tabela/:id', verSeg, h(async (req, res) => { await QU.excluirRegistroSeguranca(req.usuario, req.params.tabela, idNum(req.params.id)); res.status(204).end(); }));
app.get('/api/obras/:id/inspecoes', verSeg, h(async (req, res) => res.json(await QU.listarInspecoes(req.usuario, idNum(req.params.id)))));
app.post('/api/obras/:id/inspecoes', verSeg, h(async (req, res) => res.status(201).json({ id: await QU.registrarInspecao(req.usuario, idNum(req.params.id), req.body) })));

app.get('/api/obras/:id/relatorio.pdf', verObras, h((req, res) => RL.relatorioObra(req.usuario, idNum(req.params.id), req.query.tipo, res)));
app.get('/api/obras/:id/diario.pdf', verObras, h((req, res) => RL.diarioPdf(req.usuario, idNum(req.params.id), req.query.de, req.query.ate, res)));
app.get('/api/obras/:id/termo-entrega.pdf', verObras, h((req, res) => RL.termoEntrega(req.usuario, idNum(req.params.id), res)));

app.get('/api/portal', verPortal, h(async (req, res) => res.json(await PT.portal(req.usuario))));
app.get('/api/obras/:id/acessos-cliente', admin, h(async (req, res) => res.json(await PT.acessosDaObra(idNum(req.params.id)))));
app.post('/api/obras/:id/acessos-cliente', admin, h(async (req, res) => res.status(201).json(await PT.criarAcesso(req.usuario, { ...req.body, obra_ids: [idNum(req.params.id)] }))));
app.delete('/api/obras/:id/acessos-cliente/:u', admin, h(async (req, res) => { await PT.removerAcesso(req.usuario, idNum(req.params.id), idNum(req.params.u)); res.status(204).end(); }));

// ---------- mapa, importação de planilhas e avisos por WhatsApp ----------
const verMapa = A.exigirArea('mapa'), verImportar = A.exigirArea('importar');
app.put('/api/obras/:id/local', verObras, h(async (req, res) => { await OB.definirLocal(req.usuario, idNum(req.params.id), req.body); res.status(204).end(); }));
app.get('/api/importar/:tipo/modelo.csv', verImportar, h(async (req, res) => { res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="modelo-${req.params.tipo}.csv"`); res.end(IM.modeloCsv(req.params.tipo)); }));
app.post('/api/importar/:tipo', verImportar, admin, h(async (req, res) => res.json(await IM.processar(req.params.tipo, req.body.csv, req.body.confirmar === true))));
app.get('/api/avisos-whatsapp', verImportar, admin, h(async (_, res) => res.json(await NT.painel())));
app.post('/api/avisos-whatsapp/gerar', verImportar, admin, h(async (_, res) => res.json(await NT.gerarFila())));
app.post('/api/avisos-whatsapp/enviar', verImportar, admin, h(async (_, res) => res.json(await NT.enviarPendentes())));
app.post('/api/avisos-whatsapp/:id/enviado', verImportar, admin, h(async (req, res) => { await NT.marcarEnviado(idNum(req.params.id)); res.status(204).end(); }));
app.put('/api/usuarios/:id/telefone', admin, h(async (req, res) => { await NT.definirTelefone(req.usuario, idNum(req.params.id), req.body.telefone); res.status(204).end(); }));

// ---------- indicadores, aditivos, compras, cotações e folha ----------
const verFluxo = A.exigirArea('fluxocaixa'), verFolha = A.exigirArea('folha');
app.get('/api/obras/:id/fases', verObras, h(async (req, res) => res.json(await OB.fasesDaObra(req.usuario, idNum(req.params.id)))));
app.get('/api/obras/:id/curva-s', verObras, h(async (req, res) => res.json(await CV.curvaS(req.usuario, idNum(req.params.id)))));
app.get('/api/obras/:id/custos-etapas', verObras, h(async (req, res) => res.json(await CV.custosPorEtapa(req.usuario, idNum(req.params.id)))));
app.post('/api/obras/:id/aditivos', verObras, h(async (req, res) => res.status(201).json({ numero: await CT.criarAditivo(req.usuario, idNum(req.params.id), req.body) })));
app.delete('/api/obras/:id/aditivos/:aid', verObras, h(async (req, res) => { await CT.desfazerAditivo(req.usuario, idNum(req.params.id), idNum(req.params.aid)); res.status(204).end(); }));
app.get('/api/fluxo-projetado', verFluxo, h(async (_, res) => res.json(await CV.fluxoProjetado())));
app.get('/api/compras/config', verMat, h(async (_, res) => res.json({ limite_aprovacao: await CP.limiteAprovacao() })));
app.put('/api/compras/config', admin, h(async (req, res) => res.json({ limite_aprovacao: await CP.definirLimite(req.usuario, req.body.limite_aprovacao) })));
app.post('/api/materiais/:id/aprovar', admin, h(async (req, res) => { await MT.aprovarMaterial(req.usuario, idNum(req.params.id)); res.status(204).end(); }));
app.post('/api/materiais/:id/recusar', admin, h(async (req, res) => { await MT.recusarMaterial(req.usuario, idNum(req.params.id), req.body.motivo); res.status(204).end(); }));
app.get('/api/cotacoes', verMat, h(async (req, res) => res.json(await CP.listarCotacoes(req.usuario, req.query))));
app.post('/api/obras/:id/cotacoes', verMat, h(async (req, res) => res.status(201).json({ id: await CP.criarCotacao(req.usuario, idNum(req.params.id), req.body) })));
app.post('/api/cotacoes/:id/precos', verMat, h(async (req, res) => { await CP.registrarPreco(req.usuario, idNum(req.params.id), req.body); res.status(204).end(); }));
app.post('/api/cotacoes/:id/escolher', verMat, h(async (req, res) => res.json(await CP.escolher(req.usuario, idNum(req.params.id), req.body.item_id))));
app.post('/api/cotacoes/:id/cancelar', verMat, h(async (req, res) => { await CP.cancelarCotacao(req.usuario, idNum(req.params.id)); res.status(204).end(); }));
app.get('/api/folha/:data', verFolha, h(async (req, res) => res.json(await FO.semana(data(req)))));
app.post('/api/folha/pagar', verFolha, operar, h(async (req, res) => res.json(await FO.pagar(req.usuario, req.body))));

// ---------- Marketing: campanhas, números dos anúncios e retorno ----------
// Ver: admin, sócio e marketing. Lançar/editar: admin e marketing.
const verMkt = A.exigirArea('marketing');
const editaMkt = (req, res, next) => (['admin', 'marketing'].includes(req.usuario?.papel) ? next() : res.status(403).json({ erro: 'Seu perfil só consulta o marketing.' }));
app.get('/api/marketing/painel/:mes', verMkt, h(async (req, res) => res.json(await MK.painel(mes(req)))));
app.get('/api/marketing/campanhas', verMkt, h(async (_, res) => res.json({ campanhas: await MK.listarCampanhas(), canais: MK.CANAIS })));
app.post('/api/marketing/campanhas', verMkt, editaMkt, h(async (req, res) => res.status(201).json(await MK.salvarCampanha(null, req.body, req.usuario))));
app.put('/api/marketing/campanhas/:id', verMkt, editaMkt, h(async (req, res) => res.json(await MK.salvarCampanha(idNum(req.params.id), req.body, req.usuario))));
app.get('/api/marketing/campanhas/:id/dias', verMkt, h(async (req, res) => res.json(await MK.listarDias(idNum(req.params.id)))));
app.post('/api/marketing/dias', verMkt, editaMkt, h(async (req, res) => res.status(201).json(await MK.lancarDia(req.body))));
app.delete('/api/marketing/dias/:id', verMkt, editaMkt, h(async (req, res) => { await MK.excluirDia(idNum(req.params.id)); res.status(204).end(); }));

app.post('/api/recorrencias/:id/lancar', operar, h(async (req, res) => res.status(201).json(await S.lancarRecorrencia(idNum(req.params.id), { ...req.body, criado_por: req.usuario.nome, criado_por_id: req.usuario.id }))));

for (const t of ['contas', 'categorias', 'pessoas', 'recorrencias']) {
  app.post(`/api/${t}`, admin, h(async (req, res) => res.status(201).json(await S.salvarCadastro(t, null, req.body))));
  app.put(`/api/${t}/:id`, admin, h(async (req, res) => res.json(await S.salvarCadastro(t, idNum(req.params.id), req.body))));
}

// ---------- extratos bancários (IA) ----------
app.get('/api/extratos', ler, h(async (_, res) => res.json({ extratos: await X.listarExtratos(), ia: X.iaDisponivel() })));
app.post('/api/extratos', operar, h(async (req, res) => res.status(201).json(await X.importarExtrato({ ...req.body, usuario: req.usuario.nome }))));
app.get('/api/extratos/:id', ler, h(async (req, res) => res.json(await X.detalheExtrato(idNum(req.params.id)))));
app.delete('/api/extratos/:id', admin, h(async (req, res) => { await X.excluirExtrato(idNum(req.params.id)); res.status(204).end(); }));
app.put('/api/movimentos/:id', operar, h(async (req, res) => res.json(await X.editarMovimento(idNum(req.params.id), req.body))));
app.post('/api/extratos/:id/lancar', operar, h(async (req, res) => res.json(await X.lancarMovimentos(idNum(req.params.id), req.body.ids, req.usuario))));

async function enviarXlsx(res, wb, nome) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
  await wb.xlsx.write(res);
  res.end();
}
app.get('/api/export/dia/:data', ler, h(async (req, res) => enviarXlsx(res, await excelDia(data(req)), `caixa-${req.params.data}.xlsx`)));
app.get('/api/export/mes/:mes', ler, h(async (req, res) => enviarXlsx(res, await excelMes(mes(req)), `controle-mensal-${req.params.mes}.xlsx`)));

app.use('/api', (_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// eslint-disable-next-line no-unused-vars
app.use((e, _req, res, _next) => {
  if (e.status === 503) return res.status(503).json({ erro: e.message });
  if (e instanceof S.ErroNegocio) return res.status(e.status).json({ erro: e.message });
  if (e.type === 'entity.too.large') return res.status(413).json({ erro: 'Arquivo grande demais. Divida o extrato por período.' });
  if (e.type === 'entity.parse.failed') return res.status(400).json({ erro: 'Requisição inválida.' });
  if (e.code === '23505') return res.status(409).json({ erro: 'Já existe um registro com esse nome.' });
  if (['23503', '23514', '22P02', '22007', '22008'].includes(e.code)) return res.status(400).json({ erro: 'Dados inválidos para esta operação.' });
  console.error(e);
  res.status(500).json({ erro: 'Erro interno.' });
});

export default app;
