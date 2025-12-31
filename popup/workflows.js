/**
 * FormGhost - Workflows Management Page
 * Handles workflow listing, searching, running, and management
 */

// State
let workflows = [];
let allTags = [];
let selectedWorkflow = null;
let currentVariableValues = {};

// DOM Elements
const elements = {
  backBtn: document.getElementById('backBtn'),
  searchInput: document.getElementById('searchInput'),
  tagFilter: document.getElementById('tagFilter'),
  workflowsList: document.getElementById('workflowsList'),
  emptyState: document.getElementById('emptyState'),
  // Run Modal
  runModal: document.getElementById('runModal'),
  closeRunModal: document.getElementById('closeRunModal'),
  runWorkflowName: document.getElementById('runWorkflowName'),
  runWorkflowSteps: document.getElementById('runWorkflowSteps'),
  variablesSection: document.getElementById('variablesSection'),
  presetSelect: document.getElementById('presetSelect'),
  loadPresetBtn: document.getElementById('loadPresetBtn'),
  variableInputs: document.getElementById('variableInputs'),
  newPresetName: document.getElementById('newPresetName'),
  savePresetBtn: document.getElementById('savePresetBtn'),
  highlightElements: document.getElementById('highlightElements'),
  stepDelay: document.getElementById('stepDelay'),
  cancelRunBtn: document.getElementById('cancelRunBtn'),
  startRunBtn: document.getElementById('startRunBtn'),
  // Progress Modal
  progressModal: document.getElementById('progressModal'),
  progressWorkflowName: document.getElementById('progressWorkflowName'),
  progressBar: document.getElementById('progressBar'),
  progressStep: document.getElementById('progressStep'),
  progressStepInfo: document.getElementById('progressStepInfo'),
  pauseRunBtn: document.getElementById('pauseRunBtn'),
  cancelRunBtn2: document.getElementById('cancelRunBtn2'),
  // Context Menu
  contextMenu: document.getElementById('contextMenu')
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
 * Loads workflows from storage
 */
async function loadWorkflows() {
  try {
    const response = await sendMessage({ type: 'GET_WORKFLOWS' });
    workflows = response.workflows || [];
    allTags = response.tags || [];
    renderTagFilter();
    renderWorkflows();
  } catch (error) {
    console.error('Failed to load workflows:', error);
  }
}

/**
 * Renders tag filter dropdown
 */
function renderTagFilter() {
  elements.tagFilter.innerHTML = '<option value="">All tags</option>';
  allTags.forEach(tag => {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = tag;
    elements.tagFilter.appendChild(option);
  });
}

/**
 * Renders workflow cards
 */
function renderWorkflows() {
  const searchTerm = elements.searchInput.value.toLowerCase();
  const selectedTag = elements.tagFilter.value;

  const filtered = workflows.filter(w => {
    const matchesSearch = w.name.toLowerCase().includes(searchTerm);
    const matchesTag = !selectedTag || (w.tags && w.tags.includes(selectedTag));
    return matchesSearch && matchesTag;
  });

  if (filtered.length === 0) {
    elements.emptyState.style.display = 'block';
    elements.workflowsList.innerHTML = '';
    elements.workflowsList.appendChild(elements.emptyState);
    return;
  }

  elements.emptyState.style.display = 'none';
  elements.workflowsList.innerHTML = '';

  filtered.forEach(workflow => {
    const card = createWorkflowCard(workflow);
    elements.workflowsList.appendChild(card);
  });
}

/**
 * Creates a workflow card element
 */
function createWorkflowCard(workflow) {
  const card = document.createElement('div');
  card.className = 'workflow-card';
  card.dataset.id = workflow.id;

  const lastRun = workflow.lastRun
    ? formatRelativeTime(workflow.lastRun)
    : 'Never run';

  const variableCount = Object.keys(workflow.variables || {}).length;

  card.innerHTML = `
    <div class="workflow-card-header">
      <span class="workflow-name">${escapeHtml(workflow.name)}</span>
      <button class="workflow-menu-btn" title="More options">&#8942;</button>
    </div>
    <div class="workflow-meta">
      <span class="workflow-meta-item">
        <span>&#128203;</span> ${workflow.actionCount} steps
      </span>
      <span class="workflow-meta-item">
        <span>&#128337;</span> ${lastRun}
      </span>
      ${variableCount > 0 ? `
        <span class="workflow-meta-item">
          <span>&#123;&#123;x&#125;&#125;</span> ${variableCount} vars
        </span>
      ` : ''}
    </div>
    ${workflow.tags && workflow.tags.length > 0 ? `
      <div class="workflow-tags">
        ${workflow.tags.map(t => `<span class="workflow-tag">${escapeHtml(t)}</span>`).join('')}
      </div>
    ` : ''}
    <div class="workflow-card-actions">
      <button class="btn-run-workflow">
        <span>&#9654;</span> Run
      </button>
      <button class="btn-edit-workflow">Edit</button>
    </div>
  `;

  // Event listeners
  card.querySelector('.workflow-menu-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    showContextMenu(e, workflow);
  });

  card.querySelector('.btn-run-workflow').addEventListener('click', () => {
    openRunModal(workflow);
  });

  card.querySelector('.btn-edit-workflow').addEventListener('click', () => {
    editWorkflow(workflow);
  });

  return card;
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
 * Formats timestamp as relative time
 */
function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Opens run modal for a workflow
 */
function openRunModal(workflow) {
  selectedWorkflow = workflow;
  currentVariableValues = {};

  elements.runWorkflowName.textContent = workflow.name;
  elements.runWorkflowSteps.textContent = `${workflow.actionCount} steps`;

  // Setup variables section
  const variables = workflow.variables || {};
  const varNames = Object.keys(variables);

  if (varNames.length > 0) {
    elements.variablesSection.style.display = 'block';
    renderVariableInputs(variables);
    renderPresetOptions(workflow.presets || []);
  } else {
    elements.variablesSection.style.display = 'none';
  }

  elements.runModal.style.display = 'flex';
}

/**
 * Renders variable input fields
 */
function renderVariableInputs(variables) {
  elements.variableInputs.innerHTML = '';

  Object.entries(variables).forEach(([name, meta]) => {
    const group = document.createElement('div');
    group.className = 'variable-input-group';
    group.innerHTML = `
      <label>
        <span class="var-name">{{${name}}}</span>
      </label>
      <input type="text" data-var="${name}" placeholder="Enter value...">
    `;
    elements.variableInputs.appendChild(group);
  });
}

/**
 * Renders preset options
 */
function renderPresetOptions(presets) {
  elements.presetSelect.innerHTML = '<option value="">Select a preset...</option>';
  presets.forEach(preset => {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = preset.name;
    elements.presetSelect.appendChild(option);
  });
}

/**
 * Loads a preset's values into inputs
 */
function loadPreset() {
  const presetId = elements.presetSelect.value;
  if (!presetId || !selectedWorkflow) return;

  const preset = (selectedWorkflow.presets || []).find(p => p.id === presetId);
  if (!preset) return;

  Object.entries(preset.values).forEach(([name, value]) => {
    const input = elements.variableInputs.querySelector(`[data-var="${name}"]`);
    if (input) {
      input.value = value;
    }
  });
}

/**
 * Saves current values as a preset
 */
async function savePreset() {
  if (!selectedWorkflow) return;

  const presetName = elements.newPresetName.value.trim();
  if (!presetName) {
    alert('Please enter a preset name');
    return;
  }

  const values = {};
  elements.variableInputs.querySelectorAll('input[data-var]').forEach(input => {
    values[input.dataset.var] = input.value;
  });

  try {
    await sendMessage({
      type: 'SAVE_PRESET',
      workflowId: selectedWorkflow.id,
      preset: {
        name: presetName,
        values: values
      }
    });

    // Reload workflow data
    await loadWorkflows();
    selectedWorkflow = workflows.find(w => w.id === selectedWorkflow.id);

    renderPresetOptions(selectedWorkflow.presets || []);
    elements.newPresetName.value = '';
    alert('Preset saved!');
  } catch (error) {
    console.error('Failed to save preset:', error);
    alert('Failed to save preset');
  }
}

/**
 * Collects current variable values from inputs
 */
function collectVariableValues() {
  const values = {};
  elements.variableInputs.querySelectorAll('input[data-var]').forEach(input => {
    values[input.dataset.var] = input.value;
  });
  return values;
}

/**
 * Starts workflow execution
 */
async function startRun() {
  if (!selectedWorkflow) return;

  const variables = collectVariableValues();
  const options = {
    highlightElements: elements.highlightElements.checked,
    stepDelay: parseInt(elements.stepDelay.value, 10)
  };

  // Close run modal, show progress modal
  elements.runModal.style.display = 'none';
  elements.progressModal.style.display = 'flex';
  elements.progressWorkflowName.textContent = selectedWorkflow.name;
  elements.progressBar.style.width = '0%';
  elements.progressStep.textContent = 'Starting...';
  elements.progressStepInfo.textContent = '';

  try {
    await sendMessage({
      type: 'START_REPLAY',
      workflowId: selectedWorkflow.id,
      variables,
      options
    });
  } catch (error) {
    console.error('Failed to start replay:', error);
    alert('Failed to start workflow');
    elements.progressModal.style.display = 'none';
  }
}

/**
 * Pauses/resumes workflow execution
 */
async function togglePause() {
  const isPaused = elements.pauseRunBtn.textContent.includes('Resume');

  try {
    await sendMessage({
      type: isPaused ? 'RESUME_REPLAY' : 'PAUSE_REPLAY'
    });

    elements.pauseRunBtn.innerHTML = isPaused
      ? '<span class="btn-icon">&#10074;&#10074;</span> Pause'
      : '<span class="btn-icon">&#9654;</span> Resume';
  } catch (error) {
    console.error('Failed to toggle pause:', error);
  }
}

/**
 * Cancels workflow execution
 */
async function cancelRun() {
  try {
    await sendMessage({ type: 'CANCEL_REPLAY' });
    elements.progressModal.style.display = 'none';
  } catch (error) {
    console.error('Failed to cancel replay:', error);
  }
}

/**
 * Shows context menu for a workflow
 */
function showContextMenu(event, workflow) {
  selectedWorkflow = workflow;

  const rect = event.target.getBoundingClientRect();
  elements.contextMenu.style.display = 'block';
  elements.contextMenu.style.left = `${rect.left}px`;
  elements.contextMenu.style.top = `${rect.bottom + 4}px`;

  // Ensure menu stays within viewport
  const menuRect = elements.contextMenu.getBoundingClientRect();
  if (menuRect.right > window.innerWidth) {
    elements.contextMenu.style.left = `${window.innerWidth - menuRect.width - 8}px`;
  }
}

/**
 * Hides context menu
 */
function hideContextMenu() {
  elements.contextMenu.style.display = 'none';
}

/**
 * Handles context menu actions
 */
async function handleContextMenuAction(action) {
  if (!selectedWorkflow) return;
  hideContextMenu();

  switch (action) {
    case 'rename':
      const newName = prompt('Enter new name:', selectedWorkflow.name);
      if (newName && newName !== selectedWorkflow.name) {
        await sendMessage({
          type: 'UPDATE_WORKFLOW',
          workflowId: selectedWorkflow.id,
          updates: { name: newName }
        });
        await loadWorkflows();
      }
      break;

    case 'duplicate':
      const dupName = prompt('Enter name for copy:', `${selectedWorkflow.name} (Copy)`);
      if (dupName) {
        await sendMessage({
          type: 'DUPLICATE_WORKFLOW',
          workflowId: selectedWorkflow.id,
          newName: dupName
        });
        await loadWorkflows();
      }
      break;

    case 'export':
      const data = JSON.stringify(selectedWorkflow.recording, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedWorkflow.name.replace(/[^a-z0-9]/gi, '_')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      break;

    case 'tags':
      const tagsStr = (selectedWorkflow.tags || []).join(', ');
      const newTags = prompt('Enter tags (comma-separated):', tagsStr);
      if (newTags !== null) {
        const tags = newTags.split(',').map(t => t.trim()).filter(t => t);
        await sendMessage({
          type: 'UPDATE_WORKFLOW',
          workflowId: selectedWorkflow.id,
          updates: { tags }
        });
        await loadWorkflows();
      }
      break;

    case 'delete':
      if (confirm(`Delete workflow "${selectedWorkflow.name}"?`)) {
        await sendMessage({
          type: 'DELETE_WORKFLOW',
          workflowId: selectedWorkflow.id
        });
        await loadWorkflows();
      }
      break;
  }
}

/**
 * Opens editor for a workflow
 */
function editWorkflow(workflow) {
  // Load workflow into storage and open editor
  chrome.storage.local.set({ currentRecording: workflow.recording }, () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL('editor/editor.html')
    });
  });
}

