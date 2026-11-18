// ---- Copy Scenes Between Layouts ----
let layoutCopySelected = new Set();
function renderLayoutCopyScenes(){
  const sel = $('#layoutCopySrcSel'), box = $('#layoutCopyScenesBox');
  if(!sel || !box) return;
  const curSrc = sel.value;
  const others = Object.entries(layoutsCache).filter(([id]) => id !== layoutEditingId);
  sel.innerHTML = `<option value="">Choose source layout…</option>` + others.map(([id, p]) =>
    `<option value="${escHtml(id)}">${escHtml(p.name || id)}</option>`
  ).join('');
  if(curSrc && others.some(([id]) => id === curSrc)) sel.value = curSrc;
  else if(others.length) sel.value = others[0][0];

  const srcId = sel.value;
  if(!srcId || !layoutsCache[srcId]){
    box.innerHTML = '<span class="status">No other layouts available.</span>';
    return;
  }
  const srcVirts = new Set(Object.keys(layoutsCache[srcId].virtuals || {}));
  const srcScenes = Object.entries(scenesCache).filter(([, s]) =>
    Object.entries(s?.virtuals || {}).some(([vid, eff]) => eff && eff.type && srcVirts.has(vid))
  );
  if(!srcScenes.length){
    box.innerHTML = '<span class="status">No scenes found in selected layout.</span>';
    return;
  }
  box.innerHTML = srcScenes.map(([sid, s]) => `
    <button type="button" class="gchip ${layoutCopySelected.has(sid)?'sel':''}" data-csid="${escHtml(sid)}">${escHtml(s.name || sid)}</button>
  `).join('');
  box.querySelectorAll('[data-csid]').forEach(b => b.addEventListener('click', () => {
    const sid = b.dataset.csid;
    if(layoutCopySelected.has(sid)) layoutCopySelected.delete(sid);
    else layoutCopySelected.add(sid);
    b.classList.toggle('sel', layoutCopySelected.has(sid));
  }));
}
$('#layoutCopySrcSel')?.addEventListener('change', () => { layoutCopySelected.clear(); renderLayoutCopyScenes(); });
$('#layoutCopyAllBtn')?.addEventListener('click', () => {
  $('#layoutCopyScenesBox')?.querySelectorAll('[data-csid]').forEach(b => {
    layoutCopySelected.add(b.dataset.csid);
    b.classList.add('sel');
  });
});
$('#layoutCopyNoneBtn')?.addEventListener('click', () => {
  layoutCopySelected.clear();
  $('#layoutCopyScenesBox')?.querySelectorAll('[data-csid]').forEach(b => b.classList.remove('sel'));
});
$('#layoutCopyScenesBtn')?.addEventListener('click', async () => {
  const targetVirts = layoutEditVirtuals.size
    ? [...layoutEditVirtuals]
    : Object.keys(layoutsCache[layoutEditingId]?.virtuals || {});
  if(!targetVirts.length){
    toast('Select at least one virtual in "Virtuals in this Layout" first', true);
    return;
  }
  if(!layoutCopySelected.size){
    toast('Select one or more scenes to copy', true);
    return;
  }
  const dst1D = targetVirts.find(v => !v.includes('matrix')) || targetVirts[0];
  const dst2D = targetVirts.find(v => v.includes('matrix')) || dst1D;
  let ok = 0;
  for(const sid of layoutCopySelected){
    const sc = scenesCache[sid];
    if(!sc) continue;
    const newVmap = {};
    for(const [vid, eff] of Object.entries(sc.virtuals || {})){
      if(!eff || !eff.type) continue;
      const dst = vid.includes('matrix') ? dst2D : dst1D;
      newVmap[dst] = eff;
    }
    if(!Object.keys(newVmap).length) continue;
    try{
      await api('/scenes', {
        method: 'POST',
        body: JSON.stringify({
          name: sc.name || sid,
          scene_tags: sc.scene_tags || '',
          virtuals: newVmap,
        }),
      });
      ok++;
    }catch(e){}
  }
  await loadScenes();
  toast(`Copied ${ok} scene(s) to layout`);
});

// === LIVE TUBE EFFECT PREVIEW ===
function isPreviewVisible(){
  const pane = $('#pane-main');
  return pane && !pane.hidden;
}

function isLayoutPreviewVisible(){
  const pane = $('#pane-layout');
  return pane && !pane.hidden && !!$('#layoutPreviewCanvas');
}

if($('#previewLiveBtn')) $('#previewLiveBtn').addEventListener('click', ()=>{
  previewLive = !previewLive;
  const btn = $('#previewLiveBtn');
  if(btn){
    btn.textContent = previewLive ? 'Live' : 'Paused';
    btn.classList.toggle('on', previewLive);
  }
  syncVisSubscription();
  if(previewLive) scheduleTubePreview();
  else if($('#previewMeta')) $('#previewMeta').textContent = 'paused';
});

function scheduleTubePreview(){
  if(previewRaf || document.hidden || !isPreviewVisible()) return;
  previewRaf = requestAnimationFrame(()=>{
    previewRaf = 0;
    drawTubePreview();
  });
}

