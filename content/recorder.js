/**
 * Puppeteer Recorder Pro - Event Recorder
 * Main event capture logic for clicks, typing, and interactions
 */

/**
 * Recorder state
 */
const RecorderState = {
  isRecording: false,
  isPaused: false,
  settings: null,
  lastActionTime: 0,
  inputBuffer: new Map(), // Track input changes
  actionCounter: 0,
  consoleMessages: [],
  networkIntercepted: false
};

/**
 * Keys that should be captured as separate actions
 */
const SPECIAL_KEYS = ['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

/**
 * URLs to ignore for network capture (analytics, tracking, etc.)
 */
const IGNORED_NETWORK_PATTERNS = [
  'google-analytics.com',
  'googletagmanager.com',
  'facebook.com/tr',
  'doubleclick.net',
  'analytics.',
  '/collect?',
  'hotjar.com',
  'clarity.ms'
];

/**
 * Checks if URL should be ignored for network capture
 * @param {string} url - URL to check
 * @returns {boolean}
 */
function shouldIgnoreNetworkRequest(url) {
  return IGNORED_NETWORK_PATTERNS.some(pattern => url.includes(pattern));
}

/**
 * Truncates large bodies for storage efficiency
 * @param {any} body - Request/response body
 * @param {number} maxSize - Maximum size in characters
 * @returns {any}
 */
function truncateBody(body, maxSize = 10000) {
  if (!body) return null;
  const str = typeof body === 'string' ? body : JSON.stringify(body);
  if (str.length > maxSize) {
    return str.substring(0, maxSize) + '... [truncated]';
  }
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

/**
 * Intercepts fetch and XHR to capture request/response bodies
 */
function setupNetworkInterception() {
  if (RecorderState.networkIntercepted) return;
  RecorderState.networkIntercepted = true;

  // Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const [resource, options = {}] = args;
    const url = typeof resource === 'string' ? resource : resource.url;

    if (!RecorderState.isRecording || RecorderState.isPaused || shouldIgnoreNetworkRequest(url)) {
      return originalFetch.apply(this, args);
    }

    const startTime = Date.now();
    let requestBody = null;

    try {
      if (options.body) {
        if (typeof options.body === 'string') {
          requestBody = truncateBody(options.body);
        } else if (options.body instanceof FormData) {
          requestBody = '[FormData]';
        } else {
          requestBody = truncateBody(options.body);
        }
      }
    } catch (e) {
      requestBody = '[Unable to capture]';
    }

    try {
      const response = await originalFetch.apply(this, args);
      const clonedResponse = response.clone();

      // Capture response body asynchronously
      clonedResponse.text().then(text => {
        if (RecorderState.isRecording && RecorderState.settings?.captureNetwork) {
          chrome.runtime.sendMessage({
            type: 'NETWORK_CAPTURED',
            request: {
              id: `fetch_${Date.now()}`,
              url,
              method: options.method || 'GET',
              type: 'fetch',
              requestBody,
              responseStatus: response.status,
              responseBody: truncateBody(text),
              timing: {
                started: startTime,
                ended: Date.now(),
                duration: Date.now() - startTime
              }
            }
          }).catch(() => {});
        }
      }).catch(() => {});

      return response;
    } catch (error) {
      throw error;
    }
  };

  // Intercept XMLHttpRequest
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._recorderMethod = method;
    this._recorderUrl = url;
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function(body) {
    const xhr = this;
    const startTime = Date.now();
    const url = xhr._recorderUrl;
    const method = xhr._recorderMethod;

    if (!RecorderState.isRecording || RecorderState.isPaused || shouldIgnoreNetworkRequest(url)) {
      return originalXHRSend.apply(this, arguments);
    }

    const requestBody = truncateBody(body);

    xhr.addEventListener('load', function() {
      if (RecorderState.isRecording && RecorderState.settings?.captureNetwork) {
        chrome.runtime.sendMessage({
          type: 'NETWORK_CAPTURED',
          request: {
            id: `xhr_${Date.now()}`,
            url,
            method,
            type: 'xhr',
            requestBody,
            responseStatus: xhr.status,
            responseBody: truncateBody(xhr.responseText),
            timing: {
              started: startTime,
              ended: Date.now(),
              duration: Date.now() - startTime
            }
          }
        }).catch(() => {});
      }
    });

    return originalXHRSend.apply(this, arguments);
  };
}

/**
 * Captures console messages
 */
function setupConsoleCapture() {
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error
  };

  ['log', 'warn', 'error'].forEach(level => {
    console[level] = function(...args) {
      if (RecorderState.isRecording && !RecorderState.isPaused) {
        RecorderState.consoleMessages.push({
          level,
          message: args.map(a => {
            try {
              return typeof a === 'object' ? JSON.stringify(a) : String(a);
            } catch {
              return String(a);
            }
          }).join(' '),
          timestamp: Date.now()
        });

        // Send to background (batch every 10 messages)
        if (RecorderState.consoleMessages.length >= 10) {
          chrome.runtime.sendMessage({
            type: 'CONSOLE_CAPTURED',
            messages: RecorderState.consoleMessages.splice(0, 10)
          }).catch(() => {});
        }
      }
      return originalConsole[level].apply(console, args);
    };
  });

  // Capture unhandled errors
  window.addEventListener('error', (event) => {
    if (RecorderState.isRecording && !RecorderState.isPaused) {
      RecorderState.consoleMessages.push({
        level: 'error',
        message: `${event.message} at ${event.filename}:${event.lineno}`,
        timestamp: Date.now()
      });
    }
  });
}

