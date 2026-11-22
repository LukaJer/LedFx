// ---- Palette ----
const PALETTES = [
  {name:'Warm Amber', colors:['#3a0f02','#c2410c','#f0a336','#ffe08a']},
  {name:'Cold Steel', colors:['#0a1a2f','#1d4e89','#5aa9e6','#c9e4ff']},
  {name:'Neon Punch', colors:['#ff2e88','#ff6ec7','#c026d3','#7e22ce']},
  {name:'Forest', colors:['#0b3d1f','#1f7a3f','#5fbf6b','#c7f2c1']},
  {name:'Violet Haze', colors:['#1a1035','#4c1d95','#8b5cf6','#ddd6fe']},
  {name:'Sunset', colors:['#3a0518','#b3123f','#ff5e3a','#ffb37a']},
  {name:'Aqua Acid', colors:['#042f2e','#0d9488','#2dd4bf','#d9f99d']},
  {name:'Cyberpunk', colors:['#090d2e','#2563eb','#ec4899','#22d3ee']},
  {name:'Crimson Club', colors:['#240008','#991b1b','#ef4444','#fecaca']},
  {name:'Ultraviolet', colors:['#14042e','#6d28d9','#d946ef','#67e8f9']},
  {name:'Gold Rush', colors:['#1f1200','#854d0e','#eab308','#fef08a']},
  {name:'Ice Mint', colors:['#082f49','#0284c7','#38bdf8','#a7f3d0']},
  {name:'Lava', colors:['#1c0400','#9a3412','#f97316','#fde047']},
  {name:'Techno White', colors:['#18181b','#52525b','#d4d4d8','#ffffff']},
  {name:'Miami', colors:['#1e1b4b','#ec4899','#f472b6','#2dd4bf']},
  {name:'Emerald', colors:['#022c22','#047857','#10b981','#a7f3d0']},
  {name:'Police', colors:['#ff001e','#ff3b00','#0044ff','#00a6ff']},
  {name:'Fire & Ice', colors:['#ff2200','#ff7700','#0066ff','#00d9ff']},
  {name:'Laser Mint', colors:['#ff007f','#ff4da6','#00ff9d','#00d4aa']},
  {name:'Solar Storm', colors:['#ff5500','#ffb700','#6200ea','#b347ff']},
  {name:'Toxic Voltage', colors:['#7cff00','#00e676','#7c00ff','#d500f9']},
  {name:'Club Ember', colors:['#e11d48','#fb7185','#0284c7','#38bdf8']},
  {name:'Berghain Strobe', colors:['#d4d4d8','#ffffff','#b91c1c','#ff1e42']},
  {name:'Acid 303', colors:['#a3e635','#ecfccb','#042f2e','#14b8a6']},
  {name:'Industrial Steel', colors:['#1e293b','#64748b','#f97316','#fbbf24']},
  {name:'Dark Warehouse', colors:['#3b0764','#9333ea','#09090b','#e11d48']},
  {name:'Cold Laser', colors:['#e2e8f0','#94a3b8','#06b6d4','#22d3ee']},
  {name:'Sodium Concrete', colors:['#27272a','#52525b','#ea580c','#fdba74']},
  {name:'Hardgroove', colors:['#dc2626','#f97316','#7c3aed','#c084fc']},
  {name:'Subzero Pulse', colors:['#0f172a','#1d4ed8','#e0f2fe','#ffffff']},
  {name:'Deep Ember', colors:['#5c0800','#e83b00']},
  {name:'Campfire', colors:['#8f1100','#ff6a00']},
  {name:'Molten Gold', colors:['#b82900','#ff9900']},
  {name:'Smoldering Coal', colors:['#3d0400','#c42400']},
  {name:'Sunset Ember', colors:['#6b0a00','#ff4d00']},
  {name:'Amber Glow', colors:['#991b00','#ff7b00']},
];
let palCycleSelected = null;
try{
  const savedPool = JSON.parse(localStorage.getItem('ledfx_cycle_pool') || 'null');
  if(Array.isArray(savedPool)) palCycleSelected = new Set(savedPool);
}catch(e){}
if(!palCycleSelected) palCycleSelected = new Set(PALETTES.map(p => p.name));
function savePalCyclePool(){
  try{ localStorage.setItem('ledfx_cycle_pool', JSON.stringify([...palCycleSelected])); }catch(e){}
}
function syncPaletteDisplay(){
  const mainName = activeDeckId ? (getDeckCycle(activeDeckId).pal?.name || '') : (curPalette?.name || '');
  document.querySelectorAll('#palette .swatch').forEach(el => {
    const p = PALETTES[el.dataset.i];
    el.classList.toggle('cur', !!p && p.name === mainName);
  });
  document.querySelectorAll('.lprev-card').forEach(card => {
    const did = card.dataset.deck;
    const deckName = did ? (getDeckCycle(did).pal?.name || '') : '';
    card.querySelectorAll('.lprev-pal .swatch').forEach(sw => {
      const p = PALETTES[sw.dataset.pi];
      sw.classList.toggle('cur', !!p && p.name === deckName);
    });
  });
}
function renderPalettes(){
  const dc = activeDeckId ? getDeckCycle(activeDeckId) : null;
  const activeName = dc ? (dc.pal?.name || '') : (curPalette?.name || '');
  const pool = dc ? dc.pool : palCycleSelected;
  $('#palette').innerHTML = PALETTES.map((p,i)=>{
    const inPool = pool.has(p.name);
    const isCur = p.name === activeName;
    return `
    <div class="swatch ${isCur?'cur':''}" data-i="${i}" role="button" tabindex="0">
      <span class="cyc-pick ${inPool?'on':''}" data-cyc="${i}" title="Include in palette cycle">${inPool?'✓':''}</span>
      <div class="strip2">${p.colors.map(c=>`<span style="background:${c}"></span>`).join('')}</div>
      <div class="name">${escHtml(p.name)}</div>
    </div>`;
  }).join('');
  document.querySelectorAll('#palette .swatch').forEach(el=>el.addEventListener('click', e => {
    if(e.target.closest('.cyc-pick')) return;
    const pal = PALETTES[el.dataset.i];
    if(activeDeckId && pal) getDeckCycle(activeDeckId).pal = pal;
    applyPalette(pal);
  }));
  document.querySelectorAll('#palette .cyc-pick').forEach(el=>el.addEventListener('click', e => {
    e.stopPropagation();
    const p = PALETTES[el.dataset.cyc];
    if(!p) return;
    const targetPool = activeDeckId ? getDeckCycle(activeDeckId).pool : palCycleSelected;
    if(targetPool.has(p.name)) targetPool.delete(p.name);
    else targetPool.add(p.name);
    if(activeDeckId) multiPreviewKey = '';
    else savePalCyclePool();
    renderPalettes();
    if(typeof syncPalCycleUI === 'function') syncPalCycleUI();
  }));
}
function toGradientString(colors){
  const n = colors.length;
  const stops = colors.map((hex,i)=>{
    const r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
    const pct = n===1?0:(i/(n-1)*100).toFixed(2);
    return `rgb(${r}, ${g}, ${b}) ${pct}%`;
  }).join(', ');
  return `linear-gradient(90deg, ${stops})`;
}
function buildColorPatch(effType, effConfig, colors, opts){
  const props = effectsSchema[effType]?.schema?.properties || effConfig || {};
  const has = k => Object.prototype.hasOwnProperty.call(props, k);
  const roleMap = opts?.roleMap || 'normal';
  const c0 = colors[0], c1 = colors[Math.floor((colors.length - 1) / 2)], c2 = colors[Math.max(0, colors.length - 2)], c3 = colors[colors.length - 1];
  const [cLow, cMid, cHigh] = roleMap === 'reverse' ? [c3, c1, c0]
    : roleMap === 'accent' ? [c3, c2, c0]
    : [c0, c1, c3];
  const grad = toGradientString(roleMap === 'reverse' ? [...colors].reverse() : colors);
  const patch = {};
  if(has('gradient')) patch.gradient = grad;
  if(has('use_gradient')) patch.use_gradient = true;
  if(has('power_gradient')) patch.power_gradient = grad;
  if(opts?.roll !== undefined && opts.roll >= 0 && has('gradient_roll')) patch.gradient_roll = Number(opts.roll);
  if(opts?.bgColor && has('background_color')) patch.background_color = opts.bgColor;
  if(has('color_lows')) patch.color_lows = cLow;
  if(has('color_mids')) patch.color_mids = cMid;
  if(has('color_high')) patch.color_high = cHigh;
  if(has('lows_color')) patch.lows_color = cLow;
  if(has('mids_color')) patch.mids_color = cMid;
  if(has('high_color')) patch.high_color = cHigh;
  if(has('color_low')) patch.color_low = cLow;
  if(has('color_mid')) patch.color_mid = cMid;
  if(has('color_min')) patch.color_min = cLow;
  if(has('color_max')) patch.color_max = cHigh;
  if(has('color_peak')) patch.color_peak = cHigh;
  if(has('peak_color')) patch.peak_color = cHigh;
  if(has('sparks_color')) patch.sparks_color = cHigh;
  if(has('center_color')) patch.center_color = cHigh;
  if(has('edge_color')) patch.edge_color = cLow;
  if(has('color_scan')) patch.color_scan = cHigh;
  if(has('strobe_color')) patch.strobe_color = cHigh;
  if(has('pixel_color')) patch.pixel_color = cHigh;
  if(has('flash_color')) patch.flash_color = cHigh;
  if(has('hit_color')) patch.hit_color = cHigh;
  if(has('text_color')) patch.text_color = cHigh;
  if(has('color')) patch.color = cHigh;
  return patch;
}

async function applyPalette(p, quiet, zoneOverride){
  if(!quiet && guardLock()) return;
  if(quiet && S.lock) return;
  const targetZone = zoneOverride !== undefined ? zoneOverride : (activeDeckId || '');
  if(targetZone) getDeckCycle(targetZone).pal = p;
  curPalette=p; if($('#stPal')) $('#stPal').textContent=p.name;
  syncPaletteDisplay();
  let ok=0, skip=0;
  const targetIds = targets(zoneOverride).filter(id => virtualsCache[id]?.effect?.type);
  const activeIds = targetIds.filter(id => virtualsCache[id]?.active);
  const runIds = activeIds.length ? activeIds : targetIds;
  for(const id of runIds){
    const v = virtualsCache[id];
    const patch = buildColorPatch(v.effect.type, v.effect.config, p.colors, p);
    if(!Object.keys(patch).length){ skip++; continue; }
    const nextCfg = { ...(v.effect.config || {}), ...patch };
    try{
      await api(`/virtuals/${id}/effects`, {method:'POST', body: JSON.stringify({type:v.effect.type, config:nextCfg})});
      v.effect.config = nextCfg;
      v.active = true;
      activePalettePatch[id] = patch;
      ok++;
    }catch(e){ skip++; }
  }
  if(activeDeckId && editingSceneId && runIds.some(id => id in sceneDraftVirtuals)){
    for(const id of runIds){
      if(sceneDraftVirtuals[id]?.config && activePalettePatch[id]){
        Object.assign(sceneDraftVirtuals[id].config, activePalettePatch[id]);
      }
    }
    const body = $('#sceneEditorBody');
    if(body){
      for(const id of runIds){
        const draft = sceneDraftVirtuals[id];
        if(!draft) continue;
        for(const [k, v] of Object.entries(activePalettePatch[id] || {})){
          const field = body.querySelector(`.se-field[data-vid="${CSS.escape(id)}"][data-key="${CSS.escape(k)}"]`);
          if(!field) continue;
          const inp = field.querySelector('[data-se-input]');
          if(inp){
            if(inp.type === 'checkbox') inp.checked = Boolean(v);
            else inp.value = String(v);
          }
          const gc = field.querySelector('[data-se-grad-canvas]');
          if(gc && typeof drawGradCanvas === 'function' && typeof parseGradientStops === 'function'){
            drawGradCanvas(gc, parseGradientStops(String(v)), -1, -1);
          }
          const hexEl = field.querySelector('.se-color-hex');
          if(hexEl) hexEl.textContent = String(v);
        }
      }
    }
  }
  if(!quiet) toast(skip ? `${p.name} applied to ${ok} virtual(s) (${skip} fixed-color skipped)` : `${p.name} applied`);
}

