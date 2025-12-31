/**
 * Puppeteer Recorder Pro - Selector Generator
 * Multi-strategy selector generation with confidence scoring
 */

/**
 * Selector strategies in priority order
 * @type {Array<{name: string, confidence: number}>}
 */
const SELECTOR_STRATEGIES = [
  { name: 'testId', confidence: 0.95 },
  { name: 'id', confidence: 0.90 },
  { name: 'aria', confidence: 0.85 },
  { name: 'name', confidence: 0.80 },
  { name: 'text', confidence: 0.75 },
  { name: 'role', confidence: 0.70 },
  { name: 'class', confidence: 0.50 },
  { name: 'cssPath', confidence: 0.30 },
  { name: 'xpath', confidence: 0.20 }
];

/**
 * Test ID attribute names to check
 * @type {string[]}
 */
const TEST_ID_ATTRS = ['data-testid', 'data-test', 'data-cy', 'data-test-id', 'data-qa'];

/**
 * Escapes CSS selector special characters
 * @param {string} value - Value to escape
 * @returns {string} Escaped value
 */
function escapeCSS(value) {
  return value.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

/**
 * Checks if element is inside a shadow DOM
 * @param {Element} element - Element to check
 * @returns {boolean} True if in shadow DOM
 */
function isInShadowDOM(element) {
  let node = element;
  while (node) {
    if (node instanceof ShadowRoot) {
      return true;
    }
    node = node.parentNode;
  }
  return false;
}

/**
 * Gets the shadow DOM path (array of shadow hosts from root to element)
 * @param {Element} element - Target element
 * @returns {Array<{host: Element, root: ShadowRoot}>} Shadow path
 */
function getShadowPath(element) {
  const path = [];
  let node = element;

  while (node) {
    if (node instanceof ShadowRoot) {
      path.unshift({ host: node.host, root: node });
    }
    node = node.parentNode;
  }

  return path;
}

/**
 * Gets a simple selector for an element (used for shadow DOM paths)
 * @param {Element} element - Target element
 * @returns {string} Simple CSS selector
 */
function getSimpleSelector(element) {
  // Try test ID first
  for (const attr of TEST_ID_ATTRS) {
    const value = element.getAttribute(attr);
    if (value) return `[${attr}="${escapeCSS(value)}"]`;
  }

  // Try ID
  if (element.id && !/^[a-f0-9-]{20,}$/i.test(element.id)) {
    return `#${escapeCSS(element.id)}`;
  }

  // Try tag + class
  const tagName = element.tagName.toLowerCase();
  const classList = Array.from(element.classList).filter(c => !(/^[a-z]{1,3}-[a-f0-9]+$/i.test(c)));
  if (classList.length > 0) {
    return `${tagName}.${escapeCSS(classList[0])}`;
  }

  return tagName;
}

/**
 * Escapes XPath string value
 * @param {string} value - Value to escape
 * @returns {string} Escaped XPath string
 */
function escapeXPath(value) {
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  return `concat('${value.replace(/'/g, "', \"'\", '")}')`;
}

/**
 * Checks if a selector uniquely identifies an element
 * @param {string} selector - CSS selector to test
 * @param {Element} target - Target element
 * @returns {boolean} True if selector is unique
 */
function isUniqueSelector(selector, target) {
  try {
    const matches = document.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === target;
  } catch (e) {
    return false;
  }
}

/**
 * Gets text content of element (first line, trimmed)
 * @param {Element} element - Target element
 * @returns {string|null} Trimmed text or null
 */
function getElementText(element) {
  const text = element.textContent?.trim();
  if (!text || text.length > 50) return null;

  // Get first line only
  const firstLine = text.split('\n')[0].trim();
  return firstLine.length > 0 && firstLine.length <= 50 ? firstLine : null;
}

/**
 * Gets human-readable label for an element
 * @param {Element} element - Target element
 * @returns {string} Human-readable label
 */
function getHumanLabel(element) {
  const tagName = element.tagName.toLowerCase();
  const type = element.getAttribute('type');
  const role = element.getAttribute('role');

  // Try various labeling strategies
  const label = element.getAttribute('aria-label') ||
                element.getAttribute('title') ||
                element.getAttribute('placeholder') ||
                element.getAttribute('name') ||
                getElementText(element);

  const elementType = role || type || tagName;
  const location = getElementLocation(element);

  if (label) {
    return `${label} ${elementType}${location ? ` in ${location}` : ''}`;
  }

  return `${elementType}${location ? ` in ${location}` : ''}`;
}

/**
 * Gets contextual location of element
 * @param {Element} element - Target element
 * @returns {string|null} Location description
 */
function getElementLocation(element) {
  // Look for containing landmarks
  const landmarks = ['header', 'footer', 'nav', 'main', 'aside', 'section', 'form'];
  let parent = element.parentElement;

  while (parent) {
    const role = parent.getAttribute('role');
    const tagName = parent.tagName.toLowerCase();

    if (landmarks.includes(tagName) || landmarks.includes(role)) {
      const name = parent.getAttribute('aria-label') ||
                   parent.getAttribute('id') ||
                   tagName;
      return name;
    }

    // Check for form
    if (tagName === 'form') {
      return parent.getAttribute('name') || parent.getAttribute('id') || 'form';
    }

    parent = parent.parentElement;
  }

  return null;
}

/**
 * Strategy: data-testid and similar attributes
 * @param {Element} element - Target element
 * @returns {Object|null} Selector info or null
 */
function getTestIdSelector(element) {
  for (const attr of TEST_ID_ATTRS) {
    const value = element.getAttribute(attr);
    if (value) {
      const selector = `[${attr}="${escapeCSS(value)}"]`;
      if (isUniqueSelector(selector, element)) {
        return { strategy: 'testId', value: selector, confidence: 0.95 };
      }
    }
  }
  return null;
}

/**
 * Strategy: Unique ID attribute
 * @param {Element} element - Target element
 * @returns {Object|null} Selector info or null
 */
function getIdSelector(element) {
  const id = element.id;
  if (!id) return null;

  // Skip dynamic-looking IDs
  if (/^[a-f0-9-]{20,}$/i.test(id) || /^\d+$/.test(id) || /:r\d+:/.test(id)) {
    return null;
  }

  const selector = `#${escapeCSS(id)}`;
  if (isUniqueSelector(selector, element)) {
    return { strategy: 'id', value: selector, confidence: 0.90 };
  }

  return null;
}

/**
 * Strategy: aria-label or aria-labelledby
 * @param {Element} element - Target element
 * @returns {Object|null} Selector info or null
 */
function getAriaSelector(element) {
  const label = element.getAttribute('aria-label');
  if (label) {
    const tagName = element.tagName.toLowerCase();
    const selector = `${tagName}[aria-label="${escapeCSS(label)}"]`;
    if (isUniqueSelector(selector, element)) {
      return { strategy: 'aria', value: selector, confidence: 0.85 };
    }
  }

  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const selector = `[aria-labelledby="${escapeCSS(labelledBy)}"]`;
    if (isUniqueSelector(selector, element)) {
      return { strategy: 'aria', value: selector, confidence: 0.85 };
    }
  }

  return null;
}

