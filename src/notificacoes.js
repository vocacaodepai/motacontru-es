// Avisos por WhatsApp: monta uma fila diária com os alertas urgentes de cada pessoa e envia por um provedor configurável.
// Sem provedor configurado, a fila fica pronta e cada aviso tem um link wa.me para enviar manualmente (nada se perde).
import { query, one } from './db.js';
import { ErroNegocio, hoje } from './services.js';
import { alertas } from './painel.js';

const soNumeros = (t) => String(t || '').replace(/\D/g, '');
export const normalizarTelefone = (t) => { let d = soNumeros(t); if (d.length === 10 || d.length === 11) d = '55' + d; return d.length >= 12 && d.length <= 13 ? d : null; };
export const provedorConfigurado = () => !!process.env.WHATSAPP_WEBHOOK_URL;

export async function definirTelefone(admin, usuarioId, telefone) {
  if (admin.papel !== 'admin') throw new ErroNegocio('Só a gestão altera telefones.', 403);
  const t = String(telefone || '').trim();
  if (t && !normalizarTelefone(t)) throw new ErroNegocio('Telefone inválido. Use DDD + número, ex.: (21) 99999-0000.');
  const r = await one('UPDATE usuarios SET telefone = $1 WHERE id = $2 RETURNING id', [t || null, usuarioId]);
  if (!r) throw new ErroNegocio('Usuário não encontrado.', 404);
}

// Cria os avisos do dia (um por alerta urgente por pessoa; não repete no mesmo dia)
export async function gerarFila() {
  const h = hoje();
  const pessoas = await query("SELECT id, nome, papel, telefone FROM usuarios WHERE ativo = 1 AND papel IN ('admin','engenheiro')");
  let novos = 0;
  for (const u of pessoas) {
    const urgentes = (await alertas(u)).filter((a) => a.nivel === 'alta').slice(0, 8);
    for (const a of urgentes) {
      const texto = `*${a.titulo}*${a.obra && a.obra_id ? `\nObra: ${a.obra}` : ''}${a.detalhe ? `\n${a.detalhe}` : ''}`;
      const chave = `${h}|${a.tipo}|${a.obra_id || 0}|${a.titulo}`.slice(0, 200);
      const tel = normalizarTelefone(u.telefone);
      const r = await one('INSERT INTO avisos_fila (usuario_id, telefone, texto, chave, status) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (usuario_id, chave) DO NOTHING RETURNING id', [u.id, tel, texto, chave, tel ? 'pendente' : 'sem_telefone']);
      if (r) novos++;
    }
  }
  return { novos };
}

export async function enviarPendentes() {
  if (!provedorConfigurado()) return { enviados: 0, erros: 0, motivo: 'Provedor de WhatsApp não configurado (variável WHATSAPP_WEBHOOK_URL).' };
  const fila = await query("SELECT id, telefone, texto FROM avisos_fila WHERE status = 'pendente' AND telefone IS NOT NULL ORDER BY id LIMIT 50");
  let enviados = 0, erros = 0;
  for (const a of fila) {
    try {
      const r = await fetch(process.env.WHATSAPP_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json', ...(process.env.WHATSAPP_TOKEN ? { authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } : {}) }, body: JSON.stringify({ to: a.telefone, text: a.texto }), signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`Provedor respondeu ${r.status}`);
      await query("UPDATE avisos_fila SET status = 'enviado', enviado_em = (now() AT TIME ZONE 'America/Sao_Paulo'), erro = NULL WHERE id = $1", [a.id]); enviados++;
    } catch (e) { await query("UPDATE avisos_fila SET status = 'erro', erro = $2 WHERE id = $1", [a.id, String(e.message).slice(0, 200)]); erros++; }
  }
  return { enviados, erros };
}

export async function painel() {
  const fila = (await query(`SELECT f.id, f.telefone, f.texto, f.status, f.erro, f.criado_em, f.enviado_em, u.nome FROM avisos_fila f LEFT JOIN usuarios u ON u.id = f.usuario_id ORDER BY f.id DESC LIMIT 40`))
    .map((f) => ({ ...f, link: f.telefone ? `https://wa.me/${f.telefone}?text=${encodeURIComponent(f.texto)}` : null }));
  const usuarios = await query("SELECT id, nome, papel, telefone FROM usuarios WHERE ativo = 1 AND papel IN ('admin','engenheiro') ORDER BY nome");
  return { configurado: provedorConfigurado(), fila, usuarios };
}
export async function marcarEnviado(id) {
  const r = await one("UPDATE avisos_fila SET status = 'enviado', enviado_em = (now() AT TIME ZONE 'America/Sao_Paulo') WHERE id = $1 RETURNING id", [id]);
  if (!r) throw new ErroNegocio('Aviso não encontrado.', 404);
}
export async function rodarCron() { const g = await gerarFila(); return { ...g, ...(await enviarPendentes()) }; }