/**
 * Elements to ignore for click recording
 */
const IGNORED_CLICK_TARGETS = [
  '[data-recorder-ignore]',
  '.puppeteer-recorder-overlay',
  '.puppeteer-recorder-annotate',
  '#puppeteer-recorder-sidebar',
  '[id^="prp-"]'
];

/**
 * Checks if element should be ignored
 * @param {Element} element - Element to check
 * @returns {boolean}
 */
function shouldIgnoreElement(element) {
  for (const selector of IGNORED_CLICK_TARGETS) {
    if (element.matches(selector) || element.closest(selector)) {
      return true;
    }
  }
  return false;
}

/**
 * Gets viewport information
 * @returns {Object} Viewport dimensions
 */
function getViewportInfo() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY
  };
}

/**
 * Gets iframe path from current frame to top
 * @returns {Array<string>} Array of frame selectors
 */
function getFramePath() {
  if (window.self === window.top) return [];

  const path = [];
  let currentWindow = window;

  while (currentWindow !== window.top) {
    try {
      const parentDoc = currentWindow.parent.document;
      const frames = parentDoc.querySelectorAll('iframe, frame');

      for (const frame of frames) {
        if (frame.contentWindow === currentWindow) {
          // Get selector for this iframe
          const selector = frame.id ? `#${frame.id}` :
                          frame.name ? `iframe[name="${frame.name}"]` :
                          frame.src ? `iframe[src*="${new URL(frame.src).pathname}"]` :
                          'iframe';
          path.unshift(selector);
          break;
        }
      }
    } catch (e) {
      // Cross-origin iframe - can't access parent
      path.unshift('[cross-origin-iframe]');
    }

    currentWindow = currentWindow.parent;
  }

  return path;
}

/**
 * Creates action context
 * @returns {Object} Context object
 */
function createContext() {
  const isInIframe = window.self !== window.top;
  const framePath = getFramePath();

  return {
    url: window.location.href,
    pageTitle: document.title,
    frameId: isInIframe ? 1 : 0,
    isInIframe,
    framePath: framePath.length > 0 ? framePath : null,
    frameSelector: framePath.length > 0 ? framePath.join(' >> ') : null,
    timestamp: Date.now()
  };
}

/**
 * Sends action to background script
 * @param {Object} action - Action data
 */