const deckOutMode = {}, deckOutSnapshot = {};
async function toggleDeckOutMode(deckId, mode, card){
  const cur = deckOutMode[deckId] || '';
  const ids = targets(deckId).filter(vid => virtualsCache[vid]?.active);
  if(cur === mode){
    deckOutMode[deckId] = '';
    const snap = deckOutSnapshot[deckId];
    if(snap){
      await Promise.all(Object.entries(snap).map(([vid, v]) => {
        if(v?.active && v?.effect?.type){
          return api(`/virtuals/${vid}/effects`, {method:'POST', body: JSON.stringify({type: v.effect.type, config: v.effect.config || {}})}).catch(()=>{});
        }
        return Promise.resolve();
      }));
      delete deckOutSnapshot[deckId];
    }
  }else{
    if(!cur){
      let latest = virtualsCache;
      try{ const d = await api('/virtuals'); latest = d.virtuals || d; }catch(e){}
      const snap = {};
      for(const vid of ids) if(latest[vid]) snap[vid] = JSON.parse(JSON.stringify(latest[vid]));
      deckOutSnapshot[deckId] = snap;
    }
    deckOutMode[deckId] = mode;
    const col = mode === 'white' ? '#ffffff' : '#000000';
    await Promise.all(ids.map(vid => api(`/virtuals/${vid}/effects`, {method:'POST', body: JSON.stringify({type:'singleColor', config:{color: col, brightness: 1.0}})}).catch(()=>{})));
  }
  const activeMode = deckOutMode[deckId] || '';
  card?.querySelectorAll('[data-deck-out]').forEach(b => b.classList.toggle('on', b.dataset.deckOut === activeMode));
}

