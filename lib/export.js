/**
 * Puppeteer Recorder Pro - Export Generator
 * Generates JSON, Puppeteer scripts, and plain text summaries from recordings
 */

/**
 * Export configuration
 */
const EXPORT_CONFIG = {
  puppeteerVersion: '21.0.0',
  defaultTimeout: 30000,
  defaultViewport: { width: 1920, height: 1080 }
};

/**
 * Escapes string for JavaScript code generation
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
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

/**
 * Gets the best selector for Puppeteer from element info
 * @param {Object} element - Element info with selectors
 * @returns {string} Best CSS selector
 */
function getBestSelector(element) {
  if (!element?.selectors?.length) {
    return element?.recommended || 'body';
  }

  // Prefer non-Playwright selectors for Puppeteer compatibility
  for (const sel of element.selectors) {
    if (!sel.isPlaywright && sel.confidence >= 0.5) {
      return sel.value;
    }
  }

  // Fall back to converting Playwright selectors
  const first = element.selectors[0];
  if (first.isPlaywright && first.value.includes(':has-text')) {
    // Convert :has-text to XPath for Puppeteer
    const match = first.value.match(/^(\w+):has-text\("(.+)"\)$/);
    if (match) {
      return `xpath=//${match[1]}[contains(text(), "${match[2]}")]`;
    }
  }

  return element.recommended || element.selectors[0]?.value || 'body';
}

/**
 * Generates a wait statement for Puppeteer
 * @param {Object} waitBefore - Wait info from action
 * @returns {string|null} Puppeteer wait code or null
 */
function generateWaitCode(waitBefore) {
  if (!waitBefore || waitBefore.type === 'none' || waitBefore.type === 'immediate') {
    return null;
  }

  switch (waitBefore.type) {
    case 'networkIdle':
      return "await page.waitForNetworkIdle();";
    case 'domSettled':
      return "await page.waitForTimeout(500);";
    case 'loadingComplete':
      return "await page.waitForSelector('.loading', { hidden: true }).catch(() => {});";
    default:
      if (waitBefore.duration > 1000) {
        return `await page.waitForTimeout(${Math.min(waitBefore.duration, 3000)});`;
      }
      return null;
  }
}

/**
 * Generates Puppeteer code for a single action
 * @param {Object} action - Action object
 * @param {number} index - Action index
 * @param {Object} settings - Export settings
 * @returns {string} Puppeteer code lines
 */
