/**
 * FormGhost - Form Filler
 * Fills form fields with AI-mapped values and provides visual feedback
 */

const FormGhostFiller = {
  /**
   * Fill configuration
   */
  config: {
    typeDelay: 5, // ms between keystrokes for realistic typing
    fieldDelay: 50, // ms between fields
    highlightDuration: 1500, // ms to show success highlight
    highlightColor: '#10b981', // Green for success
    errorColor: '#ef4444', // Red for errors
    pendingColor: '#f59e0b' // Yellow for pending/skipped
  },

  /**
   * Fills form fields with mapped values
   * @param {Array} mappings - Array of field mappings from Claude
   * @param {Object} options - Fill options
   * @returns {Promise<Object>} Fill results
   */
  async fillForm(mappings, options = {}) {
    const results = {
      success: true,
      filled: [],
      failed: [],
      skipped: [],
      startTime: Date.now(),
      endTime: null
    };

    // Inject styles if not already done
    this.injectStyles();

    // Process each mapping
    for (const mapping of mappings) {
      try {
        // Skip low confidence mappings unless forced
        if (mapping.confidence < 0.5 && !options.fillLowConfidence) {
          results.skipped.push({
            selector: mapping.selector,
            reason: `Low confidence: ${mapping.confidence}`
          });
          this.showFieldStatus(mapping.selector, 'skipped');
          continue;
        }

        // Find the element
        const element = document.querySelector(mapping.selector);
        if (!element) {
          results.failed.push({
            selector: mapping.selector,
            reason: 'Element not found'
          });
          continue;
        }

        // Fill based on field type
        await this.fillField(element, mapping);

        results.filled.push({
          selector: mapping.selector,
          value: mapping.value,
          confidence: mapping.confidence
        });

        this.showFieldStatus(mapping.selector, 'success');

        // Delay between fields
        if (options.fieldDelay !== 0) {
          await this.sleep(options.fieldDelay || this.config.fieldDelay);
        }

      } catch (error) {
        console.error('FormGhostFiller: Failed to fill field:', mapping.selector, error);
        results.failed.push({
          selector: mapping.selector,
          reason: error.message
        });
        this.showFieldStatus(mapping.selector, 'error');
      }
    }

    results.endTime = Date.now();
    results.duration = results.endTime - results.startTime;
    results.success = results.failed.length === 0;

    console.log('FormGhostFiller: Fill complete', results);
    return results;
  },

  /**
   * Fills a single field with appropriate method
   */
  async fillField(element, mapping) {
    const type = mapping.fieldType || this.detectFieldType(element);

    switch (type) {
      case 'select':
        await this.fillSelect(element, mapping.value);
        break;

      case 'checkbox':
        await this.fillCheckbox(element, mapping.value);
        break;

      case 'radio':
        await this.fillRadio(element, mapping.value);
        break;

      case 'date':
        await this.fillDate(element, mapping.value);
        break;

      case 'phone':
      case 'tel':
        await this.fillPhone(element, mapping.value);
        break;

      case 'contenteditable':
        await this.fillContentEditable(element, mapping.value);
        break;

      default:
        await this.fillInput(element, mapping.value);
    }
  },

  /**
   * Fills a standard input field
   */
  async fillInput(element, value) {
    // Focus the element
    element.focus();
    await this.sleep(20);

    // Clear existing value
    element.value = '';
    element.dispatchEvent(new Event('input', { bubbles: true }));

    // Type the value character by character
    for (const char of String(value)) {
      element.value += char;

      element.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));

      await this.sleep(this.config.typeDelay);
    }

    // Trigger change and blur
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.blur();
  },

  /**
   * Fills a select dropdown
   */
  async fillSelect(element, value) {
    element.focus();

    // Find best matching option
    const options = Array.from(element.options);
    let bestMatch = null;

    // Try exact value match
    bestMatch = options.find(opt => opt.value === value);

    // Try exact text match
    if (!bestMatch) {
      bestMatch = options.find(opt =>
        opt.textContent.trim().toLowerCase() === String(value).toLowerCase()
      );
    }

    // Try partial text match
    if (!bestMatch) {
      bestMatch = options.find(opt =>
        opt.textContent.trim().toLowerCase().includes(String(value).toLowerCase())
      );
    }

    // Try value contains
    if (!bestMatch) {
      bestMatch = options.find(opt =>
        opt.value.toLowerCase().includes(String(value).toLowerCase())
      );
    }

    if (bestMatch) {
      element.value = bestMatch.value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      throw new Error(`No matching option found for: ${value}`);
    }
  },

  /**
   * Fills a checkbox
   */
  async fillCheckbox(element, value) {
    const shouldCheck = value === true ||
                        value === 'true' ||
                        value === 'yes' ||
                        value === '1' ||
                        value === 'checked';

    if (element.checked !== shouldCheck) {
      element.click();
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  },

  /**
   * Fills a radio button group
   */
  async fillRadio(element, value) {
    const name = element.name;
    if (!name) {
      element.click();
      return;
    }

    // Find all radios in group
    const radios = document.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`);

    for (const radio of radios) {
      // Check by value or label
      if (radio.value === value ||
          radio.value.toLowerCase() === String(value).toLowerCase()) {
        radio.click();
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }

      // Check by label text
      const label = document.querySelector(`label[for="${radio.id}"]`);
      if (label && label.textContent.trim().toLowerCase().includes(String(value).toLowerCase())) {
        radio.click();
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
    }

    throw new Error(`No matching radio option found for: ${value}`);
  },

  /**
   * Fills a date input
   */
  async fillDate(element, value) {
    // Handle native date input
    if (element.type === 'date') {
      // Ensure value is in YYYY-MM-DD format
      const dateValue = this.formatDateForInput(value);
      element.value = dateValue;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    // Handle text input with date
    await this.fillInput(element, value);
  },

  /**
   * Formats date for native date input (YYYY-MM-DD)
   */
  formatDateForInput(value) {
    // If already in correct format
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    // Try to parse various formats
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }

    // Try MM/DD/YYYY format
    const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      const [, month, day, year] = match;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    return value;
  },

  /**
   * Fills a phone input with formatting
   */
  async fillPhone(element, value) {
    // Remove all non-digits
    const digits = String(value).replace(/\D/g, '');

    // Check for expected format from placeholder or pattern
    const placeholder = element.placeholder || '';
    const hasParens = placeholder.includes('(');
    const hasDashes = placeholder.includes('-');

    let formatted = digits;
    if (digits.length === 10) {
      if (hasParens) {
        formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
      } else if (hasDashes) {
        formatted = `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
      } else {
        // Default format
        formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
      }
    }

    await this.fillInput(element, formatted);
  },

  /**
   * Fills a contenteditable element
   */
  async fillContentEditable(element, value) {
    element.focus();
    element.textContent = '';
    element.dispatchEvent(new Event('input', { bubbles: true }));

    // Type the value
    for (const char of String(value)) {
      element.textContent += char;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      await this.sleep(this.config.typeDelay);
    }

    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.blur();
  },

  /**
   * Detects field type from element
   */
  detectFieldType(element) {
    if (element.tagName === 'SELECT') return 'select';
    if (element.tagName === 'TEXTAREA') return 'textarea';
    if (element.isContentEditable) return 'contenteditable';

    const type = (element.type || 'text').toLowerCase();
    const name = (element.name || '').toLowerCase();
    const id = (element.id || '').toLowerCase();

    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'date' || type === 'datetime-local') return 'date';
    if (type === 'tel' || name.includes('phone') || id.includes('phone')) return 'phone';
    if (type === 'email') return 'email';

    return 'text';
  },

  /**
   * Shows visual feedback on a field
   */
  showFieldStatus(selector, status) {
    try {
      const element = document.querySelector(selector);
      if (!element) return;

      const color = status === 'success' ? this.config.highlightColor :
                    status === 'error' ? this.config.errorColor :
                    this.config.pendingColor;

      // Store original styles
      const originalOutline = element.style.outline;
      const originalBoxShadow = element.style.boxShadow;
      const originalTransition = element.style.transition;

      // Apply highlight
      element.style.transition = 'all 0.2s ease';
      element.style.outline = `2px solid ${color}`;
      element.style.boxShadow = `0 0 8px ${color}40`;

      // Add checkmark or x icon for success/error
      if (status === 'success' || status === 'error') {
        this.addStatusIcon(element, status);
      }

      // Restore after delay
      setTimeout(() => {
        element.style.outline = originalOutline;
        element.style.boxShadow = originalBoxShadow;
        element.style.transition = originalTransition;
      }, this.config.highlightDuration);

    } catch (error) {
      // Non-critical, ignore
    }
  },

  /**
   * Adds a status icon next to the field
   */
  addStatusIcon(element, status) {
    const icon = document.createElement('span');
    icon.className = 'fg-fill-status-icon';
    icon.innerHTML = status === 'success' ? '&#10003;' : '&#10007;';
    icon.style.cssText = `
      position: absolute;
      right: -24px;
      top: 50%;
      transform: translateY(-50%);
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: ${status === 'success' ? this.config.highlightColor : this.config.errorColor};
      color: white;
      font-size: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      animation: fg-icon-pop 0.3s ease;
    `;

    // Position relative to element
    const parent = element.parentElement;
    if (parent) {
      const parentPosition = window.getComputedStyle(parent).position;
      if (parentPosition === 'static') {
        parent.style.position = 'relative';
      }
      parent.appendChild(icon);

      // Remove after delay
      setTimeout(() => {
        icon.remove();
      }, this.config.highlightDuration);
    }
  },

  /**
   * Injects CSS styles for visual feedback
   */
  injectStyles() {
    if (document.getElementById('fg-filler-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'fg-filler-styles';
    styles.textContent = `
      @keyframes fg-icon-pop {
        0% { transform: translateY(-50%) scale(0); }
        50% { transform: translateY(-50%) scale(1.2); }
        100% { transform: translateY(-50%) scale(1); }
      }

      .fg-fill-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.3);
        z-index: 9998;
        pointer-events: none;
      }

      .fg-fill-progress {
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        padding: 16px 24px;
        border-radius: 12px;
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px;
        z-index: 9999;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .fg-fill-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid rgba(255, 255, 255, 0.2);
        border-top-color: #10b981;
        border-radius: 50%;
        animation: fg-spin 0.8s linear infinite;
      }

      @keyframes fg-spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(styles);
  },

  /**
   * Shows a fill progress indicator
   */
  showProgress(message) {
    this.injectStyles();

    let progress = document.querySelector('.fg-fill-progress');
    if (!progress) {
      progress = document.createElement('div');
      progress.className = 'fg-fill-progress';
      document.body.appendChild(progress);
    }

    progress.innerHTML = `
      <div class="fg-fill-spinner"></div>
      <span>${message}</span>
    `;
  },

  /**
   * Hides the progress indicator
   */
  hideProgress() {
    const progress = document.querySelector('.fg-fill-progress');
    if (progress) {
      progress.remove();
    }
  },

  /**
   * Shows fill completion summary
   */
  showSummary(results) {
    const summary = document.createElement('div');
    summary.className = 'fg-fill-progress';
    summary.style.background = results.success
      ? 'linear-gradient(135deg, #065f46 0%, #047857 100%)'
      : 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)';

    const icon = results.success ? '&#10003;' : '&#9888;';
    const message = results.success
      ? `Filled ${results.filled.length} fields`
      : `${results.filled.length} filled, ${results.failed.length} failed`;

    summary.innerHTML = `
      <span style="font-size: 18px;">${icon}</span>
      <span>${message}</span>
    `;

    document.body.appendChild(summary);

    setTimeout(() => {
      summary.style.opacity = '0';
      summary.style.transition = 'opacity 0.3s ease';
      setTimeout(() => summary.remove(), 300);
    }, 3000);
  },

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};

// Listen for fill commands
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FILL_FORM') {
    FormGhostFiller.showProgress('Filling form...');

    FormGhostFiller.fillForm(message.mappings, message.options)
      .then(results => {
        FormGhostFiller.hideProgress();
        FormGhostFiller.showSummary(results);
        sendResponse({ success: true, results });
      })
      .catch(error => {
        FormGhostFiller.hideProgress();
        sendResponse({ success: false, error: error.message });
      });

    return true; // Async response
  }

  if (message.type === 'FILL_SINGLE_FIELD') {
    FormGhostFiller.fillField(
      document.querySelector(message.selector),
      message.mapping
    ).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });

    return true;
  }
});

// Expose to global scope
window.FormGhostFiller = FormGhostFiller;

console.log('FormGhost Filler: Content script loaded');