let multiPreviewKey = '', multiCardRefs = {};
function drawTubePreview(){
  if(document.hidden || !isPreviewVisible()) return;
  const singleCanvas = $('#tubePreviewCanvas');
  const multiGrid = $('#multiPreviewGrid');
  const enabledLayouts = getOrderedLayoutEntries(true);
  if(!activeDeckId && enabledLayouts.length && multiGrid && singleCanvas){
    singleCanvas.hidden = true;
    multiGrid.hidden = false;
    const key = enabledLayouts.map(([id, p]) => `${id}:${p.name}:${p.scene_tag||''}`).join('|') + '::' + Object.keys(scenesCache).map(k => `${k}=${scenesCache[k]?.scene_tags||''}`).join(',');
    if(key !== multiPreviewKey){
      multiPreviewKey = key;
      multiGrid.innerHTML = enabledLayouts.map(([id, p]) => {
        const zIds = Object.keys(scenesCache).filter(sid => !isSceneHidden(sid) && sceneMatchesLayoutFor(scenesCache[sid], id));
        const activeIds = zIds.filter(sid => isSceneLiveActive(scenesCache[sid]));
        const preferred = lastDeckScene[id];
        let chosenActive = null;
        if(preferred && activeIds.includes(preferred)){
          chosenActive = preferred;
        }else if(activeIds.length){
          chosenActive = activeIds.sort((a,b)=>{
            const ca = Object.values(scenesCache[a]?.virtuals||{}).filter(e=>e&&e.type).length;
            const cb = Object.values(scenesCache[b]?.virtuals||{}).filter(e=>e&&e.type).length;
            return cb - ca;
          })[0];
        }
        const allTags = [...new Set(zIds.flatMap(sid => getSceneTags(scenesCache[sid])))].sort();
        const activeTag = allTags.includes(deckTagFilter[id]) ? deckTagFilter[id] : '';
        const tagBarHtml = allTags.length
          ? `<div class="tag-bar"><button class="tag-pill ${!activeTag?'on':''}" data-tag="">All</button>${allTags.map(t => `<button class="tag-pill ${activeTag===t?'on':''}" data-tag="${escHtml(t)}">${escHtml(t)}</button>`).join('')}</div>`
          : '';
        const scyc = getDeckSceneCycle(id);
        const zHtml = zIds.length
          ? zIds.map(sid => {
              const s = scenesCache[sid];
              const activeEffs = Object.entries(s.virtuals || {}).filter(([,eff]) => eff && eff.type);
              const segStyles = [...new Set(activeEffs.map(([,eff]) => sceneSegmentStyle(eff)))];
              const strip = segStyles.length ? segStyles.map(st => `<span style="${st}"></span>`).join('') : '<span style="background:var(--panel2);opacity:.4"></span>';
              const isCur = sid === chosenActive;
              const tags = getSceneTags(s);
              const hide = activeTag && !tags.includes(activeTag);
              const inPool = !scyc.pool || scyc.pool.has(sid);
              return `<button class="scene ${isCur?'cur':''}" data-id="${escHtml(sid)}" data-tags="${escHtml(tags.join(','))}" data-fullname="${escHtml(s.name || sid)}" title="${escHtml(s.name || sid)}" ${hide?'hidden':''}><div class="scene-head"><span class="scene-name">${escHtml(s.name || sid)}</span><span class="cyc-pick ${inPool?'on':''}" data-scyc="${escHtml(sid)}" title="Include in scene cycle">${inPool?'&#10003;':''}</span></div>${renderTagBadges(tags)}<div class="scene-strip">${strip}</div></button>`;
            }).join('')
          : '<span class="status">No scenes for this layout</span>';
        const dc = getDeckCycle(id);
        const palHtml = PALETTES.map((pal, pi) => {
          const inPool = dc.pool.has(pal.name);
          const isCur = dc.pal?.name === pal.name;
          return `
          <div class="swatch ${isCur?'cur':''}" data-pi="${pi}" title="${escHtml(pal.name)}">
            <span class="cyc-pick ${inPool?'on':''}" data-cyc="${pi}" title="Include in palette cycle">${inPool?'✓':''}</span>
            <div class="strip2">${pal.colors.map(c => `<span style="background:${c}"></span>`).join('')}</div>
            <div class="name">${escHtml(pal.name)}</div>
          </div>`;
        }).join('');
        const hitsHtml = HITS.map((h, hi) => `<button class="hit-btn" data-hi="${hi}">${escHtml(h.name)}</button>`).join('');
        let deckCollapsed = {};
        try{ deckCollapsed = JSON.parse(localStorage.getItem('ledfx_deck_collapsed') || '{}'); }catch(e){}
        const scCol = !!deckCollapsed[id + ':scenes'];
        const palCol = !!deckCollapsed[id + ':pal'];
        const outMode = deckOutMode[id] || '';
        return `
        <div class="lprev-card" data-deck="${escHtml(id)}">
          <div class="lprev-top">
            <div class="lprev-top-left">
              <div class="lprev-head">
                <span class="lprev-title" data-open-tab title="Click to open ${escHtml(p.name || id)} tab">${escHtml(p.name || id)}</span>
                <span class="status" data-meta></span>
              </div>
              <div class="lprev-bri"><input type="range" data-ctl="bri" min="0" max="100" value="80" title="Layout Brightness"><span class="lprev-bri-val" data-val="bri">80%</span></div>
            </div>
            <div class="lprev-out-btns">
              <button type="button" class="blackout-big ${outMode==='black'?'on':''}" data-deck-out="black" title="Blackout this layout">Blackout</button>
              <button type="button" class="whiteout-big ${outMode==='white'?'on':''}" data-deck-out="white" title="Whiteout this layout">Whiteout</button>
            </div>
          </div>
          <canvas data-open-tab title="Click to open ${escHtml(p.name || id)} tab"></canvas>
          <div class="lprev-sub"><span class="lprev-fold ${scCol?'collapsed':''}" data-fold-toggle="scenes"><span class="tri">&#9662;</span> Scenes</span></div>
          <div data-fold-body="scenes" class="${scCol?'lprev-box-collapsed':''}">
          ${tagBarHtml}
          <div class="lprev-scenes">${zHtml}</div>
          <div class="pal-cyc" style="margin-top:6px">
            <button class="tgl ${scyc.on?'on':''}" data-scyc-btn>${scyc.on?'Scene Cycle ON':'Scene Cycle OFF'}</button>
            <select data-scyc-div title="Scene switch interval">
              <option value="4b" ${scyc.div==='4b'?'selected':''}>1 Bar</option>
              <option value="8b" ${scyc.div==='8b'?'selected':''}>2 Bars</option>
              <option value="16b" ${scyc.div==='16b'?'selected':''}>4 Bars</option>
              <option value="32b" ${scyc.div==='32b'?'selected':''}>8 Bars</option>
              <option value="15s" ${scyc.div==='15s'?'selected':''}>15 s</option>
              <option value="30s" ${scyc.div==='30s'?'selected':''}>30 s</option>
              <option value="60s" ${scyc.div==='60s'?'selected':''}>60 s</option>
            </select>
            <button class="btn" data-scyc-all style="padding:5px 9px;font-size:11px" title="Include all scenes in cycle">All</button>
            <button class="btn" data-scyc-none style="padding:5px 9px;font-size:11px" title="Clear scene cycle selection">None</button>
            <label class="status" style="display:inline-flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" data-scyc-rand ${scyc.rand?'checked':''}> Shuffle</label>
          </div>
          </div>
          <div class="lprev-sub" style="display:flex;align-items:center;justify-content:space-between"><span class="lprev-fold ${palCol?'collapsed':''}" data-fold-toggle="pal"><span class="tri">&#9662;</span> Palette</span><button type="button" class="btn full-color-btn" data-full-color style="${deckFullColor[id]?`border-color:${deckFullColor[id]}`:''}" title="Apply a solid pure color to this layout"><span class="fc-dot" style="${deckFullColor[id]?`background:${deckFullColor[id]}`:''}"></span><span>Full Color</span></button></div>
          <div data-fold-body="pal" class="${palCol?'lprev-box-collapsed':''}">
          <div class="lprev-pal">${palHtml}</div>
          <div class="pal-cyc">
            <button class="tgl ${dc.on?'on':''}" data-cyc-btn>${dc.on?'Cycle ON':'Cycle OFF'}</button>
            <select data-cyc-mode title="Cycler mode">
              <option value="bpm_pal" ${dc.mode==='bpm_pal'?'selected':''}>BPM → Next Palette</option>
              <option value="bpm_rot" ${dc.mode==='bpm_rot'?'selected':''}>BPM → Rotate Colors</option>
              <option value="audio_pal" ${dc.mode==='audio_pal'?'selected':''}>Audio Peak → Next Palette</option>
              <option value="audio_rot" ${dc.mode==='audio_rot'?'selected':''}>Audio Peak → Rotate Colors</option>
            </select>
            <select data-cyc-div title="BPM divider">
              <option value="0.5" ${dc.div===0.5?'selected':''}>1/2 Beat</option>
              <option value="1" ${dc.div===1?'selected':''}>1 Beat</option>
              <option value="2" ${dc.div===2?'selected':''}>2 Beats</option>
              <option value="4" ${dc.div===4?'selected':''}>1 Bar (4 Beats)</option>
              <option value="8" ${dc.div===8?'selected':''}>2 Bars (8 Beats)</option>
              <option value="16" ${dc.div===16?'selected':''}>4 Bars (16 Beats)</option>
            </select>
            <button class="btn" data-cyc-all style="padding:5px 9px;font-size:11px" title="Include all palettes in cycle">All</button>
            <button class="btn" data-cyc-none style="padding:5px 9px;font-size:11px" title="Clear cycle selection">None</button>
          </div>
          <div class="status" style="margin-top:6px;line-height:1.45;font-size:10px">
            <b>BPM</b>: steady beat timer &middot; <b>Audio Peak</b>: bass spike trigger &middot; <b>Next Palette</b>: next pooled palette &middot; <b>Rotate Colors</b>: shifts current palette stops.
          </div>
          </div>
          <div class="lprev-sub">Controls</div>
          <div class="lprev-sliders">
            <div class="gcard"><label><span>Speed</span><span data-val="spd">50%</span></label><input type="range" data-ctl="spd" min="0" max="100" value="50"></div>
            <div class="gcard"><label><span>Sens</span><span data-val="sns">50%</span></label><input type="range" data-ctl="sns" min="0" max="100" value="50"></div>
          </div>
          <div class="lprev-sub">Hits</div>
          <div class="lprev-hits">${hitsHtml}</div>
        </div>`;
      }).join('');
      multiCardRefs = {};
      multiGrid.querySelectorAll('.lprev-card').forEach(card => {
        const deckId = card.dataset.deck;
        multiCardRefs[deckId] = {
          canvas: card.querySelector('canvas'),
          meta: card.querySelector('[data-meta]'),
        };
        card.querySelectorAll('[data-deck-out]').forEach(ob => ob.addEventListener('click', e => {
          e.stopPropagation();
          toggleDeckOutMode(deckId, ob.dataset.deckOut, card);
        }));
        card.querySelectorAll('[data-open-tab]').forEach(el => el.addEventListener('click', () => {
          const tabBtn = [...document.querySelectorAll('#tabs button[data-t="main"]')].find(b => (b.dataset.deck || '') === deckId);
          if(tabBtn) tabBtn.click();
        }));
        card.querySelectorAll('[data-fold-toggle]').forEach(ft => ft.addEventListener('click', e => {
          e.stopPropagation();
          const which = ft.dataset.foldToggle;
          const body = card.querySelector(`[data-fold-body="${which}"]`);
          const nowCol = !ft.classList.contains('collapsed');
          ft.classList.toggle('collapsed', nowCol);
          if(body) body.classList.toggle('lprev-box-collapsed', nowCol);
          try{
            const map = JSON.parse(localStorage.getItem('ledfx_deck_collapsed') || '{}');
            map[deckId + ':' + which] = nowCol;
            localStorage.setItem('ledfx_deck_collapsed', JSON.stringify(map));
          }catch(err){}
        }));
        card.querySelectorAll('.tag-bar .tag-pill').forEach(tb => tb.addEventListener('click', e => {
          e.stopPropagation();
          const tag = tb.dataset.tag || '';
          deckTagFilter[deckId] = tag;
          applyDeckTagFilter(card, tag);
        }));
        card.querySelectorAll('.lprev-scenes .scene').forEach(btn => {
          btn.addEventListener('click', e => {
            e.stopPropagation();
            if(e.target.closest('.cyc-pick')) return;
            activateScene(btn.dataset.id, deckId);
          });
        });
        card.querySelectorAll('.lprev-scenes .cyc-pick').forEach(pk => pk.addEventListener('click', e => {
          e.stopPropagation();
          const scyc = getDeckSceneCycle(deckId);
          if(!scyc.pool) scyc.pool = new Set([...card.querySelectorAll('.lprev-scenes .scene')].map(b => b.dataset.id));
          const sid = pk.dataset.scyc;
          if(scyc.pool.has(sid)) scyc.pool.delete(sid);
          else scyc.pool.add(sid);
          const on = scyc.pool.has(sid);
          pk.classList.toggle('on', on);
          pk.textContent = on ? '✓' : '';
        }));
        card.querySelector('[data-full-color]')?.addEventListener('click', e => {
          e.stopPropagation();
          const btn = e.currentTarget;
          const curHex = deckFullColor[deckId] || getDeckCycle(deckId).pal?.colors?.[0] || '#ff0000';
          openPureColorPopover(btn, curHex, hex => {
            const pal = { name: `Full ${hex}`, colors: [hex, hex, hex, hex] };
            deckFullColor[deckId] = hex;
            getDeckCycle(deckId).pal = pal;
            const dot = btn.querySelector('.fc-dot');
            if(dot) dot.style.background = hex;
            btn.style.borderColor = hex;
            applyPalette(pal, false, deckId);
          });
        });
        card.querySelectorAll('.lprev-pal .swatch').forEach(sw => sw.addEventListener('click', e => {
          e.stopPropagation();
          if(e.target.closest('.cyc-pick')) return;
          const pal = PALETTES[Number(sw.dataset.pi)];
          getDeckCycle(deckId).pal = pal;
          applyPalette(pal, false, deckId);
        }));
        card.querySelectorAll('.lprev-pal .cyc-pick').forEach(pk => pk.addEventListener('click', e => {
          e.stopPropagation();
          const dc = getDeckCycle(deckId);
          const pal = PALETTES[Number(pk.dataset.cyc)];
          if(dc.pool.has(pal.name)) dc.pool.delete(pal.name);
          else dc.pool.add(pal.name);
          const on = dc.pool.has(pal.name);
          pk.classList.toggle('on', on);
          pk.textContent = on ? '✓' : '';
        }));
        const cycBtn = card.querySelector('[data-cyc-btn]');
        const cycMode = card.querySelector('[data-cyc-mode]');
        const cycDiv = card.querySelector('[data-cyc-div]');
        cycBtn?.addEventListener('click', e => {
          e.stopPropagation();
          const dc = getDeckCycle(deckId);
          dc.on = !dc.on;
          dc.nextAt = Date.now();
          cycBtn.classList.toggle('on', dc.on);
          cycBtn.textContent = dc.on ? 'Cycle ON' : 'Cycle OFF';
        });
        cycMode?.addEventListener('change', e => { getDeckCycle(deckId).mode = e.target.value; });
        cycDiv?.addEventListener('change', e => {
          const dc = getDeckCycle(deckId);
          dc.div = Number(e.target.value) || 1;
          dc.nextAt = Date.now();
        });
        card.querySelector('[data-cyc-all]')?.addEventListener('click', e => {
          e.stopPropagation();
          const dc = getDeckCycle(deckId);
          dc.pool = new Set(PALETTES.map(p => p.name));
          card.querySelectorAll('.lprev-pal .cyc-pick').forEach(pk => { pk.classList.add('on'); pk.textContent = '✓'; });
        });
        card.querySelector('[data-cyc-none]')?.addEventListener('click', e => {
          e.stopPropagation();
          getDeckCycle(deckId).pool.clear();
          card.querySelectorAll('.lprev-pal .cyc-pick').forEach(pk => { pk.classList.remove('on'); pk.textContent = ''; });
        });
        let zBriT, zSpdT, zSnsT;
        card.querySelector('[data-ctl="bri"]')?.addEventListener('input', e => {
          const v = Number(e.target.value);
          const lbl = card.querySelector('[data-val="bri"]'); if(lbl) lbl.textContent = v + '%';
          clearTimeout(zBriT); zBriT = setTimeout(() => setZoneBrightness(v / 100, deckId), 150);
        });
        card.querySelector('[data-ctl="spd"]')?.addEventListener('input', e => {
          const v = Number(e.target.value);
          const lbl = card.querySelector('[data-val="spd"]'); if(lbl) lbl.textContent = v + '%';
          clearTimeout(zSpdT); zSpdT = setTimeout(() => setSpeed(v / 100, deckId), 150);
        });
        card.querySelector('[data-ctl="sns"]')?.addEventListener('input', e => {
          const v = Number(e.target.value);
          const lbl = card.querySelector('[data-val="sns"]'); if(lbl) lbl.textContent = v + '%';
          clearTimeout(zSnsT); zSnsT = setTimeout(() => setSensitivity(v / 100, deckId), 150);
        });
        card.querySelector('[data-scyc-btn]')?.addEventListener('click', e => {
          e.stopPropagation();
          const scyc = getDeckSceneCycle(deckId);
          scyc.on = !scyc.on;
          scyc.nextAt = Date.now() + sceneIntervalMs(scyc.div);
          e.currentTarget.classList.toggle('on', scyc.on);
          e.currentTarget.textContent = scyc.on ? 'Scene Cycle ON' : 'Scene Cycle OFF';
        });
        card.querySelector('[data-scyc-all]')?.addEventListener('click', e => {
          e.stopPropagation();
          const scyc = getDeckSceneCycle(deckId);
          scyc.pool = new Set([...card.querySelectorAll('.lprev-scenes .scene')].map(b => b.dataset.id));
          card.querySelectorAll('.lprev-scenes .cyc-pick').forEach(pk => { pk.classList.add('on'); pk.textContent = '✓'; });
        });
        card.querySelector('[data-scyc-none]')?.addEventListener('click', e => {
          e.stopPropagation();
          getDeckSceneCycle(deckId).pool = new Set();
          card.querySelectorAll('.lprev-scenes .cyc-pick').forEach(pk => { pk.classList.remove('on'); pk.textContent = ''; });
        });
        card.querySelector('[data-scyc-div]')?.addEventListener('change', e => {
          e.stopPropagation();
          const scyc = getDeckSceneCycle(deckId);
          scyc.div = e.target.value;
          scyc.nextAt = Date.now() + sceneIntervalMs(scyc.div);
        });
        card.querySelector('[data-scyc-rand]')?.addEventListener('change', e => {
          e.stopPropagation();
          getDeckSceneCycle(deckId).rand = e.target.checked;
        });
        card.querySelectorAll('.lprev-hits .hit-btn').forEach(hb => {
          const h = HITS[Number(hb.dataset.hi)];
          hb.addEventListener('pointerdown', e => { e.stopPropagation(); hitDown(h, hb, deckId); });
          hb.addEventListener('pointerup', e => { e.stopPropagation(); hitUp(h, hb, deckId); });
          hb.addEventListener('pointerleave', () => hitUp(h, hb, deckId));
          hb.addEventListener('pointercancel', () => hitUp(h, hb, deckId));
        });
      });
    }
    const meta = $('#previewMeta');
    if(meta) meta.textContent = `${enabledLayouts.length} layout(s) · click a preview to open tab`;
    enabledLayouts.forEach(([id, p]) => {
      const ref = multiCardRefs[id];
      if(!ref) return;
      renderTubeCanvas(ref.canvas, ref.meta, p);
    });
    return;
  }
  if(multiGrid) multiGrid.hidden = true;
  if(singleCanvas){
    singleCanvas.hidden = false;
    const deckLayout = activeDeckId ? layoutsCache[activeDeckId] : null;
    renderTubeCanvas(singleCanvas, $('#previewMeta'), deckLayout);
  }
}