/**
 * Strategy: name attribute for form elements
 * @param {Element} element - Target element
 * @returns {Object|null} Selector info or null
 */
function getNameSelector(element) {
  const name = element.getAttribute('name');
  if (!name) return null;

  const tagName = element.tagName.toLowerCase();
  const formElements = ['input', 'select', 'textarea', 'button'];

  if (!formElements.includes(tagName)) return null;

  const selector = `${tagName}[name="${escapeCSS(name)}"]`;
  if (isUniqueSelector(selector, element)) {
    return { strategy: 'name', value: selector, confidence: 0.80 };
  }

  return null;
}

/**
 * Strategy: Text content matching (Playwright style)
 * @param {Element} element - Target element
 * @returns {Object|null} Selector info or null
 */
function getTextSelector(element) {
  const text = getElementText(element);
  if (!text) return null;

  const tagName = element.tagName.toLowerCase();
  const clickable = ['button', 'a', 'label'];

  // Prefer text selectors for clickable elements
  if (clickable.includes(tagName) || element.getAttribute('role') === 'button') {
    // Playwright-style :has-text selector
    const selector = `${tagName}:has-text("${text.replace(/"/g, '\\"')}")`;
    return { strategy: 'text', value: selector, confidence: 0.75, isPlaywright: true };
  }

  return null;
}

/**
 * Strategy: Role + accessible name
 * @param {Element} element - Target element
 * @returns {Object|null} Selector info or null
 */
function getRoleSelector(element) {
  const role = element.getAttribute('role');
  if (!role) return null;

  const name = element.getAttribute('aria-label') ||
               element.getAttribute('title') ||
               getElementText(element);

  if (name) {
    // Playwright-style role selector
    const selector = `role=${role}[name="${name.replace(/"/g, '\\"')}"]`;
    return { strategy: 'role', value: selector, confidence: 0.70, isPlaywright: true };
  }

  return null;
}

/**
 * Strategy: Class-based selector
 * @param {Element} element - Target element
 * @returns {Object|null} Selector info or null
 */
function getClassSelector(element) {
  const classList = Array.from(element.classList);
  if (classList.length === 0) return null;

  // Filter out dynamic/utility classes
  const stableClasses = classList.filter(cls => {
    // Skip classes that look dynamic
    if (/^[a-z]{1,3}-[a-f0-9]+$/i.test(cls)) return false;
    if (/^css-[a-z0-9]+$/i.test(cls)) return false;
    if (/^\d+$/.test(cls)) return false;
    if (cls.length < 3) return false;
    return true;
  });

  if (stableClasses.length === 0) return null;

  const tagName = element.tagName.toLowerCase();

  // Try with most specific class combination
  for (let i = Math.min(3, stableClasses.length); i >= 1; i--) {
    const classCombo = stableClasses.slice(0, i).map(c => `.${escapeCSS(c)}`).join('');
    const selector = `${tagName}${classCombo}`;

    if (isUniqueSelector(selector, element)) {
      return { strategy: 'class', value: selector, confidence: 0.50 };
    }
  }

  return null;
}

