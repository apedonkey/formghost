/**
 * Puppeteer Recorder Pro - Wait Detector
 * Smart detection of DOM settling, network idle, and element appearance
 */

/**
 * Configuration for wait detection
 */
const WAIT_CONFIG = {
  DOM_SETTLE_THRESHOLD: 500,      // ms of no DOM mutations to consider settled
  NETWORK_IDLE_THRESHOLD: 500,    // ms of no network activity
  LOADING_INDICATOR_CHECK: true,  // Check for loading spinners
  MAX_WAIT_TIME: 10000,           // Maximum wait detection time
  MUTATION_DEBOUNCE: 100          // Debounce interval for mutations
};

/**
 * Common loading indicator selectors
 */
const LOADING_INDICATORS = [
  '.loading',
  '.spinner',
  '.loader',
  '[aria-busy="true"]',
  '[data-loading]',
  '.skeleton',
  '.shimmer',
  '[class*="loading"]',
  '[class*="spinner"]',
  '[class*="loader"]'
];

/**
 * Wait Detector class for monitoring page state
 */
class WaitDetector {
  constructor() {
    this.mutationObserver = null;
    this.lastMutationTime = 0;
    this.mutationCount = 0;
    this.isObserving = false;
    this.pendingXHR = new Set();
    this.pendingFetch = new Set();
    this.lastNetworkActivity = 0;
    this.listeners = [];
  }

  /**
   * Starts observing DOM mutations
   */
  startObserving() {
    if (this.isObserving) return;

    this.mutationObserver = new MutationObserver((mutations) => {
      this.lastMutationTime = Date.now();
      this.mutationCount += mutations.length;
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });

    this.interceptNetwork();
    this.isObserving = true;
  }

