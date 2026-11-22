// Master Energy / "Hype" Macro Dial, Drop & Breakdown HUD, and Cue-on-Drop
const HYPE_STORAGE_KEY = 'ledfx_hype_state';

let hypeState = (() => {
  const def = { hype: 55, scaleBri: false, filterCycler: false, cueOnDrop: false, autoDropFlash: false };
  try{
    const raw = JSON.parse(localStorage.getItem(HYPE_STORAGE_KEY) || 'null');
    if(raw && typeof raw === 'object'){
      const h = Number(raw.hype);
      return {
        hype: Number.isFinite(h) ? Math.max(0, Math.min(100, Math.round(h))) : def.hype,
        scaleBri: !!raw.scaleBri,
        filterCycler: !!raw.filterCycler,
        cueOnDrop: !!raw.cueOnDrop,
        autoDropFlash: !!raw.autoDropFlash,
      };
    }
  }catch(e){}
  return def;
})();

function saveHypeState(){
  try{ localStorage.setItem(HYPE_STORAGE_KEY, JSON.stringify(hypeState)); }catch(e){}
}

function getHypeTier(hype){
  if(hype < 35) return { key: 'chill', label: 'CHILL', cls: 'tier-chill', intMode: 'Soft', snap: 20 };
  if(hype < 75) return { key: 'groove', label: 'GROOVE', cls: 'tier-groove', intMode: 'Normal', snap: 55 };
  return { key: 'peak', label: 'PEAK', cls: 'tier-peak', intMode: 'Peak', snap: 95 };
}

function getHypeMappedPcts(hype){
  const h = Math.max(0, Math.min(100, Number(hype) || 0));
  return {
    briPct: Math.round(38 + 0.62 * h),
    spdPct: Math.round(18 + 0.74 * h),
    snsPct: Math.round(28 + 0.60 * h),
  };
}

function syncHypeTogglesUI(){
  const briBtn = $('#hypeBriBtn');
  if(briBtn){
    briBtn.classList.toggle('on', hypeState.scaleBri);
    briBtn.textContent = 'Scale Bri ' + (hypeState.scaleBri ? 'ON' : 'OFF');
  }
  const filterBtn = $('#hypeFilterBtn');
  if(filterBtn){
    filterBtn.classList.toggle('on', hypeState.filterCycler);
    filterBtn.textContent = 'Filter Cycler ' + (hypeState.filterCycler ? 'ON' : 'OFF');
  }
  const cueBtn = $('#cueDropBtn');
  if(cueBtn){
    cueBtn.classList.toggle('on', hypeState.cueOnDrop);
    cueBtn.textContent = 'Cue on Drop ' + (hypeState.cueOnDrop ? 'ON' : 'OFF');
  }
  const flashBtn = $('#autoDropFlashBtn');
  if(flashBtn){
    flashBtn.classList.toggle('on', hypeState.autoDropFlash);
    flashBtn.textContent = 'Drop Flash ' + (hypeState.autoDropFlash ? 'ON' : 'OFF');
  }
}

function getHypeTargetScopeLabel(){
  if(typeof activeDeckId !== 'undefined' && activeDeckId){
    return layoutsCache?.[activeDeckId]?.name || activeDeckId;
  }
  if(typeof mainTargetZone !== 'undefined' && mainTargetZone){
    return layoutsCache?.[mainTargetZone]?.name || mainTargetZone;
  }
  return 'All Zones';
}

