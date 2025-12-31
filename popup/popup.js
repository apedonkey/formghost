/**
 * FormGhost - Popup Controller
 * Handles UI state, user interactions, and communication with background service worker
 */

// DOM Elements
const elements = {
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
  timer: document.getElementById('timer'),
  actionCount: document.getElementById('actionCount'),
  requestCount: document.getElementById('requestCount'),
  annotationCount: document.getElementById('annotationCount'),
  startBtn: document.getElementById('startBtn'),
  pauseBtn: document.getElementById('pauseBtn'),
  stopBtn: document.getElementById('stopBtn'),
  annotateBtn: document.getElementById('annotateBtn'),
  assertBtn: document.getElementById('assertBtn'),
  assertionCount: document.getElementById('assertionCount'),
  sidebarBtn: document.getElementById('sidebarBtn'),
  exportJsonBtn: document.getElementById('exportJsonBtn'),
  exportCompactBtn: document.getElementById('exportCompactBtn'),
  exportPuppeteerBtn: document.getElementById('exportPuppeteerBtn'),
  exportPlaywrightBtn: document.getElementById('exportPlaywrightBtn'),
  editStepsBtn: document.getElementById('editStepsBtn'),
  clearBtn: document.getElementById('clearBtn'),
  captureScreenshots: document.getElementById('captureScreenshots'),
  captureNetwork: document.getElementById('captureNetwork'),
  captureStorage: document.getElementById('captureStorage'),
  captureHover: document.getElementById('captureHover'),
  redactSensitive: document.getElementById('redactSensitive'),
  // Recording management
  recordingName: document.getElementById('recordingName'),
  saveBtn: document.getElementById('saveBtn'),
  savedRecordingsList: document.getElementById('savedRecordingsList'),
  loadBtn: document.getElementById('loadBtn'),
  deleteBtn: document.getElementById('deleteBtn'),
  // Workflow management
  recentWorkflows: document.getElementById('recentWorkflows'),
  manageWorkflowsBtn: document.getElementById('manageWorkflowsBtn'),
  // AI Fill
  clientsBtn: document.getElementById('clientsBtn'),
  fillFormBtn: document.getElementById('fillFormBtn'),
  quickClientSelect: document.getElementById('quickClientSelect')
};

// State
let timerInterval = null;
let startTime = null;

/**
 * Formats milliseconds to MM:SS display
 * @param {number} ms - Milliseconds to format
 * @returns {string} Formatted time string
 */
function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

/**
 * Updates the timer display
 */
function updateTimer() {
  if (startTime) {
    const elapsed = Date.now() - startTime;
    elements.timer.textContent = formatTime(elapsed);
  }
}

/**
 * Updates UI based on recording state
 * @param {string} status - Current recording status
 */
