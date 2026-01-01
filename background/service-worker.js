/**
 * Puppeteer Recorder Pro - Background Service Worker
 * Orchestrates recording state, network interception, and message handling
 */

// Load configuration
importScripts('../config.js');

// Load privacy-first AI modules
importScripts('../lib/fieldMapper.js');
importScripts('../lib/privacyAI.js');
importScripts('privacyAiFill.js');

// ============================================================================
// STORAGE MODULE (inlined to avoid import issues)
// ============================================================================

function createEmptyRecording() {
  return {
    id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    status: 'ready',
    startTime: null,
    endTime: null,
    actions: [],
    networkRequests: [],
    annotations: [],
    assertions: [],
    consoleLogs: [],
    sessionContext: null
  };
}

const RecordingStorage = {
  async getRecording() {
    try {
      const result = await chrome.storage.local.get('currentRecording');
      return result.currentRecording || createEmptyRecording();
    } catch (error) {
      console.error('Storage: Failed to get recording:', error);
      return createEmptyRecording();
    }
  },

  async saveRecording(recording) {
    try {
      await chrome.storage.local.set({ currentRecording: recording });
    } catch (error) {
      console.error('Storage: Failed to save recording:', error);
      throw error;
    }
  },

  async updateRecording(updates) {
    const recording = await this.getRecording();
    const updated = { ...recording, ...updates };
    await this.saveRecording(updated);
    return updated;
  },

  async addAction(action) {
    const recording = await this.getRecording();
    recording.actions.push(action);
    await this.saveRecording(recording);
    return recording;
  },

  async addNetworkRequest(request) {
    const recording = await this.getRecording();
    recording.networkRequests.push(request);
    await this.saveRecording(recording);
    return recording;
  },

  async addAnnotation(annotation) {
    const recording = await this.getRecording();
    recording.annotations.push(annotation);
    await this.saveRecording(recording);
    return recording;
  },

  async addConsoleLogs(logs) {
    const recording = await this.getRecording();
    if (!recording.consoleLogs) recording.consoleLogs = [];
    recording.consoleLogs.push(...logs);
    await this.saveRecording(recording);
    return recording;
  },

  async addAssertion(assertion) {
    const recording = await this.getRecording();
    if (!recording.assertions) recording.assertions = [];
    recording.assertions.push(assertion);
    await this.saveRecording(recording);
    return recording;
  },

  async updateSessionContext(context) {
    return this.updateRecording({ sessionContext: context });
  },

  async clearRecording() {
    const newRecording = createEmptyRecording();
    await this.saveRecording(newRecording);
    return newRecording;
  },

  async getStats() {
    const recording = await this.getRecording();
    return {
      actions: recording.actions.length,
      requests: recording.networkRequests.length,
      annotations: recording.annotations.length,
      assertions: (recording.assertions || []).length,
      consoleLogs: (recording.consoleLogs || []).length
    };
  }
};

const SettingsStorage = {
  async getSettings() {
    try {
      const result = await chrome.storage.local.get('settings');
      return {
        captureScreenshots: true,
        captureNetwork: true,
        captureStorage: true,
        captureHover: false,
        redactSensitive: false,
        ...result.settings
      };
    } catch (error) {
      return {
        captureScreenshots: true,
        captureNetwork: true,
        captureStorage: true,
        captureHover: false,
        redactSensitive: false
      };
    }
  }
};

// ============================================================================
// EXPORT MODULE (inlined)
// ============================================================================