function renderTubeCanvas(canvas, meta, deckLayout){
  if(!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 640;
  const h = canvas.clientHeight || 180;
  if(canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)){
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  let devs = getTubeDevices();
  if(deckLayout){
    const allowedList = getLayoutDevices(deckLayout);
    const allowed = new Set(allowedList);
    devs = devs.filter(([id]) => allowed.has(id));
  }
  if(!devs.length){
    if(meta) meta.textContent = deckLayout ? 'no tubes assigned' : 'no tubes';
    ctx.fillStyle = '#74748c';
    ctx.font = '12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Connect to LedFx to preview live tube pixels', w / 2, h / 2);
    return;
  }

  const now = performance.now();
  const orderedVirtuals = viewMode === 'real' ? null : Object.entries(virtualsCache).sort((a, b) => {
    const dt = (virtualFrameAt[b[0]] || 0) - (virtualFrameAt[a[0]] || 0);
    if(Math.abs(dt) > 500) return dt;
    return (b[1]?.active ? 1 : 0) - (a[1]?.active ? 1 : 0) || dt;
  });

  function getTubePixelsFromVirtuals(devId, pixelCount){
    for(const [vid, virt] of orderedVirtuals){
      const vFrame = virtualFrames[vid];
      const vCount = vFrame ? Math.floor(vFrame.length / 3) : 0;
      if(!vCount || (now - (virtualFrameAt[vid] || 0) > 2000) || !Array.isArray(virt?.segments) || !virt.segments.length) continue;
      let totalPhys = 0;
      for(const seg of virt.segments) totalPhys += Math.max(0, (Number(seg[2]) || 0) - (Number(seg[1]) || 0) + 1);
      if(!totalPhys) continue;
      const vShape = virtualShapes[vid];
      const virtRows = Math.max(1, Number(virt?.config?.rows) || 1);
      const virtCols = totalPhys / virtRows;
      const fRows = Array.isArray(vShape) ? (Number(vShape[0]) || 1) : 1;
      const fCols = Array.isArray(vShape) ? (Number(vShape[1]) || vCount) : vCount;
      const use2D = virtRows > 1 && fRows > 1 && fRows * fCols === vCount && totalPhys % virtRows === 0;
      let offset = 0;
      let out = null;
      for(const seg of virt.segments){
        const sDev = seg[0], start = Number(seg[1]) || 0, end = Number(seg[2]) || 0, inv = !!seg[3];
        const segLen = Math.max(0, end - start + 1);
        if(sDev === devId && segLen > 0){
          if(!out){
            out = new Uint8Array(pixelCount * 3);
            for(let p = 0; p < out.length; p += 3){ out[p] = 20; out[p + 1] = 20; out[p + 2] = 32; }
          }
          for(let k = 0; k < segLen; k++){
            const dst = inv ? (end - k) : (start + k);
            if(dst >= 0 && dst < pixelCount){
              const doff = dst * 3;
              if(use2D){
                const vIdx = offset + k;
                const vr = Math.floor(vIdx / virtCols);
                const vc = vIdx % virtCols;
                const fr = Math.min(fRows - 1, Math.max(0, Math.round((vr + 0.5) * fRows / virtRows - 0.5)));
                const fc = Math.min(fCols - 1, Math.max(0, Math.round((vc + 0.5) * fCols / virtCols - 0.5)));
                const soff = (fr * fCols + fc) * 3;
                out[doff] = vFrame[soff];
                out[doff + 1] = vFrame[soff + 1];
                out[doff + 2] = vFrame[soff + 2];
              }else{
                const pos = (offset + k + 0.5) * (vCount / totalPhys) - 0.5;
                const i0 = Math.max(0, Math.min(vCount - 1, Math.floor(pos)));
                const i1 = Math.max(0, Math.min(vCount - 1, i0 + 1));
                const t = Math.max(0, Math.min(1, pos - i0));
                const s0 = i0 * 3, s1 = i1 * 3;
                out[doff] = (vFrame[s0] + (vFrame[s1] - vFrame[s0]) * t + 0.5) | 0;
                out[doff + 1] = (vFrame[s0 + 1] + (vFrame[s1 + 1] - vFrame[s0 + 1]) * t + 0.5) | 0;
                out[doff + 2] = (vFrame[s0 + 2] + (vFrame[s1 + 2] - vFrame[s0 + 2]) * t + 0.5) | 0;
              }
            }
          }
        }
        offset += segLen;
      }
      if(out) return { pixels: out, vid };
    }
    return null;
  }

  let streaming = 0, viaVirt = 0, simVid = '';
  const resolvedPixels = {};
  for(const [id, dev] of devs){
    const n = dev?.config?.pixel_count || 36;
    const directFresh = visFrames[id]?.length && (dev?.online !== false || (now - (visFrameAt[id] || 0) < 1500));
    if(viewMode === 'real'){
      if(directFresh){
        resolvedPixels[id] = visFrames[id];
        streaming++;
      }
    }else{
      const fallback = getTubePixelsFromVirtuals(id, n);
      if(fallback){
        resolvedPixels[id] = fallback.pixels;
        if(!simVid) simVid = fallback.vid;
        viaVirt++;
      }else if(directFresh){
        resolvedPixels[id] = visFrames[id];
        streaming++;
      }
    }
  }
  if(meta){
    if(!previewLive) meta.textContent = 'paused';
    else if(streaming) meta.textContent = `${streaming}/${devs.length} streaming`;
    else if(viaVirt) meta.textContent = `${viaVirt}/${devs.length} simulated (${simVid || 'offline'})`;
    else meta.textContent = `0/${devs.length} streaming`;
  }

  // Build physical layout items from active deck's Stage Grid (or global gridCells) if placed
  const activeGridCells = (deckLayout && deckLayout.grid_cells && Object.keys(deckLayout.grid_cells).length) ? deckLayout.grid_cells : gridCells;
  const tubeMap = Object.fromEntries(devs);
  const placedItems = [];
  const placedIds = new Set();
  for(const [key, cell] of Object.entries(activeGridCells)){
    if(!cell || !tubeMap[cell.deviceId]) continue;
    const [rr, cc] = key.split(',').map(Number);
    const dir = GRID_DIRS.find(x => x.id === cell.dir) || GRID_DIRS[0];
    placedItems.push({ id: cell.deviceId, dev: tubeMap[cell.deviceId], r: rr, c: cc, dir, flipX: isFlipped(cell.flipX), flipY: isFlipped(cell.flipY) });
    placedIds.add(cell.deviceId);
  }

  let items;
  if(placedItems.length){
    const minR = Math.min(...placedItems.map(x => x.r));
    const minC = Math.min(...placedItems.map(x => x.c));
    placedItems.forEach(x => { x.r -= minR; x.c -= minC; });
    const maxR = Math.max(...placedItems.map(x => x.r));
    const unplaced = devs.filter(([id]) => !placedIds.has(id));
    unplaced.forEach(([id, dev], i) => {
      placedItems.push({ id, dev, r: maxR + 1, c: i, dir: GRID_DIRS[2] });
    });
    items = placedItems;
  }else{
    items = devs.map(([id, dev], i) => ({ id, dev, r: 0, c: i, dir: GRID_DIRS[2] }));
  }

  const nRows = Math.max(1, Math.max(...items.map(x => x.r)) + 1);
  const nCols = Math.max(1, Math.max(...items.map(x => x.c)) + 1);
  const padX = 12, padY = 10, gapX = 12, gapY = 12;
  const slotW = Math.max(44, (w - padX * 2 - gapX * (nCols - 1)) / nCols);
  const slotH = Math.max(44, (h - padY * 2 - gapY * (nRows - 1)) / nRows);

  items.forEach(({ id, dev, r: gr, c: gc, dir, flipX, flipY }) => {
    const sx = padX + gc * (slotW + gapX);
    const sy = padY + gr * (slotH + gapY);
    const online = dev?.online !== false;
    const pixels = resolvedPixels[id];
    const pCount = pixels ? Math.floor(pixels.length / 3) : 0;
    const n = pCount || dev?.config?.pixel_count || 36;
    const sides = (n >= 4 && n % 4 === 0) ? 4 : 1;
    const segsPerSide = Math.max(1, Math.floor(n / sides));
    const horiz = !!dir.horiz;
    const matCols = horiz ? segsPerSide : sides;
    const matRows = horiz ? sides : segsPerSide;

    const labelH = 14;
    const availW = Math.max(24, slotW - 4);
    const availH = Math.max(24, slotH - labelH - 4);
    const cellW = horiz
      ? Math.max(4, Math.min(56, availW / matCols))
      : Math.max(3, Math.min(22, availW / matCols, (availH / matRows) * 0.9));
    const cellH = horiz
      ? Math.max(3, Math.min(18, availH / matRows, cellW * 0.65))
      : Math.max(4, Math.min(36, availH / matRows));
    const bodyW = cellW * matCols;
    const bodyH = cellH * matRows;
    const bx = Math.round(sx + (slotW - bodyW) / 2);
    const by = Math.round(sy + (availH - bodyH) / 2);

    // Tube housing
    ctx.fillStyle = '#0c0d14';
    ctx.strokeStyle = online ? '#34344a' : '#6b2334';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx - 3, by - 3, bodyW + 6, bodyH + 6, 5);
    ctx.fill();
    ctx.stroke();

    // 4x9 (or 9x4 horizontal) segment matrix
    const segGapX = cellW >= 5 ? 1 : 0.4;
    const segGapY = cellH >= 5 ? 1 : 0.4;
    const drawW = Math.max(1, cellW - segGapX);
    const drawH = Math.max(1, cellH - segGapY);
    let lastRgb = -1;
    for(let s = 0; s < sides; s++){
      for(let k = 0; k < segsPerSide; k++){
        const idx = s * segsPerSide + k;
        let cr = 24, cg = 24, cb = 38;
        if(idx < pCount){
          const off = idx * 3;
          cr = pixels[off]; cg = pixels[off + 1]; cb = pixels[off + 2];
        }
        const rgb = (cr << 16) | (cg << 8) | cb;
        if(rgb !== lastRgb){
          lastRgb = rgb;
          ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        }
        const posAlong = dir.inv ? (segsPerSide - 1 - k) : k;
        let mc = horiz ? posAlong : s;
        let mr = horiz ? s : posAlong;
        if(flipX) mc = matCols - 1 - mc;
        if(flipY) mr = matRows - 1 - mr;
        ctx.fillRect(bx + mc * cellW + segGapX * 0.5, by + mr * cellH + segGapY * 0.5, drawW, drawH);
      }
    }

    // Start-of-tube marker (LED 0 edge, independent of Flip X/Y)
    ctx.fillStyle = '#38bdf8';
    if(horiz){
      const mx = dir.inv ? (bx + bodyW + 1) : (bx - 3.5);
      ctx.fillRect(mx, by - 1, 2.5, bodyH + 2);
    }else{
      const my = dir.inv ? (by + bodyH + 1) : (by - 3.5);
      ctx.fillRect(bx - 1, my, bodyW + 2, 2.5);
    }

    // Label
    const label = (dev?.config?.name || id).slice(0, 12);
    ctx.fillStyle = online ? '#b6b6ca' : '#ff6b86';
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(online ? label : `${label} (off)`, sx + slotW / 2, by + bodyH + 5);
  });
}

