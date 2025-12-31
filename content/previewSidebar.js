/**
 * Puppeteer Recorder Pro - Live Preview Sidebar
 * Shows recorded actions in real-time during recording
 */

const PreviewSidebar = {
  sidebar: null,
  actionsList: null,
  isVisible: false,
  isMinimized: false,
  actionCount: 0,

  /**
   * Creates the sidebar DOM structure
   */
  createSidebar() {
    if (this.sidebar) return;
    if (!document.body) return; // Safety check

    // Create sidebar container
    this.sidebar = document.createElement('div');
    this.sidebar.id = 'puppeteer-recorder-sidebar';
    this.sidebar.innerHTML = `
      <div class="prp-sidebar-header">
        <span class="prp-sidebar-title">Recording Preview</span>
        <div class="prp-sidebar-controls">
          <button class="prp-sidebar-btn prp-minimize-btn" title="Minimize">&#8722;</button>
          <button class="prp-sidebar-btn prp-close-btn" title="Close">&#10005;</button>
        </div>
      </div>
      <div class="prp-sidebar-stats">
        <span class="prp-stat">Actions: <strong id="prp-action-count">0</strong></span>
        <span class="prp-stat prp-recording-dot">&#9679;</span>
      </div>
      <div class="prp-sidebar-content">
        <ul class="prp-actions-list" id="prp-actions-list"></ul>
      </div>
      <div class="prp-sidebar-footer">
        <button class="prp-clear-btn" id="prp-clear-preview">Clear</button>
      </div>
    `;

    // Apply styles
    this.injectStyles();

    // Add event listeners
    this.sidebar.querySelector('.prp-minimize-btn').addEventListener('click', () => this.toggleMinimize());
    this.sidebar.querySelector('.prp-close-btn').addEventListener('click', () => this.hide());
    this.sidebar.querySelector('#prp-clear-preview').addEventListener('click', () => this.clearActions());

    // Make sidebar draggable
    this.makeDraggable();

    document.body.appendChild(this.sidebar);
    this.actionsList = this.sidebar.querySelector('#prp-actions-list');
  },

  /**
   * Injects styles for the sidebar
   */
  injectStyles() {
    if (document.getElementById('prp-sidebar-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'prp-sidebar-styles';
    styles.textContent = `
      #puppeteer-recorder-sidebar {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 320px;
        max-height: 500px;
        background: #1a1a2e;
        border: 1px solid #2d2d44;
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        color: #e0e0e0;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transition: all 0.2s ease;
      }

      #puppeteer-recorder-sidebar.prp-minimized {
        max-height: 40px;
      }

      #puppeteer-recorder-sidebar.prp-minimized .prp-sidebar-content,
      #puppeteer-recorder-sidebar.prp-minimized .prp-sidebar-footer,
      #puppeteer-recorder-sidebar.prp-minimized .prp-sidebar-stats {
        display: none;
      }

      .prp-sidebar-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 12px;
        background: #16213e;
        border-bottom: 1px solid #2d2d44;
        cursor: move;
      }

      .prp-sidebar-title {
        font-weight: 600;
        color: #00d9ff;
        font-size: 13px;
      }

      .prp-sidebar-controls {
        display: flex;
        gap: 6px;
      }

      .prp-sidebar-btn {
        background: none;
        border: none;
        color: #7a7a9a;
        cursor: pointer;
        padding: 2px 6px;
        font-size: 14px;
        border-radius: 4px;
        transition: all 0.2s;
      }

      .prp-sidebar-btn:hover {
        background: #2d2d44;
        color: #e0e0e0;
      }

      .prp-sidebar-stats {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: #16213e;
        border-bottom: 1px solid #2d2d44;
      }

      .prp-stat {
        color: #7a7a9a;
      }

      .prp-stat strong {
        color: #00d9ff;
      }

      .prp-recording-dot {
        color: #e63946;
        animation: prp-pulse 1.5s infinite;
      }

      @keyframes prp-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }

      .prp-sidebar-content {
        flex: 1;
        overflow-y: auto;
        max-height: 350px;
      }

      .prp-actions-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .prp-action-item {
        padding: 8px 12px;
        border-bottom: 1px solid #2d2d44;
        display: flex;
        gap: 8px;
        align-items: flex-start;
        animation: prp-slideIn 0.2s ease;
      }

      @keyframes prp-slideIn {
        from {
          opacity: 0;
          transform: translateX(20px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      .prp-action-item:hover {
        background: #16213e;
      }

      .prp-action-icon {
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        font-size: 11px;
        flex-shrink: 0;
      }

      .prp-action-icon.click { background: #e63946; }
      .prp-action-icon.type { background: #2a9d8f; }
      .prp-action-icon.navigate { background: #e9c46a; color: #1a1a2e; }
      .prp-action-icon.scroll { background: #264653; }
      .prp-action-icon.keypress { background: #f4a261; color: #1a1a2e; }
      .prp-action-icon.select { background: #9b5de5; }
      .prp-action-icon.hover { background: #457b9d; }
      .prp-action-icon.drag { background: #fb8500; color: #1a1a2e; }
      .prp-action-icon.upload { background: #06d6a0; color: #1a1a2e; }
      .prp-action-icon.tab { background: #118ab2; }
      .prp-action-icon.assert { background: #10b981; }

      .prp-action-details {
        flex: 1;
        min-width: 0;
      }

      .prp-action-type {
        font-weight: 600;
        color: #e0e0e0;
        text-transform: capitalize;
      }

      .prp-action-label {
        color: #7a7a9a;
        font-size: 11px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 240px;
      }

      .prp-action-time {
        color: #4a4a6a;
        font-size: 10px;
        flex-shrink: 0;
      }

      .prp-sidebar-footer {
        padding: 8px 12px;
        border-top: 1px solid #2d2d44;
        background: #16213e;
      }

      .prp-clear-btn {
        width: 100%;
        padding: 6px 12px;
        background: #2d2d44;
        border: none;
        border-radius: 4px;
        color: #7a7a9a;
        cursor: pointer;
        font-size: 11px;
        transition: all 0.2s;
      }

      .prp-clear-btn:hover {
        background: #4a4a6a;
        color: #e0e0e0;
      }

      .prp-sidebar-content::-webkit-scrollbar {
        width: 6px;
      }

      .prp-sidebar-content::-webkit-scrollbar-track {
        background: #1a1a2e;
      }

      .prp-sidebar-content::-webkit-scrollbar-thumb {
        background: #4a4a6a;
        border-radius: 3px;
      }

      .prp-empty-state {
        padding: 30px;
        text-align: center;
        color: #4a4a6a;
      }
    `;
    document.head.appendChild(styles);
  },

  /**
   * Makes the sidebar draggable by its header
   */
  makeDraggable() {
    const header = this.sidebar.querySelector('.prp-sidebar-header');
    let isDragging = false;
    let offsetX, offsetY;

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.prp-sidebar-btn')) return;
      isDragging = true;
      offsetX = e.clientX - this.sidebar.offsetLeft;
      offsetY = e.clientY - this.sidebar.offsetTop;
      this.sidebar.style.transition = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const x = Math.max(0, Math.min(window.innerWidth - this.sidebar.offsetWidth, e.clientX - offsetX));
      const y = Math.max(0, Math.min(window.innerHeight - this.sidebar.offsetHeight, e.clientY - offsetY));
      this.sidebar.style.left = x + 'px';
      this.sidebar.style.right = 'auto';
      this.sidebar.style.top = y + 'px';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
      this.sidebar.style.transition = 'all 0.2s ease';
    });
  },

  /**
   * Shows the sidebar
   */
  show() {
    if (!document.body) return; // Safety check
    if (!this.sidebar) this.createSidebar();
    if (!this.sidebar) return; // Creation failed
    this.sidebar.style.display = 'flex';
    this.isVisible = true;
  },

  /**
   * Hides the sidebar
   */
  hide() {
    if (this.sidebar) {
      this.sidebar.style.display = 'none';
    }
    this.isVisible = false;
  },

  /**
   * Toggles minimize state
   */
  toggleMinimize() {
    if (!this.sidebar) return;
    this.isMinimized = !this.isMinimized;
    this.sidebar.classList.toggle('prp-minimized', this.isMinimized);
    const btn = this.sidebar.querySelector('.prp-minimize-btn');
    btn.innerHTML = this.isMinimized ? '&#43;' : '&#8722;';
  },

  /**
   * Gets the icon for an action type
   */
  getActionIcon(type) {
    const icons = {
      click: '&#128433;', // pointer
      dblclick: '&#128432;', // double pointer
      type: '&#9000;', // keyboard
      navigate: '&#10140;', // arrow
      scroll: '&#8597;', // up-down
      keypress: '&#8984;', // key
      select: '&#9660;', // dropdown
      hover: '&#128065;', // eye
      drag: '&#8644;', // drag
      fileUpload: '&#128206;', // file
      newTab: '&#43;', // plus
      switchTab: '&#8644;', // switch
      closeTab: '&#10005;', // close
      assertion: '&#10003;' // check
    };
    return icons[type] || '&#9654;';
  },

  /**
   * Gets CSS class for action type
   */
  getActionClass(type) {
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
      fileUpload: 'upload',
      newTab: 'tab',
      switchTab: 'tab',
      closeTab: 'tab',
      assertion: 'assert'
    };
    return classes[type] || 'click';
  },

  /**
   * Adds an action to the preview
   */
  addAction(action) {
    if (!this.actionsList) return;

    this.actionCount++;
    const countEl = this.sidebar.querySelector('#prp-action-count');
    if (countEl) countEl.textContent = this.actionCount;

    // Remove empty state if present
    const emptyState = this.actionsList.querySelector('.prp-empty-state');
    if (emptyState) emptyState.remove();

    const li = document.createElement('li');
    li.className = 'prp-action-item';
    li.dataset.actionId = action.id;

    const label = action.element?.humanLabel || action.value || action.context?.url || action.type;
    const truncatedLabel = label?.length > 40 ? label.substring(0, 37) + '...' : label;
    const time = new Date(action.timestamp).toLocaleTimeString();

    li.innerHTML = `
      <span class="prp-action-icon ${this.getActionClass(action.type)}">${this.getActionIcon(action.type)}</span>
      <div class="prp-action-details">
        <div class="prp-action-type">${action.type}</div>
        <div class="prp-action-label" title="${this.escapeHtml(label || '')}">${this.escapeHtml(truncatedLabel || '')}</div>
      </div>
      <span class="prp-action-time">${time}</span>
    `;

    this.actionsList.appendChild(li);

    // Auto-scroll to bottom
    const content = this.sidebar.querySelector('.prp-sidebar-content');
    content.scrollTop = content.scrollHeight;
  },

  /**
   * Clears all actions from preview
   */
  clearActions() {
    if (!this.actionsList) return;
    this.actionsList.innerHTML = '<li class="prp-empty-state">No actions recorded yet</li>';
    this.actionCount = 0;
    const countEl = this.sidebar.querySelector('#prp-action-count');
    if (countEl) countEl.textContent = '0';
  },

  /**
   * Escapes HTML to prevent XSS
   */
  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /**
   * Destroys the sidebar
   */
  destroy() {
    if (this.sidebar) {
      this.sidebar.remove();
      this.sidebar = null;
      this.actionsList = null;
    }
    this.isVisible = false;
    this.actionCount = 0;
  }
};

