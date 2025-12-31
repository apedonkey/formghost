/**
 * FormGhost - Step Editor
 * Allows viewing, editing, reordering, and deleting recorded steps
 * Supports variable marking and pause-before-execute flags
 */

// State
let actions = [];
let selectedIndices = new Set();
let editingIndex = -1;
let hasChanges = false;

// Variable pattern for detection
const VARIABLE_PATTERN = /^\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}$/;

// DOM Elements
const elements = {
  stepCount: document.getElementById('stepCount'),
  stepsContainer: document.getElementById('stepsContainer'),
  stepsList: document.getElementById('stepsList'),
  emptyState: document.getElementById('emptyState'),
  editPanel: document.getElementById('editPanel'),
  editForm: document.getElementById('editForm'),
  editType: document.getElementById('editType'),
  editSelector: document.getElementById('editSelector'),
  editValue: document.getElementById('editValue'),
  editDescription: document.getElementById('editDescription'),
  valueGroup: document.getElementById('valueGroup'),
  refreshBtn: document.getElementById('refreshBtn'),
  saveBtn: document.getElementById('saveBtn'),
  selectAllBtn: document.getElementById('selectAllBtn'),
  deleteSelectedBtn: document.getElementById('deleteSelectedBtn'),
  closeEditPanel: document.getElementById('closeEditPanel'),
  cancelEdit: document.getElementById('cancelEdit'),
  // Variable marking elements
  markVariableBtn: document.getElementById('markVariableBtn'),
  variableControls: document.getElementById('variableControls'),
  variableName: document.getElementById('variableName'),
  applyVariableBtn: document.getElementById('applyVariableBtn'),
  cancelVariableBtn: document.getElementById('cancelVariableBtn'),
  variableInfo: document.getElementById('variableInfo'),
  currentVariableName: document.getElementById('currentVariableName'),
  removeVariableBtn: document.getElementById('removeVariableBtn'),
  pauseBeforeExecute: document.getElementById('pauseBeforeExecute')
};

/**
 * Action type icons
 */
const ACTION_ICONS = {
  click: '&#128433;',
  dblclick: '&#128432;',
  type: '&#9000;',
  navigate: '&#10140;',
  scroll: '&#8597;',
  keypress: '&#8984;',
  select: '&#9660;',
  hover: '&#128065;',
  drag: '&#8644;',
  fileUpload: '&#128206;',
  newTab: '&#43;',
  switchTab: '&#8644;',
  closeTab: '&#10005;',
  submit: '&#10148;'
};

/**
 * Sends message to background script
 */
async function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Loads actions from storage
 */
async function loadActions() {
  try {
    const result = await chrome.storage.local.get('currentRecording');
    const recording = result.currentRecording || { actions: [] };
    actions = recording.actions || [];
    renderSteps();
    updateStepCount();
  } catch (error) {
    console.error('Failed to load actions:', error);
  }
}

/**
 * Saves actions to storage
 */
async function saveActions() {
  try {
    const result = await chrome.storage.local.get('currentRecording');
    const recording = result.currentRecording || {};
    recording.actions = actions;
    await chrome.storage.local.set({ currentRecording: recording });
    hasChanges = false;
    elements.saveBtn.classList.remove('has-changes');
    alert('Changes saved successfully!');
  } catch (error) {
    console.error('Failed to save actions:', error);
    alert('Failed to save changes');
  }
}

/**
 * Updates the step count display
 */
function updateStepCount() {
  const count = actions.length;
  elements.stepCount.textContent = `${count} step${count !== 1 ? 's' : ''}`;

  if (count === 0) {
    elements.emptyState.style.display = 'block';
    elements.stepsList.style.display = 'none';
  } else {
    elements.emptyState.style.display = 'none';
    elements.stepsList.style.display = 'block';
  }
}

/**
 * Escapes HTML
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Gets icon class for action type
 */
function getIconClass(type) {
  const classes = {
    click: 'click',
    dblclick: 'click',
    type: 'type',
    navigate: 'navigate',
    scroll: 'scroll',
    keypress: 'keypress',
    select: 'select',
    hover: 'hover',
    drag: 'drag',
    fileUpload: 'drag',
    newTab: 'tab',
    switchTab: 'tab',
    closeTab: 'tab',
    submit: 'click'
  };
  return classes[type] || 'click';
}

/**
 * Gets description for an action
 */
