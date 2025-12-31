/**
 * FormGhost - Replay Overlay
 * Visual feedback during workflow replay
 */

const FormGhostReplayOverlay = {
  overlayContainer: null,
  highlightBox: null,
  confirmationModal: null,
  takeoverModal: null,
  progressBar: null,
  pausedIndicator: null,
  stylesInjected: false,

  /**
   * Initializes the overlay system
   */
  init() {
    if (this.overlayContainer) return;

    this.createOverlayContainer();
    this.injectStyles();
  },

  /**
   * Creates the main overlay container
   */
  createOverlayContainer() {
    if (document.getElementById('formghost-replay-overlay')) {
      this.overlayContainer = document.getElementById('formghost-replay-overlay');
      return;
    }

    this.overlayContainer = document.createElement('div');
    this.overlayContainer.id = 'formghost-replay-overlay';
    document.body.appendChild(this.overlayContainer);
  },

  /**
   * Highlights an element during replay
   * @param {Element} element - Element to highlight
   * @param {number} duration - Highlight duration in ms
   */
  async highlightElement(element, duration = 500) {
    if (!element) return;
    this.init();

    if (!this.highlightBox) {
      this.highlightBox = document.createElement('div');
      this.highlightBox.className = 'fg-highlight-box';
      this.overlayContainer.appendChild(this.highlightBox);
    }

    const rect = element.getBoundingClientRect();
    Object.assign(this.highlightBox.style, {
      display: 'block',
      top: `${rect.top + window.scrollY - 4}px`,
      left: `${rect.left + window.scrollX - 4}px`,
      width: `${rect.width + 8}px`,
      height: `${rect.height + 8}px`
    });

    await new Promise(resolve => setTimeout(resolve, duration));
    this.highlightBox.style.display = 'none';
  },

  /**
   * Shows the progress bar
   * @param {number} current - Current step index
   * @param {number} total - Total steps
   * @param {Object} stepInfo - Current step info
   */
  showProgress(current, total, stepInfo) {
    this.init();

    if (!this.progressBar) {
      this.createProgressBar();
    }

    const percent = ((current + 1) / total) * 100;
    this.progressBar.querySelector('.fg-progress-fill').style.width = `${percent}%`;
    this.progressBar.querySelector('.fg-progress-text').textContent =
      `Step ${current + 1} of ${total}`;

    const stepLabel = stepInfo?.element?.humanLabel || stepInfo?.type || '';
    this.progressBar.querySelector('.fg-progress-step').textContent =
      stepLabel.substring(0, 50) + (stepLabel.length > 50 ? '...' : '');

    this.progressBar.style.display = 'block';
  },

  /**
   * Hides the progress bar
   */
  hideProgress() {
    if (this.progressBar) {
      this.progressBar.style.display = 'none';
    }
  },

  /**
   * Creates the progress bar element
   */
  createProgressBar() {
    this.progressBar = document.createElement('div');
    this.progressBar.className = 'fg-progress-bar';
    this.progressBar.innerHTML = `
      <div class="fg-progress-header">
        <span class="fg-progress-logo">FormGhost</span>
        <div class="fg-progress-controls">
          <button class="fg-btn-icon fg-pause-btn" title="Pause">&#10074;&#10074;</button>
          <button class="fg-btn-icon fg-cancel-btn" title="Cancel">&times;</button>
        </div>
      </div>
      <div class="fg-progress-track">
        <div class="fg-progress-fill"></div>
      </div>
      <div class="fg-progress-info">
        <span class="fg-progress-text">Step 0 of 0</span>
        <span class="fg-progress-step"></span>
      </div>
    `;

    // Add event listeners
    this.progressBar.querySelector('.fg-pause-btn').onclick = () => {
      if (window.FormGhostReplayer) {
        if (window.FormGhostReplayer.state.isPaused) {
          window.FormGhostReplayer.resume();
        } else {
          window.FormGhostReplayer.pause();
        }
      }
    };

    this.progressBar.querySelector('.fg-cancel-btn').onclick = () => {
      if (window.FormGhostReplayer) {
        window.FormGhostReplayer.cancel();
      }
    };

    this.overlayContainer.appendChild(this.progressBar);
  },

  /**
   * Shows pause-before-execute confirmation
   * @param {Element} element - Element about to be acted on
   * @param {Object} step - Step info
   * @param {Object} callbacks - Callback functions
   */
  showConfirmation(element, step, callbacks) {
    this.init();

    if (!this.confirmationModal) {
      this.createConfirmationModal();
    }

    // Highlight the element
    if (element) {
      const rect = element.getBoundingClientRect();
      if (!this.highlightBox) {
        this.highlightBox = document.createElement('div');
        this.highlightBox.className = 'fg-highlight-box';
        this.overlayContainer.appendChild(this.highlightBox);
      }
      Object.assign(this.highlightBox.style, {
        display: 'block',
        top: `${rect.top + window.scrollY - 4}px`,
        left: `${rect.left + window.scrollX - 4}px`,
        width: `${rect.width + 8}px`,
        height: `${rect.height + 8}px`
      });
    }

    // Update modal content
    const label = step.element?.humanLabel || step.type;
    const actionText = this.getActionText(step.type);
    this.confirmationModal.querySelector('.fg-confirm-step').textContent =
      `About to ${actionText}: "${label}"`;

    // Show modal
    this.confirmationModal.style.display = 'flex';

    // Bind callbacks
    const continueBtn = this.confirmationModal.querySelector('.fg-continue-btn');
    const cancelBtn = this.confirmationModal.querySelector('.fg-cancel-btn');
    const takeoverBtn = this.confirmationModal.querySelector('.fg-takeover-btn');

    const cleanup = () => {
      this.confirmationModal.style.display = 'none';
      if (this.highlightBox) this.highlightBox.style.display = 'none';
    };

    continueBtn.onclick = () => { cleanup(); callbacks.onContinue?.(); };
    cancelBtn.onclick = () => { cleanup(); callbacks.onCancel?.(); };
    takeoverBtn.onclick = () => { cleanup(); callbacks.onTakeOver?.(); };
  },

  /**
   * Creates the confirmation modal
   */
  createConfirmationModal() {
    this.confirmationModal = document.createElement('div');
    this.confirmationModal.className = 'fg-modal-overlay';
    this.confirmationModal.innerHTML = `
      <div class="fg-modal-content">
        <div class="fg-modal-header">
          <span class="fg-modal-icon">&#9888;</span>
          <span class="fg-modal-title">Pause Before Execute</span>
        </div>
        <p class="fg-confirm-step">About to execute step...</p>
        <div class="fg-modal-actions">
          <button class="fg-btn fg-continue-btn">Continue</button>
          <button class="fg-btn fg-takeover-btn">Take Over</button>
          <button class="fg-btn fg-cancel-btn">Cancel</button>
        </div>
      </div>
    `;
    this.overlayContainer.appendChild(this.confirmationModal);
  },

  /**
   * Shows takeover prompt when element not found or user intervention needed
   * @param {Object} step - The problematic step
   * @param {string} reason - Why takeover is needed
   * @param {Object} callbacks - Callback functions
   */
  showTakeoverPrompt(step, reason, callbacks) {
    this.init();

    if (!this.takeoverModal) {
      this.createTakeoverModal();
    }

    const label = step.element?.humanLabel || step.type;

    this.takeoverModal.querySelector('.fg-takeover-reason').textContent = reason;
    this.takeoverModal.querySelector('.fg-takeover-step').textContent =
      `Step: ${step.type} - "${label}"`;

    this.takeoverModal.style.display = 'flex';

    const takeoverBtn = this.takeoverModal.querySelector('.fg-do-takeover-btn');
    const skipBtn = this.takeoverModal.querySelector('.fg-skip-btn');
    const cancelBtn = this.takeoverModal.querySelector('.fg-cancel-all-btn');

    const cleanup = () => {
      this.takeoverModal.style.display = 'none';
    };

    takeoverBtn.onclick = () => { cleanup(); callbacks.onTakeOver?.(); };
    skipBtn.onclick = () => { cleanup(); callbacks.onSkip?.(); };
    cancelBtn.onclick = () => { cleanup(); callbacks.onCancel?.(); };
  },

  /**
   * Creates the takeover modal
   */
  createTakeoverModal() {
    this.takeoverModal = document.createElement('div');
    this.takeoverModal.className = 'fg-modal-overlay';
    this.takeoverModal.innerHTML = `
      <div class="fg-modal-content fg-takeover-content">
        <div class="fg-modal-header">
          <span class="fg-modal-icon fg-icon-warning">&#9888;</span>
          <span class="fg-modal-title">Manual Action Required</span>
        </div>
        <p class="fg-takeover-reason">Element not found</p>
        <p class="fg-takeover-step">Step: ...</p>
        <div class="fg-modal-actions">
          <button class="fg-btn fg-do-takeover-btn">Complete Manually</button>
          <button class="fg-btn fg-skip-btn">Skip This Step</button>
          <button class="fg-btn fg-cancel-all-btn">Cancel Replay</button>
        </div>
      </div>
    `;
    this.overlayContainer.appendChild(this.takeoverModal);
  },

  /**
   * Shows takeover mode UI (user is completing step manually)
   * @param {Object} step - The step being completed manually
   * @param {Object} callbacks - Callback functions
   */
  async showTakeoverMode(step, callbacks) {
    this.init();

    const banner = document.createElement('div');
    banner.className = 'fg-takeover-banner';
    banner.innerHTML = `
      <div class="fg-takeover-banner-content">
        <span class="fg-takeover-banner-text">
          Manual mode: Complete "${step.element?.humanLabel || step.type}" then click Continue
        </span>
        <div class="fg-takeover-banner-actions">
          <button class="fg-btn fg-complete-takeover-btn">Continue</button>
          <button class="fg-btn fg-cancel-takeover-btn">Cancel</button>
        </div>
      </div>
    `;

    this.overlayContainer.appendChild(banner);

    return new Promise((resolve) => {
      banner.querySelector('.fg-complete-takeover-btn').onclick = () => {
        banner.remove();
        callbacks.onComplete?.();
        resolve();
      };

      banner.querySelector('.fg-cancel-takeover-btn').onclick = () => {
        banner.remove();
        callbacks.onCancel?.();
        resolve();
      };
    });
  },

  /**
   * Shows paused indicator
   */
  showPaused() {
    this.init();

    if (!this.pausedIndicator) {
      this.pausedIndicator = document.createElement('div');
      this.pausedIndicator.className = 'fg-paused-indicator';
      this.pausedIndicator.innerHTML = `
        <span class="fg-paused-icon">&#10074;&#10074;</span>
        <span class="fg-paused-text">Paused</span>
        <button class="fg-btn fg-resume-btn">Resume</button>
      `;

      this.pausedIndicator.querySelector('.fg-resume-btn').onclick = () => {
        if (window.FormGhostReplayer) {
          window.FormGhostReplayer.resume();
        }
      };

      this.overlayContainer.appendChild(this.pausedIndicator);
    }

    // Update pause button in progress bar
    if (this.progressBar) {
      const pauseBtn = this.progressBar.querySelector('.fg-pause-btn');
      pauseBtn.innerHTML = '&#9654;'; // Play icon
      pauseBtn.title = 'Resume';
    }

    this.pausedIndicator.style.display = 'flex';
  },

  /**
   * Hides paused indicator
   */
  hidePaused() {
    if (this.pausedIndicator) {
      this.pausedIndicator.style.display = 'none';
    }

    // Update pause button in progress bar
    if (this.progressBar) {
      const pauseBtn = this.progressBar.querySelector('.fg-pause-btn');
      pauseBtn.innerHTML = '&#10074;&#10074;'; // Pause icon
      pauseBtn.title = 'Pause';
    }
  },

  /**
   * Hides all overlay elements
   */
  hideAll() {
    if (this.highlightBox) this.highlightBox.style.display = 'none';
    if (this.confirmationModal) this.confirmationModal.style.display = 'none';
    if (this.takeoverModal) this.takeoverModal.style.display = 'none';
    if (this.progressBar) this.progressBar.style.display = 'none';
    if (this.pausedIndicator) this.pausedIndicator.style.display = 'none';

    // Remove any takeover banners
    const banners = this.overlayContainer?.querySelectorAll('.fg-takeover-banner');
    banners?.forEach(b => b.remove());
  },

  /**
   * Gets human-readable action text
   * @param {string} type - Action type
   * @returns {string}
   */
  getActionText(type) {
    const actionTexts = {
      click: 'click',
      dblclick: 'double-click',
      type: 'type in',
      keypress: 'press key',
      select: 'select from',
      scroll: 'scroll',
      hover: 'hover over',
      navigate: 'navigate to',
      submit: 'submit',
      drag: 'drag'
    };
    return actionTexts[type] || type;
  },

  /**
   * Injects CSS styles
   */
  injectStyles() {
    if (this.stylesInjected) return;
    if (document.getElementById('formghost-overlay-styles')) {
      this.stylesInjected = true;
      return;
    }

    const styles = document.createElement('style');
    styles.id = 'formghost-overlay-styles';
    styles.textContent = `
      #formghost-replay-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 2147483646;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      /* Highlight Box */
      .fg-highlight-box {
        position: absolute;
        border: 3px solid #00d9ff;
        border-radius: 4px;
        background: rgba(0, 217, 255, 0.1);
        box-shadow: 0 0 20px rgba(0, 217, 255, 0.4);
        animation: fg-pulse 1s infinite;
        pointer-events: none;
        display: none;
      }

      @keyframes fg-pulse {
        0%, 100% { opacity: 1; box-shadow: 0 0 20px rgba(0, 217, 255, 0.4); }
        50% { opacity: 0.7; box-shadow: 0 0 30px rgba(0, 217, 255, 0.6); }
      }

      /* Progress Bar */
      .fg-progress-bar {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 12px;
        padding: 16px 20px;
        min-width: 320px;
        max-width: 400px;
        pointer-events: all;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.1);
        display: none;
      }

      .fg-progress-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }

      .fg-progress-logo {
        font-size: 14px;
        font-weight: 600;
        color: #00d9ff;
        letter-spacing: 0.5px;
      }

      .fg-progress-controls {
        display: flex;
        gap: 8px;
      }

      .fg-btn-icon {
        background: rgba(255, 255, 255, 0.1);
        border: none;
        color: #e0e0e0;
        width: 28px;
        height: 28px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
      }

      .fg-btn-icon:hover {
        background: rgba(255, 255, 255, 0.2);
      }

      .fg-progress-track {
        height: 6px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
        overflow: hidden;
      }

      .fg-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #00d9ff 0%, #00ff88 100%);
        border-radius: 3px;
        transition: width 0.3s ease;
      }

      .fg-progress-info {
        display: flex;
        justify-content: space-between;
        margin-top: 10px;
        font-size: 12px;
      }

      .fg-progress-text {
        color: #e0e0e0;
      }

      .fg-progress-step {
        color: #7a7a9a;
        max-width: 180px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* Modal Overlay */
      .fg-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.75);
        display: none;
        align-items: center;
        justify-content: center;
        pointer-events: all;
      }

      .fg-modal-content {
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 16px;
        padding: 28px;
        max-width: 420px;
        width: 90%;
        color: #e0e0e0;
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }

      .fg-modal-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 20px;
      }

      .fg-modal-icon {
        font-size: 28px;
        color: #f4a261;
      }

      .fg-icon-warning {
        color: #e63946;
      }

      .fg-modal-title {
        font-size: 18px;
        font-weight: 600;
        color: #ffffff;
      }

      .fg-confirm-step,
      .fg-takeover-reason,
      .fg-takeover-step {
        color: #a0a0b8;
        margin-bottom: 12px;
        line-height: 1.5;
      }

      .fg-takeover-reason {
        color: #f4a261;
        font-weight: 500;
      }

      .fg-modal-actions {
        display: flex;
        gap: 12px;
        margin-top: 24px;
        flex-wrap: wrap;
      }

      .fg-btn {
        padding: 12px 20px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 500;
        font-size: 14px;
        transition: all 0.2s;
        flex: 1;
        min-width: 100px;
      }

      .fg-continue-btn,
      .fg-do-takeover-btn,
      .fg-complete-takeover-btn {
        background: linear-gradient(135deg, #00d9ff 0%, #00b8d4 100%);
        color: #1a1a2e;
      }

      .fg-continue-btn:hover,
      .fg-do-takeover-btn:hover,
      .fg-complete-takeover-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 217, 255, 0.3);
      }

      .fg-cancel-btn,
      .fg-cancel-all-btn,
      .fg-cancel-takeover-btn {
        background: rgba(230, 57, 70, 0.2);
        color: #e63946;
        border: 1px solid rgba(230, 57, 70, 0.3);
      }

      .fg-cancel-btn:hover,
      .fg-cancel-all-btn:hover,
      .fg-cancel-takeover-btn:hover {
        background: rgba(230, 57, 70, 0.3);
      }

      .fg-takeover-btn,
      .fg-skip-btn {
        background: rgba(255, 255, 255, 0.1);
        color: #e0e0e0;
        border: 1px solid rgba(255, 255, 255, 0.2);
      }

      .fg-takeover-btn:hover,
      .fg-skip-btn:hover {
        background: rgba(255, 255, 255, 0.2);
      }

      .fg-resume-btn {
        background: linear-gradient(135deg, #00ff88 0%, #00d968 100%);
        color: #1a1a2e;
        padding: 8px 16px;
      }

      /* Takeover Banner */
      .fg-takeover-banner {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: linear-gradient(135deg, #f4a261 0%, #e76f51 100%);
        color: #1a1a2e;
        padding: 12px 20px;
        pointer-events: all;
        z-index: 2147483647;
      }

      .fg-takeover-banner-content {
        display: flex;
        justify-content: space-between;
        align-items: center;
        max-width: 800px;
        margin: 0 auto;
      }

      .fg-takeover-banner-text {
        font-weight: 500;
      }

      .fg-takeover-banner-actions {
        display: flex;
        gap: 12px;
      }

      /* Paused Indicator */
      .fg-paused-indicator {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        border-radius: 16px;
        padding: 32px 48px;
        display: none;
        align-items: center;
        gap: 16px;
        pointer-events: all;
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }

      .fg-paused-icon {
        font-size: 24px;
        color: #f4a261;
      }

      .fg-paused-text {
        font-size: 18px;
        font-weight: 600;
        color: #e0e0e0;
      }
    `;
    document.head.appendChild(styles);
    this.stylesInjected = true;
  }
};

// Initialize and expose
window.FormGhostReplayOverlay = FormGhostReplayOverlay;

console.log('FormGhost Overlay: Content script loaded');
