// eq & spectrum analyzer
const EQ_BANDS = [
  {key:'eq_low', freq:60, label:'60 Hz'},
  {key:'eq_low_mid', freq:250, label:'250 Hz'},
  {key:'eq_mid', freq:1000, label:'1 kHz'},
  {key:'eq_high_mid', freq:4000, label:'4 kHz'},
  {key:'eq_high', freq:12000, label:'12 kHz'}
];
const EQ_PRESETS = {
  flat:     {eq_low:0,   eq_low_mid:0,   eq_mid:0,  eq_high_mid:0,  eq_high:0},
  basscut:  {eq_low:-12, eq_low_mid:-6,  eq_mid:0,  eq_high_mid:0,  eq_high:0},
  subboost: {eq_low:8,   eq_low_mid:3,   eq_mid:0,  eq_high_mid:0,  eq_high:2},
  scoop:    {eq_low:6,   eq_low_mid:2,   eq_mid:-6, eq_high_mid:3,  eq_high:6},
  crisp:    {eq_low:0,   eq_low_mid:-2,  eq_mid:0,  eq_high_mid:5,  eq_high:8}
};
let eqState = {eq_enabled:false, eq_low:0, eq_low_mid:0, eq_mid:0, eq_high_mid:0, eq_high:0, input_gain:1.0, autogain:false, autogain_target:0.5, autogain_speed:0.5, min_volume:0.2, pitch_method:'yinfft', onset_method:'hfc', pitch_tolerance:0.8, delay_ms:0, beat_min_freq:20, beat_max_freq:100};
let melbanksState = {max_frequencies:[350, 2000, 15000], min_frequency:20, peak_isolation:0.4};
let melbanksSaveTimer = null;
let eqSaveTimer = null;
const dirtyEqKeys = new Set();
const dirtyMelbanksKeys = new Set();
let specMel = [];
let specFreqs = null;
let specPeaks = [];
let specPeakHold = true;
let specRaf = 0;

function formatDb(v){
  const n = Number(v)||0;
  return (n>0?'+':'') + n.toFixed(1) + ' dB';
}

function syncEqUI(){
  const btn = $('#eqEnableBtn');
  btn.classList.toggle('on', !!eqState.eq_enabled);
  btn.textContent = eqState.eq_enabled ? 'EQ Active' : 'EQ Bypassed';
  EQ_BANDS.forEach(b=>{
    const val = Number(eqState[b.key]||0);
    const bandEl = document.querySelector(`.eq-band[data-band="${b.key}"]`);
    if(bandEl) bandEl.classList.toggle('bypassed', !eqState.eq_enabled);
    const slider = document.querySelector(`.eq-slider[data-band="${b.key}"]`);
    if(slider) slider.value = val;
    const dbEl = $('#db_'+b.key);
    if(dbEl){
      dbEl.textContent = formatDb(val);
      dbEl.className = 'eq-db ' + (val>0.05?'pos':(val<-0.05?'neg':'zero'));
    }
  });
  const gSl = $('#audioGainSlider'), gVal = $('#audioGainVal');
  if(gSl) gSl.value = eqState.input_gain;
  if(gVal) gVal.textContent = `${Number(eqState.input_gain).toFixed(2)}x`;
  const agBtn = $('#audioAutogainBtn'), agTgt = $('#audioAutogainTarget'), agVal = $('#audioAutogainVal');
  if(agBtn){
    agBtn.classList.toggle('on', !!eqState.autogain);
    agBtn.textContent = eqState.autogain ? 'Auto ON' : 'Auto OFF';
  }
  if(agTgt) agTgt.value = eqState.autogain_target;
  if(agVal) agVal.textContent = Number(eqState.autogain_target).toFixed(2);
  const agSpd = $('#audioAutogainSpeed'), agSpdVal = $('#audioAutogainSpeedVal');
  if(agSpd) agSpd.value = eqState.autogain_speed ?? 0.5;
  if(agSpdVal) agSpdVal.textContent = Number(eqState.autogain_speed ?? 0.5).toFixed(2);
  const mvSl = $('#audioMinVolSlider'), mvVal = $('#audioMinVolVal');
  if(mvSl) mvSl.value = eqState.min_volume;
  if(mvVal) mvVal.textContent = Number(eqState.min_volume).toFixed(2);
  if($('#onsetMethodSel')) $('#onsetMethodSel').value = eqState.onset_method || 'hfc';
  if($('#pitchMethodSel')) $('#pitchMethodSel').value = eqState.pitch_method || 'yinfft';
  if($('#pitchTolSlider')) $('#pitchTolSlider').value = eqState.pitch_tolerance ?? 0.8;
  if($('#pitchTolVal')) $('#pitchTolVal').textContent = Number(eqState.pitch_tolerance ?? 0.8).toFixed(2);
  if($('#peakIsolSlider')) $('#peakIsolSlider').value = melbanksState.peak_isolation ?? 0.4;
  if($('#peakIsolVal')) $('#peakIsolVal').textContent = Number(melbanksState.peak_isolation ?? 0.4).toFixed(2);
  if($('#audioDelaySlider')) $('#audioDelaySlider').value = eqState.delay_ms ?? 0;
  if($('#audioDelayVal')) $('#audioDelayVal').textContent = `${Math.round(eqState.delay_ms || 0)}ms`;
  scheduleSpectrumDraw();
}

let autoReconnectDevices = true;
let offlineDeviceIds = [];

function syncAutoConnBtn(){
  const b = $('#autoConnBtn');
  if(!b) return;
  b.classList.toggle('on', autoReconnectDevices);
  b.textContent = autoReconnectDevices ? 'Auto-Connect ON' : 'Auto-Connect OFF';
}

let devicesCache = {};
async function loadDevices(){
  const holder = $('#offlineDevices');
  const btn = $('#connOfflineBtn');
  try{
    const data = await api('/devices');
    const devs = data.devices || {};
    devicesCache = devs;
    refreshArranger();
    if(typeof scheduleLayoutPreview === 'function') scheduleLayoutPreview();
    if(typeof scheduleTubePreview === 'function') scheduleTubePreview();
    const offline = Object.entries(devs).filter(([,d]) => d && d.online === false);
    offlineDeviceIds = offline.map(([id]) => id);
    if(btn) btn.textContent = offline.length ? `Connect Offline (${offline.length})` : 'All Tubes Online';
    if(!offline.length){
      holder.hidden = true;
      holder.innerHTML = '';
      return;
    }
    holder.hidden = false;
    holder.innerHTML = `<span class="status">Offline:</span>` + offline.map(([id, d]) =>
      `<button class="btn" data-dev="${escHtml(id)}">Connect ${escHtml(d.config?.name || id)}</button>`
    ).join('');
    holder.querySelectorAll('button[data-dev]').forEach(b => b.addEventListener('click', () => connectDevice(b.dataset.dev)));
  }catch(e){
    logCall('loadDevices: '+e.message, 'GET', 'err', 0);
  }
}

async function connectDevice(id){
  try{
    const res = await api(`/devices/${id}`, {method:'POST'});
    if(res?.online === false){
      toast(`Device ${id} is offline`, true);
    }else{
      toast(`Connected ${id}`);
    }
    await Promise.all([loadDevices(), loadVirtuals()]);
  }catch(e){
    toast(`Connect ${id} failed: `+e.message, true);
  }
}

$('#autoConnBtn').addEventListener('click', async ()=>{
  autoReconnectDevices = !autoReconnectDevices;
  syncAutoConnBtn();
  if(!HOST) return;
  try{
    await api('/config', {method:'PUT', body:JSON.stringify({auto_reconnect_devices:autoReconnectDevices})});
    toast(autoReconnectDevices ? 'Tube auto-connect enabled' : 'Tube auto-connect disabled');
  }catch(e){
    toast('Failed to update auto-connect: '+e.message, true);
  }
});