// ---- Global speed / sensitivity ----
let speedT, sensT;
$('#speedSlider').addEventListener('input', e=>{
  $('#speedVal').textContent = e.target.value+'%';
  clearTimeout(speedT); speedT = setTimeout(()=>setSpeed(e.target.value/100), 150);
});
$('#speedSlider').addEventListener('dblclick', ()=>{
  clearTimeout(speedT);
  const sid = activeDeckId && lastDeckScene[activeDeckId] ? lastDeckScene[activeDeckId] : lastScene;
  if(sid && sceneCtlMemory[sid]){ delete sceneCtlMemory[sid].spd; saveSceneCtlMemory(); }
  const { spd } = inferSceneCtlPct(sid);
  $('#speedSlider').value = spd; $('#speedVal').textContent = spd + '%';
  setSpeed(spd / 100, undefined, true);
});
$('#sensSlider').addEventListener('input', e=>{
  $('#sensVal').textContent = e.target.value+'%';
  clearTimeout(sensT); sensT = setTimeout(()=>setSensitivity(e.target.value/100), 150);
});
$('#sensSlider').addEventListener('dblclick', ()=>{
  clearTimeout(sensT);
  const sid = activeDeckId && lastDeckScene[activeDeckId] ? lastDeckScene[activeDeckId] : lastScene;
  if(sid && sceneCtlMemory[sid]){ delete sceneCtlMemory[sid].sns; saveSceneCtlMemory(); }
  const { sns } = inferSceneCtlPct(sid);
  $('#sensSlider').value = sns; $('#sensVal').textContent = sns + '%';
  setSensitivity(sns / 100, undefined, true);
});
function scaleAroundDefault(prop, val, inv){
  if(!prop || typeof prop !== 'object') return null;
  const min = typeof prop.minimum === 'number' ? prop.minimum : 0;
  const max = typeof prop.maximum === 'number' ? prop.maximum : 1;
  if(max <= min) return null;
  const u = inv ? (1 - val) : val;
  let def = typeof prop.default === 'number' ? prop.default : (min + (max - min) * 0.5);
  def = Math.max(min, Math.min(max, def));
  let out;
  if(u <= 0.5){
    const t = u / 0.5;
    out = min + (def - min) * Math.pow(t, 1.35);
  }else{
    const t = (u - 0.5) / 0.5;
    out = def + (max - def) * Math.pow(t, 1.5);
  }
  return prop.type === 'integer' ? Math.round(out) : Number(out.toFixed(4));
}

function buildSpeedPatch(effType, val){
  const props = effectsSchema[effType]?.schema?.properties || {};
  const has = k => Object.prototype.hasOwnProperty.call(props, k);
  const patch = {};
  if(has('step_period')){ const v = scaleAroundDefault(props.step_period, val, true); if(v !== null) patch.step_period = v; }
  if(has('scroll_time')){ const v = scaleAroundDefault(props.scroll_time, val, true); if(v !== null) patch.scroll_time = v; }
  if(has('speed')){ const v = scaleAroundDefault(props.speed, val, false); if(v !== null) patch.speed = v; }
  if(has('scroll_per_sec')){ const v = scaleAroundDefault(props.scroll_per_sec, val, false); if(v !== null) patch.scroll_per_sec = v; }
  if(has('gradient_speed')){ const v = scaleAroundDefault(props.gradient_speed, val, false); if(v !== null) patch.gradient_speed = v; }
  if(has('roll_speed')){ const v = scaleAroundDefault(props.roll_speed, val, false); if(v !== null) patch.roll_speed = v; }
  if(has('base_game_speed')){ const v = scaleAroundDefault(props.base_game_speed, val, false); if(v !== null) patch.base_game_speed = v; }
  if(has('add_speed')){ const v = scaleAroundDefault(props.add_speed, val, false); if(v !== null) patch.add_speed = v; }
  if(!Object.keys(patch).length){
    if(has('strobe_decay')){ const v = scaleAroundDefault(props.strobe_decay, val, true); if(v !== null) patch.strobe_decay = v; }
    else if(has('decay')){ const v = scaleAroundDefault(props.decay, val, true); if(v !== null) patch.decay = v; }
    else if(has('strobe_decay_rate')){ const v = scaleAroundDefault(props.strobe_decay_rate, val, true); if(v !== null) patch.strobe_decay_rate = v; }
    else if(has('gradient_roll')){ const v = scaleAroundDefault(props.gradient_roll, val, false); if(v !== null) patch.gradient_roll = v; }
  }
  return patch;
}

function buildSensPatch(effType, val){
  const props = effectsSchema[effType]?.schema?.properties || {};
  const has = k => Object.prototype.hasOwnProperty.call(props, k);
  const patch = {};
  for(const k of ['reactivity','sensitivity','multiplier','power_multiplier','spin_multiplier','size_multiplication','speed_multiplication']){
    if(has(k)){ const v = scaleAroundDefault(props[k], val, false); if(v !== null) patch[k] = v; }
  }
  for(const k of ['lows_sensitivity','mids_sensitivity','high_sensitivity','threshold','threshold_lows','threshold_mids','sparkles_threshold','strobe_threshold']){
    if(has(k)){ const v = scaleAroundDefault(props[k], val, true); if(v !== null) patch[k] = v; }
  }
  return patch;
}

let sceneCtlMemory = {};
try{ sceneCtlMemory = JSON.parse(localStorage.getItem('ledfx_scene_ctl_memory') || '{}') || {}; }catch(e){}
function saveSceneCtlMemory(){
  try{ localStorage.setItem('ledfx_scene_ctl_memory', JSON.stringify(sceneCtlMemory)); }catch(e){}
}
function unscaleAroundDefault(prop, curVal, inv){
  if(!prop || typeof prop !== 'object' || typeof curVal !== 'number') return null;
  const min = typeof prop.minimum === 'number' ? prop.minimum : 0;
  const max = typeof prop.maximum === 'number' ? prop.maximum : 1;
  if(max <= min) return null;
  let def = typeof prop.default === 'number' ? prop.default : (min + (max - min) * 0.5);
  def = Math.max(min, Math.min(max, def));
  const clamped = Math.max(min, Math.min(max, curVal));
  let u;
  if(clamped <= def){
    const denom = Math.max(1e-6, def - min);
    u = 0.5 * Math.pow((clamped - min) / denom, 1 / 1.35);
  }else{
    const denom = Math.max(1e-6, max - def);
    u = 0.5 + 0.5 * Math.pow((clamped - def) / denom, 1 / 1.5);
  }
  const val = inv ? (1 - u) : u;
  return Math.max(0, Math.min(100, Math.round(val * 100)));
}
const deckCardCtl = {};
function getDeckCardCtl(deckId){
  if(!deckCardCtl[deckId]) deckCardCtl[deckId] = { bri: 80, spd: 50, sns: 50 };
  return deckCardCtl[deckId];
}
const SPEED_INFER_KEYS = [
  ['step_period', true], ['scroll_time', true],
  ['speed', false], ['scroll_per_sec', false], ['gradient_speed', false], ['roll_speed', false],
  ['base_game_speed', false], ['add_speed', false],
  ['strobe_decay', true], ['decay', true], ['strobe_decay_rate', true], ['gradient_roll', false],
];
const SENS_INFER_KEYS = [
  ['reactivity', false], ['sensitivity', false], ['multiplier', false], ['power_multiplier', false],
  ['spin_multiplier', false], ['size_multiplication', false], ['speed_multiplication', false],
  ['lows_sensitivity', true], ['mids_sensitivity', true], ['high_sensitivity', true],
  ['threshold', true], ['threshold_lows', true], ['threshold_mids', true],
  ['sparkles_threshold', true], ['strobe_threshold', true],
];
function inferSceneCtlPct(sceneId){
  const sc = scenesCache[sceneId];
  if(!sc || !sc.virtuals) return { spd: 50, sns: 50 };
  let spd = null, sns = null;
  for(const eff of Object.values(sc.virtuals)){
    if(!eff || !eff.type) continue;
    const props = effectsSchema[eff.type]?.schema?.properties || {};
    const cfg = eff.config || {};
    if(spd === null){
      for(const [k, inv] of SPEED_INFER_KEYS){
        if(typeof cfg[k] === 'number' && props[k]){
          const p = unscaleAroundDefault(props[k], cfg[k], inv);
          if(p !== null){ spd = p; break; }
        }
      }
    }
    if(sns === null){
      for(const [k, inv] of SENS_INFER_KEYS){
        if(typeof cfg[k] === 'number' && props[k]){
          const p = unscaleAroundDefault(props[k], cfg[k], inv);
          if(p !== null){ sns = p; break; }
        }
      }
    }
    if(spd !== null && sns !== null) break;
  }
  return { spd: spd ?? 50, sns: sns ?? 50 };
}
function syncMainCtlSliders(){
  const sid = activeDeckId ? lastDeckScene[activeDeckId] : lastScene;
  const dc = activeDeckId ? getDeckCardCtl(activeDeckId) : null;
  const mem = sid ? (sceneCtlMemory[sid] || {}) : {};
  const inferred = sid ? inferSceneCtlPct(sid) : { spd: 50, sns: 50 };
  const spdPct = mem.spd !== undefined ? mem.spd : (dc ? dc.spd : inferred.spd);
  const snsPct = mem.sns !== undefined ? mem.sns : (dc ? dc.sns : inferred.sns);
  if($('#speedSlider')) $('#speedSlider').value = spdPct;
  if($('#speedVal')) $('#speedVal').textContent = spdPct + '%';
  if($('#sensSlider')) $('#sensSlider').value = snsPct;
  if($('#sensVal')) $('#sensVal').textContent = snsPct + '%';
}
function recordSceneCtl(key, pct, zoneOverride){
  const sid = (zoneOverride && lastDeckScene[zoneOverride]) ? lastDeckScene[zoneOverride] : (activeDeckId && lastDeckScene[activeDeckId] ? lastDeckScene[activeDeckId] : lastScene);
  if(!sid || sid === '—' || !scenesCache[sid]) return;
  if(!sceneCtlMemory[sid]) sceneCtlMemory[sid] = {};
  sceneCtlMemory[sid][key] = Math.round(pct);
  saveSceneCtlMemory();
}
async function restoreSceneCtl(sceneId, deckId){
  const mem = sceneCtlMemory[sceneId] || {};
  const inferred = inferSceneCtlPct(sceneId);
  const spdPct = mem.spd !== undefined ? mem.spd : inferred.spd;
  const snsPct = mem.sns !== undefined ? mem.sns : inferred.sns;
  const targetDeck = deckId || activeDeckId;
  if(targetDeck){
    const dc = getDeckCardCtl(targetDeck);
    dc.spd = spdPct;
    dc.sns = snsPct;
  }
  if(!deckId || deckId === activeDeckId){
    if($('#speedSlider')) $('#speedSlider').value = spdPct;
    if($('#speedVal')) $('#speedVal').textContent = spdPct + '%';
    if($('#sensSlider')) $('#sensSlider').value = snsPct;
    if($('#sensVal')) $('#sensVal').textContent = snsPct + '%';
  }
  if(targetDeck){
    const card = document.querySelector(`.lprev-card[data-deck="${CSS.escape(targetDeck)}"]`);
    if(card){
      const spEl = card.querySelector('[data-ctl="spd"]'), spVal = card.querySelector('[data-val="spd"]');
      if(spEl) spEl.value = spdPct;
      if(spVal) spVal.textContent = spdPct + '%';
      const snEl = card.querySelector('[data-ctl="sns"]'), snVal = card.querySelector('[data-val="sns"]');
      if(snEl) snEl.value = snsPct;
      if(snVal) snVal.textContent = snsPct + '%';
    }
  }
  if(mem.spd !== undefined) await setSpeed(spdPct / 100, deckId, true);
  if(mem.sns !== undefined) await setSensitivity(snsPct / 100, deckId, true);
}

function patchVirtualConfigCache(id, patch){
  const eff = virtualsCache[id]?.effect;
  if(!eff || !patch || typeof patch !== 'object') return;
  if(!eff.config || typeof eff.config !== 'object') eff.config = {};
  Object.assign(eff.config, patch);
}

async function setSpeed(val, zoneOverride, skipRecord){
  const z = zoneOverride || activeDeckId || '';
  if(z) getDeckCardCtl(z).spd = Math.round(val * 100);
  if(!skipRecord) recordSceneCtl('spd', val * 100, zoneOverride);
  for(const id of targets(zoneOverride)){
    const v = virtualsCache[id];
    if(!v?.effect?.type) continue;
    const patch = buildSpeedPatch(v.effect.type, val);
    if(!Object.keys(patch).length) continue;
    try{
      await api(`/virtuals/${id}/effects`, {method:'PUT', body: JSON.stringify({config:patch})});
      patchVirtualConfigCache(id, patch);
    }catch(e){}
  }
}
async function setZoneBrightness(val, zoneOverride){
  const z = zoneOverride || activeDeckId || '';
  if(z) getDeckCardCtl(z).bri = Math.round(val * 100);
  const patch = {brightness:val};
  for(const id of targets(zoneOverride)){
    const v = virtualsCache[id];
    if(!v?.effect?.type) continue;
    try{
      await api(`/virtuals/${id}/effects`, {method:'PUT', body: JSON.stringify({config:patch})});
      patchVirtualConfigCache(id, patch);
    }catch(e){}
  }
}
async function setSensitivity(val, zoneOverride, skipRecord){
  const z = zoneOverride || activeDeckId || '';
  if(z) getDeckCardCtl(z).sns = Math.round(val * 100);
  if(!skipRecord) recordSceneCtl('sns', val * 100, zoneOverride);
  const jobs = [];
  if(!zoneOverride && !activeDeckId && !mainTargetZone && S.target === 'All'){
    const min_volume = Number((Math.pow(1 - val, 1.5) * 0.25).toFixed(4));
    if(typeof eqState !== 'undefined') eqState.min_volume = min_volume;
    if($('#audioMinVolSlider')) $('#audioMinVolSlider').value = min_volume;
    if($('#audioMinVolVal')) $('#audioMinVolVal').textContent = min_volume.toFixed(2);
    jobs.push(api('/config', {method:'PUT', body: JSON.stringify({audio:{min_volume}})}).catch(e=>{ toast('Sensitivity update failed: '+e.message, true); }));
  }
  for(const id of targets(zoneOverride)){
    const v = virtualsCache[id];
    if(!v?.effect?.type) continue;
    const patch = buildSensPatch(v.effect.type, val);
    if(Object.keys(patch).length){
      jobs.push(api(`/virtuals/${id}/effects`, {method:'PUT', body: JSON.stringify({config:patch})}).then(()=>{ patchVirtualConfigCache(id, patch); }).catch(()=>{}));
    }
  }
  await Promise.all(jobs);
}

