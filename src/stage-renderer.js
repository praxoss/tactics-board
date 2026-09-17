const NS = 'http://www.w3.org/2000/svg';
export const BOARD_WIDTH = 1100;
export const BOARD_HEIGHT = 700;
const PLAYER_R = 15;
const BALL_R = 7;
const ACTION_COLORS = { run: '#fff', carry: '#10b981', pass: '#facc15', kick: '#3b82f6' };

function svgEl(name, attrs = {}, text = '') {
  const element = document.createElementNS(NS, name);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
  if (text) element.textContent = text;
  return element;
}

function actionPath(points) {
  if (!points?.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    path += ` Q ${current.x} ${current.y} ${(current.x + next.x) / 2} ${(current.y + next.y) / 2}`;
  }
  const previous = points[points.length - 2];
  const last = points[points.length - 1];
  return `${path} Q ${previous.x} ${previous.y} ${last.x} ${last.y}`;
}

function renderPitch(group, view) {
  const addImage = (href, x, y, width, height, opacity) => group.append(svgEl('image', { href, x, y, width, height, opacity, 'pointer-events': 'none' }));
  const addLine = (x1, y1, x2, y2, attrs = {}) => group.append(svgEl('line', { x1, y1, x2, y2, stroke: '#fff', 'stroke-width': 3, ...attrs }));
  const addPosts = (y1, y2, lineY) => {
    addLine(500, y1, 500, y2, { 'stroke-width': 10, 'stroke-linecap': 'round' });
    addLine(600, y1, 600, y2, { 'stroke-width': 10, 'stroke-linecap': 'round' });
    addLine(500, lineY, 600, lineY, { 'stroke-width': 6, 'stroke-linecap': 'round' });
    addLine(545, lineY, 555, lineY, { stroke: '#13171e', 'stroke-width': 6 });
  };

  if (view === 'lineout') {
    for (let index = 0; index < 4; index += 1) group.append(svgEl('rect', { x: 0, y: index * 187, width: 1000, height: 188, fill: index % 2 === 0 ? '#247a48' : '#29814e' }));
    group.append(svgEl('image', { href: 'badge-logo.png', x: 360, y: -55, width: 250, height: 250, opacity: .7, 'pointer-events': 'none' }));
    group.append(svgEl('rect', { x: -10, y: 10, width: 1000, height: 700, fill: 'none', stroke: '#fff', 'stroke-width': 5 }));
    group.append(svgEl('rect', { x: 0, y: 125, width: 990, height: 5, fill: '#fff' }));
    group.append(svgEl('line', { x1: 115, y1: 350, x2: 850, y2: 350, stroke: '#fff', 'stroke-width': 5, 'stroke-dasharray': '250 250' }));
    group.append(svgEl('line', { x1: 740, y1: 350, x2: 740, y2: 500, stroke: '#fff', 'stroke-width': 5 }));
    group.append(svgEl('line', { x1: 240, y1: 350, x2: 240, y2: 500, stroke: '#fff', 'stroke-width': 5 }));
    return;
  }

  for (let index = 0; index < 9; index += 1) group.append(svgEl('rect', { x: 0, y: index * 80, width: BOARD_WIDTH, height: 81, fill: index % 2 === 0 ? '#247a48' : '#29814e' }));
  if (view === 'pitchIn') {
    addImage('badge-logo.png', 415, 189, 280, 280, .6); addImage('badge-logo.png', 135, -20, 120, 120, .7); addImage('badge-logo.png', 850, -20, 120, 120, .7);
    group.append(svgEl('rect', { x: 10, y: 10, width: 1080, height: 700, fill: 'none', stroke: '#fff', 'stroke-width': 3 }));
    [580, 70, 310].forEach(y => group.append(svgEl('rect', { x: 10, y, width: 1080, height: 3, fill: '#fff' })));
    [480, 690, 130].forEach(y => addLine(70, y, 1030, y, { 'stroke-dasharray': '60 120' }));
    [[100, 130, 100, 400, '60 90'], [100, 450, 100, 610, '60 45'], [100, 660, 100, 700], [280, 130, 280, 400, '60 90'], [280, 450, 280, 610, '60 45'], [280, 660, 280, 700], [1000, 130, 1000, 400, '60 90'], [1000, 450, 1000, 610, '60 45'], [1000, 660, 1000, 700], [820, 130, 820, 400, '60 90'], [820, 450, 820, 610, '60 45'], [820, 660, 820, 700]].forEach(([x1, y1, x2, y2, dash]) => addLine(x1, y1, x2, y2, dash ? { 'stroke-dasharray': dash } : {}));
    addLine(550, 570, 550, 590); addPosts(20, 72, 55);
  } else if (view === 'pitchOut') {
    addImage('badge-logo.png', 410, -11, 280, 280, .6); addImage('badge-logo.png', 130, 595, 120, 120, .7); addImage('badge-logo.png', 850, 595, 120, 120, .7);
    group.append(svgEl('rect', { x: 10, y: -10, width: 1080, height: 700, fill: 'none', stroke: '#fff', 'stroke-width': 3 }));
    [110, 620, 390].forEach(y => group.append(svgEl('rect', { x: 10, y, width: 1080, height: 3, fill: '#fff' })));
    [215, 10, 565].forEach(y => addLine(70, y, 1030, y, { 'stroke-dasharray': '60 120' }));
    [[100, 360, 100, 565, '60 90'], [100, 80, 100, 245, '60 45'], [100, 0, 100, 40], [280, 360, 280, 565, '60 90'], [280, 80, 280, 245, '60 45'], [280, 0, 280, 40], [1000, 360, 1000, 565, '60 90'], [1000, 80, 1000, 245, '60 45'], [1000, 0, 1000, 40], [820, 360, 820, 565, '60 90'], [820, 80, 820, 245, '60 45'], [820, 0, 820, 40]].forEach(([x1, y1, x2, y2, dash]) => addLine(x1, y1, x2, y2, dash ? { 'stroke-dasharray': dash } : {}));
    addLine(550, 100, 550, 123); addPosts(570, 622, 600);
  } else {
    addImage('badge-logo.png', 410, 230, 280, 280, .6);
    group.append(svgEl('rect', { x: 10, y: -10, width: 1080, height: 750, fill: 'none', stroke: '#fff', 'stroke-width': 3 }));
    [350, 670, 30].forEach(y => group.append(svgEl('rect', { x: 10, y, width: 1080, height: 3, fill: '#fff' })));
    [235, 465].forEach(y => addLine(70, y, 1030, y, { 'stroke-dasharray': '60 120' }));
    [[100, 0, 100, 60], [100, 205, 100, 495, '60 55'], [100, 640, 100, 700], [280, 0, 280, 60], [280, 205, 280, 495, '60 55'], [280, 640, 280, 700], [1000, 0, 1000, 60], [1000, 205, 1000, 495, '60 55'], [1000, 640, 1000, 700], [820, 0, 820, 60], [820, 205, 820, 495, '60 55'], [820, 640, 820, 700]].forEach(([x1, y1, x2, y2, dash]) => addLine(x1, y1, x2, y2, dash ? { 'stroke-dasharray': dash } : {}));
    addLine(550, 340, 550, 363);
  }
}

