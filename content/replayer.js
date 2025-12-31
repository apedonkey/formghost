/**
 * FormGhost - Replay Engine
 * Executes recorded workflows with variable substitution
 */

/**
 * Replay configuration
 */
const REPLAY_CONFIG = {
  DEFAULT_TIMEOUT: 10000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 500,
  STEP_DELAY: 100,
  HIGHLIGHT_DURATION: 500,
  TYPE_CHAR_DELAY: 10
};

/**
 * FormGhost Replayer - Core replay engine
 */
const FormGhostReplayer = {
  // State
  state: {
    isReplaying: false,
    isPaused: false,
    isTakeover: false,
    currentStepIndex: 0,
    totalSteps: 0,
    workflow: null,
    variables: {},
    options: {},
    abortController: null
  },

  /**
   * Main entry point - replays a complete workflow
   * @param {Object} workflowJson - The workflow definition (actions array + metadata)
   * @param {Object} variables - Variable values {variableName: actualValue}
   * @param {Object} options - Replay options
   * @returns {Promise<Object>} Replay results
   */
  async replayWorkflow(workflowJson, variables = {}, options = {}) {
    const mergedOptions = {
      stepDelay: REPLAY_CONFIG.STEP_DELAY,
      timeout: REPLAY_CONFIG.DEFAULT_TIMEOUT,
      stopOnError: false,
      highlightElements: true,
      startFromStep: 0,
      ...options
    };

    this.state = {
      isReplaying: true,
      isPaused: false,
      isTakeover: false,
      currentStepIndex: mergedOptions.startFromStep,
      totalSteps: workflowJson.actions?.length || 0,
      workflow: workflowJson,
      variables: variables,
      options: mergedOptions,
      abortController: new AbortController()
    };

    const results = {
      success: true,
      stepsExecuted: 0,
      stepResults: [],
      errors: [],
      startTime: Date.now(),
      endTime: null
    };

    // Start wait detector for stability checking
    if (window.PuppeteerRecorderWaitDetector) {
      window.PuppeteerRecorderWaitDetector.start();
    }

    // Show progress overlay
    if (window.FormGhostReplayOverlay) {
      window.FormGhostReplayOverlay.init();
    }

    try {
      const actions = workflowJson.actions || [];

      for (let i = this.state.currentStepIndex; i < actions.length; i++) {
        // Check for abort
        if (this.state.abortController.signal.aborted) {
          results.success = false;
          results.errors.push('Replay cancelled by user');
          break;
        }

        // Handle pause
        while (this.state.isPaused && !this.state.abortController.signal.aborted) {
          await this.sleep(100);
        }

        // Handle takeover - user is manually completing a step
        while (this.state.isTakeover && !this.state.abortController.signal.aborted) {
          await this.sleep(100);
        }

        if (this.state.abortController.signal.aborted) break;

        this.state.currentStepIndex = i;

        // Broadcast progress
        this.broadcastProgress(i, actions.length, actions[i]);

        // Show progress in overlay
        if (window.FormGhostReplayOverlay) {
          window.FormGhostReplayOverlay.showProgress(i, actions.length, actions[i]);
        }

        const action = actions[i];
        const stepResult = await this.executeStep(action, variables);

        results.stepResults.push(stepResult);
        results.stepsExecuted++;

        if (!stepResult.success) {
          results.errors.push({
            step: i,
            error: stepResult.error,
            action: action.type
          });

          if (mergedOptions.stopOnError) {
            results.success = false;
            break;
          }
        }

        // Delay between steps
        if (i < actions.length - 1) {
          await this.sleep(mergedOptions.stepDelay);
        }
      }
    } catch (error) {
      results.success = false;
      results.errors.push({
        step: this.state.currentStepIndex,
        error: error.message,
        fatal: true
      });
    } finally {
      results.endTime = Date.now();
      this.state.isReplaying = false;

      // Stop wait detector
      if (window.PuppeteerRecorderWaitDetector) {
        window.PuppeteerRecorderWaitDetector.stop();
      }

      // Hide progress overlay
      if (window.FormGhostReplayOverlay) {
        window.FormGhostReplayOverlay.hideProgress();
      }

      // Broadcast completion
      this.broadcastComplete(results);
    }

    return results;
  },

  /**
   * Executes a single workflow step
   * @param {Object} step - The action step to execute
   * @param {Object} variables - Variable values for substitution
   * @returns {Promise<Object>} Step result
   */
  async executeStep(step, variables) {
    const result = {
      stepIndex: this.state.currentStepIndex,
      actionType: step.type,
      success: false,
      error: null,
      elementFound: false,
      executionTime: 0
    };

    const startTime = Date.now();

    try {
      // Check for pause-before-execute flag
      if (step.pauseBeforeExecute) {
        const userDecision = await this.showPauseConfirmation(step);
        if (userDecision === 'cancel') {
          this.cancel();
          throw new Error('User cancelled replay');
        }
        if (userDecision === 'takeover') {
          // User wants to complete this step manually
          await this.handleTakeover(step);
          result.success = true;
          result.executionTime = Date.now() - startTime;
          return result;
        }
      }

      // Wait for page stability first
      await this.waitForCondition(step);

      // Find the target element (if needed)
      let element = null;
      if (this.actionRequiresElement(step.type)) {
        element = await this.findElement(step.element?.selectors, step);
        result.elementFound = !!element;

        if (!element) {
          // Element not found - trigger manual takeover
          const decision = await this.showTakeoverPrompt(step, 'Element not found');
          if (decision === 'cancel') {
            this.cancel();
            throw new Error('User cancelled replay - element not found');
          }
          if (decision === 'takeover') {
            await this.handleTakeover(step);
            result.success = true;
            result.executionTime = Date.now() - startTime;
            return result;
          }
          // If user clicked "skip", continue without error
          if (decision === 'skip') {
            result.success = true;
            result.skipped = true;
            result.executionTime = Date.now() - startTime;
            return result;
          }
        }
      }

      // Highlight element if enabled
      if (this.state.options.highlightElements && element) {
        await window.FormGhostReplayOverlay?.highlightElement(element, REPLAY_CONFIG.HIGHLIGHT_DURATION);
      }

      // Apply variable substitution to value
      const processedValue = this.injectValue(step.value, variables);

      // Execute the action
      await this.performAction(step.type, element, processedValue, step);

      result.success = true;
    } catch (error) {
      result.error = error.message;
      result.success = false;
      console.error(`Step ${this.state.currentStepIndex} failed:`, error);
    }

    result.executionTime = Date.now() - startTime;
    return result;
  },

  /**
   * Finds an element using multiple selector strategies
   * @param {Array} selectors - Array of {strategy, value, confidence} objects
   * @param {Object} step - The step object (for context)
   * @returns {Promise<Element|null>}
   */
  async findElement(selectors, step) {
    if (!selectors || selectors.length === 0) return null;

    // Sort by confidence (highest first)
    const sortedSelectors = [...selectors].sort((a, b) =>
      (b.confidence || 0) - (a.confidence || 0)
    );

    for (let attempt = 0; attempt < REPLAY_CONFIG.RETRY_ATTEMPTS; attempt++) {
      for (const selector of sortedSelectors) {
        try {
          let element = null;

          switch (selector.strategy) {
            case 'testId':
            case 'id':
            case 'aria':
            case 'name':
            case 'class':
            case 'cssPath':
              element = await this.waitForSelector(selector.value, this.state.options.timeout / REPLAY_CONFIG.RETRY_ATTEMPTS);
              break;

            case 'xpath':
              element = await this.waitForXPath(selector.value, this.state.options.timeout / REPLAY_CONFIG.RETRY_ATTEMPTS);
              break;

            case 'text':
              element = await this.findByText(selector.value, this.state.options.timeout / REPLAY_CONFIG.RETRY_ATTEMPTS);
              break;

            case 'role':
              element = await this.findByRole(selector.value, this.state.options.timeout / REPLAY_CONFIG.RETRY_ATTEMPTS);
              break;

            case 'shadowDOM':
              element = await this.findInShadowDOM(selector.value, this.state.options.timeout / REPLAY_CONFIG.RETRY_ATTEMPTS);
              break;

            default:
              element = await this.waitForSelector(selector.value, this.state.options.timeout / REPLAY_CONFIG.RETRY_ATTEMPTS);
          }

          if (element && this.isElementInteractable(element)) {
            return element;
          }
        } catch (e) {
          // Continue to next selector
          console.debug(`Selector failed (attempt ${attempt + 1}): ${selector.strategy}:${selector.value}`, e.message);
        }
      }

      // Wait before retry
      if (attempt < REPLAY_CONFIG.RETRY_ATTEMPTS - 1) {
        await this.sleep(REPLAY_CONFIG.RETRY_DELAY * (attempt + 1));
      }
    }

    return null;
  },

  /**
   * Waits for a CSS selector
   * @param {string} selector - CSS selector
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<Element|null>}
   */
  async waitForSelector(selector, timeout = 5000) {
    const startTime = Date.now();

    // First check if element already exists
    try {
      const existing = document.querySelector(selector);
      if (existing && this.isElementInteractable(existing)) {
        return existing;
      }
    } catch (e) {
      // Invalid selector
      return null;
    }

    // Wait for element to appear
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        try {
          const element = document.querySelector(selector);
          if (element && this.isElementInteractable(element)) {
            clearInterval(checkInterval);
            resolve(element);
          } else if (Date.now() - startTime > timeout) {
            clearInterval(checkInterval);
            resolve(null);
          }
        } catch (e) {
          clearInterval(checkInterval);
          resolve(null);
        }
      }, 100);
    });
  },

  /**
   * Waits for an XPath selector
   * @param {string} xpath - XPath expression
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<Element|null>}
   */
  async waitForXPath(xpath, timeout = 5000) {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        try {
          const result = document.evaluate(
            xpath,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          );
          const element = result.singleNodeValue;

          if (element && this.isElementInteractable(element)) {
            clearInterval(checkInterval);
            resolve(element);
          } else if (Date.now() - startTime > timeout) {
            clearInterval(checkInterval);
            resolve(null);
          }
        } catch (e) {
          clearInterval(checkInterval);
          resolve(null);
        }
      }, 100);
    });
  },

  /**
   * Finds element by text content (Playwright-style :has-text selector)
   * @param {string} selector - Selector with :has-text
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<Element|null>}
   */
  async findByText(selector, timeout = 5000) {
    // Parse the selector: tagName:has-text("text")
    const match = selector.match(/^(\w+):has-text\("(.+)"\)$/);
    if (!match) return null;

    const [, tagName, text] = match;
    const startTime = Date.now();

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const elements = document.querySelectorAll(tagName);
        for (const el of elements) {
          if (el.textContent?.includes(text) && this.isElementInteractable(el)) {
            clearInterval(checkInterval);
            resolve(el);
            return;
          }
        }

        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          resolve(null);
        }
      }, 100);
    });
  },

  /**
   * Finds element by role (Playwright-style role selector)
   * @param {string} selector - Role selector (role=button[name="..."])
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<Element|null>}
   */
  async findByRole(selector, timeout = 5000) {
    // Parse: role=button[name="Click Me"]
    const match = selector.match(/^role=(\w+)\[name="(.+)"\]$/);
    if (!match) return null;

    const [, role, name] = match;
    const startTime = Date.now();

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const elements = document.querySelectorAll(`[role="${role}"]`);
        for (const el of elements) {
          const elName = el.getAttribute('aria-label') ||
                        el.getAttribute('title') ||
                        el.textContent?.trim();
          if (elName === name && this.isElementInteractable(el)) {
            clearInterval(checkInterval);
            resolve(el);
            return;
          }
        }

        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          resolve(null);
        }
      }, 100);
    });
  },

  /**
   * Finds element in shadow DOM (piercing selector)
   * @param {string} selector - Shadow piercing selector (host >>> inner)
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<Element|null>}
   */
  async findInShadowDOM(selector, timeout = 5000) {
    // Parse: host >>> inner >>> deepinner
    const parts = selector.split(' >>> ').map(s => s.trim());
    const startTime = Date.now();

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        try {
          let current = document;

          for (let i = 0; i < parts.length; i++) {
            const element = current.querySelector(parts[i]);
            if (!element) {
              if (Date.now() - startTime > timeout) {
                clearInterval(checkInterval);
                resolve(null);
              }
              return;
            }

            if (i < parts.length - 1) {
              // Not the last part - need to enter shadow root
              if (!element.shadowRoot) {
                if (Date.now() - startTime > timeout) {
                  clearInterval(checkInterval);
                  resolve(null);
                }
                return;
              }
              current = element.shadowRoot;
            } else {
              // Last part - this is the target
              if (this.isElementInteractable(element)) {
                clearInterval(checkInterval);
                resolve(element);
                return;
              }
            }
          }

          if (Date.now() - startTime > timeout) {
            clearInterval(checkInterval);
            resolve(null);
          }
        } catch (e) {
          if (Date.now() - startTime > timeout) {
            clearInterval(checkInterval);
            resolve(null);
          }
        }
      }, 100);
    });
  },

  /**
   * Waits for page conditions before executing step
   * @param {Object} step - The step with waitBefore info
   * @returns {Promise<void>}
   */
  async waitForCondition(step) {
    const waitInfo = step.waitBefore;

    if (!waitInfo || waitInfo.type === 'none' || waitInfo.type === 'immediate') {
      return;
    }

    const waitDetector = window.PuppeteerRecorderWaitDetector;

    switch (waitInfo.type) {
      case 'networkIdle':
        if (waitDetector) {
          await waitDetector.waitForStable(this.state.options.timeout);
        } else {
          await this.sleep(500);
        }
        break;

      case 'domSettled':
        await this.sleep(waitInfo.duration || 500);
        break;

      case 'elementAppeared':
        if (step.element?.recommended && waitDetector) {
          await waitDetector.waitForElement(step.element.recommended, this.state.options.timeout);
        } else {
          await this.sleep(300);
        }
        break;

      case 'loadingComplete':
        if (waitDetector) {
          await waitDetector.waitForStable(this.state.options.timeout);
        } else {
          await this.sleep(1000);
        }
        break;

      default:
        await this.sleep(Math.min(waitInfo.duration || 300, 3000));
    }
  },

  /**
   * Performs the actual DOM action
   * @param {string} type - Action type
   * @param {Element} element - Target element
   * @param {string} value - Processed value
   * @param {Object} step - Full step object
   * @returns {Promise<void>}
   */
  async performAction(type, element, value, step) {
    switch (type) {
      case 'click':
        await this.performClick(element, step);
        break;

      case 'dblclick':
        await this.performDoubleClick(element, step);
        break;

      case 'type':
        await this.performType(element, value, step);
        break;

      case 'keypress':
        await this.performKeypress(element, step.key, step.modifiers);
        break;

      case 'select':
        await this.performSelect(element, value);
        break;

      case 'scroll':
        await this.performScroll(step.scrollTo);
        break;

      case 'hover':
        await this.performHover(element);
        break;

      case 'navigate':
        await this.performNavigate(step.context?.url);
        break;

      case 'drag':
        await this.performDrag(step);
        break;

      case 'fileUpload':
        // File upload cannot be fully automated for security
        await this.requestManualIntervention('fileUpload', step);
        break;

      case 'submit':
        await this.performSubmit(element);
        break;

      default:
        console.warn(`Unknown action type: ${type}`);
    }
  },

  /**
   * Performs a click action
   */
  async performClick(element, step) {
    // Scroll into view if needed
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await this.sleep(100);

    // Get click coordinates
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    // Create and dispatch mouse events
    const eventOptions = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      button: step.button || 0
    };

    element.dispatchEvent(new MouseEvent('mousedown', eventOptions));
    element.dispatchEvent(new MouseEvent('mouseup', eventOptions));
    element.dispatchEvent(new MouseEvent('click', eventOptions));

    // Also call click() method as fallback
    if (typeof element.click === 'function') {
      element.click();
    }
  },

  /**
   * Performs a double-click action
   */
  async performDoubleClick(element, step) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await this.sleep(100);

    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    const eventOptions = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y
    };

    element.dispatchEvent(new MouseEvent('dblclick', eventOptions));
  },

  /**
   * Performs a type action
   */
  async performType(element, value, step) {
    // Focus the element
    element.focus();
    await this.sleep(50);

    // Clear existing value
    if ('value' in element) {
      element.value = '';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (element.isContentEditable) {
      element.textContent = '';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Type character by character for realistic simulation
    for (const char of (value || '')) {
      if ('value' in element) {
        element.value += char;
      } else if (element.isContentEditable) {
        element.textContent += char;
      }

      element.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));

      await this.sleep(REPLAY_CONFIG.TYPE_CHAR_DELAY);
    }

    // Trigger change event
    element.dispatchEvent(new Event('change', { bubbles: true }));
  },

  /**
   * Performs a keypress action
   */
  async performKeypress(element, key, modifiers = {}) {
    const eventOptions = {
      key,
      bubbles: true,
      cancelable: true,
      ctrlKey: modifiers?.ctrl || false,
      shiftKey: modifiers?.shift || false,
      altKey: modifiers?.alt || false,
      metaKey: modifiers?.meta || false
    };

    element.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
    element.dispatchEvent(new KeyboardEvent('keypress', eventOptions));
    element.dispatchEvent(new KeyboardEvent('keyup', eventOptions));

    // Handle special keys
    if (key === 'Enter' && element.form) {
      element.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }
  },

  /**
   * Performs a select action
   */
  async performSelect(element, value) {
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  },

  /**
   * Performs a scroll action
   */
  async performScroll(scrollTo) {
    if (scrollTo) {
      window.scrollTo({
        top: scrollTo.y || 0,
        left: scrollTo.x || 0,
        behavior: 'smooth'
      });
      await this.sleep(300);
    }
  },

  /**
   * Performs a hover action
   */
  async performHover(element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await this.sleep(100);

    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    element.dispatchEvent(new MouseEvent('mouseenter', {
      bubbles: true,
      clientX: x,
      clientY: y
    }));

    element.dispatchEvent(new MouseEvent('mouseover', {
      bubbles: true,
      clientX: x,
      clientY: y
    }));
  },

  /**
   * Performs a navigation action
   */
  async performNavigate(url) {
    if (url && url !== window.location.href) {
      window.location.href = url;
      // Wait for navigation
      await this.sleep(2000);
    }
  },

  /**
   * Performs a drag action
   */
  async performDrag(step) {
    const sourceElement = await this.findElement(step.sourceElement?.selectors, step);
    const targetElement = await this.findElement(step.targetElement?.selectors, step);

    if (!sourceElement || !targetElement) {
      throw new Error('Could not find source or target element for drag');
    }

    const sourceRect = sourceElement.getBoundingClientRect();
    const targetRect = targetElement.getBoundingClientRect();

    // Dispatch drag events
    const dataTransfer = new DataTransfer();

    sourceElement.dispatchEvent(new DragEvent('dragstart', {
      bubbles: true,
      dataTransfer,
      clientX: sourceRect.left + sourceRect.width / 2,
      clientY: sourceRect.top + sourceRect.height / 2
    }));

    await this.sleep(100);

    targetElement.dispatchEvent(new DragEvent('dragover', {
      bubbles: true,
      dataTransfer,
      clientX: targetRect.left + targetRect.width / 2,
      clientY: targetRect.top + targetRect.height / 2
    }));

    targetElement.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      dataTransfer,
      clientX: targetRect.left + targetRect.width / 2,
      clientY: targetRect.top + targetRect.height / 2
    }));

    sourceElement.dispatchEvent(new DragEvent('dragend', {
      bubbles: true,
      dataTransfer
    }));
  },

  /**
   * Performs a form submit action
   */
  async performSubmit(element) {
    if (element.tagName === 'FORM') {
      element.submit();
    } else if (element.form) {
      element.form.submit();
    } else {
      element.dispatchEvent(new Event('submit', { bubbles: true }));
    }
  },

  /**
   * Injects variable values into a string
   * @param {string} recordedValue - Original value with {{placeholders}}
   * @param {Object} variables - Variable values map
   * @returns {string} Processed value
   */
  injectValue(recordedValue, variables) {
    if (!recordedValue || typeof recordedValue !== 'string') return recordedValue;
    if (!variables || Object.keys(variables).length === 0) return recordedValue;

    return recordedValue.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      if (varName in variables) {
        return variables[varName];
      }
      console.warn(`Variable not found: ${varName}`);
      return match; // Keep original if not found
    });
  },

  /**
   * Shows pause confirmation overlay before executing step
   * @param {Object} step - The step about to execute
   * @returns {Promise<'continue'|'cancel'|'takeover'>}
   */
  async showPauseConfirmation(step) {
    return new Promise((resolve) => {
      const overlay = window.FormGhostReplayOverlay;
      if (!overlay) {
        resolve('continue');
        return;
      }

      // Find the element to highlight
      this.findElement(step.element?.selectors, step).then(element => {
        overlay.showConfirmation(element, step, {
          onContinue: () => resolve('continue'),
          onCancel: () => resolve('cancel'),
          onTakeOver: () => resolve('takeover')
        });
      });
    });
  },

  /**
   * Shows takeover prompt when element not found
   * @param {Object} step - The problematic step
   * @param {string} reason - Why takeover is needed
   * @returns {Promise<'takeover'|'cancel'|'skip'>}
   */
  async showTakeoverPrompt(step, reason) {
    return new Promise((resolve) => {
      const overlay = window.FormGhostReplayOverlay;
      if (!overlay) {
        resolve('cancel');
        return;
      }

      overlay.showTakeoverPrompt(step, reason, {
        onTakeOver: () => resolve('takeover'),
        onCancel: () => resolve('cancel'),
        onSkip: () => resolve('skip')
      });
    });
  },

  /**
   * Handles manual takeover mode
   * @param {Object} step - The step user is completing manually
   */
  async handleTakeover(step) {
    this.state.isTakeover = true;
    this.broadcastTakeover(step);

    // Show takeover UI
    if (window.FormGhostReplayOverlay) {
      await window.FormGhostReplayOverlay.showTakeoverMode(step, {
        onComplete: () => {
          this.state.isTakeover = false;
        },
        onCancel: () => {
          this.state.isTakeover = false;
          this.cancel();
        }
      });
    }

    // Wait for takeover to complete
    while (this.state.isTakeover && !this.state.abortController.signal.aborted) {
      await this.sleep(100);
    }
  },

  /**
   * Request manual intervention for actions that can't be automated
   */
  async requestManualIntervention(actionType, step) {
    const message = actionType === 'fileUpload'
      ? 'File uploads require manual action. Please select the file(s) and click Continue.'
      : `This action (${actionType}) requires manual intervention.`;

    return this.showTakeoverPrompt(step, message);
  },

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  /**
   * Checks if element is interactable
   */
  isElementInteractable(element) {
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      !element.disabled
    );
  },

  /**
   * Checks if action type requires an element
   */
  actionRequiresElement(type) {
    const noElementActions = ['navigate', 'scroll', 'newTab', 'switchTab', 'closeTab'];
    return !noElementActions.includes(type);
  },

  // ============================================================================
  // COMMUNICATION METHODS
  // ============================================================================

  broadcastProgress(current, total, stepInfo) {
    chrome.runtime.sendMessage({
      type: 'REPLAY_PROGRESS',
      current,
      total,
      stepInfo: {
        type: stepInfo?.type,
        humanLabel: stepInfo?.element?.humanLabel
      }
    }).catch(() => {});
  },

  broadcastComplete(results) {
    chrome.runtime.sendMessage({
      type: 'REPLAY_COMPLETE',
      results
    }).catch(() => {});
  },

  broadcastTakeover(step) {
    chrome.runtime.sendMessage({
      type: 'REPLAY_TAKEOVER',
      step: {
        type: step?.type,
        humanLabel: step?.element?.humanLabel
      }
    }).catch(() => {});
  },

  // ============================================================================
  // CONTROL METHODS
  // ============================================================================

  pause() {
    this.state.isPaused = true;
    chrome.runtime.sendMessage({ type: 'REPLAY_PAUSED' }).catch(() => {});
    if (window.FormGhostReplayOverlay) {
      window.FormGhostReplayOverlay.showPaused();
    }
  },

  resume() {
    this.state.isPaused = false;
    chrome.runtime.sendMessage({ type: 'REPLAY_RESUMED' }).catch(() => {});
    if (window.FormGhostReplayOverlay) {
      window.FormGhostReplayOverlay.hidePaused();
    }
  },

  cancel() {
    this.state.abortController?.abort();
    this.state.isReplaying = false;
    this.state.isPaused = false;
    this.state.isTakeover = false;
    chrome.runtime.sendMessage({ type: 'REPLAY_CANCELLED' }).catch(() => {});
    if (window.FormGhostReplayOverlay) {
      window.FormGhostReplayOverlay.hideAll();
    }
  },

  /**
   * Gets current replay state
   */
  getState() {
    return {
      isReplaying: this.state.isReplaying,
      isPaused: this.state.isPaused,
      isTakeover: this.state.isTakeover,
      currentStep: this.state.currentStepIndex,
      totalSteps: this.state.totalSteps
    };
  }
};

// ============================================================================
// MESSAGE LISTENER
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('FormGhost Replayer received message:', message.type);

  switch (message.type) {
    case 'START_REPLAY':
      FormGhostReplayer.replayWorkflow(
        message.workflow,
        message.variables || {},
        message.options || {}
      ).then(results => {
        sendResponse({ success: true, results });
      }).catch(error => {
        sendResponse({ success: false, error: error.message });
      });
      return true; // Async response

    case 'PAUSE_REPLAY':
      FormGhostReplayer.pause();
      sendResponse({ success: true });
      return true;

    case 'RESUME_REPLAY':
      FormGhostReplayer.resume();
      sendResponse({ success: true });
      return true;

    case 'CANCEL_REPLAY':
      FormGhostReplayer.cancel();
      sendResponse({ success: true });
      return true;

    case 'GET_REPLAY_STATE':
      sendResponse({ success: true, state: FormGhostReplayer.getState() });
      return true;

    case 'COMPLETE_TAKEOVER':
      FormGhostReplayer.state.isTakeover = false;
      sendResponse({ success: true });
      return true;

    default:
      return false;
  }
});

// Expose to global scope
window.FormGhostReplayer = FormGhostReplayer;

console.log('FormGhost Replayer: Content script loaded');