function getActionDescription(action) {
  const label = action.element?.humanLabel || '';
  switch (action.type) {
    case 'click': return `Click on "${label}"`;
    case 'dblclick': return `Double-click on "${label}"`;
    case 'type': return `Type "${action.value || ''}" into "${label}"`;
    case 'keypress': return `Press ${action.key || 'key'}`;
    case 'navigate': return `Navigate to ${action.context?.url || 'page'}`;
    case 'scroll': return `Scroll to (${action.scrollTo?.x || 0}, ${action.scrollTo?.y || 0})`;
    case 'select': return `Select "${action.value || ''}" in "${label}"`;
    case 'hover': return `Hover over "${label}"`;
    case 'drag': return `Drag "${action.sourceElement?.humanLabel || 'element'}" to "${action.targetElement?.humanLabel || 'target'}"`;
    case 'fileUpload': return `Upload ${action.files?.length || 0} file(s)`;
    case 'newTab': return 'Open new tab';
    case 'switchTab': return `Switch to tab "${action.context?.title || ''}"`;
    case 'closeTab': return 'Close tab';
    case 'submit': return `Submit form "${label}"`;
    default: return action.type;
  }
}

/**
 * Renders all steps
 */
function renderSteps() {
  elements.stepsList.innerHTML = '';

  actions.forEach((action, index) => {
    const li = document.createElement('li');
    li.className = 'step-item';
    li.dataset.index = index;
    li.draggable = true;

    if (selectedIndices.has(index)) {
      li.classList.add('selected');
    }

    const selector = action.element?.recommended || action.element?.selectors?.[0]?.value || '';
    const description = getActionDescription(action);

    // Check for variables and pause flag
    const hasVariable = action.value && /\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}/.test(action.value);
    const hasPause = action.pauseBeforeExecute;

    li.innerHTML = `
      <input type="checkbox" class="step-checkbox" ${selectedIndices.has(index) ? 'checked' : ''}>
      <span class="step-number">${index + 1}</span>
      <span class="step-icon ${getIconClass(action.type)}">${ACTION_ICONS[action.type] || '&#9654;'}</span>
      <div class="step-content">
        <div class="step-type">
          ${action.type}
          ${hasVariable ? '<span class="badge badge-variable" title="Contains variable">{{x}}</span>' : ''}
          ${hasPause ? '<span class="badge badge-pause" title="Pauses before execution">&#10074;&#10074;</span>' : ''}
        </div>
        <div class="step-label">${escapeHtml(description)}</div>
        <div class="step-selector" title="${escapeHtml(selector)}">${escapeHtml(selector)}</div>
      </div>
      <div class="step-actions">
        <button class="step-action-btn move-up" title="Move up" ${index === 0 ? 'disabled' : ''}>&#9650;</button>
        <button class="step-action-btn move-down" title="Move down" ${index === actions.length - 1 ? 'disabled' : ''}>&#9660;</button>
        <button class="step-action-btn edit" title="Edit">&#9998;</button>
        <button class="step-action-btn delete" title="Delete">&#10005;</button>
      </div>
    `;

    // Event listeners
    li.querySelector('.step-checkbox').addEventListener('change', (e) => {
      e.stopPropagation();
      toggleSelection(index);
    });

    li.querySelector('.move-up').addEventListener('click', (e) => {
      e.stopPropagation();
      moveStep(index, -1);
    });

    li.querySelector('.move-down').addEventListener('click', (e) => {
      e.stopPropagation();
      moveStep(index, 1);
    });

    li.querySelector('.edit').addEventListener('click', (e) => {
      e.stopPropagation();
      openEditPanel(index);
    });

    li.querySelector('.delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteStep(index);
    });

    // Drag events
    li.addEventListener('dragstart', handleDragStart);
    li.addEventListener('dragend', handleDragEnd);
    li.addEventListener('dragover', handleDragOver);
    li.addEventListener('drop', handleDrop);
    li.addEventListener('dragleave', handleDragLeave);

    elements.stepsList.appendChild(li);
  });
}

/**
 * Toggles step selection
 */
function toggleSelection(index) {
  if (selectedIndices.has(index)) {
    selectedIndices.delete(index);
  } else {
    selectedIndices.add(index);
  }
  updateSelectionUI();
}

/**
 * Updates selection UI
 */
