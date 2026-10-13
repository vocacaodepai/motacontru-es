// Finanças de obra: curva S e custos por etapa, aditivos, fluxo de caixa projetado, folha de diárias, cotações e aprovação de compras.
export function instalar(U) {
  const { state, api, esc, brl, dataBR, ico, toast, acao, modal, cls, pode, temArea, hojeISO, rotas, paraCentavos, brlInput, nomeMes, ast, campo, seletor } = U;
  const $app = document.getElementById('app');
  const { barraProg, somaDias, diaSem, qtd } = U.obrasUtil;
  const vazio = (t) => `<p class="mut">${t}</p>`;
  const ehAdmin = () => state.usuario.papel === 'admin';
  const dmes = (d) => d.split('-').reverse().slice(0, 2).join('/');
  const pct1 = (v) => (v == null ? '—' : String(v).replace('.', ',') + '%');
  const FAIXA = { ok: 'ok', atencao: 'aviso', ruim: 'ruim' };

  // ---------- gráfico de linhas com datas no eixo X ----------
  function graficoLinhas({ serie, linhas, hoje, formatoY = (v) => v + '%', max = 100, altura = 260 }) {
    const W = 760, H = altura, mx = 46, my = 14, iw = W - mx - 12, ih = H - my - 34;
    const t = (d) => new Date(d + 'T12:00:00Z').getTime(), t0 = t(serie[0].data), t1 = t(serie.at(-1).data) || t0 + 1;
    const X = (d) => mx + ((t(d) - t0) / Math.max(1, t1 - t0)) * iw, Y = (v) => my + ih - (Math.max(0, Math.min(max, v)) / max) * ih;
    const grade = [0, 0.25, 0.5, 0.75, 1].map((f) => `<line x1="${mx}" x2="${W - 12}" y1="${Y(max * f)}" y2="${Y(max * f)}" stroke="var(--bd)"/><text class="gt" x="${mx - 6}" y="${Y(max * f) + 3}" text-anchor="end">${formatoY(Math.round(max * f))}</text>`).join('');
    const meses = []; { const c = new Date(serie[0].data + 'T12:00:00Z'); c.setUTCDate(1); c.setUTCMonth(c.getUTCMonth() + 1); while (c.getTime() < t1) { meses.push(c.toISOString().slice(0, 10)); c.setUTCMonth(c.getUTCMonth() + 1); } }
    const rotulos = meses.map((m) => `<text class="gt" x="${X(m)}" y="${H - 12}" text-anchor="middle">${new Date(m + 'T12:00:00Z').toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' })}</text>`).join('');
    const caminho = (k) => { const pts = serie.filter((p) => p[k] != null).map((p) => `${X(p.data).toFixed(1)},${Y(p[k]).toFixed(1)}`); return pts.length > 1 ? pts.join(' ') : ''; };
    const linhasSvg = linhas.map((l) => { const pts = caminho(l.chave); return pts ? `<polyline fill="none" stroke="${l.cor}" stroke-width="${l.largura || 2.4}" ${l.tracejado ? 'stroke-dasharray="6 5"' : ''} stroke-linejoin="round" stroke-linecap="round" points="${pts}"><title>${esc(l.rotulo)}</title></polyline>` : ''; }).join('');
    const marca = hoje && hoje >= serie[0].data && hoje <= serie.at(-1).data ? `<line x1="${X(hoje)}" x2="${X(hoje)}" y1="${my}" y2="${my + ih}" stroke="var(--navy)" stroke-opacity=".5" stroke-dasharray="2 3"/><text class="gt" x="${X(hoje)}" y="${my - 3}" text-anchor="middle">hoje</text>` : '';
    return `<svg class="graf" viewBox="0 0 ${W} ${H}" role="img">${grade}${rotulos}${marca}${linhasSvg}</svg>
      <p class="legenda">${linhas.map((l) => `<span class="sw" style="background:${l.cor}"></span>${esc(l.rotulo)}&nbsp;&nbsp;`).join('')}</p>`;
  }

  // =====================================================================
  // Aba "Curva S e custos" dentro da obra
  // =====================================================================
  async function abaCurva(el, d) {
    const o = d.obra, adm = ehAdmin();
    const [c, ce] = await Promise.all([api(`/api/obras/${o.id}/curva-s`), api(`/api/obras/${o.id}/custos-etapas`)]);
    const ind = c.indicadores;
    el.innerHTML = `${c.vazio ? `<div class="card"><h2>Curva S</h2>${vazio(esc(c.motivo))}</div>` : `
      <div class="grid">
        <div class="card kpi"><div class="l">Avanço real × esperado</div><div class="v">${ind.progresso}%<small class="mut"> / ${ind.esperado}%</small></div><small class="mut">esperado pelo cronograma das etapas</small></div>
        <div class="card kpi"><div class="l">Índice de prazo (SPI)</div><div class="v ${ind.spi_faixa === 'ruim' ? 'neg' : ind.spi_faixa === 'ok' ? 'pos' : ''}">${ind.spi == null ? '—' : String(ind.spi).replace('.', ',')}</div><small class="mut">1,00 = no prazo; abaixo de 1 = atrasada</small></div>
        <div class="card kpi"><div class="l">Índice de custo (CPI)</div><div class="v ${ind.cpi_faixa === 'ruim' ? 'neg' : ind.cpi_faixa === 'ok' ? 'pos' : ''}">${ind.cpi == null ? '—' : String(ind.cpi).replace('.', ',')}</div><small class="mut">1,00 = custo como orçado; abaixo de 1 = gastando mais</small></div>
        <div class="card kpi"><div class="l">Custo final projetado</div><div class="v ${ind.previsao_custo_final && ind.previsao_custo_final > c.orcamento_custo ? 'neg' : ''}">${ind.previsao_custo_final ? brl(ind.previsao_custo_final) : '—'}</div><small class="mut">orçado ${brl(c.orcamento_custo)} · se o ritmo de custo continuar</small></div></div>
      <div class="card"><h2>Curva S: previsto × realizado</h2>
        ${graficoLinhas({ serie: c.serie, hoje: c.hoje, linhas: [{ chave: 'planejado', rotulo: 'Avanço planejado', cor: '#8a97a6', tracejado: true }, { chave: 'realizado', rotulo: 'Avanço realizado', cor: 'var(--azul)', largura: 3 }, { chave: 'custo', rotulo: 'Custo pago (% do orçamento de custo)', cor: '#2b6fb3', largura: 2 }] })}
        <p class="legenda">Quando a linha laranja fica abaixo da tracejada, a obra está atrasada em relação ao cronograma. Se a linha azul sobe mais que a laranja, o custo está crescendo mais rápido que o avanço.</p></div>`}
      <div class="card"><div class="titulo-saldos"><h2>Custo por etapa: orçado × realizado</h2></div>
        <p class="legenda aviso-vivo">${adm ? 'Defina o custo orçado de cada etapa em Cronograma (clique na etapa). ' : ''}Para o custo cair na etapa certa, escolha a etapa ao lançar a despesa ou o material.</p>
        <div class="tbl"><table><thead><tr><th>Etapa</th><th class="n">Avanço</th><th class="n">Orçado</th><th class="n">Realizado</th><th class="n">Diferença</th><th style="width:20%"></th></tr></thead><tbody>
        ${ce.etapas.map((e) => `<tr><td>${esc(e.nome)}</td><td class="n">${e.progresso}%</td><td class="n">${e.custo_orcado ? brl(e.custo_orcado) : '<span class="mut">—</span>'}</td><td class="n">${e.realizado ? brl(e.realizado) : '<span class="mut">—</span>'}${e.a_pagar ? `<br><small class="mut">${brl(e.a_pagar)} a pagar</small>` : ''}</td>
          <td class="n ${e.estouro ? 'neg' : e.desvio != null ? 'pos' : ''}">${e.desvio == null ? '—' : (e.desvio > 0 ? '+ ' : '− ') + brl(Math.abs(e.desvio))}</td><td>${e.custo_orcado ? barraProg(Math.min(100, Math.round((e.realizado / e.custo_orcado) * 100))) : ''}</td></tr>`).join('')}
        <tr><td><i class="mut">Sem etapa informada</i></td><td></td><td></td><td class="n">${brl(ce.sem_etapa)}</td><td></td><td></td></tr></tbody>
        <tfoot><tr><td colspan="2">Total das etapas</td><td class="n">${brl(ce.orcado_etapas)}</td><td class="n">${brl(ce.realizado_etapas)}</td><td colspan="2"></td></tr></tfoot></table></div></div>`;
  }
  U.extraAbas.push(['curva', 'Curva S e custos', abaCurva, false]);

  // ---------- aditivos (dentro da aba Financeiro, só gestão) ----------
  U.aditivosExtra = (el, d, recarrega) => {
    if (!el || !d.aditivos) return;
    const adm = ehAdmin(), o = d.obra;
    el.innerHTML = `<div class="card"><div class="titulo-saldos"><h2>Aditivos de contrato</h2>${adm ? '<button class="mini" id="nad">+ Aditivo</button>' : ''}</div>
      <p class="legenda aviso-vivo">Mudanças de escopo, valor e prazo combinadas com o cliente. Cada aditivo atualiza o contrato e a previsão de término, e o histórico fica guardado.</p>
      ${d.aditivos.length ? `<div class="tbl"><table><thead><tr><th>Nº</th><th>Data</th><th>Descrição</th><th class="n">Valor</th><th class="n">Prazo</th><th></th></tr></thead><tbody>${d.aditivos.map((a, i) => `<tr><td>${a.numero}º</td><td>${dataBR(a.data)}</td><td>${esc(a.descricao)}<br><small class="mut">${esc(a.autor || '')}</small></td>
        <td class="n ${a.valor_delta >= 0 ? 'pos' : 'neg'}">${a.valor_delta >= 0 ? '+ ' : '− '}${brl(Math.abs(a.valor_delta))}</td><td class="n">${a.prazo_delta_dias ? (a.prazo_delta_dias > 0 ? '+' : '−') + Math.abs(a.prazo_delta_dias) + ' d' : '—'}</td>
        <td class="n">${adm && i === d.aditivos.length - 1 ? `<button class="mini sec" data-undo="${a.id}">desfazer</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : vazio('Nenhum aditivo: o contrato está como foi assinado.')}</div>`;
    el.querySelector('#nad')?.addEventListener('click', () => {
      const m = modal(`<h2>Novo aditivo — ${esc(o.codigo)}</h2><form class="form" id="fa" style="margin-top:12px"><div class="cheio"><label>O que mudou? ${ast}</label><input name="descricao" placeholder="Ex.: inclusão de piscina no escopo"></div>
        ${campo('Mudança no valor (R$, negativo reduz)', 'valor_delta', '')}${campo('Mudança no prazo (dias, negativo reduz)', 'prazo_delta_dias', '', 'number')}${campo('Data do aditivo', 'data', hojeISO(), 'date')}</form>
        <p class="legenda">Contrato atual: ${brl(o.valor_contrato)} · término previsto ${o.previsao_fim ? dataBR(o.previsao_fim) : '—'}</p>
        <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Registrar aditivo</button></div>`, 560);
      m.el.querySelector('#x').onclick = m.fechar;
      m.el.querySelector('#ok').onclick = () => acao(async () => {
        const v = Object.fromEntries(new FormData(m.el.querySelector('#fa')));
        v.valor_delta = v.valor_delta ? (String(v.valor_delta).trim().startsWith('-') ? -paraCentavos(String(v.valor_delta).replace('-', '')) : paraCentavos(v.valor_delta)) : 0;
        if (Number.isNaN(v.valor_delta)) throw new Error('Valor inválido.');
        await api(`/api/obras/${o.id}/aditivos`, { method: 'POST', body: v }); m.fechar(); await recarrega();
      }, 'Aditivo registrado');
    });
    el.querySelectorAll('[data-undo]').forEach((b) => (b.onclick = () => confirm('Desfazer o último aditivo? O valor e o prazo voltam ao que eram.') && acao(async () => { await api(`/api/obras/${o.id}/aditivos/${b.dataset.undo}`, { method: 'DELETE' }); await recarrega(); }, 'Aditivo desfeito')));
  };

  // =====================================================================
  // Fluxo de caixa projetado
  // =====================================================================
  async function fluxocaixa() {
    const f = await api('/api/fluxo-projetado');
    const maxV = Math.max(...f.semanas.flatMap((s) => [Math.abs(s.saldo), s.entradas, s.saidas]), f.saldo_hoje, 1);
    const W = 760, H = 250, mx = 70, my = 16, iw = W - mx - 12, ih = H - my - 30, n = f.semanas.length, gw = iw / n;
    const Y = (v) => my + ih / 2 - (v / maxV) * (ih / 2);
    const linha = f.semanas.map((s, i) => `${(mx + gw * i + gw / 2).toFixed(1)},${Y(s.saldo).toFixed(1)}`).join(' ');
    const neg = f.semanas.filter((s) => s.saldo < 0);
    $app.innerHTML = `<h1>Fluxo de caixa projetado</h1><p class="sub">Para onde o caixa vai nas próximas 13 semanas, com o que já está contratado, pedido e programado.</p>
      <div class="grid">
        <div class="card kpi"><div class="l">Caixa hoje</div><div class="v">${brl(f.saldo_hoje)}</div></div>
        <div class="card kpi"><div class="l">Entradas previstas (13 sem.)</div><div class="v pos">${brl(f.semanas.reduce((a, s) => a + s.entradas, 0))}</div><small class="mut">medições a receber</small></div>
        <div class="card kpi"><div class="l">Saídas previstas (13 sem.)</div><div class="v neg">${brl(f.semanas.reduce((a, s) => a + s.saidas, 0))}</div></div>
        <div class="card kpi"><div class="l">Menor saldo previsto</div><div class="v ${f.pior_semana.saldo < 0 ? 'neg' : ''}">${brl(f.pior_semana.saldo)}</div><small class="mut">semana de ${dmes(f.pior_semana.inicio)}</small></div></div>
      ${neg.length ? `<div class="aviso-box">${ico('info')}<span><b>Atenção:</b> o caixa projetado fica negativo a partir da semana de ${dmes(neg[0].inicio)}. Antecipe recebimentos, renegocie prazos de pagamento ou use a reserva dos sócios.</span></div>` : `<div class="aviso-box">${ico('check')}<span>O caixa projetado se mantém positivo nas próximas 13 semanas.</span></div>`}
      <div class="card"><h2>Saldo semana a semana</h2>
        <svg class="graf" viewBox="0 0 ${W} ${H}" role="img">
          <line x1="${mx}" x2="${W - 12}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--bd2)"/>
          ${[-1, -0.5, 0.5, 1].map((k) => `<text class="gt" x="${mx - 6}" y="${Y(maxV * k) + 3}" text-anchor="end">${(k * maxV / 100000000).toFixed(1).replace('.', ',')} mi</text>`).join('')}<text class="gt" x="${mx - 6}" y="${Y(0) + 3}" text-anchor="end">0</text>
          ${f.semanas.map((s, i) => { const x = mx + gw * i + gw * 0.12, bw = gw * 0.34; return `<rect x="${x}" y="${Y(s.entradas)}" width="${bw}" height="${Math.max(0, Y(0) - Y(s.entradas))}" fill="var(--ver)" opacity=".75"><title>Entradas ${brl(s.entradas)}</title></rect><rect x="${x + bw + 2}" y="${Y(0)}" width="${bw}" height="${Math.max(0, Y(-s.saidas) - Y(0))}" fill="var(--verm)" opacity=".75"><title>Saídas ${brl(s.saidas)}</title></rect><text class="gt" x="${mx + gw * i + gw / 2}" y="${H - 8}" text-anchor="middle">${dmes(s.inicio)}</text>`; }).join('')}
          <polyline fill="none" stroke="var(--navy)" stroke-width="2.6" stroke-linejoin="round" points="${linha}"/>
          ${f.semanas.map((s, i) => `<circle cx="${mx + gw * i + gw / 2}" cy="${Y(s.saldo)}" r="3.5" fill="${s.saldo < 0 ? 'var(--verm)' : 'var(--navy)'}"><title>Saldo ${brl(s.saldo)}</title></circle>`).join('')}</svg>
        <p class="legenda"><span class="sw" style="background:var(--ver)"></span>entradas &nbsp; <span class="sw" style="background:var(--verm)"></span>saídas &nbsp; <span class="sw" style="background:var(--navy)"></span>saldo ao fim da semana</p></div>
      <div class="card"><h2>Detalhe por semana</h2><div class="tbl"><table><thead><tr><th>Semana de</th><th class="n">Medições</th><th class="n">Materiais</th><th class="n">Terceirizadas</th><th class="n">Custos de campo</th><th class="n">Despesas gerais</th><th class="n">Recorrentes</th><th class="n">Saldo final</th></tr></thead><tbody>
        ${f.semanas.map((s) => `<tr><td>${dmes(s.inicio)}</td><td class="n pos">${s.medicoes ? brl(s.medicoes) : '—'}</td><td class="n">${s.materiais ? brl(s.materiais) : '—'}</td><td class="n">${s.terceiros ? brl(s.terceiros) : '—'}</td><td class="n">${s.campo ? brl(s.campo) : '—'}</td><td class="n">${s.gerais ? brl(s.gerais) : '—'}</td><td class="n">${s.recorrencias ? brl(s.recorrencias) : '—'}</td><td class="n ${cls(s.saldo)}"><b>${brl(s.saldo)}</b></td></tr>`).join('')}</tbody></table></div></div>
      <div class="card"><h2>Como a projeção é calculada</h2><ul>${f.premissas.map((p) => `<li>${esc(p)}</li>`).join('')}</ul><p class="legenda">É uma estimativa gerencial para decisão, não garantia de caixa: confirme com o financeiro.</p></div>`;
  }

  // =====================================================================
  // Folha de diárias
  // =====================================================================
  async function folha() {
    state.folhaSem = state.folhaSem || hojeISO();
    const s = await api(`/api/folha/${state.folhaSem}`), podePagar = pode('operador');
    const nav = (n) => { state.folhaSem = somaDias(s.inicio, n * 7); folha(); };
    $app.innerHTML = `<h1>Folha de diárias</h1><p class="sub">A presença registrada nas obras × a diária de cada pessoa. O pagamento vira saída no caixa, ligada à obra, e a semana não é paga duas vezes.</p>
      <div class="row"><button class="sec" id="ant">${ico('arrow-left')}</button><b style="min-width:230px;text-align:center;font-size:16px">Semana de ${dataBR(s.inicio)} a ${dataBR(s.fim)}</b><button class="sec" id="prox">${ico('arrow-right')}</button><button class="sec" id="hoje">Esta semana</button><span style="flex:1"></span>${podePagar && s.pendente ? `<button id="pagar">Pagar semana (${brl(s.pendente)})</button>` : ''}</div>
      <div class="grid"><div class="card kpi"><div class="l">Total da semana</div><div class="v">${brl(s.total)}</div></div><div class="card kpi"><div class="l">Já pago</div><div class="v pos">${brl(s.pago)}</div></div><div class="card kpi"><div class="l">A pagar</div><div class="v ${s.pendente ? 'neg' : ''}">${brl(s.pendente)}</div></div></div>
      ${s.por_obra.length ? `<div class="card"><h2>Por obra</h2>${s.por_obra.map((o) => `<div class="barra"><span class="nome">${esc(o.codigo)} · ${esc(o.obra)}</span><span class="trilho"><span class="fill" style="display:block;width:${(o.total / s.total) * 100}%"></span></span><span class="val">${brl(o.total)}</span></div>`).join('')}</div>` : ''}
      <div class="card"><h2>Pessoas com diária</h2>${s.linhas.length ? `<div class="tbl"><table><thead><tr><th>Pessoa</th><th>Obra</th><th class="n">Dias</th><th class="n">Diária</th><th class="n">Faltas</th><th class="n">Valor</th><th>Situação</th></tr></thead><tbody>
        ${s.linhas.map((r) => `<tr><td><b>${esc(r.nome)}</b><br><small class="mut">${esc(U.FUNCAO?.[r.funcao_obra] || r.funcao_obra || '')}</small></td><td><small>${esc(r.codigo)}</small></td><td class="n">${r.dias}${r.atrasos ? `<br><small class="mut">${r.atrasos} atraso(s)</small>` : ''}</td><td class="n">${brl(r.valor_diaria)}</td><td class="n ${r.faltas ? 'neg' : ''}">${r.faltas || '—'}</td><td class="n"><b>${brl(r.valor)}</b></td>
          <td>${r.pago ? '<span class="tag ok">pago</span>' : '<span class="tag aviso">a pagar</span>'}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="5">Total</td><td class="n">${brl(s.total)}</td><td></td></tr></tfoot></table></div>
        <p class="legenda" style="margin-top:8px">Só entram pessoas com “diária” cadastrada na ficha (diaristas e empreiteiros). Atraso conta como dia trabalhado; falta e atestado não.</p>` : vazio('Nenhuma presença de pessoa com diária nesta semana. Cadastre o valor da diária na ficha da pessoa e registre a presença nas obras.')}</div>`;
    document.getElementById('ant').onclick = () => nav(-1); document.getElementById('prox').onclick = () => nav(1);
    document.getElementById('hoje').onclick = () => { state.folhaSem = hojeISO(); folha(); };
    document.getElementById('pagar')?.addEventListener('click', () => {
      const contas = state.meta.contas.filter((c) => c.ativo), aPagar = s.linhas.filter((r) => !r.pago);
      const m = modal(`<h2>Pagar diárias</h2><p class="legenda">Semana de ${dataBR(s.inicio)} a ${dataBR(s.fim)}. Cada pessoa vira uma saída no caixa, na obra onde trabalhou.</p>
        <form class="form" id="fp" style="margin-top:10px"><div class="cheio"><label>Pago de qual conta?</label><select name="conta_id">${contas.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></div></form>
        <div class="tbl" style="max-height:260px;overflow:auto"><table><tbody>${aPagar.map((r) => `<tr><td><label class="chk"><input type="checkbox" data-pf="${r.funcionario_id}:${r.obra_id}" checked> ${esc(r.nome)}</label><br><small class="mut">${esc(r.codigo)} · ${r.dias} dia(s)</small></td><td class="n">${brl(r.valor)}</td></tr>`).join('')}</tbody></table></div>
        <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Confirmar pagamento</button></div>`, 520);
      m.el.querySelector('#x').onclick = m.fechar;
      m.el.querySelector('#ok').onclick = () => acao(async () => {
        const itens = [...m.el.querySelectorAll('[data-pf]:checked')].map((c) => { const [funcionario_id, obra_id] = c.dataset.pf.split(':'); return { funcionario_id: +funcionario_id, obra_id: +obra_id }; });
        if (!itens.length) throw new Error('Marque quem será pago.');
        const r = await api('/api/folha/pagar', { method: 'POST', body: { semana: s.inicio, conta_id: m.el.querySelector('[name=conta_id]').value, itens } });
        m.fechar(); await folha(); toast(`${r.pagos} pagamento(s) lançados no caixa: ${brl(r.total)}`);
      });
    });
  }

  // =====================================================================
  // Compras: aprovação por limite e cotação (dentro da página Materiais)
  // =====================================================================
  U.comprasExtra = async (el, { d, recarrega, obras, fornecedores }) => {
    if (!el) return;
    const adm = ehAdmin(), r = d.resumo;
    const [cotacoes, cfg] = await Promise.all([api('/api/cotacoes'), api('/api/compras/config')]);
    const aguardando = d.lista.filter((m) => m.status === 'aguardando_aprovacao');
    const abertas = cotacoes.filter((c) => c.status === 'aberta'), fechadas = cotacoes.filter((c) => c.status === 'fechada').slice(0, 5);
    el.innerHTML = `${aguardando.length ? `<div class="card" style="border-left:3px solid var(--verm)"><h2>${adm ? 'Compras aguardando sua aprovação' : 'Compras aguardando aprovação da gestão'} (${aguardando.length})</h2>
        <div class="tbl"><table><tbody>${aguardando.map((m) => `<tr><td><b>${esc(m.descricao)}</b><br><small class="mut">${esc(m.obra_codigo)} · ${esc(m.fornecedor || 'sem fornecedor')}</small></td><td class="n">${qtd(m.quantidade)} ${esc(m.unidade)}</td><td class="n"><b>${brl(m.total)}</b></td>
          <td class="n">${adm ? `<button class="mini" data-apv2="${m.id}">Aprovar</button> <button class="mini perigo" data-rcs2="${m.id}">Recusar</button>` : '<span class="tag aviso">em análise</span>'}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
      <div class="card"><div class="titulo-saldos"><h2>Cotações</h2><button class="mini" id="ncot">+ Nova cotação</button></div>
        <p class="legenda aviso-vivo">Peça preço a 2 ou 3 fornecedores, compare e feche com o melhor: o pedido de material é criado sozinho.${adm ? '' : ''}</p>
        ${abertas.length ? abertas.map((c) => `<div class="cotacao"><div class="titulo-saldos"><div><b>${esc(c.descricao)}</b> <span class="mut">· ${qtd(c.quantidade)} ${esc(c.unidade)} · ${esc(c.obra_codigo)}</span></div><div class="fu-acoes"><button class="mini sec" data-cp="${c.id}">+ Preço</button><button class="mini perigo" data-cc="${c.id}">Cancelar</button></div></div>
          <div class="tbl"><table><thead><tr><th>Fornecedor</th><th class="n">Valor unit.</th><th class="n">Total</th><th class="n">Prazo</th><th></th></tr></thead><tbody>${c.itens.map((i) => `<tr class="${i.id === c.melhor_item_id ? 'melhor' : ''}"><td>${esc(i.fornecedor)}${i.id === c.melhor_item_id ? ' <span class="tag ok">menor preço</span>' : ''}</td><td class="n">${brl(i.valor_unit)}</td><td class="n"><b>${brl(i.total)}</b></td><td class="n">${i.prazo_dias != null ? i.prazo_dias + ' d' : '—'}</td><td class="n"><button class="mini ${i.id === c.melhor_item_id ? '' : 'sec'}" data-esc="${c.id}:${i.id}">Comprar deste</button></td></tr>`).join('')}</tbody></table></div>
          ${c.economia ? `<small class="mut">Diferença entre o mais caro e o mais barato: <b>${brl(c.economia)}</b></small>` : ''}</div>`).join('') : vazio('Nenhuma cotação em aberto.')}
        ${fechadas.length ? `<h3 style="margin:16px 0 6px;font-size:13px;color:var(--mut)">ÚLTIMAS COTAÇÕES FECHADAS</h3><ul style="margin:0">${fechadas.map((c) => { const v = c.itens.find((i) => i.id === c.vencedora_id); return `<li><b>${esc(c.descricao)}</b> (${esc(c.obra_codigo)}) — ${esc(v?.fornecedor || '')} a ${v ? brl(v.valor_unit) : ''}${c.economia ? ` · economia vs. o mais caro: <span class="pos">${brl(c.economia)}</span>` : ''}</li>`; }).join('')}</ul>` : ''}</div>
      ${adm ? `<div class="card"><h2>Regra de aprovação</h2><form class="row" id="flim" style="margin:0"><div><label>Compras do engenheiro a partir de (R$) precisam da sua aprovação</label><input name="limite" inputmode="decimal" value="${cfg.limite_aprovacao ? brlInput(cfg.limite_aprovacao) : ''}" placeholder="0 = sem aprovação"></div><button>Salvar</button></form>
        <p class="legenda">Hoje: ${cfg.limite_aprovacao ? `compras de ${brl(cfg.limite_aprovacao)} ou mais ficam aguardando você.` : 'o engenheiro compra sem precisar de aprovação.'} Compras feitas pela gestão nunca esperam.</p></div>` : ''}`;
    const refaz = () => recarrega();
    el.querySelectorAll('[data-apv2]').forEach((b) => (b.onclick = () => acao(async () => { await api(`/api/materiais/${b.dataset.apv2}/aprovar`, { method: 'POST', body: {} }); await refaz(); }, 'Compra aprovada')));
    el.querySelectorAll('[data-rcs2]').forEach((b) => (b.onclick = () => { const t = prompt('Motivo da recusa:'); if (t) acao(async () => { await api(`/api/materiais/${b.dataset.rcs2}/recusar`, { method: 'POST', body: { motivo: t } }); await refaz(); }, 'Compra recusada'); }));
    el.querySelector('#flim')?.addEventListener('submit', (e) => { e.preventDefault(); acao(async () => { const v = e.target.limite.value.trim(); const c = v ? paraCentavos(v) : 0; if (Number.isNaN(c)) throw new Error('Valor inválido.'); await api('/api/compras/config', { method: 'PUT', body: { limite_aprovacao: c } }); await refaz(); }, 'Regra salva'); });
    el.querySelectorAll('[data-esc]').forEach((b) => (b.onclick = () => { const [cid, iid] = b.dataset.esc.split(':'); acao(async () => { const r2 = await api(`/api/cotacoes/${cid}/escolher`, { method: 'POST', body: { item_id: +iid } }); await refaz(); toast(r2.status === 'aguardando_aprovacao' ? 'Pedido criado: aguardando a aprovação da gestão.' : 'Pedido de material criado.'); }); }));
    el.querySelectorAll('[data-cc]').forEach((b) => (b.onclick = () => confirm('Cancelar esta cotação?') && acao(async () => { await api(`/api/cotacoes/${b.dataset.cc}/cancelar`, { method: 'POST', body: {} }); await refaz(); }, 'Cotação cancelada')));
    const fornAtivos = fornecedores.filter((f) => f.ativo);
    el.querySelectorAll('[data-cp]').forEach((b) => (b.onclick = () => {
      const m = modal(`<h2>Adicionar preço</h2><form class="form" id="fp" style="margin-top:12px"><div class="cheio"><label>Fornecedor</label><select name="fornecedor_id">${fornAtivos.map((f) => `<option value="${f.id}">${esc(f.nome)}</option>`).join('')}</select></div>${campo('Valor unitário (R$)', 'valor_unit', '')}${campo('Prazo de entrega (dias)', 'prazo_dias', '', 'number')}</form>
        <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Salvar</button></div>`, 480);
      m.el.querySelector('#x').onclick = m.fechar;
      m.el.querySelector('#ok').onclick = () => acao(async () => { const v = Object.fromEntries(new FormData(m.el.querySelector('#fp'))); v.valor_unit = paraCentavos(v.valor_unit); if (!(v.valor_unit >= 0)) throw new Error('Valor inválido.'); await api(`/api/cotacoes/${b.dataset.cp}/precos`, { method: 'POST', body: v }); m.fechar(); await refaz(); }, 'Preço registrado');
    }));
    el.querySelector('#ncot')?.addEventListener('click', () => {
      const linhas = [0, 1, 2].map((i) => `<div class="cot-linha"><select name="f${i}"><option value="">${i < 2 ? 'Fornecedor (obrigatório)' : 'Fornecedor (opcional)'}</option>${fornAtivos.map((f) => `<option value="${f.id}">${esc(f.nome)}</option>`).join('')}</select><input name="v${i}" inputmode="decimal" placeholder="R$ unit."><input name="p${i}" type="number" placeholder="prazo (dias)"></div>`).join('');
      const lista = obras.filter((o) => !o.status || ['em_andamento', 'planejamento', 'pausada'].includes(o.status));
      const m = modal(`<h2>Nova cotação</h2><form class="form" id="fc" style="margin-top:12px" autocomplete="off"><div class="cheio"><label>Obra</label><select name="obra">${lista.map((o) => `<option value="${o.id}">${esc(o.codigo)} · ${esc(o.nome)}</option>`).join('')}</select></div>
        <div class="larg"><label>Material ${ast}</label><input name="descricao" placeholder="Ex.: Cimento CP-II 50 kg"></div>${campo('Quantidade', 'quantidade', '')}${campo('Unidade', 'unidade', 'un')}
        <div class="cheio"><label>Preços dos fornecedores (pelo menos 2)</label>${linhas}</div></form>
        <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Criar cotação</button></div>`, 640);
      m.el.querySelector('#x').onclick = m.fechar;
      m.el.querySelector('#ok').onclick = () => acao(async () => {
        const f = m.el.querySelector('#fc'), v = Object.fromEntries(new FormData(f)), itens = [];
        for (const i of [0, 1, 2]) if (v['f' + i]) { const vu = paraCentavos(v['v' + i]); if (!(vu >= 0)) throw new Error('Informe o valor de cada fornecedor.'); itens.push({ fornecedor_id: +v['f' + i], valor_unit: vu, prazo_dias: v['p' + i] || null }); }
        await api(`/api/obras/${v.obra}/cotacoes`, { method: 'POST', body: { descricao: v.descricao, quantidade: v.quantidade, unidade: v.unidade, itens } }); m.fechar(); await refaz();
      }, 'Cotação criada');
    });
  };

  rotas.fluxocaixa = fluxocaixa; rotas.folha = folha;
}