// ---- Hits (momentary Hold-to-FX pads via /api/virtuals_tools oneshot overlays & safe effect ramps) ----
const HITS = [
  {name:'Hold Blackout', kind:'hold-overlay', color:'#000000', cls:'hit-blackout', kbd:'Z', badge:'HOLD'},
  {name:'Hold Strobe', kind:'strobe', cls:'hit-strobe', kbd:'X', badge:'HOLD'},
  {name:'Hold Blinder', kind:'hold-overlay', color:'#fff5e4', cls:'hit-blinder', kbd:'C', badge:'HOLD'},
  {name:'Build Up', kind:'buildup', cls:'hit-build', kbd:'V', badge:'HOLD'},
  {name:'Flash', kind:'oneshot', color:'white', ramp:10, hold:150, fade:300},
  {name:'Bloom', kind:'oneshot', color:'white', ramp:400, hold:100, fade:1200},
  {name:'Palette Punch', kind:'punch'},
  {name:'Hold Dim', kind:'hold-dim', cls:'', badge:'HOLD'},
];
const hitSnapshots = {}, hitIntervals = {}, hitPressTokens = {}, buildUpState = {}, hitHoldPending = {}, activeOverlayHolds = {}, activeHoldMeta = {};
const FX_SETTINGS_KEY = 'ledfx_fx_pad_settings_v2';
const FX_SETTINGS_LEGACY_KEY = 'ledfx_fx_pad_settings';
const DEFAULT_FX_SETTINGS = { strobeColor:'#ffffff', strobeUsePalette:false, strobeRate:'1/4b', strobeFeel:'punch', strobeBri:100, punchAuto:true, punchColor:'#e84a0c', buildBars:4 };
let fxLegacySeed = null;
try{
  const leg = JSON.parse(localStorage.getItem(FX_SETTINGS_LEGACY_KEY) || 'null');
  if(leg && typeof leg === 'object') fxLegacySeed = { ...DEFAULT_FX_SETTINGS, ...leg };
}catch(e){}
const fxPadSettingsMap = (() => {
  try{
    const raw = JSON.parse(localStorage.getItem(FX_SETTINGS_KEY) || 'null');
    if(raw && typeof raw === 'object') return raw;
  }catch(e){}
  return {};
})();
function fxZoneKey(zoneOverride){
  return zoneOverride || (typeof activeDeckId !== 'undefined' && activeDeckId) || (typeof mainTargetZone !== 'undefined' && mainTargetZone) || 'main';
}
function getFxPadSettings(zoneOverride){
  const k = fxZoneKey(zoneOverride);
  if(!fxPadSettingsMap[k]){
    fxPadSettingsMap[k] = { ...(fxLegacySeed || DEFAULT_FX_SETTINGS) };
  }else{
    fxPadSettingsMap[k] = { ...DEFAULT_FX_SETTINGS, ...fxPadSettingsMap[k] };
  }
  return fxPadSettingsMap[k];
}
function saveFxPadSettings(){
  try{ localStorage.setItem(FX_SETTINGS_KEY, JSON.stringify(fxPadSettingsMap)); }catch(e){}
}
function renderFxSettingsHtml(){
  return `
    <div class="fx-set-group">
      <span class="fx-set-lbl">Strobe</span>
      <input type="color" data-fx="strobeColor" class="fx-color-in" value="#ffffff" title="Hold Strobe flash color">
      <button type="button" class="tgl" data-fx="strobeUsePalette" title="Cycle active palette colors on each strobe flash">Palette</button>
      <select data-fx="strobeRate" title="Hold Strobe trigger rate">
        <option value="1/2b">1/2 Beat</option>
        <option value="1/4b">1/4 Beat</option>
        <option value="1/8b">1/8 Beat</option>
        <option value="3hz">3 Hz</option>
        <option value="6hz">6 Hz</option>
        <option value="10hz">10 Hz</option>
      </select>
      <select data-fx="strobeFeel" title="Flash pulse envelope">
        <option value="sharp">Sharp 16ms</option>
        <option value="punch">Punch 32ms</option>
        <option value="wash">Wash 95ms</option>
      </select>
      <label class="fx-bri-wrap" title="Hold Strobe brightness">
        <span>Bri</span>
        <input type="range" data-fx="strobeBri" min="20" max="100" step="5" value="100">
        <span class="fx-bri-val" data-fx-val="strobeBri">100%</span>
      </label>
    </div>
    <div class="fx-set-group">
      <span class="fx-set-lbl">Punch</span>
      <button type="button" class="tgl on" data-fx="punchAuto" title="Use active palette accent color automatically">Auto Palette</button>
      <input type="color" data-fx="punchColor" class="fx-color-in" value="#e84a0c" title="Custom Palette Punch color (switches off Auto Palette)">
      <span class="fx-set-lbl">Build</span>
      <select data-fx="buildBars" title="Build Up pad duration">
        <option value="4">4 Bar</option>
        <option value="8">8 Bar</option>
      </select>
    </div>`;
}
function syncFxSettingsContainer(el, zoneId){
  if(!el) return;
  const s = getFxPadSettings(zoneId);
  const col = el.querySelector('[data-fx="strobeColor"]');
  if(col) col.value = s.strobeColor || '#ffffff';
  const pal = el.querySelector('[data-fx="strobeUsePalette"]');
  if(pal){
    pal.classList.toggle('on', !!s.strobeUsePalette);
    pal.textContent = s.strobeUsePalette ? 'Palette ON' : 'Palette';
  }
  const rate = el.querySelector('[data-fx="strobeRate"]');
  if(rate) rate.value = s.strobeRate || '1/4b';
  const feel = el.querySelector('[data-fx="strobeFeel"]');
  if(feel) feel.value = s.strobeFeel || 'punch';
  const bri = el.querySelector('[data-fx="strobeBri"]');
  if(bri) bri.value = s.strobeBri ?? 100;
  const briVal = el.querySelector('[data-fx-val="strobeBri"]');
  if(briVal) briVal.textContent = (s.strobeBri ?? 100) + '%';
  const pAuto = el.querySelector('[data-fx="punchAuto"]');
  if(pAuto){
    pAuto.classList.toggle('on', !!s.punchAuto);
    pAuto.textContent = s.punchAuto ? 'Auto Palette' : 'Custom Color';
  }
  const pCol = el.querySelector('[data-fx="punchColor"]');
  if(pCol) pCol.value = s.punchColor || '#e84a0c';
  const bSel = el.querySelector('[data-fx="buildBars"]');
  if(bSel) bSel.value = String(s.buildBars || 4);
}
function syncAllFxSettingsForZone(zoneId){
  const zk = fxZoneKey(zoneId);
  const s = getFxPadSettings(zk);
  if(zk === fxZoneKey()){
    syncFxSettingsContainer($('#deckFxSettingsBar'), zk);
    if($('#buildBarsSel')) $('#buildBarsSel').value = String(s.buildBars || 4);
  }
  const box = document.querySelector(`.lprev-fx-bar[data-fx-box="${CSS.escape(zk)}"]`);
  if(box) syncFxSettingsContainer(box, zk);
}
function bindFxSettingsBox(el, zoneId){
  if(!el) return;
  syncFxSettingsContainer(el, zoneId);
  if(el.dataset.fxBound === zoneId) return;
  el.dataset.fxBound = zoneId;
  const stop = e => e.stopPropagation();
  el.addEventListener('click', stop);
  el.querySelector('[data-fx="strobeColor"]')?.addEventListener('input', e => {
    e.stopPropagation();
    const s = getFxPadSettings(zoneId);
    s.strobeColor = e.target.value;
    s.strobeUsePalette = false;
    saveFxPadSettings();
    syncAllFxSettingsForZone(zoneId);
  });
  el.querySelector('[data-fx="strobeUsePalette"]')?.addEventListener('click', e => {
    e.stopPropagation();
    const s = getFxPadSettings(zoneId);
    s.strobeUsePalette = !s.strobeUsePalette;
    saveFxPadSettings();
    syncAllFxSettingsForZone(zoneId);
  });
  el.querySelector('[data-fx="strobeRate"]')?.addEventListener('change', e => {
    e.stopPropagation();
    getFxPadSettings(zoneId).strobeRate = e.target.value;
    saveFxPadSettings();
    syncAllFxSettingsForZone(zoneId);
  });
  el.querySelector('[data-fx="strobeFeel"]')?.addEventListener('change', e => {
    e.stopPropagation();
    getFxPadSettings(zoneId).strobeFeel = e.target.value;
    saveFxPadSettings();
    syncAllFxSettingsForZone(zoneId);
  });
  el.querySelector('[data-fx="strobeBri"]')?.addEventListener('input', e => {
    e.stopPropagation();
    getFxPadSettings(zoneId).strobeBri = Math.max(20, Math.min(100, Number(e.target.value) || 100));
    saveFxPadSettings();
    syncAllFxSettingsForZone(zoneId);
  });
  el.querySelector('[data-fx="punchAuto"]')?.addEventListener('click', e => {
    e.stopPropagation();
    const s = getFxPadSettings(zoneId);
    s.punchAuto = !s.punchAuto;
    saveFxPadSettings();
    syncAllFxSettingsForZone(zoneId);
  });
  el.querySelector('[data-fx="punchColor"]')?.addEventListener('input', e => {
    e.stopPropagation();
    const s = getFxPadSettings(zoneId);
    s.punchColor = e.target.value;
    s.punchAuto = false;
    saveFxPadSettings();
    syncAllFxSettingsForZone(zoneId);
  });
  el.querySelector('[data-fx="buildBars"]')?.addEventListener('change', e => {
    e.stopPropagation();
    getFxPadSettings(zoneId).buildBars = Number(e.target.value) || 4;
    saveFxPadSettings();
    syncAllFxSettingsForZone(zoneId);
  });
}
function renderDeckFxSettings(){
  const bar = $('#deckFxSettingsBar');
  const zk = fxZoneKey();
  if($('#buildBarsSel')) $('#buildBarsSel').value = String(getFxPadSettings(zk).buildBars || 4);
  $('#deckFxSettingsBtn')?.classList.toggle('on', !!(bar && !bar.hidden));
  if(!bar) return;
  bar.innerHTML = renderFxSettingsHtml();
  delete bar.dataset.fxBound;
  bindFxSettingsBox(bar, zk);
}
function getStrobeParams(zoneOverride){
  const s = getFxPadSettings(zoneOverride);
  const effBpm = bpm >= 30 ? bpm : 128;
  const r = s.strobeRate || '1/4b';
  let ms = 120;
  if(r === '1/2b') ms = Math.round(30000 / effBpm);
  else if(r === '1/4b') ms = Math.round(15000 / effBpm);
  else if(r === '1/8b') ms = Math.round(7500 / effBpm);
  else if(r === '3hz') ms = 333;
  else if(r === '6hz') ms = 167;
  else if(r === '10hz') ms = 100;
  ms = Math.max(S.guard ? 220 : 65, ms);

  const feel = s.strobeFeel || 'punch';
  let ramp = 1, hold = 32, fade = 32;
  if(feel === 'sharp'){ ramp = 1; hold = 16; fade = 16; }
  else if(feel === 'wash'){ ramp = 5; hold = 65; fade = 95; }
  if(hold + fade >= ms){
    hold = Math.max(10, Math.floor(ms * 0.4));
    fade = Math.max(12, Math.floor(ms * 0.45));
  }
  const bri = Math.max(0.2, Math.min(1.0, (Number(s.strobeBri) || 100) / 100));
  return { ms, ramp, hold, fade, bri };
}
$('#deckFxSettingsBtn')?.addEventListener('click', () => {
  const bar = $('#deckFxSettingsBar');
  if(!bar) return;
  bar.hidden = !bar.hidden;
  renderDeckFxSettings();
});
$('#buildBarsSel')?.addEventListener('change', e => {
  const zk = fxZoneKey();
  getFxPadSettings(zk).buildBars = Number(e.target.value) || 4;
  saveFxPadSettings();
  syncAllFxSettingsForZone(zk);
});
renderDeckFxSettings();
function resolveHitZone(zoneOverride){
  return zoneOverride !== undefined ? zoneOverride : (activeDeckId || mainTargetZone || '');
}
function zoneHoldKey(effZone, effTarget){
  return `${effZone || 'all'}:${effTarget || 'All'}`;
}
function hitKey(h, zoneOverride){ return `${zoneOverride || 'main'}:${h.name}`; }
function zoneHoldSet(keyOrZone){
  const zk = (typeof keyOrZone === 'string' && keyOrZone.includes(':'))
    ? keyOrZone
    : zoneHoldKey(resolveHitZone(keyOrZone), S.target);
  if(!activeOverlayHolds[zk]) activeOverlayHolds[zk] = new Set();
  return activeOverlayHolds[zk];
}
function cancelActiveHits(){
  for(const btn of document.querySelectorAll('.hit-btn.active')){
    if(typeof btn._hitRelease === 'function'){
      btn._hitRelease();
    }else{
      btn.classList.remove('active');
      const prog = btn.querySelector('.hit-prog');
      if(prog) prog.style.width = '0%';
    }
  }
  for(const k of Object.keys(hitIntervals)){
    clearInterval(hitIntervals[k]);
    delete hitIntervals[k];
  }
  for(const k of Object.keys(buildUpState)){
    delete buildUpState[k];
  }
  for(const k of Object.keys(activeHoldMeta)){
    delete activeHoldMeta[k];
  }
}
function renderHits(){
  $('#hits').innerHTML = HITS.map((h,i)=>`<button type="button" class="hit-btn ${h.cls||''}" data-i="${i}">${h.badge?`<span class="hit-badge">${escHtml(h.badge)}</span>`:''}${h.kbd?`<span class="hit-kbd">${escHtml(h.kbd)}</span>`:''}<span class="hit-lbl">${escHtml(h.name)}</span><span class="hit-prog"></span></button>`).join('');
  document.querySelectorAll('#hits .hit-btn').forEach(btn=>{
    const h = HITS[btn.dataset.i];
    if(!h) return;
    btn.addEventListener('pointerdown', e=>{
      try{ btn.setPointerCapture(e.pointerId); }catch(_){}
      hitDown(h, btn);
    });
    btn.addEventListener('pointerup', e=>{
      try{ if(btn.hasPointerCapture && btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId); }catch(_){}
      hitUp(h, btn);
    });
    btn.addEventListener('pointercancel', ()=>hitUp(h, btn));
    btn.addEventListener('lostpointercapture', ()=>hitUp(h, btn));
    btn.addEventListener('pointerleave', e=>{
      if(!(btn.hasPointerCapture && btn.hasPointerCapture(e.pointerId))) hitUp(h, btn);
    });
  });
}
function activeHitVirtualIds(zoneOverride){
  return targets(zoneOverride).filter(id => virtualsCache[id]?.active);
}
async function tool(body, method, zoneOverride, explicitIds){
  const m = method || (body?.tool === 'oneshot' ? 'POST' : 'PUT');
  if(Array.isArray(explicitIds)){
    if(!explicitIds.length) return;
    await Promise.all(explicitIds.map(id=>api(`/virtuals_tools/${id}`, {method:m, body: JSON.stringify(body)}).catch(()=>{})));
    return;
  }
  if(explicitIds === null) return api('/virtuals_tools', {method:m, body: JSON.stringify(body)});
  const effZone = resolveHitZone(zoneOverride);
  if(!effZone && S.target==='All') return api('/virtuals_tools', {method:m, body: JSON.stringify(body)});
  const ids = activeHitVirtualIds(effZone);
  if(!ids.length) return;
  await Promise.all(ids.map(id=>api(`/virtuals_tools/${id}`, {method:m, body: JSON.stringify(body)}).catch(()=>{})));
}
function readHitSpeed(btn){
  const cardSpd = btn?.closest('.lprev-card')?.querySelector('[data-ctl="spd"]');
  const el = cardSpd || $('#speedSlider');
  return Number(el ? el.value : 50) / 100;
}
function readHitBri(btn){
  const cardBri = btn?.closest('.lprev-card')?.querySelector('[data-ctl="bri"]');
  const el = cardBri || $('#briSlider');
  return Number(el ? el.value : 80) / 100;
}
function syncHitSliders(spd01, bri01, btn, zoneOverride){
  const spdPct = Math.round(spd01 * 100);
  const briPct = Math.round(bri01 * 100);
  const card = btn?.closest('.lprev-card') || (zoneOverride ? document.querySelector(`.lprev-card[data-deck="${CSS.escape(zoneOverride)}"]`) : null);
  if(card){
    const spEl = card.querySelector('[data-ctl="spd"]'), spVal = card.querySelector('[data-val="spd"]');
    if(spEl) spEl.value = spdPct;
    if(spVal) spVal.textContent = spdPct + '%';
    const brEl = card.querySelector('[data-ctl="bri"]'), brVal = card.querySelector('[data-val="bri"]');
    if(brEl) brEl.value = briPct;
    if(brVal) brVal.textContent = briPct + '%';
  }
  if(!zoneOverride || zoneOverride === activeDeckId){
    if($('#speedSlider')) $('#speedSlider').value = spdPct;
    if($('#speedVal')) $('#speedVal').textContent = spdPct + '%';
    if($('#briSlider')) $('#briSlider').value = briPct;
    if($('#briVal')) $('#briVal').textContent = briPct + '%';
  }
}
async function hitDown(h, btn, zoneOverride){
  if(!h || !btn || btn.classList.contains('active')) return;
  const key = hitKey(h, zoneOverride);
  const tok = (hitPressTokens[key] = (hitPressTokens[key] || 0) + 1);
  const effZone = resolveHitZone(zoneOverride);
  const effTarget = S.target || 'All';
  const holdKey = zoneHoldKey(effZone, effTarget);
  const useGlobalAll = !effZone && effTarget === 'All';
  const capturedIds = useGlobalAll ? null : activeHitVirtualIds(effZone);
  const meta = { effZone, effTarget, holdKey, useGlobalAll, ids: capturedIds || [] };
  btn.classList.add('active');
  btn._hitRelease = () => hitUp(h, btn, zoneOverride);
  if(h.kind==='oneshot'||h.kind==='punch'){
    await quantWait(S.qnt);
    if(hitPressTokens[key] !== tok) return;
    if(!btn.classList.contains('active')){
      btn.classList.add('active');
      setTimeout(()=>{ if(hitPressTokens[key] === tok) btn.classList.remove('active'); }, 150);
    }
  }
  try{
    if(h.kind==='oneshot'){ const m=INT[S.int]; await tool({tool:'oneshot', color:h.color, ramp:h.ramp, hold:Math.round(h.hold*m), fade:Math.round(h.fade*m)}, 'POST', meta.effZone, meta.useGlobalAll ? null : meta.ids); }
    else if(h.kind==='punch'){ const fxs = getFxPadSettings(meta.effZone); const c = fxs.punchAuto ? (curPalette.colors[2] || curPalette.colors[curPalette.colors.length - 1] || '#e84a0c') : (fxs.punchColor || '#e84a0c'); const m=INT[S.int]; await tool({tool:'oneshot', color:c, ramp:10, hold:Math.round(120*m), fade:Math.round(250*m)}, 'POST', meta.effZone, meta.useGlobalAll ? null : meta.ids); }
    else if(h.kind==='hold-overlay'){
      activeHoldMeta[key] = meta;
      const holdSet = zoneHoldSet(meta.holdKey);
      holdSet.add(key);
      const p = tool({tool:'oneshot', color:h.color, ramp:1, hold:60000, fade:1, brightness:1.0}, 'POST', meta.effZone, meta.useGlobalAll ? null : meta.ids).catch(()=>{});
      hitHoldPending[key] = p;
      await p;
      if(hitHoldPending[key] === p) delete hitHoldPending[key];
    }
    else if(h.kind==='hold-dim'){
      activeHoldMeta[key] = meta;
      const ids = activeHitVirtualIds(meta.effZone).filter(id => virtualsCache[id]?.effect?.type);
      const snap = {};
      for(const id of ids){
        const curB = virtualsCache[id]?.effect?.config?.brightness;
        snap[id] = typeof curB === 'number' ? curB : 1.0;
      }
      hitSnapshots[key] = snap;
      const p = Promise.all(ids.map(id =>
        api(`/virtuals/${id}/effects`, {method:'PUT', body: JSON.stringify({config:{brightness: 0.15}})})
          .then(()=>{ patchVirtualConfigCache(id, {brightness: 0.15}); })
          .catch(()=>{})
      ));
      hitHoldPending[key] = p;
      await p;
      if(hitHoldPending[key] === p) delete hitHoldPending[key];
    }
    else if(h.kind==='buildup'){
      activeHoldMeta[key] = meta;
      if(hitIntervals[key]){ clearInterval(hitIntervals[key]); delete hitIntervals[key]; }
      const bars = Number(getFxPadSettings(meta.effZone).buildBars) || Number($('#buildBarsSel')?.value) || 4;
      const effBpm = bpm || 128;
      const totalMs = (60000 / effBpm) * (bars * 4);
      const ids = activeHitVirtualIds(meta.effZone).filter(id => virtualsCache[id]?.effect?.type);
      const baseVirt = {};
      for(const id of ids){
        const eff = virtualsCache[id].effect;
        const cfg = eff.config || {};
        const restoreCfg = {};
        for(const [k] of SPEED_INFER_KEYS){
          if(k in cfg) restoreCfg[k] = cfg[k];
        }
        if('brightness' in cfg) restoreCfg.brightness = cfg.brightness;
        baseVirt[id] = { type: eff.type, restoreCfg };
      }
      const st = buildUpState[key] = {
        startAt: Date.now(),
        totalMs,
        baseSpd: readHitSpeed(btn),
        baseBri: readHitBri(btn),
        baseVirt,
        pct: 0,
        zoneOverride: meta.effZone,
        btn,
        lastPulseAt: 0,
        dropped: false,
        busy: false,
        pending: null,
      };
      hitIntervals[key] = setInterval(()=>{
        if(!btn.classList.contains('active') || hitPressTokens[key] !== tok){
          clearInterval(hitIntervals[key]);
          delete hitIntervals[key];
          return;
        }
        const now = Date.now();
        const pct = Math.min(1, (now - st.startAt) / st.totalMs);
        st.pct = pct;
        const prog = btn.querySelector('.hit-prog');
        if(prog) prog.style.width = (pct * 100).toFixed(1) + '%';
        if(!st.dropped){
          const spd = st.baseSpd + (1 - st.baseSpd) * pct;
          const bri = Math.min(1, st.baseBri + (1 - st.baseBri) * (pct * 0.85));
          syncHitSliders(spd, bri, btn, meta.effZone);
          if(!st.busy){
            st.busy = true;
            const reqs = Object.entries(st.baseVirt).map(([id, info]) => {
              const patch = { ...buildSpeedPatch(info.type, spd), brightness: Number(bri.toFixed(4)) };
              return api(`/virtuals/${id}/effects`, {method:'PUT', body: JSON.stringify({config: patch})})
                .then(()=>{ patchVirtualConfigCache(id, patch); })
                .catch(()=>{});
            });
            st.pending = Promise.all(reqs).finally(()=>{ st.busy = false; });
          }
          if(pct >= 0.72 && now - st.lastPulseAt >= (S.guard ? 420 : 300)){
            st.lastPulseAt = now;
            tool({tool:'oneshot', color:'white', ramp:5, hold:35, fade:80}, 'POST', meta.effZone, meta.useGlobalAll ? null : meta.ids).catch(()=>{});
          }
          if(pct >= 1){
            st.dropped = true;
            clearInterval(hitIntervals[key]);
            delete hitIntervals[key];
            tool({tool:'oneshot', color:'white', ramp:5, hold:160, fade:450}, 'POST', meta.effZone, meta.useGlobalAll ? null : meta.ids).catch(()=>{});
          }
        }
      }, 200);
    }
    else if(h.kind==='strobe'){
      activeHoldMeta[key] = meta;
      if(hitIntervals[key]){ clearInterval(hitIntervals[key]); delete hitIntervals[key]; }
      let stepIdx = 0;
      const fireStrobe = () => {
        const fxs = getFxPadSettings(meta.effZone);
        const sp = getStrobeParams(meta.effZone);
        const palCols = (curPalette && Array.isArray(curPalette.colors) && curPalette.colors.length) ? curPalette.colors : ['#ffffff'];
        const col = fxs.strobeUsePalette ? palCols[(stepIdx++) % palCols.length] : (fxs.strobeColor || '#ffffff');
        tool({tool:'oneshot', color:col, ramp:sp.ramp, hold:sp.hold, fade:sp.fade, brightness:sp.bri}, 'POST', meta.effZone, meta.useGlobalAll ? null : meta.ids).catch(()=>{});
      };
      const sp0 = getStrobeParams(meta.effZone);
      fireStrobe();
      hitIntervals[key] = setInterval(fireStrobe, sp0.ms);
    }
  }catch(e){ toast(h.name+' failed: '+e.message, true); }
}
async function hitUp(h, btn, zoneOverride){
  if(!btn || !btn.classList.contains('active')) return;
  const key = hitKey(h, zoneOverride);
  const meta = activeHoldMeta[key] || (() => {
    const effZone = resolveHitZone(zoneOverride);
    const effTarget = S.target || 'All';
    const useGlobalAll = !effZone && effTarget === 'All';
    return {
      effZone,
      effTarget,
      holdKey: zoneHoldKey(effZone, effTarget),
      useGlobalAll,
      ids: useGlobalAll ? [] : activeHitVirtualIds(effZone),
    };
  })();
  delete activeHoldMeta[key];
  if(h.kind !== 'oneshot' && h.kind !== 'punch'){
    hitPressTokens[key] = (hitPressTokens[key] || 0) + 1;
  }
  btn.classList.remove('active');
  delete btn._hitRelease;
  const prog = btn.querySelector('.hit-prog');
  if(prog) prog.style.width = '0%';
  if(h.kind==='buildup'){
    if(hitIntervals[key]){ clearInterval(hitIntervals[key]); delete hitIntervals[key]; }
    const st = buildUpState[key];
    delete buildUpState[key];
    if(st){
      if(st.pending){ try{ await st.pending; }catch(_){} }
      if(!st.dropped && st.pct >= 0.25){
        tool({tool:'oneshot', color:'white', ramp:5, hold:160, fade:450}, 'POST', meta.effZone, meta.useGlobalAll ? null : meta.ids).catch(()=>{});
      }
      syncHitSliders(st.baseSpd, st.baseBri, btn, meta.effZone);
      await Promise.all(Object.entries(st.baseVirt).map(([id, info]) => {
        const cfg = Object.keys(info.restoreCfg).length ? info.restoreCfg : { ...buildSpeedPatch(info.type, st.baseSpd), brightness: st.baseBri };
        return api(`/virtuals/${id}/effects`, {method:'PUT', body: JSON.stringify({config: cfg})})
          .then(()=>{ patchVirtualConfigCache(id, cfg); })
          .catch(()=>{});
      }));
    }
  }
  else if(h.kind==='hold-overlay'){
    const holdSet = zoneHoldSet(meta.holdKey);
    holdSet.delete(key);
    if(hitHoldPending[key]){
      try{ await hitHoldPending[key]; }catch(_){}
      delete hitHoldPending[key];
    }
    if(holdSet.size === 0){
      await tool({tool:'oneshot'}, 'PUT', meta.effZone, meta.useGlobalAll ? null : meta.ids).catch(()=>{});
    }
  }
  else if(h.kind==='hold-dim'){
    const snap = hitSnapshots[key];
    delete hitSnapshots[key];
    if(hitHoldPending[key]){
      try{ await hitHoldPending[key]; }catch(_){}
      delete hitHoldPending[key];
    }
    if(snap){
      await Promise.all(Object.entries(snap).map(([id, b]) =>
        api(`/virtuals/${id}/effects`, {method:'PUT', body: JSON.stringify({config:{brightness: b}})})
          .then(()=>{ patchVirtualConfigCache(id, {brightness: b}); })
          .catch(()=>{})
      ));
    }
  }
  else if(h.kind==='strobe'){
    if(hitIntervals[key]){ clearInterval(hitIntervals[key]); delete hitIntervals[key]; }
    if(zoneHoldSet(meta.holdKey).size === 0){
      tool({tool:'oneshot'}, 'PUT', meta.effZone, meta.useGlobalAll ? null : meta.ids).catch(()=>{});
    }
  }
}

