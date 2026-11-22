let backendActiveSceneId = '';
function renderScenes(){
  const el = $('#scenes');
  const allIds = Object.keys(scenesCache);
  if(!allIds.length){ el.innerHTML = '<div class="empty">No scenes saved in LedFx yet.</div>'; return; }
  const ids = allIds.filter(id => !isSceneHidden(id) && sceneMatchesLayout(scenesCache[id]));
  if(!ids.length){
    el.innerHTML = '<div class="empty">No scenes match this layout tag. Click "All Scenes" to show everything.</div>';
    return;
  }
  const activeIds = ids.filter(id => isSceneLiveActive(scenesCache[id]));
  const deckLast = activeDeckId ? lastDeckScene[activeDeckId] : lastScene;
  let chosenActive = null;
  if(deckLast && activeIds.includes(deckLast)){
    chosenActive = deckLast;
  }else if(!activeDeckId && backendActiveSceneId && activeIds.includes(backendActiveSceneId)){
    chosenActive = backendActiveSceneId;
  }else if(activeIds.length){
    chosenActive = activeIds.sort((a,b)=>{
      const ca = Object.values(scenesCache[a]?.virtuals||{}).filter(e=>e&&e.type).length;
      const cb = Object.values(scenesCache[b]?.virtuals||{}).filter(e=>e&&e.type).length;
      return cb - ca;
    })[0];
  }
  if(chosenActive){
    syncSceneDisplay(chosenActive);
    if(activeDeckId) lastDeckScene[activeDeckId] = chosenActive;
  }
  if(typeof renderSceneEditor === 'function' && !cloningVirtualInEditor && !Object.keys(sceneDraftVirtuals).length){
    const edTarget = activeDeckId ? (chosenActive || '') : '';
    renderSceneEditor(edTarget);
  }
  el.innerHTML = ids.map(id => {
    const s = scenesCache[id];
    const vEntries = Object.entries(s.virtuals || {});
    const activeEffs = vEntries.filter(([,eff]) => eff && eff.type);
    const types = [...new Set(activeEffs.map(([,eff]) => eff.type))];
    const summary = types.length
      ? (types.length <= 2 ? types.join(' + ') : `${types[0]} +${types.length - 1}`) + ` · ${activeEffs.length}v`
      : 'no active effects';
    const segStyles = [...new Set(activeEffs.map(([,eff]) => sceneSegmentStyle(eff)))];
    const strip = segStyles.length
      ? segStyles.map(st => `<span style="${st}"></span>`).join('')
      : '<span style="background:var(--panel2);opacity:.4"></span>';
    const tip = activeEffs.length
      ? activeEffs.map(([vid, eff]) => `${vid}: ${eff.preset ? `${eff.type} (${eff.preset})` : eff.type}`).join('\n')
      : 'No active effects in this scene';
    const isCur = id === chosenActive;
    const tags = getSceneTags(s);
    const activePool = activeDeckId ? getDeckSceneCycle(activeDeckId).pool : sceneCycleSelected;
    const inPool = !activePool || activePool.has(id);
    return `<button class="scene ${isCur?'cur':''}" data-id="${escHtml(id)}" data-tags="${escHtml(tags.join(','))}" data-fullname="${escHtml(s.name || id)}" title="${escHtml(tip)}">
      <div class="scene-head"><span class="scene-name">${escHtml(s.name || id)}</span><span class="cyc-pick ${inPool?'on':''}" data-scyc="${escHtml(id)}" title="Include in scene cycle">${inPool?'&#10003;':''}</span></div>
      <div class="scene-meta">${escHtml(summary)}</div>
      ${renderTagBadges(tags)}
      <div class="scene-strip">${strip}</div>
    </button>`;
  }).join('');
  el.querySelectorAll('.scene').forEach(b => {
    b.addEventListener('click', e => {
      if(e.target.closest('.cyc-pick')) return;
      activateScene(b.dataset.id);
    });
  });
  el.querySelectorAll('.cyc-pick[data-scyc]').forEach(pk => pk.addEventListener('click', e => {
    e.stopPropagation();
    const sid = pk.dataset.scyc;
    if(activeDeckId){
      const scyc = getDeckSceneCycle(activeDeckId);
      if(!scyc.pool) scyc.pool = new Set(getSceneCycleTargetIds(activeDeckId));
      if(scyc.pool.has(sid)) scyc.pool.delete(sid);
      else scyc.pool.add(sid);
      multiPreviewKey = '';
    }else{
      if(!sceneCycleSelected) sceneCycleSelected = new Set(Object.keys(scenesCache || {}));
      if(sceneCycleSelected.has(sid)) sceneCycleSelected.delete(sid);
      else sceneCycleSelected.add(sid);
      saveSceneCyclePool();
    }
    renderScenes();
    if(typeof syncSceneCycleUI === 'function') syncSceneCycleUI();
  }));
  if(typeof scheduleTubePreview === 'function') scheduleTubePreview();
  if(typeof syncDropQueueUI === 'function') syncDropQueueUI();
}

async function loadScenes(){
  const el = $('#scenes');
  try{
    const data = await api('/scenes');
    const scenes = data.scenes || data;
    scenesCache = scenes || {};
    backendActiveSceneId = data.active_scene_id || '';
    if(Object.keys(scenesCache).length){
      let pruned = false;
      for(const sid of [...hiddenScenes]){
        if(!(sid in scenesCache)){ hiddenScenes.delete(sid); pruned = true; }
      }
      if(pruned) saveHiddenScenes();
    }
    multiPreviewKey = '';
    renderScenes();
  }catch(e){ el.innerHTML = `<div class="empty">Failed to load scenes: ${e.message}</div>`; }
}

const lastDeckScene = {};
const activePalettePatch = {};
const sceneActivateTokens = {};
let cloningVirtualInEditor = false;
async function activateScene(id, deckId, opts){
  if(guardLock()) return;
  if(!opts?.forceNow && typeof tryQueueDropScene === 'function' && tryQueueDropScene(id, deckId)) return;
  if(typeof whiteoutOn !== 'undefined' && whiteoutOn){
    whiteoutOn = false;
    whiteoutSnap = null;
    if(typeof syncWhiteoutUI === 'function') syncWhiteoutUI();
  }
  const targetDeck = deckId || activeDeckId || '';
  const scopeKey = targetDeck || '__global__';
  const tok = (sceneActivateTokens[scopeKey] = (sceneActivateTokens[scopeKey] || 0) + 1);
  for(const vid of Object.keys(scenesCache[id]?.virtuals || {})) delete activePalettePatch[vid];
  await quantWait(S.trans==='Quantize'?(S.qnt==='Now'?'Bar':S.qnt):'Now');
  if(sceneActivateTokens[scopeKey] !== tok) return;
  if(targetDeck){
    lastDeckScene[targetDeck] = id;
    if(typeof getDeckCycle === 'function') getDeckCycle(targetDeck).pal = null;
  }
  if(!deckId || deckId === activeDeckId) syncSceneDisplay(id);
  document.querySelectorAll('#scenes .scene').forEach(b=>b.classList.toggle('cur',b.dataset.id===id));
  document.querySelectorAll('.lprev-card').forEach(card=>{
    const cid = card.dataset.deck;
    if(targetDeck ? cid === targetDeck : card.querySelector(`.lprev-scenes .scene[data-id="${CSS.escape(id)}"]`)){
      card.querySelectorAll('.lprev-scenes .scene').forEach(b=>b.classList.toggle('cur',b.dataset.id===id));
      if(!targetDeck && cid && typeof getDeckCycle === 'function') getDeckCycle(cid).pal = null;
    }
  });
  if(typeof syncPaletteDisplay === 'function') syncPaletteDisplay();
  try{
    await api('/scenes', {method:'PUT', body: JSON.stringify({id, action:'activate'})});
    if(sceneActivateTokens[scopeKey] !== tok) return;
    toast('Scene activated');
    await loadVirtuals();
    if(sceneActivateTokens[scopeKey] !== tok) return;
    if(typeof restoreSceneCtl === 'function') await restoreSceneCtl(id, deckId);
    if(sceneActivateTokens[scopeKey] !== tok) return;
    if(typeof blackoutOn !== 'undefined' && blackoutOn && typeof applyBlackoutToVirtuals === 'function'){
      await applyBlackoutToVirtuals(Object.keys(scenesCache[id]?.virtuals || {}));
    }
    if(sceneActivateTokens[scopeKey] !== tok) return;
    if(typeof renderSceneEditor === 'function' && activeDeckId) renderSceneEditor(id);
  }catch(e){ toast('Scene failed: ' + e.message, true); }
}

