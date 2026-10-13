// Portal do cliente: o cliente enxerga só a obra dele — avanço, etapas, fotos liberadas, medições, marcos e pendências.
// Nunca expõe custos, margem, fornecedores, equipe ou documentos internos.
import { query, one, tx } from './db.js';
import { ErroNegocio, hoje } from './services.js';
import * as A from './auth.js';
import { ritmo } from './obras.js';

export const obrasDoCliente = async (usuario) => (await query('SELECT obra_id FROM cliente_acessos WHERE usuario_id = $1', [usuario.id])).map((r) => r.obra_id);
export async function exigirObraDoCliente(usuario, obraId) {
  if (!(await obrasDoCliente(usuario)).includes(Number(obraId))) throw new ErroNegocio('Esta obra não está disponível para o seu acesso.', 403);
}

export async function portal(usuario) {
  const h = hoje(), ids = await obrasDoCliente(usuario);
  if (!ids.length) return { hoje: h, obras: [] };
  const obras = await query(`SELECT o.id, o.codigo, o.nome, o.status, o.tipo, o.endereco, o.bairro, o.cidade, o.uf, o.area_m2, o.data_inicio, o.previsao_fim, o.fim_real, o.valor_contrato, e.nome AS responsavel,
      COALESCE((SELECT SUM(f.progresso * f.peso)::float8 / NULLIF(SUM(f.peso), 0) FROM obra_fases f WHERE f.obra_id = o.id), 0) AS progresso,
      (SELECT f.nome FROM obra_fases f WHERE f.obra_id = o.id AND f.progresso < 100 ORDER BY f.ordem, f.id LIMIT 1) AS fase_atual
    FROM obras o LEFT JOIN funcionarios e ON e.id = o.engenheiro_id WHERE o.id = ANY($1::bigint[]) ORDER BY o.codigo`, [ids]);
  const out = [];
  for (const o of obras) {
    const progresso = Math.round(o.progresso);
    const [etapas, fotos, medicoes, marcos, pendencias, diario] = await Promise.all([
      query('SELECT nome, progresso, inicio_prev, fim_prev FROM obra_fases WHERE obra_id = $1 ORDER BY ordem, id', [o.id]),
      query('SELECT f.id, f.data, f.legenda, fs.nome AS etapa FROM obra_fotos f LEFT JOIN obra_fases fs ON fs.id = f.fase_id WHERE f.obra_id = $1 AND f.visivel_cliente = 1 ORDER BY f.data DESC, f.id DESC LIMIT 60', [o.id]),
      query('SELECT numero, descricao, data_prevista, valor, status, recebido_em FROM obra_medicoes WHERE obra_id = $1 ORDER BY numero', [o.id]),
      query("SELECT data, hora, tipo, titulo FROM obra_eventos WHERE obra_id = $1 AND status = 'agendado' AND data >= $2 AND tipo IN ('vistoria','reuniao','entrega_cliente','medicao') ORDER BY data, hora NULLS LAST LIMIT 6", [o.id, h]),
      query('SELECT local, descricao, status, prazo, resolvida_em FROM obra_pendencias WHERE obra_id = $1 ORDER BY (status = \'resolvida\'), prazo NULLS LAST', [o.id]),
      query('SELECT data, atividades FROM obra_diario WHERE obra_id = $1 ORDER BY data DESC LIMIT 5', [o.id]),
    ]);
    const r = ritmo({ ...o, status: o.status }, progresso, h);
    const recebido = medicoes.filter((m) => m.status === 'recebida').reduce((a, m) => a + m.valor, 0);
    out.push({ ...o, progresso, ritmo: r && { situacao: r.situacao, dias_restantes: r.dias_restantes }, etapas, fotos, marcos, pendencias, atividades: diario,
      financeiro: { contrato: o.valor_contrato, pago: recebido, a_pagar: medicoes.filter((m) => m.status !== 'recebida').reduce((a, m) => a + m.valor, 0), medicoes } });
  }
  return { hoje: h, obras: out };
}

// Gestão: cria o acesso de um cliente (login próprio) já ligado a uma ou mais obras
export async function criarAcesso(admin, b) {
  if (admin.papel !== 'admin') throw new ErroNegocio('Só a gestão cria acessos de cliente.', 403);
  const obraIds = (Array.isArray(b.obra_ids) ? b.obra_ids : [b.obra_id]).map(Number).filter(Boolean);
  if (!obraIds.length) throw new ErroNegocio('Escolha a obra do cliente.');
  for (const id of obraIds) if (!(await one('SELECT 1 AS x FROM obras WHERE id = $1', [id]))) throw new ErroNegocio('Obra inválida.');
  return tx(async () => {
    const u = await A.criarUsuario({ nome: b.nome, email: b.email, login: b.login, senha: b.senha, papel: 'cliente' });
    for (const id of obraIds) await query('INSERT INTO cliente_acessos (usuario_id, obra_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [u.id, id]);
    return u;
  });
}
export const acessosDaObra = (obraId) => query(`SELECT u.id, u.nome, u.email, u.login, u.ativo, u.ultimo_acesso FROM cliente_acessos a JOIN usuarios u ON u.id = a.usuario_id WHERE a.obra_id = $1 ORDER BY u.nome`, [obraId]);
export async function removerAcesso(admin, obraId, usuarioId) {
  if (admin.papel !== 'admin') throw new ErroNegocio('Só a gestão remove acessos de cliente.', 403);
  await query('DELETE FROM cliente_acessos WHERE obra_id = $1 AND usuario_id = $2', [obraId, usuarioId]);
}