function updateUIState(status) {
  const isRecording = status === 'recording';
  const isPaused = status === 'paused';
  const isStopped = status === 'stopped' || status === 'ready';

  // Status indicator
  elements.statusDot.className = 'status-dot';
  if (isRecording) {
    elements.statusDot.classList.add('recording');
    elements.statusText.textContent = 'Recording...';
  } else if (isPaused) {
    elements.statusDot.classList.add('paused');
    elements.statusText.textContent = 'Paused';
  } else {
    elements.statusText.textContent = 'Ready';
  }

  // Control buttons
  elements.startBtn.disabled = isRecording;
  elements.startBtn.innerHTML = isPaused
    ? '<span class="btn-icon">&#9658;</span> Resume'
    : '<span class="btn-icon">&#9679;</span> Record';
  elements.pauseBtn.disabled = !isRecording;
  elements.stopBtn.disabled = isStopped;
  elements.annotateBtn.disabled = !isRecording && !isPaused;
  elements.assertBtn.disabled = !isRecording && !isPaused;
  elements.sidebarBtn.disabled = !isRecording && !isPaused;

  // Timer
  if (isRecording && !timerInterval) {
    timerInterval = setInterval(updateTimer, 1000);
  } else if (!isRecording && timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

/**
 * Updates statistics display
 * @param {Object} stats - Recording statistics
 */
function updateStats(stats) {
  elements.actionCount.textContent = stats.actions || 0;
  elements.requestCount.textContent = stats.requests || 0;
  elements.annotationCount.textContent = stats.annotations || 0;
  elements.assertionCount.textContent = stats.assertions || 0;

  // Enable export buttons if there's data
  const hasData = (stats.actions || 0) > 0;
  elements.exportJsonBtn.disabled = !hasData;
  elements.exportCompactBtn.disabled = !hasData;
  elements.exportPuppeteerBtn.disabled = !hasData;
  elements.exportPlaywrightBtn.disabled = !hasData;
  elements.editStepsBtn.disabled = !hasData;
}

/**
 * Sends a message to the background service worker
 * @param {Object} message - Message to send
 * @returns {Promise<any>} Response from background
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
 * Gets current settings from checkboxes
 * @returns {Object} Settings object
 */
function getSettings() {
  return {
    captureScreenshots: elements.captureScreenshots.checked,
    captureNetwork: elements.captureNetwork.checked,
    captureStorage: elements.captureStorage.checked,
    captureHover: elements.captureHover.checked,
    redactSensitive: elements.redactSensitive.checked
  };
}

/**
 * Loads settings from storage and applies to UI
 */
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get('settings');
    if (result.settings) {
      elements.captureScreenshots.checked = result.settings.captureScreenshots ?? true;
      elements.captureNetwork.checked = result.settings.captureNetwork ?? true;
      elements.captureStorage.checked = result.settings.captureStorage ?? true;
      elements.captureHover.checked = result.settings.captureHover ?? false;
      elements.redactSensitive.checked = result.settings.redactSensitive ?? false;
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

/**
 * Saves current settings to storage
 */
async function saveSettings() {
  try {
    await chrome.storage.local.set({ settings: getSettings() });
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

/**
 * Initializes popup state from background
 */
async function initializeState() {
  try {
    const response = await sendMessage({ type: 'GET_STATE' });
    if (response) {
      updateUIState(response.status || 'ready');
      updateStats(response.stats || {});
      if (response.startTime) {
        startTime = response.startTime;
        updateTimer();
      }
    }
  } catch (error) {
    console.error('Failed to initialize state:', error);
    updateUIState('ready');
  }
}

/**
 * Downloads content as a file
 * @param {string} content - File content
 * @param {string} filename - Name for the downloaded file
 * @param {string} mimeType - MIME type of the file
 */
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Event Listeners

elements.startBtn.addEventListener('click', async () => {
  try {
    const settings = getSettings();
    await saveSettings();
    const response = await sendMessage({ type: 'START_RECORDING', settings });
    if (response?.success) {
      startTime = response.startTime || Date.now();
      updateUIState('recording');
    } else if (response?.error) {
      alert(response.error);
    }
  } catch (error) {
    console.error('Failed to start recording:', error);
  }
});

elements.pauseBtn.addEventListener('click', async () => {
  try {
    const response = await sendMessage({ type: 'PAUSE_RECORDING' });
    if (response?.success) {
      updateUIState('paused');
    }
  } catch (error) {
    console.error('Failed to pause recording:', error);
  }
});

elements.stopBtn.addEventListener('click', async () => {
  try {
    const response = await sendMessage({ type: 'STOP_RECORDING' });
    if (response?.success) {
      updateUIState('stopped');
      updateStats(response.stats || {});
      startTime = null;
      elements.timer.textContent = '00:00';
    }
  } catch (error) {
    console.error('Failed to stop recording:', error);
  }
});

elements.annotateBtn.addEventListener('click', async () => {
  const note = prompt('Enter annotation:');
  if (note) {
    try {
      await sendMessage({ type: 'ADD_ANNOTATION', note });
      const response = await sendMessage({ type: 'GET_STATE' });
      updateStats(response?.stats || {});
    } catch (error) {
      console.error('Failed to add annotation:', error);
    }
  }
});

elements.assertBtn.addEventListener('click', async () => {
  try {
    // Close popup and activate assertion mode on the page
    await sendMessage({ type: 'ACTIVATE_ASSERTION_MODE' });
    window.close(); // Close popup so user can interact with page
  } catch (error) {
    console.error('Failed to activate assertion mode:', error);
  }
});

elements.sidebarBtn.addEventListener('click', async () => {
  try {
    // Toggle sidebar visibility on the page
    await sendMessage({ type: 'TOGGLE_SIDEBAR' });
  } catch (error) {
    console.error('Failed to toggle sidebar:', error);
  }
});

elements.exportJsonBtn.addEventListener('click', async () => {
  try {
    const response = await sendMessage({ type: 'EXPORT', format: 'json' });
    if (response?.data) {
      const filename = `recording_${Date.now()}.json`;
      downloadFile(response.data, filename, 'application/json');
    }
  } catch (error) {
    console.error('Failed to export JSON:', error);
  }
});

elements.exportCompactBtn.addEventListener('click', async () => {
  try {
    const response = await sendMessage({ type: 'EXPORT', format: 'compact' });
    if (response?.data) {
      const filename = `recording_${Date.now()}_compact.json`;
      downloadFile(response.data, filename, 'application/json');
    }
  } catch (error) {
    console.error('Failed to export compact JSON:', error);
  }
});

elements.exportPuppeteerBtn.addEventListener('click', async () => {
  try {
    const response = await sendMessage({ type: 'EXPORT', format: 'puppeteer' });
    if (response?.data) {
      const filename = `recording_${Date.now()}_puppeteer.js`;
      downloadFile(response.data, filename, 'text/javascript');
    }
  } catch (error) {
    console.error('Failed to export Puppeteer script:', error);
  }
});

elements.exportPlaywrightBtn.addEventListener('click', async () => {
  try {
    const response = await sendMessage({ type: 'EXPORT', format: 'playwright' });
    if (response?.data) {
      const filename = `recording_${Date.now()}_playwright.spec.js`;
      downloadFile(response.data, filename, 'text/javascript');
    }
  } catch (error) {
    console.error('Failed to export Playwright script:', error);
  }
});

elements.editStepsBtn.addEventListener('click', () => {
  // Open editor in a new tab
  chrome.tabs.create({ url: chrome.runtime.getURL('editor/editor.html') });
});

elements.clearBtn.addEventListener('click', async () => {
  if (confirm('Clear all recording data?')) {
    try {
      await sendMessage({ type: 'CLEAR_RECORDING' });
      updateUIState('ready');
      updateStats({});
      startTime = null;
      elements.timer.textContent = '00:00';
    } catch (error) {
      console.error('Failed to clear recording:', error);
    }
  }
});

// Settings change listeners
[elements.captureScreenshots, elements.captureNetwork, elements.captureStorage,
 elements.captureHover, elements.redactSensitive].forEach(checkbox => {
  checkbox.addEventListener('change', saveSettings);
});

// Recording management functions

/**
 * Loads list of saved recordings
 */
async function loadSavedRecordingsList() {
  try {
    const result = await chrome.storage.local.get('savedRecordings');
    const savedRecordings = result.savedRecordings || {};

    // Clear existing options (keep first placeholder)
    while (elements.savedRecordingsList.options.length > 1) {
      elements.savedRecordingsList.remove(1);
    }

    // Add saved recordings
    const recordingIds = Object.keys(savedRecordings).sort((a, b) =>
      (savedRecordings[b].savedAt || 0) - (savedRecordings[a].savedAt || 0)
    );

    for (const id of recordingIds) {
      const rec = savedRecordings[id];
      const option = document.createElement('option');
      option.value = id;
      option.textContent = `${rec.name} (${rec.actionCount} actions)`;
      elements.savedRecordingsList.appendChild(option);
    }

    // Enable/disable load and delete buttons based on selection
    updateRecordingButtons();
  } catch (error) {
    console.error('Failed to load saved recordings:', error);
  }
}

/**
 * Updates save/load/delete button states
 */
function updateRecordingButtons() {
  const hasName = elements.recordingName.value.trim().length > 0;
  const hasSelection = elements.savedRecordingsList.value !== '';

  elements.loadBtn.disabled = !hasSelection;
  elements.deleteBtn.disabled = !hasSelection;
}

/**
 * Saves current recording with a name
 */
async function saveCurrentRecording() {
  const name = elements.recordingName.value.trim();
  if (!name) {
    alert('Please enter a recording name');
    return;
  }

  try {
    const response = await sendMessage({ type: 'SAVE_NAMED_RECORDING', name });
    if (response?.success) {
      elements.recordingName.value = '';
      await loadSavedRecordingsList();
      alert(`Recording "${name}" saved!`);
    } else {
      alert('Failed to save recording: ' + (response?.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Failed to save recording:', error);
    alert('Failed to save recording');
  }
}

/**
 * Loads a saved recording
 */
async function loadSavedRecording() {
  const recordingId = elements.savedRecordingsList.value;
  if (!recordingId) return;

  if (!confirm('Load this recording? Current recording will be replaced.')) {
    return;
  }

  try {
    const response = await sendMessage({ type: 'LOAD_NAMED_RECORDING', recordingId });
    if (response?.success) {
      updateUIState(response.status || 'stopped');
      updateStats(response.stats || {});
      elements.recordingName.value = response.name || '';
      alert('Recording loaded!');
    } else {
      alert('Failed to load recording: ' + (response?.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Failed to load recording:', error);
    alert('Failed to load recording');
  }
}

/**
 * Deletes a saved recording
 */
async function deleteSavedRecording() {
  const recordingId = elements.savedRecordingsList.value;
  if (!recordingId) return;

  const selectedOption = elements.savedRecordingsList.selectedOptions[0];
  const recordingName = selectedOption?.textContent || 'this recording';

  if (!confirm(`Delete "${recordingName}"? This cannot be undone.`)) {
    return;
  }

  try {
    const response = await sendMessage({ type: 'DELETE_NAMED_RECORDING', recordingId });
    if (response?.success) {
      await loadSavedRecordingsList();
      alert('Recording deleted!');
    } else {
      alert('Failed to delete recording');
    }
  } catch (error) {
    console.error('Failed to delete recording:', error);
    alert('Failed to delete recording');
  }
}

// Recording management event listeners
elements.saveBtn.addEventListener('click', saveCurrentRecording);
elements.loadBtn.addEventListener('click', loadSavedRecording);
elements.deleteBtn.addEventListener('click', deleteSavedRecording);
elements.savedRecordingsList.addEventListener('change', updateRecordingButtons);
elements.recordingName.addEventListener('input', () => {
  // Enable save button when there's a name and recording data
  const hasName = elements.recordingName.value.trim().length > 0;
  const hasData = parseInt(elements.actionCount.textContent) > 0;
  elements.saveBtn.disabled = !hasName || !hasData;
});

// Listen for state updates from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATE_UPDATE') {
    updateUIState(message.status);
    updateStats(message.stats || {});
  }
});

// Workflow management functions

/**
 * Loads and displays recent workflows
 */
async function loadRecentWorkflows() {
  try {
    const response = await sendMessage({ type: 'GET_WORKFLOWS' });
    const workflows = response?.workflows || [];

    if (workflows.length === 0) {
      elements.recentWorkflows.innerHTML = '<div class="workflow-empty">No workflows yet</div>';
      return;
    }

    // Sort by lastRun (most recent first), take top 3
    const recentWorkflows = workflows
      .sort((a, b) => (b.lastRun || b.savedAt || 0) - (a.lastRun || a.savedAt || 0))
      .slice(0, 3);

    elements.recentWorkflows.innerHTML = '';

    recentWorkflows.forEach(workflow => {
      const item = document.createElement('div');
      item.className = 'workflow-item';
      item.innerHTML = `
        <div class="workflow-item-info">
          <div class="workflow-item-name">${escapeHtml(workflow.name)}</div>
          <div class="workflow-item-meta">${workflow.actionCount} steps</div>
        </div>
        <button class="btn-workflow-run" data-id="${workflow.id}">Run</button>
      `;

      item.querySelector('.btn-workflow-run').addEventListener('click', (e) => {
        e.stopPropagation();
        runWorkflow(workflow.id);
      });

      item.addEventListener('click', () => {
        // Open workflows page with this workflow selected
        chrome.tabs.create({
          url: chrome.runtime.getURL('popup/workflows.html')
        });
      });

      elements.recentWorkflows.appendChild(item);
    });
  } catch (error) {
    console.error('Failed to load recent workflows:', error);
    elements.recentWorkflows.innerHTML = '<div class="workflow-empty">Failed to load workflows</div>';
  }
}

/**
 * Escapes HTML for safe display
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
 * Runs a workflow (opens workflows page for now)
 */
async function runWorkflow(workflowId) {
  // For now, just open the workflows page
  // Full implementation would show a modal or start replay directly
  chrome.tabs.create({
    url: chrome.runtime.getURL('popup/workflows.html')
  });
}

// Manage workflows button
elements.manageWorkflowsBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('popup/workflows.html')
  });
});

// AI Fill functions

/**
 * Loads clients for quick select dropdown
 */
async function loadClientsForQuickSelect() {
  try {
    const response = await sendMessage({ type: 'GET_CLIENTS' });
    const clients = response?.clients || [];

    // Clear existing options (keep first placeholder)
    while (elements.quickClientSelect.options.length > 1) {
      elements.quickClientSelect.remove(1);
    }

    // Add clients
    clients.forEach(client => {
      const option = document.createElement('option');
      option.value = client.id;
      const fullName = [client.firstName, client.lastName].filter(Boolean).join(' ');
      option.textContent = fullName;
      elements.quickClientSelect.appendChild(option);
    });

    // Update fill button state
    updateFillButtonState();
  } catch (error) {
    console.error('Failed to load clients:', error);
  }
}

/**
 * Updates fill button state based on client selection
 */
function updateFillButtonState() {
  const hasClient = elements.quickClientSelect.value !== '';
  elements.fillFormBtn.disabled = !hasClient;
}

/**
 * Fills form with selected client
 */
async function fillFormWithClient() {
  const clientId = elements.quickClientSelect.value;
  if (!clientId) {
    alert('Please select a client first');
    return;
  }

  try {
    // Check for API key first
    const settings = await sendMessage({ type: 'GET_AI_SETTINGS' });
    if (!settings.apiKey) {
      alert('Please configure your API key in Clients > Settings first.');
      chrome.tabs.create({
        url: chrome.runtime.getURL('popup/clients.html')
      });
      return;
    }

    // Close popup and trigger fill
    const response = await sendMessage({
      type: 'AI_FILL_FORM',
      clientId: clientId
    });

    if (response?.success) {
      window.close();
    } else {
      alert('Fill failed: ' + (response?.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Failed to fill form:', error);
    alert('Failed to fill form: ' + error.message);
  }
}

// AI Fill event listeners
elements.clientsBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('popup/clients.html')
  });
});

elements.fillFormBtn.addEventListener('click', fillFormWithClient);
elements.quickClientSelect.addEventListener('change', updateFillButtonState);

// Initialize on popup open
loadSettings();
initializeState();
loadSavedRecordingsList();
loadRecentWorkflows();
loadClientsForQuickSelect();