function generateActionCode(action, index, settings) {
  const lines = [];
  const selector = getBestSelector(action.element);
  const comment = action.element?.humanLabel || action.type;

  // Add wait if needed
  const waitCode = generateWaitCode(action.waitBefore);
  if (waitCode) {
    lines.push(`  ${waitCode}`);
  }

  // Add comment
  lines.push(`  // Step ${index + 1}: ${comment}`);

  switch (action.type) {
    case 'navigate':
      lines.push(`  await page.goto('${escapeJSString(action.context?.url)}', { waitUntil: 'networkidle0' });`);
      break;

    case 'click':
      if (selector.startsWith('xpath=')) {
        const xpath = selector.replace('xpath=', '');
        lines.push(`  await page.waitForXPath('${escapeJSString(xpath)}');`);
        lines.push(`  const el${index} = await page.$x('${escapeJSString(xpath)}');`);
        lines.push(`  await el${index}[0].click();`);
      } else {
        lines.push(`  await page.waitForSelector('${escapeJSString(selector)}');`);
        lines.push(`  await page.click('${escapeJSString(selector)}');`);
      }
      break;

    case 'dblclick':
      lines.push(`  await page.waitForSelector('${escapeJSString(selector)}');`);
      lines.push(`  await page.click('${escapeJSString(selector)}', { clickCount: 2 });`);
      break;

    case 'type':
      const value = settings?.redactSensitive && action.element?.attributes?.type === 'password'
        ? '[REDACTED]'
        : action.value;
      lines.push(`  await page.waitForSelector('${escapeJSString(selector)}');`);
      // Clear existing value first
      lines.push(`  await page.click('${escapeJSString(selector)}', { clickCount: 3 });`);
      lines.push(`  await page.type('${escapeJSString(selector)}', '${escapeJSString(value)}');`);
      break;

    case 'keypress':
      const key = action.key;
      if (action.element) {
        lines.push(`  await page.waitForSelector('${escapeJSString(selector)}');`);
        lines.push(`  await page.focus('${escapeJSString(selector)}');`);
      }
      lines.push(`  await page.keyboard.press('${key}');`);
      break;

    case 'select':
      lines.push(`  await page.waitForSelector('${escapeJSString(selector)}');`);
      lines.push(`  await page.select('${escapeJSString(selector)}', '${escapeJSString(action.value)}');`);
      break;

    case 'scroll':
      lines.push(`  await page.evaluate(() => window.scrollTo(${action.scrollTo?.x || 0}, ${action.scrollTo?.y || 0}));`);
      break;

    case 'hover':
      lines.push(`  await page.waitForSelector('${escapeJSString(selector)}');`);
      lines.push(`  await page.hover('${escapeJSString(selector)}');`);
      break;

    case 'submit':
      // Usually handled by Enter key or button click
      lines.push(`  // Form submission (typically triggered by previous action)`);
      break;

    default:
      lines.push(`  // Unknown action type: ${action.type}`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Export Generator class
 */
const ExportGenerator = {
  /**
   * Exports recording as JSON
   * @param {Object} recording - Recording object
   * @returns {string} JSON string
   */
  toJSON(recording) {
    const exportData = {
      meta: {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        recordingId: recording.id,
        duration: recording.endTime
          ? recording.endTime - recording.startTime
          : null
      },
      sessionContext: recording.sessionContext,
      actions: recording.actions,
      networkRequests: recording.networkRequests,
      annotations: recording.annotations,
      statistics: {
        totalActions: recording.actions.length,
        totalRequests: recording.networkRequests.length,
        totalAnnotations: recording.annotations.length,
        actionTypes: recording.actions.reduce((acc, action) => {
          acc[action.type] = (acc[action.type] || 0) + 1;
          return acc;
        }, {})
      }
    };

    return JSON.stringify(exportData, null, 2);
  },

  /**
   * Exports recording as Puppeteer script
   * @param {Object} recording - Recording object
   * @param {Object} settings - Export settings
   * @returns {string} Puppeteer script
   */
  toPuppeteerScript(recording, settings = {}) {
    const { actions, sessionContext, annotations } = recording;

    // Build annotation lookup by action ID
    const annotationMap = new Map();
    for (const ann of annotations) {
      if (ann.afterAction) {
        annotationMap.set(ann.afterAction, ann.note);
      }
    }

    const viewport = sessionContext?.viewport || EXPORT_CONFIG.defaultViewport;
    const startUrl = sessionContext?.startUrl || actions.find(a => a.type === 'navigate')?.context?.url || 'about:blank';

    let script = `/**
 * Puppeteer Script
 * Generated by Puppeteer Recorder Pro
 * Recording ID: ${recording.id}
 * Generated: ${new Date().toISOString()}
 *
 * Actions recorded: ${actions.length}
 * Annotations: ${annotations.length}
 */

const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null
  });

  const page = await browser.newPage();
  await page.setViewport({ width: ${viewport.width}, height: ${viewport.height} });

  // Set default timeout
  page.setDefaultTimeout(${EXPORT_CONFIG.defaultTimeout});

`;

    // Add session context restoration if available
    if (sessionContext?.cookies?.length && !settings.redactSensitive) {
      script += `  // Restore session cookies\n`;
      script += `  await page.setCookie(\n`;
      const cookieStrs = sessionContext.cookies
        .filter(c => c.value !== '[REDACTED]')
        .slice(0, 10) // Limit to first 10 cookies
        .map(c => `    { name: '${escapeJSString(c.name)}', value: '${escapeJSString(c.value)}', domain: '${escapeJSString(c.domain)}' }`);
      script += cookieStrs.join(',\n');
      script += `\n  );\n\n`;
    }

    // Navigate to start URL
    script += `  // Navigate to starting URL\n`;
    script += `  await page.goto('${escapeJSString(startUrl)}', { waitUntil: 'networkidle0' });\n\n`;

    // Generate code for each action
    let actionIndex = 0;
    for (const action of actions) {
      // Skip navigation if it's to the start URL
      if (action.type === 'navigate' && action.context?.url === startUrl && actionIndex === 0) {
        actionIndex++;
        continue;
      }

      script += generateActionCode(action, actionIndex, settings);

      // Add annotation comment if present
      const annotation = annotationMap.get(action.id);
      if (annotation) {
        script += `  // NOTE: ${escapeJSString(annotation)}\n\n`;
      }

      actionIndex++;
    }

    // Close browser
    script += `  // Recording complete
  console.log('Script execution complete');

  // Uncomment to close browser automatically
  // await browser.close();
})();
`;

    return script;
  },

  /**
   * Exports recording as plain text step summary
   * @param {Object} recording - Recording object
   * @returns {string} Plain text summary
   */
  toStepSummary(recording) {
    const { actions, annotations } = recording;

    // Build annotation lookup
    const annotationMap = new Map();
    for (const ann of annotations) {
      if (ann.afterAction) {
        annotationMap.set(ann.afterAction, ann.note);
      }
    }

    let summary = `Recording Summary\n`;
    summary += `================\n`;
    summary += `Recording ID: ${recording.id}\n`;
    summary += `Total Steps: ${actions.length}\n`;
    summary += `Annotations: ${annotations.length}\n\n`;
    summary += `Steps:\n`;
    summary += `------\n\n`;

    let stepNum = 1;
    for (const action of actions) {
      const label = action.element?.humanLabel || action.type;

      switch (action.type) {
        case 'navigate':
          summary += `${stepNum}. Navigate to ${action.context?.url}\n`;
          break;

        case 'click':
          summary += `${stepNum}. Click "${label}"\n`;
          break;

        case 'dblclick':
          summary += `${stepNum}. Double-click "${label}"\n`;
          break;

        case 'type':
          const displayValue = action.element?.attributes?.type === 'password'
            ? '****'
            : `"${action.value}"`;
          summary += `${stepNum}. Type ${displayValue} into "${label}"\n`;
          break;

        case 'keypress':
          summary += `${stepNum}. Press ${action.key} key\n`;
          break;

        case 'select':
          summary += `${stepNum}. Select "${action.value}" from "${label}"\n`;
          break;

        case 'scroll':
          summary += `${stepNum}. Scroll to position (${action.scrollTo?.x}, ${action.scrollTo?.y})\n`;
          break;

        case 'hover':
          summary += `${stepNum}. Hover over "${label}"\n`;
          break;

        case 'submit':
          summary += `${stepNum}. Submit form\n`;
          break;

        default:
          summary += `${stepNum}. ${action.type}: ${label}\n`;
      }

      // Add wait info if significant
      if (action.waitBefore?.duration > 500) {
        summary += `   [Wait: ${Math.round(action.waitBefore.duration / 1000)}s for ${action.waitBefore.type}]\n`;
      }

      // Add annotation if present
      const annotation = annotationMap.get(action.id);
      if (annotation) {
        summary += `   [Note: ${annotation}]\n`;
      }

      stepNum++;
    }

    return summary;
  },

  /**
   * Exports recording for LLM consumption (structured for Claude/GPT)
   * @param {Object} recording - Recording object
   * @returns {string} LLM-optimized format
   */
  toLLMFormat(recording) {
    return JSON.stringify({
      purpose: 'Browser automation recording for script generation',
      instructions: 'Use this recording data to generate or modify Puppeteer automation scripts.',
      recording: {
        id: recording.id,
        sessionContext: recording.sessionContext,
        actions: recording.actions.map(action => ({
          type: action.type,
          selector: action.element?.recommended,
          allSelectors: action.element?.selectors,
          humanLabel: action.element?.humanLabel,
          value: action.value,
          waitBefore: action.waitBefore,
          context: action.context
        })),
        annotations: recording.annotations,
        networkRequests: recording.networkRequests.slice(0, 50) // Limit for token efficiency
      }
    }, null, 2);
  }
};

// Export for ES modules
export { ExportGenerator };
