// Relatórios em PDF da obra: relatório (para o cliente ou interno), diário de obra (RDO) e termo de entrega com pendências.
import PDFDocument from 'pdfkit';
import { query, one } from './db.js';
import { ErroNegocio, isData, hoje, addDias } from './services.js';
import { detalhe, acesso } from './obras.js';
import { marca, lerLogo } from './marca.js';
import { listarPendencias } from './qualidade.js';

const C = { tx: '#1d2a36', mut: '#6a7585', ac: '#c2570a', lin: '#d9dde3', fundo: '#f4f5f7', ok: '#1b8a5a', ruim: '#c0392b' };
const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const STATUS = { planejamento: 'Planejamento', em_andamento: 'Em andamento', pausada: 'Pausada', concluida: 'Concluída', cancelada: 'Cancelada' };
const TIPOS = { residencial: 'Residencial', condominio: 'Condomínio', comercial: 'Comercial', reforma: 'Reforma', piscina: 'Piscina e lazer', fachada: 'Fachada', infraestrutura: 'Infraestrutura', outro: 'Outro' };
const M = 48;

async function novo(res, titulo, nomeArquivo) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: M, bottom: 56, left: M, right: M }, bufferPages: true, info: { Title: titulo, Author: (await marca()).nome } });
  if (res.setHeader) { res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`); }
  doc.pipe(res);
  return doc;
}
async function cabecalho(doc, titulo, sub) {
  const m = await marca(), logo = await lerLogo();
  let x = M;
  if (logo && ['image/png', 'image/jpeg'].includes(logo.tipo)) { try { doc.image(logo.buf, M, M - 4, { fit: [90, 40] }); x = M + 100; } catch { /* logo ilegível: segue sem */ } }
  doc.font('Helvetica-Bold').fontSize(15).fillColor(C.tx).text(m.nome, x, M, { width: 300 });
  doc.font('Helvetica').fontSize(8.5).fillColor(C.mut).text(`Emitido em ${br(hoje())}`, x, M + 20);
  doc.font('Helvetica-Bold').fontSize(18).fillColor(C.ac).text(titulo, M, M + 52, { width: 500 });
  doc.font('Helvetica').fontSize(10).fillColor(C.mut).text(sub, M, doc.y + 2, { width: 500 });
  doc.moveTo(M, doc.y + 8).lineTo(595 - M, doc.y + 8).lineWidth(1.2).strokeColor(C.ac).stroke();
  doc.y += 18;
}
function espaco(doc, n) { if (doc.y + n > 842 - 70) doc.addPage(); }
function secao(doc, t) { espaco(doc, 60); doc.moveDown(0.6).font('Helvetica-Bold').fontSize(11.5).fillColor(C.tx).text(t, M, doc.y); doc.moveTo(M, doc.y + 2).lineTo(595 - M, doc.y + 2).lineWidth(0.5).strokeColor(C.lin).stroke(); doc.y += 8; }
function par(doc, t, o = {}) { doc.font(o.negrito ? 'Helvetica-Bold' : 'Helvetica').fontSize(o.tam || 9.5).fillColor(o.cor || C.tx).text(t, M, doc.y, { width: 500, align: o.align }); }
function linhaKv(doc, k, v) { espaco(doc, 16); const y = doc.y; doc.font('Helvetica').fontSize(8.5).fillColor(C.mut).text(k, M, y, { width: 120 }); doc.font('Helvetica').fontSize(9.5).fillColor(C.tx).text(v || '—', M + 125, y, { width: 375 }); doc.y = Math.max(doc.y, y + 14); }
function barra(doc, x, y, w, pct, cor = C.ac) { doc.roundedRect(x, y, w, 7, 3).fillColor('#e6e9ee').fill(); if (pct > 0) doc.roundedRect(x, y, Math.max(4, (w * pct) / 100), 7, 3).fillColor(cor).fill(); }
function tabela(doc, cols, linhas) {
  espaco(doc, 40);
  let y = doc.y; const total = cols.reduce((a, c) => a + c.w, 0);
  doc.rect(M, y - 2, 500, 16).fillColor(C.fundo).fill();
  let x = M; for (const c of cols) { doc.font('Helvetica-Bold').fontSize(8).fillColor(C.mut).text(c.t, x + 3, y + 1, { width: (c.w / total) * 500 - 6, align: c.a || 'left' }); x += (c.w / total) * 500; }
  y += 18;
  for (const l of linhas) {
    const alturas = cols.map((c) => doc.font('Helvetica').fontSize(9).heightOfString(String(c.f ? c.f(l) : l[c.k] ?? ''), { width: (c.w / total) * 500 - 6 }));
    const h = Math.max(15, ...alturas) + 4;
    if (y + h > 842 - 70) { doc.addPage(); y = M; }
    x = M; for (const c of cols) { if (c.barra) barra(doc, x + 3, y + 3, (c.w / total) * 500 - 36, l[c.barra]); doc.font('Helvetica').fontSize(9).fillColor(C.tx).text(String(c.f ? c.f(l) : l[c.k] ?? ''), x + 3, y, { width: (c.w / total) * 500 - 6, align: c.a || 'left' }); x += (c.w / total) * 500; }
    doc.moveTo(M, y + h - 2).lineTo(595 - M, y + h - 2).lineWidth(0.3).strokeColor(C.lin).stroke(); y += h;
  }
  doc.y = y + 4;
}
async function fechar(doc, rodape) {
  const n = doc.bufferedPageRange().count, m = await marca();
  for (let i = 0; i < n; i++) {
    doc.switchToPage(i); doc.page.margins.bottom = 0;
    doc.moveTo(M, 842 - 42).lineTo(595 - M, 842 - 42).lineWidth(0.5).strokeColor(C.lin).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(C.mut).text(`${m.nome}  |  ${rodape}`, M, 842 - 36, { width: 400, lineBreak: false });
    doc.text(`Página ${i + 1} de ${n}`, 595 - M - 80, 842 - 36, { width: 80, align: 'right', lineBreak: false });
  }
  doc.end();
}

// ---------- relatório da obra ----------
export async function relatorioObra(usuario, obraId, tipo, res) {
  const cliente = tipo !== 'interno';
  if (!cliente && usuario.papel !== 'admin') throw new ErroNegocio('O relatório interno (com custos) é só da gestão.', 403);
  const d = await detalhe(usuario, obraId), o = d.obra;
  const fotos = await query(`SELECT f.id, f.legenda, f.data, f.dados FROM obra_fotos f WHERE f.obra_id = $1 ${cliente ? 'AND f.visivel_cliente = 1' : ''} ORDER BY f.data DESC, f.id DESC LIMIT 6`, [obraId]);
  const pend = (await listarPendencias(usuario, obraId)).filter((p) => p.status !== 'resolvida');
  const doc = await novo(res, `Relatório da obra ${o.codigo}`, `relatorio-${o.codigo}${cliente ? '' : '-interno'}.pdf`);
  await cabecalho(doc, cliente ? 'Relatório de acompanhamento da obra' : 'Relatório interno da obra', `${o.codigo} · ${o.nome}`);
  secao(doc, 'Dados da obra');
  linhaKv(doc, 'Cliente', o.cliente); linhaKv(doc, 'Endereço', [o.endereco, o.bairro, `${o.cidade}/${o.uf}`].filter(Boolean).join(' · '));
  linhaKv(doc, 'Tipo', `${TIPOS[o.tipo]}${o.area_m2 ? ` · ${Number(o.area_m2).toLocaleString('pt-BR')} m²` : ''}${o.pavimentos ? ` · ${o.pavimentos} pavimento(s)` : ''}`);
  linhaKv(doc, 'Responsável técnico', o.engenheiro); linhaKv(doc, 'Situação', STATUS[o.status]);
  linhaKv(doc, 'Período', `${br(o.data_inicio)} a ${br(o.previsao_fim)}${o.fim_real ? ` (concluída em ${br(o.fim_real)})` : ''}`);
  secao(doc, 'Avanço da obra');
  const y0 = doc.y; doc.font('Helvetica-Bold').fontSize(26).fillColor(C.ac).text(`${o.progresso}%`, M, y0, { width: 90 }); barra(doc, M + 100, y0 + 12, 380, o.progresso);
  doc.font('Helvetica').fontSize(9).fillColor(C.mut).text(o.status === 'concluida' ? 'Obra concluída.' : `Fase atual: ${o.fase_atual || '—'}${o.ritmo ? ` · ${o.ritmo.dias_restantes >= 0 ? o.ritmo.dias_restantes + ' dia(s) para o prazo' : -o.ritmo.dias_restantes + ' dia(s) além do prazo'}` : ''}`, M + 100, y0 + 24, { width: 400 });
  doc.y = y0 + 44;
  if (d.fases.length) { secao(doc, 'Etapas'); tabela(doc, [{ t: 'Etapa', w: 5, f: (f) => f.nome }, { t: 'Previsto', w: 3, f: (f) => `${br(f.inicio_prev).slice(0, 5)} a ${br(f.fim_prev).slice(0, 5)}` }, { t: 'Avanço', w: 3.5, barra: 'progresso' }, { t: '', w: 1, a: 'right', f: (f) => `${f.progresso}%` }], d.fases); }
  if (fotos.length) {
    secao(doc, cliente ? 'Fotos da obra' : 'Fotos recentes'); espaco(doc, 190);
    let x = M, y = doc.y; const w = 160, h = 105;
    for (const [i, f] of fotos.entries()) {
      if (i && i % 3 === 0) { x = M; y += h + 30; if (y + h + 30 > 842 - 70) { doc.addPage(); y = M; } }
      try { doc.image(Buffer.from(f.dados), x, y, { fit: [w, h], align: 'center', valign: 'center' }); } catch { /* foto ilegível */ }
      doc.font('Helvetica').fontSize(7.5).fillColor(C.mut).text(`${br(f.data)}${f.legenda ? ' — ' + f.legenda : ''}`, x, y + h + 3, { width: w });
      x += w + 10;
    }
    doc.y = y + h + 32;
  }
  const diario = d.diario.slice(0, 5);
  if (diario.length) { secao(doc, 'Últimas atividades'); for (const x of diario) { espaco(doc, 30); par(doc, `${br(x.data)} — ${x.atividades}`, { tam: 9 }); doc.moveDown(0.2); } }
  if (pend.length) { secao(doc, 'Pendências em aberto'); tabela(doc, [{ t: 'Local', w: 2, k: 'local' }, { t: 'Pendência', w: 5, k: 'descricao' }, { t: 'Prazo', w: 1.5, f: (p) => br(p.prazo) }, { t: 'Situação', w: 2, f: (p) => (p.status === 'em_correcao' ? 'Em correção' : 'Aberta') }], pend); }
  if (d.medicoes.length) {
    secao(doc, 'Cronograma financeiro (medições)');
    tabela(doc, [{ t: 'Nº', w: 1, f: (m) => `${m.numero}ª` }, { t: 'Descrição', w: 4, k: 'descricao' }, { t: 'Data prevista', w: 2, f: (m) => br(m.data_prevista) }, { t: 'Valor', w: 2.5, a: 'right', f: (m) => brl(m.valor) }, { t: 'Situação', w: 2, f: (m) => ({ prevista: 'Prevista', faturada: 'Faturada', recebida: `Recebida ${br(m.recebido_em)}` })[m.status] }], d.medicoes);
    par(doc, `Valor do contrato: ${brl(o.valor_contrato)} · recebido ${brl(o.recebido)} · a receber ${brl(o.a_receber)}`, { negrito: true, tam: 9.5 });
  }
  if (!cliente) {
    secao(doc, 'Custos e resultado (uso interno)');
    linhaKv(doc, 'Contrato', brl(o.valor_contrato)); linhaKv(doc, 'Orçamento de custo', brl(o.orcamento_custo)); linhaKv(doc, 'Custo pago', brl(o.custo_pago));
    linhaKv(doc, 'Custo comprometido', `${brl(o.custo_comprometido)} (pago + materiais e terceirizadas a pagar)`); linhaKv(doc, 'Margem prevista', brl(o.margem_prevista));
    if (o.desempenho?.spi != null) linhaKv(doc, 'Desempenho', `prazo (SPI) ${o.desempenho.spi} · custo (CPI) ${o.desempenho.cpi ?? '—'}`);
    if (d.aditivos?.length) { par(doc, 'Aditivos de contrato', { negrito: true, tam: 9.5 }); for (const a of d.aditivos) par(doc, `${a.numero}º (${br(a.data)}): ${a.descricao} — ${brl(a.valor_delta)}${a.prazo_delta_dias ? `, ${a.prazo_delta_dias} dia(s)` : ''}`, { tam: 9 }); }
  }
  await fechar(doc, cliente ? `Relatório da obra ${o.codigo}` : `Relatório interno ${o.codigo} — confidencial`);
}

// ---------- diário de obra (RDO) ----------
export async function diarioPdf(usuario, obraId, de, ate, res) {
  const o = await acesso(usuario, obraId);
  const fim = ate || hoje(), ini = de || addDias(fim, -30);
  if (!isData(ini) || !isData(fim) || ini > fim) throw new ErroNegocio('Período inválido.');
  const dias = await query('SELECT d.*, u.nome AS autor FROM obra_diario d LEFT JOIN usuarios u ON u.id = d.autor_id WHERE d.obra_id = $1 AND d.data BETWEEN $2 AND $3 ORDER BY d.data', [obraId, ini, fim]);
  const eng = o.engenheiro_id ? (await one('SELECT nome, conselho, registro_profissional FROM funcionarios WHERE id = $1', [o.engenheiro_id])) : null;
  const doc = await novo(res, `Diário de obra ${o.codigo}`, `diario-${o.codigo}-${ini}-a-${fim}.pdf`);
  await cabecalho(doc, 'Diário de obra (RDO)', `${o.codigo} · ${o.nome} — de ${br(ini)} a ${br(fim)}`);
  secao(doc, 'Registros');
  if (!dias.length) par(doc, 'Nenhum registro no período.', { cor: C.mut });
  for (const x of dias) {
    espaco(doc, 70);
    const pres = await one("SELECT COUNT(*) FILTER (WHERE situacao IN ('presente','atraso')) AS p, COUNT(*) FILTER (WHERE situacao = 'falta') AS f FROM obra_presencas WHERE obra_id = $1 AND data = $2", [obraId, x.data]);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ac).text(`${br(x.data)}`, M, doc.y, { continued: true }).font('Helvetica').fontSize(9).fillColor(C.mut).text(`   ${x.clima || ''}${x.efetivo != null ? ` · ${x.efetivo} pessoa(s)` : ''}${pres.p ? ` · presença: ${pres.p} presente(s), ${pres.f} falta(s)` : ''}`);
    par(doc, x.atividades, { tam: 9.5 });
    if (x.ocorrencias) par(doc, `Ocorrências: ${x.ocorrencias}`, { tam: 9, cor: C.ruim });
    if (x.autor) par(doc, `Registrado por ${x.autor}`, { tam: 8, cor: C.mut });
    doc.moveDown(0.5);
  }
  espaco(doc, 90); doc.moveDown(3);
  const y = doc.y; doc.moveTo(M, y).lineTo(M + 210, y).strokeColor(C.mut).lineWidth(0.6).stroke(); doc.moveTo(M + 270, y).lineTo(M + 480, y).stroke();
  doc.font('Helvetica').fontSize(8.5).fillColor(C.mut).text(`Responsável técnico${eng ? ': ' + eng.nome : ''}${eng?.registro_profissional ? ` — ${eng.conselho || ''} ${eng.registro_profissional}` : ''}`, M, y + 4, { width: 220 }).text('Mestre de obras / contratante', M + 270, y + 4, { width: 220 });
  await fechar(doc, `Diário de obra ${o.codigo}`);
}

// ---------- termo de entrega ----------
export async function termoEntrega(usuario, obraId, res) {
  const o = await acesso(usuario, obraId);
  const cli = o.cliente_id ? await one('SELECT nome FROM clientes WHERE id = $1', [o.cliente_id]) : null;
  const pend = await listarPendencias(usuario, obraId), abertas = pend.filter((p) => p.status !== 'resolvida'), ok = pend.filter((p) => p.status === 'resolvida');
  const eng = o.engenheiro_id ? await one('SELECT nome, conselho, registro_profissional FROM funcionarios WHERE id = $1', [o.engenheiro_id]) : null;
  const doc = await novo(res, `Termo de entrega ${o.codigo}`, `termo-de-entrega-${o.codigo}.pdf`);
  await cabecalho(doc, 'Termo de entrega e vistoria da obra', `${o.codigo} · ${o.nome}`);
  secao(doc, 'Identificação'); linhaKv(doc, 'Cliente', cli?.nome); linhaKv(doc, 'Endereço', [o.endereco, o.bairro, `${o.cidade}/${o.uf}`].filter(Boolean).join(' · ')); linhaKv(doc, 'Data da vistoria', br(hoje())); linhaKv(doc, 'Responsável técnico', eng ? `${eng.nome}${eng.registro_profissional ? ` — ${eng.conselho || ''} ${eng.registro_profissional}` : ''}` : '');
  secao(doc, 'Declaração');
  par(doc, `Na data acima, o cliente realizou a vistoria da obra e a recebe ${abertas.length ? 'com as pendências listadas abaixo, que a construtora se compromete a corrigir nos prazos indicados' : 'sem pendências'}. Itens não listados e vícios ocultos seguem as condições do contrato e a legislação aplicável.`);
  secao(doc, `Pendências em aberto (${abertas.length})`);
  if (abertas.length) tabela(doc, [{ t: 'Local', w: 2, k: 'local' }, { t: 'Pendência', w: 5, k: 'descricao' }, { t: 'Responsável', w: 2, k: 'responsavel' }, { t: 'Prazo', w: 1.5, f: (p) => br(p.prazo) }], abertas); else par(doc, 'Nenhuma pendência em aberto.', { cor: C.mut });
  if (ok.length) { secao(doc, `Itens já corrigidos (${ok.length})`); for (const p of ok) par(doc, `• ${p.local ? p.local + ': ' : ''}${p.descricao} (resolvido em ${br(p.resolvida_em)})`, { tam: 9 }); }
  espaco(doc, 110); doc.moveDown(3);
  const y = doc.y; doc.moveTo(M, y).lineTo(M + 210, y).strokeColor(C.mut).lineWidth(0.6).stroke(); doc.moveTo(M + 270, y).lineTo(M + 480, y).stroke();
  doc.font('Helvetica').fontSize(8.5).fillColor(C.mut).text(`Cliente${cli ? ': ' + cli.nome : ''}`, M, y + 4, { width: 220 }).text('Construtora / responsável técnico', M + 270, y + 4, { width: 220 });
  doc.moveDown(3); par(doc, 'Modelo de apoio gerado pelo sistema. Para efeito jurídico, valide o texto com a assessoria da empresa.', { tam: 7.5, cor: C.mut });
  await fechar(doc, `Termo de entrega ${o.codigo}`);
}