function escapeJSString(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function getBestSelector(element) {
  if (!element?.selectors?.length) {
    return element?.recommended || 'body';
  }

  // First, try to find a non-Playwright selector with good confidence
  for (const sel of element.selectors) {
    if (!sel.isPlaywright && sel.confidence >= 0.5) {
      return sel.value;
    }
  }

  // Fall back to any non-Playwright selector (CSS path or XPath)
  const nonPlaywright = element.selectors.find(s => !s.isPlaywright);
  if (nonPlaywright) {
    return nonPlaywright.value;
  }

  // Last resort: convert Playwright :has-text() to XPath
  const textSelector = element.selectors.find(s => s.value?.includes(':has-text('));
  if (textSelector) {
    const match = textSelector.value.match(/^(\w+):has-text\("(.+)"\)$/);
    if (match) {
      // Return XPath that finds element by text content
      return `xpath=//${match[1]}[contains(text(), "${match[2]}")]`;
    }
  }

  return element.selectors[0]?.value || 'body';
}

function generateWaitCode(waitBefore) {
  if (!waitBefore || waitBefore.type === 'none' || waitBefore.type === 'immediate') {
    return null;
  }
  switch (waitBefore.type) {
    case 'networkIdle':
      return "await page.waitForNetworkIdle();";
    case 'domSettled':
      return "await page.waitForTimeout(500);";
    default:
      return waitBefore.duration > 1000 ? `await page.waitForTimeout(${Math.min(waitBefore.duration, 3000)});` : null;
  }
}

function generateActionCode(action, index, settings, currentFrame = { path: null }) {
  const lines = [];
  const selector = getBestSelector(action.element);
  const comment = action.element?.humanLabel || action.type;
  const isXPath = selector.startsWith('xpath=');
  const xpathExpr = isXPath ? selector.replace('xpath=', '') : null;

  // Handle frame switching
  const actionFramePath = action.context?.framePath;
  const frameChanged = JSON.stringify(actionFramePath) !== JSON.stringify(currentFrame.path);

  if (frameChanged) {
    if (actionFramePath && actionFramePath.length > 0) {
      // Switch to iframe
      lines.push(`  // Switch to iframe`);
      let frameRef = 'page';
      for (let i = 0; i < actionFramePath.length; i++) {
        const frameSel = actionFramePath[i];
        if (frameSel === '[cross-origin-iframe]') {
          lines.push(`  // Note: Cross-origin iframe detected - manual handling may be needed`);
        } else {
          lines.push(`  const frame${index}_${i} = ${frameRef}.frameLocator('${escapeJSString(frameSel)}');`);
          frameRef = `frame${index}_${i}`;
        }
      }
      currentFrame.path = actionFramePath;
      currentFrame.ref = frameRef;
    } else if (currentFrame.path) {
      // Back to main frame
      lines.push(`  // Back to main frame`);
      currentFrame.path = null;
      currentFrame.ref = 'page';
    }
  }

  const waitCode = generateWaitCode(action.waitBefore);
  if (waitCode) lines.push(`  ${waitCode}`);

  lines.push(`  // Step ${index + 1}: ${comment}`);

  switch (action.type) {
    case 'navigate':
      lines.push(`  await page.goto('${escapeJSString(action.context?.url)}', { waitUntil: 'networkidle0' });`);
      break;
    case 'click':
      if (isXPath) {
        lines.push(`  await page.waitForXPath('${escapeJSString(xpathExpr)}');`);
        lines.push(`  const el${index} = await page.$x('${escapeJSString(xpathExpr)}');`);
        lines.push(`  await el${index}[0].click();`);
      } else {
        lines.push(`  await page.waitForSelector('${escapeJSString(selector)}');`);
        lines.push(`  await page.click('${escapeJSString(selector)}');`);
      }
      break;
    case 'type':
      const value = settings?.redactSensitive && action.element?.attributes?.type === 'password' ? '[REDACTED]' : action.value;
      if (isXPath) {
        lines.push(`  await page.waitForXPath('${escapeJSString(xpathExpr)}');`);
        lines.push(`  const el${index} = await page.$x('${escapeJSString(xpathExpr)}');`);
        lines.push(`  await el${index}[0].click({ clickCount: 3 });`);
        lines.push(`  await el${index}[0].type('${escapeJSString(value)}');`);
      } else {
        lines.push(`  await page.waitForSelector('${escapeJSString(selector)}');`);
        lines.push(`  await page.click('${escapeJSString(selector)}', { clickCount: 3 });`);
        lines.push(`  await page.type('${escapeJSString(selector)}', '${escapeJSString(value)}');`);
      }
      break;
    case 'keypress':
      lines.push(`  await page.keyboard.press('${action.key}');`);
      break;
    case 'select':
      lines.push(`  await page.select('${escapeJSString(selector)}', '${escapeJSString(action.value)}');`);
      break;
    case 'scroll':
      lines.push(`  await page.evaluate(() => window.scrollTo(${action.scrollTo?.x || 0}, ${action.scrollTo?.y || 0}));`);
      break;
    case 'drag':
      const sourceSelector = getBestSelector(action.sourceElement);
      const targetSelector = getBestSelector(action.targetElement);
      lines.push(`  // Drag from "${action.sourceElement?.humanLabel || 'source'}" to "${action.targetElement?.humanLabel || 'target'}"`);
      lines.push(`  const source${index} = await page.$('${escapeJSString(sourceSelector)}');`);
      lines.push(`  const target${index} = await page.$('${escapeJSString(targetSelector)}');`);
      lines.push(`  const sourceBox${index} = await source${index}.boundingBox();`);
      lines.push(`  const targetBox${index} = await target${index}.boundingBox();`);
      lines.push(`  await page.mouse.move(sourceBox${index}.x + sourceBox${index}.width / 2, sourceBox${index}.y + sourceBox${index}.height / 2);`);
      lines.push(`  await page.mouse.down();`);
      lines.push(`  await page.mouse.move(targetBox${index}.x + targetBox${index}.width / 2, targetBox${index}.y + targetBox${index}.height / 2);`);
      lines.push(`  await page.mouse.up();`);
      break;
    case 'fileUpload':
      const fileNames = action.files?.map(f => f.name).join(', ') || 'files';
      lines.push(`  // Upload file(s): ${fileNames}`);
      lines.push(`  const fileInput${index} = await page.$('${escapeJSString(selector)}');`);
      lines.push(`  await fileInput${index}.uploadFile(/* Add file path(s) here */);`);
      break;
    case 'newTab':
      lines.push(`  // New tab opened`);
      lines.push(`  const page${index} = await browser.newPage();`);
      lines.push(`  await page${index}.goto('${escapeJSString(action.context?.url || 'about:blank')}', { waitUntil: 'networkidle0' });`);
      break;
    case 'switchTab':
      lines.push(`  // Switch to tab: ${action.context?.title || 'tab'}`);
      lines.push(`  await page${index - 1 || ''}.bringToFront(); // Switch to tab with URL: ${action.context?.url || ''}`);
      break;
    case 'closeTab':
      lines.push(`  // Close tab`);
      lines.push(`  await page.close();`);
      break;
    default:
      lines.push(`  // ${action.type}: ${comment}`);
  }
  lines.push('');
  return lines.join('\n');
}

const ExportGenerator = {
  toJSON(recording) {
    return JSON.stringify({
      meta: {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        recordingId: recording.id
      },
      sessionContext: recording.sessionContext,
      actions: recording.actions,
      networkRequests: recording.networkRequests,
      annotations: recording.annotations,
      assertions: recording.assertions || [],
      consoleLogs: recording.consoleLogs || []
    }, null, 2);
  },

  toCompactJSON(recording) {
    // Token-efficient export - just the essentials
    const consoleLogs = recording.consoleLogs || [];
    const errors = consoleLogs.filter(l => l.level === 'error');
    const warnings = consoleLogs.filter(l => l.level === 'warn');

    return JSON.stringify({
      url: recording.sessionContext?.startUrl,
      actions: recording.actions.map(a => ({
        type: a.type,
        selector: a.element?.recommended,
        value: a.value,
        key: a.key,
        label: a.element?.humanLabel
      })).filter(a => a.type !== 'navigate' || a.selector),
      annotations: recording.annotations.map(a => a.note),
      apiCalls: recording.networkRequests
        .filter(r => r.type === 'xmlhttprequest' || r.type === 'fetch')
        .filter(r => !r.url.includes('google-analytics') && !r.url.includes('googletagmanager'))
        .map(r => ({ method: r.method, url: r.url, status: r.responseStatus, body: r.requestBody, response: r.responseBody })),
      assertions: (recording.assertions || []).map(a => ({
        type: a.assertionType,
        selector: a.element?.recommended,
        expected: a.expected,
        description: a.description
      })),
      errors: errors.map(e => e.message),
      warnings: warnings.length > 0 ? warnings.map(w => w.message) : undefined
    }, null, 2);
  },

  toPuppeteerScript(recording, settings = {}) {
    const { actions, sessionContext } = recording;
    const viewport = sessionContext?.viewport || { width: 1920, height: 1080 };
    const startUrl = sessionContext?.startUrl || actions.find(a => a.type === 'navigate')?.context?.url || 'about:blank';

    let script = `const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewport({ width: ${viewport.width}, height: ${viewport.height} });
  await page.goto('${escapeJSString(startUrl)}', { waitUntil: 'networkidle0' });

`;
    // Track current frame state across actions
    const currentFrame = { path: null, ref: 'page' };

    actions.forEach((action, i) => {
      if (action.type === 'navigate' && action.context?.url === startUrl && i === 0) return;
      script += generateActionCode(action, i, settings, currentFrame);
    });

    script += `  console.log('Done');
})();
`;
    return script;
  },

  toPlaywrightScript(recording, settings = {}) {
    const { actions, sessionContext, annotations, assertions } = recording;
    const viewport = sessionContext?.viewport || { width: 1920, height: 1080 };
    const startUrl = sessionContext?.startUrl || actions.find(a => a.type === 'navigate')?.context?.url || 'about:blank';

    // Build annotation lookup
    const annotationMap = new Map();
    (annotations || []).forEach(ann => {
      if (ann.afterAction) annotationMap.set(ann.afterAction, ann.note);
    });

    // Build assertion lookup
    const assertionMap = new Map();
    (assertions || []).forEach(assertion => {
      if (assertion.afterAction) {
        if (!assertionMap.has(assertion.afterAction)) {
          assertionMap.set(assertion.afterAction, []);
        }
        assertionMap.get(assertion.afterAction).push(assertion);
      }
    });

    let script = `import { test, expect } from '@playwright/test';

test('recorded test', async ({ page }) => {
  await page.setViewportSize({ width: ${viewport.width}, height: ${viewport.height} });
  await page.goto('${escapeJSString(startUrl)}');

`;

    // Track current frame for Playwright
    let currentFramePath = null;

    actions.forEach((action, i) => {
      if (action.type === 'navigate' && action.context?.url === startUrl && i === 0) return;

      const selector = action.element?.recommended || action.element?.selectors?.[0]?.value;
      const comment = action.element?.humanLabel || action.type;
      const waitInfo = action.waitBefore;

      // Handle frame switching for Playwright
      const actionFramePath = action.context?.framePath;
      const frameChanged = JSON.stringify(actionFramePath) !== JSON.stringify(currentFramePath);

      let locatorPrefix = 'page';
      if (frameChanged && actionFramePath && actionFramePath.length > 0) {
        script += `  // Switch to iframe\n`;
        locatorPrefix = 'page';
        for (const frameSel of actionFramePath) {
          if (frameSel !== '[cross-origin-iframe]') {
            locatorPrefix += `.frameLocator('${escapeJSString(frameSel)}')`;
          }
        }
        currentFramePath = actionFramePath;
      } else if (frameChanged && !actionFramePath && currentFramePath) {
        script += `  // Back to main frame\n`;
        currentFramePath = null;
        locatorPrefix = 'page';
      } else if (actionFramePath && actionFramePath.length > 0) {
        // Still in iframe
        locatorPrefix = 'page';
        for (const frameSel of actionFramePath) {
          if (frameSel !== '[cross-origin-iframe]') {
            locatorPrefix += `.frameLocator('${escapeJSString(frameSel)}')`;
          }
        }
      }

      // Add wait if needed
      if (waitInfo?.type === 'networkIdle') {
        script += `  await page.waitForLoadState('networkidle');\n`;
      }

      script += `  // Step ${i + 1}: ${comment}\n`;

      switch (action.type) {
        case 'navigate':
          script += `  await page.goto('${escapeJSString(action.context?.url)}');\n`;
          break;
        case 'click':
          if (selector?.includes(':has-text(')) {
            script += `  await ${locatorPrefix}.locator('${escapeJSString(selector)}').click();\n`;
          } else if (selector?.startsWith('role=')) {
            const roleMatch = selector.match(/role=(\w+)\[name="(.+)"\]/);
            if (roleMatch) {
              script += `  await ${locatorPrefix}.getByRole('${roleMatch[1]}', { name: '${escapeJSString(roleMatch[2])}' }).click();\n`;
            } else {
              script += `  await ${locatorPrefix}.locator('${escapeJSString(selector)}').click();\n`;
            }
          } else {
            script += `  await ${locatorPrefix}.locator('${escapeJSString(selector)}').click();\n`;
          }
          break;
        case 'dblclick':
          script += `  await ${locatorPrefix}.locator('${escapeJSString(selector)}').dblclick();\n`;
          break;
        case 'type':
          const value = settings?.redactSensitive && action.element?.attributes?.type === 'password' ? '[REDACTED]' : action.value;
          script += `  await ${locatorPrefix}.locator('${escapeJSString(selector)}').fill('${escapeJSString(value)}');\n`;
          break;
        case 'keypress':
          script += `  await page.keyboard.press('${action.key}');\n`;
          break;
        case 'select':
          script += `  await ${locatorPrefix}.locator('${escapeJSString(selector)}').selectOption('${escapeJSString(action.value)}');\n`;
          break;
        case 'scroll':
          script += `  await page.evaluate(() => window.scrollTo(${action.scrollTo?.x || 0}, ${action.scrollTo?.y || 0}));\n`;
          break;
        case 'hover':
          script += `  await ${locatorPrefix}.locator('${escapeJSString(selector)}').hover();\n`;
          break;
        case 'drag':
          const srcSel = action.sourceElement?.recommended || action.sourceElement?.selectors?.[0]?.value;
          const tgtSel = action.targetElement?.recommended || action.targetElement?.selectors?.[0]?.value;
          script += `  await ${locatorPrefix}.locator('${escapeJSString(srcSel)}').dragTo(${locatorPrefix}.locator('${escapeJSString(tgtSel)}'));\n`;
          break;
        case 'fileUpload':
          const uploadFiles = action.files?.map(f => f.name).join(', ') || 'files';
          script += `  // Upload file(s): ${uploadFiles}\n`;
          script += `  await ${locatorPrefix}.locator('${escapeJSString(selector)}').setInputFiles(/* file path(s) */);\n`;
          break;
        case 'newTab':
          script += `  // New tab opened\n`;
          script += `  const page${i} = await context.newPage();\n`;
          script += `  await page${i}.goto('${escapeJSString(action.context?.url || 'about:blank')}');\n`;
          break;
        case 'switchTab':
          script += `  // Switch to tab: ${action.context?.title || 'tab'}\n`;
          script += `  await page.bringToFront(); // Switch to tab with URL: ${action.context?.url || ''}\n`;
          break;
        case 'closeTab':
          script += `  // Close tab\n`;
          script += `  await page.close();\n`;
          break;
        default:
          script += `  // ${action.type}: ${comment}\n`;
      }

      // Add annotation as comment
      const annotation = annotationMap.get(action.id);
      if (annotation) {
        script += `  // NOTE: ${escapeJSString(annotation)}\n`;
      }

      // Add assertions for this action
      const actionAssertions = assertionMap.get(action.id) || [];
      for (const assertion of actionAssertions) {
        const assertSelector = assertion.element?.recommended || assertion.element?.selectors?.[0]?.value;
        script += `  // Assertion: ${assertion.description || assertion.assertionType}\n`;

        switch (assertion.assertionType) {
          case 'visible':
            script += `  await expect(${locatorPrefix}.locator('${escapeJSString(assertSelector)}')).toBeVisible();\n`;
            break;
          case 'hidden':
            script += `  await expect(${locatorPrefix}.locator('${escapeJSString(assertSelector)}')).toBeHidden();\n`;
            break;
          case 'text':
            script += `  await expect(${locatorPrefix}.locator('${escapeJSString(assertSelector)}')).toContainText('${escapeJSString(assertion.expected)}');\n`;
            break;
          case 'value':
            script += `  await expect(${locatorPrefix}.locator('${escapeJSString(assertSelector)}')).toHaveValue('${escapeJSString(assertion.expected)}');\n`;
            break;
          case 'attribute':
            script += `  await expect(${locatorPrefix}.locator('${escapeJSString(assertSelector)}')).toHaveAttribute('${assertion.attributeName}', '${escapeJSString(assertion.expected)}');\n`;
            break;
          case 'count':
            script += `  await expect(${locatorPrefix}.locator('${escapeJSString(assertion.selector || assertSelector)}')).toHaveCount(${assertion.expected});\n`;
            break;
          case 'enabled':
            script += assertion.expected
              ? `  await expect(${locatorPrefix}.locator('${escapeJSString(assertSelector)}')).toBeEnabled();\n`
              : `  await expect(${locatorPrefix}.locator('${escapeJSString(assertSelector)}')).toBeDisabled();\n`;
            break;
          case 'checked':
            script += assertion.expected
              ? `  await expect(${locatorPrefix}.locator('${escapeJSString(assertSelector)}')).toBeChecked();\n`
              : `  await expect(${locatorPrefix}.locator('${escapeJSString(assertSelector)}')).not.toBeChecked();\n`;
            break;
        }
      }

      script += '\n';
    });

    script += `});
`;
    return script;
  },

  toStepSummary(recording) {
    let summary = `Recording: ${recording.id}\nSteps: ${recording.actions.length}\n\n`;
    recording.actions.forEach((action, i) => {
      const label = action.element?.humanLabel || action.type;
      switch (action.type) {
        case 'navigate': summary += `${i+1}. Navigate to ${action.context?.url}\n`; break;
        case 'click': summary += `${i+1}. Click "${label}"\n`; break;
        case 'dblclick': summary += `${i+1}. Double-click "${label}"\n`; break;
        case 'type': summary += `${i+1}. Type "${action.value}" into "${label}"\n`; break;
        case 'keypress': summary += `${i+1}. Press ${action.key}\n`; break;
        case 'select': summary += `${i+1}. Select "${action.value}" in "${label}"\n`; break;
        case 'scroll': summary += `${i+1}. Scroll to position (${action.scrollTo?.x || 0}, ${action.scrollTo?.y || 0})\n`; break;
        case 'hover': summary += `${i+1}. Hover over "${label}"\n`; break;
        case 'drag': summary += `${i+1}. Drag "${action.sourceElement?.humanLabel || 'element'}" to "${action.targetElement?.humanLabel || 'target'}"\n`; break;
        case 'fileUpload':
          const files = action.files?.map(f => f.name).join(', ') || 'file';
          summary += `${i+1}. Upload "${files}" to "${label}"\n`;
          break;
        case 'submit': summary += `${i+1}. Submit form "${label}"\n`; break;
        case 'newTab': summary += `${i+1}. Open new tab (${action.context?.url || 'blank'})\n`; break;
        case 'switchTab': summary += `${i+1}. Switch to tab "${action.context?.title || action.context?.url || 'tab'}"\n`; break;
        case 'closeTab': summary += `${i+1}. Close tab\n`; break;
        default: summary += `${i+1}. ${action.type}: ${label}\n`;
      }
    });
    return summary;
  }
};

// ============================================================================
// MAIN SERVICE WORKER LOGIC
// ============================================================================

let recordingState = {
  status: 'ready',
  tabId: null, // Primary tab
  activeTabs: new Set(), // All tabs being recorded
  startTime: null,
  settings: null,
  pendingRequests: new Map(),
  lastActionId: null,
  currentTabId: null // Currently active tab
};

// ============================================================================
// REPLAY STATE
// ============================================================================

let replayState = {
  status: 'idle', // idle, replaying, paused, takeover, complete, error
  tabId: null,
  activeTabs: new Set(),
  workflowId: null,
  currentStep: 0,
  totalSteps: 0,
  startTime: null,
  variables: {},
  options: {},
  tabIdMap: {}, // Maps recorded tab IDs to actual tab IDs during replay
  stepInfo: null, // Current step info for progress display
  error: null // Error message if status is 'error'
};

function generateActionId() {
  return `act_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

async function broadcastStateUpdate() {
  const stats = await RecordingStorage.getStats();
  chrome.runtime.sendMessage({
    type: 'STATE_UPDATE',
    status: recordingState.status,
    stats,
    startTime: recordingState.startTime
  }).catch(() => {});
}

async function sendToContentScript(message) {
  if (recordingState.tabId) {
    try {
      await chrome.tabs.sendMessage(recordingState.tabId, message);
    } catch (error) {
      console.warn('Failed to send to content script:', error);
    }
  }
}

async function captureSessionContext(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    const cookies = await chrome.cookies.getAll({ url: tab.url });

    let localStorage = {};
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'GET_STORAGE' });
      localStorage = response?.localStorage || {};
    } catch (e) {}

    return {
      startUrl: tab.url,
      viewport: { width: tab.width || 1920, height: tab.height || 1080 },
      cookies: recordingState.settings?.redactSensitive
        ? cookies.map(c => ({ ...c, value: '[REDACTED]' }))
        : cookies,
      localStorage,
      timestamp: Date.now(),
      recordingId: (await RecordingStorage.getRecording()).id
    };
  } catch (error) {
    console.error('Failed to capture session context:', error);
    return null;
  }
}

async function startRecording(settings) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return { success: false, error: 'No active tab' };

    // Check if we can record on this page
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('about:') || tab.url.startsWith('edge://')) {
      return { success: false, error: 'Cannot record on browser system pages. Please navigate to a regular website.' };
    }

    recordingState.status = 'recording';
    recordingState.tabId = tab.id;
    recordingState.activeTabs = new Set([tab.id]);
    recordingState.currentTabId = tab.id;
    recordingState.startTime = Date.now();
    recordingState.settings = settings;
    recordingState.lastActionId = null;

    const recording = await RecordingStorage.getRecording();
    if (recording.status === 'paused') {
      await RecordingStorage.updateRecording({ status: 'recording' });
    } else {
      await RecordingStorage.clearRecording();
      await RecordingStorage.updateRecording({
        status: 'recording',
        startTime: recordingState.startTime
      });

      if (settings.captureStorage) {
        const context = await captureSessionContext(tab.id);
        if (context) await RecordingStorage.updateSessionContext(context);
      }
    }

    // Try to start recording directly on the page using executeScript
    // This ensures recording starts immediately even if message passing fails
    try {
      console.log('Attempting to start recording on tab:', tab.id, tab.url);

      // First check if content scripts are loaded
      const checkResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          console.log('Check script running, PuppeteerRecorder:', !!window.PuppeteerRecorder);
          return {
            hasRecorder: !!window.PuppeteerRecorder,
            hasSidebar: !!window.PreviewSidebar,
            hasSelectors: !!window.PuppeteerRecorderSelectors
          };
        }
      });

      console.log('Check result:', checkResult);
      const result = checkResult?.[0]?.result;
      console.log('Content scripts status:', result);

      if (!result?.hasRecorder) {
        // Content scripts not loaded - inject them
        console.log('Content scripts not found, injecting...');
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/selectors.js', 'content/waitDetector.js', 'content/annotator.js', 'content/recorder.js', 'content/previewSidebar.js', 'content/assertionCapture.js']
        });
        // Give scripts time to initialize
        await new Promise(resolve => setTimeout(resolve, 200));
        console.log('Scripts injected, waiting...');
      }

      // Now start recording
      console.log('Calling PuppeteerRecorder.start()...');
      const startResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (settings) => {
          console.log('Start script running, PuppeteerRecorder:', !!window.PuppeteerRecorder);
          // If PuppeteerRecorder exists, call start directly
          if (window.PuppeteerRecorder) {
            window.PuppeteerRecorder.start(settings);
            console.log('PuppeteerRecorder.start() called');
          } else {
            console.error('PuppeteerRecorder not found!');
          }
          // Show sidebar if available
          if (window.PreviewSidebar) {
            window.PreviewSidebar.show();
            window.PreviewSidebar.clearActions();
            console.log('PreviewSidebar shown');
          }
          return { started: !!window.PuppeteerRecorder };
        },
        args: [settings]
      });
      console.log('Start result:', startResult);
      console.log('Recording started via executeScript');
    } catch (e) {
      console.error('executeScript failed:', e);
      console.warn('Trying message fallback...');
      // Fallback to message passing
      try {
        await sendToContentScript({ type: 'START_RECORDING', settings });
        await sendToContentScript({ type: 'TOGGLE_SIDEBAR' });
        console.log('Message fallback sent');
      } catch (msgError) {
        console.error('Message fallback also failed:', msgError);
      }
    }

    await broadcastStateUpdate();

    console.log('Recording started on tab:', tab.id);
    return { success: true, startTime: recordingState.startTime };
  } catch (error) {
    console.error('Failed to start recording:', error);
    return { success: false, error: error.message };
  }
}

async function pauseRecording() {
  recordingState.status = 'paused';
  await RecordingStorage.updateRecording({ status: 'paused' });
  await sendToContentScript({ type: 'PAUSE_RECORDING' });
  await broadcastStateUpdate();
  return { success: true };
}

async function stopRecording() {
  recordingState.status = 'stopped';
  await RecordingStorage.updateRecording({ status: 'stopped', endTime: Date.now() });
  await sendToContentScript({ type: 'STOP_RECORDING' });
  const stats = await RecordingStorage.getStats();
  recordingState.tabId = null;
  await broadcastStateUpdate();
  return { success: true, stats };
}

async function captureScreenshot() {
  if (!recordingState.settings?.captureScreenshots || !recordingState.tabId) {
    return null;
  }

  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'jpeg',
      quality: 60 // Lower quality to save storage space
    });
    return dataUrl;
  } catch (error) {
    console.warn('Failed to capture screenshot:', error);
    return null;
  }
}

async function handleActionCaptured(action) {
  if (recordingState.status !== 'recording') return;

  // Capture screenshot if enabled
  let screenshot = null;
  if (recordingState.settings?.captureScreenshots) {
    screenshot = await captureScreenshot();
  }

  const actionWithId = {
    ...action,
    id: generateActionId(),
    screenshot: screenshot ? {
      dataUrl: screenshot,
      capturedAt: Date.now()
    } : null
  };

  recordingState.lastActionId = actionWithId.id;
  await RecordingStorage.addAction(actionWithId);
  await broadcastStateUpdate();

  console.log('Action captured:', actionWithId.type, actionWithId.element?.humanLabel, screenshot ? '(with screenshot)' : '');
}

async function addAnnotation(note) {
  const annotation = {
    id: `ann_${Date.now()}`,
    timestamp: Date.now(),
    note,
    afterAction: recordingState.lastActionId
  };
  await RecordingStorage.addAnnotation(annotation);
  await broadcastStateUpdate();
  return { success: true };
}

async function exportRecording(format) {
  const recording = await RecordingStorage.getRecording();
  const settings = await SettingsStorage.getSettings();

  let data;
  switch (format) {
    case 'puppeteer':
      data = ExportGenerator.toPuppeteerScript(recording, settings);
      break;
    case 'playwright':
      data = ExportGenerator.toPlaywrightScript(recording, settings);
      break;
    case 'compact':
      data = ExportGenerator.toCompactJSON(recording);
      break;
    case 'text':
      data = ExportGenerator.toStepSummary(recording);
      break;
    default:
      data = ExportGenerator.toJSON(recording);
  }
  return { success: true, data };
}

async function getState() {
  const stats = await RecordingStorage.getStats();
  return {
    status: recordingState.status,
    stats,
    startTime: recordingState.startTime
  };
}

/**
 * Saves current recording with a name
 * @param {string} name - Name for the recording
 * @returns {Object} Result
 */
async function saveNamedRecording(name) {
  try {
    const recording = await RecordingStorage.getRecording();
    if (!recording.actions || recording.actions.length === 0) {
      return { success: false, error: 'No actions to save' };
    }

    const saveId = `saved_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // Get existing saved recordings
    const result = await chrome.storage.local.get('savedRecordings');
    const savedRecordings = result.savedRecordings || {};

    // Generate form signature for privacy-first AI fill
    const typeActions = recording.actions.filter(a => a.type === 'type');
    const formSignature = {
      url: recording.sessionContext?.startUrl || '',
      fieldCount: typeActions.length,
      fields: typeActions.map(a => ({
        name: a.element?.attributes?.name || null,
        id: a.element?.attributes?.id || null,
        label: a.element?.humanLabel || null,
        type: a.element?.tagName || 'input'
      }))
    };

    // Save the recording with metadata and form signature
    savedRecordings[saveId] = {
      name,
      savedAt: Date.now(),
      actionCount: recording.actions.length,
      formSignature,
      recording
    };

    await chrome.storage.local.set({ savedRecordings });

    console.log('Recording saved:', name, saveId);
    return { success: true, saveId };
  } catch (error) {
    console.error('Failed to save recording:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Loads a saved recording
 * @param {string} recordingId - ID of the saved recording
 * @returns {Object} Result with stats
 */
async function loadNamedRecording(recordingId) {
  try {
    const result = await chrome.storage.local.get('savedRecordings');
    const savedRecordings = result.savedRecordings || {};

    if (!savedRecordings[recordingId]) {
      return { success: false, error: 'Recording not found' };
    }

    const savedData = savedRecordings[recordingId];
    const recording = savedData.recording;

    // Set as current recording
    await RecordingStorage.saveRecording({
      ...recording,
      status: 'stopped'
    });

    // Update state
    recordingState.status = 'stopped';
    recordingState.startTime = null;

    const stats = await RecordingStorage.getStats();

    console.log('Recording loaded:', savedData.name);
    return {
      success: true,
      name: savedData.name,
      status: 'stopped',
      stats
    };
  } catch (error) {
    console.error('Failed to load recording:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Deletes a saved recording
 * @param {string} recordingId - ID of the saved recording
 * @returns {Object} Result
 */
async function deleteNamedRecording(recordingId) {
  try {
    const result = await chrome.storage.local.get('savedRecordings');
    const savedRecordings = result.savedRecordings || {};

    if (!savedRecordings[recordingId]) {
      return { success: false, error: 'Recording not found' };
    }

    delete savedRecordings[recordingId];
    await chrome.storage.local.set({ savedRecordings });

    console.log('Recording deleted:', recordingId);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete recording:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// REPLAY FUNCTIONS
// ============================================================================

/**
 * Broadcasts replay state update to popup
 */
function broadcastReplayState() {
  chrome.runtime.sendMessage({
    type: 'REPLAY_STATE_UPDATE',
    status: replayState.status,
    currentStep: replayState.currentStep,
    totalSteps: replayState.totalSteps,
    workflowId: replayState.workflowId,
    stepInfo: replayState.stepInfo,
    error: replayState.error
  }).catch(() => {});
}

/**
 * Gets saved workflows list
 * @returns {Object} Workflows list with metadata
 */
async function getWorkflows() {
  try {
    const result = await chrome.storage.local.get('savedRecordings');
    const savedRecordings = result.savedRecordings || {};

    const workflows = Object.entries(savedRecordings).map(([id, data]) => ({
      id,
      name: data.name,
      savedAt: data.savedAt,
      actionCount: data.actionCount,
      tags: data.tags || [],
      lastRun: data.lastRun || null,
      runCount: data.runCount || 0,
      variables: data.variables || {},
      presets: data.presets || [],
      recording: data.recording // Include for export
    }));

    // Sort by lastRun (most recent first), then by savedAt
    workflows.sort((a, b) => {
      if (a.lastRun && b.lastRun) return b.lastRun - a.lastRun;
      if (a.lastRun) return -1;
      if (b.lastRun) return 1;
      return b.savedAt - a.savedAt;
    });

    // Collect all unique tags
    const allTags = new Set();
    workflows.forEach(w => {
      (w.tags || []).forEach(tag => allTags.add(tag));
    });

    return { success: true, workflows, tags: Array.from(allTags).sort() };
  } catch (error) {
    console.error('Failed to get workflows:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Updates workflow metadata
 * @param {string} workflowId - Workflow ID
 * @param {Object} updates - Fields to update
 */
async function updateWorkflow(workflowId, updates) {
  try {
    const result = await chrome.storage.local.get('savedRecordings');
    const savedRecordings = result.savedRecordings || {};

    if (!savedRecordings[workflowId]) {
      return { success: false, error: 'Workflow not found' };
    }

    savedRecordings[workflowId] = {
      ...savedRecordings[workflowId],
      ...updates
    };

    await chrome.storage.local.set({ savedRecordings });
    return { success: true };
  } catch (error) {
    console.error('Failed to update workflow:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Saves a preset for a workflow
 * @param {string} workflowId - Workflow ID
 * @param {Object} preset - Preset data {name, values}
 */
async function savePreset(workflowId, preset) {
  try {
    const result = await chrome.storage.local.get('savedRecordings');
    const savedRecordings = result.savedRecordings || {};

    if (!savedRecordings[workflowId]) {
      return { success: false, error: 'Workflow not found' };
    }

    const workflow = savedRecordings[workflowId];
    if (!workflow.presets) workflow.presets = [];

    // Add preset with ID
    const presetWithId = {
      ...preset,
      id: `preset_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
    };

    // Add or update preset
    const existingIndex = workflow.presets.findIndex(p => p.name === preset.name);
    if (existingIndex >= 0) {
      workflow.presets[existingIndex] = { ...workflow.presets[existingIndex], ...preset };
    } else {
      workflow.presets.push(presetWithId);
    }

    await chrome.storage.local.set({ savedRecordings });
    return { success: true };
  } catch (error) {
    console.error('Failed to save preset:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Deletes a workflow
 * @param {string} workflowId - Workflow ID
 */
async function deleteWorkflow(workflowId) {
  try {
    const result = await chrome.storage.local.get('savedRecordings');
    const savedRecordings = result.savedRecordings || {};

    if (!savedRecordings[workflowId]) {
      return { success: false, error: 'Workflow not found' };
    }

    delete savedRecordings[workflowId];
    await chrome.storage.local.set({ savedRecordings });

    console.log('Workflow deleted:', workflowId);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete workflow:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Duplicates a workflow
 * @param {string} workflowId - Workflow ID to duplicate
 * @param {string} newName - Name for the copy
 */
async function duplicateWorkflow(workflowId, newName) {
  try {
    const result = await chrome.storage.local.get('savedRecordings');
    const savedRecordings = result.savedRecordings || {};

    if (!savedRecordings[workflowId]) {
      return { success: false, error: 'Workflow not found' };
    }

    const original = savedRecordings[workflowId];
    const newId = `saved_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    savedRecordings[newId] = {
      ...original,
      name: newName,
      savedAt: Date.now(),
      lastRun: null,
      runCount: 0,
      presets: [] // Don't copy presets
    };

    await chrome.storage.local.set({ savedRecordings });

    console.log('Workflow duplicated:', workflowId, '->', newId);
    return { success: true, newId };
  } catch (error) {
    console.error('Failed to duplicate workflow:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Starts replay of a workflow
 * @param {string} workflowId - ID of workflow to replay
 * @param {Object} variables - Variable values
 * @param {Object} options - Replay options
 */
async function startReplay(workflowId, variables = {}, options = {}) {
  try {
    // Get workflow from storage
    const result = await chrome.storage.local.get('savedRecordings');
    const savedRecordings = result.savedRecordings || {};
    const savedWorkflow = savedRecordings[workflowId];

    if (!savedWorkflow) {
      return { success: false, error: 'Workflow not found' };
    }

    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      return { success: false, error: 'No active tab' };
    }

    // Check if page can be automated
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('about:') || tab.url.startsWith('edge://')) {
      return { success: false, error: 'Cannot replay on browser system pages' };
    }

    // Update replay state
    replayState = {
      status: 'replaying',
      tabId: tab.id,
      activeTabs: new Set([tab.id]),
      workflowId,
      currentStep: 0,
      totalSteps: savedWorkflow.recording.actions?.length || 0,
      startTime: Date.now(),
      variables,
      options,
      tabIdMap: {}
    };

    // Ensure replayer is injected
    try {
      const checkResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => !!window.FormGhostReplayer
      });

      if (!checkResult?.[0]?.result) {
        // Inject replayer scripts
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/selectors.js', 'content/waitDetector.js', 'content/replayOverlay.js', 'content/replayer.js']
        });
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (e) {
      console.warn('Could not check/inject replayer:', e);
    }

    // Send start message to content script
    await chrome.tabs.sendMessage(tab.id, {
      type: 'START_REPLAY',
      workflow: savedWorkflow.recording,
      variables,
      options
    });

    // Update last run timestamp
    savedRecordings[workflowId].lastRun = Date.now();
    savedRecordings[workflowId].runCount = (savedRecordings[workflowId].runCount || 0) + 1;
    await chrome.storage.local.set({ savedRecordings });

    broadcastReplayState();
    console.log('Replay started:', workflowId);
    return { success: true, workflowId, tabId: tab.id };

  } catch (error) {
    console.error('Failed to start replay:', error);
    replayState.status = 'error';
    return { success: false, error: error.message };
  }
}

/**
 * Pauses current replay
 */
async function pauseReplay() {
  if (replayState.status !== 'replaying') {
    return { success: false, error: 'Not currently replaying' };
  }

  replayState.status = 'paused';

  if (replayState.tabId) {
    try {
      await chrome.tabs.sendMessage(replayState.tabId, { type: 'PAUSE_REPLAY' });
    } catch (e) {
      console.warn('Could not pause replay:', e);
    }
  }

  broadcastReplayState();
  return { success: true };
}

/**
 * Resumes paused replay
 */
async function resumeReplay() {
  if (replayState.status !== 'paused') {
    return { success: false, error: 'Replay not paused' };
  }

  replayState.status = 'replaying';

  if (replayState.tabId) {
    try {
      await chrome.tabs.sendMessage(replayState.tabId, { type: 'RESUME_REPLAY' });
    } catch (e) {
      console.warn('Could not resume replay:', e);
    }
  }

  broadcastReplayState();
  return { success: true };
}

/**
 * Cancels current replay
 */
async function cancelReplay() {
  if (replayState.status === 'idle' || replayState.status === 'complete') {
    return { success: false, error: 'No active replay to cancel' };
  }

  if (replayState.tabId) {
    try {
      await chrome.tabs.sendMessage(replayState.tabId, { type: 'CANCEL_REPLAY' });
    } catch (e) {
      console.warn('Could not cancel replay:', e);
    }
  }

  replayState.status = 'idle';
  broadcastReplayState();
  return { success: true };
}

/**
 * Gets current replay state
 */
function getReplayState() {
  return {
    success: true,
    status: replayState.status,
    currentStep: replayState.currentStep,
    totalSteps: replayState.totalSteps,
    workflowId: replayState.workflowId
  };
}

// ============================================================================
// AI FILL FUNCTIONS
// ============================================================================

/**
 * Gets AI usage stats and checks rate limit
 * @returns {Promise<Object>} {allowed: boolean, count: number, limit: number, resetDate: string}
 */
async function checkAIRateLimit() {
  try {
    const result = await chrome.storage.local.get(AI_USAGE_STORAGE_KEY);
    const usage = result[AI_USAGE_STORAGE_KEY] || { count: 0, resetDate: null };

    // Get current month (YYYY-MM-DD format, first of month)
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    // Reset if new month
    if (!usage.resetDate || usage.resetDate !== currentMonth) {
      usage.count = 0;
      usage.resetDate = currentMonth;
      await chrome.storage.local.set({ [AI_USAGE_STORAGE_KEY]: usage });
    }

    return {
      allowed: usage.count < AI_FILLS_PER_MONTH,
      count: usage.count,
      limit: AI_FILLS_PER_MONTH,
      resetDate: currentMonth
    };
  } catch (error) {
    console.error('Failed to check AI rate limit:', error);
    // On error, allow the request
    return { allowed: true, count: 0, limit: AI_FILLS_PER_MONTH, resetDate: null };
  }
}

/**
 * Increments AI usage counter
 * @returns {Promise<void>}
 */
async function incrementAIUsage() {
  try {
    const result = await chrome.storage.local.get(AI_USAGE_STORAGE_KEY);
    const usage = result[AI_USAGE_STORAGE_KEY] || { count: 0, resetDate: null };

    usage.count += 1;

    await chrome.storage.local.set({ [AI_USAGE_STORAGE_KEY]: usage });
    console.log(`AI usage: ${usage.count}/${AI_FILLS_PER_MONTH}`);
  } catch (error) {
    console.error('Failed to increment AI usage:', error);
  }
}

/**
 * Gets all clients from storage
 */
async function getClients() {
  try {
    const result = await chrome.storage.local.get('formGhostClients');
    return { success: true, clients: result.formGhostClients || [] };
  } catch (error) {
    console.error('Failed to get clients:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Creates a new client
 */
async function createClient(clientData) {
  try {
    const result = await chrome.storage.local.get('formGhostClients');
    const clients = result.formGhostClients || [];

    const newClient = {
      ...clientData,
      id: `client_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    clients.push(newClient);
    await chrome.storage.local.set({ formGhostClients: clients });

    return { success: true, client: newClient };
  } catch (error) {
    console.error('Failed to create client:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Updates an existing client
 */
async function updateClient(clientId, updates) {
  try {
    const result = await chrome.storage.local.get('formGhostClients');
    const clients = result.formGhostClients || [];

    const index = clients.findIndex(c => c.id === clientId);
    if (index === -1) {
      return { success: false, error: 'Client not found' };
    }

    clients[index] = {
      ...clients[index],
      ...updates,
      updatedAt: Date.now()
    };

    await chrome.storage.local.set({ formGhostClients: clients });
    return { success: true, client: clients[index] };
  } catch (error) {
    console.error('Failed to update client:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Deletes a client
 */
async function deleteClient(clientId) {
  try {
    const result = await chrome.storage.local.get('formGhostClients');
    const clients = result.formGhostClients || [];

    const filtered = clients.filter(c => c.id !== clientId);
    if (filtered.length === clients.length) {
      return { success: false, error: 'Client not found' };
    }

    await chrome.storage.local.set({ formGhostClients: filtered });
    return { success: true };
  } catch (error) {
    console.error('Failed to delete client:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Gets AI settings
 */
async function getAISettings() {
  try {
    const result = await chrome.storage.local.get('formGhostAISettings');
    const userSettings = result.formGhostAISettings || {};

    // Always use built-in API key, allow user to override other settings
    return {
      apiKey: FORMGHOST_API_KEY,
      excludeSensitive: true,
      defaultDateFormat: 'MM/DD/YYYY',
      defaultPhoneFormat: '(###) ###-####',
      cacheEnabled: true,
      ...userSettings,
      // Force built-in API key even if user settings exist
      apiKey: FORMGHOST_API_KEY
    };
  } catch (error) {
    console.error('Failed to get AI settings:', error);
    return {
      apiKey: FORMGHOST_API_KEY,
      excludeSensitive: true,
      defaultDateFormat: 'MM/DD/YYYY',
      defaultPhoneFormat: '(###) ###-####',
      cacheEnabled: true
    };
  }
}

/**
 * Saves AI settings
 */
async function saveAISettings(settings) {
  try {
    await chrome.storage.local.set({ formGhostAISettings: settings });
    return { success: true };
  } catch (error) {
    console.error('Failed to save AI settings:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Validates an API key by making a minimal request
 */
async function validateApiKey(apiKey) {
  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      })
    });

    if (response.ok) {
      return { valid: true };
    }

    const error = await response.json();
    if (response.status === 401) {
      return { valid: false, error: 'Invalid API key' };
    }
    return { valid: false, error: error.error?.message || 'Validation failed' };
  } catch (error) {
    console.error('API key validation failed:', error);
    return { valid: false, error: error.message };
  }
}

/**
 * Clears the mapping cache
 */
async function clearMappingCache() {
  try {
    await chrome.storage.local.set({ formGhostMappingCache: {} });
    return { success: true };
  } catch (error) {
    console.error('Failed to clear cache:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Gets cache statistics
 */
async function getCacheStats() {
  try {
    const result = await chrome.storage.local.get('formGhostMappingCache');
    const cache = result.formGhostMappingCache || {};
    return {
      totalEntries: Object.keys(cache).length,
      success: true
    };
  } catch (error) {
    return { totalEntries: 0, success: false };
  }
}

/**
 * Main AI form fill function
 */
async function aiFillForm(clientId) {
  try {
    // Check rate limit first
    const rateLimit = await checkAIRateLimit();
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: `You've used all ${rateLimit.limit} AI fills this month. Resets on ${new Date(rateLimit.resetDate).toLocaleDateString()}. Upgrade to Pro for unlimited fills.`,
        rateLimited: true
      };
    }

    // Get client data
    const clientsResult = await chrome.storage.local.get('formGhostClients');
    const clients = clientsResult.formGhostClients || [];
    const client = clients.find(c => c.id === clientId);

    if (!client) {
      return { success: false, error: 'Client not found' };
    }

    // Get AI settings (built-in API key)
    const settings = await getAISettings();

    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      return { success: false, error: 'No active tab' };
    }

    // Check if we can work on this page
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('about:') || tab.url.startsWith('edge://')) {
      return { success: false, error: 'Cannot fill forms on browser system pages' };
    }

    // Scan form fields
    let formFields;
    try {
      const scanResult = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_FORM' });
      if (!scanResult?.success || !scanResult.fields?.length) {
        return { success: false, error: 'No form fields found on page' };
      }
      formFields = scanResult.fields;
    } catch (e) {
      // Inject scanner if not loaded
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/formScanner.js', 'content/formFiller.js']
      });
      await new Promise(resolve => setTimeout(resolve, 300));

      const scanResult = await chrome.tabs.sendMessage(tab.id, { type: 'SCAN_FORM' });
      if (!scanResult?.success || !scanResult.fields?.length) {
        return { success: false, error: 'No form fields found on page' };
      }
      formFields = scanResult.fields;
    }

    // Prepare client data for AI (exclude sensitive if configured)
    const clientForAI = { ...client };
    if (settings.excludeSensitive) {
      delete clientForAI.ssnLast4;
      delete clientForAI.driversLicense;
      delete clientForAI.dlState;
    }
    delete clientForAI.id;
    delete clientForAI.createdAt;
    delete clientForAI.updatedAt;

    // Generate cache key
    const cacheKey = generateFormCacheKey(tab.url, formFields);

    // Check cache
    let mappings = null;
    if (settings.cacheEnabled) {
      const cacheResult = await chrome.storage.local.get('formGhostMappingCache');
      const cache = cacheResult.formGhostMappingCache || {};
      const cached = cache[cacheKey];
      if (cached && cached.timestamp > Date.now() - 30 * 24 * 60 * 60 * 1000) {
        mappings = cached.mappings;
        console.log('Using cached mappings for:', cacheKey);
      }
    }

    // If not cached, call Claude API
    if (!mappings) {
      mappings = await getAIMappings(settings.apiKey, formFields, clientForAI, settings);

      // Cache the mappings
      if (settings.cacheEnabled && mappings) {
        const cacheResult = await chrome.storage.local.get('formGhostMappingCache');
        const cache = cacheResult.formGhostMappingCache || {};
        cache[cacheKey] = {
          mappings,
          timestamp: Date.now()
        };
        await chrome.storage.local.set({ formGhostMappingCache: cache });
      }
    }

    if (!mappings || !mappings.length) {
      return { success: false, error: 'AI could not determine field mappings' };
    }

    // Apply client values to mappings
    const fillData = mappings.map(m => ({
      ...m,
      value: getClientValue(client, m.clientField, settings)
    })).filter(m => m.value !== null && m.value !== undefined && m.value !== '');

    // Send fill command to content script
    const fillResult = await chrome.tabs.sendMessage(tab.id, {
      type: 'FILL_FORM',
      mappings: fillData
    });

    // Increment AI usage counter if fill was successful
    if (fillResult && fillResult.success) {
      await incrementAIUsage();
    }

    return fillResult;
  } catch (error) {
    console.error('AI fill failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Generates a cache key for form mappings
 */
function generateFormCacheKey(url, fields) {
  const urlPath = new URL(url).pathname;
  const fieldSignature = fields.map(f => `${f.name || f.id || f.label}:${f.type}`).sort().join('|');
  return `${urlPath}::${hashString(fieldSignature)}`;
}

/**
 * Simple hash function
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Calls Claude API to get field mappings
 */
async function getAIMappings(apiKey, formFields, clientData, settings) {
  const systemPrompt = `You are a form field mapping assistant. Given a list of form fields and client data, determine which client data should fill which form field.

Return a JSON array of mappings with this structure:
{
  "mappings": [
    {"selector": "CSS_SELECTOR", "clientField": "FIELD_NAME", "confidence": 0.9},
    ...
  ],
  "unmapped": ["field names that couldn't be mapped"]
}

Guidelines:
- Use the selector from the field metadata to identify fields
- clientField should match the property name from the client data
- confidence should be 0.0-1.0 based on how certain the mapping is
- Handle date formats: convert to ${settings.defaultDateFormat || 'MM/DD/YYYY'}
- Handle phone formats: convert to ${settings.defaultPhoneFormat || '(###) ###-####'}
- For select/dropdown fields, try to match option values or text
- Common mappings: firstName->first name fields, lastName->last name, email->email, phone->phone/telephone, address->street/address1, city->city, state->state/province, zip->zip/postal

Only return valid JSON, no explanation.`;

  const userPrompt = `Form Fields:
${JSON.stringify(formFields.map(f => ({
    selector: f.selector,
    type: f.inputType || f.type,
    name: f.name,
    id: f.id,
    label: f.label,
    placeholder: f.placeholder,
    autocomplete: f.autocomplete,
    options: f.options?.slice(0, 10)
  })), null, 2)}

Client Data:
${JSON.stringify(clientData, null, 2)}

Map the client data to the appropriate form fields.`;

  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      // Handle rate limiting
      if (response.status === 429) {
        throw new Error('AI service is currently busy. Please try again in a few moments.');
      }

      // Handle other errors
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || 'AI matching service temporarily unavailable');
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '';

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = content;
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
    }

    const parsed = JSON.parse(jsonStr.trim());
    return parsed.mappings || [];
  } catch (error) {
    console.error('AI mapping failed:', error);
    return null;
  }
}

/**
 * Gets a value from client data, handling special formatting
 */
function getClientValue(client, fieldName, settings) {
  if (!fieldName || !client) return null;

  // Handle nested custom fields
  if (fieldName.startsWith('customFields.')) {
    const key = fieldName.replace('customFields.', '');
    return client.customFields?.[key] || null;
  }

  let value = client[fieldName];
  if (value === undefined || value === null) return null;

  // Format dates
  if (fieldName === 'dob' && value) {
    value = formatDate(value, settings.defaultDateFormat || 'MM/DD/YYYY');
  }

  // Format phone numbers
  if (['phone', 'phoneAlt', 'workPhone'].includes(fieldName) && value) {
    value = formatPhone(value, settings.defaultPhoneFormat || '(###) ###-####');
  }

  return value;
}

/**
 * Formats a date string
 */
function formatDate(dateStr, format) {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();

    switch (format) {
      case 'DD/MM/YYYY': return `${day}/${month}/${year}`;
      case 'YYYY-MM-DD': return `${year}-${month}-${day}`;
      default: return `${month}/${day}/${year}`;
    }
  } catch {
    return dateStr;
  }
}

/**
 * Formats a phone number
 */
function formatPhone(phone, format) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length !== 10) return phone;

  switch (format) {
    case '###-###-####':
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    case '##########':
      return digits;
    default: // (###) ###-####
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message.type);

  const handleAsync = async () => {
    switch (message.type) {
      case 'START_RECORDING': return await startRecording(message.settings);
      case 'PAUSE_RECORDING': return await pauseRecording();
      case 'STOP_RECORDING': return await stopRecording();
      case 'ACTION_CAPTURED':
        await handleActionCaptured(message.action);
        return { success: true };
      case 'NETWORK_CAPTURED':
        if (recordingState.status === 'recording' && recordingState.settings?.captureNetwork) {
          await RecordingStorage.addNetworkRequest(message.request);
        }
        return { success: true };
      case 'CONSOLE_CAPTURED':
        if (recordingState.status === 'recording' && message.messages?.length > 0) {
          await RecordingStorage.addConsoleLogs(message.messages);
        }
        return { success: true };
      case 'ASSERTION_CAPTURED':
        if (recordingState.status === 'recording' || recordingState.status === 'paused') {
          const assertionWithId = {
            ...message.assertion,
            id: `assert_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            afterAction: recordingState.lastActionId
          };
          await RecordingStorage.addAssertion(assertionWithId);
          await broadcastStateUpdate();
          console.log('Assertion captured:', assertionWithId.assertionType);
        }
        return { success: true };
      case 'ACTIVATE_ASSERTION_MODE':
        // Send message to content script to activate assertion mode
        if (recordingState.tabId) {
          try {
            await chrome.tabs.sendMessage(recordingState.tabId, { type: 'ACTIVATE_ASSERTION_MODE' });
          } catch (e) {
            console.warn('Could not activate assertion mode:', e);
          }
        }
        return { success: true };
      case 'TOGGLE_SIDEBAR':
        // Send message to content script to toggle sidebar
        try {
          // Use recording tab if available, otherwise active tab
          let tabId = recordingState.tabId;
          if (!tabId) {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            tabId = tab?.id;
          }
          if (tabId) {
            await chrome.tabs.sendMessage(tabId, { type: 'TOGGLE_SIDEBAR' });
          }
        } catch (e) {
          console.warn('Could not toggle sidebar:', e);
        }
        return { success: true };
      case 'ADD_ANNOTATION': return await addAnnotation(message.note);
      case 'EXPORT': return await exportRecording(message.format);
      case 'GET_STATE': return await getState();
      case 'CLEAR_RECORDING':
        await RecordingStorage.clearRecording();
        recordingState.status = 'ready';
        recordingState.startTime = null;
        return { success: true };
      case 'SAVE_NAMED_RECORDING':
        return await saveNamedRecording(message.name);
      case 'LOAD_NAMED_RECORDING':
        return await loadNamedRecording(message.recordingId);
      case 'DELETE_NAMED_RECORDING':
        return await deleteNamedRecording(message.recordingId);

      // Replay handlers
      case 'GET_WORKFLOWS':
        return await getWorkflows();
      case 'UPDATE_WORKFLOW':
        return await updateWorkflow(message.workflowId, message.updates);
      case 'DELETE_WORKFLOW':
        return await deleteWorkflow(message.workflowId);
      case 'DUPLICATE_WORKFLOW':
        return await duplicateWorkflow(message.workflowId, message.newName);
      case 'SAVE_PRESET':
        return await savePreset(message.workflowId, message.preset);
      case 'START_REPLAY':
        return await startReplay(message.workflowId, message.variables, message.options);
      case 'PAUSE_REPLAY':
        return await pauseReplay();
      case 'RESUME_REPLAY':
        return await resumeReplay();
      case 'CANCEL_REPLAY':
        return await cancelReplay();
      case 'GET_REPLAY_STATE':
        return getReplayState();

      // Replay progress from content script
      case 'REPLAY_PROGRESS':
        replayState.currentStep = message.current;
        replayState.totalSteps = message.total;
        replayState.stepInfo = message.stepInfo?.humanLabel || message.stepInfo?.type || '';
        broadcastReplayState();
        return { success: true };
      case 'REPLAY_COMPLETE':
        replayState.status = message.results?.success ? 'complete' : 'error';
        replayState.results = message.results;
        broadcastReplayState();
        console.log('Replay complete:', message.results);
        return { success: true };
      case 'REPLAY_PAUSED':
        replayState.status = 'paused';
        broadcastReplayState();
        return { success: true };
      case 'REPLAY_RESUMED':
        replayState.status = 'replaying';
        broadcastReplayState();
        return { success: true };
      case 'REPLAY_CANCELLED':
        replayState.status = 'idle';
        broadcastReplayState();
        return { success: true };
      case 'REPLAY_TAKEOVER':
        replayState.status = 'takeover';
        broadcastReplayState();
        return { success: true };
      case 'REPLAY_ERROR':
        replayState.status = 'error';
        replayState.error = message.error;
        broadcastReplayState();
        return { success: true };

      // AI Fill handlers
      case 'GET_CLIENTS':
        return await getClients();
      case 'CREATE_CLIENT':
        return await createClient(message.clientData);
      case 'UPDATE_CLIENT':
        return await updateClient(message.clientId, message.updates);
      case 'DELETE_CLIENT':
        return await deleteClient(message.clientId);
      case 'GET_AI_SETTINGS':
        return await getAISettings();
      case 'SAVE_AI_SETTINGS':
        return await saveAISettings(message.settings);
      case 'VALIDATE_API_KEY':
        return await validateApiKey(message.apiKey);
      case 'CLEAR_MAPPING_CACHE':
        return await clearMappingCache();
      case 'GET_CACHE_STATS':
        return await getCacheStats();
      case 'AI_FILL_FORM':
        // Use privacy-first AI fill if workflowId provided, fallback to legacy
        if (message.workflowId) {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab) return { success: false, error: 'No active tab' };
          return await privacyAiFillForm(message.workflowId, message.clientId, tab.id);
        }
        // Legacy mode (still sends PII - for backward compatibility)
        return await aiFillForm(message.clientId);

      default:
        return { success: false, error: 'Unknown message type' };
    }
  };

  handleAsync().then(sendResponse).catch(error => {
    console.error('Message handler error:', error);
    sendResponse({ success: false, error: error.message });
  });

  return true;
});

// Navigation listener - supports multi-tab
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (recordingState.status === 'recording' && recordingState.activeTabs.has(details.tabId) && details.frameId === 0) {
    const action = {
      id: generateActionId(),
      type: 'navigate',
      timestamp: Date.now(),
      context: {
        url: details.url,
        frameId: details.frameId,
        tabId: details.tabId,
        isNewTab: details.tabId !== recordingState.tabId
      }
    };
    recordingState.lastActionId = action.id;
    await RecordingStorage.addAction(action);
    await broadcastStateUpdate();

    setTimeout(async () => {
      try {
        await chrome.tabs.sendMessage(details.tabId, {
          type: 'START_RECORDING',
          settings: recordingState.settings
        });
      } catch (e) {
        console.warn('Could not start recording in tab:', details.tabId);
      }
    }, 500);
  }
});

// Tab created listener - track new tabs opened during recording
chrome.tabs.onCreated.addListener(async (tab) => {
  if (recordingState.status === 'recording') {
    // Add new tab to recording
    recordingState.activeTabs.add(tab.id);
    console.log('New tab added to recording:', tab.id);

    // Record tab creation action
    const action = {
      id: generateActionId(),
      type: 'newTab',
      timestamp: Date.now(),
      context: {
        tabId: tab.id,
        openerTabId: tab.openerTabId,
        url: tab.pendingUrl || tab.url || 'about:blank'
      }
    };
    recordingState.lastActionId = action.id;
    await RecordingStorage.addAction(action);
    await broadcastStateUpdate();
  }
});

// Tab activated listener - track tab switches
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (recordingState.status === 'recording' && recordingState.activeTabs.has(activeInfo.tabId)) {
    if (activeInfo.tabId !== recordingState.currentTabId) {
      const prevTabId = recordingState.currentTabId;
      recordingState.currentTabId = activeInfo.tabId;

      // Record tab switch
      try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        const action = {
          id: generateActionId(),
          type: 'switchTab',
          timestamp: Date.now(),
          context: {
            fromTabId: prevTabId,
            toTabId: activeInfo.tabId,
            url: tab.url,
            title: tab.title
          }
        };
        recordingState.lastActionId = action.id;
        await RecordingStorage.addAction(action);
        await broadcastStateUpdate();
        console.log('Tab switch recorded:', prevTabId, '->', activeInfo.tabId);
      } catch (e) {
        console.warn('Could not record tab switch:', e);
      }
    }
  }
});

// Network interception - supports multi-tab
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (recordingState.status === 'recording' &&
        recordingState.settings?.captureNetwork &&
        recordingState.activeTabs.has(details.tabId)) {
      recordingState.pendingRequests.set(details.requestId, {
        id: generateRequestId(),
        triggeredByAction: recordingState.lastActionId,
        url: details.url,
        method: details.method,
        type: details.type,
        tabId: details.tabId,
        timing: { started: Date.now() }
      });
    }
    return {};
  },
  { urls: ['<all_urls>'] },
  ['requestBody']
);

chrome.webRequest.onCompleted.addListener(
  async (details) => {
    if (recordingState.pendingRequests.has(details.requestId)) {
      const request = recordingState.pendingRequests.get(details.requestId);
      recordingState.pendingRequests.delete(details.requestId);
      await RecordingStorage.addNetworkRequest({
        ...request,
        responseStatus: details.statusCode,
        timing: { ...request.timing, ended: Date.now(), duration: Date.now() - request.timing.started }
      });
    }
  },
  { urls: ['<all_urls>'] }
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => recordingState.pendingRequests.delete(details.requestId),
  { urls: ['<all_urls>'] }
);

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (recordingState.status === 'recording' && recordingState.activeTabs.has(tabId)) {
    // Remove tab from active tabs
    recordingState.activeTabs.delete(tabId);
    console.log('Tab removed from recording:', tabId);

    // Record tab close action
    const action = {
      id: generateActionId(),
      type: 'closeTab',
      timestamp: Date.now(),
      context: { tabId }
    };
    await RecordingStorage.addAction(action);
    await broadcastStateUpdate();

    // If primary tab is closed, stop recording
    if (tabId === recordingState.tabId) {
      await stopRecording();
    }
  }
});

// Keyboard shortcut handlers
chrome.commands.onCommand.addListener(async (command) => {
  console.log('Command received:', command);

  switch (command) {
    case 'toggle-recording':
      if (recordingState.status === 'recording' || recordingState.status === 'paused') {
        await stopRecording();
        showNotification('Recording stopped');
      } else {
        const settings = await SettingsStorage.getSettings();
        await startRecording(settings);
        showNotification('Recording started');
      }
      break;

    case 'pause-recording':
      if (recordingState.status === 'recording') {
        await pauseRecording();
        showNotification('Recording paused');
      } else if (recordingState.status === 'paused') {
        recordingState.status = 'recording';
        await RecordingStorage.updateRecording({ status: 'recording' });
        await sendToContentScript({ type: 'START_RECORDING', settings: recordingState.settings });
        await broadcastStateUpdate();
        showNotification('Recording resumed');
      }
      break;

    case 'add-annotation':
      if (recordingState.status === 'recording' || recordingState.status === 'paused') {
        // Inject prompt in the content script
        if (recordingState.tabId) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: recordingState.tabId },
              func: () => {
                const note = prompt('Add annotation:');
                if (note) {
                  chrome.runtime.sendMessage({ type: 'ADD_ANNOTATION', note });
                }
              }
            });
          } catch (e) {
            console.warn('Could not prompt for annotation:', e);
          }
        }
      }
      break;
  }
});

/**
 * Shows a notification badge or console log
 * @param {string} message - Notification message
 */
function showNotification(message) {
  console.log('Notification:', message);
  // Could use chrome.notifications API here for visual feedback
}

console.log('Puppeteer Recorder Pro: Service worker initialized');