function sendAction(action) {
  if (!RecorderState.isRecording || RecorderState.isPaused) return;

  const now = Date.now();
  const timeSinceLastAction = now - RecorderState.lastActionTime;
  RecorderState.lastActionTime = now;
  RecorderState.actionCounter++;

  const fullAction = {
    ...action,
    timing: {
      sinceLastAction: timeSinceLastAction,
      actionIndex: RecorderState.actionCounter
    },
    context: createContext(),
    waitBefore: window.PuppeteerRecorderWaitDetector?.getWaitInfo(now)
  };

  // Send to background
  chrome.runtime.sendMessage({
    type: 'ACTION_CAPTURED',
    action: fullAction
  }).catch(err => {
    console.warn('Failed to send action:', err);
  });

  // Update sidebar preview (if available)
  if (window.PreviewSidebar && window.PreviewSidebar.isVisible) {
    window.PreviewSidebar.addAction(fullAction);
  }
}

/**
 * Flushes any pending input for an element
 * @param {Element} element - Input element
 */
function flushInputBuffer(element) {
  const key = element;
  const buffer = RecorderState.inputBuffer.get(key);

  if (buffer && buffer.value !== buffer.initialValue) {
    const elementInfo = window.PuppeteerRecorderSelectors?.getElementInfo(element);

    sendAction({
      type: 'type',
      element: elementInfo,
      value: buffer.value,
      valueBefore: buffer.initialValue,
      timestamp: buffer.lastInputTime
    });
  }

  RecorderState.inputBuffer.delete(key);
}

/**
 * Handles click events
 * @param {MouseEvent} event - Click event
 */
function handleClick(event) {
  if (!RecorderState.isRecording || RecorderState.isPaused) return;

  const target = event.target;
  if (shouldIgnoreElement(target)) return;

  // Flush any pending input before click
  for (const [element] of RecorderState.inputBuffer) {
    flushInputBuffer(element);
  }

  const elementInfo = window.PuppeteerRecorderSelectors?.getElementInfo(target);
  if (!elementInfo) return;

  const rect = target.getBoundingClientRect();

  sendAction({
    type: 'click',
    element: elementInfo,
    coordinates: {
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      viewport: getViewportInfo()
    },
    button: event.button,
    modifiers: {
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      alt: event.altKey,
      meta: event.metaKey
    },
    timestamp: Date.now()
  });
}

/**
 * Handles double-click events
 * @param {MouseEvent} event - Double click event
 */
function handleDblClick(event) {
  if (!RecorderState.isRecording || RecorderState.isPaused) return;

  const target = event.target;
  if (shouldIgnoreElement(target)) return;

  const elementInfo = window.PuppeteerRecorderSelectors?.getElementInfo(target);
  if (!elementInfo) return;

  sendAction({
    type: 'dblclick',
    element: elementInfo,
    coordinates: {
      x: event.clientX,
      y: event.clientY,
      viewport: getViewportInfo()
    },
    timestamp: Date.now()
  });
}

/**
 * Handles input events (text entry)
 * @param {InputEvent} event - Input event
 */
function handleInput(event) {
  if (!RecorderState.isRecording || RecorderState.isPaused) return;

  const target = event.target;
  if (shouldIgnoreElement(target)) return;

  // Only track text inputs
  const trackableInputs = ['text', 'password', 'email', 'search', 'tel', 'url', 'number'];
  const isTrackable = (
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable ||
    (target.tagName === 'INPUT' && trackableInputs.includes(target.type || 'text'))
  );

  if (!isTrackable) return;

  const key = target;
  let buffer = RecorderState.inputBuffer.get(key);

  if (!buffer) {
    buffer = {
      initialValue: '',
      value: '',
      lastInputTime: Date.now()
    };
    RecorderState.inputBuffer.set(key, buffer);
  }

  buffer.value = target.value || target.textContent;
  buffer.lastInputTime = Date.now();
}

/**
 * Handles focus out (blur) to capture completed input
 * @param {FocusEvent} event - Focus event
 */
function handleFocusOut(event) {
  if (!RecorderState.isRecording || RecorderState.isPaused) return;

  const target = event.target;
  if (RecorderState.inputBuffer.has(target)) {
    flushInputBuffer(target);
  }
}