  /**
   * Stops observing
   */
  stopObserving() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
    this.isObserving = false;
    this.restoreNetwork();
  }

  /**
   * Intercepts network requests to track pending activity
   */
  interceptNetwork() {
    // Intercept XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    const detector = this;

    XMLHttpRequest.prototype.open = function(method, url) {
      this._recorderUrl = url;
      return originalXHROpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function() {
      const xhr = this;
      const requestId = Math.random().toString(36);
      detector.pendingXHR.add(requestId);
      detector.lastNetworkActivity = Date.now();

      xhr.addEventListener('loadend', () => {
        detector.pendingXHR.delete(requestId);
        detector.lastNetworkActivity = Date.now();
      });

      return originalXHRSend.apply(this, arguments);
    };

    // Intercept fetch
    const originalFetch = window.fetch;
    window.fetch = function() {
      const requestId = Math.random().toString(36);
      detector.pendingFetch.add(requestId);
      detector.lastNetworkActivity = Date.now();

      return originalFetch.apply(this, arguments)
        .finally(() => {
          detector.pendingFetch.delete(requestId);
          detector.lastNetworkActivity = Date.now();
        });
    };

    // Store originals for restoration
    this._originalXHROpen = originalXHROpen;
    this._originalXHRSend = originalXHRSend;
    this._originalFetch = originalFetch;
  }

  /**
   * Restores original network methods
   */
  restoreNetwork() {
    if (this._originalXHROpen) {
      XMLHttpRequest.prototype.open = this._originalXHROpen;
    }
    if (this._originalXHRSend) {
      XMLHttpRequest.prototype.send = this._originalXHRSend;
    }
    if (this._originalFetch) {
      window.fetch = this._originalFetch;
    }
  }

  /**
   * Checks if DOM has settled (no recent mutations)
   * @returns {boolean}
   */
  isDOMSettled() {
    const timeSinceLastMutation = Date.now() - this.lastMutationTime;
    return timeSinceLastMutation >= WAIT_CONFIG.DOM_SETTLE_THRESHOLD;
  }

  /**
   * Checks if network is idle (no pending requests)
   * @returns {boolean}
   */
  isNetworkIdle() {
    const hasPending = this.pendingXHR.size > 0 || this.pendingFetch.size > 0;
    if (hasPending) return false;

    const timeSinceLastNetwork = Date.now() - this.lastNetworkActivity;
    return timeSinceLastNetwork >= WAIT_CONFIG.NETWORK_IDLE_THRESHOLD;
  }

  /**
   * Checks for visible loading indicators
   * @returns {boolean} True if loading indicators are visible
   */
  hasLoadingIndicators() {
    if (!WAIT_CONFIG.LOADING_INDICATOR_CHECK) return false;

    for (const selector of LOADING_INDICATORS) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          const isVisible = (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0'
          );
          if (isVisible) return true;
        }
      } catch (e) {
        // Invalid selector, skip
      }
    }
    return false;
  }

  /**
   * Detects the type of wait that was needed
   * @param {number} startTime - When detection started
   * @returns {Object} Wait detection result
   */
  detectWaitType(startTime) {
    const now = Date.now();
    const duration = now - startTime;

    const domSettled = this.isDOMSettled();
    const networkIdle = this.isNetworkIdle();
    const noLoading = !this.hasLoadingIndicators();

    // Determine primary wait type
    let type = 'immediate';
    let suggestedWait = null;
    let confidence = 0.9;

    if (!networkIdle && duration > 100) {
      type = 'networkIdle';
      suggestedWait = 'await page.waitForNetworkIdle()';
      confidence = 0.85;
    } else if (!domSettled && duration > 100) {
      type = 'domSettled';
      suggestedWait = `await page.waitForTimeout(${WAIT_CONFIG.DOM_SETTLE_THRESHOLD})`;
      confidence = 0.75;
    } else if (!noLoading) {
      type = 'loadingComplete';
      suggestedWait = "await page.waitForSelector('.loading', { hidden: true })";
      confidence = 0.70;
    }

    return {
      type,
      duration,
      confidence,
      suggestedWait,
      details: {
        domSettled,
        networkIdle,
        noLoadingIndicators: noLoading,
        pendingRequests: this.pendingXHR.size + this.pendingFetch.size,
        mutationCount: this.mutationCount
      }
    };
  }

  /**
   * Waits for page to become stable
   * @param {number} timeout - Maximum wait time in ms
   * @returns {Promise<Object>} Wait result
   */
  async waitForStable(timeout = WAIT_CONFIG.MAX_WAIT_TIME) {
    const startTime = Date.now();
    this.mutationCount = 0;

    return new Promise((resolve) => {
      const checkStability = () => {
        const elapsed = Date.now() - startTime;

        if (elapsed >= timeout) {
          resolve(this.detectWaitType(startTime));
          return;
        }

        if (this.isDOMSettled() && this.isNetworkIdle() && !this.hasLoadingIndicators()) {
          resolve(this.detectWaitType(startTime));
          return;
        }

        setTimeout(checkStability, WAIT_CONFIG.MUTATION_DEBOUNCE);
      };

      checkStability();
    });
  }

  /**
   * Waits for a specific element to appear
   * @param {string} selector - CSS selector
   * @param {number} timeout - Maximum wait time in ms
   * @returns {Promise<Object>} Wait result
   */
  async waitForElement(selector, timeout = 5000) {
    const startTime = Date.now();

    return new Promise((resolve) => {
      // Check if element already exists
      const existing = document.querySelector(selector);
      if (existing) {
        resolve({
          type: 'elementAppeared',
          duration: 0,
          confidence: 0.95,
          suggestedWait: `await page.waitForSelector('${selector}')`,
          element: existing
        });
        return;
      }

      // Set up mutation observer for element appearance
      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element) {
          observer.disconnect();
          resolve({
            type: 'elementAppeared',
            duration: Date.now() - startTime,
            confidence: 0.90,
            suggestedWait: `await page.waitForSelector('${selector}')`,
            element
          });
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      // Timeout handler
      setTimeout(() => {
        observer.disconnect();
        resolve({
          type: 'timeout',
          duration: timeout,
          confidence: 0.5,
          suggestedWait: `await page.waitForSelector('${selector}', { timeout: ${timeout} })`,
          element: null
        });
      }, timeout);
    });
  }

  /**
   * Gets current page load state
   * @returns {Object} Current state info
   */
  getCurrentState() {
    return {
      readyState: document.readyState,
      domSettled: this.isDOMSettled(),
      networkIdle: this.isNetworkIdle(),
      hasLoadingIndicators: this.hasLoadingIndicators(),
      pendingXHR: this.pendingXHR.size,
      pendingFetch: this.pendingFetch.size,
      lastMutationTime: this.lastMutationTime,
      lastNetworkActivity: this.lastNetworkActivity
    };
  }

  /**
   * Records wait information before an action
   * @param {number} actionStartTime - When the action was triggered
   * @returns {Object} Wait info for the action
   */
  getWaitInfo(actionStartTime) {
    const timeSinceLastAction = actionStartTime - this.lastMutationTime;
    const networkWasActive = !this.isNetworkIdle();

    let suggestedWait = null;
    let waitType = 'none';
    let confidence = 0.9;

    // If there was significant activity before this action
    if (timeSinceLastAction < 1000) {
      if (networkWasActive) {
        waitType = 'networkIdle';
        suggestedWait = 'await page.waitForNetworkIdle()';
        confidence = 0.85;
      } else {
        waitType = 'domSettled';
        suggestedWait = `await page.waitForTimeout(500)`;
        confidence = 0.75;
      }
    }

    return {
      type: waitType,
      duration: timeSinceLastAction,
      confidence,
      suggestedWait,
      state: this.getCurrentState()
    };
  }
}

// Create singleton instance
const waitDetector = new WaitDetector();

// Expose to global scope
window.PuppeteerRecorderWaitDetector = {
  detector: waitDetector,
  start: () => waitDetector.startObserving(),
  stop: () => waitDetector.stopObserving(),
  waitForStable: (timeout) => waitDetector.waitForStable(timeout),
  waitForElement: (selector, timeout) => waitDetector.waitForElement(selector, timeout),
  getWaitInfo: (time) => waitDetector.getWaitInfo(time),
  getCurrentState: () => waitDetector.getCurrentState()
};