function syncHypeUI(syncSliders){
  const h = hypeState.hype;
  const tier = getHypeTier(h);
  const sl = $('#hypeSlider');
  if(sl) sl.value = h;
  const valEl = $('#hypeVal');
  if(valEl) valEl.textContent = h + '%';
  const tierEl = $('#hypeTier');
  if(tierEl){
    tierEl.textContent = tier.label;
    tierEl.className = 'hype-tier ' + tier.cls;
  }
  const scopeEl = $('#hypeScope');
  if(scopeEl) scopeEl.textContent = getHypeTargetScopeLabel();
  document.querySelectorAll('.hype-snap').forEach(btn => {
    btn.classList.toggle('on', Number(btn.dataset.hype) === tier.snap);
  });
  if(typeof S !== 'undefined'){
    S.int = tier.intMode;
    document.querySelectorAll('.seg[data-k="int"] button').forEach(b => {
      b.classList.toggle('on', b.textContent === tier.intMode);
    });
    if(typeof updateStatus === 'function') updateStatus();
  }
  syncHypeTogglesUI();

  if(syncSliders){
    const { briPct, spdPct, snsPct } = getHypeMappedPcts(h);
    const z = (typeof activeDeckId !== 'undefined' && activeDeckId) ? activeDeckId : ((typeof mainTargetZone !== 'undefined' && mainTargetZone) ? mainTargetZone : '');
    const outBlocked = !hypeState.scaleBri ||
      (typeof blackoutOn !== 'undefined' && blackoutOn) ||
      (typeof whiteoutOn !== 'undefined' && whiteoutOn) ||
      (z && typeof deckOutMode !== 'undefined' && (deckOutMode[z] === 'black' || deckOutMode[z] === 'white'));
    if(!outBlocked){
      if($('#briSlider')) $('#briSlider').value = briPct;
      if($('#briVal')) $('#briVal').textContent = briPct + '%';
    }
    if($('#speedSlider')) $('#speedSlider').value = spdPct;
    if($('#speedVal')) $('#speedVal').textContent = spdPct + '%';
    if($('#sensSlider')) $('#sensSlider').value = snsPct;
    if($('#sensVal')) $('#sensVal').textContent = snsPct + '%';

    const deckCards = (typeof activeDeckId !== 'undefined' && activeDeckId)
      ? [document.querySelector(`.lprev-card[data-deck="${CSS.escape(activeDeckId)}"]`)].filter(Boolean)
      : [...document.querySelectorAll('.lprev-card[data-deck]')].filter(c => !z || c.dataset.deck === z);
    for(const card of deckCards){
      const did = card.dataset.deck;
      const dBlocked = !hypeState.scaleBri ||
        (typeof blackoutOn !== 'undefined' && blackoutOn) ||
        (typeof whiteoutOn !== 'undefined' && whiteoutOn) ||
        (did && typeof deckOutMode !== 'undefined' && (deckOutMode[did] === 'black' || deckOutMode[did] === 'white'));
      if(did && typeof getDeckCardCtl === 'function'){
        const dc = getDeckCardCtl(did);
        if(!dBlocked) dc.bri = briPct;
        dc.spd = spdPct;
        dc.sns = snsPct;
      }
      if(!dBlocked){
        const brEl = card.querySelector('[data-ctl="bri"]'), brVal = card.querySelector('[data-val="bri"]');
        if(brEl) brEl.value = briPct;
        if(brVal) brVal.textContent = briPct + '%';
      }
      const spEl = card.querySelector('[data-ctl="spd"]'), spVal = card.querySelector('[data-val="spd"]');
      if(spEl) spEl.value = spdPct;
      if(spVal) spVal.textContent = spdPct + '%';
      const snEl = card.querySelector('[data-ctl="sns"]'), snVal = card.querySelector('[data-val="sns"]');
      if(snEl) snEl.value = snsPct;
      if(snVal) snVal.textContent = snsPct + '%';
    }
  }
}

let hypeApplyTimer = null;
function applyHypeToDevices(){
  if(typeof guardLock === 'function' && guardLock()) return;
  const { briPct, spdPct, snsPct } = getHypeMappedPcts(hypeState.hype);
  const z = (typeof activeDeckId !== 'undefined' && activeDeckId)
    ? activeDeckId
    : ((typeof mainTargetZone !== 'undefined' && mainTargetZone) ? mainTargetZone : undefined);
  const outBlocked = !hypeState.scaleBri ||
    (typeof blackoutOn !== 'undefined' && blackoutOn) ||
    (typeof whiteoutOn !== 'undefined' && whiteoutOn) ||
    (z && typeof deckOutMode !== 'undefined' && (deckOutMode[z] === 'black' || deckOutMode[z] === 'white'));
  if(!outBlocked && typeof setZoneBrightness === 'function'){
    setZoneBrightness(briPct / 100, z);
  }
  if(typeof setSpeed === 'function') setSpeed(spdPct / 100, z, true);
  if(typeof setSensitivity === 'function') setSensitivity(snsPct / 100, z, true);
}