/**
 * Handles keydown for special keys
 * @param {KeyboardEvent} event - Keyboard event
 */
function handleKeyDown(event) {
  if (!RecorderState.isRecording || RecorderState.isPaused) return;

  if (!SPECIAL_KEYS.includes(event.key)) return;

  const target = event.target;
  if (shouldIgnoreElement(target)) return;

  // For Enter key, flush the input buffer first
  if (event.key === 'Enter' && RecorderState.inputBuffer.has(target)) {
    flushInputBuffer(target);
  }

  const elementInfo = window.PuppeteerRecorderSelectors?.getElementInfo(target);

  sendAction({
    type: 'keypress',
    element: elementInfo,
    key: event.key,
    code: event.code,
    modifiers: {
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      alt: event.altKey,
      meta: event.metaKey
    },
    timestamp: Date.now()
  });
}

/**
 * Handles change events for select elements
 * @param {Event} event - Change event
 */
function handleChange(event) {
  if (!RecorderState.isRecording || RecorderState.isPaused) return;

  const target = event.target;
  if (shouldIgnoreElement(target)) return;

  if (target.tagName !== 'SELECT') return;

  const elementInfo = window.PuppeteerRecorderSelectors?.getElementInfo(target);
  const selectedOptions = Array.from(target.selectedOptions).map(opt => ({
    value: opt.value,
    text: opt.text,
    index: opt.index
  }));

  sendAction({
    type: 'select',
    element: elementInfo,
    value: target.value,
    selectedOptions,
    timestamp: Date.now()
  });
}

/**
 * Handles scroll events (debounced)
 */
let scrollTimeout = null;
let scrollStartPosition = null;

function handleScroll() {
  if (!RecorderState.isRecording || RecorderState.isPaused) return;

  if (!scrollStartPosition) {
    scrollStartPosition = {
      x: window.scrollX,
      y: window.scrollY
    };
  }

  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
  }

  scrollTimeout = setTimeout(() => {
    const endPosition = {
      x: window.scrollX,
      y: window.scrollY
    };

    // Only record significant scrolls (50px threshold)
    const deltaX = Math.abs(endPosition.x - scrollStartPosition.x);
    const deltaY = Math.abs(endPosition.y - scrollStartPosition.y);

    if (deltaX > 50 || deltaY > 50) {
      sendAction({
        type: 'scroll',
        scrollTo: endPosition,
        scrollFrom: scrollStartPosition,
        delta: { x: deltaX, y: deltaY },
        viewport: getViewportInfo(),
        timestamp: Date.now()
      });
    }

    scrollStartPosition = null;
    scrollTimeout = null;
  }, 300);
}

/**
 * Handles form submissions
 * @param {SubmitEvent} event - Submit event
 */
function handleSubmit(event) {
  if (!RecorderState.isRecording || RecorderState.isPaused) return;

  const form = event.target;
  if (shouldIgnoreElement(form)) return;

  // Flush all inputs in the form
  for (const [element] of RecorderState.inputBuffer) {
    if (form.contains(element)) {
      flushInputBuffer(element);
    }
  }

  const elementInfo = window.PuppeteerRecorderSelectors?.getElementInfo(form);

  sendAction({
    type: 'submit',
    element: elementInfo,
    formAction: form.action,
    formMethod: form.method,
    timestamp: Date.now()
  });
}

/**
 * Handles drag start events
 * @param {DragEvent} event - Drag event
 */
let dragData = null;

function handleDragStart(event) {
  if (!RecorderState.isRecording || RecorderState.isPaused) return;

  const target = event.target;
  if (shouldIgnoreElement(target)) return;

  const elementInfo = window.PuppeteerRecorderSelectors?.getElementInfo(target);
  if (!elementInfo) return;

  dragData = {
    sourceElement: elementInfo,
    startTime: Date.now(),
    startCoordinates: {
      x: event.clientX,
      y: event.clientY
    }
  };
}

/**
 * Handles drop events
 * @param {DragEvent} event - Drag event
 */
