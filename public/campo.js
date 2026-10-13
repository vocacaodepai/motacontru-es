// Celular e campo: app instalável (PWA), Modo Campo (presença, diário, foto e recebimento em dois toques) e galeria de fotos da obra.
export function instalar(U) {
  const { state, api, esc, brl, dataBR, ico, toast, acao, modal, pode, hojeISO, rotas, ast } = U;
  const $app = document.getElementById('app');
  const { barraProg, tagStatus, tagRitmo, diasTxt, diaSem } = U.obrasUtil;

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('/sw.js').catch(() => {});
  Object.assign(U.ICONES, {
    campo: '<path d="M12 2a3 3 0 0 0-3 3v1H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-4V5a3 3 0 0 0-3-3Z"/><circle cx="12" cy="13" r="3.5"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3Z"/><circle cx="12" cy="13" r="3"/>',
    foto: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  });

  // ---------- reduzir foto no navegador (JPEG ~1600 px + miniatura) ----------
  async function carregarImagem(arquivo) {
    if (window.createImageBitmap) { try { return await createImageBitmap(arquivo, { imageOrientation: 'from-image' }); } catch { /* cai no <img> */ } }
    return new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = URL.createObjectURL(arquivo); });
  }
  async function reduzir(img, lado, qualidade) {
    const k = Math.min(1, lado / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', qualidade).split(',')[1];
  }
  async function prepararFoto(arquivo) {
    const img = await carregarImagem(arquivo);
    return { dados: await reduzir(img, 1600, 0.82), miniatura: await reduzir(img, 360, 0.7) };
  }
  // envia várias fotos de uma vez (mesma legenda/etapa); mostra o andamento
  async function enviarFotos(obraId, arquivos, opcoes = {}) {
    let ok = 0;
    for (const [i, a] of [...arquivos].entries()) {
      toast(`Enviando foto ${i + 1} de ${arquivos.length}…`);
      try {
        const p = await prepararFoto(a);
        await api(`/api/obras/${obraId}/fotos`, { method: 'POST', body: { ...p, ...opcoes } });
        ok++;
      } catch (e) { toast(`Foto ${i + 1}: ${e.message}`, true); }
    }
    if (ok) toast(ok === 1 ? 'Foto enviada' : `${ok} fotos enviadas`);
    return ok;
  }
  U.enviarFotos = enviarFotos;

  function janelaEnviarFotos(obraId, fases, depois, arquivosIniciais) {
    const m = modal(`<h2>${ico('camera')} Enviar fotos</h2>
      <form class="form" id="ff" style="margin-top:12px">
        <div class="cheio"><label>Fotos (câmera ou galeria)</label><input type="file" name="arq" accept="image/*" multiple capture="environment"></div>
        <div class="larg"><label>Legenda (vale para todas)</label><input name="legenda" placeholder="Ex.: laje do 2º pavimento concretada"></div>
        <div><label>Etapa</label><select name="fase_id"><option value="">—</option>${fases.map((f) => `<option value="${f.id}">${esc(f.nome)}</option>`).join('')}</select></div>
        <div class="cheio"><label class="chk"><input type="checkbox" name="visivel_cliente"> Mostrar ao cliente no portal da obra</label></div></form>
      <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Enviar</button></div>`, 520);
    const input = m.el.querySelector('[name=arq]');
    if (arquivosIniciais?.length) { const dt = new DataTransfer(); [...arquivosIniciais].forEach((a) => dt.items.add(a)); input.files = dt.files; }
    m.el.querySelector('#x').onclick = m.fechar;
    m.el.querySelector('#ok').onclick = () => acao(async () => {
      const f = m.el.querySelector('#ff'), arquivos = f.arq.files;
      if (!arquivos.length) throw new Error('Escolha pelo menos uma foto.');
      const n = await enviarFotos(obraId, arquivos, { legenda: f.legenda.value, fase_id: f.fase_id.value || null, visivel_cliente: f.visivel_cliente.checked });
      m.fechar(); if (n) await depois();
    });
  }
  U.janelaEnviarFotos = janelaEnviarFotos;

  // ---------- aba Fotos (dentro da obra) ----------
  async function abaFotos(el, d, recarrega) {
    const o = d.obra, fotos = await api(`/api/obras/${o.id}/fotos`);
    const podeEditar = pode('admin') || state.usuario.papel === 'engenheiro';
    const filtro = state.fotoFase || '';
    const lista = fotos.filter((f) => !filtro || String(f.fase_id) === filtro);
    el.innerHTML = `<div class="card"><div class="titulo-saldos"><h2>Fotos da obra (${fotos.length})</h2>${podeEditar ? `<button id="nf">${ico('camera')} Adicionar fotos</button>` : ''}</div>
      <p class="legenda aviso-vivo">Registro visual datado, por etapa. As fotos marcadas “visível ao cliente” aparecem no portal da obra.</p>
      ${fotos.length ? `<div class="row"><div><label>Etapa</label><select id="ff"><option value="">Todas</option>${d.fases.map((f) => `<option value="${f.id}" ${filtro === String(f.id) ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}</select></div></div>
        <div class="galeria">${lista.map((f) => `<figure data-foto="${f.id}" tabindex="0"><img src="/api/fotos/${f.id}/miniatura" alt="${esc(f.legenda || 'Foto da obra')}" loading="lazy"><figcaption><b>${dataBR(String(f.data).slice(0, 10))}</b>${f.visivel_cliente ? ' <span class="tag ok">cliente vê</span>' : ''}<br><small class="mut">${esc(f.legenda || f.fase || '')}</small></figcaption></figure>`).join('') || '<p class="mut">Nenhuma foto nesta etapa.</p>'}</div>` : '<p class="mut">Nenhuma foto ainda. Tire a primeira foto da obra!</p>'}</div>`;
    el.querySelector('#nf')?.addEventListener('click', () => janelaEnviarFotos(o.id, d.fases, recarrega));
    el.querySelector('#ff')?.addEventListener('change', (e) => { state.fotoFase = e.target.value; recarrega(); });
    el.querySelectorAll('[data-foto]').forEach((fg) => (fg.onclick = () => lightbox(lista, +fg.dataset.foto, d.fases, podeEditar, recarrega)));
  }
  function lightbox(lista, id, fases, podeEditar, recarrega) {
    const f = lista.find((x) => x.id === id), i = lista.indexOf(f);
    const m = modal(`<div class="lightbox"><img src="/api/fotos/${f.id}/dados" alt="${esc(f.legenda || '')}"></div>
      <p style="margin:10px 0 2px"><b>${dataBR(String(f.data).slice(0, 10))}</b> · ${esc(f.fase || 'sem etapa')} · <small class="mut">${esc(f.autor || '')}</small></p>
      ${podeEditar ? `<form class="form" id="fe" style="margin-top:8px"><div class="larg"><label>Legenda</label><input name="legenda" value="${esc(f.legenda || '')}"></div>
        <div><label>Etapa</label><select name="fase_id"><option value="">—</option>${fases.map((x) => `<option value="${x.id}" ${x.id === f.fase_id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>
        <div class="cheio"><label class="chk"><input type="checkbox" name="visivel" ${f.visivel_cliente ? 'checked' : ''}> Visível ao cliente</label></div></form>` : `<p>${esc(f.legenda || '')}</p>`}
      <div class="modal-acoes">${podeEditar ? '<button class="perigo" id="del">Excluir</button><button class="sec" id="sv">Salvar</button>' : ''}<a class="btn sec" href="/api/fotos/${f.id}/dados" target="_blank" rel="noopener" download>${ico('download')} Baixar</a><span style="flex:1"></span>
        <button class="sec" id="ant" ${i > 0 ? '' : 'disabled'}>${ico('arrow-left')}</button><button class="sec" id="prox" ${i < lista.length - 1 ? '' : 'disabled'}>${ico('arrow-right')}</button><button class="sec" id="x">Fechar</button></div>`, 820);
    m.el.querySelector('#x').onclick = m.fechar;
    m.el.querySelector('#ant').onclick = () => { m.fechar(); lightbox(lista, lista[i - 1].id, fases, podeEditar, recarrega); };
    m.el.querySelector('#prox').onclick = () => { m.fechar(); lightbox(lista, lista[i + 1].id, fases, podeEditar, recarrega); };
    m.el.querySelector('#sv')?.addEventListener('click', () => acao(async () => { const fm = m.el.querySelector('#fe'); await api(`/api/fotos/${f.id}`, { method: 'PUT', body: { legenda: fm.legenda.value, fase_id: fm.fase_id.value || null, visivel_cliente: fm.visivel.checked } }); m.fechar(); await recarrega(); }, 'Foto atualizada'));
    m.el.querySelector('#del')?.addEventListener('click', () => confirm('Excluir esta foto?') && acao(async () => { await api(`/api/fotos/${f.id}`, { method: 'DELETE' }); m.fechar(); await recarrega(); }, 'Foto excluída'));
  }
  U.extraAbas.push(['fotos', 'Fotos', abaFotos, false]);

  // ---------- Modo Campo ----------
  async function campo() {
    const obras = (await api('/api/obras')).filter((o) => ['em_andamento', 'planejamento', 'pausada'].includes(o.status));
    if (!obras.length) { $app.innerHTML = '<h1>Modo campo</h1><p class="mut">Nenhuma obra em curso.</p>'; return; }
    let id = Number(state.campoObra || localStorage.getItem('campoObra'));
    if (!obras.some((o) => o.id === id)) id = obras[0].id;
    state.campoObra = id; try { localStorage.setItem('campoObra', id); } catch { /* sem armazenamento: tudo bem */ }
    const d = await api(`/api/obras/${id}`), o = d.obra, h = d.hoje;
    const entregas = d.materiais.filter((m) => ['solicitado', 'pedido'].includes(m.status) && m.entrega_prevista && m.entrega_prevista <= somaDias(h, 1));
    const presReg = d.equipe.filter((q) => q.situacao_hoje).length, ativos = d.equipe.filter((q) => !q.ate || q.ate >= h).length;
    const diarioHoje = d.diario.find((x) => x.data === h);
    $app.innerHTML = `<div class="campo">
      <div class="row" style="margin-bottom:8px"><div style="flex:1"><label>Obra</label><select id="sel">${obras.map((x) => `<option value="${x.id}" ${x.id === id ? 'selected' : ''}>${esc(x.codigo)} · ${esc(x.nome)}</option>`).join('')}</select></div></div>
      <div class="card campo-topo"><div class="obra-topo">${tagStatus(o)} ${tagRitmo(o)}</div><h2 style="margin:6px 0">${esc(o.nome)}</h2><div class="obra-prog"><b>${o.progresso}%</b>${barraProg(o.progresso, o.ritmo?.esperado)}</div><small class="mut">${esc(o.fase_atual ? 'Fase: ' + o.fase_atual : '')} · ${esc(diasTxt(o))}</small></div>
      <div class="campo-botoes">
        <button class="campo-btn" id="b-pres">${ico('clientes')}<b>Presença</b><small>${presReg}/${ativos} hoje</small></button>
        <button class="campo-btn" id="b-diario">${ico('mensal')}<b>Diário do dia</b><small>${diarioHoje ? 'já preenchido' : 'ainda não feito'}</small></button>
        <label class="campo-btn" for="b-foto">${ico('camera')}<b>Tirar foto</b><small>câmera do celular</small></label><input id="b-foto" type="file" accept="image/*" capture="environment" multiple hidden>
        <button class="campo-btn" id="b-mat">${ico('materiais')}<b>Receber material</b><small>${entregas.length} para hoje/amanhã</small></button>
        <button class="campo-btn" id="b-etapa">${ico('painel')}<b>Atualizar etapa</b><small>% de avanço</small></button>
        <button class="campo-btn" id="b-pend">${ico('info')}<b>Anotar pendência</b><small>defeito ou ajuste</small></button></div>
      <div class="card"><h2>Hoje na obra</h2>${d.eventos.filter((e) => e.data === h && e.status === 'agendado').map((e) => `<p style="margin:4px 0">${e.hora ? '<b>' + esc(e.hora) + '</b> · ' : ''}${esc(e.titulo)}</p>`).join('') || '<p class="mut">Nenhum compromisso hoje.</p>'}</div></div>`;
    document.getElementById('sel').onchange = (e) => { state.campoObra = +e.target.value; campo(); };
    const recarrega = () => campo();
    document.getElementById('b-pres').onclick = () => U.janelaPresenca(id, h, recarrega);
    document.getElementById('b-foto').onchange = (e) => { if (e.target.files.length) janelaEnviarFotos(id, d.fases, recarrega, e.target.files); };
    document.getElementById('b-diario').onclick = () => {
      const m = modal(`<h2>Diário de ${dataBR(h)}</h2><form class="form" id="fd" style="margin-top:12px" autocomplete="off"><input type="hidden" name="data" value="${h}">
        <div><label>Clima</label><select name="clima">${['Ensolarado', 'Nublado', 'Chuva fraca', 'Chuva forte'].map((c) => `<option ${diarioHoje?.clima === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div><label>Pessoas na obra</label><input name="efetivo" type="number" value="${diarioHoje?.efetivo ?? o.presentes_hoje}"></div>
        <div class="cheio"><label>O que foi feito hoje? ${ast}</label><textarea name="atividades" rows="4">${esc(diarioHoje?.atividades || '')}</textarea></div>
        <div class="cheio"><label>Ocorrências / problemas</label><textarea name="ocorrencias" rows="2">${esc(diarioHoje?.ocorrencias || '')}</textarea></div></form>
        <div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Salvar diário</button></div>`, 560);
      m.el.querySelector('#x').onclick = m.fechar;
      m.el.querySelector('#ok').onclick = () => acao(async () => { await api(`/api/obras/${id}/diario`, { method: 'POST', body: Object.fromEntries(new FormData(m.el.querySelector('#fd'))) }); m.fechar(); await recarrega(); }, 'Diário salvo');
    };
    document.getElementById('b-mat').onclick = () => {
      const m = modal(`<h2>Receber material</h2>${entregas.length ? entregas.map((x) => `<div class="campo-linha"><div><b>${esc(x.descricao)}</b><br><small class="mut">${U.obrasUtil.qtd(x.quantidade)} ${esc(x.unidade)} · ${esc(x.fornecedor || '')} · previsto ${dataBR(x.entrega_prevista)}</small></div><button data-rec="${x.id}">Recebi</button></div>`).join('') : '<p class="mut">Nenhuma entrega prevista para hoje ou amanhã.</p>'}<div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Fechar</button></div>`, 520);
      m.el.querySelector('#x').onclick = m.fechar;
      m.el.querySelectorAll('[data-rec]').forEach((b) => (b.onclick = () => acao(async () => { await api(`/api/materiais/${b.dataset.rec}/status`, { method: 'POST', body: { status: 'entregue' } }); m.fechar(); await recarrega(); }, 'Material recebido')));
    };
    document.getElementById('b-etapa').onclick = () => {
      const abertas = d.fases.filter((f) => f.progresso < 100);
      const m = modal(`<h2>Atualizar etapa</h2>${abertas.map((f) => `<div class="campo-linha" style="flex-direction:column;align-items:stretch"><div><b>${esc(f.nome)}</b> <span class="tag ${f.atrasada ? 'ruim' : ''}">${f.progresso}%</span></div><input type="range" min="0" max="100" step="5" value="${f.progresso}" data-fase="${f.id}"><small class="mut" data-v="${f.id}">${f.progresso}%</small></div>`).join('') || '<p class="mut">Todas as etapas concluídas.</p>'}<div class="modal-acoes"><span style="flex:1"></span><button class="sec" id="x">Cancelar</button><button id="ok">Salvar</button></div>`, 520);
      m.el.querySelector('#x').onclick = m.fechar;
      m.el.querySelectorAll('[data-fase]').forEach((r) => (r.oninput = () => (m.el.querySelector(`[data-v="${r.dataset.fase}"]`).textContent = r.value + '%')));
      m.el.querySelector('#ok').onclick = () => acao(async () => {
        for (const r of m.el.querySelectorAll('[data-fase]')) { const f = d.fases.find((x) => x.id === +r.dataset.fase); if (+r.value !== f.progresso) await api(`/api/obras/${id}/fases/${f.id}`, { method: 'PUT', body: { progresso: +r.value } }); }
        m.fechar(); await recarrega();
      }, 'Avanço atualizado');
    };
    document.getElementById('b-pend').onclick = () => U.janelaPendencia ? U.janelaPendencia(id, null, recarrega) : toast('Pendências em breve', true);
  }
  const somaDias = U.obrasUtil.somaDias;
  rotas.campo = campo;
}