$('#hypeSlider')?.addEventListener('input', e => {
  const val = Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0)));
  hypeState.hype = val;
  saveHypeState();
  syncHypeUI(true);
  clearTimeout(hypeApplyTimer);
  hypeApplyTimer = setTimeout(applyHypeToDevices, 120);
});

document.querySelectorAll('.hype-snap').forEach(btn => {
  btn.addEventListener('click', () => {
    const val = Math.max(0, Math.min(100, Math.round(Number(btn.dataset.hype) || 0)));
    hypeState.hype = val;
    saveHypeState();
    syncHypeUI(true);
    clearTimeout(hypeApplyTimer);
    applyHypeToDevices();
  });
});

$('#hypeBriBtn')?.addEventListener('click', () => {
  hypeState.scaleBri = !hypeState.scaleBri;
  saveHypeState();
  syncHypeTogglesUI();
  toast(hypeState.scaleBri ? 'Master Hype now scales Brightness' : 'Master Hype keeps Brightness independent');
});

$('#hypeFilterBtn')?.addEventListener('click', () => {
  hypeState.filterCycler = !hypeState.filterCycler;
  saveHypeState();
  syncHypeTogglesUI();
  toast(hypeState.filterCycler ? 'Hype Cycler filter ON' : 'Hype Cycler filter OFF');
});

$('#cueDropBtn')?.addEventListener('click', () => {
  hypeState.cueOnDrop = !hypeState.cueOnDrop;
  saveHypeState();
  syncHypeTogglesUI();
  if(!hypeState.cueOnDrop) clearDropQueue();
  toast(hypeState.cueOnDrop ? 'Cue on Drop ON — clicked scenes wait for next Drop' : 'Cue on Drop OFF');
});

$('#autoDropFlashBtn')?.addEventListener('click', () => {
  hypeState.autoDropFlash = !hypeState.autoDropFlash;
  saveHypeState();
  syncHypeTogglesUI();
  toast(hypeState.autoDropFlash ? 'Auto Drop Flash ON' : 'Auto Drop Flash OFF');
});

function filterSceneIdsByHype(ids){
  if(!hypeState.filterCycler || !Array.isArray(ids) || !ids.length) return ids;
  const h = hypeState.hype;
  const filtered = ids.filter(id => {
    const tags = typeof getSceneTags === 'function' ? getSceneTags(scenesCache[id]) : [];
    if(h < 35) return tags.includes('chill');
    if(h < 75) return tags.some(t => t === 'house' || t === 'chill' || t === 'trippy');
    return tags.some(t => t === 'dynamic' || t === 'strobe' || t === 'techno' || t === 'peak' || t === 'hard') || !tags.includes('chill');
  });
  return filtered.length ? filtered : ids;
}

// Drop & Breakdown HUD + Cue-on-Drop
let queuedDropScene = null;
let lastDropActive = false;
let lastDropHandledAt = 0;

function syncDropQueueUI(){
  const bar = $('#dropQueueBar');
  const txt = $('#dropQueueText');
  const qId = queuedDropScene ? queuedDropScene.id : '';
  document.querySelectorAll('.scene[data-id]').forEach(btn => {
    btn.classList.toggle('drop-queued', !!qId && btn.dataset.id === qId);
  });
  if(bar){
    bar.hidden = !queuedDropScene;
  }
  if(txt){
    const name = queuedDropScene ? (scenesCache[queuedDropScene.id]?.name || queuedDropScene.id) : '—';
    txt.textContent = queuedDropScene ? `Queued on Drop: ${name}` : 'Queued: —';
  }
}

