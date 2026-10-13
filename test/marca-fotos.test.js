import { test, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
const { app } = await import('../src/app.js');
const { iniciar, one, query } = await import('../src/db.js');
const { seed } = await import('../src/seed.js');
const A = await import('../src/auth.js');
const AU = await import('../src/auditoria.js');
const servidor = app.listen(0);
await new Promise((r) => (servidor.listening ? r() : servidor.once('listening', r)));
const base = `http://127.0.0.1:${servidor.address().port}`;
after(() => servidor.close());
async function chamar(metodo, url, body, cookie) {
  const r = await fetch(base + url, { method: metodo, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = r.headers.get('set-cookie');
  return { status: r.status, headers: r.headers, json: r.status === 204 ? null : await r.clone().json().catch(() => null), cookie: set?.split(';')[0], r };
}
await iniciar(seed);
await A.criarUsuario({ nome: 'Diogo', login: 'diogo', senha: 'senha-forte-1', papel: 'admin' });
const eng = await A.criarUsuario({ nome: 'Rodrigo', login: 'rodrigo', senha: 'senha-forte-1', papel: 'engenheiro' });
const outro = await A.criarUsuario({ nome: 'Camila', login: 'camila', senha: 'senha-forte-1', papel: 'engenheiro' });
const rod = (await one("SELECT id FROM funcionarios WHERE nome = 'Rodrigo Carvalho'")).id;
await query('UPDATE funcionarios SET usuario_id = $1 WHERE id = $2', [eng.id, rod]);
const entrar = async (l) => (await chamar('POST', '/api/auth/login', { email: l, senha: 'senha-forte-1' })).cookie;
const [cAdm, cEng, cOutro] = [await entrar('diogo'), await entrar('rodrigo'), await entrar('camila')];
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 1)]).toString('base64');
const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const aguardar = async (fn, tentativas = 20) => { for (let i = 0; i < tentativas; i++) { const r = await fn(); if (r) return r; await new Promise((ok) => setTimeout(ok, 50)); } return null; };

test('schema aceita os novos estados de material', async () => {
  const o = (await chamar('POST', '/api/obras', { nome: 'Obra Fotos', engenheiro_id: rod }, cAdm)).json.id;
  const r = await one("INSERT INTO obra_materiais (obra_id, descricao, quantidade, status, data_pedido) VALUES ($1,'x',1,'aguardando_aprovacao',$2) RETURNING id", [o, hoje]);
  assert.ok(r.id);
  await assert.rejects(query("INSERT INTO obra_materiais (obra_id, descricao, quantidade, status, data_pedido) VALUES ($1,'y',1,'inexistente',$2)", [o, hoje]));
});

test('histórico de alterações: descreve a ação e guarda quem fez, sem dados sensíveis', async () => {
  const d = AU.descrever('POST', '/api/obras/7/materiais', { descricao: 'Cimento', valor_unit: 3500, senha: 'segredo', anexo: { base64: 'xxxx' } });
  assert.equal(d.acao, 'Criou material');
  assert.equal(d.obraId, 7);
  assert.match(d.detalhe, /Cimento/);
  assert.match(d.detalhe, /R\$\s?35,00/);
  assert.ok(!/segredo|xxxx/.test(d.detalhe));
  assert.equal(AU.descrever('POST', '/api/materiais/5/pagar', {}).acao, 'Pagou material');
  assert.equal(AU.descrever('DELETE', '/api/fotos/9', {}).acao, 'Excluiu foto');
  const ok = await chamar('POST', '/api/obras', { nome: 'Obra do Histórico', valor_contrato: 1000000 }, cAdm);
  assert.equal(ok.status, 201);
  const lista = await aguardar(async () => { const l = (await chamar('GET', '/api/historico', null, cAdm)).json; return l.some((x) => /Obra do Histórico/.test(x.detalhe || '')) ? l : null; });
  assert.ok(lista, 'a criação da obra aparece no histórico');
  const linha = lista.find((x) => /Obra do Histórico/.test(x.detalhe));
  assert.equal(linha.usuario_nome, 'Diogo');
  assert.equal(linha.acao, 'Criou obra');
  assert.equal((await chamar('POST', '/api/obras', { nome: '' }, cAdm)).status, 400);
  assert.ok(!(await chamar('GET', '/api/historico', null, cAdm)).json.some((x) => x.acao === 'Criou obra' && x.detalhe === null), 'ação que falhou não entra');
  assert.ok(!lista.some((x) => /login/i.test(x.acao)), 'login não entra no histórico');
  assert.equal((await chamar('GET', '/api/historico', null, cEng)).status, 403, 'só a gestão vê o histórico');
});

