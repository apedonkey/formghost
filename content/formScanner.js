/**
 * FormGhost - Form Scanner
 * Extracts form field metadata from web pages for AI mapping
 */

const FormGhostScanner = {
  /**
   * Field types that we can fill
   */
  FILLABLE_TYPES: [
    'text', 'email', 'tel', 'number', 'password', 'search', 'url',
    'date', 'datetime-local', 'month', 'week', 'time'
  ],

  /**
   * Scans the page for all fillable form fields
   * @returns {Array} Array of field metadata objects
   */
  scanPage() {
    const fields = [];

    // Scan regular inputs
    document.querySelectorAll('input').forEach(input => {
      const field = this.extractInputMetadata(input);
      if (field) fields.push(field);
    });

    // Scan textareas
    document.querySelectorAll('textarea').forEach(textarea => {
      const field = this.extractTextareaMetadata(textarea);
      if (field) fields.push(field);
    });

    // Scan selects
    document.querySelectorAll('select').forEach(select => {
      const field = this.extractSelectMetadata(select);
      if (field) fields.push(field);
    });

    // Scan contenteditable elements
    document.querySelectorAll('[contenteditable="true"]').forEach(el => {
      const field = this.extractContentEditableMetadata(el);
      if (field) fields.push(field);
    });

    console.log('FormGhostScanner: Found', fields.length, 'fillable fields');
    return fields;
  },

  /**
   * Extracts metadata from an input element
   */
  extractInputMetadata(input) {
    const type = (input.type || 'text').toLowerCase();

    // Skip non-fillable types
    if (!this.FILLABLE_TYPES.includes(type) && type !== 'hidden') {
      // Handle radio and checkbox separately
      if (type === 'radio' || type === 'checkbox') {
        return this.extractCheckableMetadata(input);
      }
      return null;
    }

    // Skip hidden fields (usually tokens/IDs)
    if (type === 'hidden') return null;

    // Skip if read-only or disabled
    if (input.readOnly || input.disabled) return null;

    return {
      type: 'input',
      inputType: type,
      selector: this.generateSelector(input),
      id: input.id || null,
      name: input.name || null,
      label: this.findLabel(input),
      placeholder: input.placeholder || null,
      autocomplete: input.autocomplete || null,
      required: input.required,
      pattern: input.pattern || null,
      maxLength: input.maxLength > 0 ? input.maxLength : null,
      minLength: input.minLength > 0 ? input.minLength : null,
      ariaLabel: input.getAttribute('aria-label') || null,
      dataAttributes: this.extractDataAttributes(input),
      currentValue: input.value || null,
      isVisible: this.isElementVisible(input)
    };
  },

  /**
   * Extracts metadata from checkboxes and radio buttons
   */
  extractCheckableMetadata(input) {
    // Skip if disabled
    if (input.disabled) return null;

    const type = input.type.toLowerCase();
    const groupName = input.name;

    return {
      type: type,
      inputType: type,
      selector: this.generateSelector(input),
      id: input.id || null,
      name: groupName || null,
      label: this.findLabel(input),
      value: input.value,
      checked: input.checked,
      ariaLabel: input.getAttribute('aria-label') || null,
      isVisible: this.isElementVisible(input)
    };
  },

  /**
   * Extracts metadata from a textarea element
   */
  extractTextareaMetadata(textarea) {
    if (textarea.readOnly || textarea.disabled) return null;

    return {
      type: 'textarea',
      inputType: 'textarea',
      selector: this.generateSelector(textarea),
      id: textarea.id || null,
      name: textarea.name || null,
      label: this.findLabel(textarea),
      placeholder: textarea.placeholder || null,
      required: textarea.required,
      maxLength: textarea.maxLength > 0 ? textarea.maxLength : null,
      ariaLabel: textarea.getAttribute('aria-label') || null,
      dataAttributes: this.extractDataAttributes(textarea),
      currentValue: textarea.value || null,
      isVisible: this.isElementVisible(textarea)
    };
  },

  /**
   * Extracts metadata from a select element
   */
  extractSelectMetadata(select) {
    if (select.disabled) return null;

    const options = Array.from(select.options).map(opt => ({
      value: opt.value,
      text: opt.textContent.trim(),
      selected: opt.selected
    }));

    return {
      type: 'select',
      inputType: 'select',
      selector: this.generateSelector(select),
      id: select.id || null,
      name: select.name || null,
      label: this.findLabel(select),
      required: select.required,
      multiple: select.multiple,
      options: options,
      ariaLabel: select.getAttribute('aria-label') || null,
      dataAttributes: this.extractDataAttributes(select),
      currentValue: select.value || null,
      isVisible: this.isElementVisible(select)
    };
  },

  /**
   * Extracts metadata from contenteditable elements
   */
  extractContentEditableMetadata(el) {
    return {
      type: 'contenteditable',
      inputType: 'contenteditable',
      selector: this.generateSelector(el),
      id: el.id || null,
      label: this.findLabelForElement(el),
      ariaLabel: el.getAttribute('aria-label') || null,
      dataAttributes: this.extractDataAttributes(el),
      currentValue: el.textContent || null,
      isVisible: this.isElementVisible(el)
    };
  },

  /**
   * Finds the label for a form field
   */
  findLabel(field) {
    // Method 1: Explicit label with 'for' attribute
    if (field.id) {
      const label = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
      if (label) return label.textContent.trim();
    }

    // Method 2: Wrapping label
    const parentLabel = field.closest('label');
    if (parentLabel) {
      // Get text content excluding the input itself
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll('input, select, textarea').forEach(el => el.remove());
      const text = clone.textContent.trim();
      if (text) return text;
    }

    // Method 3: aria-labelledby
    const labelledBy = field.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl) return labelEl.textContent.trim();
    }

    // Method 4: Previous sibling text
    const prevSibling = field.previousElementSibling;
    if (prevSibling && (prevSibling.tagName === 'LABEL' || prevSibling.tagName === 'SPAN')) {
      return prevSibling.textContent.trim();
    }

    // Method 5: Parent's previous sibling (common in table layouts)
    const parent = field.parentElement;
    if (parent) {
      const parentPrev = parent.previousElementSibling;
      if (parentPrev && (parentPrev.tagName === 'TD' || parentPrev.tagName === 'TH' || parentPrev.tagName === 'LABEL')) {
        return parentPrev.textContent.trim();
      }
    }

    // Method 6: Nearby text in same container
    if (parent) {
      const nearbyText = this.findNearbyText(field, parent);
      if (nearbyText) return nearbyText;
    }

    return null;
  },

  /**
   * Finds label for non-form elements
   */
  findLabelForElement(el) {
    // aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    // aria-labelledby
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl) return labelEl.textContent.trim();
    }

    // Previous sibling
    const prevSibling = el.previousElementSibling;
    if (prevSibling) {
      return prevSibling.textContent.trim().substring(0, 50);
    }

    return null;
  },

  /**
   * Finds nearby text that might be a label
   */
  findNearbyText(field, container) {
    // Look for text nodes or spans before the field
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      null,
      false
    );

    let node;
    let lastText = '';
    while ((node = walker.nextNode())) {
      if (node === field) {
        return lastText.trim().substring(0, 100) || null;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text.length > 2) lastText = text;
      } else if (node.tagName === 'SPAN' || node.tagName === 'DIV') {
        const text = node.textContent.trim();
        if (text.length > 2 && text.length < 100) lastText = text;
      }
    }
    return null;
  },

  /**
   * Generates a reliable CSS selector for an element
   */
  generateSelector(el) {
    // Prefer ID
    if (el.id) {
      return `#${CSS.escape(el.id)}`;
    }

    // Prefer name for form elements
    if (el.name) {
      const tag = el.tagName.toLowerCase();
      const nameSelector = `${tag}[name="${CSS.escape(el.name)}"]`;
      if (document.querySelectorAll(nameSelector).length === 1) {
        return nameSelector;
      }
    }

    // Use data-testid or similar test attributes
    const testId = el.getAttribute('data-testid') ||
                   el.getAttribute('data-test-id') ||
                   el.getAttribute('data-cy');
    if (testId) {
      return `[data-testid="${CSS.escape(testId)}"]`;
    }

    // Build path selector
    return this.buildPathSelector(el);
  },

  /**
   * Builds a path-based selector
   */
  buildPathSelector(el) {
    const path = [];
    let current = el;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector = `#${CSS.escape(current.id)}`;
        path.unshift(selector);
        break;
      }

      // Add class if unique enough
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/).filter(c => c.length > 0);
        if (classes.length > 0) {
          selector += '.' + classes.map(c => CSS.escape(c)).join('.');
        }
      }

      // Add nth-child if needed
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          c => c.tagName === current.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  },

  /**
   * Extracts data-* attributes
   */
  extractDataAttributes(el) {
    const data = {};
    for (const attr of el.attributes) {
      if (attr.name.startsWith('data-')) {
        const key = attr.name.substring(5); // Remove 'data-' prefix
        data[key] = attr.value;
      }
    }
    return Object.keys(data).length > 0 ? data : null;
  },

  /**
   * Checks if element is visible
   */
  isElementVisible(el) {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0'
    );
  },

  /**
   * Gets a summary of the form structure for caching
   */
  getFormSignature() {
    const fields = this.scanPage();
    return {
      url: window.location.href,
      fieldCount: fields.length,
      fields: fields.map(f => ({
        type: f.type,
        name: f.name,
        id: f.id,
        label: f.label
      }))
    };
  },

  /**
   * Detects if page has multi-step form
   */
  detectMultiStepForm() {
    // Look for common multi-step indicators
    const indicators = [
      '[class*="step"]',
      '[class*="wizard"]',
      '[class*="progress"]',
      '[data-step]',
      '.pagination',
      'button:contains("Next")',
      'button:contains("Continue")'
    ];

    for (const selector of indicators) {
      try {
        if (document.querySelector(selector)) {
          return true;
        }
      } catch (e) {
        // Invalid selector, skip
      }
    }

    // Check for multiple form sections with only one visible
    const forms = document.querySelectorAll('form, [class*="form"]');
    let visibleSections = 0;
    let totalSections = 0;

    forms.forEach(form => {
      const sections = form.querySelectorAll('[class*="section"], [class*="step"], fieldset');
      sections.forEach(section => {
        totalSections++;
        if (this.isElementVisible(section)) visibleSections++;
      });
    });

    return totalSections > 1 && visibleSections === 1;
  }
};

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCAN_FORM') {
    const fields = FormGhostScanner.scanPage();
    sendResponse({
      success: true,
      fields: fields,
      url: window.location.href,
      isMultiStep: FormGhostScanner.detectMultiStepForm()
    });
    return true;
  }

  if (message.type === 'GET_FORM_SIGNATURE') {
    const signature = FormGhostScanner.getFormSignature();
    sendResponse({ success: true, signature });
    return true;
  }
});

// Expose to global scope
window.FormGhostScanner = FormGhostScanner;

console.log('FormGhost Scanner: Content script loaded');