$('#updateSceneBtn').addEventListener('click', async ()=>{
  if(guardLock()) return;
  if(activeDeckId && editingSceneId && editingSceneId === lastScene && Object.keys(sceneDraftVirtuals).length){
    await saveEditedScene(false);
    return;
  }
  if(!lastScene || lastScene === '—' || !scenesCache[lastScene]){
    toast('Select or activate a scene first', true);
    return;
  }
  const sceneName = scenesCache[lastScene].name || lastScene;
  if(!confirm(`Overwrite scene "${sceneName}" with current live effects?`)) return;
  try{
    const existing = scenesCache[lastScene].virtuals || {};
    const hasTracked = Object.values(existing).some(e => e && (e.type || e.action === 'activate'));
    if(!hasTracked){
      await api('/scenes', {method:'POST', body: JSON.stringify({id:lastScene, snapshot:true})});
    }else{
      const vData = await api('/virtuals');
      const liveV = vData.virtuals || {};
      const merged = {};
      for(const [vid, oldEntry] of Object.entries(existing)){
        const act = oldEntry?.action;
        if(act === 'ignore' || act === 'stop' || act === 'forceblack' || (!act && !oldEntry?.type)){
          merged[vid] = oldEntry;
          continue;
        }
        const eff = liveV[vid]?.effect;
        merged[vid] = eff && eff.type
          ? {action:'activate', type:eff.type, config:eff.config || {}}
          : {action:'stop'};
      }
      await api('/scenes', {method:'POST', body: JSON.stringify({id:lastScene, virtuals:merged})});
    }
    toast(`Updated scene "${sceneName}"`);
    await loadScenes();
  }catch(e){
    toast('Update scene failed: ' + e.message, true);
  }
});

// ---- Layout Tab Scene / Effect Settings Editor ----
let editingSceneId = '', sceneDraftVirtuals = {}, sceneReplacedVirtuals = new Set();
const SE_SKIP_KEYS = new Set(['diag', 'test', 'dump', 'advanced']);

