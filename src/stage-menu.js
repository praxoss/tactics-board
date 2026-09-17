import { renderStageSvg } from './stage-renderer.js';

export function renderStageMenu(container, { stages, activeStageId, collapsed, onToggle, onSelect, onAdd, onRemove, onMove }) {
  container.classList.toggle('is-collapsed', collapsed);
  const cards = stages.map((stage, index) => `<article class="stage-card ${stage.id === activeStageId ? 'active' : ''}" data-stage-id="${stage.id}" data-index="${index}" draggable="true" role="listitem" aria-current="${stage.id === activeStageId ? 'step' : 'false'}" aria-label="Stage ${index + 1}${stage.id === activeStageId ? ', active' : ''}"><button class="stage-preview" data-select-stage="${stage.id}" aria-label="Select Stage ${index + 1}"><svg class="stage-thumbnail" viewBox="0 0 1100 700" aria-hidden="true"></svg></button><div class="stage-card-footer"><button class="stage-number" data-select-stage="${stage.id}">Stage ${index + 1}</button><div class="stage-card-actions"><button class="stage-arrow" data-move-stage="${index - 1}" ${index === 0 ? 'disabled' : ''} aria-label="Move Stage ${index + 1} left">‹</button><button class="stage-arrow" data-move-stage="${index + 1}" ${index === stages.length - 1 ? 'disabled' : ''} aria-label="Move Stage ${index + 1} right">›</button><button class="stage-delete" data-remove-stage="${stage.id}" ${stages.length === 1 ? 'disabled' : ''} aria-label="Delete Stage ${index + 1}">×</button></div></div></article>`).join('');
  const strip = collapsed ? '' : `<div class="stage-strip" role="list" aria-label="Stage sequence">${cards}<button class="stage-add" id="add-stage" aria-label="Add a stage after the active stage">＋ Stage</button></div>`;
  container.innerHTML = `<div class="timeline-header"><span class="stage-summary">Stages · ${stages.length}</span><button class="timeline-toggle" id="toggle-timeline" aria-label="${collapsed ? 'Expand stages' : 'Collapse stages'}" aria-expanded="${!collapsed}">${collapsed ? '＋ Stages' : '− Stages'}</button></div>${strip}`;
  container.querySelector('#toggle-timeline').onclick = onToggle;
  if (collapsed) return;

  stages.forEach(stage => {
    const thumbnail = container.querySelector(`[data-stage-id="${CSS.escape(stage.id)}"] .stage-thumbnail`);
    if (thumbnail) renderStageSvg(thumbnail, stage, { interactive: false });
  });
  container.querySelectorAll('[data-select-stage]').forEach(button => button.onclick = () => onSelect(button.dataset.selectStage));
  container.querySelectorAll('[data-remove-stage]').forEach(button => button.onclick = event => { event.stopPropagation(); onRemove(button.dataset.removeStage); });
  container.querySelectorAll('[data-move-stage]').forEach(button => button.onclick = event => { event.stopPropagation(); if (!button.disabled) onMove(Number(button.closest('.stage-card').dataset.index), Number(button.dataset.moveStage)); });
  container.querySelector('#add-stage').onclick = onAdd;

  let draggedId = null;
  container.querySelectorAll('.stage-card').forEach(card => {
    card.addEventListener('dragstart', event => { draggedId = card.dataset.stageId; card.classList.add('dragging'); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', draggedId); });
    card.addEventListener('dragend', () => { draggedId = null; card.classList.remove('dragging'); container.querySelectorAll('.stage-card').forEach(item => item.classList.remove('drop-target')); });
    card.addEventListener('dragover', event => { event.preventDefault(); if (draggedId && draggedId !== card.dataset.stageId) card.classList.add('drop-target'); });
    card.addEventListener('dragleave', () => card.classList.remove('drop-target'));
    card.addEventListener('drop', event => { event.preventDefault(); card.classList.remove('drop-target'); const from = stages.findIndex(stage => stage.id === draggedId); const to = Number(card.dataset.index); if (from >= 0 && from !== to) onMove(to, from); });
  });
}