/**
 * Handles replay state updates from background
 */
function handleReplayStateUpdate(state) {
  if (state.status === 'idle' || state.status === 'complete') {
    elements.progressModal.style.display = 'none';
    if (state.status === 'complete') {
      loadWorkflows(); // Refresh to update lastRun
    }
    return;
  }

  if (state.status === 'error') {
    elements.progressModal.style.display = 'none';
    alert(`Replay error: ${state.error || 'Unknown error'}`);
    return;
  }

  // Update progress
  const percent = state.totalSteps > 0
    ? (state.currentStep / state.totalSteps) * 100
    : 0;

  elements.progressBar.style.width = `${percent}%`;
  elements.progressStep.textContent = `Step ${state.currentStep} of ${state.totalSteps}`;
  elements.progressStepInfo.textContent = state.stepInfo || '';

  // Update pause button
  if (state.status === 'paused') {
    elements.pauseRunBtn.innerHTML = '<span class="btn-icon">&#9654;</span> Resume';
  } else {
    elements.pauseRunBtn.innerHTML = '<span class="btn-icon">&#10074;&#10074;</span> Pause';
  }
}

// Event Listeners
elements.backBtn.addEventListener('click', () => {
  window.location.href = 'popup.html';
});

elements.searchInput.addEventListener('input', renderWorkflows);
elements.tagFilter.addEventListener('change', renderWorkflows);

elements.closeRunModal.addEventListener('click', () => {
  elements.runModal.style.display = 'none';
});

elements.cancelRunBtn.addEventListener('click', () => {
  elements.runModal.style.display = 'none';
});

elements.loadPresetBtn.addEventListener('click', loadPreset);
elements.savePresetBtn.addEventListener('click', savePreset);
elements.startRunBtn.addEventListener('click', startRun);

elements.pauseRunBtn.addEventListener('click', togglePause);
elements.cancelRunBtn2.addEventListener('click', cancelRun);

// Context menu event listeners
elements.contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
  item.addEventListener('click', () => {
    handleContextMenuAction(item.dataset.action);
  });
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.context-menu') && !e.target.closest('.workflow-menu-btn')) {
    hideContextMenu();
  }
});

// Listen for replay state updates
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'REPLAY_STATE_UPDATE') {
    handleReplayStateUpdate(message);
  }
});

// Initialize
loadWorkflows();
