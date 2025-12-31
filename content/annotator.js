/**
 * Puppeteer Recorder Pro - Annotator
 * Floating UI for adding timestamped annotations during recording
 */

/**
 * Annotator state
 */
const AnnotatorState = {
  isVisible: false,
  isPaused: false,
  container: null,
  button: null,
  modal: null
};

/**
 * CSS styles for the annotator UI
 */
const ANNOTATOR_STYLES = `
  .puppeteer-recorder-annotate {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .puppeteer-recorder-annotate-btn {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: none;
    background: linear-gradient(135deg, #e63946 0%, #c1121f 100%);
    color: white;
    font-size: 20px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(230, 57, 70, 0.4);
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .puppeteer-recorder-annotate-btn:hover {
    transform: scale(1.1);
    box-shadow: 0 6px 16px rgba(230, 57, 70, 0.5);
  }

  .puppeteer-recorder-annotate-btn.paused {
    background: linear-gradient(135deg, #f4a261 0%, #e76f51 100%);
    box-shadow: 0 4px 12px rgba(244, 162, 97, 0.4);
  }

  .puppeteer-recorder-annotate-btn.paused:hover {
    box-shadow: 0 6px 16px rgba(244, 162, 97, 0.5);
  }

  .puppeteer-recorder-recording-indicator {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #e63946;
    border: 2px solid white;
    animation: pulse-indicator 1.5s infinite;
  }

  .puppeteer-recorder-annotate-btn.paused .puppeteer-recorder-recording-indicator {
    background: #f4a261;
    animation: none;
  }

  @keyframes pulse-indicator {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.7; transform: scale(0.9); }
  }

  .puppeteer-recorder-modal {
    position: fixed;
    bottom: 80px;
    right: 20px;
    width: 300px;
    background: #1a1a2e;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    z-index: 2147483647;
    overflow: hidden;
    display: none;
  }

  .puppeteer-recorder-modal.visible {
    display: block;
    animation: slideUp 0.2s ease;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .puppeteer-recorder-modal-header {
    padding: 12px 16px;
    background: #16213e;
    border-bottom: 1px solid #2d2d44;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .puppeteer-recorder-modal-title {
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    margin: 0;
  }

  .puppeteer-recorder-modal-close {
    background: none;
    border: none;
    color: #7a7a9a;
    font-size: 18px;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }

  .puppeteer-recorder-modal-close:hover {
    background: #2d2d44;
    color: #fff;
  }

  .puppeteer-recorder-modal-body {
    padding: 16px;
  }

  .puppeteer-recorder-textarea {
    width: 100%;
    height: 80px;
    background: #16213e;
    border: 1px solid #2d2d44;
    border-radius: 8px;
    color: #e0e0e0;
    font-size: 13px;
    padding: 10px;
    resize: none;
    font-family: inherit;
  }

  .puppeteer-recorder-textarea:focus {
    outline: none;
    border-color: #00d9ff;
  }

  .puppeteer-recorder-textarea::placeholder {
    color: #7a7a9a;
  }

  .puppeteer-recorder-modal-footer {
    padding: 12px 16px;
    border-top: 1px solid #2d2d44;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .puppeteer-recorder-btn {
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
  }

  .puppeteer-recorder-btn-cancel {
    background: transparent;
    color: #7a7a9a;
    border: 1px solid #4a4a6a;
  }

  .puppeteer-recorder-btn-cancel:hover {
    background: #2d2d44;
    color: #e0e0e0;
  }

  .puppeteer-recorder-btn-save {
    background: #00d9ff;
    color: #1a1a2e;
  }

  .puppeteer-recorder-btn-save:hover {
    background: #00b8d9;
  }

  .puppeteer-recorder-btn-save:disabled {
    background: #4a4a6a;
    color: #7a7a9a;
    cursor: not-allowed;
  }
`;

/**
 * Creates the annotator UI elements
 */
function createAnnotatorUI() {
  // Inject styles
  const styleEl = document.createElement('style');
  styleEl.textContent = ANNOTATOR_STYLES;
  document.head.appendChild(styleEl);

  // Create container
  const container = document.createElement('div');
  container.className = 'puppeteer-recorder-annotate';
  container.setAttribute('data-recorder-ignore', 'true');

  // Create floating button
  const button = document.createElement('button');
  button.className = 'puppeteer-recorder-annotate-btn';
  button.innerHTML = `
    <span>&#9998;</span>
    <span class="puppeteer-recorder-recording-indicator"></span>
  `;
  button.title = 'Add annotation';

  // Create modal
  const modal = document.createElement('div');
  modal.className = 'puppeteer-recorder-modal';
  modal.innerHTML = `
    <div class="puppeteer-recorder-modal-header">
      <h3 class="puppeteer-recorder-modal-title">Add Annotation</h3>
      <button class="puppeteer-recorder-modal-close">&times;</button>
    </div>
    <div class="puppeteer-recorder-modal-body">
      <textarea
        class="puppeteer-recorder-textarea"
        placeholder="Enter your note... (e.g., 'Results take 2-3 seconds to load')"
      ></textarea>
    </div>
    <div class="puppeteer-recorder-modal-footer">
      <button class="puppeteer-recorder-btn puppeteer-recorder-btn-cancel">Cancel</button>
      <button class="puppeteer-recorder-btn puppeteer-recorder-btn-save" disabled>Save</button>
    </div>
  `;

  container.appendChild(button);
  container.appendChild(modal);

  // Store references
  AnnotatorState.container = container;
  AnnotatorState.button = button;
  AnnotatorState.modal = modal;

  // Set up event listeners
  setupEventListeners();

  return container;
}