function renderAction(svg, action, options) {
  const { interactive, tool, onActionPointerDown, onNote } = options;
  if (action.kind === 'text') {
    const group = svgEl('g', { transform: `translate(${action.x} ${action.y})`, 'pointer-events': interactive ? 'auto' : 'none' });
    group.append(svgEl('rect', { width: action.width || 150, height: action.height || 62, rx: 12, fill: '#18263d', stroke: '#67e8f9', 'stroke-width': 1.5 }));
    group.append(svgEl('text', { x: 12, y: 23, fill: '#67e8f9', 'font-size': 11, 'font-weight': 800 }, action.title || 'Note'));
    const words = String(action.text || 'Add detail').slice(0, 90).match(/.{1,25}/g) || [];
    words.slice(0, 3).forEach((line, index) => group.append(svgEl('text', { x: 12, y: 43 + index * 15, fill: '#e2e8f0', 'font-size': 12 }, line)));
    if (interactive) group.addEventListener('pointerdown', event => { event.stopPropagation(); if (tool === 'erase') onActionPointerDown?.(event, action.id); else if (tool === 'select') onNote?.(action.id); });
    svg.append(group); return;
  }
  if (action.kind === 'highlight') {
    const rect = svgEl('rect', { x: action.x, y: action.y, width: action.width, height: action.height, rx: 10, fill: 'rgba(250,204,21,.18)', stroke: '#facc15', 'stroke-width': 2, 'stroke-dasharray': '6 4', 'pointer-events': interactive ? 'auto' : 'none' });
    if (interactive) rect.addEventListener('pointerdown', event => { event.stopPropagation(); if (tool === 'erase') onActionPointerDown?.(event, action.id); });
    svg.append(rect); return;
  }
  if (!action.points?.length) return;
  const path = actionPath(action.points);
  const color = ACTION_COLORS[action.kind] || '#fff';
  svg.append(svgEl('path', { d: path, fill: 'none', stroke: 'rgba(0,0,0,.65)', 'stroke-width': 8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'pointer-events': 'none' }));
  const line = svgEl('path', { d: path, fill: 'none', stroke: color, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': action.kind === 'pass' ? '8 6' : action.kind === 'kick' ? '16 12' : action.kind === 'run' ? '12 8' : '12 8', 'marker-end': 'url(#arrow)', 'pointer-events': interactive ? 'auto' : 'none', style: interactive && tool === 'erase' ? 'cursor:crosshair' : '' });
  if (interactive) line.addEventListener('pointerdown', event => { event.stopPropagation(); if (tool === 'erase') onActionPointerDown?.(event, action.id); });
  svg.append(line);
}

export function renderStageSvg(svg, stage, options = {}) {
  const { interactive = false, tool = 'select', drawing = null, onPlayerPointerDown, onActionPointerDown, onNote } = options;
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`);
  svg.setAttribute('data-view', stage.boardView);
  const defs = svgEl('defs');
  defs.innerHTML = '<marker id="arrow" viewBox="0 0 12 12" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L12 6 L0 12 L3 6 Z" fill="context-stroke"/></marker><filter id="shadow"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity=".4"/></filter>';
  svg.append(defs);
  const pitch = svgEl('g'); renderPitch(pitch, stage.boardView); svg.append(pitch);
  stage.actions.forEach(action => renderAction(svg, action, { interactive, tool, onActionPointerDown, onNote }));
  if (drawing?.points?.length) renderAction(svg, { kind: drawing.kind, points: drawing.points }, { interactive: false, tool });
  stage.players.forEach(player => {
    const color = player.team === 'attack' ? '#0ea5e9' : '#f43f5e';
    const stroke = player.team === 'attack' ? '#e0f2fe' : '#ffe4e6';
    const group = svgEl('g', { 'data-id': player.id, transform: `translate(${player.x} ${player.y})`, filter: 'url(#shadow)', style: `cursor:${interactive && tool === 'select' ? 'grab' : 'default'}`, 'pointer-events': interactive ? 'auto' : 'none' });
    group.append(svgEl('circle', { r: PLAYER_R, fill: color, stroke, 'stroke-width': 1.5 }));
    group.append(svgEl('text', { x: 0, y: 5, 'text-anchor': 'middle', fill: '#fff', 'font-size': 11, 'font-weight': 800, 'pointer-events': 'none' }, player.number));
    if (interactive) group.addEventListener('pointerdown', event => onPlayerPointerDown?.(event, player.id));
    svg.append(group);
  });
  const ball = svgEl('g', { 'data-id': 'ball', transform: `translate(${stage.ball.x} ${stage.ball.y})`, 'pointer-events': interactive ? 'auto' : 'none' });
  ball.append(svgEl('ellipse', { rx: 12, ry: 6, fill: '#f5f5f5', stroke: '#000', 'stroke-width': 1.5 }));
  ball.append(svgEl('ellipse', { rx: 11.5, ry: 3, fill: '#ececec', stroke: '#000', 'stroke-width': 1 }));
  if (interactive) ball.addEventListener('pointerdown', event => onPlayerPointerDown?.(event, 'ball'));
  svg.append(ball);
}