function clearDropQueue(){
  queuedDropScene = null;
  syncDropQueueUI();
}

function tryQueueDropScene(id, deckId){
  if(!hypeState.cueOnDrop) return false;
  queuedDropScene = { id, deckId: deckId || '' };
  syncDropQueueUI();
  if(typeof toast === 'function') toast('Queued for Drop: ' + (scenesCache[id]?.name || id));
  return true;
}

$('#dropQueueFireBtn')?.addEventListener('click', () => {
  if(!queuedDropScene) return;
  const q = queuedDropScene;
  clearDropQueue();
  if(typeof activateScene === 'function') activateScene(q.id, q.deckId, { forceNow: true });
});

$('#dropQueueClearBtn')?.addEventListener('click', () => {
  clearDropQueue();
});

let lastPillMode = '', lastBadgeText = '';
function handleEnergyTelemetry(telemetry){
  if(!telemetry || typeof telemetry !== 'object') return;
  const state = telemetry.energyState || 'normal';
  const dropNow = !!telemetry.dropNow;
  const isDrop = dropNow || state === 'drop';
  const isBreakdown = !isDrop && state === 'breakdown';
  const ratioTxt = typeof telemetry.bassRatio === 'number' && Number.isFinite(telemetry.bassRatio)
    ? telemetry.bassRatio.toFixed(2) + 'x'
    : '';

  const pillMode = isDrop ? 'drop' : (isBreakdown ? 'breakdown' : 'normal');
  if(pillMode !== lastPillMode){
    lastPillMode = pillMode;
    const pill = $('#stEnergyPill');
    const valEl = $('#stEnergyVal');
    if(pill){
      pill.classList.toggle('is-breakdown', isBreakdown);
      pill.classList.toggle('is-drop', isDrop);
    }
    if(valEl){
      valEl.textContent = isDrop ? 'DROP!' : (isBreakdown ? 'BREAKDOWN · AGC HELD' : 'NORMAL');
    }
  }

  const stateLbl = isDrop ? 'DROP!' : (isBreakdown ? 'BREAKDOWN' : 'NORMAL');
  const badgeText = ratioTxt ? `${stateLbl} · ${ratioTxt}` : stateLbl;
  const badge = $('#eqEnergyBadge');
  if(badge){
    if(badgeText !== lastBadgeText){
      lastBadgeText = badgeText;
      badge.textContent = badgeText;
    }
    badge.classList.toggle('is-breakdown', isBreakdown);
    badge.classList.toggle('is-drop', isDrop);
  }

  const now = Date.now();
  if(isDrop && !lastDropActive && (now - lastDropHandledAt > 1500)){
    lastDropHandledAt = now;
    if(queuedDropScene){
      const { id, deckId } = queuedDropScene;
      clearDropQueue();
      if(typeof activateScene === 'function') activateScene(id, deckId, { forceNow: true });
      if(typeof toast === 'function') toast('Drop! Activated ' + (scenesCache[id]?.name || id));
    }
    if(hypeState.autoDropFlash && typeof S !== 'undefined' && !S.lock && typeof tool === 'function'){
      tool({ tool: 'oneshot', color: 'white', ramp: 5, hold: S.guard ? 90 : 160, fade: S.guard ? 220 : 380 }).catch(() => {});
    }
  }
  lastDropActive = isDrop;
}

async function resetEnergyBaseline(){
  try{
    await api('/audio/energy/reset', { method: 'POST' });
    lastDropActive = false;
    lastDropHandledAt = 0;
    handleEnergyTelemetry({ energyState: 'normal', dropNow: false, bassRatio: 1.0 });
    if(typeof toast === 'function') toast('Energy baseline reset');
  }catch(e){
    if(typeof toast === 'function') toast('Energy reset failed: ' + e.message, true);
  }
}

$('#resetEnergyBtn')?.addEventListener('click', resetEnergyBaseline);
$('#eqResetEnergyBtn')?.addEventListener('click', resetEnergyBaseline);

syncHypeUI(false);
syncDropQueueUI();