window.addEventListener('blur', cancelActiveHits);
document.addEventListener('visibilitychange', () => { if(document.hidden) cancelActiveHits(); });
document.addEventListener('keydown', e => {
  if(e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (e.target?.tagName || '').toUpperCase();
  if(['INPUT','SELECT','TEXTAREA'].includes(tag)) return;
  const k = (e.key || '').toLowerCase();
  const idx = HITS.findIndex(h => h.kbd && h.kbd.toLowerCase() === k);
  if(idx < 0) return;
  const btn = document.querySelector(`#hits .hit-btn[data-i="${idx}"]`);
  if(btn) hitDown(HITS[idx], btn);
});
document.addEventListener('keyup', e => {
  const k = (e.key || '').toLowerCase();
  const idx = HITS.findIndex(h => h.kbd && h.kbd.toLowerCase() === k);
  if(idx < 0) return;
  const btn = document.querySelector(`#hits .hit-btn[data-i="${idx}"]`);
  if(btn) hitUp(HITS[idx], btn);
});

renderHits();
// ---- v3: status, macros, groups, quantize, scene-cycler, tabs, lab, diagnostics ----
const S={target:'All',qnt:'Now',int:'Normal',trans:'Cut',guard:true,lock:false};
const INT={Soft:.5,Normal:1,Peak:1.8};
const groups = JSON.parse(localStorage.getItem('ledfx_groups')||'{}');
let curPalette=PALETTES[0], lastScene='—', taps=[], bpm=0, beatRef=0, buildT=null;
const callLog=[];
function logCall(path,method,status,ms){
  callLog.unshift(`${new Date().toLocaleTimeString()}  ${method.padEnd(5)} ${status}  ${ms}ms  ${path}`);
  if(callLog.length>60) callLog.pop();
  const el=$('#log'); if(el && !$('#pane-diag').hidden) el.textContent=callLog.join('\n');
}
function targets(zoneOverride){
  const zoneId = zoneOverride !== undefined ? zoneOverride : (activeDeckId || mainTargetZone);
  const deck = zoneId ? layoutsCache[zoneId] : null;
  const deckVirts = deck && deck.virtuals && Object.keys(deck.virtuals).length ? new Set(Object.keys(deck.virtuals)) : null;
  return Object.keys(virtualsCache).filter(id => (!deckVirts || deckVirts.has(id)) && (S.target==='All' || groups[id]===S.target));
}
function guardLock(){ if(S.lock){ toast('Perform-Lock is ON — only hits are active', true); return true; } return false; }
function quantWait(mode){
  if(mode==='Now'||!bpm) return Promise.resolve();
  const unit=(60000/bpm)*(mode==='Bar'?4:16), now=Date.now();
  return new Promise(r=>setTimeout(r, unit-((now-(beatRef||now))%unit)));
}
// live audio energy meter (LedFx websocket, graph_update events)
let ws=null, wsReconnectT=null, wsWasDropped=false, lastAudio=0, runMax=0.0001, wsSeen=0, levels=null, energy=0;
let previewLive = true, viewMode = localStorage.getItem('ledfx_view_mode') || 'sim', visFrames = {}, visFrameAt = {}, virtualFrames = {}, virtualShapes = {}, virtualFrameAt = {}, previewRaf = 0;
function syncViewModeUI(){
  const btn = $('#viewModeBtn');
  if(!btn) return;
  const isSim = viewMode === 'sim';
  btn.classList.toggle('on', isSim);
  btn.textContent = isSim ? 'Sim View' : 'Real View';
}
syncViewModeUI();
$('#openLedfxUiBtn')?.addEventListener('click', ()=>{
  const h = HOST || ($('#host')?.value || '').trim().replace(/^https?:\/\//,'').replace(/\/+$/,'') || location.host;
  const proto = location.protocol === 'https:' ? 'https:' : 'http:';
  window.open(`${proto}//${h}/`, '_blank', 'noopener');
});
$('#viewModeBtn')?.addEventListener('click', ()=>{
  viewMode = viewMode === 'sim' ? 'real' : 'sim';
  localStorage.setItem('ledfx_view_mode', viewMode);
  syncViewModeUI();
  if(typeof scheduleTubePreview === 'function') scheduleTubePreview();
  if(typeof scheduleLayoutPreview === 'function') scheduleLayoutPreview();
});
function decodeVisPixels(px){
  if(typeof px === 'string'){
    try{
      const bin = atob(px);
      const n3 = Math.floor(bin.length / 3) * 3;
      const out = new Uint8Array(n3);
      for(let i = 0; i < n3; i++) out[i] = bin.charCodeAt(i);
      return out;
    }catch(e){ return null; }
  }
  if(Array.isArray(px)){
    if(px.length === 3 && Array.isArray(px[0]) && px[0].length !== 3){
      const n = px[0].length;
      const out = new Uint8Array(n * 3);
      for(let i = 0; i < n; i++){
        const o = i * 3;
        out[o] = px[0][i]; out[o + 1] = px[1][i]; out[o + 2] = px[2][i];
      }
      return out;
    }
    const n = px.length;
    const out = new Uint8Array(n * 3);
    for(let i = 0; i < n; i++){
      const p = px[i], o = i * 3;
      if(p){ out[o] = p[0] || 0; out[o + 1] = p[1] || 0; out[o + 2] = p[2] || 0; }
    }
    return out;
  }
  return null;
}
function syncVisSubscription(){
  if(!ws || ws.readyState !== 1) return;
  if(previewLive){
    ws.send(JSON.stringify({id:2,type:'subscribe_event',event_type:'visualisation_update',event_filter:{}}));
  }else{
    ws.send(JSON.stringify({id:2,type:'unsubscribe_event',event_type:'visualisation_update'}));
  }
}
function findArr(o,d=0){
  if(Array.isArray(o)&&o.length>3&&typeof o[0]==='number') return o;
  if(o&&typeof o==='object'&&d<4) for(const k in o){ const r=findArr(o[k],d+1); if(r) return r; }
  return null;
}
function connectWS(){
  clearTimeout(wsReconnectT);
  if(ws){ const old=ws; ws=null; try{old.onclose=null; old.close();}catch(e){} }
  if(!HOST) return;
  const sock=new WebSocket(`ws://${HOST}/api/websocket`);
  ws=sock;
  sock.onopen=()=>{
    setConnected(true);
    sock.send(JSON.stringify({id:1,type:'subscribe_event',event_type:'graph_update',event_filter:{}}));
    logCall('subscribe graph_update','WS','sent',0);
    if(previewLive) syncVisSubscription();
    if(wsWasDropped){
      wsWasDropped=false;
      Promise.all([loadSchema(), loadLayouts(), loadScenes(), loadVirtuals(), loadAudioConfig(), loadDevices()]).catch(()=>{});
    }
  };
  sock.onmessage=ev=>{
    let m; try{ m=JSON.parse(ev.data); }catch(e){ return; }
    const evtType = m.event_type || m.data?.event_type;
    if(evtType === 'visualisation_update'){
      const visId = m.vis_id ?? m.data?.vis_id;
      const isDev = m.is_device ?? m.data?.is_device;
      const rawPx = m.pixels ?? m.data?.pixels;
      const px = decodeVisPixels(rawPx);
      if(visId && px){
        const now = performance.now();
        if(isDev === false){
          virtualFrames[visId] = px;
          virtualShapes[visId] = m.shape ?? m.data?.shape ?? null;
          virtualFrameAt[visId] = now;
        }
        else{ visFrames[visId] = px; visFrameAt[visId] = now; }
        if(previewLive && typeof scheduleTubePreview === 'function') scheduleTubePreview();
        if(previewLive && typeof scheduleLayoutPreview === 'function') scheduleLayoutPreview();
      }
      return;
    }
    if(wsSeen<8){ wsSeen++; logCall(ev.data.slice(0,160),'WS','msg',0); }
    const arr=findArr(m); if(!arr) return;
    runMax=Math.max(runMax*0.999,...arr,0.0001);
    levels=Array.from({length:48},(_,i)=>{ const a=arr[Math.floor(i/48*arr.length)]; return Math.min(1,a/runMax); });
    energy=arr.reduce((x,y)=>x+y,0)/arr.length/runMax; lastAudio=Date.now();
    if(typeof checkAudioPeakCycler === 'function') checkAudioPeakCycler(levels);
    const freqs = Array.isArray(m.frequencies) ? m.frequencies : (Array.isArray(m.data?.frequencies) ? m.data.frequencies : null);
    const detBpm = m.bpm ?? m.data?.bpm;
    if(autoBpm && typeof detBpm === 'number' && detBpm >= 30 && detBpm <= 240){
      const rounded = Math.round(detBpm);
      if(rounded !== bpm){ bpm = rounded; updateStatus(); }
    }
    const agcGain = m.agc_gain ?? m.data?.agc_gain;
    const melGain = m.mel_gain ?? m.data?.mel_gain;
    const audioVol = m.volume ?? m.data?.volume;
    const energyState = m.energy_state ?? m.data?.energy_state;
    const dropNow = Boolean(m.drop_now ?? m.data?.drop_now);
    const bassRatio = m.bass_ratio ?? m.data?.bass_ratio;
    updateSpectrumData(arr, freqs, { agcGain, melGain, audioVol, energyState, dropNow, bassRatio });
    if(typeof handleEnergyTelemetry === 'function') handleEnergyTelemetry({ energyState, dropNow, bassRatio });
  };
  sock.onerror=()=>logCall('websocket error','WS','err',0);
  sock.onclose=()=>{
    if(ws===sock){
      setConnected(false);
      wsWasDropped=true;
      if(HOST){ logCall('websocket closed, reconnecting','WS','close',0); wsReconnectT=setTimeout(connectWS, 2500); }
    }
  };
}
let lastEnergyWidth = '', lastAudioText = '';
const eFillEl = $('#eFill'), stAudioEl = $('#stAudio');
setInterval(()=>{
  if(document.hidden) return;
  const on=Date.now()-lastAudio<2000;
  const wStr = on ? Math.min(100, Math.round(energy*1000)/10)+'%' : '0%';
  if(eFillEl && wStr !== lastEnergyWidth){ lastEnergyWidth = wStr; eFillEl.style.width = wStr; }
  const aTxt = on ? 'live from LedFx' : (ws&&ws.readyState===1 ? 'connected, no data' : 'no stream');
  if(stAudioEl && aTxt !== lastAudioText){ lastAudioText = aTxt; stAudioEl.textContent = aTxt; }
},60);
// segmented controls
document.querySelectorAll('.seg').forEach(g=>g.addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return;
  g.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b)); S[g.dataset.k]=b.textContent; updateStatus();
}));
// toggles
$('#guardBtn').addEventListener('click',e=>{ S.guard=!S.guard; e.target.classList.toggle('on',S.guard); e.target.textContent='Strobe Guard '+(S.guard?'ON':'OFF'); updateStatus(); });
$('#lockBtn').addEventListener('click',e=>{ S.lock=!S.lock; e.target.classList.toggle('on',S.lock); e.target.textContent='Perform-Lock '+(S.lock?'ON':'OFF'); document.body.classList.toggle('locked',S.lock); updateStatus(); });
$('#apBtn').addEventListener('click',()=>{ toggleSceneCycle(); });
// tap & auto tempo
let autoBpm = false;
function syncBpmModeUI(){
  const b = $('#autoBpmBtn');
  if(b){
    b.classList.toggle('on', autoBpm);
    b.textContent = autoBpm ? 'Auto' : 'Tap';
  }
}
function tapBpm(){
  autoBpm = false; syncBpmModeUI();
  const now=Date.now(); if(taps.length&&now-taps[taps.length-1]>2000) taps=[]; taps.push(now); if(taps.length>6) taps.shift(); beatRef=now;
  if(taps.length>1){
    const raw = Math.round(60000/((taps[taps.length-1]-taps[0])/(taps.length-1)));
    bpm = Math.max(30, Math.min(240, raw));
    updateStatus();
  }
}
$('#autoBpmBtn')?.addEventListener('click', e => {
  e.stopPropagation();
  autoBpm = !autoBpm;
  syncBpmModeUI();
  toast(autoBpm ? 'Auto BPM ON' : 'Manual Tap BPM');
});
$('#autoBpmBtn')?.addEventListener('keydown', e => { e.stopPropagation(); });
$('#stBpm')?.addEventListener('click', e => {
  e.stopPropagation();
  const inp = $('#stBpmInput'), lbl = $('#stBpm');
  if(!inp || !lbl) return;
  lbl.hidden = true;
  inp.hidden = false;
  inp.value = bpm || 120;
  inp.focus();
  inp.select();
});
function commitManualBpm(){
  const inp = $('#stBpmInput'), lbl = $('#stBpm');
  if(!inp || !lbl || inp.hidden) return;
  const v = Math.round(Number(inp.value));
  inp.hidden = true;
  lbl.hidden = false;
  if(Number.isFinite(v) && v >= 30 && v <= 240){
    autoBpm = false;
    bpm = v;
    syncBpmModeUI();
    updateStatus();
  }
}
$('#stBpmInput')?.addEventListener('click', e => e.stopPropagation());
$('#stBpmInput')?.addEventListener('blur', commitManualBpm);
$('#stBpmInput')?.addEventListener('keydown', e => {
  e.stopPropagation();
  if(e.key === 'Enter'){ e.preventDefault(); commitManualBpm(); }
  else if(e.key === 'Escape'){
    e.preventDefault();
    const inp = $('#stBpmInput'), lbl = $('#stBpm');
    if(inp) inp.hidden = true;
    if(lbl) lbl.hidden = false;
  }
});
$('#tapBtn').addEventListener('click', tapBpm);
$('#stBpmBox')?.addEventListener('click', tapBpm);
$('#stBpmBox')?.addEventListener('keydown', e => {
  if(e.target !== e.currentTarget) return;
  if(e.key==='Enter'||e.key===' '){ e.preventDefault(); tapBpm(); }
});
$('#bpmDn').addEventListener('click',()=>{ autoBpm=false; syncBpmModeUI(); bpm = Math.max(30, (bpm || 120) - 1); updateStatus(); });
$('#bpmUp').addEventListener('click',()=>{ autoBpm=false; syncBpmModeUI(); bpm = Math.min(240, (bpm || 120) + 1); updateStatus(); });
// brightness
let briT; $('#briSlider').addEventListener('input',e=>{ $('#briVal').textContent=e.target.value+'%'; clearTimeout(briT); briT=setTimeout(async()=>{
  const patch = {brightness:e.target.value/100};
  for(const id of targets()){ if(!virtualsCache[id].active) continue; try{ await api(`/virtuals/${id}/effects`,{method:'PUT',body:JSON.stringify({config:patch})}); patchVirtualConfigCache(id, patch); }catch(err){} } },150); });
