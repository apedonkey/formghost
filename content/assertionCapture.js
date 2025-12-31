/**
 * Puppeteer Recorder Pro - Assertion Capture
 * Allows users to capture assertions about elements during recording
 */

const AssertionCapture = {
  isActive: false,
  overlay: null,
  tooltip: null,
  currentElement: null,

  /**
   * Initializes the assertion capture system
   */
  init() {
    if (!document.body) return; // Safety check
    this.createOverlay();
    this.createTooltip();
  },

  /**
   * Creates the highlight overlay
   */
  createOverlay() {
    if (!document.body) return;
    this.overlay = document.createElement('div');
    this.overlay.id = 'assertion-capture-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      pointer-events: none;
      border: 2px dashed #10b981;
      background: rgba(16, 185, 129, 0.1);
      z-index: 2147483646;
      display: none;
      transition: all 0.1s ease;
    `;
    document.body.appendChild(this.overlay);
  },

  /**
   * Creates the assertion type tooltip/menu
   */
  createTooltip() {
    if (!document.body) return;
    this.tooltip = document.createElement('div');
    this.tooltip.id = 'assertion-capture-tooltip';
    this.tooltip.style.cssText = `
      position: fixed;
      background: #1a1a2e;
      border: 1px solid #10b981;
      border-radius: 8px;
      padding: 8px;
      z-index: 2147483647;
      display: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12px;
      color: #e0e0e0;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      min-width: 180px;
    `;
    this.tooltip.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 8px; color: #10b981;">Add Assertion</div>
      <div class="assertion-options">
        <button data-assertion="visible" class="assertion-btn">✓ Is Visible</button>
        <button data-assertion="hidden" class="assertion-btn">✗ Is Hidden</button>
        <button data-assertion="text" class="assertion-btn">≡ Has Text</button>
        <button data-assertion="value" class="assertion-btn">= Has Value</button>
        <button data-assertion="attribute" class="assertion-btn">@ Has Attribute</button>
        <button data-assertion="count" class="assertion-btn"># Element Count</button>
        <button data-assertion="enabled" class="assertion-btn">● Is Enabled</button>
        <button data-assertion="checked" class="assertion-btn">☑ Is Checked</button>
        <button data-assertion="cancel" class="assertion-btn cancel">Cancel</button>
      </div>
      <style>
        .assertion-btn {
          display: block;
          width: 100%;
          padding: 6px 10px;
          margin: 4px 0;
          background: #0f3460;
          border: 1px solid #4a4a6a;
          border-radius: 4px;
          color: #e0e0e0;
          cursor: pointer;
          text-align: left;
          font-size: 11px;
        }
        .assertion-btn:hover {
          background: #1a4a7a;
          border-color: #10b981;
        }
        .assertion-btn.cancel {
          background: transparent;
          color: #7a7a9a;
          margin-top: 8px;
        }
        .assertion-btn.cancel:hover {
          background: #2d2d44;
        }
      </style>
    `;
    document.body.appendChild(this.tooltip);

    // Add click handlers to buttons
    this.tooltip.querySelectorAll('.assertion-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const assertionType = btn.dataset.assertion;
        if (assertionType === 'cancel') {
          this.hideTooltip();
        } else {
          this.captureAssertion(assertionType);
        }
      });
    });
  },

  /**
   * Activates assertion capture mode
   */
  activate() {
    if (this.isActive) return;

    // Lazy init if needed
    if (!this.overlay && document.body) {
      this.init();
    }
    if (!this.overlay) return; // Can't activate without UI

    this.isActive = true;

    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('click', this.handleClick, true);
    document.addEventListener('keydown', this.handleKeyDown);

    // Show cursor change
    document.body.style.cursor = 'crosshair';

    console.log('Assertion capture mode activated');
  },

  /**
   * Deactivates assertion capture mode
   */
  deactivate() {
    if (!this.isActive) return;
    this.isActive = false;

    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('click', this.handleClick, true);
    document.removeEventListener('keydown', this.handleKeyDown);

    this.overlay.style.display = 'none';
    this.hideTooltip();
    document.body.style.cursor = '';
    this.currentElement = null;

    console.log('Assertion capture mode deactivated');
  },

  /**
   * Handles mouse movement to highlight elements
   */
  handleMouseMove: function(e) {
    const self = AssertionCapture;
    if (!self.isActive || self.tooltip.style.display !== 'none') return;

    const element = document.elementFromPoint(e.clientX, e.clientY);
    if (!element || element === self.overlay || element === self.tooltip ||
        self.tooltip.contains(element)) return;

    self.currentElement = element;
    const rect = element.getBoundingClientRect();

    self.overlay.style.display = 'block';
    self.overlay.style.left = rect.left + 'px';
    self.overlay.style.top = rect.top + 'px';
    self.overlay.style.width = rect.width + 'px';
    self.overlay.style.height = rect.height + 'px';
  },

  /**
   * Handles click to show assertion options
   */
  handleClick: function(e) {
    const self = AssertionCapture;
    if (!self.isActive) return;

    // Ignore clicks on our UI
    if (e.target === self.tooltip || self.tooltip.contains(e.target)) return;

    e.preventDefault();
    e.stopPropagation();

    if (self.currentElement) {
      self.showTooltip(e.clientX, e.clientY);
    }
  },

  /**
   * Handles keyboard events
   */
  handleKeyDown: function(e) {
    const self = AssertionCapture;
    if (e.key === 'Escape') {
      self.deactivate();
    }
  },

  /**
   * Shows the assertion type tooltip
   */
  showTooltip(x, y) {
    // Position tooltip near click but keep on screen
    const tooltipRect = this.tooltip.getBoundingClientRect();
    let left = x + 10;
    let top = y + 10;

    if (left + 200 > window.innerWidth) {
      left = x - 200;
    }
    if (top + 300 > window.innerHeight) {
      top = y - 300;
    }

    this.tooltip.style.left = Math.max(10, left) + 'px';
    this.tooltip.style.top = Math.max(10, top) + 'px';
    this.tooltip.style.display = 'block';
  },

  /**
   * Hides the tooltip
   */
  hideTooltip() {
    this.tooltip.style.display = 'none';
  },

  /**
   * Captures an assertion for the current element
   */
  captureAssertion(type) {
    if (!this.currentElement) {
      this.hideTooltip();
      return;
    }

    const element = this.currentElement;
    const elementInfo = window.PuppeteerRecorderSelectors?.getElementInfo(element);

    let assertion = {
      type: 'assertion',
      assertionType: type,
      element: elementInfo,
      timestamp: Date.now()
    };

    // Capture assertion-specific data
    switch (type) {
      case 'visible':
        assertion.expected = true;
        assertion.description = `Assert element "${elementInfo?.humanLabel || 'element'}" is visible`;
        break;

      case 'hidden':
        assertion.expected = false;
        assertion.description = `Assert element "${elementInfo?.humanLabel || 'element'}" is hidden`;
        break;

      case 'text':
        const text = element.textContent?.trim().substring(0, 100);
        assertion.expected = text;
        assertion.description = `Assert element contains text "${text}"`;
        break;

      case 'value':
        const value = element.value || '';
        assertion.expected = value;
        assertion.description = `Assert element has value "${value}"`;
        break;

      case 'attribute':
        const attrName = prompt('Which attribute to check?', 'class');
        if (!attrName) {
          this.hideTooltip();
          return;
        }
        const attrValue = element.getAttribute(attrName);
        assertion.attributeName = attrName;
        assertion.expected = attrValue;
        assertion.description = `Assert element has ${attrName}="${attrValue}"`;
        break;

      case 'count':
        const selector = elementInfo?.recommended || elementInfo?.selectors?.[0]?.value;
        if (selector) {
          try {
            const count = document.querySelectorAll(selector).length;
            assertion.expected = count;
            assertion.selector = selector;
            assertion.description = `Assert ${count} elements matching selector`;
          } catch (e) {
            assertion.expected = 1;
            assertion.description = `Assert element exists`;
          }
        }
        break;

      case 'enabled':
        assertion.expected = !element.disabled;
        assertion.description = `Assert element is ${element.disabled ? 'disabled' : 'enabled'}`;
        break;

      case 'checked':
        assertion.expected = element.checked || false;
        assertion.description = `Assert element is ${element.checked ? 'checked' : 'unchecked'}`;
        break;
    }

    // Send to background
    chrome.runtime.sendMessage({
      type: 'ASSERTION_CAPTURED',
      assertion
    }).catch(err => console.warn('Failed to send assertion:', err));

    this.hideTooltip();
    this.deactivate();

    // Show brief confirmation
    this.showConfirmation(assertion.description);
  },

  /**
   * Shows a brief confirmation message
   */
  showConfirmation(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #10b981;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      z-index: 2147483647;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;
    toast.textContent = '✓ ' + message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }
};

// Initialize when DOM is ready
if (document.body) {
  AssertionCapture.init();
} else {
  document.addEventListener('DOMContentLoaded', () => {
    AssertionCapture.init();
  });
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ACTIVATE_ASSERTION_MODE') {
    AssertionCapture.activate();
    sendResponse({ success: true });
    return true;
  } else if (message.type === 'DEACTIVATE_ASSERTION_MODE') {
    AssertionCapture.deactivate();
    sendResponse({ success: true });
    return true;
  }
  // Don't return true for messages we don't handle
});

// Expose to window
window.PuppeteerRecorderAssertions = AssertionCapture;
