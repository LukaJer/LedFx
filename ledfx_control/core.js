const IS_SERVED_FROM_LEDFX = location.protocol.startsWith('http') && (location.pathname === '/control' || location.pathname === '/dj');
let HOST = IS_SERVED_FROM_LEDFX ? location.host : (localStorage.getItem('ledfx_host') || '');
let effectTypes = [];
let virtualsCache = {};
document.getElementById('host').value = HOST;

const $ = s => document.querySelector(s);
function toast(msg, err){
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(t._h); t._h = setTimeout(()=>t.classList.remove('show'), 2600);
}
function setConnected(on){
  $('#dot').classList.toggle('on', on);
  $('#statusText').textContent = on ? 'connected · ' + HOST : 'disconnected';
}
async function api(path, opts){
  const t0=performance.now();
  let res;
  try{
    res = await fetch(`http://${HOST}/api${path}`, {
      headers: {'Content-Type':'application/json'},
      ...opts
    });
  }catch(err){
    setConnected(false);
    logCall(path, opts?.method||'GET', 'NET', Math.round(performance.now()-t0));
    throw err;
  }
  const raw = await res.text();
  logCall(path, opts?.method||'GET', res.status, Math.round(performance.now()-t0));
  let data = {};
  try{ data = raw ? JSON.parse(raw) : {}; }catch(e){ console.error('Non-JSON response from', path, raw); }
  if(!res.ok || data.status === 'failed'){
    console.error('LedFx API error', path, opts?.method||'GET', res.status, data);
    throw new Error(data.payload?.reason || data.reason || data.error || `${res.status} ${res.statusText}`);
  }
  return data;
}

$('#connectBtn').addEventListener('click', connect);
$('#host').addEventListener('keydown', e => { if(e.key === 'Enter') connect(); });

async function connect(){
  HOST = $('#host').value.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  $('#host').value = HOST;
  if(!HOST){ toast('Enter a host:port', true); return; }
  localStorage.setItem('ledfx_host', HOST);
  try{
    const info = await api('/info');
    setConnected(true); wsSeen=0; connectWS();
    toast(`Connected to ${info.name} ${info.version}`);
    await Promise.all([loadSchema(), loadLayouts(), loadScenes(), loadVirtuals(), loadAudioConfig(), loadDevices()]);
    renderScenes();
  }catch(e){
    setConnected(false);
    toast('Could not reach LedFx: ' + e.message, true);
  }
}

let effectsSchema = {};
async function loadSchema(){
  try{
    const s = await api('/schema');
    effectsSchema = s.effects || s.schema || s || {};
    effectTypes = Object.keys(effectsSchema).filter(k => !['status','effects'].includes(k));
    if(!effectTypes.length) toast('No effect types found — check console (F12) for the raw schema response', true);
  }catch(e){ effectTypes = []; effectsSchema = {}; toast('Failed to load effect list: ' + e.message, true); }
}

function escHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

const LEDFX_GRADIENTS = {
  Rainbow: 'linear-gradient(90deg, rgb(255,0,0) 0%, rgb(255,120,0) 14%, rgb(255,200,0) 28%, rgb(0,255,0) 42%, rgb(0,199,140) 56%, rgb(0,0,255) 70%, rgb(128,0,128) 84%, rgb(255,0,178) 98%)',
  Dancefloor: 'linear-gradient(90deg, rgb(255,0,0) 0%, rgb(255,0,178) 50%, rgb(0,0,255) 100%)',
  Plasma: 'linear-gradient(90deg, rgb(0,0,255) 0%, rgb(128,0,128) 25%, rgb(255,0,0) 50%, rgb(255,40,0) 75%, rgb(255,200,0) 100%)',
  Ocean: 'linear-gradient(90deg, rgb(0,255,255) 0%, rgb(0,0,255) 100%)',
  Viridis: 'linear-gradient(90deg, rgb(128,0,128) 0%, rgb(0,0,255) 25%, rgb(0,128,128) 50%, rgb(0,255,0) 75%, rgb(255,200,0) 100%)',
  Jungle: 'linear-gradient(90deg, rgb(0,255,0) 0%, rgb(34,139,34) 50%, rgb(255,120,0) 100%)',
  Spring: 'linear-gradient(90deg, rgb(255,0,178) 0%, rgb(255,40,0) 50%, rgb(255,200,0) 100%)',
  Winter: 'linear-gradient(90deg, rgb(0,199,140) 0%, rgb(0,255,50) 100%)',
  Frost: 'linear-gradient(90deg, rgb(0,0,255) 0%, rgb(0,255,255) 33%, rgb(128,0,128) 66%, rgb(255,0,178) 99%)',
  Sunset: 'linear-gradient(90deg, rgb(0,0,128) 0%, rgb(255,120,0) 50%, rgb(255,0,0) 100%)',
  Borealis: 'linear-gradient(90deg, rgb(255,40,0) 0%, rgb(128,0,128) 33%, rgb(0,199,140) 66%, rgb(0,255,0) 99%)',
  Rust: 'linear-gradient(90deg, rgb(255,40,0) 0%, rgb(255,0,0) 100%)',
  Winamp: 'linear-gradient(90deg, rgb(0,255,0) 0%, rgb(255,200,0) 25%, rgb(255,120,0) 50%, rgb(255,40,0) 75%, rgb(255,0,0) 100%)'
};

