// Qualidade e entrega: pendências de acabamento, segurança do trabalho, relatórios em PDF e portal do cliente.
export function instalar(U) {
  const { state, api, esc, brl, dataBR, ico, toast, acao, modal, pode, hojeISO, rotas, ast } = U;
  const $app = document.getElementById('app');
  const { barraProg } = U.obrasUtil;
  const fn = (f) => (f ? f.charAt(0).toUpperCase() + f.slice(1).replace(/_/g, ' ') : '—');
  const vazio = (t) => `<p class="mut">${t}</p>`;
  const ehAdmin = () => state.usuario.papel === 'admin';
  const dia = (d) => (d ? dataBR(String(d).slice(0, 10)) : '—');
  const SIT = { ok: ['ok', 'Em dia'], vence_logo: ['aviso', 'Vence logo'], vencido: ['ruim', 'Vencido'] };
  const tagSit = (s) => `<span class="tag ${SIT[s][0]}">${SIT[s][1]}</span>`;
  const STATUS_PEND = { aberta: ['ruim', 'Aberta'], em_correcao: ['aviso', 'Em correção'], resolvida: ['ok', 'Resolvida'] };

  // =====================================================================
  // Aba "Pendências" (vistoria e termo de entrega)
  // =====================================================================
  async function abaPendencias(el, d, recarrega) {
    const o = d.obra, { itens } = await api(`/api/obras/${o.id}/pendencias`);
    const abertas = itens.filter((p) => p.status !== 'resolvida').length;
    el.innerHTML = `<div class="card"><div class="titulo-saldos"><h2>Pendências de acabamento (${abertas} em aberto)</h2><div class="fu-acoes">
        <button class="sec" id="termo">${ico('download')} Termo de entrega (PDF)</button><button id="np">+ Pendência</button></div></div>
      <p class="legenda aviso-vivo">Lista de vistoria: o que falta corrigir antes de entregar a obra. As pendências em aberto aparecem para o cliente no portal e saem no termo de entrega.</p>
      ${itens.length ? `<div class="tbl"><table><thead><tr><th>Local</th><th>Pendência</th><th>Responsável</th><th>Prazo</th><th>Situação</th><th></th></tr></thead><tbody>${itens.map((p) => `<tr>
        <td>${esc(p.local || '—')}</td><td>${esc(p.descricao)}</td><td>${esc(p.responsavel || '—')}</td>
        <td class="${p.status !== 'resolvida' && p.prazo && p.prazo < d.hoje ? 'neg' : ''}">${dia(p.prazo)}</td>
        <td><span class="tag ${STATUS_PEND[p.status][0]}">${STATUS_PEND[p.status][1]}</span>${p.resolvida_em ? `<br><small class="mut">${dia(p.resolvida_em)}</small>` : ''}</td>
        <td class="n"><button class="mini sec" data-ed="${p.id}">Editar</button></td></tr>`).join('')}</tbody></table></div>` : vazio('Nenhuma pendência cadastrada. Use “+ Pendência” durante a vistoria final.')}</div>`;
    const form = (p = {}) => `<form class="form" id="fp" style="grid-template-columns:1fr 1fr">
      <div><label>Local</label><input name="local" value="${esc(p.local || '')}" placeholder="Ex.: Suíte master"></div>
      <div><label>Responsável</label><input name="responsavel" value="${esc(p.responsavel || '')}" placeholder="Quem vai corrigir"></div>
      <div class="cheio"><label>Pendência ${ast}</label><input name="descricao" value="${esc(p.descricao || '')}" required placeholder="Ex.: mancha de umidade na parede"></div>
      <div><label>Prazo</label><input type="date" name="prazo" value="${esc(p.prazo ? String(p.prazo).slice(0, 10) : '')}"></div>
      <div><label>Situação</label><select name="status">${Object.entries(STATUS_PEND).map(([k, [, r]]) => `<option value="${k}" ${(p.status || 'aberta') === k ? 'selected' : ''}>${r}</option>`).join('')}</select></div></form>`;
    const abrir = (p) => {
      const m = modal(`<h2>${p ? 'Editar pendência' : 'Nova pendência'}</h2>${form(p)}<div class="modal-acoes">${p ? '<button class="perigo" id="del">Excluir</button>' : ''}<span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Salvar</button></div>`, 560);
      m.el.querySelector('#x').onclick = m.fechar;
      m.el.querySelector('#del')?.addEventListener('click', () => confirm('Excluir esta pendência?') && acao(async () => { await api(`/api/obras/${o.id}/pendencias/${p.id}`, { method: 'DELETE' }); m.fechar(); await recarrega(); }, 'Pendência excluída'));
      m.el.querySelector('#ok').onclick = () => acao(async () => {
        const body = Object.fromEntries(new FormData(m.el.querySelector('#fp')));
        await api(`/api/obras/${o.id}/pendencias${p ? '/' + p.id : ''}`, { method: p ? 'PUT' : 'POST', body }); m.fechar(); await recarrega();
      }, 'Pendência salva');
    };
    el.querySelector('#np').onclick = () => abrir();
    el.querySelector('#termo').onclick = () => window.open(`/api/obras/${o.id}/termo-entrega.pdf`, '_blank');
    el.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => abrir(itens.find((p) => p.id === +b.dataset.ed))));
  }
  U.extraAbas.push(['pendencias', 'Pendências', abaPendencias, false]);

  // =====================================================================
  // Aba "Cliente" (só gestão): relatório para o cliente e acesso ao portal
  // =====================================================================
  async function abaCliente(el, d, recarrega) {
    const o = d.obra, acessos = await api(`/api/obras/${o.id}/acessos-cliente`);
    el.innerHTML = `<div class="grid dois"><div class="card"><h2>Relatórios em PDF</h2>
        <p class="legenda aviso-vivo">Documentos prontos com a marca da empresa. O relatório do cliente não mostra custos nem margem.</p>
        <div class="fu-acoes" style="flex-direction:column;align-items:stretch;gap:8px">
          <a class="btn sec" target="_blank" href="/api/obras/${o.id}/relatorio.pdf?tipo=cliente">${ico('download')} Relatório de acompanhamento (cliente)</a>
          <a class="btn sec" target="_blank" href="/api/obras/${o.id}/relatorio.pdf?tipo=interno">${ico('download')} Relatório interno (com custos)</a>
          <a class="btn sec" target="_blank" href="/api/obras/${o.id}/diario.pdf">${ico('download')} Diário de obra — últimos 30 dias</a>
          <a class="btn sec" target="_blank" href="/api/obras/${o.id}/termo-entrega.pdf">${ico('download')} Termo de entrega e vistoria</a></div></div>
      <div class="card"><div class="titulo-saldos"><h2>Portal do cliente</h2><button id="na">+ Acesso</button></div>
        <p class="legenda aviso-vivo">O cliente entra com login próprio e vê só esta obra: avanço, etapas, fotos marcadas como “visível ao cliente”, medições e pendências. Não vê custos, equipe nem documentos internos.</p>
        ${acessos.length ? `<div class="tbl"><table><thead><tr><th>Nome</th><th>Login</th><th>Último acesso</th><th></th></tr></thead><tbody>${acessos.map((a) => `<tr><td>${esc(a.nome)}</td><td>${esc(a.login || a.email || '')}</td><td>${a.ultimo_acesso ? dia(a.ultimo_acesso) : 'nunca'}</td><td class="n"><button class="mini perigo" data-rm="${a.id}">Remover</button></td></tr>`).join('')}</tbody></table></div>` : vazio('Nenhum cliente com acesso a esta obra.')}</div></div>`;
    el.querySelector('#na').onclick = () => {
      const m = modal(`<h2>Novo acesso de cliente</h2><form class="form" id="fc" style="grid-template-columns:1fr">
        <div><label>Nome ${ast}</label><input name="nome" required value="${esc(o.cliente || '')}"></div>
        <div><label>Login ${ast}</label><input name="login" required autocomplete="off" placeholder="ex.: cliente.silva"></div>
        <div><label>Senha inicial ${ast}</label><input name="senha" type="password" required minlength="8" autocomplete="new-password"><small class="mut">Mínimo de 8 caracteres. O cliente pode trocar depois.</small></div></form>
        <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Criar acesso</button></div>`, 460);
      m.el.querySelector('#x').onclick = m.fechar;
      m.el.querySelector('#ok').onclick = () => acao(async () => { await api(`/api/obras/${o.id}/acessos-cliente`, { method: 'POST', body: Object.fromEntries(new FormData(m.el.querySelector('#fc'))) }); m.fechar(); await recarrega(); }, 'Acesso criado');
    };
    el.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => confirm('Remover o acesso deste cliente à obra?') && acao(async () => { await api(`/api/obras/${o.id}/acessos-cliente/${b.dataset.rm}`, { method: 'DELETE' }); await recarrega(); }, 'Acesso removido')));
  }
  U.extraAbas.push(['cliente', 'Cliente e relatórios', abaCliente, true]);

  // =====================================================================
  // Segurança do trabalho
  // =====================================================================
  async function seguranca() {
    const p = await api('/api/seguranca'), r = p.resumo, adm = ehAdmin();
    const sel = state.segPessoa;
    $app.innerHTML = `<h1>Segurança do trabalho</h1><p class="sub">Treinamentos, entrega de EPI e inspeções do canteiro, com aviso do que vence. Controle de apoio: a validação final é do técnico de segurança / engenheiro responsável.</p>
      <div class="grid">
        <div class="card kpi"><div class="l">Pessoas acompanhadas</div><div class="v">${r.pessoas}</div></div>
        <div class="card kpi"><div class="l">Itens vencidos</div><div class="v ${r.vencidos ? 'neg' : 'pos'}">${r.vencidos}</div><small class="mut">treinamentos e EPIs</small></div>
        <div class="card kpi"><div class="l">Vencem em 30 dias</div><div class="v ${r.vencem ? '' : 'pos'}">${r.vencem}</div></div>
        <div class="card kpi"><div class="l">Sem integração NR-18</div><div class="v ${r.sem_integracao ? 'neg' : 'pos'}">${r.sem_integracao}</div></div>
        <div class="card kpi"><div class="l">Inspeções atrasadas</div><div class="v ${r.inspecoes_atrasadas ? 'neg' : 'pos'}">${r.inspecoes_atrasadas}</div><small class="mut">sem checklist há 7+ dias</small></div></div>
      <div class="card"><div class="titulo-saldos"><h2>Inspeção de segurança por obra</h2></div>
        ${p.obras.length ? `<div class="tbl"><table><thead><tr><th>Obra</th><th>Última inspeção</th><th class="n">Conformidade</th><th></th></tr></thead><tbody>${p.obras.map((o) => `<tr><td>${esc(o.codigo)} · ${esc(o.nome)}</td>
          <td class="${o.atrasada ? 'neg' : ''}">${o.ultima ? dia(o.ultima) : 'nunca'}${o.atrasada ? ' · atrasada' : ''}</td><td class="n">${o.total ? `${o.conformes}/${o.total}` : '—'}</td>
          <td class="n"><button class="mini" data-insp="${o.id}">Fazer inspeção</button> <button class="mini sec" data-hist="${o.id}">Histórico</button></td></tr>`).join('')}</tbody></table></div>` : vazio('Nenhuma obra em andamento.')}</div>
      <div class="card"><div class="titulo-saldos"><h2>Equipe: treinamentos e EPI</h2></div>
        ${p.pessoas.length ? `<div class="tbl"><table><thead><tr><th>Pessoa</th><th>Função</th><th>Treinamentos</th><th>EPI</th><th>Situação</th><th></th></tr></thead><tbody>${p.pessoas.map((x) => `<tr>
          <td>${esc(x.nome)}</td><td>${esc(fn(x.funcao_obra))}</td><td>${x.treinamentos.length}</td><td>${x.epi.length}</td>
          <td>${x.vencidos ? `<span class="tag ruim">${x.vencidos} vencido(s)</span> ` : ''}${x.vencem ? `<span class="tag aviso">${x.vencem} vencendo</span> ` : ''}${x.sem_integracao ? '<span class="tag ruim">sem NR-18</span>' : ''}${!x.vencidos && !x.vencem && !x.sem_integracao ? '<span class="tag ok">Em dia</span>' : ''}</td>
          <td class="n"><button class="mini sec" data-pessoa="${x.id}">Abrir</button></td></tr>`).join('')}</tbody></table></div>` : vazio('Nenhuma pessoa vinculada às suas obras.')}</div>`;
    $app.querySelectorAll('[data-insp]').forEach((b) => (b.onclick = () => janelaInspecao(+b.dataset.insp, p, seguranca)));
    $app.querySelectorAll('[data-hist]').forEach((b) => (b.onclick = () => historicoInspecoes(+b.dataset.hist)));
    $app.querySelectorAll('[data-pessoa]').forEach((b) => (b.onclick = () => janelaPessoa(p.pessoas.find((x) => x.id === +b.dataset.pessoa), p)));
    if (sel) { state.segPessoa = null; }
  }
  function janelaInspecao(obraId, p, depois) {
    const o = p.obras.find((x) => x.id === obraId);
    const m = modal(`<h2>Inspeção de segurança</h2><p class="legenda">${esc(o.codigo)} · ${esc(o.nome)}. Marque o que está conforme; se algo não estiver, descreva a providência.</p>
      <form id="fi"><div class="form" style="grid-template-columns:1fr"><div><label>Data</label><input type="date" name="data" value="${hojeISO()}" max="${hojeISO()}"></div></div>
      <div class="checklist">${p.checklist.map((t, i) => `<label class="chk" style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--bd)"><input type="checkbox" data-i="${i}" checked> ${esc(t)}</label>`).join('')}</div>
      <div class="form" style="grid-template-columns:1fr;margin-top:10px"><div><label>Observações / providências</label><input name="observacoes" placeholder="Obrigatório se houver item não conforme"></div></div></form>
      <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Registrar</button></div>`, 620);
    m.el.querySelector('#x').onclick = m.fechar;
    m.el.querySelector('#ok').onclick = () => acao(async () => {
      const fm = m.el.querySelector('#fi');
      const itens = [...fm.querySelectorAll('[data-i]')].map((c) => ({ item: p.checklist[+c.dataset.i], ok: c.checked }));
      await api(`/api/obras/${obraId}/inspecoes`, { method: 'POST', body: { data: fm.data.value, itens, observacoes: fm.observacoes.value } });
      m.fechar(); await depois();
    }, 'Inspeção registrada');
  }
  async function historicoInspecoes(obraId) {
    const l = await api(`/api/obras/${obraId}/inspecoes`);
    const m = modal(`<h2>Histórico de inspeções</h2>${l.length ? l.map((i) => `<div class="card" style="margin:8px 0"><b>${dia(i.data)}</b> · ${i.conformes}/${i.total} conformes <small class="mut">por ${esc(i.responsavel || '—')}</small>
      ${i.itens.filter((x) => !x.ok).map((x) => `<br><span class="neg">✗ ${esc(x.item)}</span>`).join('')}${i.observacoes ? `<br><small>${esc(i.observacoes)}</small>` : ''}</div>`).join('') : vazio('Nenhuma inspeção registrada.')}
      <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Fechar</button></div>`, 620);
    m.el.querySelector('#x').onclick = m.fechar;
  }
  function janelaPessoa(x, p) {
    const tabela = (itens, cols, tabela_) => itens.length ? `<div class="tbl"><table><thead><tr>${cols.map((c) => `<th>${c[0]}</th>`).join('')}<th></th></tr></thead><tbody>${itens.map((t) => `<tr>${cols.map((c) => `<td>${c[1](t)}</td>`).join('')}<td class="n"><button class="mini perigo" data-del="${tabela_}:${t.id}">×</button></td></tr>`).join('')}</tbody></table></div>` : vazio('Nenhum registro.');
    const m = modal(`<h2>${esc(x.nome)}</h2><p class="legenda">${esc(fn(x.funcao_obra))}</p>
      <h3>Treinamentos</h3>${tabela(x.treinamentos, [['Treinamento', (t) => esc(t.tipo)], ['Data', (t) => dia(t.data)], ['Validade', (t) => dia(t.validade)], ['', (t) => tagSit(t.situacao)]], 'treinamentos')}
      <form class="form" id="ft" style="grid-template-columns:2fr 1fr 1fr auto;align-items:end;margin-top:8px"><div><label>Novo treinamento</label><input name="tipo" list="lt" required placeholder="Ex.: NR-35"><datalist id="lt">${p.sugestoes?.map((s) => `<option value="${esc(s)}">`).join('') || p.tipos.map((s) => `<option value="${esc(s)}">`).join('')}</datalist></div>
        <div><label>Data</label><input type="date" name="data" required max="${hojeISO()}"></div><div><label>Validade</label><input type="date" name="validade"></div><div><button>Adicionar</button></div></form>
      <h3 style="margin-top:18px">EPIs entregues</h3>${tabela(x.epi, [['Item', (t) => esc(t.item)], ['CA', (t) => esc(t.ca || '—')], ['Entrega', (t) => dia(t.data)], ['Validade', (t) => dia(t.validade)], ['', (t) => tagSit(t.situacao)]], 'epi')}
      <form class="form" id="fe" style="grid-template-columns:2fr 1fr 1fr 1fr auto;align-items:end;margin-top:8px"><div><label>Nova entrega</label><input name="item" required placeholder="Ex.: capacete, bota, cinto"></div><div><label>CA</label><input name="ca"></div>
        <div><label>Data</label><input type="date" name="data" required value="${hojeISO()}" max="${hojeISO()}"></div><div><label>Validade</label><input type="date" name="validade"></div><div><button>Adicionar</button></div></form>
      <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Fechar</button></div>`, 760);
    m.el.querySelector('#x').onclick = m.fechar;
    const enviar = (id, url) => (m.el.querySelector(id).onsubmit = (e) => { e.preventDefault(); acao(async () => { await api(url, { method: 'POST', body: { ...Object.fromEntries(new FormData(e.target)), funcionario_id: x.id } }); m.fechar(); await seguranca(); }, 'Registrado'); });
    enviar('#ft', '/api/seguranca/treinamentos'); enviar('#fe', '/api/seguranca/epi');
    m.el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { const [t, id] = b.dataset.del.split(':'); confirm('Excluir este registro?') && acao(async () => { await api(`/api/seguranca/${t}/${id}`, { method: 'DELETE' }); m.fechar(); await seguranca(); }, 'Registro excluído'); }));
  }
  rotas.seguranca = seguranca;

  // =====================================================================
  // Portal do cliente
  // =====================================================================
  async function portal() {
    const { obras, hoje } = await api('/api/portal');
    $app.innerHTML = `<h1>Acompanhe a sua obra</h1><p class="sub">Olá, ${esc(state.usuario.nome.split(' ')[0])}! Aqui você vê o andamento, as fotos e os próximos passos.</p>` +
      (obras.length ? obras.map((o) => {
        const atras = o.ritmo?.situacao === 'atrasada';
        return `<div class="card"><div class="titulo-saldos"><h2>${esc(o.nome)}</h2><span class="tag">${esc(o.codigo)}</span></div>
          <p class="mut">${esc([o.endereco, o.bairro, o.cidade].filter(Boolean).join(' · '))} · responsável técnico: ${esc(o.responsavel || '—')}</p>
          <div class="grid"><div class="card kpi"><div class="l">Avanço</div><div class="v">${o.progresso}%</div>${barraProg(o.progresso)}<small class="mut">${o.status === 'concluida' ? 'obra concluída' : `etapa atual: ${esc(o.fase_atual || '—')}`}</small></div>
            <div class="card kpi"><div class="l">Previsão de entrega</div><div class="v" style="font-size:19px">${dia(o.previsao_fim)}</div><small class="${atras ? 'neg' : 'mut'}">${o.ritmo ? (o.ritmo.dias_restantes >= 0 ? o.ritmo.dias_restantes + ' dia(s) restantes' : -o.ritmo.dias_restantes + ' dia(s) além do prazo') : ''}</small></div>
            <div class="card kpi"><div class="l">Pagamentos</div><div class="v" style="font-size:19px">${brl(o.financeiro.pago)}<small class="mut"> / ${brl(o.financeiro.contrato)}</small></div><small class="mut">pago do valor do contrato</small></div>
            <div class="card kpi"><div class="l">Pendências</div><div class="v ${o.pendencias.some((p) => p.status !== 'resolvida') ? 'neg' : 'pos'}">${o.pendencias.filter((p) => p.status !== 'resolvida').length}</div><small class="mut">em aberto</small></div></div>
          <div class="grid dois"><div><h3>Etapas</h3>${o.etapas.map((f) => `<div class="barra"><span class="nome" title="${esc(f.nome)}">${esc(f.nome)}</span><span class="trilho"><span class="fill" style="display:block;width:${f.progresso}%"></span></span><span class="pct">${f.progresso}%</span></div>`).join('') || vazio('Etapas ainda não definidas.')}</div>
            <div><h3>Próximos compromissos</h3>${o.marcos.length ? `<ul class="alertas">${o.marcos.map((m) => `<li class="info"><b>${dia(m.data)}${m.hora ? ' às ' + esc(m.hora) : ''}</b> — ${esc(m.titulo)}</li>`).join('')}</ul>` : vazio('Nada agendado por enquanto.')}
              <h3 style="margin-top:14px">Últimas atividades</h3>${o.atividades.length ? `<ul class="alertas">${o.atividades.map((a) => `<li class="info"><b>${dia(a.data)}</b> — ${esc(a.atividades)}</li>`).join('')}</ul>` : vazio('Sem registros recentes.')}</div></div>
          ${o.fotos.length ? `<h3>Fotos da obra</h3><div class="galeria">${o.fotos.map((f) => `<figure data-foto="${f.id}" tabindex="0"><img src="/api/fotos/${f.id}/miniatura" alt="${esc(f.legenda || 'Foto da obra')}" loading="lazy"><figcaption><b>${dia(f.data)}</b>${f.etapa ? ' · ' + esc(f.etapa) : ''}${f.legenda ? '<br>' + esc(f.legenda) : ''}</figcaption></figure>`).join('')}</div>` : ''}
          ${o.financeiro.medicoes.length ? `<h3>Cronograma de pagamentos</h3><div class="tbl"><table><thead><tr><th>Parcela</th><th>Descrição</th><th>Previsão</th><th class="n">Valor</th><th>Situação</th></tr></thead><tbody>${o.financeiro.medicoes.map((m) => `<tr><td>${m.numero}ª</td><td>${esc(m.descricao || '')}</td><td>${dia(m.data_prevista)}</td><td class="n">${brl(m.valor)}</td><td>${m.status === 'recebida' ? '<span class="tag ok">Paga</span>' : m.data_prevista < hoje ? '<span class="tag ruim">Em atraso</span>' : '<span class="tag">A vencer</span>'}</td></tr>`).join('')}</tbody></table></div>` : ''}
          ${o.pendencias.length ? `<h3>Pendências da vistoria</h3><div class="tbl"><table><thead><tr><th>Local</th><th>Pendência</th><th>Prazo</th><th>Situação</th></tr></thead><tbody>${o.pendencias.map((p) => `<tr><td>${esc(p.local || '—')}</td><td>${esc(p.descricao)}</td><td>${dia(p.prazo)}</td><td><span class="tag ${STATUS_PEND[p.status][0]}">${STATUS_PEND[p.status][1]}</span></td></tr>`).join('')}</tbody></table></div>` : ''}</div>`;
      }).join('') : '<div class="card">Nenhuma obra vinculada ao seu acesso. Fale com a construtora.</div>');
    $app.querySelectorAll('[data-foto]').forEach((fg) => (fg.onclick = () => {
      const m = modal(`<div class="lightbox"><img src="/api/fotos/${fg.dataset.foto}/dados" alt=""></div><div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Fechar</button></div>`, 900);
      m.el.querySelector('#x').onclick = m.fechar;
    }));
  }
  rotas.portal = portal;
}