function updateSelectionUI() {
  elements.deleteSelectedBtn.disabled = selectedIndices.size === 0;

  document.querySelectorAll('.step-item').forEach((item, index) => {
    item.classList.toggle('selected', selectedIndices.has(index));
    item.querySelector('.step-checkbox').checked = selectedIndices.has(index);
  });
}

/**
 * Selects all steps
 */
function selectAll() {
  if (selectedIndices.size === actions.length) {
    selectedIndices.clear();
  } else {
    actions.forEach((_, index) => selectedIndices.add(index));
  }
  updateSelectionUI();
}

/**
 * Deletes selected steps
 */
function deleteSelected() {
  if (selectedIndices.size === 0) return;

  if (!confirm(`Delete ${selectedIndices.size} selected step(s)?`)) return;

  // Delete in reverse order to maintain indices
  const indicesToDelete = Array.from(selectedIndices).sort((a, b) => b - a);
  indicesToDelete.forEach(index => {
    actions.splice(index, 1);
  });

  selectedIndices.clear();
  markChanged();
  renderSteps();
  updateStepCount();
}

/**
 * Moves a step up or down
 */
function moveStep(index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= actions.length) return;

  const temp = actions[index];
  actions[index] = actions[newIndex];
  actions[newIndex] = temp;

  markChanged();
  renderSteps();
}

/**
 * Deletes a single step
 */
function deleteStep(index) {
  if (!confirm('Delete this step?')) return;

  actions.splice(index, 1);
  selectedIndices.delete(index);

  // Adjust selected indices
  const newSelected = new Set();
  selectedIndices.forEach(i => {
    if (i > index) newSelected.add(i - 1);
    else if (i < index) newSelected.add(i);
  });
  selectedIndices = newSelected;

  markChanged();
  renderSteps();
  updateStepCount();
}

/**
 * Opens edit panel for a step
 */
function openEditPanel(index) {
  editingIndex = index;
  const action = actions[index];

  elements.editType.value = action.type;
  elements.editSelector.value = action.element?.recommended || action.element?.selectors?.[0]?.value || '';
  elements.editValue.value = action.value || action.key || '';
  elements.editDescription.value = action.element?.humanLabel || '';
  elements.pauseBeforeExecute.checked = action.pauseBeforeExecute || false;

  // Show/hide value field based on type
  const typesWithValue = ['type', 'keypress', 'select'];
  elements.valueGroup.style.display = typesWithValue.includes(action.type) ? 'block' : 'none';

  // Check if current value is a variable
  updateVariableUI(elements.editValue.value);

  elements.editPanel.style.display = 'flex';
}

/**
 * Updates variable UI based on current value
 */
function updateVariableUI(value) {
  const match = value.match(VARIABLE_PATTERN);

  // Reset variable UI
  elements.variableControls.style.display = 'none';
  elements.variableInfo.style.display = 'none';

  if (match) {
    // Value is a variable
    elements.currentVariableName.textContent = match[1];
    elements.variableInfo.style.display = 'flex';
    elements.editValue.classList.add('is-variable');
  } else {
    elements.editValue.classList.remove('is-variable');
  }
}

/**
 * Shows variable name input controls
 */
function showVariableControls() {
  const currentValue = elements.editValue.value.trim();

  // Suggest a variable name based on current value
  let suggestedName = '';
  if (currentValue && !VARIABLE_PATTERN.test(currentValue)) {
    // Convert value to camelCase variable name
    suggestedName = currentValue
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .map((word, i) => i === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))
      .join('')
      .substring(0, 20) || 'value';
  }

  elements.variableName.value = suggestedName;
  elements.variableControls.style.display = 'flex';
  elements.variableInfo.style.display = 'none';
  elements.variableName.focus();
}

/**
 * Applies variable to the value field
 */
function applyVariable() {
  const varName = elements.variableName.value.trim();

  if (!varName) {
    alert('Please enter a variable name');
    return;
  }

  // Validate variable name format
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(varName)) {
    alert('Invalid variable name. Use letters, numbers, and underscores. Must start with a letter or underscore.');
    return;
  }

  // Store original value for reference
  const originalValue = elements.editValue.value;
  if (!VARIABLE_PATTERN.test(originalValue)) {
    // Save original value in action metadata
    if (editingIndex >= 0) {
      actions[editingIndex].originalValue = originalValue;
    }
  }

  // Set value to variable placeholder
  elements.editValue.value = `{{${varName}}}`;
  elements.variableControls.style.display = 'none';
  updateVariableUI(elements.editValue.value);
  markChanged();
}

