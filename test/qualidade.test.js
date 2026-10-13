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
let obra, obraB;
test('pendências: criar, resolver e restringir ao engenheiro responsável', async () => {
  obra = (await chamar('POST', '/api/obras', { nome: 'Obra Entrega', engenheiro_id: rod, valor_contrato: 500000_00 }, cAdm)).json.id;
  obraB = (await chamar('POST', '/api/obras', { nome: 'Outra Obra' }, cAdm)).json.id;
  assert.equal((await chamar('POST', `/api/obras/${obra}/pendencias`, { descricao: '' }, cEng)).status, 400);
  const p = await chamar('POST', `/api/obras/${obra}/pendencias`, { local: 'Sala', descricao: 'Retocar pintura', prazo: hoje }, cEng);
  assert.equal(p.status, 201);
  assert.equal((await chamar('POST', `/api/obras/${obraB}/pendencias`, { descricao: 'x' }, cEng)).status, 403);
  assert.equal((await chamar('GET', `/api/obras/${obra}/pendencias`, null, cOutro)).status, 403);
  assert.equal((await chamar('PUT', `/api/obras/${obra}/pendencias/${p.json.id}`, { descricao: 'Retocar pintura', status: 'resolvida' }, cEng)).status, 200);
  const l = (await chamar('GET', `/api/obras/${obra}/pendencias`, null, cEng)).json.itens;
  assert.equal(l[0].status, 'resolvida'); assert.ok(l[0].resolvida_em);
  await chamar('POST', `/api/obras/${obra}/pendencias`, { local: 'Cozinha', descricao: 'Porta desalinhada' }, cAdm);
  assert.equal((await chamar('GET', `/api/obras/${obra}`, null, cAdm)).json.obra.pendencias_abertas, 1);
});