function resolveGradientCss(val){
  if(typeof val !== 'string') return 'linear-gradient(90deg, #ff0000, #0000ff)';
  const g = LEDFX_GRADIENTS[val] || val.trim();
  return /^(#|rgb|hsl|linear-gradient|radial-gradient)/i.test(g) ? g : 'linear-gradient(90deg, #ff0000, #0000ff)';
}

function parseGradientStops(raw){
  const resolved = String(LEDFX_GRADIENTS[raw] || raw || '').trim();
  const rgbToHex = (r, g, b) => '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(Number(x)))).toString(16).padStart(2, '0')).join('');
  if(/^#[0-9a-f]{6}$/i.test(resolved)) return [{color: resolved.toLowerCase(), pos: 0}, {color: resolved.toLowerCase(), pos: 100}];
  const stops = [];
  const re = /(#[0-9a-f]{6}|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)|rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\))(?:\s+([\d.]+)%)?/gi;
  let m;
  while((m = re.exec(resolved)) !== null){
    let col = m[1].toLowerCase();
    if(col.startsWith('rgb')){
      const nums = col.match(/\d+/g);
      if(nums && nums.length >= 3) col = rgbToHex(nums[0], nums[1], nums[2]);
    }
    stops.push({ color: col, pos: m[2] !== undefined ? Math.round(Number(m[2])) : null });
  }
  if(!stops.length) return [{color:'#ff0000', pos:0}, {color:'#0000ff', pos:100}];
  if(stops.length === 1) return [{color: stops[0].color, pos: 0}, {color: stops[0].color, pos: 100}];
  return stops.map((s, i) => ({
    color: s.color,
    pos: s.pos !== null ? Math.max(0, Math.min(100, s.pos)) : Math.round((i / (stops.length - 1)) * 100),
  }));
}
function buildGradientString(stops){
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  return `linear-gradient(90deg, ${sorted.map(s => `${s.color} ${s.pos.toFixed(2)}%`).join(', ')})`;
}
function renderGradStopsHtml(stops){
  return stops.map((s, idx) => `<span class="se-gstop" data-gstop="${idx}">
    <input type="color" data-gs-col value="${escHtml(s.color)}" title="Stop color" />
    <input type="number" data-gs-pos min="0" max="100" value="${s.pos}" title="Position %" /><span style="font-size:10px;color:var(--muted)">%</span>
    ${stops.length > 2 ? `<button type="button" data-gs-del title="Remove stop">&times;</button>` : ''}
  </span>`).join('');
}
function sampleGradientAt(stops, pct){
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  if(!sorted.length) return '#ffffff';
  if(pct <= sorted[0].pos) return sorted[0].color;
  if(pct >= sorted[sorted.length - 1].pos) return sorted[sorted.length - 1].color;
  for(let i = 0; i < sorted.length - 1; i++){
    const a = sorted[i], b = sorted[i + 1];
    if(pct >= a.pos && pct <= b.pos){
      const t = (b.pos === a.pos) ? 0 : (pct - a.pos) / (b.pos - a.pos);
      const pa = [parseInt(a.color.slice(1,3),16), parseInt(a.color.slice(3,5),16), parseInt(a.color.slice(5,7),16)];
      const pb = [parseInt(b.color.slice(1,3),16), parseInt(b.color.slice(3,5),16), parseInt(b.color.slice(5,7),16)];
      return '#' + [0,1,2].map(k => Math.round(pa[k] + (pb[k] - pa[k]) * t).toString(16).padStart(2, '0')).join('');
    }
  }
  return sorted[0].color;
}
function drawGradCanvas(canvas, stops, activeIdx, hoverIdx){
  if(!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if(!rect.width || !rect.height) return;
  const W = rect.width, H = rect.height;
  const cw = Math.round(W * dpr), ch = Math.round(H * dpr);
  if(canvas.width !== cw || canvas.height !== ch){ canvas.width = cw; canvas.height = ch; }
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const padX = 10, plotW = Math.max(10, W - padX * 2);
  const barH = 24, curveTop = 30, curveH = H - curveTop - 8;
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);

  // Colormap strip
  const grad = ctx.createLinearGradient(padX, 0, padX + plotW, 0);
  sorted.forEach(s => grad.addColorStop(Math.max(0, Math.min(1, s.pos / 100)), s.color));
  ctx.fillStyle = grad;
  ctx.fillRect(padX, 4, plotW, barH - 4);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.strokeRect(padX + 0.5, 4.5, plotW - 1, barH - 5);

  // RGB + Lightness curves
  const steps = Math.max(40, Math.min(180, Math.round(plotW / 2)));
  const curves = [[], [], [], []]; // R, G, B, Luma
  for(let i = 0; i <= steps; i++){
    const pct = (i / steps) * 100;
    const hex = sampleGradientAt(sorted, pct);
    const r = parseInt(hex.slice(1,3), 16) / 255;
    const g = parseInt(hex.slice(3,5), 16) / 255;
    const b = parseInt(hex.slice(5,7), 16) / 255;
    const [, , l] = hexToHsl(hex);
    curves[0].push(r); curves[1].push(g); curves[2].push(b); curves[3].push(l / 100);
  }
  const cCols = ['rgba(244,63,94,0.55)', 'rgba(69,212,131,0.55)', 'rgba(56,189,248,0.55)', 'rgba(255,255,255,0.85)'];
  curves.forEach((arr, ci) => {
    ctx.beginPath();
    ctx.strokeStyle = cCols[ci];
    ctx.lineWidth = ci === 3 ? 1.8 : 1.1;
    arr.forEach((v, i) => {
      const x = padX + (i / steps) * plotW;
      const y = curveTop + (1 - v) * curveH;
      if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  // Draggable stop pins & curve nodes
  stops.forEach((s, idx) => {
    const x = padX + (s.pos / 100) * plotW;
    const [, , l] = hexToHsl(s.color);
    const y = curveTop + (1 - l / 100) * curveH;
    const isAct = idx === activeIdx || idx === hoverIdx;
    ctx.strokeStyle = isAct ? '#ffffff' : 'rgba(255,255,255,0.28)';
    ctx.lineWidth = isAct ? 1.5 : 1;
    ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x, H - 4); ctx.stroke();

    // Top colormap marker
    ctx.fillStyle = s.color;
    ctx.strokeStyle = isAct ? '#f0a336' : '#ffffff';
    ctx.lineWidth = isAct ? 2 : 1.2;
    ctx.beginPath(); ctx.arc(x, 14, isAct ? 5.5 : 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // Curve lightness node
    ctx.beginPath(); ctx.arc(x, y, isAct ? 6 : 4.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  });

  // Hover / drag tooltip pill
  const tipIdx = activeIdx >= 0 ? activeIdx : hoverIdx;
  if(tipIdx >= 0 && stops[tipIdx]){
    const ts = stops[tipIdx];
    const [, , tl] = hexToHsl(ts.color);
    const tx = padX + (ts.pos / 100) * plotW;
    const ty = curveTop + (1 - tl / 100) * curveH;
    const txt = `${ts.color.toUpperCase()} · ${Math.round(ts.pos)}% · Bright ${Math.round(tl)}%`;
    ctx.font = 'bold 10px ui-monospace,monospace';
    const tw = ctx.measureText(txt).width + 14;
    const bx = Math.min(W - tw - 4, Math.max(4, tx - tw * 0.5));
    const by = ty > H * 0.55 ? Math.max(28, ty - 26) : Math.min(H - 22, ty + 10);
    ctx.fillStyle = 'rgba(12,13,18,0.94)';
    ctx.strokeStyle = ts.color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(bx, by, tw, 18, 5) : ctx.rect(bx, by, tw, 18);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#eae7e0';
    ctx.textAlign = 'center';
    ctx.fillText(txt, bx + tw * 0.5, by + 12.5);
  }
  ctx.restore();
}

function buildEffectFieldsHtml(vid, type, mergedCfg){
  const schemaProps = (effectsSchema[type] || {}).schema?.properties || {};
  const keys = Object.keys(schemaProps).length ? Object.keys(schemaProps) : Object.keys(mergedCfg);
  return keys.filter(k => !SE_SKIP_KEYS.has(k) && k in mergedCfg).map(k => {
    const def = schemaProps[k] || {};
    const val = mergedCfg[k];
    const isGrad = k === 'gradient' || def.format === 'gradient' || (typeof val === 'string' && val.includes('gradient('));
    const isColor = !isGrad && (k.includes('color') || (typeof val === 'string' && /^#[0-9a-f]{6}$/i.test(val)));
    if(isGrad){
      const curGrad = String(val || '');
      const matchedPreset = Object.keys(LEDFX_GRADIENTS).find(pn => pn === curGrad || LEDFX_GRADIENTS[pn] === curGrad) || '';
      const opts = `<option value="">Custom…</option>` + Object.keys(LEDFX_GRADIENTS).map(pn => `<option value="${escHtml(pn)}" ${pn===matchedPreset?'selected':''}>${escHtml(pn)}</option>`).join('');
      const stops = parseGradientStops(curGrad);
      return `<div class="se-field se-grad-field" data-vid="${escHtml(vid)}" data-key="${escHtml(k)}" data-orig-grad="${escHtml(curGrad)}">
        <label><span>${escHtml(k)}</span><span>${escHtml(matchedPreset || 'custom')}</span></label>
        <canvas class="se-grad-canvas" data-se-grad-canvas></canvas>
        <div class="se-grad-hint">Drag points <b>left/right</b> to move position (%) &middot; Drag curve dots <b>up/down</b> for brightness &middot; <b>Click</b> colormap to add a color &middot; <b>Right-click</b> a dot to remove</div>
        <div class="se-grad-stops" data-se-grad-stops>${renderGradStopsHtml(stops)}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center">
          <select data-se-grad-preset style="flex:0 0 140px">${opts}</select>
          <button type="button" class="btn" data-se-grad-add style="padding:6px 10px;font-size:12px">+ Add Color</button>
          <button type="button" class="btn" data-se-grad-rev style="padding:6px 10px;font-size:12px">Reverse</button>
          <button type="button" class="btn" data-se-grad-reset style="padding:6px 10px;font-size:12px" title="Reset gradient to original">Reset</button>
          <input type="text" data-se-input value="${escHtml(curGrad)}" style="flex:1;min-width:160px;font-size:11px" />
        </div>
      </div>`;
    }
    if(isColor){
      const hex = /^#[0-9a-f]{6}$/i.test(String(val)) ? String(val) : '#ffffff';
      return `<div class="se-field" data-vid="${escHtml(vid)}" data-key="${escHtml(k)}">
        <label><span>${escHtml(k)}</span></label>
        <div class="se-color-row">
          <input type="color" data-se-input value="${escHtml(hex)}" />
          <span class="se-color-hex">${escHtml(hex)}</span>
        </div>
      </div>`;
    }
    if(def.type === 'boolean' || typeof val === 'boolean'){
      return `<div class="se-field" data-vid="${escHtml(vid)}" data-key="${escHtml(k)}">
        <label class="se-bool"><span>${escHtml(k)}</span><input type="checkbox" data-se-input ${val?'checked':''} /></label>
      </div>`;
    }
    if(Array.isArray(def.enum) && def.enum.length){
      const opts = def.enum.map(ev => `<option value="${escHtml(ev)}" ${String(ev)===String(val)?'selected':''}>${escHtml(ev)}</option>`).join('');
      return `<div class="se-field" data-vid="${escHtml(vid)}" data-key="${escHtml(k)}">
        <label><span>${escHtml(k)}</span></label>
        <select data-se-input>${opts}</select>
      </div>`;
    }
    if(def.type === 'number' || def.type === 'integer' || typeof val === 'number'){
      const min = def.minimum ?? 0;
      const max = def.maximum ?? (typeof val === 'number' && val > 1 ? Math.max(10, val * 2) : 1);
      const step = def.type === 'integer' ? 1 : Number(((max - min) / 100 || 0.01).toPrecision(2));
      const numVal = Number(val ?? min);
      return `<div class="se-field" data-vid="${escHtml(vid)}" data-key="${escHtml(k)}">
        <label><span>${escHtml(k)}</span><span data-se-val>${escHtml(numVal)}</span></label>
        <input type="range" data-se-input data-num="${def.type==='integer'?'int':'float'}" min="${min}" max="${max}" step="${step}" value="${numVal}" />
      </div>`;
    }
    return `<div class="se-field" data-vid="${escHtml(vid)}" data-key="${escHtml(k)}">
      <label><span>${escHtml(k)}</span></label>
      <input type="text" data-se-input value="${escHtml(val ?? '')}" />
    </div>`;
  }).join('');
}

function wireEffectFields(container, draftMap, livePush){
  container.querySelectorAll('.se-field[data-vid][data-key]').forEach(field => {
    const vid = field.dataset.vid, key = field.dataset.key;
    const inp = field.querySelector('[data-se-input]');
    const presetSel = field.querySelector('[data-se-grad-preset]');
    let sendT = null;
    const pushUpdate = (newVal, immediate) => {
      if(!draftMap[vid]) return;
      draftMap[vid].config[key] = newVal;
      if(!livePush) return;
      if(virtualsCache[vid]?.effect?.config) virtualsCache[vid].effect.config[key] = newVal;
      const send = () => api(`/virtuals/${vid}/effects`, {method:'PUT', body: JSON.stringify({config:{[key]: newVal}})}).catch(e => toast('Update failed: ' + e.message, true));
      if(immediate){ clearTimeout(sendT); send(); }
      else{ clearTimeout(sendT); sendT = setTimeout(send, 100); }
    };
    if(presetSel && inp){
      const stopsBox = field.querySelector('[data-se-grad-stops]');
      const gradCanvas = field.querySelector('[data-se-grad-canvas]');
      let dragStopIdx = -1, hoverStopIdx = -1, dragInCurve = false;
      const redrawCanvas = (stopsList) => {
        if(gradCanvas) drawGradCanvas(gradCanvas, stopsList || parseGradientStops(inp.value), dragStopIdx, hoverStopIdx);
      };
      const syncGradUI = (gVal, labelTxt, immediate, stopsList) => {
        inp.value = gVal;
        redrawCanvas(stopsList || parseGradientStops(gVal));
        const lbl = field.querySelector('label span:last-child');
        if(lbl) lbl.textContent = labelTxt || 'custom';
        pushUpdate(gVal, immediate);
      };
      const readStopsFromDOM = () => {
        if(!stopsBox) return parseGradientStops(inp.value);
        return [...stopsBox.querySelectorAll('.se-gstop')].map(st => ({
          color: st.querySelector('[data-gs-col]')?.value || '#ffffff',
          pos: Math.max(0, Math.min(100, Number(st.querySelector('[data-gs-pos]')?.value || 0))),
        }));
      };
      const wireStops = () => {
        if(!stopsBox) return;
        stopsBox.querySelectorAll('[data-gs-col]').forEach(ci => {
          ci.addEventListener('input', () => syncGradUI(buildGradientString(readStopsFromDOM()), 'custom', false));
          ci.addEventListener('change', () => syncGradUI(buildGradientString(readStopsFromDOM()), 'custom', true));
        });
        stopsBox.querySelectorAll('[data-gs-pos]').forEach(pi => {
          pi.addEventListener('change', () => {
            const gVal = buildGradientString(readStopsFromDOM());
            stopsBox.innerHTML = renderGradStopsHtml(parseGradientStops(gVal));
            wireStops();
            syncGradUI(gVal, 'custom', true);
          });
        });
        stopsBox.querySelectorAll('[data-gs-del]').forEach(db => db.addEventListener('click', () => {
          const idx = Number(db.closest('.se-gstop')?.dataset.gstop);
          const list = readStopsFromDOM();
          if(list.length <= 2) return;
          list.splice(idx, 1);
          const gVal = buildGradientString(list);
          stopsBox.innerHTML = renderGradStopsHtml(parseGradientStops(gVal));
          wireStops();
          syncGradUI(gVal, 'custom', true);
        }));
      };
      wireStops();
      requestAnimationFrame(() => redrawCanvas());
      if(gradCanvas){
        let liveStops = parseGradientStops(inp.value);
        const hitStop = (lx, ly, rect, list) => {
          const padX = 10, plotW = Math.max(10, rect.width - padX * 2);
          const curveTop = 30, curveH = rect.height - curveTop - 8;
          let best = -1, bestD = 14;
          list.forEach((s, idx) => {
            const sx = padX + (s.pos / 100) * plotW;
            const [, , l] = hexToHsl(s.color);
            const sy = ly < 26 ? 14 : (curveTop + (1 - l / 100) * curveH);
            const d = Math.hypot(lx - sx, ly - sy);
            if(d < bestD){ bestD = d; best = idx; }
          });
          return best;
        };
        gradCanvas.addEventListener('pointerdown', e => {
          if(e.button === 2) return;
          const rect = gradCanvas.getBoundingClientRect();
          const lx = e.clientX - rect.left, ly = e.clientY - rect.top;
          liveStops = readStopsFromDOM();
          const hit = hitStop(lx, ly, rect, liveStops);
          if(hit >= 0){
            dragStopIdx = hit;
            hoverStopIdx = hit;
            dragInCurve = ly >= 26;
            gradCanvas.setPointerCapture?.(e.pointerId);
            redrawCanvas(liveStops);
          }else{
            const padX = 10, plotW = Math.max(10, rect.width - padX * 2);
            const pct = Math.round(Math.max(0, Math.min(100, ((lx - padX) / plotW) * 100)));
            const col = sampleGradientAt(liveStops, pct);
            liveStops.push({ color: col, pos: pct });
            const gVal = buildGradientString(liveStops);
            if(stopsBox){ stopsBox.innerHTML = renderGradStopsHtml(parseGradientStops(gVal)); wireStops(); }
            presetSel.value = '';
            syncGradUI(gVal, 'custom', true);
          }
        });
        gradCanvas.addEventListener('pointermove', e => {
          const rect = gradCanvas.getBoundingClientRect();
          const lx = e.clientX - rect.left, ly = e.clientY - rect.top;
          if(dragStopIdx < 0){
            const hit = hitStop(lx, ly, rect, readStopsFromDOM());
            gradCanvas.style.cursor = hit >= 0 ? 'grab' : 'crosshair';
            if(hit !== hoverStopIdx){ hoverStopIdx = hit; redrawCanvas(); }
            return;
          }
          gradCanvas.style.cursor = 'grabbing';
          const padX = 10, plotW = Math.max(10, rect.width - padX * 2);
          const pct = Math.round(Math.max(0, Math.min(100, ((lx - padX) / plotW) * 100)));
          const st = liveStops[dragStopIdx];
          if(!st) return;
          st.pos = pct;
          if(dragInCurve){
            const curveTop = 30, curveH = Math.max(10, rect.height - curveTop - 8);
            const bright = Math.max(4, Math.min(96, Math.round((1 - (ly - curveTop) / curveH) * 100)));
            const [h, s] = hexToHsl(st.color);
            st.color = hslToHex(h, Math.max(s, 0), bright);
          }
          const gVal = buildGradientString(liveStops);
          if(stopsBox){
            const row = stopsBox.querySelectorAll('.se-gstop')[dragStopIdx];
            if(row){
              const ci = row.querySelector('[data-gs-col]'); if(ci) ci.value = st.color;
              const pi = row.querySelector('[data-gs-pos]'); if(pi) pi.value = st.pos;
            }
          }
          syncGradUI(gVal, 'custom', false, liveStops);
        });
        const endGradDrag = () => {
          if(dragStopIdx < 0) return;
          dragStopIdx = -1;
          const gVal = buildGradientString(liveStops);
          if(stopsBox){ stopsBox.innerHTML = renderGradStopsHtml(parseGradientStops(gVal)); wireStops(); }
          syncGradUI(gVal, 'custom', true);
        };
        gradCanvas.addEventListener('pointerup', endGradDrag);
        gradCanvas.addEventListener('pointercancel', endGradDrag);
        gradCanvas.addEventListener('pointerleave', () => { if(dragStopIdx < 0 && hoverStopIdx >= 0){ hoverStopIdx = -1; redrawCanvas(); } });
        gradCanvas.addEventListener('contextmenu', e => {
          e.preventDefault();
          const rect = gradCanvas.getBoundingClientRect();
          const list = readStopsFromDOM();
          if(list.length <= 2) return;
          const hit = hitStop(e.clientX - rect.left, e.clientY - rect.top, rect, list);
          if(hit >= 0){
            list.splice(hit, 1);
            const gVal = buildGradientString(list);
            if(stopsBox){ stopsBox.innerHTML = renderGradStopsHtml(parseGradientStops(gVal)); wireStops(); }
            presetSel.value = '';
            syncGradUI(gVal, 'custom', true);
          }
        });
      }
      field.querySelector('[data-se-grad-add]')?.addEventListener('click', () => {
        const list = readStopsFromDOM();
        const last = list[list.length - 1] || {color:'#ffffff', pos:100};
        const prev = list[list.length - 2] || {color:'#000000', pos:0};
        const midPos = Math.round((prev.pos + last.pos) / 2);
        list.push({ color: last.color, pos: midPos === last.pos ? Math.max(0, last.pos - 10) : midPos });
        const gVal = buildGradientString(list);
        if(stopsBox){ stopsBox.innerHTML = renderGradStopsHtml(parseGradientStops(gVal)); wireStops(); }
        presetSel.value = '';
        syncGradUI(gVal, 'custom', true);
      });
      field.querySelector('[data-se-grad-rev]')?.addEventListener('click', () => {
        const list = readStopsFromDOM().map(s => ({ color: s.color, pos: 100 - s.pos })).reverse();
        const gVal = buildGradientString(list);
        if(stopsBox){ stopsBox.innerHTML = renderGradStopsHtml(parseGradientStops(gVal)); wireStops(); }
        presetSel.value = '';
        syncGradUI(gVal, 'custom', true);
      });
      field.querySelector('[data-se-grad-reset]')?.addEventListener('click', () => {
        const origGrad = field.dataset.origGrad ?? '';
        const matched = Object.keys(LEDFX_GRADIENTS).find(pn => pn === origGrad || LEDFX_GRADIENTS[pn] === origGrad) || '';
        presetSel.value = matched;
        if(stopsBox){ stopsBox.innerHTML = renderGradStopsHtml(parseGradientStops(origGrad)); wireStops(); }
        syncGradUI(origGrad, matched || 'custom', true);
      });
      presetSel.addEventListener('change', () => {
        if(!presetSel.value) return;
        const gVal = LEDFX_GRADIENTS[presetSel.value] || presetSel.value;
        if(stopsBox){ stopsBox.innerHTML = renderGradStopsHtml(parseGradientStops(gVal)); wireStops(); }
        syncGradUI(gVal, presetSel.value, true);
      });
    }
    if(!inp) return;
    if(inp.type === 'range'){
      inp.addEventListener('input', () => {
        const v = inp.dataset.num === 'int' ? parseInt(inp.value, 10) : Number(inp.value);
        const valEl = field.querySelector('[data-se-val]');
        if(valEl) valEl.textContent = v;
        pushUpdate(v, false);
      });
      inp.addEventListener('change', () => {
        const v = inp.dataset.num === 'int' ? parseInt(inp.value, 10) : Number(inp.value);
        pushUpdate(v, true);
      });
    }else if(inp.type === 'color'){
      inp.addEventListener('input', () => {
        const hexEl = field.querySelector('.se-color-hex');
        if(hexEl) hexEl.textContent = inp.value;
        pushUpdate(inp.value, false);
      });
      inp.addEventListener('change', () => pushUpdate(inp.value, true));
    }else if(inp.type === 'checkbox'){
      inp.addEventListener('change', () => pushUpdate(inp.checked, true));
    }else{
      inp.addEventListener('change', () => {
        const gc = field.querySelector('[data-se-grad-canvas]');
        if(gc) drawGradCanvas(gc, parseGradientStops(inp.value), -1, -1);
        pushUpdate(inp.value, true);
      });
    }
  });
}

let mainScenesHidden = localStorage.getItem('ledfx_main_scenes_hidden') === '1';
function syncMainScenesVisibility(){
  const sec = $('#mainScenesSec'), btn = $('#toggleMainScenesBtn');
  if(sec) sec.classList.toggle('collapsed', mainScenesHidden);
  if(btn) btn.setAttribute('aria-expanded', String(!mainScenesHidden));
}
syncMainScenesVisibility();
$('#toggleMainScenesBtn')?.addEventListener('click', ()=>{
  mainScenesHidden = !mainScenesHidden;
  localStorage.setItem('ledfx_main_scenes_hidden', mainScenesHidden ? '1' : '0');
  syncMainScenesVisibility();
});
$('#toggleMainScenesBtn')?.addEventListener('keydown', e => {
  if(e.key === 'Enter' || e.key === ' '){
    e.preventDefault();
    $('#toggleMainScenesBtn').click();
  }
});

let mainPaletteHidden = localStorage.getItem('ledfx_main_palette_hidden') === '1';
function syncMainPaletteVisibility(){
  const sec = $('#mainPaletteSec'), btn = $('#toggleMainPaletteBtn');
  if(sec) sec.classList.toggle('collapsed', mainPaletteHidden);
  if(btn) btn.setAttribute('aria-expanded', String(!mainPaletteHidden));
}
syncMainPaletteVisibility();
$('#toggleMainPaletteBtn')?.addEventListener('click', ()=>{
  mainPaletteHidden = !mainPaletteHidden;
  localStorage.setItem('ledfx_main_palette_hidden', mainPaletteHidden ? '1' : '0');
  syncMainPaletteVisibility();
});
$('#toggleMainPaletteBtn')?.addEventListener('keydown', e => {
  if(e.key === 'Enter' || e.key === ' '){
    e.preventDefault();
    $('#toggleMainPaletteBtn').click();
  }
});

function defaultEffectConfig(type){
  const props = (effectsSchema[type] || {}).schema?.properties || {};
  const out = {};
  for(const [k, def] of Object.entries(props)){
    if(def && 'default' in def) out[k] = def.default;
  }
  return out;
}

function buildVirtualMappingBarHtml(vid){
  const vCfg = virtualsCache[vid]?.config || {};
  return `<div class="arr-grid" style="margin-bottom:10px;padding:8px 10px;background:var(--panel2);border:1px solid var(--line);border-radius:8px">
    <label>Mapping
      <select data-st-map="${escHtml(vid)}" style="background:var(--bg);border:1px solid var(--line);color:var(--text);padding:5px 8px;border-radius:6px">
        <option value="span" ${(vCfg.mapping||'span')==='span'?'selected':''}>span</option>
        <option value="copy" ${vCfg.mapping==='copy'?'selected':''}>copy</option>
      </select>
    </label>
    <label>Rows <input type="number" data-st-rows="${escHtml(vid)}" min="1" max="32" value="${vCfg.rows || 1}" style="width:58px"></label>
    <label>Grouping
      <select data-st-grp="${escHtml(vid)}" style="background:var(--bg);border:1px solid var(--line);color:var(--text);padding:5px 8px;border-radius:6px">
        <option value="1" ${Number(vCfg.grouping||1)===1?'selected':''}>1 (Full 36px)</option>
        <option value="4" ${Number(vCfg.grouping||1)===4?'selected':''}>4 (Ring-Grouped)</option>
      </select>
    </label>
    <label>Rotate
      <select data-st-rot="${escHtml(vid)}" style="background:var(--bg);border:1px solid var(--line);color:var(--text);padding:5px 8px;border-radius:6px">
        ${[0,1,2,3].map(r => `<option value="${r}" ${Number(vCfg.rotate||0)===r?'selected':''}>${r * 90}°</option>`).join('')}
      </select>
    </label>
    <button type="button" class="btn" data-st-apply-virt="${escHtml(vid)}" style="padding:5px 10px;font-size:11px">Apply Virtual Mapping</button>
    <button type="button" class="btn" data-st-clone-virt="${escHtml(vid)}" style="padding:5px 10px;font-size:11px" title="Create a new virtual copy with these mapping settings for this scene">+ Clone Virtual for Scene</button>
    <span class="status" style="font-size:10px">(virtual-wide unless cloned)</span>
  </div>`;
}

function readVirtualMappingBar(container, vid){
  return {
    mapping: container.querySelector(`[data-st-map="${CSS.escape(vid)}"]`)?.value || 'span',
    rows: Math.max(1, Number(container.querySelector(`[data-st-rows="${CSS.escape(vid)}"]`)?.value) || 1),
    grouping: Math.max(1, Number(container.querySelector(`[data-st-grp="${CSS.escape(vid)}"]`)?.value) || 1),
    rotate: Number(container.querySelector(`[data-st-rot="${CSS.escape(vid)}"]`)?.value) || 0,
  };
}

function wireVirtualMappingBar(container, draftMap, onCloned){
  container.querySelectorAll('[data-st-apply-virt]').forEach(btn => btn.addEventListener('click', async () => {
    const vid = btn.dataset.stApplyVirt;
    const cfgPatch = readVirtualMappingBar(container, vid);
    try{
      await api('/virtuals', {method:'POST', body: JSON.stringify({id: vid, config: cfgPatch})});
      if(virtualsCache[vid]?.config) Object.assign(virtualsCache[vid].config, cfgPatch);
      toast(`Updated virtual "${vid}" mapping`);
    }catch(e){ toast('Failed to update virtual: ' + e.message, true); }
  }));
  container.querySelectorAll('[data-st-clone-virt]').forEach(btn => btn.addEventListener('click', async () => {
    const vid = btn.dataset.stCloneVirt;
    const orig = virtualsCache[vid];
    if(!orig){ toast('Virtual not loaded', true); return; }
    const origName = orig.config?.name || vid;
    const newName = prompt(`New virtual name (cloned from "${origName}"):`, `${origName} Copy`);
    if(!newName || !newName.trim()) return;
    const cfgPatch = readVirtualMappingBar(container, vid);
    const newCfg = { ...(orig.config || {}), ...cfgPatch, name: newName.trim() };
    try{
      const created = await api('/virtuals', {method:'POST', body: JSON.stringify({config: newCfg})});
      const newVid = created.virtual?.id;
      if(!newVid) throw new Error('Server did not return new virtual id');
      if(Array.isArray(orig.segments) && orig.segments.length){
        await api(`/virtuals/${newVid}`, {method:'POST', body: JSON.stringify({segments: orig.segments})});
      }
      for(const [lid, lp] of Object.entries(layoutsCache)){
        if(lp?.virtuals && vid in lp.virtuals){
          const updatedVirts = {
            ...lp.virtuals,
            [newVid]: { segments: orig.segments || [], rows: cfgPatch.rows, grouping: cfgPatch.grouping },
          };
          await api('/layouts', {method:'POST', body: JSON.stringify({
            id: lid, name: lp.name || lid, scene_tag: lp.scene_tag || '', devices: lp.devices || [],
            virtuals: updatedVirts, grid_cells: lp.grid_cells, enabled: lp.enabled !== false,
          })});
        }
      }
      if(draftMap && draftMap[vid]){
        const draft = draftMap[vid];
        delete draftMap[vid];
        draftMap[newVid] = draft;
        await api(`/virtuals/${vid}`, {method:'PUT', body: JSON.stringify({active: false})}).catch(()=>{});
        await api(`/virtuals/${newVid}/effects`, {method:'POST', body: JSON.stringify({type: draft.type, config: draft.config})});
      }
      cloningVirtualInEditor = true;
      try{
        await loadLayouts();
        await loadVirtuals();
      }finally{
        cloningVirtualInEditor = false;
      }
      toast(`Cloned "${newName.trim()}" (${newVid}) — click Save/Update Scene to bind it`);
      if(typeof onCloned === 'function') onCloned(vid, newVid);
    }catch(e){ toast('Clone virtual failed: ' + e.message, true); }
  }));
}

function renderSceneEditor(sceneId){
  const sec = $('#sceneEditorSec'), body = $('#sceneEditorBody'), titleEl = $('#sceneEditorTitle');
  if(!sec || !body) return;
  if(!activeDeckId){
    sec.hidden = true;
    editingSceneId = '';
    sceneDraftVirtuals = {};
    return;
  }
  if(!sceneId || !scenesCache[sceneId]){
    sec.hidden = false;
    editingSceneId = '';
    sceneDraftVirtuals = {};
    if(titleEl) titleEl.textContent = '';
    body.innerHTML = '<div class="empty">Select a scene above to adjust its effect &amp; mapping settings.</div>';
    return;
  }
  const s = scenesCache[sceneId];
  const entries = Object.entries(s.virtuals || {}).filter(([, eff]) => eff && eff.type);
  if(!entries.length){
    sec.hidden = false;
    editingSceneId = sceneId;
    if(titleEl) titleEl.textContent = `— ${s.name || sceneId}`;
    body.innerHTML = '<div class="empty">This scene has no active effects to edit.</div>';
    return;
  }
  sec.hidden = false;
  editingSceneId = sceneId;
  if(titleEl) titleEl.textContent = `— ${s.name || sceneId}`;
  sceneDraftVirtuals = {};
  sceneReplacedVirtuals = new Set();

  body.innerHTML = entries.map(([vid, eff]) => {
    const type = eff.type;
    const mergedCfg = { ...defaultEffectConfig(type), ...(eff.config || {}), ...(activePalettePatch[vid] || {}) };
    sceneDraftVirtuals[vid] = { action: 'activate', type, config: JSON.parse(JSON.stringify(mergedCfg)) };
    const fieldsHtml = buildEffectFieldsHtml(vid, type, mergedCfg);
    const vName = virtualsCache[vid]?.config?.name || vid;
    return `<div class="se-vcard">
      <div class="se-head"><span class="se-vname">${escHtml(vName)}</span><span class="se-etype">${escHtml(type)}</span></div>
      ${buildVirtualMappingBarHtml(vid)}
      <div class="se-grid">${fieldsHtml || '<span class="status">No editable properties</span>'}</div>
    </div>`;
  }).join('');

  const bindInline = () => {
    wireEffectFields(body, sceneDraftVirtuals, true);
    wireVirtualMappingBar(body, sceneDraftVirtuals, (oldVid) => {
      sceneReplacedVirtuals.add(oldVid);
      body.innerHTML = Object.entries(sceneDraftVirtuals).map(([vid, d]) => {
        const fieldsHtml = buildEffectFieldsHtml(vid, d.type, d.config);
        const vName = virtualsCache[vid]?.config?.name || vid;
        return `<div class="se-vcard">
          <div class="se-head"><span class="se-vname">${escHtml(vName)}</span><span class="se-etype">${escHtml(d.type)}</span></div>
          ${buildVirtualMappingBarHtml(vid)}
          <div class="se-grid">${fieldsHtml || '<span class="status">No editable properties</span>'}</div>
        </div>`;
      }).join('');
      bindInline();
    });
  };
  bindInline();
}

async function saveEditedScene(asNew){
  if(!editingSceneId || !scenesCache[editingSceneId]){
    toast('Select a scene first', true);
    return;
  }
  const orig = scenesCache[editingSceneId];
  const mergedVirtuals = {};
  for(const [vid, oldEntry] of Object.entries(orig.virtuals || {})){
    if(sceneReplacedVirtuals.has(vid)){
      mergedVirtuals[vid] = { action: 'stop' };
      continue;
    }
    if(sceneDraftVirtuals[vid]) mergedVirtuals[vid] = sceneDraftVirtuals[vid];
    else mergedVirtuals[vid] = oldEntry;
  }
  for(const [vid, draft] of Object.entries(sceneDraftVirtuals)){
    if(!(vid in mergedVirtuals)) mergedVirtuals[vid] = draft;
  }
  try{
    if(asNew){
      const suggested = `${orig.name || editingSceneId} Custom`;
      const newName = prompt('Save modified scene as:', suggested);
      if(!newName || !newName.trim()) return;
      const cleanName = newName.trim();
      const dup = Object.values(scenesCache).find(sc => (sc?.name || '').toLowerCase() === cleanName.toLowerCase());
      if(dup && !confirm(`A scene named "${dup.name}" already exists. Save anyway?`)) return;
      const res = await api('/scenes', {
        method: 'POST',
        body: JSON.stringify({
          name: cleanName,
          scene_tags: orig.scene_tags || '',
          virtuals: JSON.parse(JSON.stringify(mergedVirtuals)),
        }),
      });
      const newId = res.scene?.id;
      toast(`Saved new scene "${cleanName}"`);
      await loadScenes();
      if(newId) await activateScene(newId, activeDeckId);
    }else{
      if(!confirm(`Overwrite scene "${orig.name || editingSceneId}"?`)) return;
      await api('/scenes', {
        method: 'POST',
        body: JSON.stringify({ id: editingSceneId, virtuals: JSON.parse(JSON.stringify(mergedVirtuals)) }),
      });
      for(const vid of Object.keys(mergedVirtuals)) delete activePalettePatch[vid];
      toast(`Updated scene "${orig.name || editingSceneId}"`);
      await loadScenes();
      renderSceneEditor(editingSceneId);
    }
  }catch(e){
    toast('Save scene failed: ' + e.message, true);
  }
}

$('#sceneEditorSaveBtn')?.addEventListener('click', () => saveEditedScene(false));
$('#sceneEditorSaveAsBtn')?.addEventListener('click', () => saveEditedScene(true));

// ---- Dedicated Scene Editor / Creator Tab ----
let hiddenScenes = new Set();
try{
  const savedHidden = JSON.parse(localStorage.getItem('ledfx_hidden_scenes') || '[]');
  if(Array.isArray(savedHidden)) hiddenScenes = new Set(savedHidden);
}catch(e){}
function isSceneHidden(sid){ return !!sid && hiddenScenes.has(sid); }
function saveHiddenScenes(){
  try{ localStorage.setItem('ledfx_hidden_scenes', JSON.stringify([...hiddenScenes])); }catch(e){}
}
function toggleSceneHidden(sid, force){
  if(!sid) return;
  const hide = force !== undefined ? !!force : !hiddenScenes.has(sid);
  if(hide) hiddenScenes.add(sid);
  else hiddenScenes.delete(sid);
  saveHiddenScenes();
  if($('#stHideLiveChk') && studioSceneId === sid) $('#stHideLiveChk').checked = hide;
  renderStudioPicker();
  renderScenes();
}

let studioSceneId = '', studioDraftVirtuals = {}, studioPreservedVirtuals = {};
function loadStudioScene(sid){
  studioSceneId = sid || '';
  const sc = sid ? scenesCache[sid] : null;
  if($('#stSceneSel')) $('#stSceneSel').value = studioSceneId;
  if($('#stNameIn')) $('#stNameIn').value = sc ? (sc.name || sid) : '';
  if($('#stTagsIn')) $('#stTagsIn').value = sc ? (sc.scene_tags || '') : '';
  if($('#stHideLiveChk')){
    $('#stHideLiveChk').disabled = !studioSceneId;
    $('#stHideLiveChk').checked = isSceneHidden(studioSceneId);
  }
  studioDraftVirtuals = {};
  studioPreservedVirtuals = {};
  if(sc && sc.virtuals){
    for(const [vid, eff] of Object.entries(sc.virtuals)){
      if(eff && eff.type){
        studioDraftVirtuals[vid] = {
          action: 'activate',
          type: eff.type,
          config: { ...defaultEffectConfig(eff.type), ...(eff.config || {}) },
        };
      }else if(eff && typeof eff === 'object'){
        studioPreservedVirtuals[vid] = JSON.parse(JSON.stringify(eff));
      }
    }
  }
  renderStudioPicker();
  renderStudioVirtuals();
}

function renderStudioPicker(){
  const box = $('#stScenePicker');
  if(!box) return;
  const allIds = Object.keys(scenesCache || {}).sort((a,b) => (scenesCache[a]?.name||a).localeCompare(scenesCache[b]?.name||b));
  if(!allIds.length){
    box.innerHTML = '<div class="empty">No scenes saved in LedFx yet.</div>';
    if($('#stPickerCount')) $('#stPickerCount').textContent = '';
    return;
  }
  const q = ($('#stSceneSearch')?.value || '').trim().toLowerCase();
  const filt = $('#stFilterSel')?.value || 'all';
  const layoutFilt = $('#stLayoutFilter')?.value || '';
  const shown = allIds.filter(id => {
    const sc = scenesCache[id];
    const hid = isSceneHidden(id);
    if(filt === 'visible' && hid) return false;
    if(filt === 'hidden' && !hid) return false;
    if(layoutFilt){
      const layout = layoutsCache[layoutFilt];
      if(layout){
        const lVirts = new Set(Object.keys(layout.virtuals || {}));
        const sVirts = Object.entries(sc?.virtuals || {}).filter(([,e]) => e && e.type).map(([vid]) => vid);
        const lTag = (layout.scene_tag || '').trim().toLowerCase();
        const sTags = String(sc?.scene_tags || '').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
        const matchesVirt = lVirts.size && sVirts.length && sVirts.some(vid => lVirts.has(vid));
        const matchesTag = lTag && sTags.includes(lTag);
        if(!matchesVirt && !matchesTag) return false;
      }
    }
    if(!q) return true;
    const name = String(sc?.name || id).toLowerCase();
    const tags = String(sc?.scene_tags || '').toLowerCase();
    const virts = Object.keys(sc?.virtuals || {}).join(' ').toLowerCase();
    return name.includes(q) || tags.includes(q) || virts.includes(q) || id.toLowerCase().includes(q);
  });
  if($('#stPickerCount')) $('#stPickerCount').textContent = `${shown.length}/${allIds.length} scenes (${hiddenScenes.size} hidden)`;
  if(!shown.length){
    box.innerHTML = '<div class="empty">No scenes match the current filter.</div>';
    return;
  }
  box.innerHTML = shown.map(id => {
    const sc = scenesCache[id];
    const hid = isSceneHidden(id);
    const activeEffs = Object.entries(sc?.virtuals || {}).filter(([,eff]) => eff && eff.type);
    const vList = activeEffs.map(([vid]) => vid).slice(0, 2).join(', ') + (activeEffs.length > 2 ? ` +${activeEffs.length - 2}` : '');
    const segStyles = [...new Set(activeEffs.map(([,eff]) => sceneSegmentStyle(eff)))];
    const strip = segStyles.length ? segStyles.map(st => `<span style="${st}"></span>`).join('') : '<span style="background:var(--panel);opacity:.4"></span>';
    return `<div class="st-scard ${id===studioSceneId?'cur':''} ${hid?'is-hidden':''}" data-st-pick="${escHtml(id)}" role="button" tabindex="0">
      <div class="st-scard-top">
        <span class="st-scard-name" title="${escHtml(sc?.name || id)}">${escHtml(sc?.name || id)}</span>
        <button type="button" class="st-hide-btn ${hid?'on':''}" data-st-hide="${escHtml(id)}" title="${hid?'Show in Live Controls':'Hide from Live Controls'}">${hid?'Hidden':'Hide'}</button>
      </div>
      <div class="st-scard-meta">${escHtml(vList || 'empty')}${sc?.scene_tags ? ` · ${escHtml(sc.scene_tags)}` : ''}</div>
      <div class="scene-strip">${strip}</div>
    </div>`;
  }).join('');
  box.querySelectorAll('[data-st-pick]').forEach(card => card.addEventListener('click', e => {
    if(e.target.closest('[data-st-hide]')) return;
    loadStudioScene(card.dataset.stPick);
  }));
  box.querySelectorAll('[data-st-hide]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    toggleSceneHidden(btn.dataset.stHide);
  }));
}

function populateStudioLayoutFilter(){
  const lFiltSel = $('#stLayoutFilter');
  if(!lFiltSel) return;
  const prev = lFiltSel.value;
  const layouts = typeof getOrderedLayoutEntries === 'function' ? getOrderedLayoutEntries(false) : Object.entries(layoutsCache || {});
  lFiltSel.innerHTML = `<option value="">All Layouts</option>` + layouts.map(([lid, lp]) =>
    `<option value="${escHtml(lid)}" ${prev===lid?'selected':''}>${escHtml(lp?.name || lid)}</option>`
  ).join('');
}

function renderSceneStudio(){
  populateStudioLayoutFilter();
  const sel = $('#stSceneSel'), addSel = $('#stAddVirtSel');
  if(sel){
    const cur = studioSceneId;
    sel.innerHTML = `<option value="">(New Scene)</option>` + Object.keys(scenesCache).sort().map(id =>
      `<option value="${escHtml(id)}">${escHtml(scenesCache[id]?.name || id)}</option>`
    ).join('');
    if(cur && scenesCache[cur]) sel.value = cur;
    else if(!cur && lastScene && scenesCache[lastScene] && !Object.keys(studioDraftVirtuals).length){
      loadStudioScene(lastScene);
      return;
    }
  }
  if(addSel){
    const vIds = Object.keys(virtualsCache).filter(id => !virtualsCache[id]?.is_device).sort();
    addSel.innerHTML = `<option value="">Choose virtual to add…</option>` + vIds.map(id =>
      `<option value="${escHtml(id)}">${escHtml(virtualsCache[id]?.config?.name || id)} (${escHtml(id)})</option>`
    ).join('');
  }
  renderStudioPicker();
  renderStudioVirtuals();
}

function renderStudioVirtuals(){
  const body = $('#stVirtualsBody');
  if(!body) return;
  const entries = Object.entries(studioDraftVirtuals);
  if(!entries.length){
    body.innerHTML = '<div class="empty">No active virtuals in this scene yet. Choose a virtual above and click "+ Add Virtual to Scene".</div>';
    return;
  }
  body.innerHTML = entries.map(([vid, draft]) => {
    const vObj = virtualsCache[vid] || {};
    const vCfg = vObj.config || {};
    const vName = vCfg.name || vid;
    const effOpts = effectTypes.map(t => `<option value="${escHtml(t)}" ${t===draft.type?'selected':''}>${escHtml(t)}</option>`).join('');
    const fieldsHtml = buildEffectFieldsHtml(vid, draft.type, draft.config);
    return `<div class="se-vcard" data-st-vcard="${escHtml(vid)}">
      <div class="se-head" style="flex-wrap:wrap;gap:8px">
        <div><span class="se-vname">${escHtml(vName)}</span> <span class="status">(${escHtml(vid)})</span></div>
        <div class="row2" style="margin:0;gap:8px">
          <select data-st-eff="${escHtml(vid)}" style="background:var(--panel2);border:1px solid var(--line);color:var(--text);padding:5px 9px;border-radius:7px;font-size:12px">${effOpts}</select>
          <button type="button" class="btn" data-st-remove="${escHtml(vid)}" style="padding:5px 9px;font-size:11px;color:var(--bad)">Remove</button>
        </div>
      </div>
      ${buildVirtualMappingBarHtml(vid)}
      <div class="se-grid">${fieldsHtml || '<span class="status">No editable properties</span>'}</div>
    </div>`;
  }).join('');

  wireEffectFields(body, studioDraftVirtuals, true);
  wireVirtualMappingBar(body, studioDraftVirtuals, () => renderStudioVirtuals());

  body.querySelectorAll('[data-st-eff]').forEach(sel => sel.addEventListener('change', async () => {
    const vid = sel.dataset.stEff, newType = sel.value;
    studioDraftVirtuals[vid] = { action: 'activate', type: newType, config: defaultEffectConfig(newType) };
    try{
      await api(`/virtuals/${vid}/effects`, {method:'POST', body: JSON.stringify({type: newType, config: studioDraftVirtuals[vid].config})});
    }catch(e){}
    renderStudioVirtuals();
  }));
  body.querySelectorAll('[data-st-remove]').forEach(btn => btn.addEventListener('click', () => {
    delete studioDraftVirtuals[btn.dataset.stRemove];
    renderStudioVirtuals();
  }));
}

$('#stSceneSel')?.addEventListener('change', e => loadStudioScene(e.target.value));
$('#stSceneSearch')?.addEventListener('input', renderStudioPicker);
$('#stLayoutFilter')?.addEventListener('change', renderStudioPicker);
$('#stFilterSel')?.addEventListener('change', renderStudioPicker);
$('#stHideLiveChk')?.addEventListener('change', e => {
  if(studioSceneId) toggleSceneHidden(studioSceneId, e.target.checked);
});
$('#stNewBtn')?.addEventListener('click', () => {
  studioSceneId = '';
  if($('#stSceneSel')) $('#stSceneSel').value = '';
  if($('#stNameIn')) $('#stNameIn').value = '';
  if($('#stTagsIn')) $('#stTagsIn').value = '';
  if($('#stHideLiveChk')){ $('#stHideLiveChk').checked = false; $('#stHideLiveChk').disabled = true; }
  studioDraftVirtuals = {};
  studioPreservedVirtuals = {};
  renderStudioPicker();
  renderStudioVirtuals();
});
$('#stQuickTags')?.addEventListener('click', e => {
  const b = e.target.closest('[data-qtag]');
  if(!b || !$('#stTagsIn')) return;
  const tag = b.dataset.qtag;
  const cur = new Set($('#stTagsIn').value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean));
  if(cur.has(tag)) cur.delete(tag); else cur.add(tag);
  $('#stTagsIn').value = [...cur].join(', ');
});
$('#stAddVirtBtn')?.addEventListener('click', () => {
  const vid = $('#stAddVirtSel')?.value;
  if(!vid){ toast('Choose a virtual first', true); return; }
  if(studioDraftVirtuals[vid]){ toast('Virtual already in scene'); return; }
  delete studioPreservedVirtuals[vid];
  const liveEff = virtualsCache[vid]?.effect;
  const type = (liveEff && liveEff.type) || effectTypes[0] || 'fade';
  studioDraftVirtuals[vid] = {
    action: 'activate',
    type,
    config: { ...defaultEffectConfig(type), ...((liveEff && liveEff.config) || {}) },
  };
  renderStudioVirtuals();
});
$('#stPreviewBtn')?.addEventListener('click', async () => {
  for(const [vid, draft] of Object.entries(studioDraftVirtuals)){
    try{ await api(`/virtuals/${vid}/effects`, {method:'POST', body: JSON.stringify({type: draft.type, config: draft.config})}); }
    catch(e){ toast(`Preview ${vid} failed: ${e.message}`, true); return; }
  }
  toast('Previewing draft scene live');
});

async function saveStudioScene(forceNew){
  const name = ($('#stNameIn')?.value || '').trim();
  if(!name){ toast('Enter a scene name', true); return; }
  if(!Object.keys(studioDraftVirtuals).length){ toast('Add at least one virtual to the scene', true); return; }
  const tags = [...new Set(($('#stTagsIn')?.value || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean))].join(',');
  const mergedVirtuals = {
    ...JSON.parse(JSON.stringify(studioPreservedVirtuals)),
    ...JSON.parse(JSON.stringify(studioDraftVirtuals)),
  };
  const payload = { name, scene_tags: tags, virtuals: mergedVirtuals };
  if(!forceNew && studioSceneId && scenesCache[studioSceneId]){
    if(!confirm(`Overwrite existing scene "${scenesCache[studioSceneId].name || studioSceneId}"?`)) return;
    payload.id = studioSceneId;
  }else if(forceNew){
    const dup = Object.values(scenesCache).find(sc => (sc?.name || '').toLowerCase() === name.toLowerCase());
    if(dup && !confirm(`A scene named "${dup.name}" already exists. Save anyway?`)) return;
  }
  try{
    const res = await api('/scenes', {method:'POST', body: JSON.stringify(payload)});
    const savedId = res.scene?.id || studioSceneId;
    toast(`${payload.id ? 'Updated' : 'Created'} scene "${name}"`);
    await loadScenes();
    if(savedId) loadStudioScene(savedId);
  }catch(e){ toast('Save scene failed: ' + e.message, true); }
}
$('#stSaveBtn')?.addEventListener('click', () => saveStudioScene(false));
$('#stSaveAsBtn')?.addEventListener('click', () => saveStudioScene(true));
$('#stDelBtn')?.addEventListener('click', async () => {
  if(!studioSceneId || !scenesCache[studioSceneId]){ toast('Select a saved scene to delete', true); return; }
  const sName = scenesCache[studioSceneId].name || studioSceneId;
  if(!confirm(`Delete scene "${sName}"?`)) return;
  try{
    await api('/scenes', {method:'DELETE', body: JSON.stringify({id: studioSceneId})});
    toast(`Deleted "${sName}"`);
    studioSceneId = '';
    studioDraftVirtuals = {};
    studioPreservedVirtuals = {};
    await loadScenes();
    renderSceneStudio();
  }catch(e){ toast('Delete failed: ' + e.message, true); }
});

let virtViewMode = 'virtuals';
function renderVirtualsList(){
  const el = $('#virtuals');
  if(!el) return;
  const ids = Object.keys(virtualsCache || {});
  if(!ids.length){ el.innerHTML = '<div class="empty">No virtuals configured in LedFx yet.</div>'; return; }
  const logicalIds = ids.filter(id => !virtualsCache[id]?.is_device).sort();
  const tubeIds = ids.filter(id => !!virtualsCache[id]?.is_device).sort();
  document.querySelectorAll('#virtViewSeg button').forEach(b => {
    const mode = b.dataset.vv;
    b.classList.toggle('on', mode === virtViewMode);
    b.textContent = mode === 'virtuals' ? `Virtuals (${logicalIds.length})` : `Tubes (${tubeIds.length})`;
  });
  const shown = virtViewMode === 'tubes' ? tubeIds : logicalIds;
  if(!shown.length){
    el.innerHTML = `<div class="empty">No ${virtViewMode === 'tubes' ? 'physical tubes' : 'logical virtuals'} found.</div>`;
    return;
  }
  el.innerHTML = shown.map(id => virtualCard(id, virtualsCache[id])).join('');
  shown.forEach(id => wireVirtual(id, virtualsCache[id]));
}
$('#virtViewSeg')?.addEventListener('click', e => {
  const b = e.target.closest('button[data-vv]');
  if(!b) return;
  virtViewMode = b.dataset.vv;
  renderVirtualsList();
});

async function loadVirtuals(){
  const el = $('#virtuals');
  try{
    const data = await api('/virtuals');
    const virtuals = data.virtuals || data;
    virtualsCache = virtuals || {};
    renderVirtualsList();
    refreshArranger();
    if(typeof scheduleLayoutPreview === 'function') scheduleLayoutPreview();
  }catch(e){ el.innerHTML = `<div class="empty">Failed to load virtuals: ${e.message}</div>`; }
}

function virtualCard(id, v){
  const active = !!v.active;
  const effectType = v.effect && v.effect.type ? v.effect.type : null;
  const opts = effectTypes.map(t => `<option value="${t}" ${t===effectType?'selected':''}>${t}</option>`).join('') || `<option value="">(no effects loaded — see console)</option>`;
  return `
  <div class="vcard" data-id="${id}">
    <div class="row">
      <div>
        <div class="vname">${v.config?.name || id}</div>
        <div class="veffect" data-role="effect">${effectType ? 'effect: ' + effectType : 'no active effect'}</div>
      </div>
      <div class="switch ${active?'on':''}" data-role="switch"><i></i></div>
    </div>
    <select data-role="group" title="target group">${['All','Accent','Left','Right'].map(g=>`<option ${groups[id]===g?'selected':''}>${g}</option>`).join('')}</select>
    <select data-role="effectSelect"><option value="">choose effect…</option>${opts}</select>
    <button class="btn apply" data-role="apply">Apply Effect</button>
    <div class="sliders" data-role="sliders"></div>
  </div>`;
}

function wireVirtual(id, v){
  const card = document.querySelector(`.vcard[data-id="${id}"]`);
  card.querySelector('[data-role="switch"]').addEventListener('click', async (e) => {
    const sw = e.currentTarget;
    const on = !sw.classList.contains('on');
    try{
      await api(`/virtuals/${id}`, {method:'PUT', body: JSON.stringify({active:on})});
      sw.classList.toggle('on', on);
      if(virtualsCache[id]) virtualsCache[id].active = on;
    }catch(err){ toast('Toggle failed: ' + err.message, true); }
  });
  card.querySelector('[data-role="apply"]').addEventListener('click', async () => {
    const type = card.querySelector('[data-role="effectSelect"]').value;
    if(!type) return;
    try{
      await api(`/virtuals/${id}/effects`, {method:'POST', body: JSON.stringify({type, config:{}})});
      card.querySelector('[data-role="effect"]').textContent = 'effect: ' + type;
      toast('Effect applied');
      loadEffectSliders(id, card);
    }catch(err){ toast('Apply failed: ' + err.message, true); }
  });
  if(v.effect && v.effect.type) loadEffectSliders(id, card);
}

async function loadEffectSliders(id, card){
  const holder = card.querySelector('[data-role="sliders"]');
  holder.innerHTML = '';
  try{
    const data = await api(`/virtuals/${id}/effects`);
    const cfg = data.effect?.config || data.config || {};
    const type = data.effect?.type;
    if(!type) return;
    const props = (effectsSchema[type] || {}).schema?.properties || {};
    Object.entries(props).forEach(([key, def]) => {
      if(def.type !== 'number' && def.type !== 'integer') return;
      if(!(key in cfg)) return;
      const min = def.minimum ?? 0, max = def.maximum ?? 1, step = (max-min)/100 || 0.01;
      const wrap = document.createElement('div');
      wrap.className = 'slider';
      wrap.innerHTML = `<label><span>${key}</span><span>${cfg[key]}</span></label>
        <input type="range" min="${min}" max="${max}" step="${step}" value="${cfg[key]}">`;
      const input = wrap.querySelector('input');
      input.addEventListener('change', async () => {
        try{
          await api(`/virtuals/${id}/effects`, {method:'PUT', body: JSON.stringify({config:{[key]: Number(input.value)}})});
          wrap.querySelector('span:last-child').textContent = input.value;
        }catch(err){ toast('Update failed: ' + err.message, true); }
      });
      input.addEventListener('input', () => { wrap.querySelector('span:last-child').textContent = input.value; });
      holder.appendChild(wrap);
    });
  }catch(e){ /* effect has no readable schema, skip sliders */ }
}