function handleDrop(event) {
  if (!RecorderState.isRecording || RecorderState.isPaused) return;
  if (!dragData) return;

  const target = event.target;
  if (shouldIgnoreElement(target)) return;

  const targetElementInfo = window.PuppeteerRecorderSelectors?.getElementInfo(target);

  sendAction({
    type: 'drag',
    sourceElement: dragData.sourceElement,
    targetElement: targetElementInfo,
    coordinates: {
      startX: dragData.startCoordinates.x,
      startY: dragData.startCoordinates.y,
      endX: event.clientX,
      endY: event.clientY,
      viewport: getViewportInfo()
    },
    dataTransfer: event.dataTransfer?.types ? Array.from(event.dataTransfer.types) : [],
    timestamp: Date.now()
  });

  dragData = null;
}

/**
 * Handles drag end (cleanup)
 * @param {DragEvent} event - Drag event
 */
function handleDragEnd(event) {
  dragData = null;
}

/**
 * Handles file input changes (file uploads)
 * @param {Event} event - Change event on file input
 */
function handleFileSelect(event) {
  if (!RecorderState.isRecording || RecorderState.isPaused) return;

  const target = event.target;
  if (target.type !== 'file') return;
  if (shouldIgnoreElement(target)) return;

  const elementInfo = window.PuppeteerRecorderSelectors?.getElementInfo(target);
  const files = Array.from(target.files || []).map(f => ({
    name: f.name,
    size: f.size,
    type: f.type,
    lastModified: f.lastModified
  }));

  if (files.length > 0) {
    sendAction({
      type: 'fileUpload',
      element: elementInfo,
      files,
      timestamp: Date.now()
    });
  }
}

/**
 * Handles hover events (if enabled)
 * @param {MouseEvent} event - Mouse event
 */
let hoverTimeout = null;
let lastHoverTarget = null;

function handleMouseOver(event) {
  if (!RecorderState.isRecording || RecorderState.isPaused) return;
  if (!RecorderState.settings?.captureHover) return;

  const target = event.target;
  if (shouldIgnoreElement(target)) return;
  if (target === lastHoverTarget) return;

  lastHoverTarget = target;

  if (hoverTimeout) {
    clearTimeout(hoverTimeout);
  }

  // Only record hover if mouse stays for 500ms
  hoverTimeout = setTimeout(() => {
    const elementInfo = window.PuppeteerRecorderSelectors?.getElementInfo(target);
    if (!elementInfo) return;

    sendAction({
      type: 'hover',
      element: elementInfo,
      timestamp: Date.now()
    });
  }, 500);
}

/**
 * Starts recording events
 * @param {Object} settings - Recording settings
 */
function startRecording(settings) {
  console.log('startRecording called with settings:', settings);
  console.log('Already recording?', RecorderState.isRecording);

  if (RecorderState.isRecording) {
    console.log('Already recording, skipping...');
    return;
  }

  RecorderState.isRecording = true;
  console.log('Recording state set to true');
  RecorderState.isPaused = false;
  RecorderState.settings = settings;
  RecorderState.lastActionTime = Date.now();
  RecorderState.inputBuffer.clear();
  RecorderState.actionCounter = 0;
  RecorderState.consoleMessages = [];

  // Start wait detector
  window.PuppeteerRecorderWaitDetector?.start();

  // Setup network body interception (captures fetch/XHR request/response bodies)
  if (settings?.captureNetwork) {
    setupNetworkInterception();
  }

  // Setup console capture
  setupConsoleCapture();

  // Add event listeners
  document.addEventListener('click', handleClick, true);
  document.addEventListener('dblclick', handleDblClick, true);
  document.addEventListener('input', handleInput, true);
  document.addEventListener('focusout', handleFocusOut, true);
  document.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('change', handleChange, true);
  document.addEventListener('scroll', handleScroll, { passive: true });
  document.addEventListener('submit', handleSubmit, true);

  if (settings?.captureHover) {
    document.addEventListener('mouseover', handleMouseOver, true);
  }

  // Drag and drop listeners
  document.addEventListener('dragstart', handleDragStart, true);
  document.addEventListener('drop', handleDrop, true);
  document.addEventListener('dragend', handleDragEnd, true);

  // File upload listener (captures file input changes)
  document.addEventListener('change', handleFileSelect, true);

  // Show annotator if available
  window.PuppeteerRecorderAnnotator?.show();

  // Show preview sidebar
  if (window.PreviewSidebar) {
    window.PreviewSidebar.show();
    window.PreviewSidebar.clearActions();
  }

  console.log('Puppeteer Recorder: Recording started');
}

