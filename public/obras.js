// Telas de obra: lista e detalhe da obra, materiais, terceirizadas e documentação.
// Recebe os utilitários do app.js (api, modal, esc, brl...) e registra as rotas.
export function instalar(U) {
  const { state, api, esc, brl, dataBR, ico, toast, acao, modal, avatar, cls, pode, temArea, paraCentavos, brlInput, opts, hojeISO, rotas, lerBase64, ast, campo, seletor, nomeMes, recarregarMeta } = U;
  const $app = document.getElementById('app');
  Object.assign(U.ICONES, {
    visao: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    investidor: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
    engenheiro: '<path d="M2 18a10 10 0 0 1 20 0Z"/><path d="M12 8v4"/><path d="M8 18v-3"/><path d="M16 18v-3"/><path d="M2 18h20"/>',
    obras: '<path d="M3 21h18"/><path d="M5 21V9l7-5 7 5v12"/><path d="M9 21v-6h6v6"/>',
    agenda: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    materiais: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/>',
    terceiros: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a6 6 0 0 1-7.6 7.6l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.6-7.6z"/>',
    documentos: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5Z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/>',
    sino: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    mapa: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    clip: '<path d="m21.4 11-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
  });

  // ---------- utilidades ----------
  const STATUS_OBRA = { planejamento: 'Planejamento', em_andamento: 'Em andamento', pausada: 'Pausada', concluida: 'Concluída', cancelada: 'Cancelada' };
  const TAG_STATUS = { planejamento: '', em_andamento: 'ok', pausada: 'aviso', concluida: 'com_nota', cancelada: 'ruim' };
  const RITMO = { no_prazo: ['ok', 'No prazo'], atencao: ['aviso', 'Atenção ao prazo'], atrasada: ['ruim', 'Atrasada'] };
  const tagStatus = (o) => `<span class="tag ${TAG_STATUS[o.status]}">${STATUS_OBRA[o.status]}</span>`;
  const tagRitmo = (o) => (o.ritmo ? `<span class="tag ${RITMO[o.ritmo.situacao][0]}">${RITMO[o.ritmo.situacao][1]}</span>` : '');
  const barraProg = (pct, esperado) => `<div class="prog" title="${pct}% concluído${esperado != null ? ` · esperado até hoje: ${esperado}%` : ''}"><span style="width:${pct}%"></span>${esperado != null ? `<i style="left:${esperado}%"></i>` : ''}</div>`;
  const diasTxt = (o) => {
    if (!o.ritmo) return o.previsao_fim ? `previsão ${dataBR(o.previsao_fim)}` : '';
    const n = o.ritmo.dias_restantes;
    return n >= 0 ? `${n} dia${n === 1 ? '' : 's'} para o prazo (${dataBR(o.previsao_fim)})` : `${-n} dia${n === -1 ? '' : 's'} além do prazo (${dataBR(o.previsao_fim)})`;
  };
  const ehEng = () => state.usuario.papel === 'engenheiro';
  const ehAdmin = () => state.usuario.papel === 'admin';
  const podeEditar = () => ehAdmin() || ehEng(); // o servidor confere se a obra é mesmo do engenheiro
  const FUNCAO = { diretoria: 'Diretoria', engenheiro: 'Engenheiro(a)', arquiteto: 'Arquiteto(a)', mestre_de_obras: 'Mestre de obras', encarregado: 'Encarregado', tecnico_seguranca: 'Técnico de segurança', pedreiro: 'Pedreiro', servente: 'Servente', peao: 'Peão', carpinteiro: 'Carpinteiro', armador: 'Armador', eletricista: 'Eletricista', encanador: 'Encanador', pintor: 'Pintor', gesseiro: 'Gesseiro', azulejista: 'Azulejista', operador_maquina: 'Operador de máquina', motorista: 'Motorista', estagiario: 'Estagiário(a)', administrativo: 'Administrativo', outro: 'Outro' };
  const REGIME = { clt: 'CLT', diarista: 'Diarista', empreiteiro: 'Empreiteiro / autônomo', pj: 'PJ', terceirizado: 'Terceirizada', estagio: 'Estágio', informal: 'Sem registro', socio: 'Sócio', a_verificar: 'A verificar' };
  const PRESENCA = { presente: 'Presente', falta: 'Falta', atestado: 'Atestado', atraso: 'Atraso', folga: 'Folga' };
  const TAG_PRES = { presente: 'ok', falta: 'ruim', atestado: 'aviso', atraso: 'aviso', folga: '' };
  const STATUS_MAT = { aguardando_aprovacao: 'Aguardando aprovação', recusado: 'Recusada', solicitado: 'Solicitado', pedido: 'Pedido ao fornecedor', entregue: 'Entregue na obra', aplicado: 'Aplicado', cancelado: 'Cancelado' };
  const TAG_MAT = { aguardando_aprovacao: 'ruim', recusado: 'ruim', solicitado: '', pedido: 'aviso', entregue: 'com_nota', aplicado: 'ok', cancelado: 'ruim' };
  const STATUS_TERC = { cotacao: 'Em cotação', contratada: 'Contratada', em_execucao: 'Em execução', concluida: 'Concluída', cancelada: 'Cancelada' };
  const TIPO_EVENTO = { entrega: 'Entrega de material', concretagem: 'Concretagem', vistoria: 'Vistoria', reuniao: 'Reunião', medicao: 'Medição', entrega_cliente: 'Entrega ao cliente', outro: 'Outro' };
  const STATUS_DOC = { pendente: 'Pendente', solicitado: 'Em andamento', emitido: 'Emitido', dispensado: 'Dispensado' };
  const SIT_DOC = { ok: ['ok', 'Em dia'], vence_logo: ['aviso', 'Vence em breve'], vencido: ['ruim', 'Vencido'], pendente: ['aviso', 'Pendente'], dispensado: ['', 'Dispensado'] };
  const STATUS_MED = { prevista: 'Prevista', faturada: 'Faturada', recebida: 'Recebida' };
  const sitDoc = (d, h) => {
    if (d.status === 'dispensado') return 'dispensado';
    if (d.status !== 'emitido') return 'pendente';
    if (d.validade && d.validade < h) return 'vencido';
    if (d.validade && d.validade <= somaDias(h, 30)) return 'vence_logo';
    return 'ok';
  };
  const somaDias = (data, n) => { const d = new Date(data + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const diaSem = (data) => ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(data + 'T12:00:00Z').getUTCDay()];
  const qtd = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const mapaUrl = (o) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([o.endereco, o.bairro, o.cidade, o.uf].filter(Boolean).join(', '))}`;
  const vazio = (txt) => `<p class="mut">${txt}</p>`;
  const opcoesObra = async () => (state.obOpc = await api('/api/obras/opcoes'));
  U.extraAbas = []; // [chave, rótulo, função(el, dados, recarrega, hoje), soGestao] — registradas por outros módulos
  U.FUNCAO = FUNCAO;
  U.obrasUtil = { STATUS_OBRA, TAG_STATUS, tagStatus, tagRitmo, barraProg, diasTxt, somaDias, diaSem, qtd, mapaUrl, TIPO_EVENTO, sitDoc, SIT_DOC };

  function abrirObra(id, aba) { state.obraId = id; state.obAba = aba || 'resumo'; if (location.hash !== '#obras') location.hash = '#obras'; else rotas.obras(); }
  U.abrirObra = abrirObra;
  const linkObra = (id, texto) => `<a href="#obras" data-obra="${id}">${texto}</a>`;
  const ligaLinksObra = (raiz) => raiz.querySelectorAll('[data-obra]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); abrirObra(+a.dataset.obra); }));
  U.ligaLinksObra = ligaLinksObra; U.linkObra = linkObra;

  // =====================================================================
  // LISTA DE OBRAS
  // =====================================================================
  async function obras() {
    if (state.obraId) return obraDetalhe(state.obraId);
    const filtro = state.obFiltro || (state.obFiltro = 'abertas');
    const todas = await api('/api/obras');
    const grupos = { abertas: (o) => ['em_andamento', 'planejamento', 'pausada'].includes(o.status), concluidas: (o) => o.status === 'concluida', todas: () => true };
    const lista = todas.filter(grupos[filtro]);
    const eng = ehEng();
    $app.innerHTML = `<h1>${eng ? 'Minhas obras' : 'Obras'}</h1><p class="sub">${eng ? 'As obras sob sua responsabilidade técnica.' : 'Todas as obras da Mota Construções: onde ficam, em que fase estão e quem está nelas.'}</p>
      <div class="row"><div class="seg">${[['abertas', 'Em curso'], ['concluidas', 'Concluídas'], ['todas', 'Todas']].map(([k, r]) => `<button data-f="${k}" class="${filtro === k ? 'on' : ''}">${r}</button>`).join('')}</div>
        <span style="flex:1"></span>${ehAdmin() ? '<button id="nova">+ Nova obra</button>' : ''}</div>
      ${lista.length ? `<div class="obras-grade">${lista.map((o) => `<article class="card obra-card" data-obra="${o.id}" tabindex="0">
        <div class="obra-topo"><span class="tag">${esc(o.codigo)}</span>${tagStatus(o)}${tagRitmo(o)}</div>
        <h3>${esc(o.nome)}</h3>
        <p class="mut obra-local">${ico('mapa')} ${esc([o.bairro, o.cidade].filter(Boolean).join(' · '))}${o.cliente ? ` · ${esc(o.cliente)}` : ''}</p>
        <div class="obra-prog"><b>${o.progresso}%</b>${barraProg(o.progresso, o.ritmo?.esperado)}</div>
        <p class="obra-fase">${o.status === 'concluida' ? 'Obra concluída' : `Fase atual: <b>${esc(o.fase_atual || (o.status === 'planejamento' ? 'a iniciar' : '—'))}</b>`}</p>
        <div class="obra-nums">
          <span title="Prazo">${ico('agenda')} ${o.status === 'concluida' ? `entregue ${o.fim_real ? dataBR(o.fim_real) : ''}` : esc(diasTxt(o)) || '—'}</span>
          <span title="Pessoas na obra hoje">${ico('clientes')} ${o.presentes_hoje}/${o.equipe_total} na obra hoje</span>
          <span title="Responsável técnico">${ico('engenheiro')} ${esc(o.engenheiro || 'sem engenheiro')}</span>
          ${o.docs_pendentes ? `<span class="neg" title="Documentos pendentes">${ico('documentos')} ${o.docs_pendentes} documento(s) pendente(s)</span>` : ''}
          ${o.fases_atrasadas ? `<span class="neg">${ico('info')} ${o.fases_atrasadas} etapa(s) atrasada(s)</span>` : ''}
        </div>
        ${eng ? '' : `<div class="obra-custo"><small class="mut">Custo ${brl(o.custo_comprometido)} de ${brl(o.orcamento_custo)} orçados</small>${barraProg(o.orcamento_custo ? Math.min(100, Math.round((o.custo_comprometido / o.orcamento_custo) * 100)) : 0)}</div>`}
      </article>`).join('')}</div>` : vazio('Nenhuma obra neste filtro.')}`;
    $app.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { state.obFiltro = b.dataset.f; obras(); }));
    $app.querySelectorAll('.obra-card').forEach((c) => { c.onclick = () => abrirObra(+c.dataset.obra); c.onkeydown = (e) => { if (e.key === 'Enter') abrirObra(+c.dataset.obra); }; });
    document.getElementById('nova')?.addEventListener('click', () => janelaObra(null));
  }

  // ---------- cadastro / edição da obra (gestão) ----------
  async function janelaObra(o, depois) {
    const O = await opcoesObra();
    const f = o || { tipo: 'residencial', status: 'planejamento', cidade: 'Rio de Janeiro', uf: 'RJ' };
    const mestres = O.funcionarios.filter((p) => ['mestre_de_obras', 'encarregado'].includes(p.funcao_obra));
    const m = modal(`<h2>${o ? 'Editar obra' : 'Nova obra'}</h2>
      <form class="form" id="fo" style="margin-top:14px" autocomplete="off">
        ${campo('Nome da obra', 'nome', f.nome, 'text', 'class="larg"')}${seletor('Tipo', 'tipo', O.tipos, f.tipo)}${seletor('Situação', 'status', O.status, f.status)}
        <div class="larg"><label>Cliente</label><select name="cliente_id"><option value="">— sem cliente —</option>${opts(O.clientes, f.cliente_id)}</select></div>
        ${campo('Endereço', 'endereco', f.endereco, 'text', 'class="larg"')}${campo('Bairro / condomínio', 'bairro', f.bairro)}${campo('Cidade', 'cidade', f.cidade)}${campo('UF', 'uf', f.uf)}${campo('CEP', 'cep', f.cep)}
        ${campo('Área (m²)', 'area_m2', f.area_m2)}${campo('Pavimentos', 'pavimentos', f.pavimentos, 'number')}
        ${campo('Início', 'data_inicio', f.data_inicio, 'date')}${campo('Previsão de término', 'previsao_fim', f.previsao_fim, 'date')}${f.status === 'concluida' || o?.fim_real ? campo('Término real', 'fim_real', f.fim_real, 'date') : ''}
        ${campo('Valor do contrato (R$)', 'valor_contrato', f.valor_contrato != null ? brlInput(f.valor_contrato) : '')}${campo('Orçamento de custo (R$)', 'orcamento_custo', f.orcamento_custo != null ? brlInput(f.orcamento_custo) : '')}
        <div><label>Engenheiro(a) / arquiteto(a) responsável</label><select name="engenheiro_id"><option value="">— definir depois —</option>${opts(O.engenheiros, f.engenheiro_id)}</select></div>
        <div><label>Mestre de obras / encarregado</label><select name="mestre_id"><option value="">— definir depois —</option>${opts(mestres, f.mestre_id)}</select></div>
        <div class="cheio"><label>Descrição</label><input name="descricao" value="${esc(f.descricao || '')}"></div></form>
      <div class="modal-acoes">${o && ['planejamento', 'cancelada'].includes(o.status) ? '<button class="perigo" id="exc">Excluir obra</button>' : ''}<span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Salvar</button></div>`, 720);
    m.el.querySelector('#x').onclick = m.fechar;
    m.el.querySelector('#exc')?.addEventListener('click', () => confirm('Excluir esta obra e tudo que foi cadastrado nela?') && acao(async () => { await api(`/api/obras/${o.id}`, { method: 'DELETE' }); m.fechar(); state.obraId = null; await recarregarMeta(); rotas.obras(); }, 'Obra excluída'));
    m.el.querySelector('#ok').onclick = () => acao(async () => {
      const v = Object.fromEntries(new FormData(m.el.querySelector('#fo')));
      if (!v.nome?.trim()) throw new Error('Informe o nome da obra.');
      v.valor_contrato = v.valor_contrato ? paraCentavos(v.valor_contrato) : 0;
      v.orcamento_custo = v.orcamento_custo ? paraCentavos(v.orcamento_custo) : 0;
      if (Number.isNaN(v.valor_contrato) || Number.isNaN(v.orcamento_custo)) throw new Error('Valor inválido.');
      const r = await api(o ? `/api/obras/${o.id}` : '/api/obras', { method: o ? 'PUT' : 'POST', body: v });
      m.fechar(); await recarregarMeta();
      if (o) await (depois ? depois() : rotas.obras()); else abrirObra(r.id);
    }, 'Obra salva');
  }
  U.janelaObra = janelaObra;

  // =====================================================================
  // DETALHE DA OBRA
  // =====================================================================
  const ABAS = [['resumo', 'Resumo'], ['cronograma', 'Cronograma'], ['equipe', 'Equipe'], ['materiais', 'Materiais'], ['terceiros', 'Terceirizadas'], ['documentos', 'Documentação'], ['diario', 'Diário'], ['agenda', 'Agenda'], ['financeiro', 'Financeiro']];

  async function obraDetalhe(id) {
    let d;
    try { d = await api(`/api/obras/${id}`); } catch (e) { state.obraId = null; toast(e.message, true); return rotas.obras(); }
    const o = d.obra, eng = ehEng(), aba = state.obAba || 'resumo';
    const abas = [...ABAS, ...U.extraAbas].filter(([k, , , soGestao]) => !(eng && (k === 'financeiro' || soGestao)));
    const H = d.hoje;
    $app.innerHTML = `<a href="#obras" class="voltar" id="voltar">${ico('arrow-left')} Todas as obras</a>
      <div class="topo-vivo"><div><h1>${esc(o.nome)}</h1>
        <p class="sub" style="margin-bottom:10px"><span class="tag">${esc(o.codigo)}</span> ${tagStatus(o)} ${tagRitmo(o)} <span class="mut">${esc([o.endereco, o.bairro, o.cidade].filter(Boolean).join(' · '))}</span> <a href="${mapaUrl(o)}" target="_blank" rel="noopener" class="zap">${ico('mapa')} Ver no mapa</a></p></div>
        <div class="fu-acoes">${ehAdmin() ? '<button class="sec" id="editar">Editar obra</button><button class="sec" id="aviso">Enviar aviso ao engenheiro</button>' : ''}</div></div>
      <div class="grid">
        <div class="card kpi"><div class="l">Avanço da obra</div><div class="v">${o.progresso}%</div>${barraProg(o.progresso, o.ritmo?.esperado)}<small class="mut">${o.status === 'concluida' ? 'concluída' : `fase atual: ${esc(o.fase_atual || '—')}`}</small></div>
        <div class="card kpi"><div class="l">Prazo</div><div class="v" style="font-size:19px">${o.previsao_fim ? dataBR(o.previsao_fim) : '—'}</div><small class="${o.ritmo?.situacao === 'atrasada' ? 'neg' : 'mut'}">${esc(diasTxt(o))}</small></div>
        ${o.desempenho && (o.desempenho.spi != null || o.desempenho.cpi != null) ? `<div class="card kpi"><div class="l">Desempenho</div><div class="v" style="font-size:19px">${o.desempenho.spi != null ? `<span class="tag ${{ ok: 'ok', atencao: 'aviso', ruim: 'ruim' }[o.desempenho.spi_faixa]}" title="Prazo: avanço real ÷ esperado">prazo ${String(o.desempenho.spi).replace('.', ',')}</span>` : ''} ${o.desempenho.cpi != null ? `<span class="tag ${{ ok: 'ok', atencao: 'aviso', ruim: 'ruim' }[o.desempenho.cpi_faixa]}" title="Custo: valor produzido ÷ custo realizado">custo ${String(o.desempenho.cpi).replace('.', ',')}</span>` : ''}</div><small class="mut">1,00 = como planejado; acima é melhor</small></div>` : ''}
        <div class="card kpi"><div class="l">Na obra hoje</div><div class="v">${o.presentes_hoje}<small class="mut"> / ${o.equipe_total}</small></div><small class="mut">${esc(o.mestre ? 'Mestre: ' + o.mestre : 'sem mestre de obras')}</small></div>
        <div class="card kpi"><div class="l">Documentação</div><div class="v">${o.docs_ok}<small class="mut"> / ${o.docs_total}</small></div><small class="${o.docs_pendentes || o.docs_vencidos ? 'neg' : 'mut'}">${o.docs_vencidos ? o.docs_vencidos + ' vencido(s) · ' : ''}${o.docs_pendentes} pendente(s)</small></div>
        ${eng ? '' : `<div class="card kpi"><div class="l">Custo comprometido</div><div class="v ${o.estouro ? 'neg' : ''}">${brl(o.custo_comprometido)}</div><small class="mut">orçado ${brl(o.orcamento_custo)} · pago ${brl(o.custo_pago)}</small></div>
        <div class="card kpi"><div class="l">Margem prevista</div><div class="v ${cls(o.margem_prevista)}">${brl(o.margem_prevista)}</div><small class="mut">contrato ${brl(o.valor_contrato)}</small></div>`}
      </div>
      <div class="abas">${abas.map(([k, r]) => `<button data-aba="${k}" class="${aba === k ? 'on' : 'sec'}">${r}</button>`).join('')}</div>
      <div id="aba-corpo"></div>`;
    document.getElementById('voltar').onclick = (e) => { e.preventDefault(); state.obraId = null; rotas.obras(); };
    $app.querySelectorAll('[data-aba]').forEach((b) => (b.onclick = () => { state.obAba = b.dataset.aba; obraDetalhe(id); }));
    document.getElementById('editar')?.addEventListener('click', () => janelaObra(o, () => obraDetalhe(id)));
    document.getElementById('aviso')?.addEventListener('click', () => janelaAviso(o.id));
    const recarrega = () => obraDetalhe(id);
    const corpo = document.getElementById('aba-corpo');
    const extra = U.extraAbas.find(([k, , , soGestao]) => k === aba && !(eng && soGestao));
    const abaFn = extra ? extra[2] : { resumo: abaResumo, cronograma: abaCronograma, equipe: abaEquipe, materiais: abaMateriais, terceiros: abaTerceiros, documentos: abaDocumentos, diario: abaDiario, agenda: abaAgenda, financeiro: abaFinanceiro }[eng && aba === 'financeiro' ? 'resumo' : aba] || abaResumo;
    await abaFn(corpo, d, recarrega, H);
    ligaLinksObra(corpo);
  }

  function janelaAviso(obraId) {
    const m = modal(`<h2>Aviso ao engenheiro</h2><p class="legenda">O aviso aparece no painel “Meu dia” do engenheiro responsável por esta obra.</p>
      <form class="form" id="fa" style="margin-top:12px"><div class="cheio"><label>Aviso ${ast}</label><input name="titulo" required placeholder="Ex.: Hoje chega o caminhão de cimento às 8h"></div>
      <div class="cheio"><label>Detalhes</label><input name="texto" placeholder="Opcional"></div>
      <div><label>Prioridade</label><select name="prioridade"><option value="normal">Normal</option><option value="alta">Alta</option></select></div></form>
      <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Enviar aviso</button></div>`, 520);
    m.el.querySelector('#x').onclick = m.fechar;
    m.el.querySelector('#ok').onclick = () => acao(async () => { await api('/api/avisos', { method: 'POST', body: { ...Object.fromEntries(new FormData(m.el.querySelector('#fa'))), obra_id: obraId } }); m.fechar(); await obraDetalhe(obraId); }, 'Aviso enviado');
  }
  U.janelaAviso = janelaAviso;

  // ---------- aba: resumo ----------
  async function abaResumo(el, d) {
    const o = d.obra;
    const alertas = (await api('/api/alertas').catch(() => [])).filter((a) => a.obra_id === o.id);
    const proximos = d.eventos.filter((e) => e.status === 'agendado' && e.data >= d.hoje).slice(0, 5);
    el.innerHTML = `<div class="grid dois">
      <div class="card"><h2>Dados da obra</h2><table class="info"><tbody>
        <tr><th>Cliente</th><td>${esc(o.cliente || '—')}${o.cliente_telefone ? ` · <small class="mut">${esc(o.cliente_telefone)}</small>` : ''}</td></tr>
        <tr><th>Tipo</th><td>${esc(({ residencial: 'Residencial', condominio: 'Condomínio', comercial: 'Comercial', reforma: 'Reforma', piscina: 'Piscina e lazer', fachada: 'Fachada', infraestrutura: 'Infraestrutura', outro: 'Outro' })[o.tipo])}${o.area_m2 ? ` · ${qtd(o.area_m2)} m²` : ''}${o.pavimentos ? ` · ${o.pavimentos} pavimento(s)` : ''}</td></tr>
        <tr><th>Endereço</th><td>${esc([o.endereco, o.bairro, o.cidade + '/' + o.uf, o.cep].filter(Boolean).join(' · '))}</td></tr>
        <tr><th>Período</th><td>${o.data_inicio ? dataBR(o.data_inicio) : '—'} até ${o.previsao_fim ? dataBR(o.previsao_fim) : '—'}${o.fim_real ? ` · concluída em ${dataBR(o.fim_real)}` : ''}</td></tr>
        <tr><th>Responsável técnico</th><td>${esc(o.engenheiro || '—')}</td></tr>
        <tr><th>Mestre de obras</th><td>${esc(o.mestre || '—')}</td></tr>
        ${o.descricao ? `<tr><th>Descrição</th><td>${esc(o.descricao)}</td></tr>` : ''}</tbody></table></div>
      <div class="card"><h2>Pontos de atenção</h2>${alertas.length ? `<ul class="alertas">${alertas.slice(0, 8).map((a) => `<li class="${a.nivel}"><b>${esc(a.titulo)}</b>${a.detalhe ? `<br><small class="mut">${esc(a.detalhe)}</small>` : ''}</li>`).join('')}</ul>` : '<p class="mut">Nenhum ponto de atenção no momento.</p>'}</div></div>
      <div class="grid dois">
      <div class="card"><h2>Etapas</h2>${d.fases.length ? d.fases.map((f) => `<div class="barra"><span class="nome" title="${esc(f.nome)}">${esc(f.nome)}</span><span class="trilho"><span class="fill ${f.atrasada ? 'atraso' : ''}" style="display:block;width:${f.progresso}%"></span></span><span class="val">${f.progresso}%</span></div>`).join('') : vazio('Ainda não há etapas. Abra a aba Cronograma.')}</div>
      <div class="card"><h2>Próximos compromissos</h2>${proximos.length ? `<ul class="alertas">${proximos.map((e) => `<li class="info"><b>${dataBR(e.data)}${e.hora ? ' às ' + esc(e.hora) : ''}</b> — ${esc(e.titulo)} <span class="tag">${esc(TIPO_EVENTO[e.tipo])}</span>${e.detalhe ? `<br><small class="mut">${esc(e.detalhe)}</small>` : ''}</li>`).join('')}</ul>` : vazio('Nada agendado. Use a aba Agenda.')}
        ${d.avisos.length ? `<h2 style="margin-top:16px">Avisos da gestão</h2><ul class="alertas">${d.avisos.slice(0, 3).map((a) => `<li class="${a.prioridade === 'alta' ? 'alta' : 'info'}"><b>${esc(a.titulo)}</b>${a.texto ? `<br><small class="mut">${esc(a.texto)}</small>` : ''}<br><small class="mut">${esc(a.autor || '')} · ${dataBR(String(a.criado_em).slice(0, 10))}</small></li>`).join('')}</ul>` : ''}</div></div>`;
  }

  // ---------- aba: cronograma (Gantt) ----------
  function abaCronograma(el, d, recarrega, H) {
    const o = d.obra, fases = d.fases;
    const datas = fases.flatMap((f) => [f.inicio_prev, f.fim_prev, f.inicio_real, f.fim_real, ...(f.progresso < 100 && f.inicio_real ? [H] : [])]).filter(Boolean).sort();
    const t = (x) => new Date(x + 'T12:00:00Z').getTime();
    const ini = datas[0], fim = datas.at(-1);
    const span = ini && fim && t(fim) > t(ini) ? t(fim) - t(ini) : 1;
    const pos = (x) => Math.max(0, Math.min(100, ((t(x) - t(ini)) / span) * 100));
    const meses = [];
    if (ini) { let c = new Date(ini + 'T12:00:00Z'); c.setUTCDate(1); while (c.getTime() <= t(fim)) { const x = c.toISOString().slice(0, 10); if (x >= ini) meses.push([pos(x), c.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' })]); c.setUTCMonth(c.getUTCMonth() + 1); } }
    el.innerHTML = `<div class="card"><div class="titulo-saldos"><h2>Cronograma e evolução</h2><div class="fu-acoes">${ehAdmin() ? `${fases.length ? '' : '<button class="sec" id="modelo">Gerar etapas sugeridas</button>'}<button class="sec" id="nf">+ Nova etapa</button>` : ''}</div></div>
      <p class="legenda aviso-vivo">A barra clara é o prazo previsto; a parte colorida é o que já foi feito. O traço vertical é hoje. O avanço da obra é a média das etapas, ponderada pelo peso de cada uma.</p>
      ${fases.length && ini ? `<div class="gantt"><div class="g-cab"><span class="g-nome">Etapa</span><div class="g-trilho">${meses.map(([p, r]) => `<small style="left:${p}%">${esc(r)}</small>`).join('')}</div><span class="g-pct"></span></div>
        ${fases.map((f) => { const a = f.inicio_prev || f.inicio_real, b = f.fim_prev || f.fim_real; return `<div class="g-linha ${podeEditar() ? 'clicavel' : ''}" data-fase="${f.id}"><span class="g-nome" title="${esc(f.nome)}">${esc(f.nome)}${f.atrasada ? ' <span class="tag ruim">atrasada</span>' : f.progresso === 100 ? ' <span class="tag ok">concluída</span>' : ''}<br><small class="mut">${a ? dataBR(a).slice(0, 5) : '?'} → ${b ? dataBR(b).slice(0, 5) : '?'} · peso ${f.peso}</small></span>
          <div class="g-trilho">${a && b ? `<div class="g-barra ${f.atrasada ? 'atraso' : ''}" style="left:${pos(a)}%;width:${Math.max(1.2, pos(b) - pos(a))}%"><span style="width:${f.progresso}%"></span></div>` : ''}${H >= ini && H <= fim ? `<i class="g-hoje" style="left:${pos(H)}%"></i>` : ''}</div>
          <span class="g-pct"><b>${f.progresso}%</b></span></div>`; }).join('')}</div>` : vazio('Ainda não há etapas cadastradas.' + (ehAdmin() ? ' Use “Gerar etapas sugeridas” e ajuste os prazos.' : ''))}
      ${podeEditar() && fases.length ? '<p class="legenda" style="margin-top:10px">Clique em uma etapa para atualizar o avanço.</p>' : ''}</div>`;
    el.querySelector('#modelo')?.addEventListener('click', () => acao(async () => { await api(`/api/obras/${o.id}/fases/modelo`, { method: 'POST' }); await recarrega(); }, 'Etapas criadas'));
    el.querySelector('#nf')?.addEventListener('click', () => janelaFase(o.id, null, recarrega));
    el.querySelectorAll('.g-linha.clicavel').forEach((l) => (l.onclick = () => janelaFase(o.id, fases.find((f) => f.id === +l.dataset.fase), recarrega)));
  }

  function janelaFase(obraId, f, depois) {
    const adm = ehAdmin();
    const m = modal(`<h2>${f ? esc(f.nome) : 'Nova etapa'}</h2>
      <form class="form" id="ff" style="margin-top:14px">
        ${adm ? `${campo('Nome da etapa', 'nome', f?.nome, 'text', 'class="larg"')}${campo('Peso (importância)', 'peso', f?.peso ?? 10, 'number')}${campo('Início previsto', 'inicio_prev', f?.inicio_prev, 'date')}${campo('Fim previsto', 'fim_prev', f?.fim_prev, 'date')}${campo('Custo orçado da etapa (R$)', 'custo_orcado', f?.custo_orcado ? brlInput(f.custo_orcado) : '')}${f ? campo('Ordem', 'ordem', f.ordem, 'number') : ''}` : ''}
        <div class="larg"><label>Avanço da etapa: <b id="pv">${f?.progresso ?? 0}%</b></label><input type="range" name="progresso" min="0" max="100" step="5" value="${f?.progresso ?? 0}"></div>
        <div class="cheio"><label>Observação</label><input name="obs" value="${esc(f?.obs || '')}" placeholder="Ex.: concretagem adiada por chuva"></div></form>
      <div class="modal-acoes">${adm && f ? '<button class="perigo" id="del">Excluir etapa</button>' : ''}<span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Salvar</button></div>`, 560);
    const r = m.el.querySelector('[name=progresso]');
    r.oninput = () => (m.el.querySelector('#pv').textContent = r.value + '%');
    m.el.querySelector('#x').onclick = m.fechar;
    m.el.querySelector('#del')?.addEventListener('click', () => confirm('Excluir esta etapa?') && acao(async () => { await api(`/api/obras/${obraId}/fases/${f.id}`, { method: 'DELETE' }); m.fechar(); await depois(); }, 'Etapa excluída'));
    m.el.querySelector('#ok').onclick = () => acao(async () => {
      const v = Object.fromEntries(new FormData(m.el.querySelector('#ff')));
      if (v.custo_orcado !== undefined) { v.custo_orcado = v.custo_orcado ? paraCentavos(v.custo_orcado) : 0; if (Number.isNaN(v.custo_orcado)) throw new Error('Custo orçado inválido.'); }
      await api(f ? `/api/obras/${obraId}/fases/${f.id}` : `/api/obras/${obraId}/fases`, { method: f ? 'PUT' : 'POST', body: v });
      m.fechar(); await depois();
    }, 'Etapa salva');
  }

  // ---------- aba: equipe e presença ----------
  async function abaEquipe(el, d, recarrega, H) {
    const o = d.obra, ativos = d.equipe.filter((q) => !q.ate || q.ate >= H);
    const hojeReg = ativos.filter((q) => q.situacao_hoje).length;
    el.innerHTML = `<div class="card"><div class="titulo-saldos"><h2>Equipe da obra (${ativos.length})</h2><div class="fu-acoes">${podeEditar() ? '<button id="pres">Registrar presença</button>' : ''}${ehAdmin() ? '<button class="sec" id="aloc">+ Alocar pessoa</button>' : ''}</div></div>
      <p class="legenda aviso-vivo">Hoje (${diaSem(H)}, ${dataBR(H)}): ${hojeReg ? `${hojeReg} de ${ativos.length} com presença registrada.` : '<b class="neg">presença ainda não registrada.</b>'}</p>
      ${ativos.length ? `<div class="tbl"><table><thead><tr><th>Pessoa</th><th>Função na obra</th><th>Vínculo</th><th>Contato</th><th>Hoje</th>${ehAdmin() ? '<th></th>' : ''}</tr></thead><tbody>
        ${ativos.map((q) => `<tr><td><b>${esc(q.nome)}</b></td><td>${esc(FUNCAO[q.funcao_obra] || q.funcao || '—')}</td><td><small>${esc(REGIME[q.regime] || q.regime)}</small></td><td><small>${esc(q.telefone || '—')}</small></td>
          <td>${q.situacao_hoje ? `<span class="tag ${TAG_PRES[q.situacao_hoje]}">${PRESENCA[q.situacao_hoje]}</span>` : '<span class="mut">—</span>'}</td>
          ${ehAdmin() ? `<td class="n"><button class="mini sec" data-rm="${q.funcionario_id}">retirar da obra</button></td>` : ''}</tr>`).join('')}</tbody></table></div>` : vazio('Ninguém alocado nesta obra ainda.')}</div>`;
    el.querySelector('#pres')?.addEventListener('click', () => janelaPresenca(o.id, H, recarrega));
    el.querySelector('#aloc')?.addEventListener('click', async () => {
      const O = await opcoesObra(); const ja = new Set(ativos.map((q) => q.funcionario_id));
      const livres = O.funcionarios.filter((p) => !ja.has(p.id));
      const m = modal(`<h2>Alocar pessoa na obra</h2><form class="form" id="fq" style="margin-top:12px"><div class="cheio"><label>Pessoa (cadastro de funcionários)</label><select name="funcionario_id">${livres.map((p) => `<option value="${p.id}">${esc(p.nome)} — ${esc(FUNCAO[p.funcao_obra] || p.funcao_obra || '')}</option>`).join('')}</select></div></form>
        <p class="legenda">Quem não está na lista deve ser cadastrado antes em <a href="#dp">Equipe e Funcionários</a> (peão, mestre de obras, terceirizado…).</p>
        <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Alocar</button></div>`, 520);
      m.el.querySelector('#x').onclick = m.fechar;
      m.el.querySelector('#ok').onclick = () => acao(async () => { await api(`/api/obras/${o.id}/equipe`, { method: 'POST', body: Object.fromEntries(new FormData(m.el.querySelector('#fq'))) }); m.fechar(); await recarrega(); }, 'Pessoa alocada');
    });
    el.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => confirm('Retirar esta pessoa da obra? O histórico de presença é mantido.') && acao(async () => { await api(`/api/obras/${o.id}/equipe/${b.dataset.rm}`, { method: 'DELETE' }); await recarrega(); }, 'Pessoa retirada')));
  }

  async function janelaPresenca(obraId, dataIni, depois) {
    const m = modal('<h2>Registrar presença</h2><div id="pc"></div>', 600);
    let data = dataIni;
    const carrega = async () => {
      const lista = await api(`/api/obras/${obraId}/presenca/${data}`);
      m.el.querySelector('#pc').innerHTML = `<div class="row" style="margin-top:12px"><div><label>Dia</label><input type="date" id="dp" value="${data}" max="${hojeISO()}"></div><small class="mut">${diaSem(data)}</small></div>
        ${lista.length ? `<div class="tbl"><table><tbody>${lista.map((p) => `<tr><td><b>${esc(p.nome)}</b><br><small class="mut">${esc(FUNCAO[p.funcao] || p.funcao || '')}</small></td>
          <td><select data-pf="${p.funcionario_id}">${Object.entries(PRESENCA).map(([k, v]) => `<option value="${k}" ${(p.situacao || 'presente') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>` : vazio('Nenhuma pessoa alocada nesta data.')}
        <div class="modal-acoes"><button class="sec" id="todos">Marcar todos presentes</button><span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok" ${lista.length ? '' : 'disabled'}>Salvar presença</button></div>`;
      m.el.querySelector('#dp').onchange = (e) => { if (e.target.value) { data = e.target.value; carrega(); } };
      m.el.querySelector('#x').onclick = m.fechar;
      m.el.querySelector('#todos').onclick = () => m.el.querySelectorAll('[data-pf]').forEach((s) => (s.value = 'presente'));
      m.el.querySelector('#ok').onclick = () => acao(async () => {
        const registros = [...m.el.querySelectorAll('[data-pf]')].map((s) => ({ funcionario_id: +s.dataset.pf, situacao: s.value, horas: s.value === 'presente' ? 9 : s.value === 'atraso' ? 8 : 0 }));
        await api(`/api/obras/${obraId}/presenca`, { method: 'POST', body: { data, registros } }); m.fechar(); await depois();
      }, 'Presença registrada');
    };
    await carrega();
  }

  U.janelaPresenca = janelaPresenca;

  // ---------- aba: materiais da obra ----------
  async function abaMateriais(el, d, recarrega) {
    const o = d.obra, mats = d.materiais.filter((m) => m.status !== 'cancelado');
    const aPagar = mats.filter((m) => !m.lancamento_id).reduce((a, m) => a + m.total, 0);
    el.innerHTML = `<div class="card"><div class="titulo-saldos"><h2>Materiais da obra</h2>${podeEditar() ? '<button id="nm">+ Lançar material</button>' : ''}</div>
      <p class="legenda aviso-vivo">Total lançado: <b>${brl(mats.reduce((a, m) => a + m.total, 0))}</b> · ainda a pagar: <b class="${aPagar ? 'neg' : ''}">${brl(aPagar)}</b></p>
      ${tabelaMateriais(d.materiais, false)}</div>`;
    ligaMateriais(el, d.materiais, recarrega, o.id);
    el.querySelector('#nm')?.addEventListener('click', () => janelaMaterial(o.id, null, recarrega));
  }

  function tabelaMateriais(lista, comObra) {
    if (!lista.length) return vazio('Nenhum material lançado.');
    return `<div class="tbl"><table><thead><tr><th>Material</th>${comObra ? '<th>Obra</th>' : ''}<th>Fornecedor</th><th class="n">Qtd.</th><th class="n">Total</th><th>Situação</th><th>Entrega</th><th></th></tr></thead><tbody>
      ${lista.map((m) => `<tr style="${m.status === 'cancelado' ? 'opacity:.5' : ''}"><td><b>${esc(m.descricao)}</b>${m.nf_numero ? `<br><small class="mut">NF ${esc(m.nf_numero)}</small>` : ''}${m.fase ? `<br><small class="mut">etapa: ${esc(m.fase)}</small>` : ''}</td>${comObra ? `<td><small>${linkObra(m.obra_id, esc(m.obra_codigo))}</small></td>` : ''}<td><small>${esc(m.fornecedor || '—')}</small></td>
        <td class="n">${qtd(m.quantidade)} ${esc(m.unidade)}</td><td class="n">${brl(m.total)}<br>${m.lancamento_id ? '<small class="pos">pago</small>' : ['cancelado', 'recusado', 'aguardando_aprovacao'].includes(m.status) ? '' : '<small class="mut">a pagar</small>'}</td>
        <td><span class="tag ${TAG_MAT[m.status]}">${STATUS_MAT[m.status]}</span></td>
        <td><small>${m.entregue_em ? 'entregue ' + dataBR(m.entregue_em) : m.entrega_prevista ? 'prevista ' + dataBR(m.entrega_prevista) : '—'}</small></td>
        <td class="n">${['cancelado', 'recusado'].includes(m.status) ? '' : [
          ehAdmin() && m.status === 'aguardando_aprovacao' ? `<button class="mini" data-apv="${m.id}">Aprovar</button> <button class="mini perigo" data-rcs="${m.id}">Recusar</button>` : '',
          podeEditar() && ['solicitado', 'pedido'].includes(m.status) ? `<button class="mini" data-mst="${m.id}" data-v="entregue">Recebi</button>` : '',
          podeEditar() && m.status === 'entregue' ? `<button class="mini sec" data-mst="${m.id}" data-v="aplicado">Aplicado</button>` : '',
          pode('operador') && !m.lancamento_id && m.total > 0 && m.status !== 'aguardando_aprovacao' ? `<button class="mini sec" data-mpg="${m.id}">Pagar</button>` : '',
          podeEditar() ? `<button class="mini sec" data-med="${m.id}">Editar</button>` : ''].join(' ')}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function ligaMateriais(el, lista, recarrega, obraId) {
    el.querySelectorAll('[data-mst]').forEach((b) => (b.onclick = () => acao(async () => { await api(`/api/materiais/${b.dataset.mst}/status`, { method: 'POST', body: { status: b.dataset.v } }); await recarrega(); }, 'Material atualizado')));
    el.querySelectorAll('[data-mpg]').forEach((b) => (b.onclick = () => janelaPagarMaterial(lista.find((m) => m.id === +b.dataset.mpg), recarrega)));
    el.querySelectorAll('[data-apv]').forEach((b) => (b.onclick = () => acao(async () => { await api(`/api/materiais/${b.dataset.apv}/aprovar`, { method: 'POST', body: {} }); await recarrega(); }, 'Compra aprovada')));
    el.querySelectorAll('[data-rcs]').forEach((b) => (b.onclick = () => { const t = prompt('Motivo da recusa:'); if (t) acao(async () => { await api(`/api/materiais/${b.dataset.rcs}/recusar`, { method: 'POST', body: { motivo: t } }); await recarrega(); }, 'Compra recusada'); }));
    el.querySelectorAll('[data-med]').forEach((b) => { const m = lista.find((x) => x.id === +b.dataset.med); b.onclick = () => janelaMaterial(m.obra_id || obraId, m, recarrega); });
  }

  async function janelaMaterial(obraId, mt, depois) {
    const forn = await api('/api/fornecedores').catch(() => []);
    const fases = await api(`/api/obras/${obraId}/fases`).catch(() => []);
    const f = mt || { status: 'pedido', unidade: 'un', data_pedido: hojeISO() };
    const m = modal(`<h2>${mt ? 'Editar material' : 'Lançar material'}</h2>
      <form class="form" id="fm" style="margin-top:14px" autocomplete="off">
        ${campo('Material', 'descricao', f.descricao, 'text', 'class="larg"')}
        <div><label>Fornecedor</label><select name="fornecedor_id"><option value="">—</option>${opts(forn.filter((x) => x.ativo), f.fornecedor_id)}</select></div>
        ${campo('Quantidade', 'quantidade', f.quantidade)}${campo('Unidade', 'unidade', f.unidade)}${campo('Valor unitário (R$)', 'valor_unit', f.valor_unit != null ? brlInput(f.valor_unit) : '')}
        ${seletor('Situação', 'status', Object.fromEntries(Object.entries(STATUS_MAT).filter(([k]) => ehAdmin() ? !['aguardando_aprovacao', 'recusado'].includes(k) : ['solicitado', 'pedido', 'entregue', 'aplicado', 'cancelado'].includes(k))), f.status)}<div><label>Etapa (opcional)</label><select name="fase_id"><option value="">—</option>${fases.map((x) => `<option value="${x.id}" ${x.id === f.fase_id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>${campo('Data do pedido', 'data_pedido', f.data_pedido, 'date')}${campo('Entrega prevista', 'entrega_prevista', f.entrega_prevista, 'date')}${campo('Nota fiscal', 'nf_numero', f.nf_numero)}
        <div class="cheio"><label>Observação</label><input name="obs" value="${esc(f.obs || '')}"></div></form>
      <div class="modal-acoes">${mt && podeEditar() && !mt.lancamento_id ? '<button class="perigo" id="del">Excluir</button>' : ''}<span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Salvar</button></div>`, 640);
    m.el.querySelector('#x').onclick = m.fechar;
    m.el.querySelector('#del')?.addEventListener('click', () => confirm('Excluir este lançamento de material?') && acao(async () => { await api(`/api/materiais/${mt.id}`, { method: 'DELETE' }); m.fechar(); await depois(); }, 'Material excluído'));
    m.el.querySelector('#ok').onclick = () => acao(async () => {
      const v = Object.fromEntries(new FormData(m.el.querySelector('#fm')));
      v.valor_unit = v.valor_unit ? paraCentavos(v.valor_unit) : 0;
      if (Number.isNaN(v.valor_unit)) throw new Error('Valor unitário inválido.');
      const r = await api(mt ? `/api/obras/${obraId}/materiais/${mt.id}` : `/api/obras/${obraId}/materiais`, { method: mt ? 'PUT' : 'POST', body: v });
      m.fechar(); await depois();
      if (r?.status === 'aguardando_aprovacao') toast('Compra acima do limite: enviada para a aprovação da gestão.');
    }, 'Material salvo');
  }
  U.janelaMaterial = janelaMaterial;

  function janelaPagarMaterial(mt, depois) {
    const contas = state.meta.contas.filter((c) => c.ativo), cats = state.meta.categorias.filter((c) => c.tipo === 'saida' && c.ativo);
    const catPadrao = cats.find((c) => c.nome === 'Outros materiais');
    const m = modal(`<h2>Pagar material</h2><p class="legenda">${esc(mt.descricao)} — <b>${brl(mt.total)}</b>. O pagamento vira uma saída no caixa, ligada a esta obra.</p>
      <form class="form" id="fp" style="margin-top:12px"><div class="cheio"><label>Pago de qual conta?</label><select name="conta_id">${contas.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></div>
      <div class="cheio"><label>Categoria</label><select name="categoria_id">${cats.filter((c) => c.grupo === 'Materiais').map((c) => `<option value="${c.id}" ${c.id === catPadrao?.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></div>
      <div><label>Data do pagamento</label><input type="date" name="data" value="${hojeISO()}" max="${hojeISO()}"></div></form>
      <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Confirmar pagamento</button></div>`, 520);
    m.el.querySelector('#x').onclick = m.fechar;
    m.el.querySelector('#ok').onclick = () => acao(async () => { await api(`/api/materiais/${mt.id}/pagar`, { method: 'POST', body: Object.fromEntries(new FormData(m.el.querySelector('#fp'))) }); m.fechar(); await depois(); }, 'Pagamento lançado no caixa');
  }

  // ---------- aba: terceirizadas da obra ----------
  async function abaTerceiros(el, d, recarrega) {
    const o = d.obra, adm = ehAdmin();
    const total = d.terceiros.reduce((a, t) => a + t.valor, 0), pago = d.terceiros.reduce((a, t) => a + t.pago, 0);
    el.innerHTML = `<div class="card"><div class="titulo-saldos"><h2>Empresas terceirizadas nesta obra</h2>${adm ? '<button id="nt">+ Contratar terceirizada</button>' : ''}</div>
      <p class="legenda aviso-vivo">Instalação de painel de LED, piscina, elétrica, esquadrias… Cada contrato mostra o escopo, o valor e quanto já foi pago.${adm ? '' : ' Valores são visíveis só à gestão.'}</p>
      ${d.terceiros.length ? `<div class="tbl"><table><thead><tr><th>Empresa</th><th>Serviço contratado</th><th>Prazo</th><th>Situação</th>${adm ? '<th class="n">Contrato</th><th class="n">Pago</th><th></th>' : ''}</tr></thead><tbody>
        ${d.terceiros.map((t) => `<tr><td><b>${esc(t.terceirizada)}</b><br><small class="mut">${esc(t.especialidade)}${t.telefone ? ' · ' + esc(t.telefone) : ''}</small></td><td>${esc(t.escopo)}</td><td><small>${t.inicio ? dataBR(t.inicio) : '?'} → ${t.fim_prev ? dataBR(t.fim_prev) : '?'}</small></td><td><span class="tag ${t.status === 'em_execucao' ? 'ok' : t.status === 'concluida' ? 'com_nota' : t.status === 'cotacao' ? '' : 'aviso'}">${STATUS_TERC[t.status]}</span></td>
          ${adm ? `<td class="n">${brl(t.valor)}</td><td class="n">${brl(t.pago)}<br><small class="mut">${t.valor ? Math.round((t.pago / t.valor) * 100) : 0}%</small></td><td class="n"><button class="mini sec" data-et="${t.id}">Editar</button></td>` : ''}</tr>`).join('')}</tbody>
        ${adm ? `<tfoot><tr><td colspan="4">Total</td><td class="n">${brl(total)}</td><td class="n">${brl(pago)}</td><td></td></tr></tfoot>` : ''}</table></div>` : vazio('Nenhuma terceirizada contratada nesta obra.')}</div>`;
    el.querySelector('#nt')?.addEventListener('click', () => janelaContrato(o.id, null, recarrega));
    el.querySelectorAll('[data-et]').forEach((b) => (b.onclick = () => janelaContrato(o.id, d.terceiros.find((t) => t.id === +b.dataset.et), recarrega)));
  }
  async function janelaContrato(obraId, t, depois) {
    const lista = (await api('/api/terceirizadas')).lista.filter((x) => x.ativo);
    const f = t || { status: 'contratada' };
    const m = modal(`<h2>${t ? 'Editar contrato' : 'Contratar terceirizada'}</h2>
      <form class="form" id="fc" style="margin-top:14px">
        <div class="larg"><label>Empresa</label><select name="terceirizada_id">${lista.map((x) => `<option value="${x.id}" ${x.id === f.terceirizada_id ? 'selected' : ''}>${esc(x.nome)} — ${esc(x.especialidade)}</option>`).join('')}</select></div>
        <div class="cheio"><label>Serviço contratado</label><input name="escopo" value="${esc(f.escopo || '')}" placeholder="Ex.: instalação do painel de LED da fachada"></div>
        ${campo('Valor do contrato (R$)', 'valor', f.valor != null ? brlInput(f.valor) : '')}${campo('Já pago (R$)', 'pago', f.pago != null ? brlInput(f.pago) : '')}${seletor('Situação', 'status', STATUS_TERC, f.status)}
        ${campo('Início', 'inicio', f.inicio, 'date')}${campo('Término previsto', 'fim_prev', f.fim_prev, 'date')}<div class="cheio"><label>Observação</label><input name="obs" value="${esc(f.obs || '')}"></div></form>
      <div class="modal-acoes">${t ? '<button class="perigo" id="del">Excluir contrato</button>' : ''}<span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Salvar</button></div>`, 640);
    m.el.querySelector('#x').onclick = m.fechar;
    m.el.querySelector('#del')?.addEventListener('click', () => confirm('Excluir este contrato?') && acao(async () => { await api(`/api/obras/${obraId}/terceiros/${t.id}`, { method: 'DELETE' }); m.fechar(); await depois(); }, 'Contrato excluído'));
    m.el.querySelector('#ok').onclick = () => acao(async () => {
      const v = Object.fromEntries(new FormData(m.el.querySelector('#fc')));
      v.valor = v.valor ? paraCentavos(v.valor) : 0; v.pago = v.pago ? paraCentavos(v.pago) : 0;
      if (Number.isNaN(v.valor) || Number.isNaN(v.pago)) throw new Error('Valor inválido.');
      await api(t ? `/api/obras/${obraId}/terceiros/${t.id}` : `/api/obras/${obraId}/terceiros`, { method: t ? 'PUT' : 'POST', body: v });
      m.fechar(); await depois();
    }, 'Contrato salvo');
  }

  // ---------- aba: documentação ----------
  async function abaDocumentos(el, d, recarrega, H) {
    const o = d.obra, O = state.obOpc || (await opcoesObra());
    const tipos = O.tipos_documento;
    el.innerHTML = `<div class="card"><div class="titulo-saldos"><h2>Documentação da obra</h2><div class="fu-acoes">${podeEditar() ? `<button class="sec" id="check">Gerar checklist sugerido</button><button id="nd">+ Documento</button>` : ''}</div></div>
      <p class="legenda aviso-vivo">ART/RRT, alvará, CNO, PGR, habite-se e demais documentos: situação, quem emitiu, validade e o arquivo anexado. O checklist sugerido é um ponto de partida: o responsável técnico confirma o que esta obra exige.</p>
      ${d.documentos.length ? `<div class="tbl"><table><thead><tr><th>Documento</th><th>Situação</th><th>Nº</th><th>Emitido por</th><th>Emissão</th><th>Validade</th><th>Arquivo</th><th></th></tr></thead><tbody>
        ${d.documentos.map((x) => { const s = sitDoc(x, H); return `<tr><td><b>${esc(x.tipo)}</b><br><small class="mut">${esc(tipos[x.tipo]?.[0] || x.tipo)}</small></td>
          <td><span class="tag ${SIT_DOC[s][0]}">${s === 'pendente' ? STATUS_DOC[x.status] : SIT_DOC[s][1]}</span></td><td><small>${esc(x.numero || '—')}</small></td>
          <td>${x.emitido_por ? `<b>${esc(x.emitido_por)}</b><br><small class="mut">${esc([x.conselho, x.registro_profissional].filter(Boolean).join(' '))}</small>` : `<small>${esc(x.emissor_externo || tipos[x.tipo]?.[1] || '—')}</small>`}</td>
          <td><small>${x.emitido_em ? dataBR(x.emitido_em) : '—'}</small></td><td><small class="${s === 'vencido' ? 'neg' : ''}">${x.validade ? dataBR(x.validade) : '—'}</small></td>
          <td>${x.anexo_nome ? `<a href="/api/documentos/${x.id}/arquivo" target="_blank" rel="noopener">${ico('clip')} ${esc(x.anexo_nome)}</a>` : '<span class="mut">sem arquivo</span>'}</td>
          <td class="n">${podeEditar() ? `<button class="mini sec" data-ed="${x.id}">Atualizar</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : vazio('Nenhum documento cadastrado. Use “Gerar checklist sugerido”.')}</div>`;
    el.querySelector('#check')?.addEventListener('click', () => acao(async () => { const r = await api(`/api/obras/${o.id}/documentos/checklist`, { method: 'POST' }); toast(r.criados ? `${r.criados} documento(s) adicionados ao checklist` : 'O checklist já estava completo'); await recarrega(); }));
    el.querySelector('#nd')?.addEventListener('click', () => janelaDocumento(o.id, null, recarrega));
    el.querySelectorAll('[data-ed]').forEach((b) => (b.onclick = () => janelaDocumento(o.id, d.documentos.find((x) => x.id === +b.dataset.ed), recarrega)));
  }

  async function janelaDocumento(obraId, doc, depois) {
    const O = state.obOpc || (await opcoesObra());
    const f = doc || { status: 'pendente', tipo: 'ART' };
    const tipos = O.tipos_documento;
    const m = modal(`<h2>${doc ? 'Atualizar ' + esc(doc.tipo) : 'Novo documento'}</h2>
      <form class="form" id="fd" style="margin-top:14px" autocomplete="off">
        <div class="larg"><label>Documento</label><select name="tipo" ${doc ? 'disabled' : ''}>${Object.entries(tipos).map(([k, [r]]) => `<option value="${k}" ${f.tipo === k ? 'selected' : ''}>${esc(k)} — ${esc(r)}</option>`).join('')}</select></div>
        ${seletor('Situação', 'status', STATUS_DOC, f.status)}${campo('Número / protocolo', 'numero', f.numero)}
        <div class="larg"><label>Quem emitiu (profissional responsável)</label><select name="emitido_por_id"><option value="">— órgão ou empresa externa —</option>${O.engenheiros.map((p) => `<option value="${p.id}" ${p.id === f.emitido_por_id ? 'selected' : ''}>${esc(p.nome)} (${esc([p.conselho, p.registro_profissional].filter(Boolean).join(' ') || p.funcao_obra)})</option>`).join('')}</select></div>
        ${campo('Órgão / emissor externo', 'emissor_externo', f.emissor_externo)}${campo('Data de emissão', 'emitido_em', f.emitido_em, 'date')}${campo('Validade', 'validade', f.validade, 'date')}
        <div class="cheio"><label>Observação</label><input name="obs" value="${esc(f.obs || '')}"></div>
        <div class="cheio"><label>${ico('clip')} Anexar arquivo (PDF, JPG ou PNG, até 3 MB)${f.anexo_nome ? ` — atual: ${esc(f.anexo_nome)}` : ''}</label><input type="file" name="arq" accept="application/pdf,image/jpeg,image/png"></div></form>
      <div class="modal-acoes">${doc ? '<button class="perigo" id="del">Excluir</button>' : ''}<span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Salvar</button></div>`, 680);
    m.el.querySelector('#x').onclick = m.fechar;
    m.el.querySelector('#del')?.addEventListener('click', () => confirm('Excluir este documento e o arquivo anexado?') && acao(async () => { await api(`/api/documentos/${doc.id}`, { method: 'DELETE' }); m.fechar(); await depois(); }, 'Documento excluído'));
    m.el.querySelector('#ok').onclick = () => acao(async () => {
      const form = m.el.querySelector('#fd'), v = Object.fromEntries(new FormData(form)), arq = form.arq.files[0];
      if (arq && arq.size > 3 * 1024 * 1024) throw new Error('O arquivo passa de 3 MB.');
      delete v.arq; if (doc) v.tipo = doc.tipo;
      if (arq) v.anexo = { nome: arq.name, base64: await lerBase64(arq) };
      await api(`/api/obras/${obraId}/documentos`, { method: 'POST', body: v });
      m.fechar(); await depois();
    }, 'Documento salvo');
  }

  // ---------- aba: diário de obra ----------
  function abaDiario(el, d, recarrega, H) {
    const o = d.obra;
    const hojeDiario = d.diario.find((x) => x.data === H);
    el.innerHTML = `<div class="grid dois">${podeEditar() ? `<div class="card"><h2>Registrar o dia</h2><form class="form" id="fd" style="grid-template-columns:1fr 1fr" autocomplete="off">
      ${campo('Data', 'data', H, 'date')}<div><label>Clima</label><select name="clima">${['Ensolarado', 'Nublado', 'Chuva fraca', 'Chuva forte'].map((c) => `<option>${c}</option>`).join('')}</select></div>
      ${campo('Pessoas na obra', 'efetivo', hojeDiario?.efetivo ?? o.presentes_hoje, 'number')}<div></div>
      <div class="cheio"><label>Atividades executadas ${ast}</label><textarea name="atividades" rows="3" required>${esc(hojeDiario?.atividades || '')}</textarea></div>
      <div class="cheio"><label>Ocorrências / problemas</label><textarea name="ocorrencias" rows="2">${esc(hojeDiario?.ocorrencias || '')}</textarea></div>
      <div class="cheio"><button>Salvar diário</button></div></form></div>` : ''}
      <div class="card"><h2>Últimos registros</h2>${d.diario.length ? d.diario.map((x) => `<div class="diario-item"><b>${dataBR(x.data)} (${diaSem(x.data)})</b> <small class="mut">${esc(x.clima || '')}${x.efetivo != null ? ` · ${x.efetivo} pessoa(s)` : ''}${x.autor ? ' · ' + esc(x.autor) : ''}</small><p style="margin:2px 0">${esc(x.atividades)}</p>${x.ocorrencias ? `<p class="neg" style="margin:0"><small>Ocorrência: ${esc(x.ocorrencias)}</small></p>` : ''}</div>`).join('') : vazio('Nenhum registro ainda.')}</div></div>`;
    el.querySelector('#fd')?.addEventListener('submit', (e) => {
      e.preventDefault();
      acao(async () => { const v = Object.fromEntries(new FormData(e.target)); await api(`/api/obras/${o.id}/diario`, { method: 'POST', body: v }); await recarrega(); }, 'Diário salvo');
    });
  }

  // ---------- aba: agenda ----------
  function abaAgenda(el, d, recarrega, H) {
    const o = d.obra;
    const lista = d.eventos;
    el.innerHTML = `<div class="card"><div class="titulo-saldos"><h2>Agenda da obra</h2>${podeEditar() ? '<button id="ne">+ Compromisso</button>' : ''}</div>
      <p class="legenda aviso-vivo">Entregas de material, concretagens, vistorias e reuniões. O engenheiro recebe o alerta no dia.</p>
      ${lista.length ? `<div class="tbl"><table><tbody>${lista.map((e) => `<tr style="${e.status !== 'agendado' ? 'opacity:.55' : ''}"><td><b>${dataBR(e.data)}</b> <small class="mut">${diaSem(e.data)}${e.hora ? ' · ' + esc(e.hora) : ''}</small></td><td><span class="tag">${esc(TIPO_EVENTO[e.tipo])}</span></td><td>${esc(e.titulo)}${e.detalhe ? `<br><small class="mut">${esc(e.detalhe)}</small>` : ''}</td>
        <td><span class="tag ${e.status === 'concluido' ? 'ok' : e.status === 'cancelado' ? 'ruim' : e.data < H ? 'aviso' : ''}">${e.status === 'agendado' && e.data < H ? 'atrasado' : e.status}</span></td>
        <td class="n">${podeEditar() ? `${e.status === 'agendado' ? `<button class="mini" data-ok="${e.id}">Concluir</button> ` : ''}<button class="mini sec" data-ee="${e.id}">Editar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : vazio('Nada agendado.')}</div>`;
    el.querySelector('#ne')?.addEventListener('click', () => janelaEvento(o.id, null, recarrega));
    el.querySelectorAll('[data-ee]').forEach((b) => (b.onclick = () => janelaEvento(o.id, lista.find((e) => e.id === +b.dataset.ee), recarrega)));
    el.querySelectorAll('[data-ok]').forEach((b) => (b.onclick = () => { const e = lista.find((x) => x.id === +b.dataset.ok); acao(async () => { await api(`/api/obras/${o.id}/eventos/${e.id}`, { method: 'PUT', body: { ...e, status: 'concluido' } }); await recarrega(); }, 'Compromisso concluído'); }));
  }
  function janelaEvento(obraId, e, depois) {
    const f = e || { tipo: 'entrega', status: 'agendado', data: hojeISO() };
    const m = modal(`<h2>${e ? 'Editar compromisso' : 'Novo compromisso'}</h2>
      <form class="form" id="fe" style="margin-top:14px" autocomplete="off">
        <div class="cheio"><label>O que vai acontecer? ${ast}</label><input name="titulo" value="${esc(f.titulo || '')}" placeholder="Ex.: Chegada do caminhão de cimento"></div>
        ${campo('Data', 'data', f.data, 'date')}${campo('Hora', 'hora', f.hora, 'time')}${seletor('Tipo', 'tipo', TIPO_EVENTO, f.tipo)}${e ? seletor('Situação', 'status', { agendado: 'Agendado', concluido: 'Concluído', cancelado: 'Cancelado' }, f.status) : ''}
        <div class="cheio"><label>Detalhes</label><input name="detalhe" value="${esc(f.detalhe || '')}"></div></form>
      <div class="modal-acoes">${e ? '<button class="perigo" id="del">Excluir</button>' : ''}<span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Salvar</button></div>`, 560);
    m.el.querySelector('#x').onclick = m.fechar;
    m.el.querySelector('#del')?.addEventListener('click', () => confirm('Excluir este compromisso?') && acao(async () => { await api(`/api/obras/${obraId}/eventos/${e.id}`, { method: 'DELETE' }); m.fechar(); await depois(); }, 'Compromisso excluído'));
    m.el.querySelector('#ok').onclick = () => acao(async () => {
      await api(e ? `/api/obras/${obraId}/eventos/${e.id}` : `/api/obras/${obraId}/eventos`, { method: e ? 'PUT' : 'POST', body: Object.fromEntries(new FormData(m.el.querySelector('#fe'))) });
      m.fechar(); await depois();
    }, 'Compromisso salvo');
  }
  U.janelaEvento = janelaEvento;

  // ---------- aba: financeiro da obra (gestão) ----------
  function abaFinanceiro(el, d, recarrega) {
    const o = d.obra, adm = ehAdmin();
    const pctCusto = o.orcamento_custo ? Math.round((o.custo_comprometido / o.orcamento_custo) * 100) : 0;
    el.innerHTML = `<div class="grid">
        <div class="card kpi"><div class="l">Valor do contrato</div><div class="v">${brl(o.valor_contrato)}</div></div>
        <div class="card kpi"><div class="l">Recebido</div><div class="v pos">${brl(o.recebido)}</div></div>
        <div class="card kpi"><div class="l">A receber</div><div class="v">${brl(o.a_receber)}</div></div>
        <div class="card kpi"><div class="l">Custo pago</div><div class="v neg">${brl(o.custo_pago)}</div></div></div>
      <div class="grid dois">
      <div class="card"><h2>Custo × orçado</h2><p style="margin:0">Comprometido <b class="${o.estouro ? 'neg' : ''}">${brl(o.custo_comprometido)}</b> de ${brl(o.orcamento_custo)} (${pctCusto}%)</p>${barraProg(Math.min(100, pctCusto))}
        <p class="legenda">Pago no caixa ${brl(o.custo_pago)} + materiais a pagar ${brl(o.material_a_pagar)} + terceirizadas a pagar ${brl(o.terceiros_a_pagar)}.</p>
        <h2 style="margin-top:14px">Despesas pagas por categoria</h2>${d.financeiro.por_categoria.length ? d.financeiro.por_categoria.map((c) => `<div class="barra"><span class="nome" title="${esc(c.categoria)}">${esc(c.categoria)}</span><span class="trilho"><span class="fill" style="display:block;width:${(c.valor / d.financeiro.por_categoria[0].valor) * 100}%"></span></span><span class="val">${brl(c.valor)}</span></div>`).join('') : vazio('Sem despesas lançadas.')}</div>
      <div class="card"><div class="titulo-saldos"><h2>Medições (a receber do cliente)</h2>${adm ? '<button class="mini" id="nmed">+ Medição</button>' : ''}</div>
        ${d.medicoes.length ? `<div class="tbl"><table><tbody>${d.medicoes.map((x) => `<tr><td>${x.numero}ª</td><td>${esc(x.descricao || '')}<br><small class="${x.status !== 'recebida' && x.data_prevista < d.hoje ? 'neg' : 'mut'}">${x.status === 'recebida' ? 'recebida em ' + dataBR(x.recebido_em) : 'prevista ' + dataBR(x.data_prevista)}</small></td>
          <td class="n">${brl(x.valor)}</td><td><span class="tag ${x.status === 'recebida' ? 'ok' : x.status === 'faturada' ? 'aviso' : ''}">${STATUS_MED[x.status]}</span></td>
          <td class="n">${x.status !== 'recebida' && pode('operador') ? `<button class="mini" data-rec="${x.id}">Receber</button> ` : ''}${x.status !== 'recebida' && adm ? `<button class="mini sec" data-em="${x.id}">Editar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : vazio('Nenhuma medição cadastrada.')}</div></div>
      <div id="aditivos-extra"></div>
      <div class="card"><h2>Últimos lançamentos desta obra</h2>${d.lancamentos.length ? `<div class="tbl"><table><tbody>${d.lancamentos.map((l) => `<tr><td>${dataBR(l.data)}</td><td>${esc(l.categoria || '')}</td><td>${esc(l.descricao || '')}</td><td><small class="mut">${esc(l.conta)}</small></td><td class="n ${l.tipo === 'entrada' ? 'pos' : 'neg'}">${l.tipo === 'entrada' ? '+' : '−'} ${brl(l.valor)}</td></tr>`).join('')}</tbody></table></div>` : vazio('Nenhum lançamento.')}</div>`;
    U.aditivosExtra?.(el.querySelector('#aditivos-extra'), d, recarrega);
    el.querySelector('#nmed')?.addEventListener('click', () => janelaMedicao(o.id, null, recarrega));
    el.querySelectorAll('[data-em]').forEach((b) => (b.onclick = () => janelaMedicao(o.id, d.medicoes.find((x) => x.id === +b.dataset.em), recarrega)));
    el.querySelectorAll('[data-rec]').forEach((b) => (b.onclick = () => {
      const x = d.medicoes.find((y) => y.id === +b.dataset.rec), contas = state.meta.contas.filter((c) => c.ativo);
      const m = modal(`<h2>Receber medição ${x.numero}</h2><p class="legenda">${brl(x.valor)} — vira uma entrada no caixa, ligada a esta obra.</p>
        <form class="form" id="fr" style="margin-top:12px"><div class="cheio"><label>Entrou em qual conta?</label><select name="conta_id">${contas.map((c) => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></div>
        <div><label>Data do recebimento</label><input type="date" name="data" value="${hojeISO()}" max="${hojeISO()}"></div></form>
        <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Confirmar recebimento</button></div>`, 520);
      m.el.querySelector('#x').onclick = m.fechar;
      m.el.querySelector('#ok').onclick = () => acao(async () => { await api(`/api/medicoes/${x.id}/receber`, { method: 'POST', body: Object.fromEntries(new FormData(m.el.querySelector('#fr'))) }); m.fechar(); await recarrega(); }, 'Recebimento lançado no caixa');
    }));
  }
  function janelaMedicao(obraId, x, depois) {
    const f = x || { status: 'prevista', data_prevista: hojeISO() };
    const m = modal(`<h2>${x ? 'Editar medição' : 'Nova medição'}</h2><form class="form" id="fm" style="margin-top:12px">
      ${campo('Descrição', 'descricao', f.descricao, 'text', 'class="larg"')}${campo('Valor (R$)', 'valor', f.valor != null ? brlInput(f.valor) : '')}${campo('Data prevista', 'data_prevista', f.data_prevista, 'date')}${seletor('Situação', 'status', { prevista: 'Prevista', faturada: 'Faturada' }, f.status)}</form>
      <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Salvar</button></div>`, 520);
    m.el.querySelector('#x').onclick = m.fechar;
    m.el.querySelector('#ok').onclick = () => acao(async () => {
      const v = Object.fromEntries(new FormData(m.el.querySelector('#fm'))); v.valor = paraCentavos(v.valor);
      if (!(v.valor > 0)) throw new Error('Informe o valor da medição.');
      await api(x ? `/api/obras/${obraId}/medicoes/${x.id}` : `/api/obras/${obraId}/medicoes`, { method: x ? 'PUT' : 'POST', body: v });
      m.fechar(); await depois();
    }, 'Medição salva');
  }

  // =====================================================================
  // MATERIAIS (todas as obras)
  // =====================================================================
  async function materiais() {
    const f = state.fMat || (state.fMat = { obra_id: '', status: '' });
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    const d = await api('/api/materiais?' + qs);
    const r = d.resumo, adm = ehAdmin();
    const obrasLista = state.meta.obras?.length ? state.meta.obras : (await api('/api/obras')).map((o) => ({ id: o.id, codigo: o.codigo, nome: o.nome }));
    $app.innerHTML = `<h1>Materiais e compras</h1><p class="sub">Pedidos, cotações e entregas de material de todas as obras: o que está a caminho, o que chega hoje, o que espera aprovação e o que ainda falta pagar.</p>
      <div class="grid">
        <div class="card kpi"><div class="l">A caminho</div><div class="v">${r.a_caminho}</div></div>
        <div class="card kpi"><div class="l">Chegam hoje</div><div class="v ${r.chegam_hoje ? 'pos' : ''}">${r.chegam_hoje}</div></div>
        <div class="card kpi"><div class="l">Entregas atrasadas</div><div class="v ${r.atrasados ? 'neg' : ''}">${r.atrasados}</div></div>
        <div class="card kpi"><div class="l">Material a pagar</div><div class="v">${brl(r.a_pagar)}</div></div>
        <div class="card kpi"><div class="l">Comprado no mês</div><div class="v">${brl(r.comprado_mes)}</div></div></div>
      <div class="row"><div><label>Obra</label><select id="fo"><option value="">Todas</option>${obrasLista.map((o) => `<option value="${o.id}" ${String(f.obra_id) === String(o.id) ? 'selected' : ''}>${esc(o.codigo)} · ${esc(o.nome)}</option>`).join('')}</select></div>
        <div><label>Situação</label><select id="fs"><option value="">Todas</option>${Object.entries(STATUS_MAT).map(([k, v]) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <span style="flex:1"></span>${podeEditar() ? '<button id="nm">+ Lançar material</button>' : ''}</div>
      <div id="compras-extra"></div>
      <div class="card"><div class="titulo-saldos"><h2>Pedidos e entregas</h2>${d.lista.length > 25 ? `<button class="mini sec" id="mtodos">${state.matTodos ? 'mostrar só os 25 mais recentes' : `mostrar todos (${d.lista.length})`}</button>` : ''}</div>${tabelaMateriais(state.matTodos ? d.lista : d.lista.slice(0, 25), true)}</div>
      <div class="card"><div class="titulo-saldos"><h2>Fornecedores</h2>${adm ? '<button class="mini" id="nf">+ Fornecedor</button>' : ''}</div>
        ${d.fornecedores.length ? `<div class="tbl"><table><thead><tr><th>Fornecedor</th><th>Categoria</th><th>Contato</th><th class="n">Prazo</th><th class="n">Pedidos</th><th class="n">Total comprado</th>${adm ? '<th></th>' : ''}</tr></thead><tbody>
        ${d.fornecedores.map((x) => `<tr style="${x.ativo ? '' : 'opacity:.5'}"><td><b>${esc(x.nome)}</b></td><td><small>${esc(x.categoria)}</small></td><td><small>${esc([x.contato, x.telefone].filter(Boolean).join(' · ') || '—')}</small></td><td class="n">${x.prazo_dias != null ? x.prazo_dias + ' d' : '—'}</td><td class="n">${x.pedidos}</td><td class="n">${brl(x.total_comprado)}</td>${adm ? `<td class="n"><button class="mini sec" data-ef="${x.id}">Editar</button></td>` : ''}</tr>`).join('')}</tbody></table></div>` : vazio('Nenhum fornecedor.')}</div>`;
    const recarrega = () => materiais();
    U.comprasExtra?.(document.getElementById('compras-extra'), { d, recarrega, obras: obrasLista, fornecedores: d.fornecedores });
    document.getElementById('mtodos')?.addEventListener('click', () => { state.matTodos = !state.matTodos; materiais(); });
    document.getElementById('fo').onchange = (e) => { f.obra_id = e.target.value; materiais(); };
    document.getElementById('fs').onchange = (e) => { f.status = e.target.value; materiais(); };
    ligaMateriais($app, d.lista, recarrega);
    ligaLinksObra($app);
    document.getElementById('nm')?.addEventListener('click', async () => {
      const lista = obrasLista.filter((o) => !o.status || ['em_andamento', 'planejamento', 'pausada'].includes(o.status));
      const m = modal(`<h2>Lançar material</h2><form class="form" id="fx" style="margin-top:12px"><div class="cheio"><label>Para qual obra?</label><select name="obra">${lista.map((o) => `<option value="${o.id}">${esc(o.codigo)} · ${esc(o.nome)}</option>`).join('')}</select></div></form>
        <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Continuar</button></div>`, 480);
      m.el.querySelector('#x').onclick = m.fechar;
      m.el.querySelector('#ok').onclick = () => { const id = +m.el.querySelector('[name=obra]').value; m.fechar(); janelaMaterial(id, null, recarrega); };
    });
    const janelaForn = (x) => {
      const g = x || { categoria: 'Material básico', ativo: 1 };
      const m = modal(`<h2>${x ? 'Editar fornecedor' : 'Novo fornecedor'}</h2><form class="form" id="ff" style="margin-top:12px">
        ${campo('Nome', 'nome', g.nome, 'text', 'class="larg"')}${campo('CNPJ', 'cnpj', g.cnpj)}<div><label>Categoria</label><input name="categoria" value="${esc(g.categoria)}" list="cat-forn"><datalist id="cat-forn">${['Cimento e concreto', 'Aço e ferragens', 'Material básico', 'Elétrica e hidráulica', 'Acabamentos', 'Madeira', 'Locação de equipamentos', 'Ferramentas'].map((c) => `<option>${c}</option>`).join('')}</datalist></div>
        ${campo('Contato', 'contato', g.contato)}${campo('Telefone', 'telefone', g.telefone, 'tel')}${campo('E-mail', 'email', g.email, 'email')}${campo('Prazo de entrega (dias)', 'prazo_dias', g.prazo_dias, 'number')}
        ${x ? seletor('Situação', 'ativo', { 1: 'Ativo', 0: 'Inativo' }, String(g.ativo)) : ''}<div class="cheio"><label>Observação</label><input name="obs" value="${esc(g.obs || '')}"></div></form>
        <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Salvar</button></div>`, 620);
      m.el.querySelector('#x').onclick = m.fechar;
      m.el.querySelector('#ok').onclick = () => acao(async () => { const v = Object.fromEntries(new FormData(m.el.querySelector('#ff'))); if (v.ativo != null) v.ativo = +v.ativo; await api(x ? `/api/fornecedores/${x.id}` : '/api/fornecedores', { method: x ? 'PUT' : 'POST', body: v }); m.fechar(); await recarrega(); }, 'Fornecedor salvo');
    };
    document.getElementById('nf')?.addEventListener('click', () => janelaForn(null));
    $app.querySelectorAll('[data-ef]').forEach((b) => (b.onclick = () => janelaForn(d.fornecedores.find((x) => x.id === +b.dataset.ef))));
  }

  // =====================================================================
  // TERCEIRIZADAS (cadastro geral)
  // =====================================================================
  async function terceiros() {
    const d = await api('/api/terceirizadas'), adm = ehAdmin(), h = hojeISO();
    const venc = (data) => (!data ? '<span class="mut">—</span>' : `<span class="${data < h ? 'neg' : data <= U.obrasUtil.somaDias(h, 30) ? 'aviso-txt' : ''}">${dataBR(data)}</span>`);
    $app.innerHTML = `<h1>Empresas terceirizadas</h1><p class="sub">Quem instala o painel de LED, faz a piscina, a elétrica, as esquadrias… com contratos, certidões e seguros em dia.</p>
      <div class="row"><span style="flex:1"></span>${adm ? '<button id="nt">+ Nova empresa</button>' : ''}</div>
      <div class="card">${d.lista.length ? `<div class="tbl"><table><thead><tr><th>Empresa</th><th>Especialidade</th><th>Responsável</th><th class="n">Nota</th><th>Certidões até</th><th>Seguro até</th><th class="n">Contratos ativos</th>${adm ? '<th class="n">Contratado</th><th class="n">Pago</th><th></th>' : ''}</tr></thead><tbody>
        ${d.lista.map((t) => `<tr class="clicavel" data-t="${t.id}" style="${t.ativo ? '' : 'opacity:.5'}"><td><b>${esc(t.nome)}</b>${t.cnpj ? `<br><small class="mut">${esc(t.cnpj)}</small>` : ''}</td><td>${esc(t.especialidade)}</td><td><small>${esc([t.responsavel, t.telefone].filter(Boolean).join(' · ') || '—')}</small></td>
          <td class="n">${t.nota ? '★'.repeat(t.nota) + '<span class="mut">' + '★'.repeat(5 - t.nota) + '</span>' : '—'}</td><td>${venc(t.certidoes_validade)}</td><td>${venc(t.seguro_validade)}</td><td class="n">${t.contratos_ativos}</td>
          ${adm ? `<td class="n">${brl(t.total_contratado)}</td><td class="n">${brl(t.total_pago)}</td><td class="n"><button class="mini sec" data-et="${t.id}">Editar</button></td>` : ''}</tr>`).join('')}</tbody></table></div>
        <p class="legenda" style="margin-top:10px">Clique em uma empresa para ver as obras em que ela atua.</p>` : vazio('Nenhuma empresa cadastrada.')}</div>`;
    const recarrega = () => terceiros();
    const janela = (t) => {
      const f = t || { ativo: 1 };
      const m = modal(`<h2>${t ? 'Editar empresa' : 'Nova empresa terceirizada'}</h2><form class="form" id="ft" style="margin-top:12px">
        ${campo('Nome', 'nome', f.nome, 'text', 'class="larg"')}${campo('CNPJ', 'cnpj', f.cnpj)}
        <div class="larg"><label>Especialidade</label><input name="especialidade" value="${esc(f.especialidade || '')}" list="esp"><datalist id="esp">${d.especialidades.map((e) => `<option>${esc(e)}</option>`).join('')}</datalist></div>
        ${campo('Responsável', 'responsavel', f.responsavel)}${campo('Telefone', 'telefone', f.telefone, 'tel')}${campo('E-mail', 'email', f.email, 'email')}
        <div><label>Nota (1 a 5)</label><select name="nota"><option value="">—</option>${[1, 2, 3, 4, 5].map((n) => `<option ${f.nota === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        ${campo('Validade das certidões', 'certidoes_validade', f.certidoes_validade, 'date')}${campo('Validade do seguro', 'seguro_validade', f.seguro_validade, 'date')}
        ${t ? seletor('Situação', 'ativo', { 1: 'Ativa', 0: 'Inativa' }, String(f.ativo)) : ''}<div class="cheio"><label>Observação</label><input name="obs" value="${esc(f.obs || '')}"></div></form>
        <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Salvar</button></div>`, 640);
      m.el.querySelector('#x').onclick = m.fechar;
      m.el.querySelector('#ok').onclick = () => acao(async () => { const v = Object.fromEntries(new FormData(m.el.querySelector('#ft'))); if (v.ativo != null) v.ativo = +v.ativo; await api(t ? `/api/terceirizadas/${t.id}` : '/api/terceirizadas', { method: t ? 'PUT' : 'POST', body: v }); m.fechar(); await recarrega(); }, 'Empresa salva');
    };
    document.getElementById('nt')?.addEventListener('click', () => janela(null));
    $app.querySelectorAll('[data-et]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); janela(d.lista.find((x) => x.id === +b.dataset.et)); }));
    $app.querySelectorAll('tr.clicavel').forEach((tr) => (tr.onclick = async () => {
      const t = d.lista.find((x) => x.id === +tr.dataset.t), cs = await api(`/api/terceirizadas/${t.id}/contratos`);
      const m = modal(`<h2>${esc(t.nome)}</h2><p class="legenda">${esc(t.especialidade)}</p>${cs.length ? `<div class="tbl"><table><tbody>${cs.map((c) => `<tr><td>${linkObra(c.obra_id, esc(c.codigo))}<br><small class="mut">${esc(c.obra)}</small></td><td>${esc(c.escopo)}</td><td><span class="tag">${STATUS_TERC[c.status]}</span></td>${adm ? `<td class="n">${brl(c.valor)}</td>` : ''}</tr>`).join('')}</tbody></table></div>` : vazio('Nenhum contrato ainda.')}<div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Fechar</button></div>`, 640);
      m.el.querySelector('#x').onclick = m.fechar; ligaLinksObra(m.el);
      m.el.querySelectorAll('[data-obra]').forEach((a) => a.addEventListener('click', () => m.fechar()));
    }));
  }

  // =====================================================================
  // DOCUMENTAÇÃO (todas as obras)
  // =====================================================================
  async function documentos() {
    const d = await api('/api/documentos'), h = d.hoje;
    const r = d.resumo, ordem = Object.keys(d.tipos);
    const usados = ordem.filter((t) => d.obras.some((o) => o.documentos.some((x) => x.tipo === t)));
    const celula = (o, tipo) => {
      const x = o.documentos.find((y) => y.tipo === tipo);
      if (!x) return '<td class="doc-cel"><span class="mut">—</span></td>';
      let s = sitDoc(x, h);
      if (s === 'pendente' && ['HABITESE', 'AS_BUILT', 'CND_OBRA'].includes(tipo)) s = 'dispensado'; // fim de obra: ainda não é a hora
      return `<td class="doc-cel" title="${esc(d.tipos[tipo].rotulo)}${x.validade ? ' · validade ' + dataBR(x.validade) : ''}${x.emitido_por ? ' · ' + esc(x.emitido_por) : ''}"><span class="dot ${SIT_DOC[s][0] || 'neutro'}"></span></td>`;
    };
    $app.innerHTML = `<h1>Documentação das obras</h1><p class="sub">Quem tem ART/RRT, alvará, CNO, PGR e demais documentos em dia — e o que está pendente ou vencido.</p>
      <div class="grid"><div class="card kpi"><div class="l">Documentos em dia</div><div class="v pos">${r.ok}</div></div><div class="card kpi"><div class="l">Pendentes</div><div class="v ${r.pendentes ? 'neg' : ''}">${r.pendentes}</div></div>
        <div class="card kpi"><div class="l">Vencidos</div><div class="v ${r.vencidos ? 'neg' : ''}">${r.vencidos}</div></div><div class="card kpi"><div class="l">Vencem em 30 dias</div><div class="v">${r.vencem_logo}</div></div></div>
      <div class="card"><h2>Matriz de conformidade</h2><p class="legenda aviso-vivo"><span class="dot ok"></span> em dia · <span class="dot aviso"></span> pendente ou vence em breve · <span class="dot ruim"></span> vencido · <span class="dot neutro"></span> dispensado. Passe o mouse para ver os detalhes; clique na obra para abrir a documentação.</p>
        ${d.obras.length ? `<div class="tbl"><table class="matriz"><thead><tr><th>Obra</th>${usados.map((t) => `<th class="doc-cel" title="${esc(d.tipos[t].rotulo)}">${esc(t.replace('_', ' '))}</th>`).join('')}</tr></thead><tbody>
        ${d.obras.map((o) => `<tr><td><a href="#obras" data-doc-obra="${o.id}"><b>${esc(o.codigo)}</b> ${esc(o.nome)}</a><br><small class="mut">${esc(o.engenheiro || 'sem engenheiro')}</small></td>${usados.map((t) => celula(o, t)).join('')}</tr>`).join('')}</tbody></table></div>` : vazio('Nenhuma obra em curso.')}</div>
      <div class="card"><h2>O que precisa de ação</h2>${(() => {
        const itens = d.obras.flatMap((o) => o.documentos.map((x) => ({ o, x, s: sitDoc(x, h) }))).filter(({ s, x }) => ['vencido', 'vence_logo'].includes(s) || (s === 'pendente' && !['HABITESE', 'AS_BUILT', 'CND_OBRA'].includes(x.tipo)));
        if (!itens.length) return vazio('Tudo em dia.');
        const peso = { vencido: 0, vence_logo: 1, pendente: 2 };
        return `<div class="tbl"><table><tbody>${itens.sort((a, b) => peso[a.s] - peso[b.s]).map(({ o, x, s }) => `<tr><td><a href="#obras" data-doc-obra="${o.id}">${esc(o.codigo)}</a><br><small class="mut">${esc(o.nome)}</small></td><td><b>${esc(x.tipo)}</b><br><small class="mut">${esc(d.tipos[x.tipo]?.rotulo || '')}</small></td><td><span class="tag ${SIT_DOC[s][0]}">${s === 'pendente' ? STATUS_DOC[x.status] : SIT_DOC[s][1]}</span></td><td><small>${x.validade ? 'validade ' + dataBR(x.validade) : ''}</small></td></tr>`).join('')}</tbody></table></div>`;
      })()}</div>`;
    $app.querySelectorAll('[data-doc-obra]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); abrirObra(+a.dataset.docObra, 'documentos'); }));
  }

  rotas.obras = obras; rotas.materiais = materiais; rotas.terceiros = terceiros; rotas.documentos = documentos;
}