// Listen for messages from background - only handle sidebar-specific messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only handle sidebar-specific messages to avoid conflicts with recorder.js
  if (message.type === 'TOGGLE_SIDEBAR') {
    if (PreviewSidebar.isVisible) {
      PreviewSidebar.hide();
    } else {
      PreviewSidebar.show();
    }
    sendResponse({ success: true });
    return true; // We handled this message
  }

  if (message.type === 'PREVIEW_ACTION') {
    if (message.action) {
      PreviewSidebar.addAction(message.action);
    }
    sendResponse({ success: true });
    return true;
  }

  // For recording state changes, update UI but don't respond
  // (recorder.js handles the actual response)
  if (message.type === 'STOP_RECORDING') {
    if (PreviewSidebar.sidebar) {
      const dot = PreviewSidebar.sidebar.querySelector('.prp-recording-dot');
      if (dot) dot.style.display = 'none';
    }
  } else if (message.type === 'PAUSE_RECORDING') {
    if (PreviewSidebar.sidebar) {
      const dot = PreviewSidebar.sidebar.querySelector('.prp-recording-dot');
      if (dot) dot.style.animation = 'none';
    }
  }
  // Don't return true - let recorder.js handle the response
  return false;
});

// Export for use by recorder
window.PreviewSidebar = PreviewSidebar;