function sceneSegmentStyle(eff){
  const c = eff?.config || {};
  if(typeof c.gradient === 'string'){
    const g = LEDFX_GRADIENTS[c.gradient] || c.gradient.trim();
    if(/^(#|rgb|hsl|linear-gradient|radial-gradient)/i.test(g)) return `background:${g}`;
  }
  const colors = [];
  for(const [k, v] of Object.entries(c)){
    if(k === 'background_color' || typeof v !== 'string') continue;
    if(/^#[0-9a-f]{3,8}$/i.test(v) || /^rgb/i.test(v) || /^linear-gradient/i.test(v)) colors.push(v);
  }
  if(colors.length === 1) return `background:${colors[0]}`;
  if(colors.length > 1) return `background:linear-gradient(90deg,${colors.join(',')})`;
  if(c.background_color && c.background_color !== '#000000') return `background:${c.background_color}`;
  return 'background:linear-gradient(90deg,var(--amber),var(--amber2));opacity:.55';
}

let scenesCache = {};

function extractSceneColors(s){
  const cols = [];
  for(const eff of Object.values(s?.virtuals || {})){
    if(!eff || !eff.type || !eff.config) continue;
    for(const [k, v] of Object.entries(eff.config)){
      if(k === 'background_color' || typeof v !== 'string') continue;
      const matches = v.match(/#[0-9a-f]{3,8}|rgba?\([^)]+\)/gi);
      if(matches) cols.push(...matches);
    }
  }
  return cols.length ? cols : null;
}

const deckTagFilter = {};
function getSceneTags(s){
  if(!s || !s.scene_tags) return [];
  return String(s.scene_tags).split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
}
function renderTagBadges(tags){
  if(!tags.length) return '';
  return `<div class="scene-tags">${tags.map(t => `<span class="stag stag-${escHtml(t)}">${escHtml(t)}</span>`).join('')}</div>`;
}
function applyDeckTagFilter(card, tag){
  card.querySelectorAll('.tag-bar .tag-pill').forEach(b => b.classList.toggle('on', (b.dataset.tag || '') === tag));
  card.querySelectorAll('.lprev-scenes .scene').forEach(btn => {
    const tags = (btn.dataset.tags || '').split(',').filter(Boolean);
    btn.hidden = !!(tag && !tags.includes(tag));
  });
}
async function editSceneTags(sid){
  const s = scenesCache[sid];
  if(!s) return;
  const cur = getSceneTags(s).join(', ');
  const input = prompt(`Edit tags for "${s.name || sid}" (comma-separated, e.g. chill, house, dynamic, trippy):`, cur);
  if(input === null) return;
  const cleaned = [...new Set(input.split(',').map(t => t.trim().toLowerCase()).filter(Boolean))].join(',');
  try{
    await api('/scenes', {method:'POST', body: JSON.stringify({id: sid, scene_tags: cleaned})});
    s.scene_tags = cleaned;
    renderScenes();
    toast(cleaned ? `Tags saved: ${cleaned}` : 'Tags cleared');
  }catch(e){ toast('Failed to save tags: ' + e.message, true); }
}
function syncSceneDisplay(id){
  const s = scenesCache[id];
  const label = s?.name || id;
  lastScene = id;
  if($('#stScene')) $('#stScene').textContent = label;
  const cols = extractSceneColors(s);
  if(cols){
    curPalette = {name: label, colors: cols};
    if($('#stPal')) $('#stPal').textContent = label;
  }
  if(typeof syncPaletteDisplay === 'function') syncPaletteDisplay();
}

let layoutsCache = {};
let activeLayoutId = '';
let activeDeckId = '';
let mainTargetZone = '';
let layoutEditingId = '';
let layoutEditDevices = new Set();
let layoutEditVirtuals = new Set();
let showAllScenes = false;

function sceneMatchesLayoutFor(s, lid){
  if(showAllScenes || !lid) return true;
  const layout = layoutsCache[lid];
  if(!layout) return true;
  const tag = (layout.scene_tag || '').trim().toLowerCase();
  const raw = String(s?.scene_tags || '').trim().toLowerCase();
  const tags = raw ? raw.split(',').map(x=>x.trim()).filter(Boolean) : [];
  if(tags.includes('all')) return true;
  const layoutVirts = new Set(Object.keys(layout.virtuals || {}));
  const sceneVirts = Object.entries(s?.virtuals || {}).filter(([,e]) => e && e.type).map(([vid]) => vid);
  if(layoutVirts.size && sceneVirts.length){
    return sceneVirts.some(vid => layoutVirts.has(vid));
  }
  if(tag) return tags.includes(tag);
  return !layoutVirts.size && !sceneVirts.length;
}

function sceneMatchesLayout(s){
  return sceneMatchesLayoutFor(s, activeDeckId || activeLayoutId);
}

function getLayoutDevices(p){
  if(!p) return [];
  if(Array.isArray(p.devices) && p.devices.length) return p.devices;
  if(p.grid_cells && typeof p.grid_cells === 'object'){
    return [...new Set(Object.values(p.grid_cells).map(c => c?.deviceId).filter(Boolean))];
  }
  return [];
}

function getUsedActiveDevices(excludeLayoutId){
  const used = new Map();
  for(const [id, p] of Object.entries(layoutsCache)){
    if(!p || p.enabled === false || id === excludeLayoutId) continue;
    for(const did of getLayoutDevices(p)){
      if(!used.has(did)) used.set(did, p.name || id);
    }
  }
  return used;
}

function findLayoutTubeConflict(layoutId, devIds){
  const used = getUsedActiveDevices(layoutId);
  for(const did of devIds){
    if(used.has(did)) return { devId: did, layoutName: used.get(did) };
  }
  return null;
}

let layoutOrder = [];
try{
  const savedOrder = JSON.parse(localStorage.getItem('ledfx_layout_order') || '[]');
  if(Array.isArray(savedOrder)) layoutOrder = savedOrder;
}catch(e){}

function getOrderedLayoutEntries(onlyEnabled){
  let entries = Object.entries(layoutsCache);
  if(onlyEnabled) entries = entries.filter(([, p]) => p && p.enabled !== false);
  const rank = new Map(layoutOrder.map((id, i) => [id, i]));
  return entries.sort((a, b) => {
    const ra = rank.has(a[0]) ? rank.get(a[0]) : 9999;
    const rb = rank.has(b[0]) ? rank.get(b[0]) : 9999;
    return ra - rb || a[0].localeCompare(b[0]);
  });
}

function moveLayoutOrder(id, delta){
  const ids = getOrderedLayoutEntries(false).map(([lid]) => lid);
  const idx = ids.indexOf(id);
  const next = idx + delta;
  if(idx < 0 || next < 0 || next >= ids.length) return;
  [ids[idx], ids[next]] = [ids[next], ids[idx]];
  layoutOrder = ids;
  try{ localStorage.setItem('ledfx_layout_order', JSON.stringify(layoutOrder)); }catch(e){}
  multiPreviewKey = '';
  renderLayoutsOverview();
  renderDeckTabs();
  if(typeof scheduleTubePreview === 'function') scheduleTubePreview();
}

function renderDeckTabs(){
  const holder = $('#deckTabs');
  if(!holder) return;
  const enabled = getOrderedLayoutEntries(true);
  holder.innerHTML = enabled.map(([id, p]) =>
    `<button data-t="main" data-deck="${escHtml(id)}">${escHtml(p.name || id)}</button>`
  ).join('');
  if(activeDeckId && (!layoutsCache[activeDeckId] || layoutsCache[activeDeckId].enabled === false)) activeDeckId = '';
  const mainVisible = !$('#pane-main').hidden;
  document.querySelectorAll('#tabs button[data-t="main"]').forEach(b => {
    b.classList.toggle('on', mainVisible && (b.dataset.deck || '') === activeDeckId);
  });
  const deckGrid = $('#deckGridMain');
  if(deckGrid) deckGrid.hidden = !activeDeckId && enabled.length > 0;
  const mainScenesSec = $('#mainScenesSec');
  if(mainScenesSec) mainScenesSec.hidden = !activeDeckId && enabled.length > 0;
  const zoneBar = $('#mainZoneBar');
  if(zoneBar){
    if(!activeDeckId && enabled.length){
      if(mainTargetZone && !layoutsCache[mainTargetZone]) mainTargetZone = '';
      zoneBar.hidden = false;
      zoneBar.innerHTML = `<span class="status">CONTROL ZONE</span><div class="seg" id="zoneSeg"><button data-z="" class="${!mainTargetZone?'on':''}">All Zones</button>` +
        enabled.map(([id, p]) => `<button data-z="${escHtml(id)}" class="${mainTargetZone===id?'on':''}">${escHtml(p.name || id)}</button>`).join('') + `</div>`;
      zoneBar.querySelectorAll('#zoneSeg button').forEach(b => b.addEventListener('click', () => {
        mainTargetZone = b.dataset.z || '';
        renderDeckTabs();
      }));
    }else{
      zoneBar.hidden = true;
    }
  }
}

function renderLayoutsOverview(){
  const box = $('#layoutsOverview');
  if(!box) return;
  const entries = getOrderedLayoutEntries(false);
  if(!entries.length){
    box.innerHTML = '<div class="empty">No saved layouts yet. Configure one below and click Save Layout.</div>';
    return;
  }
  box.innerHTML = entries.map(([id, p], idx) => {
    const active = p.enabled !== false;
    const devs = getLayoutDevices(p);
    const vCount = Object.keys(p.virtuals || {}).length;
    const conflict = !active ? findLayoutTubeConflict(id, devs) : null;
    const pills = devs.length
      ? devs.map(did => `<span class="layout-pill">${escHtml(devicesCache[did]?.config?.name || did)}</span>`).join('')
      : '<span class="layout-pill">no tubes assigned</span>';
    return `
      <div class="layout-card ${active?'on':''}">
        <div class="layout-card-head">
          <div>
            <div class="layout-card-title">${escHtml(p.name || id)}</div>
            <div class="status">${p.scene_tag ? `tag: ${escHtml(p.scene_tag)} · ` : ''}${devs.length} tube(s) · ${vCount} virtual(s)</div>
          </div>
          <button class="tgl ${active?'on':''}" data-ltog="${escHtml(id)}" ${conflict ? `title="Conflict: ${escHtml(conflict.devId)} is active in ${escHtml(conflict.layoutName)}"` : ''}>${active ? 'Active' : 'Inactive'}</button>
        </div>
        <div class="layout-card-tubes">${pills}</div>
        ${conflict ? `<div class="status" style="color:var(--warn)">Blocked: ${escHtml(devicesCache[conflict.devId]?.config?.name || conflict.devId)} active in "${escHtml(conflict.layoutName)}"</div>` : ''}
        <div class="row2" style="margin:2px 0 0">
          <button class="btn" data-lmove="${escHtml(id)}" data-dir="-1" ${idx===0?'disabled':''} style="padding:5px 8px;font-size:12px" title="Move earlier on Main page">&larr;</button>
          <button class="btn" data-lmove="${escHtml(id)}" data-dir="1" ${idx===entries.length-1?'disabled':''} style="padding:5px 8px;font-size:12px" title="Move later on Main page">&rarr;</button>
          <button class="btn" data-ledit="${escHtml(id)}" style="padding:5px 10px;font-size:12px">Edit</button>
          <button class="btn" data-lapply="${escHtml(id)}" style="padding:5px 10px;font-size:12px">Apply</button>
          <button class="btn" data-ldel="${escHtml(id)}" style="padding:5px 10px;font-size:12px">Delete</button>
        </div>
      </div>`;
  }).join('');
  box.querySelectorAll('[data-lmove]').forEach(b => b.addEventListener('click', () => {
    moveLayoutOrder(b.dataset.lmove, Number(b.dataset.dir));
  }));
  box.querySelectorAll('[data-ltog]').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.ltog, p = layoutsCache[id];
    if(!p) return;
    const nextEnabled = p.enabled === false;
    if(nextEnabled){
      const conflict = findLayoutTubeConflict(id, getLayoutDevices(p));
      if(conflict){
        const dName = devicesCache[conflict.devId]?.config?.name || conflict.devId;
        toast(`Cannot activate "${p.name}": ${dName} is already active in "${conflict.layoutName}"`, true);
        return;
      }
    }
    try{
      await api('/layouts', {method:'POST', body:JSON.stringify({id, enabled: nextEnabled, snapshot: false})});
      if(!nextEnabled && activeDeckId === id) activeDeckId = '';
      await loadLayouts();
      toast(`${p.name} ${nextEnabled ? 'activated' : 'deactivated'}`);
    }catch(e){ toast('Toggle layout failed: '+e.message, true); }
  }));
  box.querySelectorAll('[data-ledit]').forEach(b => b.addEventListener('click', () => {
    loadLayoutIntoEditor(b.dataset.ledit);
    if($('#layoutSel')) $('#layoutSel').value = b.dataset.ledit;
    $('#layoutNameIn')?.scrollIntoView({behavior:'smooth', block:'center'});
    toast(`Editing "${layoutsCache[b.dataset.ledit]?.name || b.dataset.ledit}"`);
  }));
  box.querySelectorAll('[data-lapply]').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.lapply;
    try{
      const res = await api('/layouts', {method:'PUT', body:JSON.stringify({id})});
      activeLayoutId = res.active_layout_id || id;
      syncLayoutUI(); renderScenes(); await loadVirtuals();
      toast(`Layout "${layoutsCache[id]?.name || id}" applied`);
    }catch(e){ toast('Apply layout failed: '+e.message, true); }
  }));
  box.querySelectorAll('[data-ldel]').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.ldel;
    try{
      await api('/layouts', {method:'DELETE', body:JSON.stringify({id})});
      if(activeLayoutId === id) activeLayoutId = '';
      if(activeDeckId === id) activeDeckId = '';
      if(layoutEditingId === id) loadLayoutIntoEditor('');
      await loadLayouts();
      toast('Layout deleted');
    }catch(e){ toast('Delete layout failed: '+e.message, true); }
  }));
}