test('segurança: treinamento, EPI e inspeção com validações', async () => {
  const f = (await one("SELECT id FROM funcionarios WHERE nome = 'Rodrigo Carvalho'")).id;
  await query("UPDATE funcionarios SET grupo = 'funcionario' WHERE id = $1", [f]);
  await query('INSERT INTO obra_equipe (obra_id, funcionario_id, desde) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [obra, f, hoje]).catch(() => {});
  const amanha = new Date(Date.now() + 864e5 * 2).toLocaleDateString('sv-SE');
  assert.equal((await chamar('POST', '/api/seguranca/treinamentos', { funcionario_id: f, tipo: 'NR-35', data: amanha }, cAdm)).status, 400);
  const t = await chamar('POST', '/api/seguranca/treinamentos', { funcionario_id: f, tipo: 'NR-35 — Trabalho em altura', data: '2024-01-10', validade: '2024-12-31' }, cAdm);
  assert.equal(t.status, 201);
  const painel = (await chamar('GET', '/api/seguranca', null, cAdm)).json;
  const p = painel.pessoas.find((x) => x.id === f);
  assert.equal(p.treinamentos[0].situacao, 'vencido'); assert.ok(p.sem_integracao);
  assert.ok(painel.resumo.vencidos >= 1);
  const itens = painel.checklist.map((item, i) => ({ item, ok: i !== 2 }));
  assert.equal((await chamar('POST', `/api/obras/${obra}/inspecoes`, { itens }, cEng)).status, 400); // não conforme exige observação
  assert.equal((await chamar('POST', `/api/obras/${obra}/inspecoes`, { itens, observacoes: 'Reparar escada' }, cEng)).status, 201);
  assert.equal((await chamar('GET', `/api/obras/${obra}/inspecoes`, null, cEng)).json[0].conformes, itens.length - 1);
  assert.equal((await chamar('DELETE', `/api/seguranca/treinamentos/${t.json.id}`, null, cAdm)).status, 204);
});

test('PDFs: relatório do cliente e interno, diário e termo de entrega', async () => {
  await chamar('POST', `/api/obras/${obra}/diario`, { data: hoje, atividades: 'Concretagem da laje', clima: 'sol' }, cEng);
  for (const url of [`/api/obras/${obra}/relatorio.pdf?tipo=cliente`, `/api/obras/${obra}/relatorio.pdf?tipo=interno`, `/api/obras/${obra}/diario.pdf`, `/api/obras/${obra}/termo-entrega.pdf`]) {
    const r = await fetch(base + url, { headers: { cookie: cAdm } });
    assert.equal(r.status, 200, url);
    assert.match(r.headers.get('content-type'), /pdf/);
    assert.equal(Buffer.from(await r.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
  }
  assert.equal((await fetch(base + `/api/obras/${obra}/relatorio.pdf?tipo=interno`, { headers: { cookie: cEng } })).status, 403); // custos só para a gestão
  assert.equal((await fetch(base + `/api/obras/${obra}/relatorio.pdf?tipo=cliente`, { headers: { cookie: cEng } })).status, 200);
  assert.equal((await fetch(base + `/api/obras/${obra}/termo-entrega.pdf`, { headers: { cookie: cOutro } })).status, 403);
});

test('portal do cliente: vê só a própria obra, sem custos, e nada de gestão', async () => {
  const c = await chamar('POST', `/api/obras/${obra}/acessos-cliente`, { nome: 'Cliente Teste', login: 'cliente1', senha: 'senha-forte-1' }, cAdm);
  assert.equal(c.status, 201);
  assert.equal((await chamar('POST', `/api/obras/${obra}/acessos-cliente`, { nome: 'X', login: 'x', senha: 'senha-forte-1' }, cEng)).status, 403);
  const cCli = await entrar('cliente1');
  const jpeg2 = jpeg;
  const f1 = await chamar('POST', `/api/obras/${obra}/fotos`, { dados: jpeg2, miniatura: jpeg2, legenda: 'Pública', visivel_cliente: true }, cEng);
  const f2 = await chamar('POST', `/api/obras/${obra}/fotos`, { dados: jpeg2, miniatura: jpeg2, legenda: 'Interna' }, cEng);
  const portal = await chamar('GET', '/api/portal', null, cCli);
  assert.equal(portal.status, 200);
  assert.equal(portal.json.obras.length, 1);
  const o = portal.json.obras[0];
  assert.equal(o.fotos.length, 1);
  assert.ok(o.pendencias.some((p) => p.descricao === 'Porta desalinhada'));
  const texto = JSON.stringify(portal.json);
  assert.ok(!/orcamento_custo|margem|custo_pago|salario|engenheiro_id|valor_diaria/.test(texto));
  assert.equal((await fetch(base + `/api/fotos/${f1.json.id}/miniatura`, { headers: { cookie: cCli } })).status, 200);
  assert.equal((await fetch(base + `/api/fotos/${f2.json.id}/miniatura`, { headers: { cookie: cCli } })).status, 403);
  for (const url of ['/api/obras', `/api/obras/${obra}`, `/api/obras/${obraB}/pendencias`, '/api/meta', '/api/seguranca', '/api/lancamentos', `/api/obras/${obra}/relatorio.pdf`, '/api/painel/visao'])
    assert.ok([403, 404].includes((await fetch(base + url, { headers: { cookie: cCli } })).status), url);
  assert.deepEqual((await chamar('GET', '/api/equipe', null, cCli)).json.equipe, []);
  // outro cliente, sem vínculo, não vê nada
  await chamar('POST', `/api/obras/${obraB}/acessos-cliente`, { nome: 'Cliente 2', login: 'cliente2', senha: 'senha-forte-1' }, cAdm);
  const p2 = (await chamar('GET', '/api/portal', null, await entrar('cliente2'))).json;
  assert.equal(p2.obras.length, 1); assert.equal(p2.obras[0].id, obraB);
  assert.equal(p2.obras[0].fotos.length, 0);
});