test('marca: nome, cor e logo (PNG/SVG) com validação e SVG sem script', async () => {
  assert.equal((await chamar('GET', '/api/marca')).json.nome, 'Mota Construções');
  assert.equal((await chamar('GET', '/api/marca/logo')).status, 404);
  assert.equal((await chamar('PUT', '/api/marca', { nome: 'Mota', cor: 'laranja' }, cAdm)).status, 400);
  assert.equal((await chamar('PUT', '/api/marca', { nome: 'Mota Engenharia', cor: '#d9620b' }, cEng)).status, 403);
  const m = await chamar('PUT', '/api/marca', { nome: 'Mota Engenharia', cor: '#d9620b' }, cAdm);
  assert.equal(m.json.cor, '#d9620b');
  assert.equal((await chamar('POST', '/api/marca/logo', { base64: Buffer.from('MZ not an image').toString('base64') }, cAdm)).status, 400);
  assert.equal((await chamar('POST', '/api/marca/logo', { base64: Buffer.alloc(400 * 1024, 1).toString('base64') }, cAdm)).status, 400);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="10" height="10"/></svg>';
  const up = await chamar('POST', '/api/marca/logo', { base64: Buffer.from(svg).toString('base64') }, cAdm);
  assert.equal(up.json.tem_logo, true);
  const logo = await fetch(`${base}/api/marca/logo`);
  assert.equal(logo.headers.get('content-type'), 'image/svg+xml');
  assert.match(logo.headers.get('content-security-policy'), /sandbox/);
  const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(50)]).toString('base64');
  await chamar('POST', '/api/marca/logo', { base64: png }, cAdm);
  assert.equal((await fetch(`${base}/api/marca/logo`)).headers.get('content-type'), 'image/png');
  assert.equal((await chamar('DELETE', '/api/marca/logo', null, cAdm)).status, 204);
  assert.equal((await chamar('GET', '/api/marca')).json.tem_logo, false);
});

test('fotos: JPEG obrigatório, só o engenheiro da obra envia, miniatura e legenda', async () => {
  const obra = (await one("SELECT id FROM obras WHERE nome = 'Obra Fotos'")).id;
  assert.equal((await chamar('POST', `/api/obras/${obra}/fotos`, { dados: Buffer.from('texto').toString('base64'), miniatura: jpeg }, cAdm)).status, 400);
  assert.equal((await chamar('POST', `/api/obras/${obra}/fotos`, { dados: jpeg, miniatura: jpeg }, cOutro)).status, 403, 'engenheiro de outra obra não envia');
  const f = await chamar('POST', `/api/obras/${obra}/fotos`, { dados: jpeg, miniatura: jpeg, legenda: 'Laje concretada', data: hoje }, cEng);
  assert.equal(f.status, 201);
  const lista = (await chamar('GET', `/api/obras/${obra}/fotos`, null, cEng)).json;
  assert.equal(lista.length, 1);
  assert.equal(lista[0].legenda, 'Laje concretada');
  assert.equal(lista[0].autor, 'Rodrigo');
  const img = await fetch(`${base}/api/fotos/${f.json.id}/miniatura`, { headers: { cookie: cEng } });
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.equal((await fetch(`${base}/api/fotos/${f.json.id}/dados`, { headers: { cookie: cOutro } })).status, 403);
  assert.equal((await chamar('POST', `/api/obras/${obra}/fotos`, { dados: jpeg, miniatura: jpeg, data: '2999-01-01' }, cEng)).status, 400);
  assert.equal((await chamar('POST', `/api/obras/${obra}/fotos`, { dados: jpeg, miniatura: jpeg, fase_id: 99999 }, cEng)).status, 400);
  assert.equal((await chamar('PUT', `/api/fotos/${f.json.id}`, { legenda: 'Laje do 2º pavimento', visivel_cliente: true }, cEng)).status, 204);
  assert.equal((await chamar('GET', `/api/obras/${obra}/fotos`, null, cAdm)).json[0].visivel_cliente, 1);
  assert.equal((await chamar('DELETE', `/api/fotos/${f.json.id}`, null, cOutro)).status, 403);
  assert.equal((await chamar('DELETE', `/api/fotos/${f.json.id}`, null, cEng)).status, 204);
});
