import { test, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
const { app } = await import('../src/app.js');
const { iniciar, one, query } = await import('../src/db.js');
const { seed } = await import('../src/seed.js');
const S = await import('../src/services.js');
const A = await import('../src/auth.js');
const OB = await import('../src/obras.js');
const MT = await import('../src/materiais.js');
const DC = await import('../src/documentos.js');
const CO = await import('../src/comercial.js');
const PN = await import('../src/painel.js');

const servidor = app.listen(0);
await new Promise((r) => (servidor.listening ? r() : servidor.once('listening', r)));
const base = `http://127.0.0.1:${servidor.address().port}`;
after(() => servidor.close());
async function chamar(metodo, url, body, cookie) {
  const r = await fetch(base + url, { method: metodo, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = r.headers.get('set-cookie');
  return { status: r.status, json: r.status === 204 ? null : await r.json().catch(() => null), cookie: set?.split(';')[0] };
}

await iniciar(seed);
const hoje = S.hoje();
const d = (n) => S.addDias(hoje, n);
const conta = (await one("SELECT id FROM contas WHERE nome = 'Itaú Empresas'")).id;
const cat = async (n) => (await one('SELECT id FROM categorias WHERE nome = $1', [n])).id;
const admin = await A.criarUsuario({ nome: 'Diogo', login: 'diogo', senha: 'senha-forte-1', papel: 'admin' });
const eng = await A.criarUsuario({ nome: 'Rodrigo', login: 'rodrigo', senha: 'senha-forte-1', papel: 'engenheiro' });
const outroEng = await A.criarUsuario({ nome: 'Camila', login: 'camila', senha: 'senha-forte-1', papel: 'engenheiro' });
const socio = await A.criarUsuario({ nome: 'Investidor', login: 'inv', senha: 'senha-forte-1', papel: 'socio' });
const U = (u) => ({ id: u.id, nome: u.nome, papel: u.papel });
const [ADM, ENG, OUTRO, SOC] = [U(admin), U(eng), U(outroEng), U(socio)];
const rodrigo = (await one("SELECT id FROM funcionarios WHERE nome = 'Rodrigo Carvalho'")).id;
await query('UPDATE funcionarios SET usuario_id = $1 WHERE id = $2', [eng.id, rodrigo]);
const camila = (await one("INSERT INTO funcionarios (nome, funcao_obra, usuario_id) VALUES ('Camila', 'engenheiro', $1) RETURNING id", [outroEng.id])).id;
const nova = (extra = {}) => OB.salvar(ADM, null, { nome: 'Casa Teste', tipo: 'residencial', data_inicio: d(-30), previsao_fim: d(150), valor_contrato: 100000000, orcamento_custo: 70000000, engenheiro_id: rodrigo, ...extra });

test('só a gestão cria obra; código automático MC-ANO-NNN; validações', async () => {
  await assert.rejects(OB.salvar(ENG, null, { nome: 'X' }), /gestão/);
  const id1 = await nova(), id2 = await nova({ nome: 'Outra' });
  const o1 = await one('SELECT codigo FROM obras WHERE id = $1', [id1]), o2 = await one('SELECT codigo FROM obras WHERE id = $1', [id2]);
  assert.match(o1.codigo, /^MC-\d{4}-001$/);
  assert.match(o2.codigo, /^MC-\d{4}-002$/);
  await assert.rejects(OB.salvar(ADM, null, { nome: '' }), /nome da obra/);
  await assert.rejects(OB.salvar(ADM, null, { nome: 'Y', tipo: 'castelo' }), /Tipo de obra/);
  await assert.rejects(OB.salvar(ADM, null, { nome: 'Y', data_inicio: d(10), previsao_fim: d(5) }), /previsão de término/);
  await assert.rejects(OB.salvar(ADM, null, { nome: 'Y', valor_contrato: -1 }), /inválido/);
});

test('etapas modelo, avanço ponderado, ritmo e início automático da obra', async () => {
  const id = await nova({ nome: 'Obra Cronograma' });
  await OB.gerarFasesModelo(ADM, id);
  await assert.rejects(OB.gerarFasesModelo(ADM, id), /já tem etapas/);
  let det = await OB.detalhe(ADM, id);
  assert.equal(det.fases.length, 10);
  assert.equal(det.obra.progresso, 0);
  assert.equal(det.obra.status, 'planejamento');
  const f1 = det.fases[0], f2 = det.fases[1];
  assert.ok(f1.inicio_prev && f1.fim_prev, 'datas distribuídas dentro do prazo da obra');
  await OB.salvarFase(ENG, id, f1.id, { progresso: 100 });
  await OB.salvarFase(ENG, id, f2.id, { progresso: 50 });
  det = await OB.detalhe(ENG, id);
  assert.equal(det.obra.status, 'em_andamento', 'avanço > 0 coloca a obra em andamento');
  const esperado = Math.round((f1.peso * 100 + f2.peso * 50) / det.fases.reduce((a, f) => a + f.peso, 0));
  assert.equal(det.obra.progresso, esperado);
  assert.ok(det.fases[0].fim_real, 'etapa concluída ganha data real de término');
  assert.ok(det.obra.ritmo && ['no_prazo', 'atencao', 'atrasada'].includes(det.obra.ritmo.situacao));
  await assert.rejects(OB.salvarFase(ENG, id, f1.id, { progresso: 120 }), /entre 0% e 100%/);
  await assert.rejects(OB.salvarFase(ENG, id, null, { nome: 'Nova' }), /gestão/);
  const mudou = await OB.salvarFase(ADM, id, null, { nome: 'Etapa extra', peso: 5 });
  assert.ok(mudou);
});

test('engenheiro só vê e altera as obras dele e não enxerga valores de contrato', async () => {
  const minha = await nova({ nome: 'Obra do Rodrigo' });
  const alheia = await nova({ nome: 'Obra da Camila', engenheiro_id: camila });
  const lista = await OB.listar(ENG);
  assert.ok(lista.some((o) => o.id === minha) && !lista.some((o) => o.id === alheia));
  assert.equal(lista.find((o) => o.id === minha).valor_contrato, null);
  assert.equal(lista.find((o) => o.id === minha).margem_prevista, null);
  const det = await OB.detalhe(ENG, minha);
  assert.deepEqual(det.medicoes, []);
  assert.deepEqual(det.lancamentos, []);
  await assert.rejects(OB.detalhe(ENG, alheia), /não está sob sua responsabilidade/);
  await assert.rejects(OB.salvarDiario(ENG, alheia, { data: hoje, atividades: 'x' }), /responsabilidade/);
  await assert.rejects(OB.salvarDiario(SOC, minha, { data: hoje, atividades: 'x' }), /só consulta/);
  assert.equal((await OB.listar(ADM)).find((o) => o.id === minha).valor_contrato, 100000000);
});

test('presença: só quem está na equipe, nunca no futuro; diário grava uma vez por dia', async () => {
  const id = await nova({ nome: 'Obra Presença' });
  const f = await one("INSERT INTO funcionarios (nome, funcao_obra) VALUES ('Zé Peão', 'peao') RETURNING id");
  const fora = await one("INSERT INTO funcionarios (nome, funcao_obra) VALUES ('Fora da obra', 'servente') RETURNING id");
  await OB.alocar(ADM, id, { funcionario_id: f.id });
  await assert.rejects(OB.alocar(ADM, id, { funcionario_id: f.id }), /já está na equipe/);
  await assert.rejects(OB.alocar(ENG, id, { funcionario_id: fora.id }), /gestão/);
  await OB.registrarPresenca(ENG, id, { data: hoje, registros: [{ funcionario_id: f.id, situacao: 'presente' }] });
  await OB.registrarPresenca(ENG, id, { data: hoje, registros: [{ funcionario_id: f.id, situacao: 'atraso' }] }); // corrige
  const dia = await OB.presencasDoDia(ENG, id, hoje);
  assert.equal(dia.length, 1);
  assert.equal(dia[0].situacao, 'atraso');
  await assert.rejects(OB.registrarPresenca(ENG, id, { data: d(1), registros: [{ funcionario_id: f.id, situacao: 'presente' }] }), /futura/);
  await assert.rejects(OB.registrarPresenca(ENG, id, { data: hoje, registros: [{ funcionario_id: fora.id, situacao: 'presente' }] }), /não pertence/);
  await assert.rejects(OB.registrarPresenca(ENG, id, { data: hoje, registros: [{ funcionario_id: f.id, situacao: 'dormindo' }] }), /inválida/);
  assert.equal((await OB.detalhe(ENG, id)).obra.presentes_hoje, 1);
  await OB.salvarDiario(ENG, id, { data: hoje, atividades: 'Fundação', efetivo: 5 });
  await OB.salvarDiario(ENG, id, { data: hoje, atividades: 'Fundação e baldrame', efetivo: 6 });
  const diario = (await OB.detalhe(ENG, id)).diario;
  assert.equal(diario.length, 1);
  assert.equal(diario[0].efetivo, 6);
  await assert.rejects(OB.salvarDiario(ENG, id, { data: hoje, atividades: '' }), /atividades/);
  await OB.desalocar(ADM, id, f.id);
  assert.equal((await OB.presencasDoDia(ENG, id, d(1))).length, 0, 'depois de retirado, não aparece nas datas seguintes');
});

test('materiais: pedido, entrega, pagamento ligado ao caixa e à obra (sem custo em dobro)', async () => {
  const id = await nova({ nome: 'Obra Materiais' });
  const m = await MT.salvarMaterial(ENG, id, null, { descricao: 'Cimento CP-II', unidade: 'sc', quantidade: 100, valor_unit: 3500, status: 'pedido', entrega_prevista: hoje });
  let det = await OB.detalhe(ADM, id);
  assert.equal(det.materiais[0].total, 350000);
  assert.equal(det.obra.material_a_pagar, 350000);
  assert.equal(det.obra.custo_comprometido, 350000);
  await MT.mudarStatusMaterial(ENG, m, 'entregue');
  assert.ok((await OB.detalhe(ADM, id)).materiais[0].entregue_em);
  const l = await MT.pagarMaterial(ADM, m, { conta_id: conta, categoria_id: await cat('Cimento e concreto') }, S.criarLancamento);
  assert.equal(l.valor, 350000);
  assert.equal(l.obra_id, id);
  det = await OB.detalhe(ADM, id);
  assert.equal(det.obra.material_a_pagar, 0);
  assert.equal(det.obra.custo_pago, 350000);
  assert.equal(det.obra.custo_comprometido, 350000, 'pagar não duplica o custo');
  await assert.rejects(MT.pagarMaterial(ADM, m, { conta_id: conta }, S.criarLancamento), /já foi pago/);
  await assert.rejects(MT.excluirMaterial(ADM, m), /já foi pago/);
  await assert.rejects(MT.salvarMaterial(ENG, id, null, { descricao: '', quantidade: 1 }), /Descreva/);
  await assert.rejects(MT.salvarMaterial(ENG, id, null, { descricao: 'x', quantidade: 0 }), /quantidade/);
  const resumo = await MT.resumoMateriais(ADM);
  assert.ok(resumo.comprado_mes >= 350000);
  const alheio = await nova({ nome: 'Obra de outro', engenheiro_id: camila });
  await assert.rejects(MT.salvarMaterial(ENG, alheio, null, { descricao: 'y', quantidade: 1 }), /responsabilidade/);
  assert.ok(!(await MT.listarMateriais(ENG)).some((x) => x.obra_id === alheio));
});

test('documentos: ART exige número e quem emitiu; anexo validado; checklist por tipo; conformidade', async () => {
  const id = await nova({ nome: 'Obra Documentos' });
  assert.ok((await DC.gerarChecklist(ENG, id)) >= 8);
  assert.equal(await DC.gerarChecklist(ENG, id), 0, 'não duplica');
  await assert.rejects(DC.salvarDocumento(ENG, id, { tipo: 'ART', status: 'emitido', emitido_em: hoje }), /número da ART/);
  await assert.rejects(DC.salvarDocumento(ENG, id, { tipo: 'ART', status: 'emitido', emitido_em: hoje, numero: '123' }), /quem emitiu/);
  await assert.rejects(DC.salvarDocumento(ENG, id, { tipo: 'XYZ', status: 'pendente' }), /Tipo de documento/);
  await assert.rejects(DC.salvarDocumento(ENG, id, { tipo: 'ALVARA', status: 'emitido' }), /data de emissão/);
  await assert.rejects(DC.salvarDocumento(ENG, id, { tipo: 'ART', status: 'pendente', anexo: { nome: 'a.exe', base64: Buffer.from('MZ....').toString('base64') } }), /PDF, JPG ou PNG/);
  const pdf = Buffer.from('%PDF-1.4\nexemplo\n').toString('base64');
  await DC.salvarDocumento(ENG, id, { tipo: 'ART', status: 'emitido', numero: 'RJ2026001', emitido_por_id: rodrigo, emitido_em: hoje, anexo: { nome: 'art.pdf', base64: pdf } });
  const det = await OB.detalhe(ENG, id);
  const art = det.documentos.find((x) => x.tipo === 'ART');
  assert.equal(art.emitido_por, 'Rodrigo Carvalho');
  assert.equal(art.conselho, 'CREA-RJ');
  assert.equal(art.anexo_nome, 'art.pdf');
  assert.ok(!('anexo' in art), 'o conteúdo do arquivo não vai na listagem');
  const arq = await DC.lerAnexoDocumento(ENG, art.id);
  assert.equal(arq.tipo, 'application/pdf');
  await assert.rejects(DC.lerAnexoDocumento(OUTRO, art.id), /responsabilidade/);
  await DC.salvarDocumento(ADM, id, { tipo: 'ALVARA', status: 'emitido', emitido_em: d(-400), validade: d(-3), emissor_externo: 'Prefeitura' });
  const conf = await DC.conformidade(ENG);
  const linha = conf.obras.find((o) => o.id === id);
  assert.equal(linha.documentos.find((x) => x.tipo === 'ALVARA').situacao, 'vencido');
  assert.equal(linha.documentos.find((x) => x.tipo === 'ART').situacao, 'ok');
  assert.ok(conf.resumo.vencidos >= 1 && conf.resumo.pendentes >= 1);
  assert.equal(DC.situacaoDoc({ status: 'emitido', validade: d(10) }), 'vence_logo');
  assert.equal(DC.situacaoDoc({ status: 'dispensado' }), 'dispensado');
  const al = await PN.alertas(ENG);
  assert.ok(al.some((a) => a.obra_id === id && a.tipo === 'doc_vencido' && /ALVARA/.test(a.titulo)));
  await DC.removerAnexo(ENG, art.id);
  await assert.rejects(DC.lerAnexoDocumento(ENG, art.id), /não tem arquivo/);
});

test('medição recebida lança a entrada no caixa ligada à obra, uma única vez', async () => {
  const id = await nova({ nome: 'Obra Medição' });
  await assert.rejects(OB.salvarMedicao(ENG, id, null, { data_prevista: hoje, valor: 100 }), /gestão/);
  const med = await OB.salvarMedicao(ADM, id, null, { descricao: 'Fundação', data_prevista: d(5), valor: 2500000 });
  let det = await OB.detalhe(ADM, id);
  assert.equal(det.obra.a_receber, 2500000);
  const l = await OB.receberMedicao(ADM, med, { conta_id: conta, data: hoje }, S.criarLancamento);
  assert.equal(l.tipo, 'entrada');
  assert.equal(l.obra_id, id);
  assert.equal(l.categoria, 'Medição recebida');
  det = await OB.detalhe(ADM, id);
  assert.equal(det.obra.recebido, 2500000);
  assert.equal(det.obra.a_receber, 0);
  await assert.rejects(OB.receberMedicao(ADM, med, { conta_id: conta }, S.criarLancamento), /já foi recebida/);
  await assert.rejects(OB.salvarMedicao(ADM, id, null, { data_prevista: hoje, valor: 0 }), /maior que zero/);
  await assert.rejects(OB.excluir(ADM, id), /lançamentos/, 'obra com movimento no caixa não é excluída');
});

test('orçamento ganho vira obra uma única vez', async () => {
  const fic = { nome: 'Cliente Obra', telefone: '(21) 98888-1234', email: 'obra@x.com', aniversario: '1985-05-05' };
  const o = await CO.criarOrcamento({ cliente: fic, produto_nome: 'Reforma completa', valor: 80000000, origem: 'indicacao' }, ADM);
  await assert.rejects(OB.criarDeOrcamento(ADM, o.id), /ganho/);
  await CO.mudarStatus(o.id, { status: 'ganho' }, ADM);
  const id = await OB.criarDeOrcamento(ADM, o.id, { tipo: 'reforma', cidade: 'Niterói' });
  const det = await OB.detalhe(ADM, id);
  assert.equal(det.obra.valor_contrato, 80000000);
  assert.equal(det.obra.cliente, 'Cliente Obra');
  assert.equal(det.obra.orcamento_id, o.id);
  await assert.rejects(OB.criarDeOrcamento(ADM, o.id), /já virou obra/);
  await assert.rejects(OB.criarDeOrcamento(ENG, o.id), /gestão/);
});

test('alertas do engenheiro: entrega hoje, entrega atrasada e aviso da gestão', async () => {
  const id = await nova({ nome: 'Obra Alertas' });
  await MT.salvarMaterial(ADM, id, null, { descricao: 'Caminhão de cimento', unidade: 'un', quantidade: 1, valor_unit: 100, status: 'pedido', entrega_prevista: hoje });
  await MT.salvarMaterial(ADM, id, null, { descricao: 'Tubos atrasados', unidade: 'un', quantidade: 1, valor_unit: 100, status: 'pedido', entrega_prevista: d(-2) });
  await OB.salvarEvento(ADM, id, null, { data: hoje, hora: '08:00', tipo: 'concretagem', titulo: 'Concretagem da laje' });
  await assert.rejects(PN.criarAviso(ENG, { obra_id: id, titulo: 'x' }), /gestão/);
  await PN.criarAviso(ADM, { obra_id: id, titulo: 'Hoje chega o cimento', prioridade: 'alta' });
  const dia = await PN.meuDia(ENG);
  const meus = dia.alertas.filter((a) => a.obra_id === id);
  assert.ok(meus.some((a) => a.tipo === 'entrega' && a.nivel === 'alta' && /HOJE/.test(a.titulo)));
  assert.ok(meus.some((a) => a.tipo === 'entrega_atrasada'));
  assert.ok(meus.some((a) => a.tipo === 'agenda'));
  const aviso = dia.avisos.find((a) => a.titulo === 'Hoje chega o cimento');
  assert.ok(aviso && !aviso.lido_em);
  const outro = await PN.meuDia(OUTRO);
  assert.ok(!outro.avisos.some((a) => a.titulo === 'Hoje chega o cimento'), 'aviso da obra só chega ao engenheiro dela');
  await assert.rejects(PN.marcarLido(OUTRO, aviso.id), /não é para você/);
  await PN.marcarLido(ENG, aviso.id);
  assert.ok((await PN.meuDia(ENG)).avisos.find((a) => a.id === aviso.id).lido_em);
  const agenda = await OB.agendaMes(ENG, hoje.slice(0, 7));
  assert.ok(agenda.eventos.some((e) => e.titulo === 'Concretagem da laje') && agenda.materiais.length >= 1);
  assert.deepEqual(agenda.medicoes, [], 'engenheiro não vê medições');
});

test('visão geral e painel do investidor trazem totais coerentes', async () => {
  const v = await PN.visao(ADM);
  assert.ok(v.kpis.obras_andamento >= 1 && v.kpis.carteira > 0);
  assert.equal(v.serie.length, 6);
  const inv = await PN.investidor(ADM);
  assert.equal(inv.socios.length, 3);
  assert.equal(inv.capital.total_aportado, 400000000);
  assert.equal(inv.socios.reduce((a, s) => a + s.participacao, 0), 100);
  assert.ok(inv.carteira.contratos > 0);
});

test('API: perfis e áreas de obra', async () => {
  const entrar = async (login) => (await chamar('POST', '/api/auth/login', { email: login, senha: 'senha-forte-1' })).cookie;
  const [cAdm, cEng, cSoc] = [await entrar('diogo'), await entrar('rodrigo'), await entrar('inv')];
  assert.equal((await chamar('GET', '/api/obras')).status, 401);
  assert.equal((await chamar('GET', '/api/obras', null, cAdm)).status, 200);
  assert.equal((await chamar('GET', '/api/obras', null, cEng)).status, 200);
  assert.equal((await chamar('GET', '/api/visao', null, cEng)).status, 403);
  assert.equal((await chamar('GET', '/api/investidor', null, cEng)).status, 403);
  assert.equal((await chamar('GET', '/api/painel/2026-01', null, cEng)).status, 403, 'engenheiro não vê o financeiro');
  assert.equal((await chamar('POST', '/api/lancamentos', { tipo: 'saida' }, cEng)).status, 403);
  assert.equal((await chamar('GET', '/api/engenheiro/meu-dia', null, cEng)).status, 200);
  assert.equal((await chamar('GET', '/api/investidor', null, cSoc)).status, 200);
  assert.equal((await chamar('GET', '/api/engenheiro/meu-dia', null, cSoc)).status, 403);
  const nova1 = await chamar('POST', '/api/obras', { nome: 'Pela API', valor_contrato: 1000000 }, cSoc);
  assert.equal(nova1.status, 403, 'sócio só consulta');
  const ok = await chamar('POST', '/api/obras', { nome: 'Pela API', valor_contrato: 1000000 }, cAdm);
  assert.equal(ok.status, 201);
  assert.equal((await chamar('GET', `/api/obras/${ok.json.id}`, null, cEng)).status, 403, 'obra sem engenheiro não é do Rodrigo');
  assert.equal((await chamar('GET', '/api/obras/999999', null, cAdm)).status, 404);
  assert.equal((await chamar('GET', '/api/obras/abc', null, cAdm)).status, 400);
  // lançamento do caixa ligado à obra
  const catSaida = await cat('Diárias');
  const l = await chamar('POST', '/api/lancamentos', { data: hoje, tipo: 'saida', valor: 12000, conta_id: conta, categoria_id: catSaida, obra_id: ok.json.id }, cAdm);
  assert.equal(l.status, 201);
  assert.equal(l.json.obra_id, ok.json.id);
  assert.equal((await chamar('POST', '/api/lancamentos', { data: hoje, tipo: 'saida', valor: 12000, conta_id: conta, categoria_id: catSaida, obra_id: 9999 }, cAdm)).status, 400);
  const painel = (await chamar('GET', `/api/painel/${hoje.slice(0, 7)}`, null, cAdm)).json;
  assert.ok(painel.saidas_por_obra.some((o) => /Pela API/.test(o.nome)));
  // upload de documento pela API
  const doc = await chamar('POST', `/api/obras/${ok.json.id}/documentos`, { tipo: 'CONTRATO', status: 'emitido', emitido_em: hoje, anexo: { nome: 'c.pdf', base64: Buffer.from('%PDF-1.4 x').toString('base64') } }, cAdm);
  assert.equal(doc.status, 201);
  const lista = (await chamar('GET', `/api/obras/${ok.json.id}`, null, cAdm)).json;
  const arquivo = await fetch(`${base}/api/documentos/${lista.documentos[0].id}/arquivo`, { headers: { cookie: cAdm } });
  assert.equal(arquivo.status, 200);
  assert.equal(arquivo.headers.get('content-type'), 'application/pdf');
  assert.equal((await fetch(`${base}/api/documentos/${lista.documentos[0].id}/arquivo`, { headers: { cookie: cEng } })).status, 403);
});

test('almoxarifado: saída pode ir para uma obra e exige destino', async () => {
  const ES = await import('../src/estoque.js');
  const id = await nova({ nome: 'Obra Almoxarifado' });
  const item = await ES.salvarItem(null, { nome: 'Cimento (almox.)', unidade: 'sc', minimo: 10 });
  await ES.registrarMovimento({ item_id: item, tipo: 'entrada', quantidade: 50, referencia: 'Fornecedor' }, ADM);
  await assert.rejects(ES.registrarMovimento({ item_id: item, tipo: 'saida', quantidade: 5 }, ADM), /obra ou motivo/);
  await ES.registrarMovimento({ item_id: item, tipo: 'saida', quantidade: 5, obra_id: id }, ADM);
  const mov = (await ES.listarMovimentos({ item_id: item })).find((m) => m.tipo === 'saida');
  assert.equal(mov.obra_id, id);
  assert.match(mov.referencia, /Obra Almoxarifado/);
  await assert.rejects(ES.registrarMovimento({ item_id: item, tipo: 'saida', quantidade: 1, obra_id: 99999 }, ADM), /Obra inválida/);
});
