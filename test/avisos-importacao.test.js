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
const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
test('importação de planilhas: prévia não grava; confirmar grava; erro em uma linha bloqueia tudo', async () => {
  const csv = 'Nome;CPF;Função;Telefone;Admissão;Diária\r\nMaria Teste;;pedreiro;(21) 98888-7777;01/03/2026;"220,50"\r\nJoão Teste;;servente;;;\r\n';
  const antes = (await one("SELECT COUNT(*)::int AS n FROM funcionarios")).n;
  const pv = await chamar('POST', '/api/importar/funcionarios', { csv }, cAdm);
  assert.equal(pv.status, 200); assert.equal(pv.json.validas, 2); assert.equal(pv.json.confirmado, false);
  assert.equal((await one("SELECT COUNT(*)::int AS n FROM funcionarios")).n, antes);
  const ok = await chamar('POST', '/api/importar/funcionarios', { csv, confirmar: true }, cAdm);
  assert.equal(ok.json.confirmado, true);
  const m = await one("SELECT valor_diaria, data_admissao FROM funcionarios WHERE nome = 'Maria Teste'");
  assert.equal(m.valor_diaria, 22050);
  assert.equal((await one("SELECT COUNT(*)::int AS n FROM funcionarios")).n, antes + 2);
  const ruim = await chamar('POST', '/api/importar/funcionarios', { csv: 'nome;cpf\nAna Boa;\nBeto Ruim;123', confirmar: true }, cAdm);
  assert.equal(ruim.json.confirmado, false); assert.equal(ruim.json.com_erro, 1);
  assert.equal((await one("SELECT COUNT(*)::int AS n FROM funcionarios WHERE nome = 'Ana Boa'")).n, 0);
  const f1 = await chamar('POST', '/api/importar/fornecedores', { csv: 'nome,cnpj,prazo_dias\nDepósito A,,2\nDepósito A,,3', confirmar: true }, cAdm);
  assert.equal(f1.json.confirmado, false); assert.match(f1.json.linhas[1].erro, /já existe/i);
  assert.equal((await chamar('POST', '/api/importar/fornecedores', { csv: 'nome\nDepósito B', confirmar: true }, cAdm)).json.confirmado, true);
  assert.equal((await chamar('POST', '/api/importar/funcionarios', { csv }, cEng)).status, 403);
  const modelo = await fetch(base + '/api/importar/fornecedores/modelo.csv', { headers: { cookie: cAdm } });
  assert.match(await modelo.text(), /nome;cnpj/);
});

test('avisos por WhatsApp: fila diária sem repetir, link wa.me e envio por provedor simulado', async () => {
  const o = (await chamar('POST', '/api/obras', { nome: 'Obra Aviso', engenheiro_id: rod, status: 'em_andamento' }, cAdm)).json.id;
  await chamar('POST', `/api/obras/${o}/eventos`, { data: hoje, hora: '08:00', tipo: 'concretagem', titulo: 'Concretagem da laje' }, cAdm);
  assert.equal((await chamar('PUT', `/api/usuarios/${eng.id}/telefone`, { telefone: 'abc' }, cAdm)).status, 400);
  assert.equal((await chamar('PUT', `/api/usuarios/${eng.id}/telefone`, { telefone: '(21) 99999-1234' }, cAdm)).status, 204);
  const g1 = (await chamar('POST', '/api/avisos-whatsapp/gerar', null, cAdm)).json;
  assert.ok(g1.novos >= 1);
  assert.equal((await chamar('POST', '/api/avisos-whatsapp/gerar', null, cAdm)).json.novos, 0);
  const p = (await chamar('GET', '/api/avisos-whatsapp', null, cAdm)).json;
  const meu = p.fila.find((f) => f.nome === 'Rodrigo' && /Concretagem/.test(f.texto));
  assert.ok(meu); assert.match(meu.link, /^https:\/\/wa\.me\/5521999991234\?text=/);
  assert.equal(p.configurado, false);
  assert.match((await chamar('POST', '/api/avisos-whatsapp/enviar', null, cAdm)).json.motivo, /não configurado/);
  // provedor simulado
  const chamadas = []; const f0 = globalThis.fetch;
  process.env.WHATSAPP_WEBHOOK_URL = 'http://provedor.test/enviar';
  globalThis.fetch = async (url, op) => (String(url).startsWith('http://provedor.test') ? (chamadas.push(JSON.parse(op.body)), { ok: true, status: 200 }) : f0(url, op));
  try {
    const r = (await chamar('POST', '/api/avisos-whatsapp/enviar', null, cAdm)).json;
    assert.ok(r.enviados >= 1); assert.ok(chamadas.some((c) => c.to === '5521999991234' && /Concretagem/.test(c.text)));
  } finally { globalThis.fetch = f0; delete process.env.WHATSAPP_WEBHOOK_URL; }
  assert.equal((await chamar('GET', '/api/cron/avisos')).status, 401);
  process.env.CRON_SECRET = 's3gredo';
  const cr = await fetch(base + '/api/cron/avisos', { headers: { authorization: 'Bearer s3gredo' } });
  assert.equal(cr.status, 200); delete process.env.CRON_SECRET;
  assert.equal((await chamar('GET', '/api/avisos-whatsapp', null, cEng)).status, 403);
});

test('mapa: definir e limpar a localização da obra', async () => {
  const o = (await chamar('POST', '/api/obras', { nome: 'Obra Mapa' }, cAdm)).json.id;
  assert.equal((await chamar('PUT', `/api/obras/${o}/local`, { lat: '95', lng: '10' }, cAdm)).status, 400);
  assert.equal((await chamar('PUT', `/api/obras/${o}/local`, { lat: '-23,0087', lng: '-43.3752' }, cAdm)).status, 204);
  const l = (await chamar('GET', '/api/obras', null, cAdm)).json.find((x) => x.id === o);
  assert.equal(Number(l.lat), -23.0087);
  assert.equal((await chamar('PUT', `/api/obras/${o}/local`, { lat: '-23', lng: '-43' }, cEng)).status, 403);
});