let layoutPreviewRaf = 0;
function scheduleLayoutPreview(){
  if(layoutPreviewRaf || !isLayoutPreviewVisible()) return;
  layoutPreviewRaf = requestAnimationFrame(()=>{
    layoutPreviewRaf = 0;
    drawLayoutPreview();
  });
}

function drawLayoutPreview(){
  const canvas = $('#layoutPreviewCanvas');
  if(!canvas || !isLayoutPreviewVisible()) return;
  const meta = $('#layoutPreviewMeta');
  if(gridCells && Object.keys(gridCells).length){
    const placedIds = [...new Set(Object.values(gridCells).map(c => c?.deviceId).filter(Boolean))];
    const previewLayout = {
      devices: placedIds,
      grid_cols: gridCols,
      grid_rows: gridRows,
      grid_cells: gridCells,
    };
    renderTubeCanvas(canvas, meta, previewLayout);
    return;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 640;
  const h = canvas.clientHeight || 190;
  if(canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)){
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const selId = $('#arrVirtSel')?.value || Object.keys(virtualsCache)[0] || '';
  const virt = virtualsCache[selId];
  if(!virt){
    if(meta) meta.textContent = 'no virtual selected';
    ctx.fillStyle = '#74748c';
    ctx.font = '12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Connect to LedFx to preview the active virtual layout', w / 2, h / 2);
    return;
  }

  const segs = Array.isArray(virt.segments) ? virt.segments : [];
  const rows = Math.max(1, Number(virt.config?.rows) || 1);
  const grouping = Math.max(1, Number(virt.config?.grouping) || 1);
  if(meta) meta.textContent = `${selId} · ${rows} row${rows>1?'s':''} · grouping=${grouping} · ${segs.length} seg${segs.length!==1?'s':''}`;

  if(!segs.length){
    ctx.fillStyle = '#74748c';
    ctx.font = '12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Virtual "${selId}" has no segments mapped`, w / 2, h / 2);
    return;
  }

  const perRow = Math.max(1, Math.ceil(segs.length / rows));
  const padX = 12, padY = 10, gapX = 10, gapY = 10;
  const cellW = Math.max(40, (w - padX * 2 - gapX * (perRow - 1)) / perRow);
  const cellH = Math.max(24, (h - padY * 2 - gapY * (rows - 1)) / rows);

  const totalPhys = segs.reduce((acc, s) => acc + Math.max(0, (Number(s[2]) || 0) - (Number(s[1]) || 0) + 1), 0) || 1;
  const vFrame = virtualFrames[selId];
  let vOffset = 0;

  segs.forEach((seg, i) => {
    const devId = seg[0], start = Number(seg[1]) || 0, end = Number(seg[2]) || 0, inv = !!seg[3];
    const r = Math.floor(i / perRow), c = i % perRow;
    const x = padX + c * (cellW + gapX);
    const y = padY + r * (cellH + gapY);

    ctx.fillStyle = '#10101a';
    ctx.strokeStyle = inv ? '#8c6b2f' : '#2d2d42';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, cellW, cellH, 6);
    ctx.fill();
    ctx.stroke();

    const stripY = y + 6;
    const stripH = Math.max(6, cellH - 24);
    const stripX = x + 6;
    const stripW = Math.max(12, cellW - 12);
    const frame = visFrames[devId];
    const fCount = frame ? Math.floor(frame.length / 3) : 0;
    const vCount = vFrame ? Math.floor(vFrame.length / 3) : 0;
    const count = Math.max(1, end - start + 1);
    const pxW = stripW / count;
    const drawPxW = Math.max(1, pxW - (pxW > 3 ? 0.6 : 0));
    let lastRgb = -1;
    for(let k = 0; k < count; k++){
      let cr = 24, cg = 24, cb = 38;
      if(fCount){
        const srcIdx = inv ? (end - k) : (start + k);
        if(srcIdx >= 0 && srcIdx < fCount){
          const off = srcIdx * 3;
          cr = frame[off]; cg = frame[off + 1]; cb = frame[off + 2];
        }
      }else if(vCount){
        const pos = (vOffset + k + 0.5) * (vCount / totalPhys) - 0.5;
        const i0 = Math.max(0, Math.min(vCount - 1, Math.floor(pos)));
        const i1 = Math.max(0, Math.min(vCount - 1, i0 + 1));
        const t = Math.max(0, Math.min(1, pos - i0));
        const s0 = i0 * 3, s1 = i1 * 3;
        cr = (vFrame[s0] + (vFrame[s1] - vFrame[s0]) * t + 0.5) | 0;
        cg = (vFrame[s0 + 1] + (vFrame[s1 + 1] - vFrame[s0 + 1]) * t + 0.5) | 0;
        cb = (vFrame[s0 + 2] + (vFrame[s1 + 2] - vFrame[s0 + 2]) * t + 0.5) | 0;
      }
      const rgb = (cr << 16) | (cg << 8) | cb;
      if(rgb !== lastRgb){
        lastRgb = rgb;
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      }
      ctx.fillRect(stripX + k * pxW, stripY, drawPxW, stripH);
    }
    vOffset += count;

    const name = (devicesCache[devId]?.config?.name || devId).slice(0, 12);
    ctx.fillStyle = '#c5c5d8';
    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${name} [${start}-${end}]${inv ? ' ◀' : ' ▶'}`, x + 6, y + cellH - 4);
  });
}

$('#arrVirtSel')?.addEventListener('change', () => scheduleLayoutPreview());

window.addEventListener('resize', () => {
  if(isPreviewVisible()) scheduleTubePreview();
  if(isLayoutPreviewVisible()) scheduleLayoutPreview();
});

renderMacros();
renderPalettes();
scheduleTubePreview();
if(HOST) connect();