/**
 * Removes variable and restores original value
 */
function removeVariable() {
  if (editingIndex >= 0) {
    const action = actions[editingIndex];
    // Restore original value if available
    elements.editValue.value = action.originalValue || '';
    delete action.originalValue;
  } else {
    elements.editValue.value = '';
  }

  updateVariableUI(elements.editValue.value);
  markChanged();
}

/**
 * Cancels variable input
 */
function cancelVariableInput() {
  elements.variableControls.style.display = 'none';
  updateVariableUI(elements.editValue.value);
}

/**
 * Closes edit panel
 */
function closeEditPanel() {
  editingIndex = -1;
  elements.editPanel.style.display = 'none';
}

/**
 * Handles edit form submission
 */
function handleEditSubmit(e) {
  e.preventDefault();

  if (editingIndex < 0) return;

  const action = actions[editingIndex];

  // Update action
  action.type = elements.editType.value;

  if (!action.element) action.element = {};
  action.element.recommended = elements.editSelector.value;
  action.element.humanLabel = elements.editDescription.value;

  // Update selectors array
  if (!action.element.selectors) action.element.selectors = [];
  if (action.element.selectors.length > 0) {
    action.element.selectors[0].value = elements.editSelector.value;
  } else {
    action.element.selectors.push({
      strategy: 'manual',
      value: elements.editSelector.value,
      confidence: 1.0
    });
  }

  // Update value based on type
  if (action.type === 'type' || action.type === 'select') {
    action.value = elements.editValue.value;
  } else if (action.type === 'keypress') {
    action.key = elements.editValue.value;
  }

  // Update pause before execute flag
  action.pauseBeforeExecute = elements.pauseBeforeExecute.checked;

  markChanged();
  closeEditPanel();
  renderSteps();
}

/**
 * Marks that there are unsaved changes
 */
function markChanged() {
  hasChanges = true;
  elements.saveBtn.style.background = '#e63946';
}

// Drag and Drop handling
let draggedIndex = -1;

function handleDragStart(e) {
  draggedIndex = parseInt(e.target.dataset.index);
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
  e.target.classList.remove('dragging');
  document.querySelectorAll('.step-item').forEach(item => {
    item.classList.remove('drag-over');
  });
  draggedIndex = -1;
}

function handleDragOver(e) {
  e.preventDefault();
  const item = e.target.closest('.step-item');
  if (item) {
    item.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  const item = e.target.closest('.step-item');
  if (item) {
    item.classList.remove('drag-over');
  }
}

function handleDrop(e) {
  e.preventDefault();
  const item = e.target.closest('.step-item');
  if (!item || draggedIndex < 0) return;

  const dropIndex = parseInt(item.dataset.index);
  if (dropIndex === draggedIndex) return;

  // Move the action
  const movedAction = actions.splice(draggedIndex, 1)[0];
  actions.splice(dropIndex, 0, movedAction);

  markChanged();
  renderSteps();
}

// Event type change handler
elements.editType.addEventListener('change', () => {
  const typesWithValue = ['type', 'keypress', 'select'];
  elements.valueGroup.style.display = typesWithValue.includes(elements.editType.value) ? 'block' : 'none';
});

// Event listeners
elements.refreshBtn.addEventListener('click', loadActions);
elements.saveBtn.addEventListener('click', saveActions);
elements.selectAllBtn.addEventListener('click', selectAll);
elements.deleteSelectedBtn.addEventListener('click', deleteSelected);
elements.closeEditPanel.addEventListener('click', closeEditPanel);
elements.cancelEdit.addEventListener('click', closeEditPanel);
elements.editForm.addEventListener('submit', handleEditSubmit);

// Variable marking event listeners
elements.markVariableBtn.addEventListener('click', showVariableControls);
elements.applyVariableBtn.addEventListener('click', applyVariable);
elements.cancelVariableBtn.addEventListener('click', cancelVariableInput);
elements.removeVariableBtn.addEventListener('click', removeVariable);

// Update variable UI when value changes manually
elements.editValue.addEventListener('input', () => {
  updateVariableUI(elements.editValue.value);
});

// Allow Enter key to apply variable
elements.variableName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    applyVariable();
  } else if (e.key === 'Escape') {
    cancelVariableInput();
  }
});

// Warn before closing with unsaved changes
window.addEventListener('beforeunload', (e) => {
  if (hasChanges) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// Initialize
loadActions();