function renderLayoutEditorBoxes(){
  const devBox = $('#layoutDevicesBox'), virtBox = $('#layoutVirtualsBox');
  if(devBox){
    const used = getUsedActiveDevices(layoutEditingId);
    const allTubes = typeof getTubeDevices === 'function' ? getTubeDevices() : Object.entries(devicesCache);
    const tubes = allTubes.filter(([id]) => !used.has(id) || layoutEditDevices.has(id));
    devBox.innerHTML = tubes.length
      ? tubes.map(([id, d]) => `<button type="button" class="gchip ${layoutEditDevices.has(id)?'sel':''}" data-ldev="${escHtml(id)}">${escHtml(d.config?.name || id)}</button>`).join('')
      : '<span class="status">All tubes are already assigned to active layouts</span>';
    devBox.querySelectorAll('[data-ldev]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.ldev;
      if(layoutEditDevices.has(id)) layoutEditDevices.delete(id);
      else layoutEditDevices.add(id);
      renderLayoutEditorBoxes();
    }));
  }
  if(virtBox){
    const virts = Object.entries(virtualsCache).filter(([, v]) => v && !v.is_device);
    virtBox.innerHTML = virts.length
      ? virts.map(([id, v]) => `<button type="button" class="gchip ${layoutEditVirtuals.has(id)?'sel':''}" data-lvirt="${escHtml(id)}">${escHtml(v.config?.name || id)}</button>`).join('')
      : '<span class="status">No virtuals loaded</span>';
    virtBox.querySelectorAll('[data-lvirt]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.lvirt;
      if(layoutEditVirtuals.has(id)) layoutEditVirtuals.delete(id);
      else layoutEditVirtuals.add(id);
      renderLayoutEditorBoxes();
    }));
  }
  if(typeof renderLayoutCopyScenes === 'function') renderLayoutCopyScenes();
}

