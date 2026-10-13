// Telas de gestão: visão geral da empresa, painel do investidor, "Meu dia" do engenheiro e agenda (calendário).
export function instalar(U) {
  const { state, api, esc, brl, dataBR, ico, toast, acao, modal, cls, pode, temArea, hojeISO, rotas, nomeMes, primeiroNome, ast } = U;
  const $app = document.getElementById('app');
  const { tagStatus, tagRitmo, barraProg, diasTxt, TIPO_EVENTO, diaSem, somaDias } = U.obrasUtil;
  const vazio = (t) => `<p class="mut">${t}</p>`;
  const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const mesCurto = (m) => MES_CURTO[+m.slice(5) - 1];
  const kpi = (rotulo, valor, sub = '', cor = '') => `<div class="card kpi"><div class="l">${rotulo}</div><div class="v ${cor}">${valor}</div>${sub ? `<small class="mut">${sub}</small>` : ''}</div>`;
  const pct1 = (v) => (v == null ? '—' : v.toFixed(1).replace('.', ',') + '%');

  // gráfico de barras agrupadas (entradas × saídas por mês)
  function graficoMeses(serie) {
    const max = Math.max(...serie.flatMap((s) => [s.entradas, s.saidas]), 1), W = 600, Hh = 190, base = 160, gw = W / serie.length;
    return `<svg class="graf" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Entradas e saídas por mês">
      ${serie.map((s, i) => { const x = i * gw + gw * 0.18, bw = gw * 0.30, he = (s.entradas / max) * 130, hs = (s.saidas / max) * 130; return `
        <rect x="${x}" y="${base - he}" width="${bw}" height="${he}" rx="2" fill="var(--ver)"><title>${mesCurto(s.mes)}: entradas ${brl(s.entradas)}</title></rect>
        <rect x="${x + bw + 3}" y="${base - hs}" width="${bw}" height="${hs}" rx="2" fill="var(--verm)"><title>${mesCurto(s.mes)}: saídas ${brl(s.saidas)}</title></rect>
        <text class="gt" x="${i * gw + gw / 2}" y="${base + 14}" text-anchor="middle">${mesCurto(s.mes)}</text>
        <text class="gt" x="${i * gw + gw / 2}" y="${base + 27}" text-anchor="middle" fill="${s.resultado < 0 ? 'var(--verm)' : 'var(--ver)'}">${s.resultado >= 0 ? '+' : '−'}${Math.round(Math.abs(s.resultado) / 10000000) / 10} mi</text>`; }).join('')}
      <line x1="0" y1="${base}" x2="${W}" y2="${base}" stroke="var(--bd)"/></svg>
      <p class="legenda"><span class="sw" style="background:var(--ver)"></span>entradas<span class="sw" style="background:var(--verm);margin-left:16px"></span>saídas · abaixo de cada mês, o resultado (em milhões de reais)</p>`;
  }
  const listaAlertas = (lista) => `<ul class="alertas">${lista.map((a) => `<li class="${a.nivel}"><b>${esc(a.titulo)}</b>${a.detalhe ? `<br><small class="mut">${esc(a.detalhe)}</small>` : ''}<br><small>${a.obra_id ? `<a href="#obras" data-obra="${a.obra_id}">${esc(a.obra)}</a>` : `<span class="mut">${esc(a.obra)}</span>`}</small></li>`).join('')}</ul>`;

  // =====================================================================
  // VISÃO GERAL
  // =====================================================================
  async function visao() {
    const v = await api('/api/visao'), k = v.kpis;
    const andamento = v.obras.filter((o) => ['em_andamento', 'planejamento', 'pausada'].includes(o.status));
    $app.innerHTML = `<h1>Visão geral</h1><p class="sub">Como está a Mota Construções hoje: obras, prazos, equipe, documentos e caixa.</p>
      <div class="grid">
        ${kpi('Obras em andamento', k.obras_andamento, `${k.obras_planejamento} em planejamento · ${k.obras_concluidas} concluídas`)}
        ${kpi('Avanço médio', k.avanco_medio + '%', `${k.atrasadas} atrasada(s) · ${k.em_atencao} em atenção`, k.atrasadas ? 'neg' : '')}
        ${kpi('Carteira contratada', brl(k.carteira), `a receber ${brl(k.a_receber)}`)}
        ${kpi('Margem prevista', brl(k.margem_prevista), k.carteira ? pct1((k.margem_prevista / k.carteira) * 100) + ' da carteira' : '', cls(k.margem_prevista))}
        ${kpi('Caixa agora', brl(k.caixa), `resultado do mês ${brl(k.resultado_mes)}`)}
        ${kpi('Pessoas nas obras hoje', k.pessoas_hoje, `${k.obras_com_equipe_hoje} obra(s) com equipe`)}
        ${kpi('Documentação', `${k.docs_total - k.docs_pendentes}<small class="mut"> / ${k.docs_total}</small>`, `${k.docs_vencidos} vencido(s) · ${k.docs_pendentes} pendente(s)`, k.docs_vencidos ? 'neg' : '')}</div>
      <div class="grid dois">
        <div class="card"><div class="titulo-saldos"><h2>Atenção hoje</h2>${v.alertas_total > v.alertas.length ? `<button class="mini sec" id="todos-alertas">ver todos (${v.alertas_total})</button>` : ''}</div>${v.alertas.length ? listaAlertas(v.alertas) : vazio('Nenhum alerta. Tudo em ordem.')}</div>
        <div class="card"><h2>Agenda dos próximos 7 dias</h2>${v.agenda.length ? `<ul class="alertas">${v.agenda.map((e) => `<li class="info"><b>${dataBR(e.data).slice(0, 5)} ${diaSem(e.data)}${e.hora ? ' · ' + esc(e.hora) : ''}</b> — ${esc(e.titulo)}<br><small><a href="#obras" data-obra="${e.obra_id}">${esc(e.codigo)} ${esc(e.obra)}</a> <span class="tag">${esc(TIPO_EVENTO[e.tipo])}</span></small></li>`).join('')}</ul>` : vazio('Nada agendado.')}
          <p style="margin:10px 0 0"><a href="#agenda">Abrir a agenda completa →</a></p></div></div>
      <div class="card"><h2>Obras em curso</h2>${andamento.length ? `<div class="tbl"><table><thead><tr><th>Obra</th><th>Fase atual</th><th style="width:22%">Avanço</th><th>Prazo</th><th>Situação</th><th class="n">Na obra hoje</th><th class="n">Margem prevista</th></tr></thead><tbody>
        ${andamento.map((o) => `<tr class="clicavel" data-obra="${o.id}"><td><b>${esc(o.codigo)}</b> ${esc(o.nome)}<br><small class="mut">${esc([o.bairro, o.cidade].filter(Boolean).join(' · '))} · ${esc(o.engenheiro || 'sem engenheiro')}</small></td>
          <td><small>${esc(o.fase_atual || (o.status === 'planejamento' ? 'a iniciar' : '—'))}</small></td><td><div class="obra-prog"><b>${o.progresso}%</b>${barraProg(o.progresso, o.ritmo?.esperado)}</div></td>
          <td><small>${esc(diasTxt(o))}</small></td><td>${tagStatus(o)} ${tagRitmo(o)}</td><td class="n">${o.presentes_hoje}/${o.equipe_total}</td><td class="n ${cls(o.margem_prevista)}">${brl(o.margem_prevista)}</td></tr>`).join('')}</tbody></table></div>` : vazio('Nenhuma obra em curso.')}</div>
      <div class="card"><h2>Entradas e saídas dos últimos 6 meses</h2>${graficoMeses(v.serie)}</div>`;
    $app.querySelectorAll('tr.clicavel[data-obra]').forEach((tr) => (tr.onclick = () => U.abrirObra(+tr.dataset.obra)));
    U.ligaLinksObra($app);
    document.getElementById('todos-alertas')?.addEventListener('click', async () => {
      const todos = await api('/api/alertas');
      const m = modal(`<h2>Todos os alertas (${todos.length})</h2><div class="fu-lista">${listaAlertas(todos)}</div><div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Fechar</button></div>`, 640);
      m.el.querySelector('#x').onclick = m.fechar; U.ligaLinksObra(m.el);
      m.el.querySelectorAll('[data-obra]').forEach((a) => a.addEventListener('click', () => m.fechar()));
    });
  }

  // =====================================================================
  // PAINEL DO INVESTIDOR / SÓCIOS
  // =====================================================================
  async function investidor() {
    const i = await api('/api/investidor'), c = i.carteira, cap = i.capital;
    const maxRec = Math.max(...i.recebimentos.map((r) => r.total), 1);
    $app.innerHTML = `<h1>Painel do investidor</h1><p class="sub">Retorno da carteira de obras, capital aportado, recebimentos futuros e o que cada sócio tem direito de ver.</p>
      <div class="row"><a class="btn" href="/api/societario/relatorio/${state.mes}">${ico('download')} Relatório mensal aos sócios (PDF)</a></div>
      <div class="grid">
        ${kpi('Capital aportado', brl(cap.total_aportado), 'soma dos aportes dos sócios')}
        ${kpi('Caixa agora', brl(cap.caixa_atual), 'todas as contas')}
        ${kpi('Equipamentos e almoxarifado', brl(cap.patrimonio_ativos), cap.patrimonio_mes_ref ? 'posição de ' + nomeMes(cap.patrimonio_mes_ref) : 'ainda não informado')}
        ${kpi('Carteira contratada', brl(c.contratos), `${c.obras_ativas} obra(s) em curso`)}
        ${kpi('Margem prevista', brl(c.margem_prevista), pct1(c.margem_pct) + ' do contrato', cls(c.margem_prevista))}
        ${kpi('Retorno sobre o custo', pct1(c.retorno_sobre_custo), `custo orçado ${brl(c.custo_orcado)}`)}
        ${kpi('A receber dos clientes', brl(c.a_receber), `já recebido ${brl(c.recebido)}`)}
        ${kpi(`Resultado de caixa em ${i.ano}`, brl(i.resultado_ano.resultado), `entradas ${brl(i.resultado_ano.entradas)} · saídas ${brl(i.resultado_ano.saidas)}`, cls(i.resultado_ano.resultado))}</div>
      <div class="card"><h2>Sócios e investidores</h2><div class="tbl"><table><thead><tr><th>Sócio</th><th class="n">Participação</th><th class="n">Capital aportado</th><th class="n">Lucros distribuídos em ${i.ano}</th><th class="n">Parte da margem da carteira</th><th class="n">Parte do caixa + ativos</th></tr></thead><tbody>
        ${i.socios.map((s) => `<tr><td><b>${esc(s.nome)}</b>${s.data_entrada ? `<br><small class="mut">desde ${dataBR(s.data_entrada)}</small>` : ''}</td><td class="n">${s.participacao == null ? '—' : String(s.participacao).replace('.', ',') + '%'}</td><td class="n">${brl(s.aporte)}</td><td class="n">${brl(s.lucro_distribuido_ano)}</td><td class="n">${s.parte_margem_carteira == null ? '—' : brl(s.parte_margem_carteira)}</td><td class="n">${s.parte_capital_atual == null ? '—' : brl(s.parte_capital_atual)}</td></tr>`).join('')}</tbody></table></div>
        <p class="legenda" style="margin-top:8px">Estimativas gerenciais: “parte da margem” aplica a participação à margem prevista da carteira; não é distribuição garantida nem demonstração contábil.</p></div>
      <div class="grid dois">
        <div class="card"><h2>Rentabilidade por obra (margem prevista)</h2>${i.obras.length ? i.obras.map((o) => `<div class="barra"><span class="nome" title="${esc(o.nome)}">${esc(o.codigo)} · ${esc(o.nome)}</span><span class="trilho"><span class="fill" style="display:block;width:${Math.max(0, Math.min(100, (o.margem_pct || 0) * 2.5))}%"></span></span><span class="val">${pct1(o.margem_pct)}</span></div>`).join('') : vazio('Sem obras em curso.')}
          <p class="legenda">Margem = (contrato − custo orçado ou comprometido) ÷ contrato.</p></div>
        <div class="card"><h2>Recebimentos futuros por mês</h2>${i.recebimentos.length ? i.recebimentos.map((r) => `<div class="barra"><span class="nome">${esc(nomeMes(r.mes))}</span><span class="trilho"><span class="fill" style="display:block;width:${(r.total / maxRec) * 100}%"></span></span><span class="val">${brl(r.total)}</span></div>`).join('') : vazio('Nenhuma medição a receber.')}
          <p class="legenda">Medições previstas e faturadas ainda não recebidas, por mês de vencimento.</p></div></div>
      <div class="grid dois">
        <div class="card"><h2>Entradas e saídas dos últimos 6 meses</h2>${graficoMeses(i.serie)}</div>
        <div class="card"><h2>Pipeline comercial (${i.ano})</h2><div class="mk-grade">
          <div class="mk"><span>Orçamentos em aberto</span><b>${brl(i.comercial.em_aberto_valor)}</b><small>${i.comercial.em_aberto_qtd} proposta(s)</small></div>
          <div class="mk"><span>Contratos ganhos</span><b>${brl(i.comercial.ganhos_valor)}</b><small>${i.comercial.ganhos_qtd} contrato(s)</small></div>
          <div class="mk"><span>Taxa de conversão</span><b>${i.comercial.taxa_conversao == null ? '—' : i.comercial.taxa_conversao + '%'}</b><small>ganhos ÷ decididos</small></div></div></div></div>
      <div class="card"><h2>Obras da carteira</h2><div class="tbl"><table><thead><tr><th>Obra</th><th>Situação</th><th class="n">Avanço</th><th class="n">Contrato</th><th class="n">Custo orçado</th><th class="n">Comprometido</th><th class="n">Margem</th><th>Término previsto</th></tr></thead><tbody>
        ${i.obras.map((o) => `<tr class="clicavel" data-obra="${o.id}"><td style="min-width:230px"><b>${esc(o.codigo)}</b> ${esc(o.nome)}</td><td>${tagStatus(o)}</td><td class="n">${o.progresso}%</td><td class="n">${brl(o.valor_contrato)}</td><td class="n">${brl(o.custo_orcado)}</td><td class="n">${brl(o.custo_comprometido)}</td><td class="n ${cls(o.margem_prevista)}">${brl(o.margem_prevista)} <small class="mut">${pct1(o.margem_pct)}</small></td><td>${o.previsao_fim ? dataBR(o.previsao_fim) : '—'}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="3">Total</td><td class="n">${brl(c.contratos)}</td><td class="n">${brl(c.custo_orcado)}</td><td></td><td class="n">${brl(c.margem_prevista)}</td><td></td></tr></tfoot></table></div></div>`;
    $app.querySelectorAll('tr.clicavel[data-obra]').forEach((tr) => (tr.onclick = () => U.abrirObra(+tr.dataset.obra)));
  }

  // =====================================================================
  // MEU DIA (engenheiro)
  // =====================================================================
  async function engenheiro() {
    const d = await api('/api/engenheiro/meu-dia'), r = d.resumo, adm = pode('admin');
    const hora = new Date().getHours(), saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    const grupos = [['alta', 'Urgente'], ['media', 'Atenção'], ['info', 'Rotina']].map(([n, t]) => [t, d.alertas.filter((a) => a.nivel === n)]).filter(([, l]) => l.length);
    $app.innerHTML = `<h1>${saud}, ${esc(primeiroNome(d.usuario.nome))}</h1><p class="sub">${diaSem(d.hoje)}, ${dataBR(d.hoje)} — o que precisa da sua atenção nas obras${adm ? ' (visão da gestão: todas as obras)' : ' sob sua responsabilidade'}.</p>
      <div class="grid">
        ${kpi('Obras', r.obras, adm ? 'em curso' : 'sob minha responsabilidade')}
        ${kpi('Alertas urgentes', r.alertas_altos, 'hoje', r.alertas_altos ? 'neg' : '')}
        ${kpi('Entregas de material hoje', r.entregas_hoje, '')}
        ${kpi('Pessoas nas minhas obras hoje', r.pessoas_na_obra_hoje, '')}
        ${kpi('Avisos novos da gestão', r.avisos_novos, '', r.avisos_novos ? 'neg' : '')}</div>
      <div class="grid dois">
        <div class="card"><h2>${ico('sino')} Alertas do dia</h2>${grupos.length ? grupos.map(([t, l]) => `<h3 class="alerta-grupo">${t}</h3>${listaAlertas(l)}`).join('') : vazio('Nenhum alerta: dia tranquilo.')}</div>
        <div><div class="card"><div class="titulo-saldos"><h2>Avisos da gestão</h2>${adm ? '<button class="mini" id="novo-aviso">+ Aviso</button>' : ''}</div>${d.avisos.length ? `<ul class="alertas">${d.avisos.map((a) => `<li class="${a.prioridade === 'alta' ? 'alta' : 'info'}" style="${a.lido_em ? 'opacity:.6' : ''}"><b>${esc(a.titulo)}</b>${a.texto ? `<br><small>${esc(a.texto)}</small>` : ''}<br><small class="mut">${esc(a.autor || '')}${a.obra ? ' · ' + esc(a.codigo) : ''} · ${dataBR(String(a.criado_em).slice(0, 10))}</small>
            ${!a.lido_em && !adm ? `<br><button class="mini sec" data-lido="${a.id}">Marcar como lido</button>` : ''}</li>`).join('')}</ul>` : vazio('Sem avisos.')}</div>
          <div class="card"><h2>Próximos 7 dias</h2>${d.agenda.length ? `<ul class="alertas">${d.agenda.map((e) => `<li class="info"><b>${dataBR(e.data).slice(0, 5)} ${diaSem(e.data)}${e.hora ? ' · ' + esc(e.hora) : ''}</b> — ${esc(e.titulo)}<br><small class="mut">${esc(e.codigo)} · ${esc(TIPO_EVENTO[e.tipo])}</small></li>`).join('')}</ul>` : vazio('Nada agendado.')}</div></div></div>
      <div class="card"><h2>${adm ? 'Obras em curso' : 'Minhas obras'}</h2>${d.obras.length ? `<div class="obras-grade">${d.obras.map((o) => `<article class="card obra-card" data-obra="${o.id}" tabindex="0"><div class="obra-topo"><span class="tag">${esc(o.codigo)}</span>${tagStatus(o)}${tagRitmo(o)}</div>
        <h3>${esc(o.nome)}</h3><div class="obra-prog"><b>${o.progresso}%</b>${barraProg(o.progresso, o.ritmo?.esperado)}</div>
        <p class="obra-fase">Fase atual: <b>${esc(o.fase_atual || '—')}</b></p><div class="obra-nums"><span>${ico('agenda')} ${esc(diasTxt(o))}</span><span>${ico('clientes')} ${o.presentes_hoje}/${o.equipe_total} na obra hoje</span></div></article>`).join('')}</div>` : vazio('Nenhuma obra atribuída a você.')}</div>`;
    U.ligaLinksObra($app);
    $app.querySelectorAll('.obra-card').forEach((c) => (c.onclick = () => U.abrirObra(+c.dataset.obra)));
    $app.querySelectorAll('[data-lido]').forEach((b) => (b.onclick = () => acao(async () => { await api(`/api/avisos/${b.dataset.lido}/lido`, { method: 'POST' }); await engenheiro(); }, 'Aviso marcado como lido')));
    document.getElementById('novo-aviso')?.addEventListener('click', () => {
      const m = modal(`<h2>Novo aviso</h2><form class="form" id="fa" style="margin-top:12px"><div class="cheio"><label>Obra</label><select name="obra_id">${d.obras.map((o) => `<option value="${o.id}">${esc(o.codigo)} · ${esc(o.nome)}</option>`).join('')}</select></div>
        <div class="cheio"><label>Aviso ${ast}</label><input name="titulo" required placeholder="Ex.: Hoje chega o caminhão de cimento às 8h"></div><div class="cheio"><label>Detalhes</label><input name="texto"></div>
        <div><label>Prioridade</label><select name="prioridade"><option value="normal">Normal</option><option value="alta">Alta</option></select></div></form>
        <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Enviar</button></div>`, 520);
      m.el.querySelector('#x').onclick = m.fechar;
      m.el.querySelector('#ok').onclick = () => acao(async () => { await api('/api/avisos', { method: 'POST', body: Object.fromEntries(new FormData(m.el.querySelector('#fa'))) }); m.fechar(); await engenheiro(); }, 'Aviso enviado');
    });
  }

  // =====================================================================
  // AGENDA (calendário do mês)
  // =====================================================================
  async function agenda() {
    state.agMes = state.agMes || hojeISO().slice(0, 7);
    const mes = state.agMes, a = await api(`/api/agenda/${mes}`);
    const [ano, mm] = mes.split('-').map(Number), primeiro = new Date(Date.UTC(ano, mm - 1, 1)), dias = new Date(Date.UTC(ano, mm, 0)).getUTCDate();
    const itens = {};
    const add = (data, item) => (itens[data] ||= []).push(item);
    a.eventos.forEach((e) => add(e.data, { cor: e.status === 'concluido' ? 'feito' : e.tipo, txt: `${e.hora ? e.hora + ' ' : ''}${e.titulo}`, obra: e.codigo, obra_id: e.obra_id, tipo: TIPO_EVENTO[e.tipo], det: e.detalhe, status: e.status }));
    a.materiais.forEach((m) => add(m.data, { cor: 'entrega', txt: `Entrega: ${m.descricao}`, obra: m.codigo, obra_id: m.obra_id, tipo: 'Entrega de material', det: m.fornecedor }));
    a.fases.forEach((f) => add(f.data, { cor: 'fase', txt: `Fim da etapa: ${f.nome}`, obra: f.codigo, obra_id: f.obra_id, tipo: 'Prazo de etapa' }));
    a.medicoes.forEach((x) => add(x.data, { cor: 'medicao', txt: `Medição ${x.numero}: ${brl(x.valor)}`, obra: x.codigo, obra_id: x.obra_id, tipo: 'Medição a receber' }));
    const celulas = [];
    for (let i = 0; i < primeiro.getUTCDay(); i++) celulas.push(null);
    for (let dia = 1; dia <= dias; dia++) celulas.push(`${mes}-${String(dia).padStart(2, '0')}`);
    const nav = (n) => { const d = new Date(Date.UTC(ano, mm - 1 + n, 1)); state.agMes = d.toISOString().slice(0, 7); agenda(); };
    $app.innerHTML = `<h1>Agenda das obras</h1><p class="sub">Entregas de material, concretagens, vistorias, reuniões, prazos de etapas e medições.</p>
      <div class="row"><button class="sec" id="ant">${ico('arrow-left')}</button><b style="min-width:170px;text-align:center;font-size:17px">${esc(nomeMes(mes))}</b><button class="sec" id="prox">${ico('arrow-right')}</button><button class="sec" id="hoje">Hoje</button><span style="flex:1"></span>${pode('admin') || state.usuario.papel === 'engenheiro' ? '<button id="novo">+ Compromisso</button>' : ''}</div>
      <div class="card" style="padding:12px"><div class="cal">${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map((d) => `<div class="cal-cab">${d}</div>`).join('')}
        ${celulas.map((data) => data ? `<div class="cal-dia ${data === a.hoje ? 'hoje' : ''}" data-dia="${data}"><span class="cal-num">${+data.slice(8)}</span>${(itens[data] || []).slice(0, 3).map((i) => `<span class="cal-item ${i.cor}" title="${esc(i.obra)} — ${esc(i.txt)}">${esc(i.txt)}</span>`).join('')}${(itens[data] || []).length > 3 ? `<small class="mut">+${itens[data].length - 3} mais</small>` : ''}</div>` : '<div class="cal-vazio"></div>').join('')}</div>
        <p class="legenda" style="margin:10px 4px 0"><span class="cal-item entrega">entrega</span> <span class="cal-item concretagem">concretagem</span> <span class="cal-item vistoria">vistoria</span> <span class="cal-item reuniao">reunião</span> <span class="cal-item fase">prazo de etapa</span> <span class="cal-item medicao">medição</span> <span class="cal-item feito">concluído</span></p></div>`;
    document.getElementById('ant').onclick = () => nav(-1);
    document.getElementById('prox').onclick = () => nav(1);
    document.getElementById('hoje').onclick = () => { state.agMes = hojeISO().slice(0, 7); agenda(); };
    $app.querySelectorAll('.cal-dia').forEach((c) => (c.onclick = () => {
      const lista = itens[c.dataset.dia] || [];
      const m = modal(`<h2>${diaSem(c.dataset.dia)}, ${dataBR(c.dataset.dia)}</h2>${lista.length ? `<ul class="alertas">${lista.map((i) => `<li class="info"><b>${esc(i.txt)}</b><br><small class="mut">${esc(i.tipo)}${i.det ? ' · ' + esc(i.det) : ''}</small><br><small><a href="#obras" data-obra="${i.obra_id}">${esc(i.obra)}</a></small></li>`).join('')}</ul>` : vazio('Nada neste dia.')}<div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Fechar</button></div>`, 520);
      m.el.querySelector('#x').onclick = m.fechar; U.ligaLinksObra(m.el);
      m.el.querySelectorAll('[data-obra]').forEach((x) => x.addEventListener('click', () => m.fechar()));
    }));
    document.getElementById('novo')?.addEventListener('click', async () => {
      const obras = (await api('/api/obras')).filter((o) => ['em_andamento', 'planejamento', 'pausada'].includes(o.status));
      const m = modal(`<h2>Novo compromisso</h2><form class="form" id="fx" style="margin-top:12px"><div class="cheio"><label>Obra</label><select name="obra">${obras.map((o) => `<option value="${o.id}">${esc(o.codigo)} · ${esc(o.nome)}</option>`).join('')}</select></div></form>
        <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Continuar</button></div>`, 480);
      m.el.querySelector('#x').onclick = m.fechar;
      m.el.querySelector('#ok').onclick = () => { const id = +m.el.querySelector('[name=obra]').value; m.fechar(); U.janelaEvento(id, null, agenda); };
    });
  }

  rotas.visao = visao; rotas.investidor = investidor; rotas.engenheiro = engenheiro; rotas.agenda = agenda;
}