/**
 * Strategy: CSS path from root
 * @param {Element} element - Target element
 * @returns {Object|null} Selector info or null
 */
function getCSSPathSelector(element) {
  const path = [];
  let current = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    if (current.id && !/^[a-f0-9-]{20,}$/i.test(current.id)) {
      selector = `#${escapeCSS(current.id)}`;
      path.unshift(selector);
      break;
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
    current = parent;
  }

  const fullSelector = path.join(' > ');
  if (isUniqueSelector(fullSelector, element)) {
    return { strategy: 'cssPath', value: fullSelector, confidence: 0.30 };
  }

  return null;
}

/**
 * Strategy: Shadow DOM piercing selector
 * @param {Element} element - Target element
 * @returns {Object|null} Selector info or null
 */
function getShadowDOMSelector(element) {
  if (!isInShadowDOM(element)) return null;

  const shadowPath = getShadowPath(element);
  if (shadowPath.length === 0) return null;

  // Build Puppeteer pierce selector: host >>> innerSelector
  const parts = [];

  // Get selector for each shadow host
  for (const { host } of shadowPath) {
    parts.push(getSimpleSelector(host));
  }

  // Get selector for the target element inside the deepest shadow
  const innerSelector = getSimpleSelector(element);
  parts.push(innerSelector);

  // Puppeteer uses >>> for shadow piercing
  const puppeteerSelector = parts.join(' >>> ');

  // Also create a Playwright-compatible version (uses >>)
  const playwrightSelector = parts.join(' >> ');

  return {
    strategy: 'shadowDOM',
    value: puppeteerSelector,
    playwrightValue: playwrightSelector,
    confidence: 0.60,
    isShadowDOM: true
  };
}

/**
 * Strategy: XPath fallback
 * @param {Element} element - Target element
 * @returns {Object} Selector info
 */
function getXPathSelector(element) {
  const path = [];
  let current = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let index = 1;
    let sibling = current.previousSibling;

    while (sibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE &&
          sibling.tagName === current.tagName) {
        index++;
      }
      sibling = sibling.previousSibling;
    }

    const tagName = current.tagName.toLowerCase();
    path.unshift(`${tagName}[${index}]`);
    current = current.parentElement;
  }

  return {
    strategy: 'xpath',
    value: '//' + path.join('/'),
    confidence: 0.20
  };
}

/**
 * Generates multiple selectors for an element with confidence scores
 * @param {Element} element - Target element
 * @returns {Object} Selector result with multiple strategies
 */
function generateSelectors(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const selectors = [];

  // Try each strategy in order
  const testId = getTestIdSelector(element);
  if (testId) selectors.push(testId);

  const id = getIdSelector(element);
  if (id) selectors.push(id);

  const aria = getAriaSelector(element);
  if (aria) selectors.push(aria);

  const name = getNameSelector(element);
  if (name) selectors.push(name);

  const text = getTextSelector(element);
  if (text) selectors.push(text);

  const role = getRoleSelector(element);
  if (role) selectors.push(role);

  const classSelector = getClassSelector(element);
  if (classSelector) selectors.push(classSelector);

  // Shadow DOM piercing selector (if element is in shadow DOM)
  const shadowSelector = getShadowDOMSelector(element);
  if (shadowSelector) selectors.push(shadowSelector);

  const cssPath = getCSSPathSelector(element);
  if (cssPath) selectors.push(cssPath);

  // Always add XPath as fallback
  const xpath = getXPathSelector(element);
  selectors.push(xpath);

  // Sort by confidence (highest first)
  selectors.sort((a, b) => b.confidence - a.confidence);

  // Check if element is in shadow DOM
  const inShadowDOM = isInShadowDOM(element);

  return {
    selectors,
    recommended: selectors[0]?.value || null,
    humanLabel: getHumanLabel(element),
    tagName: element.tagName.toLowerCase(),
    inShadowDOM,
    shadowPath: inShadowDOM ? getShadowPath(element).map(p => getSimpleSelector(p.host)) : null,
    attributes: {
      id: element.id || null,
      className: element.className || null,
      type: element.getAttribute('type'),
      role: element.getAttribute('role'),
      name: element.getAttribute('name')
    }
  };
}

/**
 * Gets element info including selectors and metadata
 * @param {Element} element - Target element
 * @returns {Object} Complete element info
 */
function getElementInfo(element) {
  const selectorInfo = generateSelectors(element);
  if (!selectorInfo) return null;

  const rect = element.getBoundingClientRect();

  return {
    ...selectorInfo,
    boundingBox: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    },
    isVisible: rect.width > 0 && rect.height > 0,
    isInViewport: (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.right <= window.innerWidth
    )
  };
}

// Expose to global scope for content script access
window.PuppeteerRecorderSelectors = {
  generateSelectors,
  getElementInfo,
  getHumanLabel,
  isUniqueSelector
};