function loadLayoutIntoEditor(id){
  layoutEditingId = id || '';
  const p = layoutsCache[id];
  if(!p){
    $('#layoutNameIn').value = '';
    $('#layoutTagIn').value = '';
    if($('#layoutEnabledChk')) $('#layoutEnabledChk').checked = true;
    layoutEditDevices = new Set();
    layoutEditVirtuals = new Set();
    renderLayoutEditorBoxes();
    return;
  }
  $('#layoutNameIn').value = p.name || id;
  $('#layoutTagIn').value = p.scene_tag || '';
  if($('#layoutEnabledChk')) $('#layoutEnabledChk').checked = p.enabled !== false;
  layoutEditDevices = new Set(Array.isArray(p.devices) ? p.devices : []);
  layoutEditVirtuals = new Set(Object.keys(p.virtuals || {}));
  renderLayoutEditorBoxes();
  if(p.grid_cols && p.grid_rows && typeof renderStageGrid === 'function'){
    gridCols = p.grid_cols;
    gridRows = p.grid_rows;
    gridCells = (p.grid_cells && typeof p.grid_cells === 'object') ? JSON.parse(JSON.stringify(p.grid_cells)) : {};
    if($('#gridCols')) $('#gridCols').value = gridCols;
    if($('#gridRows')) $('#gridRows').value = gridRows;
    renderStageGrid();
  }
}

