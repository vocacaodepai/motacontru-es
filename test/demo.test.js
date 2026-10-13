import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
process.env.DEMO = '1';
const { iniciar, one, query } = await import('../src/db.js');
const { seed } = await import('../src/seed.js');
const { popularDemo } = await import('../src/demo-mota.js');
const S = await import('../src/services.js');
const PN = await import('../src/painel.js');
const DC = await import('../src/documentos.js');
const A = await import('../src/auth.js');

await iniciar(seed);

test('dados de demonstração: obras, equipe, documentos e caixa coerentes', async () => {
  assert.equal((await one('SELECT COUNT(*) AS n FROM obras')).n, 7);
  assert.equal(await popularDemo(), false, 'rodar de novo não duplica');
  assert.equal((await one('SELECT COUNT(*) AS n FROM obras')).n, 7);
  assert.ok((await one('SELECT COUNT(*) AS n FROM funcionarios')).n >= 30);
  const saldos = await S.saldos(S.hoje());
  assert.ok(saldos.every((c) => c.saldo >= 0), 'nenhuma conta fica negativa na demonstração');
  const adm = await A.login('diogo.mota', 'mota2026', '1.1.1.1');
  assert.equal(adm.usuario.papel, 'admin');
  const v = await PN.visao({ id: adm.usuario.id, papel: 'admin' });
  assert.equal(v.kpis.obras_andamento, 5);
  assert.ok(v.alertas.length > 5);
  const eng = await A.login('rodrigo.carvalho', 'mota2026', '1.1.1.1');
  const dia = await PN.meuDia({ id: eng.usuario.id, nome: eng.usuario.nome, papel: 'engenheiro' });
  assert.ok(dia.obras.length >= 2 && dia.obras.every((o) => o.valor_contrato === null));
  assert.ok(dia.alertas.some((a) => a.tipo === 'entrega' && a.nivel === 'alta'), 'hoje chega material');
  const conf = await DC.conformidade({ id: adm.usuario.id, papel: 'admin' });
  assert.ok(conf.resumo.vencidos >= 1 && conf.resumo.ok > 10);
  const inv = await PN.investidor({ id: adm.usuario.id, papel: 'admin' });
  assert.ok(inv.carteira.margem_pct > 15 && inv.carteira.margem_pct < 40);
  const obrasSemFases = await query("SELECT id FROM obras o WHERE status IN ('em_andamento','concluida') AND NOT EXISTS (SELECT 1 FROM obra_fases f WHERE f.obra_id = o.id)");
  assert.equal(obrasSemFases.length, 0);
});