$('#connOfflineBtn').addEventListener('click', async ()=>{
  if(!HOST) return;
  await loadDevices();
  if(!offlineDeviceIds.length){ toast('All tubes are already online'); return; }
  await Promise.allSettled(offlineDeviceIds.map(id => api(`/devices/${id}`, {method:'POST'})));
  await Promise.all([loadDevices(), loadVirtuals()]);
  toast('Offline tube reconnect finished');
});

async function loadAudioConfig(){
  try{
    const [cfg, devRes] = await Promise.all([api('/config'), api('/audio/devices').catch(()=>null)]);
    if(typeof cfg.auto_reconnect_devices === 'boolean'){
      autoReconnectDevices = cfg.auto_reconnect_devices;
      syncAutoConnBtn();
    }
    const a = cfg.audio || {};
    if(!dirtyEqKeys.has('eq_enabled')) eqState.eq_enabled = Boolean(a.eq_enabled);
    EQ_BANDS.forEach(b=>{
      if(!dirtyEqKeys.has(b.key) && typeof a[b.key] === 'number') eqState[b.key] = a[b.key];
    });
    if(!dirtyEqKeys.has('input_gain') && typeof a.input_gain === 'number') eqState.input_gain = a.input_gain;
    if(!dirtyEqKeys.has('autogain') && typeof a.autogain === 'boolean') eqState.autogain = a.autogain;
    if(!dirtyEqKeys.has('autogain_target') && typeof a.autogain_target === 'number') eqState.autogain_target = a.autogain_target;
    if(!dirtyEqKeys.has('autogain_speed') && typeof a.autogain_speed === 'number') eqState.autogain_speed = a.autogain_speed;
    if(!dirtyEqKeys.has('min_volume') && typeof a.min_volume === 'number') eqState.min_volume = a.min_volume;
    if(!dirtyEqKeys.has('pitch_method') && typeof a.pitch_method === 'string') eqState.pitch_method = a.pitch_method;
    if(!dirtyEqKeys.has('onset_method') && typeof a.onset_method === 'string') eqState.onset_method = a.onset_method;
    if(!dirtyEqKeys.has('pitch_tolerance') && typeof a.pitch_tolerance === 'number') eqState.pitch_tolerance = a.pitch_tolerance;
    if(!dirtyEqKeys.has('delay_ms') && typeof a.delay_ms === 'number') eqState.delay_ms = a.delay_ms;
    if(!dirtyEqKeys.has('beat_min_freq') && typeof a.beat_min_freq === 'number') eqState.beat_min_freq = a.beat_min_freq;
    if(!dirtyEqKeys.has('beat_max_freq') && typeof a.beat_max_freq === 'number') eqState.beat_max_freq = a.beat_max_freq;
    const mb = cfg.melbanks || {};
    if(!dirtyMelbanksKeys.has('max_frequencies') && Array.isArray(mb.max_frequencies) && mb.max_frequencies.length >= 3){
      melbanksState.max_frequencies = mb.max_frequencies.slice(0, 3).map(Number);
    }
    if(!dirtyMelbanksKeys.has('min_frequency') && typeof mb.min_frequency === 'number') melbanksState.min_frequency = mb.min_frequency;
    if(!dirtyMelbanksKeys.has('peak_isolation') && typeof mb.peak_isolation === 'number') melbanksState.peak_isolation = mb.peak_isolation;
    syncEqUI();
    if(devRes && devRes.devices){
      const sel = $('#audioDevSel');
      const activeIdx = String(devRes.active_device_index ?? '');
      sel.innerHTML = Object.entries(devRes.devices).map(([idx, name]) =>
        `<option value="${escHtml(idx)}" ${String(idx)===activeIdx?'selected':''}>${escHtml(name)}</option>`
      ).join('');
    }
  }catch(e){
    logCall('loadAudioConfig: '+e.message, 'GET', 'err', 0);
  }
}

$('#audioDevSel').addEventListener('change', async ()=>{
  if(!HOST) return;
  try{
    await api('/audio/devices', {method:'PUT', body:JSON.stringify({index:Number($('#audioDevSel').value)})});
    toast('Audio input updated');
  }catch(e){
    toast('Audio device change failed: '+e.message, true);
  }
});

function scheduleEqSave(...keys){
  for(const k of keys) dirtyEqKeys.add(k);
  clearTimeout(eqSaveTimer);
  eqSaveTimer = setTimeout(async ()=>{
    if(!HOST) return;
    const patch = {};
    const sendKeys = dirtyEqKeys.size ? [...dirtyEqKeys] : Object.keys(eqState);
    for(const k of sendKeys){
      patch[k] = eqState[k];
      dirtyEqKeys.delete(k);
    }
    try{
      await api('/config', {method:'PUT', body:JSON.stringify({audio:patch})});
    }catch(e){
      toast('EQ update failed: '+e.message, true);
    }
  }, 60);
}

$('#eqEnableBtn').addEventListener('click', ()=>{
  eqState.eq_enabled = !eqState.eq_enabled;
  syncEqUI();
  scheduleEqSave('eq_enabled');
});

$('#audioGainSlider')?.addEventListener('input', e => {
  eqState.input_gain = Number(e.target.value);
  syncEqUI();
  scheduleEqSave('input_gain');
});
$('#audioGainSlider')?.addEventListener('dblclick', () => {
  eqState.input_gain = 1.0;
  syncEqUI();
  scheduleEqSave('input_gain');
});
$('#audioAutogainBtn')?.addEventListener('click', () => {
  eqState.autogain = !eqState.autogain;
  syncEqUI();
  scheduleEqSave('autogain');
});
$('#audioAutogainTarget')?.addEventListener('input', e => {
  eqState.autogain_target = Number(e.target.value);
  syncEqUI();
  scheduleEqSave('autogain_target');
});
$('#audioAutogainSpeed')?.addEventListener('input', e => {
  eqState.autogain_speed = Number(e.target.value);
  syncEqUI();
  scheduleEqSave('autogain_speed');
});
$('#audioMinVolSlider')?.addEventListener('input', e => {
  eqState.min_volume = Number(e.target.value);
  syncEqUI();
  scheduleEqSave('min_volume');
});
function scheduleMelbanksSave(...keys){
  for(const k of keys) dirtyMelbanksKeys.add(k);
  clearTimeout(melbanksSaveTimer);
  melbanksSaveTimer = setTimeout(async () => {
    if(!HOST) return;
    const patch = {};
    const sendKeys = dirtyMelbanksKeys.size ? [...dirtyMelbanksKeys] : Object.keys(melbanksState);
    for(const k of sendKeys){
      patch[k] = melbanksState[k];
      dirtyMelbanksKeys.delete(k);
    }
    try{
      await api('/config', {method:'PUT', body:JSON.stringify({melbanks:patch})});
    }catch(e){ toast('Melbanks update failed: ' + e.message, true); }
  }, 80);
}
$('#onsetMethodSel')?.addEventListener('change', e => { eqState.onset_method = e.target.value; scheduleEqSave('onset_method'); });
$('#pitchMethodSel')?.addEventListener('change', e => { eqState.pitch_method = e.target.value; scheduleEqSave('pitch_method'); });
$('#pitchTolSlider')?.addEventListener('input', e => { eqState.pitch_tolerance = Number(e.target.value); syncEqUI(); scheduleEqSave('pitch_tolerance'); });
$('#peakIsolSlider')?.addEventListener('input', e => { melbanksState.peak_isolation = Number(e.target.value); syncEqUI(); scheduleMelbanksSave('peak_isolation'); });
$('#audioDelaySlider')?.addEventListener('input', e => { eqState.delay_ms = Number(e.target.value); syncEqUI(); scheduleEqSave('delay_ms'); });

document.querySelectorAll('.eq-slider').forEach(sl=>{
  sl.addEventListener('input', ()=>{
    const band = sl.dataset.band;
    eqState[band] = parseFloat(sl.value);
    const changed = [band];
    if(!eqState.eq_enabled){ eqState.eq_enabled = true; changed.push('eq_enabled'); }
    syncEqUI();
    scheduleEqSave(...changed);
  });
  sl.addEventListener('dblclick', ()=>{
    const band = sl.dataset.band;
    eqState[band] = 0;
    syncEqUI();
    scheduleEqSave(band);
  });
});