function syncLayoutUI(){
  const sel = $('#layoutSel');
  if(!sel) return;
  const entries = Object.entries(layoutsCache);
  const curSel = layoutEditingId || activeLayoutId;
  sel.innerHTML = `<option value="">New / None</option>` + entries.map(([id, p]) =>
    `<option value="${escHtml(id)}" ${id===curSel?'selected':''}>${escHtml(p.name || id)}${p.scene_tag?` [${escHtml(p.scene_tag)}]`:''}</option>`
  ).join('');
  const cur = layoutsCache[activeLayoutId];
  $('#layoutStatus').textContent = cur
    ? `active: ${cur.name}${cur.scene_tag ? ` · tag "${cur.scene_tag}"` : ''}`
    : `${entries.length} saved layout(s)`;
  const editing = !!(layoutEditingId && layoutsCache[layoutEditingId]);
  const modeBadge = $('#layoutModeBadge');
  if(modeBadge){
    modeBadge.textContent = editing ? `Editing: ${layoutsCache[layoutEditingId].name || layoutEditingId}` : 'Creating New Layout';
    modeBadge.style.borderColor = editing ? 'var(--amber)' : 'var(--ok)';
    modeBadge.style.color = editing ? 'var(--amber)' : 'var(--ok)';
  }
  const saveBtn = $('#saveLayoutBtn');
  if(saveBtn) saveBtn.textContent = editing ? 'Update Layout' : 'Create Layout';
  renderDeckTabs();
  renderLayoutsOverview();
  renderLayoutEditorBoxes();
  if(typeof renderStageGrid === 'function') renderStageGrid();
}

