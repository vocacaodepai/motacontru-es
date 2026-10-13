// Folha semanal de diárias: a presença registrada nas obras × a diária de cada pessoa. O pagamento vira saída no caixa, ligada à obra.
import { query, one, tx } from './db.js';
import { ErroNegocio, isData, hoje, addDias, criarLancamento } from './services.js';

export const segundaDe = (data) => { const d = new Date(data + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

export async function semana(dataQualquer) {
  if (!isData(dataQualquer)) throw new ErroNegocio('Data inválida.');
  const inicio = segundaDe(dataQualquer), fim = addDias(inicio, 6);
  const rows = await query(`SELECT p.funcionario_id, f.nome, f.funcao_obra, f.valor_diaria, p.obra_id, o.codigo, o.nome AS obra,
      COUNT(*) FILTER (WHERE p.situacao IN ('presente','atraso'))::int AS dias,
      COUNT(*) FILTER (WHERE p.situacao = 'falta')::int AS faltas,
      COUNT(*) FILTER (WHERE p.situacao = 'atraso')::int AS atrasos,
      fp.id AS pagamento_id, fp.valor AS valor_pago, fp.criado_em AS pago_em
    FROM obra_presencas p JOIN funcionarios f ON f.id = p.funcionario_id JOIN obras o ON o.id = p.obra_id
    LEFT JOIN folha_pagamentos fp ON fp.funcionario_id = p.funcionario_id AND fp.obra_id = p.obra_id AND fp.semana_inicio = $1
    WHERE p.data BETWEEN $1 AND $2 AND f.valor_diaria IS NOT NULL AND f.valor_diaria > 0
    GROUP BY p.funcionario_id, f.nome, f.funcao_obra, f.valor_diaria, p.obra_id, o.codigo, o.nome, fp.id, fp.valor, fp.criado_em
    HAVING COUNT(*) FILTER (WHERE p.situacao IN ('presente','atraso')) > 0 ORDER BY o.codigo, f.nome`, [inicio, fim]);
  const linhas = rows.map((r) => ({ ...r, valor: r.dias * r.valor_diaria, pago: !!r.pagamento_id }));
  const soma = (l) => l.reduce((a, r) => a + r.valor, 0);
  const porObra = {};
  for (const r of linhas) (porObra[r.codigo] ??= { codigo: r.codigo, obra: r.obra, obra_id: r.obra_id, total: 0, pendente: 0, pessoas: 0 }), porObra[r.codigo].total += r.valor, porObra[r.codigo].pessoas++, (porObra[r.codigo].pendente += r.pago ? 0 : r.valor);
  return { inicio, fim, hoje: hoje(), linhas, total: soma(linhas), pendente: soma(linhas.filter((r) => !r.pago)), pago: soma(linhas.filter((r) => r.pago)), por_obra: Object.values(porObra) };
}

// Paga a semana (todas as pessoas pendentes, ou só as escolhidas). Nunca paga duas vezes a mesma pessoa/obra/semana.
export async function pagar(usuario, { semana: dataSemana, conta_id, itens }) {
  if (!Number.isInteger(Number(conta_id))) throw new ErroNegocio('Escolha a conta de onde sai o pagamento.');
  const s = await semana(dataSemana);
  if (s.fim >= hoje() && s.inicio > hoje()) throw new ErroNegocio('Não dá para pagar uma semana que ainda não começou.');
  const escolhidos = Array.isArray(itens) && itens.length ? new Set(itens.map((i) => `${i.funcionario_id}:${i.obra_id}`)) : null;
  const alvo = s.linhas.filter((r) => !r.pago && (!escolhidos || escolhidos.has(`${r.funcionario_id}:${r.obra_id}`)));
  if (!alvo.length) throw new ErroNegocio('Nada pendente para pagar nesta semana.', 409);
  const cat = await one("SELECT id FROM categorias WHERE nome = 'Diárias'");
  const br = (d) => d.split('-').reverse().slice(0, 2).join('/');
  return tx(async () => {
    for (const r of alvo) {
      const pessoa = (await one('SELECT pessoa_id FROM funcionarios WHERE id = $1', [r.funcionario_id]))?.pessoa_id ?? null;
      const l = await criarLancamento({ data: hoje(), tipo: 'saida', valor: r.valor, conta_id: Number(conta_id), categoria_id: cat?.id, obra_id: r.obra_id, pessoa_id: pessoa,
        descricao: `Diárias ${br(s.inicio)} a ${br(s.fim)} — ${r.nome} (${r.dias} dia${r.dias > 1 ? 's' : ''})`, criado_por: usuario.nome, criado_por_id: usuario.id });
      await query('INSERT INTO folha_pagamentos (funcionario_id, obra_id, semana_inicio, dias, valor, lancamento_id, criado_por_id) VALUES ($1,$2,$3,$4,$5,$6,$7)', [r.funcionario_id, r.obra_id, s.inicio, r.dias, r.valor, l.id, usuario.id]);
    }
    return { pagos: alvo.length, total: alvo.reduce((a, r) => a + r.valor, 0) };
  });
}