/**
 * Pauses recording
 */
function pauseRecording() {
  RecorderState.isPaused = true;
  window.PuppeteerRecorderAnnotator?.pause();
  console.log('Puppeteer Recorder: Recording paused');
}

/**
 * Resumes recording
 */
function resumeRecording() {
  RecorderState.isPaused = false;
  window.PuppeteerRecorderAnnotator?.resume();
  console.log('Puppeteer Recorder: Recording resumed');
}

/**
 * Stops recording
 */
function stopRecording() {
  if (!RecorderState.isRecording) return;

  // Flush any pending input
  for (const [element] of RecorderState.inputBuffer) {
    flushInputBuffer(element);
  }

  // Flush any remaining console messages
  if (RecorderState.consoleMessages.length > 0) {
    chrome.runtime.sendMessage({
      type: 'CONSOLE_CAPTURED',
      messages: RecorderState.consoleMessages.splice(0)
    }).catch(() => {});
  }

  RecorderState.isRecording = false;
  RecorderState.isPaused = false;

  // Stop wait detector
  window.PuppeteerRecorderWaitDetector?.stop();

  // Remove event listeners
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('dblclick', handleDblClick, true);
  document.removeEventListener('input', handleInput, true);
  document.removeEventListener('focusout', handleFocusOut, true);
  document.removeEventListener('keydown', handleKeyDown, true);
  document.removeEventListener('change', handleChange, true);
  document.removeEventListener('scroll', handleScroll);
  document.removeEventListener('submit', handleSubmit, true);
  document.removeEventListener('mouseover', handleMouseOver, true);
  document.removeEventListener('dragstart', handleDragStart, true);
  document.removeEventListener('drop', handleDrop, true);
  document.removeEventListener('dragend', handleDragEnd, true);
  document.removeEventListener('change', handleFileSelect, true);

  // Hide annotator
  window.PuppeteerRecorderAnnotator?.hide();

  console.log('Puppeteer Recorder: Recording stopped');
}

/**
 * Gets localStorage data for session context
 * @returns {Object} localStorage data
 */
function getLocalStorage() {
  const data = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      data[key] = localStorage.getItem(key);
    }
  } catch (e) {
    console.warn('Could not access localStorage:', e);
  }
  return data;
}

// Message listener for background script communication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Recorder received message:', message.type);

  switch (message.type) {
    case 'START_RECORDING':
      console.log('START_RECORDING message received');
      startRecording(message.settings);
      sendResponse({ success: true });
      return true;

    case 'PAUSE_RECORDING':
      pauseRecording();
      sendResponse({ success: true });
      return true;

    case 'RESUME_RECORDING':
      resumeRecording();
      sendResponse({ success: true });
      return true;

    case 'STOP_RECORDING':
      stopRecording();
      sendResponse({ success: true });
      return true;

    case 'GET_STORAGE':
      sendResponse({ localStorage: getLocalStorage() });
      return true;

    default:
      // Don't respond to messages we don't handle
      return false;
  }
});

// Expose to global scope
window.PuppeteerRecorder = {
  start: startRecording,
  pause: pauseRecording,
  resume: resumeRecording,
  stop: stopRecording,
  isRecording: () => RecorderState.isRecording,
  isPaused: () => RecorderState.isPaused
};

console.log('Puppeteer Recorder Pro: Content script loaded on', window.location.href);
console.log('PuppeteerRecorder available:', !!window.PuppeteerRecorder);