async function loadLayouts(){
  try{
    const data = await api('/layouts');
    layoutsCache = data.layouts || {};
    activeLayoutId = data.active_layout_id || '';
    if(!layoutEditingId && activeLayoutId) loadLayoutIntoEditor(activeLayoutId);
    syncLayoutUI();
    if(typeof populateStudioLayoutFilter === 'function') populateStudioLayoutFilter();
    renderScenes();
    if(typeof scheduleTubePreview === 'function') scheduleTubePreview();
  }catch(e){
    logCall('loadLayouts: '+e.message, 'GET', 'err', 0);
  }
}

$('#layoutSel')?.addEventListener('change', e => {
  loadLayoutIntoEditor(e.target.value);
});

$('#newLayoutBtn')?.addEventListener('click', () => {
  if($('#layoutSel')) $('#layoutSel').value = '';
  loadLayoutIntoEditor('');
  $('#layoutNameIn')?.focus();
});

$('#applyLayoutBtn').addEventListener('click', async ()=>{
  const id = $('#layoutSel').value;
  if(!id){ activeLayoutId=''; syncLayoutUI(); renderScenes(); return; }
  try{
    const res = await api('/layouts', {method:'PUT', body:JSON.stringify({id})});
    activeLayoutId = res.active_layout_id || id;
    syncLayoutUI();
    if(typeof populateStudioLayoutFilter === 'function') populateStudioLayoutFilter();
    renderScenes();
    await loadVirtuals();
    toast(`Layout "${layoutsCache[id]?.name || id}" applied`);
  }catch(e){
    toast('Apply layout failed: '+e.message, true);
  }
});