document.querySelectorAll('.eq-pre').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const p = EQ_PRESETS[btn.dataset.pre];
    if(!p) return;
    Object.assign(eqState, p);
    const changed = Object.keys(p);
    if(btn.dataset.pre !== 'flat'){ eqState.eq_enabled = true; changed.push('eq_enabled'); }
    syncEqUI();
    scheduleEqSave(...changed);
  });
});

$('#specPeakBtn').addEventListener('click', ()=>{
  specPeakHold = !specPeakHold;
  $('#specPeakBtn').classList.toggle('on', specPeakHold);
  if(!specPeakHold) specPeaks = [];
  scheduleSpectrumDraw();
});

$('#specResetPeaks').addEventListener('click', ()=>{
  specPeaks = [];
  scheduleSpectrumDraw();
});

$('#specResetZones')?.addEventListener('click', ()=>{
  melbanksState.min_frequency = 20;
  melbanksState.max_frequencies = [350, 2000, 15000];
  eqState.beat_min_freq = 20;
  eqState.beat_max_freq = 100;
  scheduleSpectrumDraw();
  scheduleMelbanksSave('min_frequency', 'max_frequencies');
  scheduleEqSave('beat_min_freq', 'beat_max_freq');
  toast('Frequency zones reset');
});

let beatZoneAvg = 0, beatPulse = 0, lastBeatPulseAt = 0;
function updateSpectrumData(mel, freqs){
  specMel = mel;
  if(freqs && freqs.length === mel.length) specFreqs = freqs;
  if(specPeaks.length !== mel.length) specPeaks = new Array(mel.length).fill(0);
  for(let i=0; i<mel.length; i++){
    const norm = Math.min(1, Math.max(0, mel[i] / runMax));
    specPeaks[i] = Math.max(specPeaks[i] * 0.985, norm);
  }
  const bMin = eqState.beat_min_freq || 20, bMax = eqState.beat_max_freq || 100;
  let bSum = 0, bCnt = 0;
  for(let i=0; i<mel.length; i++){
    const f = (specFreqs && specFreqs[i]) ? specFreqs[i] : 20 * Math.pow(800, i / Math.max(1, mel.length - 1));
    if(f >= bMin && f <= bMax){ bSum += Math.min(1, Math.max(0, mel[i] / runMax)); bCnt++; }
  }
  const bEnergy = bCnt ? (bSum / bCnt) : 0;
  const now = performance.now();
  if(bEnergy > 0.08 && bEnergy > beatZoneAvg * 1.45 && (now - lastBeatPulseAt > 120)){
    beatPulse = 1.0;
    lastBeatPulseAt = now;
  }else{
    beatPulse = Math.max(0, beatPulse * 0.86);
  }
  beatZoneAvg = beatZoneAvg * 0.85 + bEnergy * 0.15;
  scheduleHeaderSpectrumDraw();
  const eqPane = $('#pane-eq');
  if(eqPane && !eqPane.hidden){
    const meta = $('#specMeta');
    if(meta){
      let maxIdx = 0;
      for(let i=1; i<mel.length; i++) if(mel[i] > mel[maxIdx]) maxIdx = i;
      const peakHz = specFreqs && specFreqs[maxIdx] ? Math.round(specFreqs[maxIdx]) + ' Hz' : `bin ${maxIdx}`;
      meta.textContent = `${mel.length} bins · peak ${peakHz} · energy ${Math.round(energy*100)}%`;
    }
    scheduleSpectrumDraw();
  }
}