// groups
$('#virtuals').addEventListener('change',e=>{ if(e.target.dataset.role==='group'){ const id=e.target.closest('.vcard').dataset.id; groups[id]=e.target.value; localStorage.setItem('ledfx_groups',JSON.stringify(groups)); } });
// macros
const DEFAULT_MACROS = [
  {n:'Warm Groove',    pal:'Warm Amber',   sp:0.50, se:0.60},
  {n:'Cold Breakdown', pal:'Cold Steel',   sp:0.25, se:0.45},
  {n:'Peak Stutter',   pal:'Neon Punch',   sp:0.90, se:0.85},
  {n:'Build Up',       pal:'Sunset',       sp:0.70, se:0.70},
  {n:'Tropical Flow',  pal:'Forest',       sp:0.45, se:0.55},
  {n:'Dark Techno',    pal:'Crimson Club', sp:0.65, se:0.80},
  {n:'Acid Rave',      pal:'Aqua Acid',    sp:0.82, se:0.78},
  {n:'Afterhours',     pal:'Violet Haze',  sp:0.30, se:0.40},
];
let MACROS = (() => {
  try{
    const saved = JSON.parse(localStorage.getItem('ledfx_vibe_macros') || 'null');
    if(Array.isArray(saved) && saved.length) return saved;
  }catch(e){}
  return DEFAULT_MACROS.map(m => ({...m}));
})();
function saveMacros(){
  try{ localStorage.setItem('ledfx_vibe_macros', JSON.stringify(MACROS)); }catch(e){}
}
function macroPalette(m){
  if(m.pal){
    const found = PALETTES.find(p => p.name === m.pal);
    if(found) return found;
  }
  if(typeof m.p === 'number' && PALETTES[m.p]) return PALETTES[m.p];
  return PALETTES[0];
}
function renderMacros(){
  $('#macros').innerHTML = MACROS.map((m,i) => {
    const pal = macroPalette(m);
    const title = `${pal.name} · Speed ${Math.round(m.sp*100)}% · Sens ${Math.round(m.se*100)}%`;
    return `<div class="macro-wrap"><button class="macro" data-i="${i}" title="${escHtml(title)}" style="background:linear-gradient(135deg,${pal.colors.join(',')})">${escHtml(m.n)}</button><button class="macro-del" data-del="${i}" title="Remove macro">&times;</button></div>`;
  }).join('');
  document.querySelectorAll('#macros .macro').forEach(b => b.addEventListener('click', async () => {
    if(guardLock()) return;
    const m = MACROS[b.dataset.i];
    if(!m) return;
    const pal = macroPalette(m);
    await quantWait(S.qnt);
    $('#speedSlider').value = m.sp * 100; $('#speedVal').textContent = Math.round(m.sp * 100) + '%';
    $('#sensSlider').value = m.se * 100; $('#sensVal').textContent = Math.round(m.se * 100) + '%';
    const z = activeDeckId || mainTargetZone || undefined;
    applyPalette(pal, false, z);
    setSpeed(m.sp, z);
    setSensitivity(m.se, z);
  }));
  document.querySelectorAll('#macros .macro-del').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    const idx = Number(b.dataset.del);
    MACROS.splice(idx, 1);
    saveMacros();
    multiPreviewKey = '';
    renderMacros();
  }));
}
$('#macroSaveBtn')?.addEventListener('click', () => {
  const palName = curPalette?.name || PALETTES[0]?.name || 'Warm Amber';
  const sp = Number($('#speedSlider').value) / 100;
  const se = Number($('#sensSlider').value) / 100;
  const name = prompt('Name for this Vibe Macro:', `${palName} ${Math.round(sp*100)}%`);
  if(!name || !name.trim()) return;
  MACROS.push({ n: name.trim(), pal: palName, sp, se });
  saveMacros();
  multiPreviewKey = '';
  renderMacros();
  toast(`Saved Vibe Macro "${name.trim()}"`);
});
$('#macroResetBtn')?.addEventListener('click', () => {
  MACROS = DEFAULT_MACROS.map(m => ({...m}));
  saveMacros();
  multiPreviewKey = '';
  renderMacros();
  toast('Restored default Vibe Macros');
});
// palette lab + color cycler
const DEFAULT_PALETTES = PALETTES.map(p => ({ ...p, colors: [...p.colors] }));
(function initPalettes(){
  let deleted = new Set();
  try{ deleted = new Set(JSON.parse(localStorage.getItem('ledfx_deleted_palettes') || '[]')); }catch(e){}
  for(let i = PALETTES.length - 1; i >= 0; i--){
    if(deleted.has(PALETTES[i].name)) PALETTES.splice(i, 1);
  }
  try{
    JSON.parse(localStorage.getItem('ledfx_custom_palettes') || '[]').forEach(p => PALETTES.push({ ...p, _custom: true }));
  }catch(e){}
})();