$('#saveLayoutBtn').addEventListener('click', async ()=>{
  const name = $('#layoutNameIn').value.trim();
  const scene_tag = $('#layoutTagIn').value.trim();
  if(!name){ toast('Enter a layout name', true); return; }
  const isEnabled = $('#layoutEnabledChk') ? $('#layoutEnabledChk').checked : true;
  const placedOnGrid = Object.values(gridCells || {}).map(c => c?.deviceId).filter(Boolean);
  const devList = layoutEditDevices.size ? [...layoutEditDevices] : [...new Set(placedOnGrid)];
  if(isEnabled && devList.length){
    const conflict = findLayoutTubeConflict(layoutEditingId, devList);
    if(conflict){
      const dName = devicesCache[conflict.devId]?.config?.name || conflict.devId;
      toast(`Cannot activate "${name}": ${dName} is already active in "${conflict.layoutName}"`, true);
      return;
    }
  }
  const payload = {
    name,
    scene_tag,
    enabled: isEnabled,
    devices: devList,
    grid_cols: typeof gridCols === 'number' ? gridCols : 5,
    grid_rows: typeof gridRows === 'number' ? gridRows : 2,
    grid_cells: typeof sanitizeGridCells === 'function' ? sanitizeGridCells(gridCells) : {},
    snapshot: true,
  };
  if(layoutEditingId && layoutsCache[layoutEditingId]) payload.id = layoutEditingId;
  if(layoutEditVirtuals.size) payload.virtual_ids = [...layoutEditVirtuals];
  try{
    const res = await api('/layouts', {method:'POST', body:JSON.stringify(payload)});
    if(res.layout){
      layoutsCache[res.layout.id] = res.layout;
      activeLayoutId = res.layout.id;
      layoutEditingId = res.layout.id;
    }
    await loadLayouts();
    toast(`Saved layout "${name}"`);
  }catch(e){
    toast('Save layout failed: '+e.message, true);
  }
});

$('#delLayoutBtn').addEventListener('click', async ()=>{
  const id = $('#layoutSel').value;
  if(!id) return;
  try{
    await api('/layouts', {method:'DELETE', body:JSON.stringify({id})});
    if(activeLayoutId === id) activeLayoutId = '';
    await loadLayouts();
    toast('Layout deleted');
  }catch(e){
    toast('Delete layout failed: '+e.message, true);
  }
});

$('#allScenesBtn').addEventListener('click', ()=>{
  showAllScenes = !showAllScenes;
  $('#allScenesBtn').classList.toggle('on', showAllScenes);
  renderScenes();
});

function isSceneLiveActive(s){
  if(!s) return false;
  const effs = Object.entries(s.virtuals || {}).filter(([,eff]) => eff && eff.type);
  if(!effs.length) return false;
  if(!Object.keys(virtualsCache || {}).length) return !!s.active;
  return effs.every(([vid, eff]) => {
    const lv = virtualsCache[vid];
    return lv && lv.active && lv.effect && lv.effect.type === eff.type;
  });
}