let hdrSpecRaf = 0, hdrSpecGradW = 0, hdrSpecFillGrad = null, hdrSpecStrokeGrad = null;
function scheduleHeaderSpectrumDraw(){
  if(hdrSpecRaf || document.hidden) return;
  hdrSpecRaf = requestAnimationFrame(()=>{ hdrSpecRaf = 0; drawHeaderSpectrum(); });
}
function drawHeaderSpectrum(){
  const canvas = $('#hdrSpecCanvas');
  if(!canvas || document.hidden) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = canvas.clientWidth || 320;
  const ch = canvas.clientHeight || 40;
  const tw = Math.round(cw * dpr), th = Math.round(ch * dpr);
  if(canvas.width !== tw || canvas.height !== th){ canvas.width = tw; canvas.height = th; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  if(!specMel || !specMel.length) return;
  const pts = Math.max(36, Math.min(72, Math.floor(cw / 6)));
  const vals = new Array(pts);
  for(let i = 0; i < pts; i++){
    const idx = Math.min(specMel.length - 1, Math.floor((i / (pts - 1)) * (specMel.length - 1)));
    vals[i] = Math.min(1, Math.max(0, specMel[idx] / runMax));
  }
  const baseY = ch - 2;
  const maxH = ch - 5;
  if(hdrSpecGradW !== cw || !hdrSpecFillGrad){
    hdrSpecGradW = cw;
    hdrSpecFillGrad = ctx.createLinearGradient(0, 0, cw, 0);
    hdrSpecFillGrad.addColorStop(0, 'rgba(69, 212, 131, 0.36)');
    hdrSpecFillGrad.addColorStop(0.5, 'rgba(240, 163, 54, 0.40)');
    hdrSpecFillGrad.addColorStop(1, 'rgba(130, 170, 255, 0.36)');
    hdrSpecStrokeGrad = ctx.createLinearGradient(0, 0, cw, 0);
    hdrSpecStrokeGrad.addColorStop(0, '#45d483');
    hdrSpecStrokeGrad.addColorStop(0.5, '#f0a336');
    hdrSpecStrokeGrad.addColorStop(1, '#82aaff');
  }
  ctx.fillStyle = hdrSpecFillGrad;
  ctx.beginPath();
  ctx.moveTo(0, baseY);
  for(let i = 0; i < pts; i++){
    const x = (i / (pts - 1)) * cw;
    const y = baseY - vals[i] * maxH;
    if(i === 0) ctx.lineTo(x, y);
    else{
      const px = ((i - 1) / (pts - 1)) * cw;
      const py = baseY - vals[i - 1] * maxH;
      ctx.quadraticCurveTo(px, py, (px + x) * 0.5, (py + y) * 0.5);
    }
  }
  ctx.lineTo(cw, baseY - vals[pts - 1] * maxH);
  ctx.lineTo(cw, baseY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = hdrSpecStrokeGrad;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for(let i = 0; i < pts; i++){
    const x = (i / (pts - 1)) * cw;
    const y = baseY - vals[i] * maxH;
    if(i === 0) ctx.moveTo(x, y);
    else{
      const px = ((i - 1) / (pts - 1)) * cw;
      const py = baseY - vals[i - 1] * maxH;
      ctx.quadraticCurveTo(px, py, (px + x) * 0.5, (py + y) * 0.5);
    }
  }
  ctx.lineTo(cw, baseY - vals[pts - 1] * maxH);
  ctx.stroke();
}
$('#hdrSpecCanvas')?.addEventListener('click', ()=>{
  const eqTab = document.querySelector('#tabs button[data-t="eq"]');
  if(eqTab) eqTab.click();
});

function scheduleSpectrumDraw(){
  if(specRaf) return;
  specRaf = requestAnimationFrame(()=>{ specRaf = 0; drawSpectrum(); });
}

let dragZoneIdx = -1; // -1=none, 0=beatMin, 1=beatMax, 2=bassMin, 3=bassMax, 4=midMax, 5=highMax
let hoverZoneIdx = -1;
(function initSpectrumDrag(){
  const canvas = $('#specCanvas');
  if(!canvas) return;
  const getRange = () => {
    const rect = canvas.getBoundingClientRect();
    const minHz = (specFreqs && specFreqs.length > 1) ? Math.max(20, specFreqs[0]) : 20;
    const maxHz = (specFreqs && specFreqs.length > 1) ? Math.max(minHz + 100, specFreqs[specFreqs.length-1]) : 16000;
    const padL = 8, padR = 8, plotW = Math.max(10, rect.width - padL - padR);
    const logMin = Math.log2(minHz), logMax = Math.log2(maxHz);
    return {
      rect, minHz, maxHz, padL, plotW, logMin, logMax,
      xForHz: hz => padL + ((Math.log2(Math.min(maxHz, Math.max(minHz, hz))) - logMin) / (logMax - logMin)) * plotW,
      hzForX: x => Math.round(Math.pow(2, logMin + Math.max(0, Math.min(1, (x - padL) / plotW)) * (logMax - logMin))),
    };
  };
  const getHandles = () => {
    const freqs = melbanksState.max_frequencies || [350, 2000, 15000];
    return [eqState.beat_min_freq || 20, eqState.beat_max_freq || 100, melbanksState.min_frequency || 20, freqs[0], freqs[1], freqs[2]];
  };
  const pickHandle = (r, lx, ly, maxDist) => {
    const handles = getHandles();
    const preferBottom = ly > r.rect.height * 0.52;
    let best = -1, bestScore = Infinity;
    handles.forEach((hz, idx) => {
      const dx = Math.abs(lx - r.xForHz(hz));
      if(dx >= maxDist) return;
      const isBottom = idx <= 1;
      const trackPenalty = (isBottom === preferBottom) ? 0 : 8;
      const score = dx + trackPenalty;
      if(score < bestScore){ bestScore = score; best = idx; }
    });
    return best;
  };
  canvas.addEventListener('pointerdown', e => {
    const r = getRange();
    const lx = e.clientX - r.rect.left, ly = e.clientY - r.rect.top;
    const best = pickHandle(r, lx, ly, 14);
    if(best >= 0){
      dragZoneIdx = best;
      hoverZoneIdx = best;
      canvas.setPointerCapture?.(e.pointerId);
      scheduleSpectrumDraw();
    }
  });
  canvas.addEventListener('pointermove', e => {
    const r = getRange();
    const lx = e.clientX - r.rect.left, ly = e.clientY - r.rect.top;
    if(dragZoneIdx < 0){
      const near = pickHandle(r, lx, ly, 12);
      canvas.style.cursor = near >= 0 ? 'ew-resize' : 'default';
      if(near !== hoverZoneIdx){ hoverZoneIdx = near; scheduleSpectrumDraw(); }
      return;
    }
    let hz = Math.max(20, Math.min(15000, r.hzForX(lx)));
    if(dragZoneIdx === 0){
      eqState.beat_min_freq = Math.min(5000, hz, (eqState.beat_max_freq || 100) - 10);
      scheduleSpectrumDraw();
      scheduleEqSave('beat_min_freq');
    }else if(dragZoneIdx === 1){
      eqState.beat_max_freq = Math.max(30, (eqState.beat_min_freq || 20) + 10, Math.min(hz, 10000));
      scheduleSpectrumDraw();
      scheduleEqSave('beat_max_freq');
    }else{
      const nextMax = [...(melbanksState.max_frequencies || [350, 2000, 15000])];
      const minFreq = melbanksState.min_frequency || 20;
      if(dragZoneIdx === 2){
        melbanksState.min_frequency = Math.min(hz, nextMax[0] - 20);
        melbanksState.max_frequencies = nextMax;
        scheduleSpectrumDraw();
        scheduleMelbanksSave('min_frequency');
      }else if(dragZoneIdx === 3){
        nextMax[0] = Math.max(minFreq + 20, Math.min(hz, nextMax[1] - 50));
        melbanksState.max_frequencies = nextMax;
        scheduleSpectrumDraw();
        scheduleMelbanksSave('max_frequencies');
      }else if(dragZoneIdx === 4){
        nextMax[1] = Math.max(nextMax[0] + 50, Math.min(hz, nextMax[2] - 100));
        melbanksState.max_frequencies = nextMax;
        scheduleSpectrumDraw();
        scheduleMelbanksSave('max_frequencies');
      }else if(dragZoneIdx === 5){
        nextMax[2] = Math.max(10000, nextMax[1] + 100, hz);
        melbanksState.max_frequencies = nextMax;
        scheduleSpectrumDraw();
        scheduleMelbanksSave('max_frequencies');
      }
    }
  });
  const endDrag = () => { if(dragZoneIdx >= 0){ dragZoneIdx = -1; scheduleSpectrumDraw(); } };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { if(hoverZoneIdx >= 0){ hoverZoneIdx = -1; scheduleSpectrumDraw(); } });
})();

function eqGainAtFreq(hz){
  const logF = Math.log2(Math.max(20, hz));
  const pts = EQ_BANDS.map(b=>({x:Math.log2(b.freq), y:Number(eqState[b.key]||0)}));
  if(logF <= pts[0].x) return pts[0].y;
  if(logF >= pts[pts.length-1].x) return pts[pts.length-1].y;
  for(let i=0; i<pts.length-1; i++){
    if(logF >= pts[i].x && logF <= pts[i+1].x){
      const t = (logF - pts[i].x) / (pts[i+1].x - pts[i].x);
      return pts[i].y + t * (pts[i+1].y - pts[i].y);
    }
  }
  return 0;
}

function drawSpectrum(){
  const canvas = $('#specCanvas');
  if(!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if(!rect.width || !rect.height) return;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if(canvas.width !== w || canvas.height !== h){ canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;
  const padL = 8, padR = 8, padT = 26, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  ctx.clearRect(0, 0, W, H);

  const minHz = (specFreqs && specFreqs.length > 1) ? Math.max(20, specFreqs[0]) : 20;
  const maxHz = (specFreqs && specFreqs.length > 1) ? Math.max(minHz + 100, specFreqs[specFreqs.length-1]) : 16000;
  const logMin = Math.log2(minHz), logMax = Math.log2(maxHz);
  const xForHz = hz => padL + ((Math.log2(Math.min(maxHz, Math.max(minHz, hz))) - logMin) / (logMax - logMin)) * plotW;

  // Detection band overlays (Bass, Mid, High melbanks + Beat zone)
  const minFreq = melbanksState.min_frequency || 20;
  const [bassMax, midMax, highMax] = melbanksState.max_frequencies || [350, 2000, 15000];
  const beatMin = eqState.beat_min_freq || 20;
  const beatMax = eqState.beat_max_freq || 100;
  const beatAlpha = (0.12 + beatPulse * 0.24).toFixed(3);
  const bandZones = [
    { label: 'BASS', lo: minFreq, hi: bassMax, fill: 'rgba(240,163,54,0.10)', stroke: 'rgba(240,163,54,0.70)', text: '#fcd34d', leftHandleIdx: 2, rightHandleIdx: 3, track: 'top', labelLo: (beatMax > minFreq && beatMax < bassMax - 30) ? beatMax : minFreq },
    { label: 'MID',  lo: bassMax, hi: midMax,  fill: 'rgba(69,212,131,0.07)', stroke: 'rgba(69,212,131,0.70)', text: '#6ee7b7', rightHandleIdx: 4, track: 'top' },
    { label: 'HIGH', lo: midMax,  hi: highMax, fill: 'rgba(56,189,248,0.07)', stroke: 'rgba(56,189,248,0.70)', text: '#7dd3fc', rightHandleIdx: 5, track: 'top' },
    { label: 'BEAT', lo: beatMin, hi: beatMax, fill: `rgba(244,63,94,${beatAlpha})`, stroke: `rgba(244,63,94,${(0.75 + beatPulse * 0.25).toFixed(2)})`, text: '#fda4af', leftHandleIdx: 0, rightHandleIdx: 1, track: 'bottom', isBeat: true },
  ];
  const n = specMel.length;
  const bandLvl = (lo, hi) => {
    if(!n) return 0;
    let sum = 0, cnt = 0;
    for(let i=0; i<n; i++){
      const f = (specFreqs && specFreqs[i]) ? specFreqs[i] : minHz * Math.pow(maxHz / minHz, i / Math.max(1, n - 1));
      if(f >= lo && f <= hi){ sum += Math.min(1, Math.max(0, specMel[i] / runMax)); cnt++; }
    }
    return cnt ? Math.round((sum / cnt) * 100) : 0;
  };
  const drawHandle = (hz, hIdx, stroke, text, track) => {
    const hx = xForHz(hz);
    const active = dragZoneIdx === hIdx || hoverZoneIdx === hIdx;
    const isBottom = track === 'bottom';
    const dotY = isBottom ? (padT + plotH - 2) : (padT + 2);
    const lblY = isBottom ? (padT + plotH - 11) : (padT + 14);
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = active ? '#ffffff' : stroke;
    ctx.lineWidth = active ? 2 : 1.3;
    ctx.beginPath(); ctx.moveTo(hx, padT - 2); ctx.lineTo(hx, padT + plotH + 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = active ? '#ffffff' : text;
    ctx.beginPath(); ctx.arc(hx, dotY, active ? 5 : 4, 0, Math.PI * 2); ctx.fill();
    ctx.font = '9px ui-monospace,monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(hz)}Hz`, Math.min(W - 24, Math.max(24, hx)), lblY);
    ctx.restore();
  };
  bandZones.forEach(bz => {
    if(bz.hi <= minHz || bz.lo >= maxHz) return;
    const x0 = xForHz(Math.max(minHz, bz.lo));
    const x1 = xForHz(Math.min(maxHz, bz.hi));
    const zw = x1 - x0;
    if(zw > 4){
      ctx.fillStyle = bz.fill;
      ctx.fillRect(x0, padT, zw, plotH);
      if(bz.isBeat && beatPulse > 0.15){
        ctx.save();
        ctx.strokeStyle = `rgba(244,63,94,${(beatPulse * 0.9).toFixed(2)})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(x0 + 0.5, padT + 0.5, Math.max(1, zw - 1), plotH - 1);
        ctx.restore();
      }
      const lx0 = xForHz(Math.max(minHz, bz.labelLo ?? bz.lo));
      const lzw = Math.max(zw, x1 - lx0);
      const pct = bandLvl(bz.lo, bz.hi);
      const pulseDot = (bz.isBeat && beatPulse > 0.25) ? ' ●' : '';
      ctx.fillStyle = bz.text;
      ctx.font = 'bold 10px system-ui,sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(lzw > 58 ? `${bz.label}${pulseDot} ${pct}%` : `${bz.label}${pulseDot}`, lx0 + (x1 - lx0) * 0.5, 14);
    }
    if(bz.leftHandleIdx !== undefined) drawHandle(bz.lo, bz.leftHandleIdx, bz.stroke, bz.text, bz.track);
    if(bz.rightHandleIdx !== undefined) drawHandle(bz.hi, bz.rightHandleIdx, bz.stroke, bz.text, bz.track);
  });
  const activeIdx = dragZoneIdx >= 0 ? dragZoneIdx : hoverZoneIdx;
  if(activeIdx >= 0){
    const hNames = ['BEAT Min', 'BEAT Max', 'BASS Min', 'BASS Max', 'MID Max', 'HIGH Max'];
    const hVals = [beatMin, beatMax, minFreq, bassMax, midMax, highMax];
    const hColors = ['#fda4af', '#fda4af', '#fcd34d', '#fcd34d', '#6ee7b7', '#7dd3fc'];
    const hz = Math.round(hVals[activeIdx] || 0);
    const txt = `${hNames[activeIdx]} · ${hz} Hz`;
    const hx = xForHz(hz);
    ctx.save();
    ctx.font = 'bold 10px ui-monospace,monospace';
    const tw = ctx.measureText(txt).width + 14;
    const tx = Math.min(W - tw - 6, Math.max(6, hx - tw * 0.5));
    const ty = activeIdx <= 1 ? (padT + plotH - 36) : (padT + 20);
    ctx.fillStyle = 'rgba(15,23,42,0.92)';
    ctx.strokeStyle = hColors[activeIdx];
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(tx, ty, tw, 18, 5) : ctx.rect(tx, ty, tw, 18);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = hColors[activeIdx];
    ctx.textAlign = 'center';
    ctx.fillText(txt, tx + tw * 0.5, ty + 12.5);
    ctx.restore();
  }

  // Horizontal intensity grid
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for(let i=1; i<=4; i++){
    const y = padT + plotH * (1 - i/4);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
  }

  // Vertical log-frequency grid at EQ band centers
  ctx.font = '10px system-ui,sans-serif';
  ctx.textAlign = 'center';
  EQ_BANDS.forEach(b=>{
    if(b.freq < minHz || b.freq > maxHz) return;
    const x = xForHz(b.freq);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
    ctx.fillStyle = '#8b8e94';
    ctx.fillText(b.label, x, H - 6);
  });

  // Spectrum bars + peak hold
  if(n > 0){
    const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    grad.addColorStop(0, '#ff7a3d');
    grad.addColorStop(0.45, '#f0a336');
    grad.addColorStop(1, 'rgba(240,163,54,0.18)');

    const xs = new Array(n);
    for(let i=0; i<n; i++){
      xs[i] = (specFreqs && specFreqs.length === n) ? xForHz(specFreqs[i]) : (padL + ((i + 0.5) / n) * plotW);
    }

    for(let i=0; i<n; i++){
      const norm = Math.min(1, Math.max(0, specMel[i] / runMax));
      const left = i === 0 ? padL : (xs[i-1] + xs[i]) / 2;
      const right = i === n - 1 ? (W - padR) : (xs[i] + xs[i+1]) / 2;
      const bw = Math.max(2, right - left - 1.5);
      const bh = norm * plotH;
      const bx = left + 0.75;
      const by = padT + plotH - bh;
      ctx.fillStyle = grad;
      ctx.fillRect(bx, by, bw, bh);

      if(specPeakHold && specPeaks[i] > 0.01){
        const py = padT + plotH - Math.min(1, specPeaks[i]) * plotH;
        ctx.fillStyle = '#fff3d6';
        ctx.fillRect(bx, py - 1.5, bw, 2);
      }
    }
  }

  // EQ response curve overlay (-24 dB .. +24 dB mapped around plot mid)
  const midY = padT + plotH * 0.5;
  ctx.save();
  ctx.beginPath();
  const steps = 64;
  for(let s=0; s<=steps; s++){
    const frac = s / steps;
    const hz = Math.pow(2, logMin + frac * (logMax - logMin));
    const db = eqGainAtFreq(hz);
    const x = padL + frac * plotW;
    const y = midY - (db / 24) * (plotH * 0.45);
    if(s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = eqState.eq_enabled ? '#3ecf8e' : 'rgba(139,142,148,0.45)';
  ctx.lineWidth = eqState.eq_enabled ? 2 : 1.25;
  if(!eqState.eq_enabled) ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

window.addEventListener('resize', ()=>{ const p=$('#pane-eq'); if(p && !p.hidden) scheduleSpectrumDraw(); });

// blackout & keyboard shortcuts
let blackoutOn = false, blackoutBusy = false, savedBri = 80, blackoutBriSnap = {};
try{
  const savedBo = JSON.parse(localStorage.getItem('ledfx_blackout_state') || 'null');
  if(savedBo && typeof savedBo === 'object'){
    blackoutOn = !!savedBo.on;
    if(typeof savedBo.savedBri === 'number') savedBri = savedBo.savedBri;
    if(savedBo.snap && typeof savedBo.snap === 'object') blackoutBriSnap = savedBo.snap;
  }
}catch(e){}
function saveBlackoutState(){
  try{ localStorage.setItem('ledfx_blackout_state', JSON.stringify({on: blackoutOn, savedBri, snap: blackoutBriSnap})); }catch(e){}
}
function syncBlackoutUI(){
  const btn = $('#blackoutBtn');
  if(btn){
    btn.classList.toggle('on', blackoutOn);
    btn.textContent = blackoutOn ? 'Blackout ON' : 'Blackout OFF';
  }
  const bigBtn = $('#stBlackoutBtn');
  if(bigBtn){
    bigBtn.classList.toggle('on', blackoutOn);
    const b = bigBtn.querySelector('b');
    if(b) b.textContent = blackoutOn ? 'BLACKOUT ON' : 'BLACKOUT';
  }
  if(blackoutOn){
    if($('#briSlider')) $('#briSlider').value = 0;
    if($('#briVal')) $('#briVal').textContent = '0%';
  }
}
function syncWhiteoutUI(){
  const wBtn = $('#stWhiteoutBtn');
  if(wBtn){
    wBtn.classList.toggle('on', whiteoutOn);
    const b = wBtn.querySelector('b');
    if(b) b.textContent = whiteoutOn ? 'WHITEOUT ON' : 'WHITEOUT';
  }
}
syncBlackoutUI();
async function applyBlackoutToVirtuals(ids){
  const targetIds = ids || Object.keys(virtualsCache || {});
  const errs = [];
  await Promise.all(targetIds.map(async id => {
    const v = virtualsCache[id];
    if(!v?.active) return;
    if(!(id in blackoutBriSnap)){
      const curB = typeof v?.effect?.config?.brightness === 'number' ? v.effect.config.brightness : (savedBri / 100);
      blackoutBriSnap[id] = curB;
    }
    try{ await api(`/virtuals/${id}/effects`, {method:'PUT', body:JSON.stringify({config:{brightness:0}})}); }
    catch(e){ errs.push(e.message); }
  }));
  saveBlackoutState();
  return errs;
}
async function toggleBlackout(){
  if(guardLock() || blackoutBusy) return;
  blackoutBusy = true;
  try{
    if(!blackoutOn && whiteoutOn){
      whiteoutOn = false;
      whiteoutSnap = null;
      syncWhiteoutUI();
    }
    blackoutOn = !blackoutOn;
    if(blackoutOn){
      const curSlider = Number($('#briSlider')?.value);
      savedBri = curSlider > 0 ? curSlider : (savedBri || 80);
      blackoutBriSnap = {};
      syncBlackoutUI();
      const errs = await applyBlackoutToVirtuals();
      if(errs.length) toast(`Blackout ON (${errs.length} virtual(s) failed: ${errs[0]})`, true);
      else toast('Blackout ON');
    }else{
      syncBlackoutUI();
      if($('#briSlider')) $('#briSlider').value = savedBri;
      if($('#briVal')) $('#briVal').textContent = savedBri + '%';
      const errs = [];
      const fallbackBri = savedBri / 100;
      await Promise.all(Object.keys(virtualsCache || {}).map(async id => {
        if(!virtualsCache[id]?.active) return;
        const restoreB = typeof blackoutBriSnap[id] === 'number' ? blackoutBriSnap[id] : fallbackBri;
        try{ await api(`/virtuals/${id}/effects`, {method:'PUT', body:JSON.stringify({config:{brightness:restoreB}})}); }
        catch(e){ errs.push(e.message); }
      }));
      blackoutBriSnap = {};
      saveBlackoutState();
      if(errs.length) toast(`Blackout OFF (${errs.length} virtual(s) failed: ${errs[0]})`, true);
      else toast('Blackout OFF');
    }
  }finally{
    blackoutBusy = false;
  }
}
$('#blackoutBtn')?.addEventListener('click', toggleBlackout);
$('#stBlackoutBtn')?.addEventListener('click', toggleBlackout);

let whiteoutOn = false, whiteoutBusy = false, whiteoutSnap = null;
async function toggleWhiteout(){
  if(guardLock() || whiteoutBusy) return;
  whiteoutBusy = true;
  try{
    const wasBlackout = blackoutOn;
    whiteoutOn = !whiteoutOn;
    syncWhiteoutUI();
    if(whiteoutOn){
      if(wasBlackout){
        blackoutOn = false;
        syncBlackoutUI();
        if($('#briSlider')) $('#briSlider').value = savedBri;
        if($('#briVal')) $('#briVal').textContent = savedBri + '%';
      }
      let latest = virtualsCache;
      try{ const d = await api('/virtuals'); latest = d.virtuals || d; }catch(e){}
      const ids = Object.keys(latest || {}).filter(id => latest[id]?.active);
      whiteoutSnap = {};
      for(const id of ids){
        const snap = JSON.parse(JSON.stringify(latest[id]));
        if(wasBlackout && snap?.effect?.config && typeof blackoutBriSnap[id] === 'number'){
          snap.effect.config.brightness = blackoutBriSnap[id];
        }
        whiteoutSnap[id] = snap;
      }
      if(wasBlackout){
        blackoutBriSnap = {};
        saveBlackoutState();
      }
      await Promise.all(ids.map(id => api(`/virtuals/${id}/effects`, {method:'POST', body: JSON.stringify({type:'singleColor', config:{color:'#ffffff', brightness:1.0}})}).catch(()=>{})));
    }else if(whiteoutSnap){
      await Promise.all(Object.entries(whiteoutSnap).map(([id, v]) => {
        if(v?.active && v?.effect?.type){
          return api(`/virtuals/${id}/effects`, {method:'POST', body: JSON.stringify({type: v.effect.type, config: v.effect.config || {}})}).catch(()=>{});
        }
        return Promise.resolve();
      }));
      whiteoutSnap = null;
    }
    if(typeof loadVirtuals === 'function') loadVirtuals().catch(()=>{});
    toast(whiteoutOn ? 'Whiteout ON' : 'Whiteout OFF');
  }finally{
    whiteoutBusy = false;
  }
}
$('#stWhiteoutBtn')?.addEventListener('click', toggleWhiteout);

document.addEventListener('keydown', e => {
  if(e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = (e.target.tagName || '').toUpperCase();
  if(['INPUT','SELECT','TEXTAREA'].includes(tag)) return;
  if(e.key >= '1' && e.key <= '9'){
    const btns = document.querySelectorAll('#scenes .scene');
    const targetBtn = btns[Number(e.key) - 1];
    if(targetBtn) activateScene(targetBtn.dataset.id);
  }else if(e.key === 'b' || e.key === 'B'){
    toggleBlackout();
  }else if(e.key === 't' || e.key === 'T'){
    $('#tapBtn').click();
  }else if(e.key === 'e' || e.key === 'E'){
    document.querySelector('#tabs button[data-t="eq"]')?.click();
  }else if(e.key === 'm' || e.key === 'M'){
    document.querySelector('#tabs button[data-t="main"]')?.click();
  }
});

// tube arranger
let arrState = [];
function refreshArranger(){
  const sel = $('#arrVirtSel');
  if(!sel) return;
  const prev = sel.value;
  const entries = Object.entries(virtualsCache).filter(([,v]) => v && !v.is_device);
  const list = entries.length ? entries : Object.entries(virtualsCache);
  if(!list.length){
    sel.innerHTML = '<option value="">No virtuals loaded</option>';
    return;
  }
  sel.innerHTML = list.map(([id, v]) => `<option value="${escHtml(id)}">${escHtml(v.config?.name || id)} (${escHtml(id)})</option>`).join('');
  sel.value = (prev && virtualsCache[prev]) ? prev : list[0][0];
  loadArrangerFromVirtual(sel.value);
  if(typeof renderStageGrid === 'function') renderStageGrid();
}

function loadArrangerFromVirtual(vid){
  const v = virtualsCache[vid];
  if(!v) return;
  $('#arrRows').value = v.config?.rows || 1;
  const grp = String(v.config?.grouping || 1);
  const gSel = $('#arrGrouping');
  if(![...gSel.options].some(o => o.value === grp)){
    gSel.insertAdjacentHTML('beforeend', `<option value="${escHtml(grp)}">Custom (grouping=${escHtml(grp)})</option>`);
  }
  gSel.value = grp;

  const segs = Array.isArray(v.segments) ? v.segments : [];
  const seen = new Set();
  const next = [];
  segs.forEach(s => {
    const devId = s[0];
    if(!devicesCache[devId] || seen.has(devId)) return;
    seen.add(devId);
    const d = devicesCache[devId];
    next.push({
      deviceId: devId,
      name: d.config?.name || devId,
      online: d.online !== false,
      pixelCount: d.config?.pixel_count || ((Number(s[2]) - Number(s[1]) + 1) || 36),
      included: true,
      invert: Boolean(s[3]),
    });
  });
  Object.entries(devicesCache).forEach(([devId, d]) => {
    if(seen.has(devId)) return;
    next.push({
      deviceId: devId,
      name: d.config?.name || devId,
      online: d.online !== false,
      pixelCount: d.config?.pixel_count || 36,
      included: false,
      invert: false,
    });
  });
  arrState = next;
  renderArrangerTubes();
}

function renderArrangerTubes(){
  const holder = $('#arrTubes');
  if(!holder) return;
  if(!arrState.length){
    holder.innerHTML = '<div class="empty">No devices loaded yet.</div>';
    return;
  }
  holder.innerHTML = arrState.map((t, i) => `
    <div class="tube-row ${t.included?'':'excluded'}" data-idx="${i}">
      <div class="tube-main">
        <input type="checkbox" data-act="inc" ${t.included?'checked':''}>
        <span class="tube-name">${escHtml(t.name)}</span>
        <span class="tube-badge ${t.online?'on':''}">${t.online?'online':'offline'} · ${t.pixelCount}px</span>
      </div>
      <div class="tube-controls">
        <button class="tgl ${t.invert?'on':''}" data-act="inv">${t.invert?'Inverted':'Normal'}</button>
        <button class="btn" data-act="up" ${i===0?'disabled':''}>&#9650;</button>
        <button class="btn" data-act="dn" ${i===arrState.length-1?'disabled':''}>&#9660;</button>
      </div>
    </div>`).join('');
}

$('#arrVirtSel').addEventListener('change', e => loadArrangerFromVirtual(e.target.value));
$('#arrTubes').addEventListener('click', e => {
  const row = e.target.closest('.tube-row');
  if(!row) return;
  const i = Number(row.dataset.idx);
  const act = e.target.dataset.act;
  if(!act) return;
  if(act === 'inc') arrState[i].included = e.target.checked;
  else if(act === 'inv') arrState[i].invert = !arrState[i].invert;
  else if(act === 'up' && i > 0){ [arrState[i-1], arrState[i]] = [arrState[i], arrState[i-1]]; }
  else if(act === 'dn' && i < arrState.length - 1){ [arrState[i], arrState[i+1]] = [arrState[i+1], arrState[i]]; }
  renderArrangerTubes();
});
$('#arrPreRow').addEventListener('click', ()=>{ $('#arrRows').value = 1; });
$('#arrPre2x5').addEventListener('click', ()=>{ $('#arrRows').value = 2; });
$('#arrIncludeOnline').addEventListener('click', ()=>{ arrState.forEach(t => t.included = t.online); renderArrangerTubes(); });
$('#arrIncludeAll').addEventListener('click', ()=>{ arrState.forEach(t => t.included = true); renderArrangerTubes(); });
$('#arrInvertAlt').addEventListener('click', ()=>{
  let k = 0;
  arrState.forEach(t => { if(t.included){ t.invert = (k % 2 === 1); k++; } });
  renderArrangerTubes();
});

$('#arrApplyBtn').addEventListener('click', async ()=>{
  const vid = $('#arrVirtSel').value;
  if(!vid) return;
  const chosen = arrState.filter(t => t.included);
  if(!chosen.length){ toast('Select at least one tube', true); return; }
  const rows = Math.max(1, Number($('#arrRows').value) || 1);
  const grouping = Math.max(1, Number($('#arrGrouping').value) || 1);
  const segments = chosen.map(t => [t.deviceId, 0, Math.max(0, t.pixelCount - 1), t.invert]);
  try{
    await api('/virtuals', {method:'POST', body:JSON.stringify({id:vid, config:{rows, grouping}})});
    await api(`/virtuals/${vid}`, {method:'POST', body:JSON.stringify({segments})});
    toast(`Updated "${vid}" (${chosen.length} tubes, rows=${rows}, grouping=${grouping})`);
    await loadVirtuals();
  }catch(e){
    toast('Apply arrangement failed: '+e.message, true);
  }
});

// graphical stage grid
const GRID_DIRS = [
  {id:'H+', label:'H →', horiz:true,  inv:false},
  {id:'H-', label:'H ←', horiz:true,  inv:true},
  {id:'V+', label:'V ↓', horiz:false, inv:false},
  {id:'V-', label:'V ↑', horiz:false, inv:true},
];
let gridCols = 5, gridRows = 2, gridCells = {}, gridBrush = '';
try{
  const savedGrid = JSON.parse(localStorage.getItem('ledfx_stage_grid') || 'null');
  if(savedGrid && typeof savedGrid === 'object'){
    if(savedGrid.cols) gridCols = Math.max(1, Math.min(12, Number(savedGrid.cols) || 5));
    if(savedGrid.rows) gridRows = Math.max(1, Math.min(12, Number(savedGrid.rows) || 2));
    if(savedGrid.cells && typeof savedGrid.cells === 'object') gridCells = savedGrid.cells;
    const gcIn = $('#gridCols'), grIn = $('#gridRows');
    if(gcIn) gcIn.value = gridCols;
    if(grIn) grIn.value = gridRows;
  }
}catch(e){}

function isFlipped(v){ return v === true || v === '1' || v === 'true'; }
function sanitizeGridCells(cells){
  const out = {};
  if(!cells || typeof cells !== 'object') return out;
  for(const [k, c] of Object.entries(cells)){
    if(!c || !c.deviceId) continue;
    const entry = { deviceId: String(c.deviceId), dir: String(c.dir || 'H+') };
    if(isFlipped(c.flipX)) entry.flipX = '1';
    if(isFlipped(c.flipY)) entry.flipY = '1';
    out[k] = entry;
  }
  return out;
}
function saveStageGrid(){
  try{ localStorage.setItem('ledfx_stage_grid', JSON.stringify({cols:gridCols, rows:gridRows, cells:gridCells})); }catch(e){}
}

function getTubeDevices(){
  return Object.entries(devicesCache)
    .filter(([, d]) => d && d.type !== 'dummy')
    .sort((a, b) => (a[1]?.config?.name || a[0]).localeCompare(b[1]?.config?.name || b[0], undefined, {numeric:true, sensitivity:'base'}));
}

function renderStageGrid(){
  const pal = $('#gridPalette'), grid = $('#stageGrid');
  if(!pal || !grid) return;
  const used = typeof getUsedActiveDevices === 'function' ? getUsedActiveDevices(layoutEditingId) : new Map();
  const devs = getTubeDevices().filter(([id]) => !used.has(id) || layoutEditDevices.has(id));
  if((!gridBrush || (gridBrush !== '__ERASE__' && !devs.some(([id]) => id === gridBrush))) && devs.length) gridBrush = devs[0][0];
  const placedDevs = new Set(Object.values(gridCells).map(c => c.deviceId));
  pal.innerHTML = `<button class="gchip ${gridBrush==='__ERASE__'?'sel':''}" data-dev="__ERASE__">Eraser</button>` +
    devs.map(([id, d]) => `<button class="gchip ${gridBrush===id?'sel':''} ${placedDevs.has(id)?'placed':''}" data-dev="${escHtml(id)}">${escHtml(d.config?.name || id)}</button>`).join('');

  grid.style.gridTemplateColumns = `repeat(${gridCols}, minmax(84px, 1fr))`;
  let html = '';
  for(let r=0; r<gridRows; r++){
    for(let c=0; c<gridCols; c++){
      const key = `${r},${c}`;
      const cell = gridCells[key];
      if(cell){
        const d = devicesCache[cell.deviceId];
        const name = d?.config?.name || cell.deviceId;
        const dir = GRID_DIRS.find(x=>x.id===cell.dir) || GRID_DIRS[0];
        const fx = isFlipped(cell.flipX), fy = isFlipped(cell.flipY);
        const startEdge = dir.horiz ? (dir.inv ? 'right' : 'left') : (dir.inv ? 'bottom' : 'top');
        html += `<div class="gcell filled start-${startEdge}" data-key="${key}" title="Start at ${startEdge} (blue edge)">
          <span>${escHtml(name)}</span>
          <span class="gdir">${dir.label} · start ${startEdge}</span>
          <div class="gflips">
            <button type="button" class="gflip ${fx?'on':''}" data-flip="x" title="Mirror horizontally (Flip X)">Flip X</button>
            <button type="button" class="gflip ${fy?'on':''}" data-flip="y" title="Mirror vertically (Flip Y)">Flip Y</button>
          </div>
        </div>`;
      }else{
        html += `<div class="gcell" data-key="${key}">+</div>`;
      }
    }
  }
  grid.innerHTML = html;
  $('#gridInfo').textContent = `${placedDevs.size} tube(s) placed on ${gridCols}×${gridRows} grid`;
  saveStageGrid();
  if(typeof scheduleTubePreview === 'function') scheduleTubePreview();
  if(typeof scheduleLayoutPreview === 'function') scheduleLayoutPreview();
}

$('#gridPalette').addEventListener('click', e => {
  const btn = e.target.closest('.gchip');
  if(!btn) return;
  gridBrush = btn.dataset.dev;
  renderStageGrid();
});

$('#stageGrid').addEventListener('click', e => {
  const flipBtn = e.target.closest('.gflip');
  const cellEl = e.target.closest('.gcell');
  if(!cellEl) return;
  const key = cellEl.dataset.key;
  if(flipBtn && gridCells[key]){
    e.stopPropagation();
    const fk = flipBtn.dataset.flip === 'x' ? 'flipX' : 'flipY';
    if(isFlipped(gridCells[key][fk])) delete gridCells[key][fk];
    else gridCells[key][fk] = '1';
    renderStageGrid();
    return;
  }
  if(gridBrush === '__ERASE__'){
    delete gridCells[key];
  }else if(gridCells[key]){
    const curIdx = GRID_DIRS.findIndex(x=>x.id===gridCells[key].dir);
    gridCells[key].dir = GRID_DIRS[(curIdx + 1) % GRID_DIRS.length].id;
  }else if(gridBrush){
    for(const [k, v] of Object.entries(gridCells)){
      if(v.deviceId === gridBrush) delete gridCells[k];
    }
    gridCells[key] = {deviceId:gridBrush, dir: gridCols >= 6 && gridRows === 1 ? 'V+' : 'H+'};
  }
  renderStageGrid();
});

$('#stageGrid').addEventListener('contextmenu', e => {
  const cellEl = e.target.closest('.gcell');
  if(!cellEl) return;
  e.preventDefault();
  delete gridCells[cellEl.dataset.key];
  renderStageGrid();
});

function setGridPreset(cols, rows, defaultDir){
  gridCols = cols; gridRows = rows;
  $('#gridCols').value = cols; $('#gridRows').value = rows;
  gridCells = {};
  const devs = getTubeDevices().map(([id]) => id);
  let idx = 0;
  for(let r=0; r<rows; r++){
    for(let c=0; c<cols; c++){
      if(idx < devs.length) gridCells[`${r},${c}`] = {deviceId:devs[idx++], dir:defaultDir};
    }
  }
  renderStageGrid();
}

$('#gridCols').addEventListener('change', e => { gridCols = Math.max(1, Math.min(12, Number(e.target.value)||1)); renderStageGrid(); });
$('#gridRows').addEventListener('change', e => { gridRows = Math.max(1, Math.min(12, Number(e.target.value)||1)); renderStageGrid(); });
$('#gridPre10x1').addEventListener('click', () => setGridPreset(10, 1, 'V+'));
$('#gridPre5x2').addEventListener('click', () => setGridPreset(5, 2, 'H+'));
$('#gridPre2x5').addEventListener('click', () => setGridPreset(2, 5, 'H+'));
$('#gridClearBtn').addEventListener('click', () => { gridCells = {}; renderStageGrid(); });

function buildSegmentsFromStageGrid(grouping){
  const colW = new Array(gridCols).fill(0);
  const rowH = new Array(gridRows).fill(0);
  for(let r=0; r<gridRows; r++){
    for(let c=0; c<gridCols; c++){
      const cell = gridCells[`${r},${c}`];
      if(!cell) continue;
      const px = devicesCache[cell.deviceId]?.config?.pixel_count || 36;
      const units = Math.max(1, Math.floor(px / grouping));
      const dir = GRID_DIRS.find(x=>x.id===cell.dir) || GRID_DIRS[0];
      const w = dir.horiz ? units : 1;
      const h = dir.horiz ? 1 : units;
      colW[c] = Math.max(colW[c], w);
      rowH[r] = Math.max(rowH[r], h);
    }
  }
  const activeCols = colW.map(w => w || 0);
  const activeRows = rowH.map(h => h || 0);
  const totalW = activeCols.reduce((a,b)=>a+b, 0);
  const totalH = activeRows.reduce((a,b)=>a+b, 0);
  if(!totalW || !totalH) return null;

  const colX = []; let cx = 0;
  for(let c=0; c<gridCols; c++){ colX.push(cx); cx += activeCols[c]; }
  const rowY = []; let ry = 0;
  for(let r=0; r<gridRows; r++){ rowY.push(ry); ry += activeRows[r]; }

  const canvas = Array.from({length:totalH}, () => new Array(totalW).fill(null));
  for(let r=0; r<gridRows; r++){
    for(let c=0; c<gridCols; c++){
      const cell = gridCells[`${r},${c}`];
      if(!cell) continue;
      const px = devicesCache[cell.deviceId]?.config?.pixel_count || 36;
      const units = Math.max(1, Math.floor(px / grouping));
      const dir = GRID_DIRS.find(x=>x.id===cell.dir) || GRID_DIRS[0];
      const invAlong = !!(dir.horiz ? (dir.inv ^ isFlipped(cell.flipX)) : (dir.inv ^ isFlipped(cell.flipY)));
      for(let u=0; u<units; u++){
        const unitIdx = invAlong ? (units - 1 - u) : u;
        const x = colX[c] + (dir.horiz ? u : 0);
        const y = rowY[r] + (dir.horiz ? 0 : u);
        if(y < totalH && x < totalW){
          canvas[y][x] = {dev:cell.deviceId, start:unitIdx*grouping, end:unitIdx*grouping + grouping - 1, inv:invAlong};
        }
      }
    }
  }

  const rawRuns = [];
  for(let y=0; y<totalH; y++){
    for(let x=0; x<totalW; x++){
      const p = canvas[y][x];
      if(!p) continue;
      const prev = rawRuns[rawRuns.length - 1];
      if(prev && prev[0] === p.dev && prev[3] === p.inv && (
        (!p.inv && prev[2] + 1 === p.start) ||
        (p.inv && prev[1] - 1 === p.end)
      )){
        if(!p.inv) prev[2] = p.end;
        else prev[1] = p.start;
      }else{
        rawRuns.push([p.dev, p.start, p.end, p.inv]);
      }
    }
  }
  return {rows:totalH, segments:rawRuns};
}

$('#gridApplyBtn').addEventListener('click', async ()=>{
  const vid = $('#arrVirtSel').value;
  if(!vid){ toast('Select a target virtual first', true); return; }
  const grouping = Math.max(1, Number($('#arrGrouping').value) || 1);
  const built = buildSegmentsFromStageGrid(grouping);
  if(!built || !built.segments.length){ toast('Place at least one tube on the grid', true); return; }
  try{
    await api('/virtuals', {method:'POST', body:JSON.stringify({id:vid, config:{rows:built.rows, grouping}})});
    await api(`/virtuals/${vid}`, {method:'POST', body:JSON.stringify({segments:built.segments})});
    toast(`Grid applied to "${vid}" (${built.rows} rows, ${built.segments.length} segments)`);
    await loadVirtuals();
  }catch(e){
    toast('Apply grid failed: '+e.message, true);
  }
});

