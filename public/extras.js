// Telas de apoio: marca e logo, histórico de alterações e (nas próximas partes) fluxo de caixa, folha, segurança, portal, mapa e importação.
export function instalar(U) {
  const { state, api, esc, brl, dataBR, ico, toast, acao, modal, avatar, pode, hojeISO, rotas, lerBase64, nomeMes } = U;
  const $app = document.getElementById('app');
  const vazio = (t) => `<p class="mut">${t}</p>`;
  Object.assign(U.ICONES, {
    historico: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    marca: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 0 0 0 20 2 2 0 0 0 2-2c0-.6-.2-1-.5-1.4a2 2 0 0 1 1.5-3.3H17a5 5 0 0 0 5-5C22 6 17.5 2 12 2Z"/>',
    importar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    fluxocaixa: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    mapa: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    seguranca: '<path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5Z"/><path d="m9 12 2 2 4-4"/>',
    folha: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
    portal: '<path d="M3 21h18"/><path d="M5 21V9l7-5 7 5v12"/><path d="M9 21v-6h6v6"/>',
  });

  // ---------- Marca e logo ----------
  async function marca() {
    const m = await fetch('/api/marca').then((r) => r.json());
    $app.innerHTML = `<h1>Marca e logo</h1><p class="sub">Nome, cor e logo da empresa. Aparecem no menu, na tela de entrada e na aba do navegador.</p>
      <div class="grid dois"><div class="card"><h2>Identidade</h2><form class="form" id="fm" style="grid-template-columns:1fr">
        <div><label>Nome da empresa</label><input name="nome" value="${esc(m.nome)}" required></div>
        <div><label>Cor de destaque</label><div style="display:flex;gap:10px"><input type="color" id="cor-pick" value="${m.cor || '#c2570a'}" style="width:60px;padding:2px"><input name="cor" id="cor-txt" value="${esc(m.cor || '')}" placeholder="#c2570a (vazio = padrão)"></div></div>
        <div><button>Salvar</button></div></form></div>
      <div class="card"><h2>Logo</h2>${m.tem_logo ? `<p><img src="/api/marca/logo?v=${m.v}" alt="Logo atual" style="max-width:220px;max-height:120px;background:#fff;border:1px solid var(--bd);border-radius:8px;padding:8px"></p>` : '<p class="mut">Nenhuma logo enviada: o sistema mostra o nome em texto.</p>'}
        <form class="form" id="fl" style="grid-template-columns:1fr"><div><label>Enviar nova logo (PNG, JPG, WebP ou SVG, até 300 KB)</label><input type="file" name="arq" accept="image/png,image/jpeg,image/webp,image/svg+xml"></div>
        <div class="fu-acoes"><button>Enviar logo</button>${m.tem_logo ? '<button type="button" class="perigo" id="rm">Remover logo</button>' : ''}</div></form></div></div>`;
    const pick = document.getElementById('cor-pick'), txt = document.getElementById('cor-txt');
    pick.oninput = () => (txt.value = pick.value);
    document.getElementById('fm').onsubmit = (e) => { e.preventDefault(); acao(async () => { await api('/api/marca', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); await state.aplicarMarca(); await marca(); }, 'Marca salva'); };
    document.getElementById('fl').onsubmit = (e) => {
      e.preventDefault();
      acao(async () => {
        const arq = e.target.arq.files[0];
        if (!arq) throw new Error('Escolha o arquivo da logo.');
        if (arq.size > 300 * 1024) throw new Error('A logo passa de 300 KB.');
        await api('/api/marca/logo', { method: 'POST', body: { base64: await lerBase64(arq) } }); await state.aplicarMarca(); await marca();
      }, 'Logo enviada');
    };
    document.getElementById('rm')?.addEventListener('click', () => acao(async () => { await api('/api/marca/logo', { method: 'DELETE' }); await state.aplicarMarca(); await marca(); }, 'Logo removida'));
  }

  // ---------- Histórico de alterações ----------
  async function historico() {
    const f = state.fHist || (state.fHist = { usuario_id: '', obra_id: '', de: '', ate: '', q: '' });
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    const [lista, obras] = [await api('/api/historico?' + qs), state.meta.obras || []];
    const equipe = (state.meta.equipe || []).filter((u) => u.papel !== 'cliente');
    $app.innerHTML = `<h1>Histórico de alterações</h1><p class="sub">Quem mudou o quê e quando. Registra toda criação, alteração e exclusão feita no sistema (as 300 mais recentes do filtro).</p>
      <div class="row"><div><label>Pessoa</label><select id="hu"><option value="">Todas</option>${equipe.map((u) => `<option value="${u.id}" ${String(f.usuario_id) === String(u.id) ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></div>
        <div><label>Obra</label><select id="ho"><option value="">Todas</option>${obras.map((o) => `<option value="${o.id}" ${String(f.obra_id) === String(o.id) ? 'selected' : ''}>${esc(o.codigo)} · ${esc(o.nome)}</option>`).join('')}</select></div>
        <div><label>De</label><input type="date" id="hd" value="${esc(f.de)}"></div><div><label>Até</label><input type="date" id="ha" value="${esc(f.ate)}"></div>
        <div><label>Buscar</label><input id="hq" value="${esc(f.q)}" placeholder="Ex.: material, ART, pagou"></div></div>
      <div class="card">${lista.length ? `<div class="tbl"><table><thead><tr><th>Quando</th><th>Quem</th><th>O que fez</th><th>Detalhes</th><th>Obra</th></tr></thead><tbody>
        ${lista.map((a) => `<tr><td style="white-space:nowrap"><b>${dataBR(String(a.em).slice(0, 10))}</b> <small class="mut">${String(a.em).slice(11, 16)}</small></td>
          <td><div class="quem">${avatar({ id: a.usuario_id, nome: a.usuario_nome || '?' }, 28)}<div><span>${esc(a.usuario_nome || '—')}</span><small class="mut">${esc(U.PAPEL_NOME[a.papel] || a.papel || '')}</small></div></div></td>
          <td><b>${esc(a.acao)}</b></td><td><small>${esc(a.detalhe || '')}</small></td><td>${a.obra_id ? `<small><a href="#obras" data-obra="${a.obra_id}">${esc(a.obra_codigo || '')}</a></small>` : '<span class="mut">—</span>'}</td></tr>`).join('')}</tbody></table></div>` : vazio('Nada registrado neste filtro.')}</div>`;
    const liga = (id, k) => { document.getElementById(id).onchange = (e) => { f[k] = e.target.value; historico(); }; };
    liga('hu', 'usuario_id'); liga('ho', 'obra_id'); liga('hd', 'de'); liga('ha', 'ate'); liga('hq', 'q');
    U.ligaLinksObra($app);
  }

  rotas.marca = marca; rotas.historico = historico;
}