/**
 * Sets up event listeners for the annotator
 */
function setupEventListeners() {
  const { button, modal } = AnnotatorState;

  const textarea = modal.querySelector('.puppeteer-recorder-textarea');
  const closeBtn = modal.querySelector('.puppeteer-recorder-modal-close');
  const cancelBtn = modal.querySelector('.puppeteer-recorder-btn-cancel');
  const saveBtn = modal.querySelector('.puppeteer-recorder-btn-save');

  // Toggle modal on button click
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleModal();
  });

  // Close modal handlers
  closeBtn.addEventListener('click', () => hideModal());
  cancelBtn.addEventListener('click', () => hideModal());

  // Enable/disable save button based on input
  textarea.addEventListener('input', () => {
    saveBtn.disabled = textarea.value.trim().length === 0;
  });

  // Save annotation
  saveBtn.addEventListener('click', () => {
    const note = textarea.value.trim();
    if (note) {
      saveAnnotation(note);
      textarea.value = '';
      saveBtn.disabled = true;
      hideModal();
    }
  });

  // Handle Enter key in textarea (Ctrl/Cmd + Enter to save)
  textarea.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      const note = textarea.value.trim();
      if (note) {
        saveAnnotation(note);
        textarea.value = '';
        saveBtn.disabled = true;
        hideModal();
      }
    }
    if (e.key === 'Escape') {
      hideModal();
    }
  });

  // Close modal when clicking outside
  document.addEventListener('click', (e) => {
    if (modal.classList.contains('visible') &&
        !modal.contains(e.target) &&
        !button.contains(e.target)) {
      hideModal();
    }
  });
}

/**
 * Toggles modal visibility
 */
function toggleModal() {
  const { modal } = AnnotatorState;
  if (modal.classList.contains('visible')) {
    hideModal();
  } else {
    showModal();
  }
}

/**
 * Shows the annotation modal
 */
function showModal() {
  const { modal } = AnnotatorState;
  modal.classList.add('visible');
  const textarea = modal.querySelector('.puppeteer-recorder-textarea');
  setTimeout(() => textarea.focus(), 100);
}

/**
 * Hides the annotation modal
 */
function hideModal() {
  const { modal } = AnnotatorState;
  modal.classList.remove('visible');
}

/**
 * Saves annotation via background script
 * @param {string} note - Annotation text
 */
function saveAnnotation(note) {
  chrome.runtime.sendMessage({
    type: 'ADD_ANNOTATION',
    note
  }).catch(err => {
    console.warn('Failed to save annotation:', err);
  });
}

/**
 * Shows the annotator UI
 */
function show() {
  if (!AnnotatorState.container) {
    createAnnotatorUI();
  }

  if (!document.body.contains(AnnotatorState.container)) {
    document.body.appendChild(AnnotatorState.container);
  }

  AnnotatorState.container.style.display = 'block';
  AnnotatorState.isVisible = true;
  AnnotatorState.isPaused = false;
  AnnotatorState.button.classList.remove('paused');
}

/**
 * Hides the annotator UI
 */
function hide() {
  if (AnnotatorState.container) {
    AnnotatorState.container.style.display = 'none';
  }
  hideModal();
  AnnotatorState.isVisible = false;
}

/**
 * Updates UI for paused state
 */
function pause() {
  AnnotatorState.isPaused = true;
  if (AnnotatorState.button) {
    AnnotatorState.button.classList.add('paused');
    AnnotatorState.button.title = 'Recording paused - Add annotation';
  }
}

/**
 * Updates UI for resumed state
 */
function resume() {
  AnnotatorState.isPaused = false;
  if (AnnotatorState.button) {
    AnnotatorState.button.classList.remove('paused');
    AnnotatorState.button.title = 'Add annotation';
  }
}

/**
 * Destroys the annotator UI
 */
function destroy() {
  if (AnnotatorState.container && document.body.contains(AnnotatorState.container)) {
    document.body.removeChild(AnnotatorState.container);
  }
  AnnotatorState.container = null;
  AnnotatorState.button = null;
  AnnotatorState.modal = null;
  AnnotatorState.isVisible = false;
}

// Expose to global scope
window.PuppeteerRecorderAnnotator = {
  show,
  hide,
  pause,
  resume,
  destroy,
  isVisible: () => AnnotatorState.isVisible
};
