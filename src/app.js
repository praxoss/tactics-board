import { BOARD_HEIGHT as H, BOARD_WIDTH as W, BOARD_VIEWS, STORAGE_KEY, clamp, clone, defaultData, defaultStage, moveStage, sanitize, uid } from './state.js';
import { createPlaybackPlan, samplePlayback } from './playback.js';
import { renderStageSvg } from './stage-renderer.js';
import { renderStageMenu } from './stage-menu.js';
import { createMediaExporter, GIF_FPS, MP4_FPS } from './media-export.js';

(() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const PLAYER_R = 15, BALL_R = 7;
  const TOOLS = [['select', 'Select'], ['erase', 'Erase'], ['run', 'Run'], ['carry', 'Carry'], ['pass', 'Pass'], ['kick', 'Kick'], ['text', 'Text'], ['highlight', 'Highlight']];
  const ACTION_COLORS = { run: '#fff', carry: '#10b981', pass: '#facc15', kick: '#3b82f6' };
  const SET_ROWS = [
    { id: 'top5', label: 'Top 5m', shortLabel: '5m', y: 130, previewY: 6, boardView: 'pitchIn' },
    { id: 'top22', label: 'Top 22m', shortLabel: '22', y: 310, previewY: 20.5, boardView: 'pitchIn' },
    { id: 'top10', label: 'Top 10m', shortLabel: '10', y: 480, previewY: 39, boardView: 'pitchIn' },
    { id: 'halfway', label: 'Halfway', shortLabel: 'H', y: 350, previewY: 50.5, boardView: 'pitchMiddle' },
    { id: 'bottom10', label: 'Bottom 10m', shortLabel: '10', y: 215, previewY: 61.5, boardView: 'pitchOut' },
    { id: 'bottom22', label: 'Bottom 22m', shortLabel: '22', y: 390, previewY: 79, boardView: 'pitchOut' },
    { id: 'bottom5', label: 'Bottom 5m', shortLabel: '5m', y: 565, previewY: 94, boardView: 'pitchOut' }
  ];
  const LINEOUT_SIDES = [{ id: 'left', label: 'Left touchline', shortLabel: 'L', x: 100 }, { id: 'right', label: 'Right touchline', shortLabel: 'R', x: 1000 }];
  const SCRUM_LANES = [{ id: 'left5', label: 'Left 5m', shortLabel: 'L5', x: 115 }, { id: 'left15', label: 'Left 15m', shortLabel: 'L15', x: 280 }, { id: 'centre', label: 'Centre', shortLabel: 'C', x: 550 }, { id: 'right15', label: 'Right 15m', shortLabel: 'R15', x: 820 }, { id: 'right5', label: 'Right 5m', shortLabel: 'R5', x: 985 }];
  const esc = text => String(text ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

  let data = loadInitial();
  let tool = 'select';
  let playing = false;
  let playFrame = null;
  let playTimer = null;
  let playSpeed = 1;
  let playTransition = null;
  let undoStack = [];
  let redoStack = [];
  let modal = null;
  let notice = null;
  let pointer = null;
  let moving = null;
  let drawing = null;
  let exportJob = null;
  const mediaExporter = createMediaExporter();
  let setupState = { kind: '', possession: 'attack', size: 5, locationId: 'halfway-left' };
  const compactLayout = window.matchMedia?.('(max-width: 850px)').matches;
  let controlsCollapsed = Boolean(compactLayout);
  let timelineCollapsed = Boolean(compactLayout);

  const app = document.querySelector('#app');
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand"><div class="brand-mark">🏉</div><div><div class="eyebrow">Les Implacables 1993</div><div class="brand-title">Rugby Tactics Board <span class="play-name" id="top-name"></span></div></div></div>
        <div class="top-actions"><button class="top-btn" id="reset-btn">New Play</button><button class="top-btn primary" id="top-share">Save / Share</button></div>
      </header>
      <main class="workspace">
        <div class="board-wrap" id="board-wrap"><svg id="board" viewBox="0 0 ${W} ${H}" aria-label="Rugby tactics board"></svg><div class="board-empty" id="empty-hint"><span>Add players with the counters on the left, then draw the play phase by phase.</span></div></div>
        <aside class="panel left-panel" id="left-panel"></aside>
        <aside class="panel right-panel" id="right-panel"></aside>
        <section class="timeline" id="timeline"></section>
      </main>
    </div>`;

  const board = document.querySelector('#board');
  const leftPanel = document.querySelector('#left-panel');
  const rightPanel = document.querySelector('#right-panel');
  const timeline = document.querySelector('#timeline');
  const emptyHint = document.querySelector('#empty-hint');

  function loadInitial() {
    const params = new URLSearchParams(location.search);
    if (params.has('play')) {
      try { return sanitize(JSON.parse(decodeBase64(params.get('play')))); } catch { /* fall through */ }
    }
    try { const saved = localStorage.getItem(STORAGE_KEY); return saved ? sanitize(JSON.parse(saved)) : defaultData(); } catch { return defaultData(); }
  }

  function activeStage() { return data.stages[data.currentStageIndex]; }
  function saveLocal() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { showNotice('Local saving is unavailable; export the JSON file.', 'warn'); } }
  function pushHistory() { undoStack.push(clone(data)); if (undoStack.length > 100) undoStack.shift(); redoStack = []; }
  function commit(mutator) { pushHistory(); mutator(); data = sanitize(data); saveLocal(); render(); }
  function undo() { if (!undoStack.length) return; redoStack.push(clone(data)); data = undoStack.pop(); saveLocal(); render(); }
  function redo() { if (!redoStack.length) return; undoStack.push(clone(data)); data = redoStack.pop(); saveLocal(); render(); }
  function showNotice(message, kind = 'success') { notice = { message, kind }; renderPanels(); window.clearTimeout(showNotice.timer); showNotice.timer = window.setTimeout(() => { notice = null; renderPanels(); }, 3500); }

  function render() { renderBoard(); renderPanels(); renderTimeline(); document.querySelector('#top-name').textContent = data.metadata.name ? `· ${data.metadata.name}` : ''; emptyHint.style.display = activeStage().players.length || activeStage().actions.length ? 'none' : 'grid'; }
  function renderPanels() {
    const stage = activeStage();
    const homeCount = stage.players.filter(p => p.team === 'attack').length;
    const awayCount = stage.players.filter(p => p.team === 'defence').length;
    leftPanel.classList.toggle('is-collapsed', controlsCollapsed);
    leftPanel.innerHTML = `<div class="panel-header"><div><h2>Board Controls</h2><p>Create and manage your play</p></div><button class="panel-toggle" id="toggle-left" aria-label="${controlsCollapsed ? 'Expand controls' : 'Collapse controls'}" aria-expanded="${!controlsCollapsed}">${controlsCollapsed ? '＋' : '−'}</button></div>
      <div class="panel-body" id="controls-body"><button class="play-card" id="open-meta"><span class="eyebrow">Play</span><strong>${esc(data.metadata.name || 'Untitled Play')}</strong></button>
      <div class="section-title">Tools</div><div class="tools">${TOOLS.map(([id, label]) => `<button class="tool-btn ${tool === id ? 'active' : ''}" data-tool="${id}">${label}</button>`).join('')}</div>
      <div class="separator"></div><div class="section-title">Teams</div>
      ${countControl('Home team', 'home', homeCount, '#0ea5e9')} ${countControl('Away reference', 'away', awayCount, '#f43f5e')}
      <div class="separator"></div><div class="section-title">Board View</div><div class="choice-grid">${BOARD_VIEWS.map(([id, label]) => `<button class="choice-btn ${stage.boardView === id ? 'active' : ''}" data-view="${id}">${label}</button>`).join('')}</div>
      <div class="separator"></div><div class="section-title">SET PIECE</div><div class="quick-stack"><button class="quick-btn" id="lineout-btn">Lineout</button><button class="quick-btn" id="scrum-btn">Scrum</button></div><div id="setup-box"></div></div>`;
    rightPanel.innerHTML = `<div class="panel-header"><div><h2>Quick Actions</h2><p>History, templates, and files</p></div></div>
      <div class="section-title">History</div><div class="quick-stack"><button class="quick-btn" id="undo-btn" ${undoStack.length ? '' : 'disabled'}>↶ Undo</button><button class="quick-btn" id="redo-btn" ${redoStack.length ? '' : 'disabled'}>↷ Redo</button></div>
      <div class="separator"></div><div class="section-title">SAVE / LOAD</div><div class="quick-stack"><button class="quick-btn" id="share-btn">Share</button><button class="quick-btn" id="import-btn">Import</button></div><input type="file" id="import-file" accept="application/json" hidden />
      ${notice ? `<div class="notice ${notice.kind}">${esc(notice.message)}</div>` : ''}<button class="danger" id="clear-btn">Clear All</button>`;
    bindPanelEvents();
    if (setupState.kind) { const setupBox = leftPanel.querySelector('#setup-box'); setupBox.dataset.kind = setupState.kind; renderSetupBox(setupState.kind); }
  }
  function countControl(label, team, count, color) { return `<div class="count-row"><label><i class="team-dot" style="background:${color}"></i>${label}</label><div class="stepper"><button data-count="${team}" data-delta="-1">−</button><span>${count}</span><button data-count="${team}" data-delta="1">+</button></div></div>`; }
  function bindPanelEvents() {
    leftPanel.querySelector('#toggle-left').onclick = () => { controlsCollapsed = !controlsCollapsed; renderPanels(); };
    leftPanel.querySelector('#open-meta').onclick = () => openModal('metadata');
    leftPanel.querySelectorAll('[data-tool]').forEach(btn => btn.onclick = () => { tool = btn.dataset.tool; renderPanels(); });
    leftPanel.querySelectorAll('[data-view]').forEach(btn => btn.onclick = () => commit(() => activeStage().boardView = btn.dataset.view));
    leftPanel.querySelectorAll('[data-count]').forEach(btn => btn.onclick = () => changeTeam(btn.dataset.count, Number(btn.dataset.delta)));
    leftPanel.querySelector('#lineout-btn').onclick = () => showSetup('lineout');
    leftPanel.querySelector('#scrum-btn').onclick = () => showSetup('scrum');
    rightPanel.querySelector('#undo-btn').onclick = undo; rightPanel.querySelector('#redo-btn').onclick = redo;
    rightPanel.querySelector('#share-btn').onclick = () => openModal('metadata'); rightPanel.querySelector('#import-btn').onclick = () => rightPanel.querySelector('#import-file').click();
    rightPanel.querySelector('#clear-btn').onclick = () => {
      if (!confirm('Clear the entire play?')) return;
      const selectedView = activeStage().boardView;
      commit(() => {
        data = defaultData();
        data.stages[0].boardView = selectedView;
        setupState = { kind: '', possession: 'attack', size: 5, locationId: 'halfway-left' };
      });
      showNotice('Board cleared.');
    };
    rightPanel.querySelector('#import-file').onchange = event => importFile(event.target.files?.[0]);
  }
  function showSetup(kind) {
    const box = leftPanel.querySelector('#setup-box');
    if (box.dataset.kind === kind) { box.innerHTML = ''; box.dataset.kind = ''; setupState.kind = ''; return; }
    const sameKind = setupState.kind === kind;
    box.dataset.kind = kind;
    setupState = { kind, possession: sameKind ? setupState.possession : 'attack', size: kind === 'lineout' ? (sameKind ? setupState.size : 5) : 5, locationId: kind === 'lineout' ? (sameKind ? setupState.locationId : 'halfway-left') : (sameKind ? setupState.locationId : 'halfway-left15') };
    renderSetupBox(kind);
  }
  function renderSetupBox(kind) {
    const box = leftPanel.querySelector('#setup-box');
    if (!box || box.dataset.kind !== kind) return;
    const rowButtons = SET_ROWS.map(row => {
      const lanes = kind === 'lineout' ? LINEOUT_SIDES : SCRUM_LANES;
      return lanes.map(lane => { const locationId = `${row.id}-${lane.id}`; const selected = setupState.locationId === locationId; return `<button class="preview-marker ${selected ? 'active' : ''}" data-location="${locationId}" style="left:${lane.x / W * 100}%;top:${row.previewY}%" aria-label="${row.label}, ${lane.label}">${lane.shortLabel}</button>`; }).join('');
    }).join('');
    const size = kind === 'lineout' ? `<p class="eyebrow setup-label">PLAYERS</p><div class="choice-grid size-grid">${[3,4,5,6,7].map(n => `<button class="choice-btn ${setupState.size === n ? 'active' : ''}" data-size="${n}">${n}</button>`).join('')}</div>` : '';
    const title = kind === 'lineout' ? 'LINEOUT SETUP' : 'SCRUM SETUP';
    const previewLabels = SET_ROWS.map(row => `<span class="preview-row-label" style="top:${row.previewY}%">${row.shortLabel}</span>`).join('');
    box.innerHTML = `<div class="setup setpiece-setup"><h3>${title}</h3><div class="possession-toggle"><button class="choice-btn ${setupState.possession === 'attack' ? 'active' : ''}" data-pos="attack">Attacking</button><button class="choice-btn ${setupState.possession === 'defence' ? 'active' : ''}" data-pos="defence">Defending</button></div>${size}<div class="setpiece-preview"><svg viewBox="0 0 100 160" aria-hidden="true"><rect x="2.5" y="2.5" width="95" height="155" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1"/><line x1="6.25" y1="10" x2="94" y2="10" stroke="rgba(255,255,255,.32)" stroke-dasharray="5 11.5"/><line x1="3" y1="32" x2="97" y2="32" stroke="rgba(255,255,255,.32)"/><line x1="3" y1="80" x2="97" y2="80" stroke="rgba(255,255,255,.32)"/><line x1="6.25" y1="62" x2="94" y2="62" stroke="rgba(255,255,255,.32)" stroke-dasharray="5 11.5"/><line x1="6.25" y1="98" x2="94" y2="98" stroke="rgba(255,255,255,.32)" stroke-dasharray="5 11.5"/><line x1="3" y1="126" x2="97" y2="126" stroke="rgba(255,255,255,.32)"/><line x1="6.25" y1="150" x2="94" y2="150" stroke="rgba(255,255,255,.32)" stroke-dasharray="5 11.5"/><path d="M9 10V155 M25 10V155 M75 10V155 M91 10V155" stroke="rgba(255,255,255,.24)" stroke-dasharray="5 14"/></svg>${previewLabels}${rowButtons}</div></div>`;
    box.querySelectorAll('[data-pos]').forEach(btn => btn.onclick = () => { setupState.possession = btn.dataset.pos; renderSetupBox(kind); if (setupState.locationId) applySetPiece(kind, setupState); });
    box.querySelectorAll('[data-size]').forEach(btn => btn.onclick = () => { setupState.size = Number(btn.dataset.size); renderSetupBox(kind); if (setupState.locationId) applySetPiece(kind, setupState); });
    box.querySelectorAll('[data-location]').forEach(btn => btn.onclick = () => { setupState.locationId = btn.dataset.location; renderSetupBox(kind); applySetPiece(kind, setupState); });
  }
  function changeTeam(team, delta) {
    const key = team === 'home' ? 'attack' : 'defence'; const stage = activeStage(); const members = stage.players.filter(p => p.team === key); const next = clamp(members.length + delta, 0, 15);
    if (next === members.length) return; commit(() => { if (next > members.length) { const y = key === 'attack' ? 580 : 230; for (let i = members.length; i < next; i++) stage.players.push({ id: uid('player'), team: key, number: String(i + 1), x: key === 'attack' ? 220 + (i % 8) * 45 : 820 - (i % 8) * 45, y: y + Math.floor(i / 8) * 42 }); } else { const remove = members.slice(next).map(p => p.id); stage.players = stage.players.filter(p => !remove.includes(p.id)); } });
  }
  function applySetPiece(kind, state) {
    const stage = activeStage();
    const setup = kind === 'lineout' ? makeLineoutSetup(state) : makeScrumSetup(state);
    commit(() => { stage.boardView = setup.boardView; stage.players = setup.players; stage.ball = setup.ball; });
    showNotice(`${kind === 'lineout' ? 'Lineout' : 'Scrum'} setup applied — adjust any player.`);
  }
  function locationFromId(locationId, lanes) {
    const [rowId, laneId] = locationId.split('-');
    const row = SET_ROWS.find(item => item.id === rowId) || SET_ROWS[3];
    const lane = lanes.find(item => item.id === laneId) || lanes[0];
    return { row, lane };
  }
  function makeLineoutSetup(state) {
    const size = [3,4,5,6,7].includes(Number(state.size)) ? Number(state.size) : 5;
    const location = locationFromId(state.locationId || 'halfway-left', LINEOUT_SIDES);
    const attackingTeam = state.possession === 'defence' ? 'defence' : 'attack';
    const makeUnit = (team, role) => {
      const throwing = role === 'throwing'; const left = location.lane.id === 'left'; const direction = left ? 1 : -1; const near = left ? 18 : W - 18; const far = left ? 90 : W - 90; const lineY = location.row.y + (throwing ? 20 : -20); const backY = location.row.y + (throwing ? 70 : -70); const jumpers = [1,4,5,6,3,7,8]; const selected = jumpers.slice(0, size); const remaining = jumpers.filter(number => !selected.includes(number)); const positions = new Map();
      positions.set(2, [near, location.row.y]); positions.set(9, [far + direction * 25, location.row.y + (throwing ? 70 : -80)]);
      selected.forEach((number, index) => positions.set(number, [far + direction * index * 35, lineY])); remaining.forEach((number, index) => positions.set(number, [far + direction * (size + index + 1) * 35, backY]));
      const backs = { 10:330, 11:435, 12:480, 13:630, 14:960, 15:760 }; const throwingBackY = { 10:110, 11:180, 12:150, 13:200, 14:140, 15:220 }; const defendingBackY = { 10:-120, 11:-120, 12:-100, 13:-100, 14:-170, 15:-220 };
      [10,11,12,13,14,15].forEach(number => positions.set(number, [left ? backs[number] : W - backs[number], location.row.y + (throwing ? throwingBackY[number] : defendingBackY[number])]));
      return [...positions.entries()].map(([number, [x,y]]) => ({ id: uid('player'), team, number: String(number), x: clamp(x, PLAYER_R, W - PLAYER_R), y: clamp(y, PLAYER_R, H - PLAYER_R) }));
    };
    const players = [...makeUnit(attackingTeam, 'throwing'), ...makeUnit(attackingTeam === 'attack' ? 'defence' : 'attack', 'defending')];
    return { boardView: location.row.boardView === 'pitchMiddle' ? 'pitchMiddle' : location.row.boardView, ball: { x: location.lane.id === 'left' ? 30 : W - 30, y: location.row.y }, players };
  }
  function makeScrumSetup(state) {
    const exactId = state.locationId || 'halfway-left15';
    const exact = window.RUGBY_SET_PIECES?.standard?.setups?.[exactId];
    if (exact) {
      const possession = state.possession === 'defence' ? 'defensive' : 'attacking';
      const chosen = exact[possession] || exact.attacking;
      return { boardView: exact.boardView, ball: clone(chosen.ball), players: chosen.players.map(([team, number, x, y]) => ({ id: uid('player'), team, number: String(number), x: clamp(x, PLAYER_R, W - PLAYER_R), y: clamp(y, PLAYER_R, H - PLAYER_R) })) };
    }
    const location = locationFromId(state.locationId || 'halfway-left15', SCRUM_LANES); const dx = location.lane.x - 280; const dy = location.row.y - 350;
    const base = [
      ['attack',1,260,360],['attack',2,280,360],['attack',3,300,360],['attack',4,270,377],['attack',5,290,377],['attack',6,250,380],['attack',7,310,380],['attack',8,280,395],['attack',9,220,355],
      ['defence',1,300,340],['defence',2,280,340],['defence',3,260,340],['defence',4,290,323],['defence',5,270,323],['defence',6,310,320],['defence',7,250,320],['defence',8,280,305],['defence',9,220,320],
      ['attack',10,350,470],['attack',11,150,495],['attack',12,465,470],['attack',13,600,470],['attack',14,780,495],['attack',15,450,520],
      ['defence',10,400,235],['defence',11,710,185],['defence',12,120,235],['defence',13,555,235],['defence',14,12,200],['defence',15,180,165]
    ];
    const players = base.map(([team, number, x, y]) => ({ id: uid('player'), team, number: String(number), x: clamp(x + dx, PLAYER_R, W - PLAYER_R), y: clamp(y + dy, PLAYER_R, H - PLAYER_R) }));
    const ballX = state.possession === 'defence' ? location.lane.x + 45 : location.lane.x - 45;
    return { boardView: location.row.boardView, ball: { x: clamp(ballX, BALL_R, W - BALL_R), y: clamp(location.row.y + (state.possession === 'defence' ? -5 : 5), BALL_R, H - BALL_R) }, players };
  }

  function svgEl(name, attrs = {}, text = '') { const el = document.createElementNS(NS, name); Object.entries(attrs).forEach(([key, val]) => el.setAttribute(key, val)); if (text) el.textContent = text; return el; }
  function renderBoard(stage = activeStage()) {
    renderStageSvg(board, stage, {
      interactive: true,
      tool,
      drawing,
      onPlayerPointerDown: beginMove,
      onActionPointerDown: (_, id) => removeAction(id),
      onNote: editNote
    });
  }
  function renderPitch(view) {
    const group = svgEl('g');
    if (view === 'lineout') {
      for (let index = 0; index < 4; index++) group.append(svgEl('rect', { x:0, y:index * 187, width:1000, height:188, fill:index % 2 === 0 ? '#247a48' : '#29814e' }));
      group.append(svgEl('image', { href:'badge-logo.png', x:360, y:-55, width:250, height:250, opacity:.7, 'pointer-events':'none' }));
      group.append(svgEl('rect', { x:-10, y:10, width:1000, height:700, fill:'none', stroke:'#fff', 'stroke-width':5 }));
      group.append(svgEl('rect', { x:0, y:125, width:990, height:5, fill:'#fff' }));
      group.append(svgEl('line', { x1:115, y1:350, x2:850, y2:350, stroke:'#fff', 'stroke-width':5, 'stroke-dasharray':'250 250' }));
      group.append(svgEl('line', { x1:740, y1:350, x2:740, y2:500, stroke:'#fff', 'stroke-width':5 }));
      group.append(svgEl('line', { x1:240, y1:350, x2:240, y2:500, stroke:'#fff', 'stroke-width':5 }));
      board.append(group);
      return;
    }

    for (let index = 0; index < 9; index++) group.append(svgEl('rect', { x:0, y:index * 80, width:1100, height:81, fill:index % 2 === 0 ? '#247a48' : '#29814e' }));
    const addImage = (href, x, y, width, height, opacity) => group.append(svgEl('image', { href, x, y, width, height, opacity, 'pointer-events':'none' }));
    const addLine = (x1, y1, x2, y2, attrs = {}) => group.append(svgEl('line', { x1, y1, x2, y2, stroke:'#fff', 'stroke-width':3, ...attrs }));
    const addPosts = (y1, y2, lineY) => {
      addLine(500, y1, 500, y2, { 'stroke-width':10, 'stroke-linecap':'round' });
      addLine(600, y1, 600, y2, { 'stroke-width':10, 'stroke-linecap':'round' });
      addLine(500, lineY, 600, lineY, { 'stroke-width':6, 'stroke-linecap':'round' });
      addLine(545, lineY, 555, lineY, { stroke:'#13171e', 'stroke-width':6 });
    };

    if (view === 'pitchIn') {
      addImage('badge-logo.png', 415, 189, 280, 280, .6);
      addImage('badge-logo.png', 135, -20, 120, 120, .7);
      addImage('badge-logo.png', 850, -20, 120, 120, .7);
      group.append(svgEl('rect', { x:10, y:10, width:1080, height:700, fill:'none', stroke:'#fff', 'stroke-width':3 }));
      [580,70,310].forEach(y => group.append(svgEl('rect', { x:10, y, width:1080, height:3, fill:'#fff' })));
      [480,690,130].forEach(y => addLine(70,y,1030,y,{ 'stroke-dasharray':'60 120' }));
      [[100,130,100,400,'60 90'],[100,450,100,610,'60 45'],[100,660,100,700],[280,130,280,400,'60 90'],[280,450,280,610,'60 45'],[280,660,280,700],[1000,130,1000,400,'60 90'],[1000,450,1000,610,'60 45'],[1000,660,1000,700],[820,130,820,400,'60 90'],[820,450,820,610,'60 45'],[820,660,820,700]].forEach(([x1,y1,x2,y2,dash]) => addLine(x1,y1,x2,y2,dash ? { 'stroke-dasharray':dash } : {}));
      addLine(550,570,550,590);
      addPosts(20,72,55);
    } else if (view === 'pitchOut') {
      addImage('badge-logo.png', 410, -11, 280, 280, .6);
      addImage('badge-logo.png', 130, 595, 120, 120, .7);
      addImage('badge-logo.png', 850, 595, 120, 120, .7);
      group.append(svgEl('rect', { x:10, y:-10, width:1080, height:700, fill:'none', stroke:'#fff', 'stroke-width':3 }));
      [110,620,390].forEach(y => group.append(svgEl('rect', { x:10, y, width:1080, height:3, fill:'#fff' })));
      [215,10,565].forEach(y => addLine(70,y,1030,y,{ 'stroke-dasharray':'60 120' }));
      [[100,360,100,565,'60 90'],[100,80,100,245,'60 45'],[100,0,100,40],[280,360,280,565,'60 90'],[280,80,280,245,'60 45'],[280,0,280,40],[1000,360,1000,565,'60 90'],[1000,80,1000,245,'60 45'],[1000,0,1000,40],[820,360,820,565,'60 90'],[820,80,820,245,'60 45'],[820,0,820,40]].forEach(([x1,y1,x2,y2,dash]) => addLine(x1,y1,x2,y2,dash ? { 'stroke-dasharray':dash } : {}));
      addLine(550,100,550,123);
      addPosts(570,622,600);
    } else {
      addImage('badge-logo.png', 410, 230, 280, 280, .6);
      group.append(svgEl('rect', { x:10, y:-10, width:1080, height:750, fill:'none', stroke:'#fff', 'stroke-width':3 }));
      [350,670,30].forEach(y => group.append(svgEl('rect', { x:10, y, width:1080, height:3, fill:'#fff' })));
      [235,465].forEach(y => addLine(70,y,1030,y,{ 'stroke-dasharray':'60 120' }));
      [[100,0,100,60],[100,205,100,495,'60 55'],[100,640,100,700],[280,0,280,60],[280,205,280,495,'60 55'],[280,640,280,700],[1000,0,1000,60],[1000,205,1000,495,'60 55'],[1000,640,1000,700],[820,0,820,60],[820,205,820,495,'60 55'],[820,640,820,700]].forEach(([x1,y1,x2,y2,dash]) => addLine(x1,y1,x2,y2,dash ? { 'stroke-dasharray':dash } : {}));
      addLine(550,340,550,363);
    }
    board.append(group);
  }

  function renderPitchLegacy(view) {
    const group = svgEl('g'); group.append(svgEl('rect', { x:0, y:0, width:W, height:H, fill:'#0a5a3d' }));
    const zone = view === 'pitchIn' ? [0, 365] : view === 'pitchOut' ? [735, 1100] : view === 'lineout' ? [0, 1100] : [365, 735];
    if (view === 'lineout') { group.append(svgEl('rect', { x:0,y:0,width:W,height:H,fill:'#0b6745' })); for (const x of [65,1035]) group.append(svgEl('line',{x1:x,y1:0,x2:x,y2:H,stroke:'#d9f99d','stroke-width':2,opacity:.8})); }
    else { group.append(svgEl('rect', { x:zone[0], y:0, width:zone[1]-zone[0], height:H, fill:'rgba(16,185,129,.22)' })); }
    for (const x of [50, 220, 365, 550, 735, 880, 1050]) group.append(svgEl('line',{x1:x,y1:0,x2:x,y2:H,stroke:'rgba(255,255,255,.18)','stroke-width':1,'stroke-dasharray':'7 13'}));
    for (const y of [45, 210, 350, 525, 655]) group.append(svgEl('line',{x1:0,y1:y,x2:W,y2:y,stroke:'rgba(255,255,255,.16)','stroke-width':1,'stroke-dasharray':'7 13'}));
    group.append(svgEl('rect',{x:3,y:3,width:W-6,height:H-6,fill:'none',stroke:'rgba(255,255,255,.55)','stroke-width':3})); group.append(svgEl('text',{x:W/2,y:28,fill:'rgba(255,255,255,.65)','font-size':12,'text-anchor':'middle','font-weight':700}, view === 'lineout' ? 'LINEOUT' : view === 'pitchIn' ? 'PITCH IN' : view === 'pitchOut' ? 'PITCH OUT' : 'MIDDLE')); board.append(group);
  }
  function renderPlayer(player) { const color = player.team === 'attack' ? '#0ea5e9' : '#f43f5e'; const stroke = player.team === 'attack' ? '#e0f2fe' : '#ffe4e6'; const g = svgEl('g', { 'data-id':player.id, transform:`translate(${player.x} ${player.y})`, filter:'url(#shadow)', style:`cursor:${tool === 'select' && !playing ? 'grab' : 'default'}` }); g.append(svgEl('circle',{r:PLAYER_R,fill:color,stroke,'stroke-width':1.5})); g.append(svgEl('text',{x:0,y:5,'text-anchor':'middle',fill:'#fff','font-size':11,'font-weight':800,'pointer-events':'none'},player.number)); g.addEventListener('pointerdown', e => beginMove(e, player.id)); board.append(g); }
  function renderBall(ball) { const g = svgEl('g',{'data-id':'ball',transform:`translate(${ball.x} ${ball.y})`}); g.append(svgEl('ellipse',{rx:12,ry:6,fill:'#f5f5f5',stroke:'#000','stroke-width':1.5})); g.append(svgEl('ellipse',{rx:11.5,ry:3,fill:'#ececec',stroke:'#000','stroke-width':1})); g.addEventListener('pointerdown', e => beginMove(e,'ball')); board.append(g); }
  function actionPath(points) {
    if (!points?.length) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let index = 1; index < points.length - 1; index += 1) {
      const current = points[index];
      const next = points[index + 1];
      d += ` Q ${current.x} ${current.y} ${(current.x + next.x) / 2} ${(current.y + next.y) / 2}`;
    }
    const previous = points[points.length - 2];
    const last = points[points.length - 1];
    return `${d} Q ${previous.x} ${previous.y} ${last.x} ${last.y}`;
  }
  function quadraticPoint(start, control, end, amount) {
    const inverse = 1 - amount;
    return { x: inverse * inverse * start.x + 2 * inverse * amount * control.x + amount * amount * end.x, y: inverse * inverse * start.y + 2 * inverse * amount * control.y + amount * amount * end.y };
  }
  function smoothPathPoints(points, steps = 8) {
    if (!points?.length || points.length < 3) return points || [];
    const smoothed = [points[0]];
    let start = points[0];
    for (let index = 1; index < points.length - 1; index += 1) {
      const control = points[index];
      const next = points[index + 1];
      const end = { x: (control.x + next.x) / 2, y: (control.y + next.y) / 2 };
      for (let step = 1; step <= steps; step += 1) smoothed.push(quadraticPoint(start, control, end, step / steps));
      start = end;
    }
    const control = points[points.length - 2];
    const end = points[points.length - 1];
    for (let step = 1; step <= steps; step += 1) smoothed.push(quadraticPoint(start, control, end, step / steps));
    return smoothed;
  }
  function renderAction(action, preview = false) {
    if (action.kind === 'text') { const g = svgEl('g',{transform:`translate(${action.x} ${action.y})`}); g.append(svgEl('rect',{width:action.width||150,height:action.height||62,rx:12,fill:'#18263d',stroke:'#67e8f9','stroke-width':1.5})); g.append(svgEl('text',{x:12,y:23,fill:'#67e8f9','font-size':11,'font-weight':800},action.title || 'Note')); const words = String(action.text || 'Add detail').slice(0, 90).match(/.{1,25}/g) || []; words.slice(0,3).forEach((line,i) => g.append(svgEl('text',{x:12,y:43+i*15,fill:'#e2e8f0','font-size':12},line))); g.addEventListener('pointerdown', e => { e.stopPropagation(); if (tool === 'erase') removeAction(action.id); else if (tool === 'select') editNote(action.id); }); board.append(g); return; }
    if (action.kind === 'highlight') { const r = svgEl('rect',{x:action.x,y:action.y,width:action.width,height:action.height,rx:10,fill:'rgba(250,204,21,.18)',stroke:'#facc15','stroke-width':2,'stroke-dasharray':'6 4'}); r.addEventListener('pointerdown',e=>{e.stopPropagation(); if(tool==='erase') removeAction(action.id);}); board.append(r); return; }
    if (!action.points?.length) return;
    const pathData = actionPath(action.points);
    const color = ACTION_COLORS[action.kind] || '#fff';
    const path = svgEl('path', { d:pathData, fill:'none', stroke:'rgba(0,0,0,.65)', 'stroke-width': preview ? 8 : 6, 'stroke-linecap':'round', 'stroke-linejoin':'round', opacity: preview ? .45 : 1, 'pointer-events':'none' });
    const line = svgEl('path', { d:pathData, fill:'none', stroke:color, 'stroke-width':preview ? 4 : 3, 'stroke-linecap':'round', 'stroke-linejoin':'round', 'stroke-dasharray':action.kind==='pass'?'8 6':action.kind==='kick'?'16 12':action.kind==='run'?'12 8':'12 8', 'marker-end':'url(#arrow)', opacity: preview ? .9 : 1, 'pointer-events': preview ? 'none' : 'auto', style:!preview && tool==='erase'?'cursor:crosshair':'' });
    if (!preview) line.addEventListener('pointerdown', e => { e.stopPropagation(); if (tool === 'erase') removeAction(action.id); });
    board.append(path, line);
  }
  function boardPoint(event) {
    const matrix = board.getScreenCTM?.();
    if (matrix && board.createSVGPoint) {
      const point = board.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const local = point.matrixTransform(matrix.inverse());
      return { x: clamp(local.x, 0, W), y: clamp(local.y, 0, H) };
    }
    const rect = board.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width * W, 0, W), y: clamp((event.clientY - rect.top) / rect.height * H, 0, H) };
  }
  function nearestPlayer(point) {
    return activeStage().players.reduce((nearest, player) => {
      const distance = Math.hypot(point.x - player.x, point.y - player.y);
      return !nearest || distance < nearest.distance ? { player, distance } : nearest;
    }, null);
  }
  function beginMove(event, id) {
    if (playing || tool !== 'select') return;
    event.stopPropagation();
    const p = boardPoint(event);
    const current = id === 'ball' ? activeStage().ball : activeStage().players.find(player => player.id === id);
    if (!current) return;
    pushHistory();
    moving = {
      id,
      start: p,
      offset: { x: p.x - current.x, y: p.y - current.y },
      original: clone(current)
    };
    board.setPointerCapture?.(event.pointerId);
  }
  function handlePointerDown(event) { if (playing) return; const p = boardPoint(event); if (tool === 'select') return; if (tool === 'erase') return; if (['run','carry','pass','kick'].includes(tool)) { const nearest = nearestPlayer(p); const ballDistance = Math.hypot(p.x - activeStage().ball.x, p.y - activeStage().ball.y); drawing = { kind:tool, points:[p], playerId: nearest && nearest.distance <= PLAYER_R * 3 ? nearest.player.id : null, ballId: tool === 'pass' && ballDistance <= BALL_R * 4 ? 'ball' : null }; board.setPointerCapture?.(event.pointerId); } else if (tool === 'highlight' || tool === 'text') { drawing = { kind:tool, start:p, current:p }; board.setPointerCapture?.(event.pointerId); } }
  function handlePointerMove(event) {
    const p = boardPoint(event);
    if (moving) {
      const radius = moving.id === 'ball' ? BALL_R : PLAYER_R;
      const next = {
        x: clamp(p.x - moving.offset.x, radius, W - radius),
        y: clamp(p.y - moving.offset.y, radius, H - radius)
      };
      if (moving.id === 'ball') {
        activeStage().ball = next;
      } else {
        const player = activeStage().players.find(x => x.id === moving.id);
        if (player) { player.x = next.x; player.y = next.y; }
      }
      renderBoard();
      return;
    }
    if (!drawing) return;
    if (drawing.points) {
      const last = drawing.points.at(-1);
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 3) drawing.points.push(p);
    } else drawing.current = p;
    renderBoard();
  }
  function handlePointerUp(event) {
    const p = boardPoint(event);
    if (moving) { moving = null; saveLocal(); render(); return; }
    if (!drawing) return;
    if (drawing.points) {
      const last = drawing.points.at(-1);
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 1) drawing.points.push(p);
      if (drawing.points.length > 1) { pushHistory(); activeStage().actions.push({ id:uid('action'), kind:drawing.kind, points:drawing.points, ...(drawing.playerId ? { playerId:drawing.playerId } : {}), ...(drawing.ballId ? { ballId:drawing.ballId } : {}) }); saveLocal(); }
    } else {
      const x = Math.min(drawing.start.x, p.x), y = Math.min(drawing.start.y, p.y), width = Math.abs(p.x - drawing.start.x), height = Math.abs(p.y - drawing.start.y);
      if (width > 40 && height > 25) { pushHistory(); activeStage().actions.push(drawing.kind === 'highlight' ? { id:uid('action'), kind:'highlight', x, y, width, height } : { id:uid('action'), kind:'text', title:'Note', text:'', x, y, width, height }); saveLocal(); if (drawing.kind === 'text') window.setTimeout(() => editNote(activeStage().actions.at(-1).id), 0); }
    }
    drawing = null;
    render();
  }
  function removePlayer(id) { commit(() => activeStage().players = activeStage().players.filter(player => player.id !== id)); showNotice('Player removed.'); }
  function resetBall() { commit(() => activeStage().ball = clone(defaultStage().ball)); showNotice('Ball reset.'); }
  function handleErasePointerDown(event) {
    if (tool !== 'erase') return;
    const element = event.target.closest?.('[data-id]');
    if (!element) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    element.dataset.id === 'ball' ? resetBall() : removePlayer(element.dataset.id);
  }
  function removeAction(id) { commit(() => activeStage().actions = activeStage().actions.filter(a=>a.id!==id)); }
  function editNote(id) { const action = activeStage().actions.find(a=>a.id===id); if (!action) return; const text = prompt('Note text', action.text || ''); if (text === null) return; commit(() => action.text = text.slice(0,1000)); }
  board.addEventListener('pointerdown', handleErasePointerDown, true); board.addEventListener('pointerdown', handlePointerDown); board.addEventListener('pointermove', handlePointerMove); board.addEventListener('pointerup', handlePointerUp); board.addEventListener('pointercancel', handlePointerUp);
  document.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); } if (event.key === 'Escape') { modal = null; renderModal(); } });

  function addStage() {
    commit(() => {
      // Actions are visual annotations. Keep them visible in the new stage;
      // playback is driven exclusively by the stage positions below.
      const next = clone(activeStage());
      next.id = uid('stage');
      data.stages.splice(data.currentStageIndex + 1, 0, next);
      data.currentStageIndex += 1;
    });
  }
  function removeStage(stageId = activeStage().id) {
    if (data.stages.length === 1) return;
    const removingIndex = data.stages.findIndex(stage => stage.id === stageId);
    if (removingIndex < 0) return;
    const activeId = activeStage().id;
    commit(() => {
      data.stages.splice(removingIndex, 1);
      data.currentStageIndex = data.stages.findIndex(stage => stage.id === activeId);
      if (data.currentStageIndex < 0) data.currentStageIndex = clamp(removingIndex - 1, 0, data.stages.length - 1);
    });
  }
  function reorderStages(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    commit(() => { data = moveStage(data, fromIndex, toIndex); });
  }
  function setStage(index) { stopPlayback(); data.currentStageIndex = clamp(index,0,data.stages.length-1); render(); }
  function togglePlayback() { playing ? stopPlayback() : startPlayback(); }
  function applyPlaybackFrame(sample) {
    const positions = sample.players;
    positions.forEach(position => {
      const element = [...board.querySelectorAll('[data-id]')].find(node => node.dataset.id === position.id);
      if (element) element.setAttribute('transform', `translate(${position.x} ${position.y})`);
    });
    const ballElement = board.querySelector('[data-id="ball"]');
    if (ballElement) ballElement.setAttribute('transform', `translate(${sample.ball.x} ${sample.ball.y})`);
  }
  function nextPlaybackStage() { return data.currentStageIndex >= data.stages.length - 1 ? 0 : data.currentStageIndex + 1; }
  function startPlaybackTransition() {
    if (!playing || data.stages.length <= 1) return;
    const fromIndex = data.currentStageIndex;
    const toIndex = nextPlaybackStage();
    const fromStage = data.stages[fromIndex];
    const toStage = data.stages[toIndex];
    const duration = 800 / playSpeed;
    playTransition = { fromIndex, toIndex, startedAt: performance.now(), duration };

    if (fromStage.boardView !== toStage.boardView) {
      playTimer = window.setTimeout(() => completePlaybackTransition(), duration);
      return;
    }

    const plan = createPlaybackPlan([fromStage, toStage], { loop: false, durationPerStage: duration });
    const startSample = samplePlayback(plan, 0);
    const startStage = { ...fromStage, players: startSample.players, ball: startSample.ball };
    renderBoard(startStage);
    const animate = timestamp => {
      if (!playing || !playTransition) return;
      const sample = samplePlayback(plan, timestamp - playTransition.startedAt);
      applyPlaybackFrame(sample);
      if (sample.complete) { completePlaybackTransition(); return; }
      playFrame = window.requestAnimationFrame(animate);
    };
    playFrame = window.requestAnimationFrame(animate);
  }
  function completePlaybackTransition() {
    if (!playTransition) return;
    window.clearTimeout(playTimer); playTimer = null;
    window.cancelAnimationFrame(playFrame); playFrame = null;
    const completedIndex = playTransition.toIndex;
    playTransition = null;
    data.currentStageIndex = completedIndex;
    render();
    if (playing) startPlaybackTransition();
  }
  function startPlayback() {
    if (data.stages.length <= 1) return;
    playing = true;
    renderTimeline();
    startPlaybackTransition();
  }
  function stopPlayback() {
    playing = false;
    window.cancelAnimationFrame(playFrame); playFrame = null;
    window.clearTimeout(playTimer); playTimer = null;
    playTransition = null;
    render();
  }
  function cyclePlaybackSpeed() { playSpeed = ({ 0.5: 1, 1: 1.5, 1.5: 2, 2: 0.5 })[playSpeed] || 1; if (playing) { window.cancelAnimationFrame(playFrame); window.clearTimeout(playTimer); playFrame = null; playTimer = null; playTransition = null; startPlaybackTransition(); } renderTimeline(); }
  function renderTimeline() {
    renderStageMenu(timeline, {
      stages: data.stages,
      activeStageId: activeStage().id,
      collapsed: timelineCollapsed,
      onToggle: () => { timelineCollapsed = !timelineCollapsed; renderTimeline(); },
      onSelect: stageId => setStage(data.stages.findIndex(stage => stage.id === stageId)),
      onAdd: addStage,
      onRemove: removeStage,
      onMove: reorderStages
    });
  }

  function openModal(kind) { modal = kind; renderModal(); }
  function renderModal() {
    document.querySelector('.modal-backdrop')?.remove();
    if (!modal) return;
    const meta = data.metadata;
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    if (modal === 'export') {
      wrap.innerHTML = `<div class="modal export-modal"><div class="panel-header"><div><div class="eyebrow">Save / Load</div><h2>Export animation</h2><p>Render the complete stage sequence locally.</p></div><button class="panel-close" id="modal-close">×</button></div><div class="export-group"><div class="export-label">Format</div><div class="export-format-grid" role="radiogroup" aria-label="Export format"><label class="export-format-card selected"><input type="radio" name="export-format" value="gif" checked /><span class="format-icon">GIF</span><span class="format-title">Animated image</span><span class="format-detail">${GIF_FPS} fps · 880 × 560</span></label><label class="export-format-card"><input type="radio" name="export-format" value="mp4" /><span class="format-icon">MP4</span><span class="format-title">Video</span><span class="format-detail">${MP4_FPS} fps · 1100 × 700</span></label></div></div><div class="export-group"><div class="export-label">Playback speed</div><div class="export-speed-grid" role="radiogroup" aria-label="Playback speed"><label class="export-speed-card"><input type="radio" name="export-speed" value="0.5" /><span>0.5×</span></label><label class="export-speed-card selected"><input type="radio" name="export-speed" value="1" checked /><span>1×</span></label><label class="export-speed-card"><input type="radio" name="export-speed" value="1.5" /><span>1.5×</span></label><label class="export-speed-card"><input type="radio" name="export-speed" value="2" /><span>2×</span></label></div></div><label class="export-loop-field"><input type="checkbox" id="export-loop" /><span><strong>Loop GIF</strong><small>Repeat the sequence continuously</small></span></label><div class="help">The export is rendered locally. MP4 uses H.264 when supported by the browser.</div><progress id="export-progress" max="1" value="0" aria-label="Export progress"></progress><p class="export-status" id="export-status" role="status"></p><div class="modal-actions"><button class="top-btn" id="modal-cancel">Cancel</button><button class="top-btn primary" id="export-run">Export</button></div></div>`;
    } else {
      wrap.innerHTML = `<div class="modal"><div class="panel-header"><div><h2>Save This Play</h2><p>The active play is already saved in this browser.</p></div><button class="panel-close" id="modal-close">×</button></div><label class="field">Play name<input id="meta-name" value="${esc(meta.name)}" maxlength="120" /></label><label class="field">Description<textarea id="meta-description" rows="4" maxlength="1000">${esc(meta.description)}</textarea></label><label class="field">Tags<input id="meta-tags" value="${esc(meta.tags.join(', '))}" placeholder="e.g. 40/40, FAUSSE, lineout" /></label><div class="help"><strong>Available formats</strong><br />Full JSON backup, a shareable link, GIF or MP4.</div><div class="modal-actions"><button class="top-btn" id="modal-cancel">Cancel</button><button class="top-btn" id="modal-share">Copy Link</button><button class="top-btn" id="modal-export-json">Export JSON</button><button class="top-btn" id="modal-export-media">GIF / MP4</button><button class="top-btn primary" id="modal-save">Save</button></div></div>`;
    }
    document.body.append(wrap);
    wrap.querySelector('#modal-close').onclick = () => { if (!exportJob) { modal = null; renderModal(); } };
    wrap.querySelector('#modal-cancel')?.addEventListener('click', () => { if (exportJob) cancelExport(); else { modal = null; renderModal(); } });
    wrap.querySelector('#modal-save')?.addEventListener('click', () => {
      commit(() => { data.metadata.name = wrap.querySelector('#meta-name').value.trim() || 'Untitled Play'; data.metadata.description = wrap.querySelector('#meta-description').value.trim(); data.metadata.tags = wrap.querySelector('#meta-tags').value.split(',').map(s=>s.trim()).filter(Boolean).slice(0,12); });
      modal = null; renderModal(); showNotice('Play saved locally.');
    });
    wrap.querySelector('#modal-export-json')?.addEventListener('click', () => { exportJson(); modal = null; renderModal(); });
    wrap.querySelector('#modal-export-media')?.addEventListener('click', () => openModal('export'));
    wrap.querySelector('#modal-share')?.addEventListener('click', copyShareLink);
    const formatInputs = wrap.querySelectorAll('[name="export-format"]');
    const updateExportFormat = () => {
      const selected = wrap.querySelector('[name="export-format"]:checked')?.value || 'gif';
      formatInputs.forEach(input => input.closest('.export-format-card')?.classList.toggle('selected', input.checked));
      wrap.querySelector('.export-loop-field').hidden = selected !== 'gif';
    };
    formatInputs.forEach(input => input.addEventListener('change', updateExportFormat));
    wrap.querySelectorAll('[name="export-speed"]').forEach(input => input.addEventListener('change', event => {
      wrap.querySelectorAll('.export-speed-card').forEach(card => card.classList.toggle('selected', card.querySelector('input') === event.target));
    }));
    updateExportFormat();
    wrap.querySelector('#export-run')?.addEventListener('click', () => runMediaExport(wrap));
  }
  function cancelExport() { exportJob?.controller.abort(); }
  async function runMediaExport(wrap) {
    if (exportJob) return;
    const format = wrap.querySelector('[name="export-format"]:checked')?.value || 'gif';
    const speed = Number(wrap.querySelector('[name="export-speed"]:checked')?.value) || 1;
    const loop = format === 'gif' && wrap.querySelector('#export-loop').checked;
    const previous = { stageIndex: data.currentStageIndex, wasPlaying: playing };
    if (playing) stopPlayback();
    const controller = new AbortController();
    const progress = wrap.querySelector('#export-progress');
    const status = wrap.querySelector('#export-status');
    const runButton = wrap.querySelector('#export-run');
    exportJob = { controller, previous };
    runButton.disabled = true; wrap.querySelector('#modal-cancel').textContent = 'Cancel'; status.textContent = 'Preparing export…';
    try {
      await mediaExporter[format](clone(data.stages), { loop, speed, filename: `${slug(data.metadata.name || 'rugby-tactics-board')}.${format}` }, value => { progress.value = value; status.textContent = `Exporting… ${Math.round(value * 100)}%`; }, controller.signal);
      status.textContent = 'Export ready.';
      showNotice(`${format.toUpperCase()} exported.`);
      modal = null;
    } catch (error) {
      status.textContent = error.name === 'AbortError' ? 'Export canceled.' : error.message;
      if (error.name !== 'AbortError') showNotice(error.message, 'warn');
    } finally {
      const restore = exportJob.previous;
      exportJob = null;
      data.currentStageIndex = clamp(restore.stageIndex, 0, data.stages.length - 1);
      render();
      if (restore.wasPlaying) startPlayback();
      if (!modal) renderModal();
    }
  }
  function exportJson() { const payload = { ...clone(data), exportedAt: new Date().toISOString() }; const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'}); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href=url; link.download=`${slug(data.metadata.name || 'rugby-tactics-board')}.json`; link.click(); URL.revokeObjectURL(url); showNotice('Play exported as JSON.'); }
  function importFile(file) { if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const incoming = sanitize(JSON.parse(reader.result)); commit(() => data = incoming); showNotice('Tactics file imported.'); } catch { showNotice('Invalid JSON file.', 'warn'); } }; reader.readAsText(file); }
  function encodeBase64(value) { const bytes = new TextEncoder().encode(JSON.stringify(value)); let binary=''; bytes.forEach(b=>binary+=String.fromCharCode(b)); return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
  function decodeBase64(value) { const raw = value.replace(/-/g,'+').replace(/_/g,'/'); const padded = raw + '='.repeat((4-raw.length%4)%4); const bytes = Uint8Array.from(atob(padded), c=>c.charCodeAt(0)); return JSON.parse(new TextDecoder().decode(bytes)); }
  function copyShareLink() { const url = new URL(location.href); url.search = `?play=${encodeBase64(data)}`; navigator.clipboard?.writeText(url.toString()).then(()=>showNotice('Share link copied.')).catch(()=>{ prompt('Copy this link', url.toString()); }); }
  function slug(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60) || 'rugby-tactics-board'; }

  document.querySelector('#top-share').onclick = () => openModal('metadata');
  document.querySelector('#reset-btn').onclick = () => { if (confirm('Start a new play?')) { pushHistory(); data = defaultData(); saveLocal(); render(); } };
  render();
})();