let labBaseColors = ['#3a0f02','#c2410c','#f0a336','#ffe08a'];
function hexToHsl(hex){
  let r=parseInt(hex.slice(1,3),16)/255, g=parseInt(hex.slice(3,5),16)/255, b=parseInt(hex.slice(5,7),16)/255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b), l=(max+min)/2;
  let h=0, s=0;
  if(max!==min){
    const d=max-min;
    s = l>0.5 ? d/(2-max-min) : d/(max+min);
    h = max===r ? (g-b)/d + (g<b?6:0) : max===g ? (b-r)/d + 2 : (r-g)/d + 4;
    h *= 60;
  }
  return [h, s*100, l*100];
}
function hslToHex(h, s, l){
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
function labColors(){
  const dh = Number($('#labHue').value) || 0;
  const sm = (Number($('#labSat').value) || 100) / 100;
  const lm = (Number($('#labLight').value) || 100) / 100;
  return labBaseColors.map(hex => {
    if(dh === 0 && sm === 1 && lm === 1) return hex;
    const [h, s, l] = hexToHsl(hex);
    return hslToHex(h + dh, s * sm, l * lm);
  });
}
function buildLabPaletteObj(){
  const roll = Number($('#labRoll').value);
  return {
    name: $('#labName').value.trim() || 'Custom',
    colors: labColors(),
    roleMap: $('#labRoleMap').value,
    bgColor: $('#labBgApply').checked ? $('#labBgColor').value : undefined,
    roll: roll >= 0 ? roll : undefined,
  };
}
function syncLabUI(){
  const cols = labColors();
  const strip = $('#labPreviewStrip');
  if(strip) strip.style.background = toGradientString(cols);
  const inputs = [...document.querySelectorAll('#labStops input[type=color]')];
  inputs.forEach((inp, i) => {
    if(cols[i]){
      inp.value = cols[i];
      const hx = inp.closest('.lab-stop')?.querySelector('.hex');
      if(hx) hx.textContent = cols[i];
    }
  });
  $('#labHueVal').textContent = `${$('#labHue').value}°`;
  $('#labSatVal').textContent = `${$('#labSat').value}%`;
  $('#labLightVal').textContent = `${$('#labLight').value}%`;
  const rv = Number($('#labRoll').value);
  $('#labRollVal').textContent = rv < 0 ? 'keep' : rv.toFixed(1);
}
let labSelectedIdx = -1;
function loadPaletteIntoLab(idx){
  const p = PALETTES[idx];
  if(!p) return;
  labSelectedIdx = idx;
  labBaseColors = p.colors.slice(0, 4);
  while(labBaseColors.length < 4) labBaseColors.push(labBaseColors[labBaseColors.length - 1]);
  $('#labName').value = p.name + ' (Edit)';
  $('#labHue').value = 0; $('#labSat').value = 100; $('#labLight').value = 100;
  $('#labRoleMap').value = p.roleMap || 'normal';
  syncLabUI();
  renderLabSavedPalettes();
}
syncLabUI();

const PURE_COLORS = [
  {name:'Red', hex:'#ff0000'}, {name:'Orange', hex:'#ff6600'}, {name:'Yellow', hex:'#ffff00'},
  {name:'Green', hex:'#00ff00'}, {name:'Cyan', hex:'#00ffff'}, {name:'Blue', hex:'#0000ff'},
  {name:'Purple', hex:'#8b00ff'}, {name:'Magenta', hex:'#ff00ff'}, {name:'White', hex:'#ffffff'},
  {name:'Black', hex:'#000000'},
];
let purePopoverEl = null;
function closePureColorPopover(){
  if(purePopoverEl){ purePopoverEl.remove(); purePopoverEl = null; }
}
document.addEventListener('pointerdown', e => {
  if(purePopoverEl && !purePopoverEl.contains(e.target)) closePureColorPopover();
});
function openPureColorPopover(anchorEl, currentHex, onPick){
  closePureColorPopover();
  const pop = document.createElement('div');
  pop.className = 'pure-pop';
  pop.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span class="status" style="font-weight:700;color:var(--text)">Pure Colors</span>
      <button type="button" class="btn" data-pop-close style="padding:1px 6px;font-size:11px">&times;</button>
    </div>
    <div class="pure-pop-grid">
      ${PURE_COLORS.map(c => `<button type="button" class="pure-swatch" data-hex="${c.hex}" title="${c.name} (${c.hex})" style="background:${c.hex}"></button>`).join('')}
    </div>
    <div class="pure-pop-foot">
      <span style="font-size:12px;font-weight:700;color:var(--text);white-space:nowrap">Custom Color</span>
      <input type="color" data-pop-custom value="${escHtml(currentHex || '#ff0000')}" style="flex:1;height:34px;border:1px solid var(--amber);border-radius:7px;background:var(--panel2);cursor:pointer;padding:2px">
    </div>`;
  document.body.appendChild(pop);
  purePopoverEl = pop;
  const r = anchorEl.getBoundingClientRect();
  const pw = 236, ph = pop.offsetHeight || 145;
  const left = Math.min(window.innerWidth - pw - 8, Math.max(8, r.left));
  const top = (r.bottom + ph + 8 <= window.innerHeight) ? (r.bottom + 6) : Math.max(8, r.top - ph - 6);
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';

  pop.addEventListener('pointerdown', e => e.stopPropagation());
  pop.querySelector('[data-pop-close]')?.addEventListener('click', closePureColorPopover);
  pop.querySelectorAll('.pure-swatch').forEach(sw => sw.addEventListener('click', () => {
    onPick(sw.dataset.hex);
    closePureColorPopover();
  }));
  const cust = pop.querySelector('[data-pop-custom]');
  cust?.addEventListener('input', () => onPick(cust.value));
  cust?.addEventListener('change', () => { onPick(cust.value); closePureColorPopover(); });
}

const deckFullColor = {};
let globalFullColor = '';
function syncFullColorUI(){
  const btn = $('#fullColorBtn'), dot = $('#fullColorDot');
  if(!btn || !dot) return;
  const z = activeDeckId || mainTargetZone || '';
  const hex = z ? (deckFullColor[z] || '') : globalFullColor;
  dot.style.background = hex || '';
  btn.style.borderColor = hex || '';
}
$('#fullColorBtn')?.addEventListener('click', e => {
  e.stopPropagation();
  const z = activeDeckId || mainTargetZone || undefined;
  const curHex = (z ? deckFullColor[z] : globalFullColor) || curPalette?.colors?.[0] || '#ff0000';
  openPureColorPopover(e.currentTarget, curHex, hex => {
    const pal = { name: `Full ${hex}`, colors: [hex, hex, hex, hex] };
    if(z) deckFullColor[z] = hex;
    else globalFullColor = hex;
    if(activeDeckId) getDeckCycle(activeDeckId).pal = pal;
    multiPreviewKey = '';
    syncFullColorUI();
    applyPalette(pal, false, z);
  });
});

document.querySelectorAll('#labStops .lab-stop').forEach((el, idx) => {
  const inp = el.querySelector('input[type=color]');
  const openStopPop = e => {
    e.preventDefault();
    e.stopPropagation();
    openPureColorPopover(el, labBaseColors[idx] || '#ff0000', hex => {
      $('#labHue').value = 0; $('#labSat').value = 100; $('#labLight').value = 100;
      labBaseColors[idx] = hex;
      syncLabUI();
    });
  };
  el.addEventListener('click', openStopPop);
  if(inp) inp.addEventListener('click', openStopPop);
});
['#labHue','#labSat','#labLight','#labRoll'].forEach(id => $(id)?.addEventListener('input', syncLabUI));
$('#labResetHslBtn')?.addEventListener('click', () => {
  $('#labHue').value = 0; $('#labSat').value = 100; $('#labLight').value = 100; $('#labRoll').value = -1;
  syncLabUI();
});
$('#labReverseBtn')?.addEventListener('click', () => { labBaseColors.reverse(); syncLabUI(); });
$('#labRotateBtn')?.addEventListener('click', () => { labBaseColors.push(labBaseColors.shift()); syncLabUI(); });
$('#labFromActiveBtn')?.addEventListener('click', () => {
  const active = Object.values(virtualsCache).find(v => v?.active && v?.effect?.type);
  if(!active){ toast('No active virtual effect found', true); return; }
  const cfg = active.effect.config || {};
  const found = [];
  for(const [k, val] of Object.entries(cfg)){
    if(k === 'background_color' || typeof val !== 'string') continue;
    const ms = val.match(/#[0-9a-f]{6}|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/gi);
    if(ms) for(const m of ms){
      if(m.startsWith('#')) found.push(m.toLowerCase());
      else{
        const nums = m.match(/\d+/g);
        if(nums) found.push('#' + nums.slice(0,3).map(n => Number(n).toString(16).padStart(2,'0')).join(''));
      }
    }
  }
  if(!found.length){ toast(`No colors found on ${active.effect.type}`, true); return; }
  const uniq = [...new Set(found)];
  while(uniq.length < 4) uniq.push(uniq[uniq.length - 1]);
  labBaseColors = uniq.slice(0, 4);
  $('#labHue').value = 0; $('#labSat').value = 100; $('#labLight').value = 100;
  $('#labName').value = active.config?.name || active.effect.type;
  syncLabUI();
  toast(`Loaded colors from ${active.effect.type}`);
});
$('#labApply').addEventListener('click', () => applyPalette(buildLabPaletteObj()));
function renderLabSavedPalettes(){
  const box = $('#labSavedPalettes'), cnt = $('#labPalCount');
  if(cnt) cnt.textContent = `(${PALETTES.length})`;
  if(!box) return;
  if(!PALETTES.length){
    box.innerHTML = '<div class="empty">No palettes left. Create one below or click Restore Built-in Palettes.</div>';
    return;
  }
  box.innerHTML = PALETTES.map((p, i) => `
    <div class="swatch ${i===labSelectedIdx?'cur':''}" data-pick-pal="${i}" role="button" tabindex="0" style="display:flex;flex-direction:column;gap:6px">
      <div class="strip2" style="margin-bottom:0">${p.colors.map(c => `<span style="background:${c}"></span>`).join('')}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
        <span class="name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.name)}</span>
        <button type="button" class="btn" data-del-pal="${i}" style="padding:2px 7px;font-size:11px;color:var(--bad)" title="Delete ${escHtml(p.name)}">&times;</button>
      </div>
    </div>
  `).join('');
  box.querySelectorAll('[data-pick-pal]').forEach(sw => sw.addEventListener('click', e => {
    if(e.target.closest('[data-del-pal]')) return;
    loadPaletteIntoLab(Number(sw.dataset.pickPal));
  }));
  box.querySelectorAll('[data-del-pal]').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    deletePaletteAt(Number(b.dataset.delPal));
  }));
}

function deletePaletteAt(idx){
  const p = PALETTES[idx];
  if(!p) return;
  if(!confirm(`Delete palette "${p.name}"?`)) return;
  PALETTES.splice(idx, 1);
  palCycleSelected?.delete(p.name);
  for(const dc of Object.values(deckCycleState)) dc?.pool?.delete(p.name);
  savePalCyclePool();
  if(p._custom){
    try{
      const saved = JSON.parse(localStorage.getItem('ledfx_custom_palettes') || '[]');
      const next = saved.filter(sp => sp.name !== p.name);
      localStorage.setItem('ledfx_custom_palettes', JSON.stringify(next));
    }catch(e){}
  }else{
    try{
      const deleted = new Set(JSON.parse(localStorage.getItem('ledfx_deleted_palettes') || '[]'));
      deleted.add(p.name);
      localStorage.setItem('ledfx_deleted_palettes', JSON.stringify([...deleted]));
    }catch(e){}
  }
  if(labSelectedIdx === idx) labSelectedIdx = -1;
  else if(labSelectedIdx > idx) labSelectedIdx--;
  multiPreviewKey = '';
  renderPalettes(); renderMacros(); renderLabSavedPalettes(); syncPalCycleUI();
  if(typeof scheduleTubePreview === 'function') scheduleTubePreview();
  toast(`Deleted palette "${p.name}"`);
}

$('#labDelPresetBtn')?.addEventListener('click', () => {
  if(labSelectedIdx < 0 || !PALETTES[labSelectedIdx]){ toast('Click a palette box above first', true); return; }
  deletePaletteAt(labSelectedIdx);
});
$('#labRestoreDefaultsBtn')?.addEventListener('click', () => {
  localStorage.removeItem('ledfx_deleted_palettes');
  for(const dp of DEFAULT_PALETTES){
    if(!PALETTES.some(p => p.name === dp.name)){
      PALETTES.unshift({ ...dp, colors: [...dp.colors] });
      palCycleSelected?.add(dp.name);
    }
  }
  savePalCyclePool();
  multiPreviewKey = '';
  renderPalettes(); renderMacros(); renderLabSavedPalettes(); syncPalCycleUI();
  if(typeof scheduleTubePreview === 'function') scheduleTubePreview();
  toast('Restored built-in palettes');
});

$('#labSave').addEventListener('click', () => {
  const p = { ...buildLabPaletteObj(), _custom: true };
  PALETTES.push(p); palCycleSelected.add(p.name); savePalCyclePool();
  labSelectedIdx = PALETTES.length - 1;
  multiPreviewKey = '';
  renderPalettes(); renderMacros(); renderLabSavedPalettes(); syncPalCycleUI();
  if(typeof scheduleTubePreview === 'function') scheduleTubePreview();
  const saved = JSON.parse(localStorage.getItem('ledfx_custom_palettes')||'[]');
  saved.push(p); localStorage.setItem('ledfx_custom_palettes', JSON.stringify(saved));
  toast('Palette saved');
});
renderLabSavedPalettes();

// ---- Palette Color Cycler ----
let palCycleOn = false, palCycleMode = 'bpm_pal', palCycleDiv = 1, palCycleRand = false, palCycleIdx = 0, palCycleNextAt = 0, palCycleBusy = false, palBassAvg = 0.05, palLastPeakAt = 0;
const deckCycleState = {};
function getDeckCycle(deckId){
  if(!deckCycleState[deckId]){
    deckCycleState[deckId] = {
      on: false, mode: 'bpm_pal', div: 1, rand: false, idx: 0, nextAt: 0, busy: false, lastPeakAt: 0,
      pal: null, pool: new Set(palCycleSelected ? [...palCycleSelected] : PALETTES.map(p => p.name))
    };
  }
  return deckCycleState[deckId];
}
function pickNextIdx(len, curIdx, rand){
  if(len <= 1) return 0;
  if(!rand) return (curIdx + 1) % len;
  let next = Math.floor(Math.random() * len);
  if(next === curIdx) next = (curIdx + 1 + Math.floor(Math.random() * (len - 1))) % len;
  return next;
}
function stepDeckPalCycler(deckId){
  const dc = getDeckCycle(deckId);
  if(dc.busy || !dc.on || S.lock || !HOST) return;
  let nextPal;
  if(dc.mode.endsWith('_rot')){
    const deckSid = lastDeckScene[deckId];
    const sceneCols = deckSid && typeof extractSceneColors === 'function' ? extractSceneColors(scenesCache[deckSid]) : null;
    const base = dc.pal || (sceneCols ? { name: scenesCache[deckSid]?.name || deckSid, colors: sceneCols } : null) || curPalette || PALETTES[0];
    const cols = [...base.colors];
    cols.push(cols.shift());
    nextPal = { ...base, colors: cols };
    dc.pal = nextPal;
  }else{
    const pool = PALETTES.filter(p => dc.pool.has(p.name));
    if(!pool.length) return;
    dc.idx = pickNextIdx(pool.length, dc.idx, dc.rand);
    nextPal = pool[dc.idx];
    dc.pal = nextPal;
  }
  dc.busy = true;
  applyPalette(nextPal, true, deckId).finally(() => { dc.busy = false; });
}
function checkAudioPeakCycler(lvls){
  if(!HOST || !Array.isArray(lvls) || !lvls.length) return;
  const anyDeckAudio = Object.values(deckCycleState).some(dc => dc.on && dc.mode.startsWith('audio_'));
  const globalAudio = palCycleOn && palCycleMode.startsWith('audio_');
  if(!globalAudio && !anyDeckAudio) return;
  const bins = Math.min(10, lvls.length);
  let sum = 0;
  for(let i = 0; i < bins; i++) sum += lvls[i];
  const bass = sum / bins;
  const now = Date.now();
  const isPeak = bass > 0.14 && bass > palBassAvg * 1.42;
  if(isPeak){
    if(globalAudio && now - palLastPeakAt > 360){
      palLastPeakAt = now;
      stepPalCycler();
    }
    for(const [did, dc] of Object.entries(deckCycleState)){
      if(dc.on && dc.mode.startsWith('audio_') && now - dc.lastPeakAt > 360){
        dc.lastPeakAt = now;
        stepDeckPalCycler(did);
      }
    }
  }
  palBassAvg = palBassAvg * 0.90 + bass * 0.10;
}
function syncPalCycleUI(){
  const btn = $('#palCycleBtn');
  if(!btn) return;
  const dc = activeDeckId ? getDeckCycle(activeDeckId) : null;
  const on = dc ? dc.on : palCycleOn;
  const mode = dc ? dc.mode : palCycleMode;
  const div = dc ? dc.div : palCycleDiv;
  const rand = dc ? !!dc.rand : palCycleRand;
  const pool = dc ? dc.pool : palCycleSelected;
  if($('#palCycleMode')) $('#palCycleMode').value = mode;
  if($('#palCycleDiv')) $('#palCycleDiv').value = String(div);
  if($('#palCycleRand')) $('#palCycleRand').checked = rand;
  btn.classList.toggle('on', on);
  btn.textContent = on ? 'Cycle ON' : 'Cycle OFF';
  const info = $('#palCycleInfo');
  const poolCount = PALETTES.filter(p => pool.has(p.name)).length;
  if(info){
    if(!on) info.textContent = `manual · ${poolCount} selected`;
    else{
      const effBpm = bpm || 120;
      info.textContent = mode.startsWith('bpm') ? `${effBpm} BPM · ÷${div} (${poolCount})` : `audio peak (${poolCount})`;
    }
  }
}
function stepPalCycler(){
  if(palCycleBusy || !palCycleOn || S.lock || !HOST) return;
  const mode = palCycleMode;
  let nextPal;
  if(mode.endsWith('_rot')){
    const cols = [...(curPalette?.colors || PALETTES[0].colors)];
    cols.push(cols.shift());
    nextPal = { ...curPalette, colors: cols };
  }else{
    const pool = PALETTES.filter(p => palCycleSelected.has(p.name));
    if(!pool.length) return;
    palCycleIdx = pickNextIdx(pool.length, palCycleIdx, palCycleRand);
    nextPal = pool[palCycleIdx];
  }
  palCycleBusy = true;
  applyPalette(nextPal, true, '').finally(() => { palCycleBusy = false; });
}
$('#palPoolAllBtn')?.addEventListener('click', () => {
  if(activeDeckId){
    getDeckCycle(activeDeckId).pool = new Set(PALETTES.map(p => p.name));
    multiPreviewKey = '';
  }else{
    palCycleSelected = new Set(PALETTES.map(p => p.name));
    savePalCyclePool();
  }
  renderPalettes(); syncPalCycleUI();
});
$('#palPoolNoneBtn')?.addEventListener('click', () => {
  if(activeDeckId){
    getDeckCycle(activeDeckId).pool.clear();
    multiPreviewKey = '';
  }else{
    palCycleSelected.clear();
    savePalCyclePool();
  }
  renderPalettes(); syncPalCycleUI();
});
$('#palCycleBtn')?.addEventListener('click', () => {
  if(activeDeckId){
    const dc = getDeckCycle(activeDeckId);
    dc.on = !dc.on;
    dc.nextAt = Date.now();
    multiPreviewKey = '';
  }else{
    palCycleOn = !palCycleOn;
    palCycleNextAt = Date.now();
  }
  syncPalCycleUI();
});
$('#palCycleMode')?.addEventListener('change', e => {
  if(activeDeckId){ getDeckCycle(activeDeckId).mode = e.target.value; multiPreviewKey = ''; }
  else{ palCycleMode = e.target.value; }
  syncPalCycleUI();
});
$('#palCycleDiv')?.addEventListener('change', e => {
  if(activeDeckId){
    const dc = getDeckCycle(activeDeckId);
    dc.div = Number(e.target.value) || 1;
    dc.nextAt = Date.now();
    multiPreviewKey = '';
  }else{
    palCycleDiv = Number(e.target.value) || 1;
    palCycleNextAt = Date.now();
  }
  syncPalCycleUI();
});
$('#palCycleRand')?.addEventListener('change', e => {
  if(activeDeckId){ getDeckCycle(activeDeckId).rand = e.target.checked; multiPreviewKey = ''; }
  else{ palCycleRand = e.target.checked; }
});

let sceneCycleSelected = null;
try{
  const savedScyc = JSON.parse(localStorage.getItem('ledfx_scene_cycle_pool') || 'null');
  if(Array.isArray(savedScyc)) sceneCycleSelected = new Set(savedScyc);
}catch(e){}
function saveSceneCyclePool(){
  if(!sceneCycleSelected) return;
  try{ localStorage.setItem('ledfx_scene_cycle_pool', JSON.stringify([...sceneCycleSelected])); }catch(e){}
}
let sceneCycleOn = false, sceneCycleDiv = '16b', sceneCycleRand = false, sceneCycleIdx = 0, sceneCycleNextAt = 0, sceneCycleBusy = false;
const deckSceneCycleState = {};
function getDeckSceneCycle(deckId){
  if(!deckSceneCycleState[deckId]){
    deckSceneCycleState[deckId] = { on: false, div: '16b', rand: false, idx: 0, nextAt: 0, busy: false, pool: null };
  }
  return deckSceneCycleState[deckId];
}
function sceneIntervalMs(val){
  const s = String(val || '16b');
  if(s.endsWith('s')) return Math.max(1000, Number(s.slice(0, -1)) * 1000);
  const beats = Number(s.replace('b','')) || 16;
  return (60000 / (bpm || 120)) * beats;
}
function getSceneCycleTargetIds(deckId){
  const all = Object.keys(scenesCache || {});
  if(deckId){
    return all.filter(id => !isSceneHidden(id) && sceneMatchesLayoutFor(scenesCache[id], deckId));
  }
  return all.filter(id => !isSceneHidden(id) && sceneMatchesLayout(scenesCache[id]));
}
function syncSceneCycleUI(){
  const scyc = activeDeckId ? getDeckSceneCycle(activeDeckId) : null;
  const on = scyc ? scyc.on : sceneCycleOn;
  const div = scyc ? scyc.div : sceneCycleDiv;
  const rand = scyc ? !!scyc.rand : sceneCycleRand;
  const pool = scyc ? scyc.pool : sceneCycleSelected;
  const nextAt = scyc ? scyc.nextAt : sceneCycleNextAt;
  if($('#sceneCycleDiv')) $('#sceneCycleDiv').value = div;
  if($('#sceneCycleRand')) $('#sceneCycleRand').checked = rand;
  const btn = $('#sceneCycleBtn');
  if(btn){
    btn.classList.toggle('on', on);
    btn.textContent = on ? 'Scene Cycle ON' : 'Scene Cycle OFF';
  }
  const apBtn = $('#apBtn');
  if(apBtn){
    apBtn.classList.toggle('on', on);
    apBtn.textContent = 'Auto-pilot ' + (on ? 'ON' : 'OFF');
  }
  const info = $('#sceneCycleInfo');
  if(info){
    const visIds = getSceneCycleTargetIds(activeDeckId);
    const poolCnt = pool ? visIds.filter(id => pool.has(id)).length : visIds.length;
    if(!on){ info.textContent = `${poolCnt} selected`; }
    else{
      const divLbl = $('#sceneCycleDiv')?.selectedOptions?.[0]?.textContent || div;
      const left = Math.max(0, Math.ceil((nextAt - Date.now()) / 1000));
      info.textContent = `${divLbl} · ${poolCnt} selected · ${left}s`;
    }
  }
}
function toggleSceneCycle(){
  if(activeDeckId){
    const scyc = getDeckSceneCycle(activeDeckId);
    scyc.on = !scyc.on;
    scyc.nextAt = Date.now() + sceneIntervalMs(scyc.div);
    multiPreviewKey = '';
  }else{
    sceneCycleOn = !sceneCycleOn;
    sceneCycleNextAt = Date.now() + sceneIntervalMs(sceneCycleDiv);
  }
  syncSceneCycleUI();
}
function stepSceneCycler(){
  if(S.lock || sceneCycleBusy) return;
  let ids = getSceneCycleTargetIds('');
  if(sceneCycleSelected) ids = ids.filter(id => sceneCycleSelected.has(id));
  if(typeof filterSceneIdsByHype === 'function') ids = filterSceneIdsByHype(ids);
  if(!ids.length) return;
  sceneCycleIdx = pickNextIdx(ids.length, sceneCycleIdx, sceneCycleRand);
  sceneCycleBusy = true;
  Promise.resolve(activateScene(ids[sceneCycleIdx], '', { forceNow: true, globalScope: true })).finally(() => { sceneCycleBusy = false; });
}
function stepDeckSceneCycler(deckId){
  const scyc = getDeckSceneCycle(deckId);
  if(S.lock || scyc.busy || !scyc.on) return;
  let ids = getSceneCycleTargetIds(deckId);
  if(scyc.pool) ids = ids.filter(id => scyc.pool.has(id));
  if(typeof filterSceneIdsByHype === 'function') ids = filterSceneIdsByHype(ids);
  if(!ids.length) return;
  scyc.idx = pickNextIdx(ids.length, scyc.idx, scyc.rand);
  scyc.busy = true;
  Promise.resolve(activateScene(ids[scyc.idx], deckId, { forceNow: true })).finally(() => { scyc.busy = false; });
}
$('#sceneCycleBtn')?.addEventListener('click', toggleSceneCycle);
$('#sceneCycleDiv')?.addEventListener('change', e => {
  if(activeDeckId){
    const scyc = getDeckSceneCycle(activeDeckId);
    scyc.div = e.target.value;
    scyc.nextAt = Date.now() + sceneIntervalMs(scyc.div);
    multiPreviewKey = '';
  }else{
    sceneCycleDiv = e.target.value || '16b';
    sceneCycleNextAt = Date.now() + sceneIntervalMs(sceneCycleDiv);
  }
  syncSceneCycleUI();
});
$('#sceneCycleRand')?.addEventListener('change', e => {
  if(activeDeckId){ getDeckSceneCycle(activeDeckId).rand = e.target.checked; multiPreviewKey = ''; }
  else{ sceneCycleRand = e.target.checked; }
});
$('#scenePoolAllBtn')?.addEventListener('click', () => {
  if(activeDeckId){
    getDeckSceneCycle(activeDeckId).pool = new Set(getSceneCycleTargetIds(activeDeckId));
    multiPreviewKey = '';
  }else{
    sceneCycleSelected = new Set(Object.keys(scenesCache || {}));
    saveSceneCyclePool();
  }
  renderScenes();
  syncSceneCycleUI();
});
$('#scenePoolNoneBtn')?.addEventListener('click', () => {
  if(activeDeckId){
    getDeckSceneCycle(activeDeckId).pool = new Set();
    multiPreviewKey = '';
  }else{
    sceneCycleSelected = new Set();
    saveSceneCyclePool();
  }
  renderScenes();
  syncSceneCycleUI();
});

setInterval(() => {
  if(!HOST) return;
  const now = Date.now();
  if(palCycleOn){
    const mode = palCycleMode;
    if(mode.startsWith('bpm')){
      const effBpm = bpm || 120;
      const div = Number(palCycleDiv) || 1;
      const intervalMs = (60000 / effBpm) * div;
      if(now >= palCycleNextAt){
        palCycleNextAt = now + intervalMs;
        stepPalCycler();
      }
    }
  }
  for(const [did, dc] of Object.entries(deckCycleState)){
    if(!dc.on || !dc.mode.startsWith('bpm')) continue;
    const effBpm = bpm || 120;
    const intervalMs = (60000 / effBpm) * (dc.div || 1);
    if(now >= dc.nextAt){
      dc.nextAt = now + intervalMs;
      stepDeckPalCycler(did);
    }
  }
  if(sceneCycleOn && now >= sceneCycleNextAt){
    sceneCycleNextAt = now + sceneIntervalMs(sceneCycleDiv);
    stepSceneCycler();
    syncSceneCycleUI();
  }
  for(const [did, scyc] of Object.entries(deckSceneCycleState)){
    if(!scyc.on) continue;
    if(now >= scyc.nextAt){
      scyc.nextAt = now + sceneIntervalMs(scyc.div);
      stepDeckSceneCycler(did);
    }
  }
}, 50);
// tabs
$('#tabs').addEventListener('click',e=>{ const b=e.target.closest('button'); if(!b) return;
  cancelActiveHits();
  if(b.dataset.t==='main') activeDeckId = b.dataset.deck || '';
  document.querySelectorAll('#tabs button').forEach(x=>x.classList.toggle('on',x===b));
  document.querySelectorAll('.pane').forEach(p=>p.hidden=p.id!=='pane-'+b.dataset.t);
  if(b.dataset.t==='diag') $('#log').textContent=callLog.join('\n')||'no calls yet';
  if(b.dataset.t==='eq') requestAnimationFrame(drawSpectrum);
  if(b.dataset.t==='main'){ renderDeckTabs(); renderScenes(); renderPalettes(); syncPalCycleUI(); syncSceneCycleUI(); syncFullColorUI(); syncMainCtlSliders(); if(typeof renderDeckFxSettings === 'function') renderDeckFxSettings(); if(typeof scheduleTubePreview === 'function') scheduleTubePreview(); }
  if(b.dataset.t==='scenes'){ if(typeof renderSceneStudio === 'function') renderSceneStudio(); }
  if(b.dataset.t==='layout'){ if(typeof renderLayoutEditorBoxes === 'function') renderLayoutEditorBoxes(); if(typeof scheduleLayoutPreview === 'function') scheduleLayoutPreview(); } });
$('#resync').addEventListener('click',()=>connect());
// status + scene cycler countdown
function updateStatus(){
  if($('#stBpm')) $('#stBpm').textContent=bpm||'—';
  const vs=Object.values(virtualsCache); const virtTxt=vs.length?`${vs.filter(v=>v.active).length}/${vs.length} active`:'—';
  if($('#stVirt')) $('#stVirt').textContent=virtTxt;
  if($('#virtCount')) $('#virtCount').textContent=vs.length?`(${virtTxt})`:'';
  if($('#stMode')) $('#stMode').textContent=`${S.qnt} · ${S.int} · ${S.trans} · ${S.guard?'guard':'no guard'}${S.lock?' · LOCK':''}`;
  if($('#diagInfo')) $('#diagInfo').textContent=HOST?`host ${HOST} · ${Object.keys(virtualsCache).length} virtuals`:'not connected';
}
setInterval(()=>{
  updateStatus();
  if(sceneCycleOn || (activeDeckId && getDeckSceneCycle(activeDeckId).on)) syncSceneCycleUI();
},1000);
