/**
 * FormGhost - Unmatched Fields UI
 * Shows user which fields need manual attention after AI fill
 */

const UnmatchedFieldsUI = {
  /**
   * Shows notification with unmatched fields
   * @param {Object} result - Fill result with unmatched fields
   */
  show(result) {
    const { unmatchedNewFields = [], unmatchedRecordedFields = [] } = result;

    if (unmatchedNewFields.length === 0 && unmatchedRecordedFields.length === 0) {
      this.showSuccess(result);
      return;
    }

    this.showUnmatchedNotification(unmatchedNewFields, unmatchedRecordedFields, result);
  },

  /**
   * Shows success notification (all fields matched)
   */
  showSuccess(result) {
    const notification = this.createNotification({
      title: '✓ Form Filled Successfully',
      message: `${result.results?.filled?.length || 0} fields filled automatically`,
      type: 'success',
      autoClose: 3000
    });

    document.body.appendChild(notification);
  },

  /**
   * Shows unmatched fields notification
   */
  showUnmatchedNotification(unmatchedNewFields, unmatchedRecordedFields, result) {
    const filledCount = result.results?.filled?.length || 0;
    const failedCount = result.results?.failed?.length || 0;

    const notification = this.createNotification({
      title: '⚠️ Some Fields Need Attention',
      message: `${filledCount} fields filled, ${unmatchedNewFields.length} need manual entry`,
      type: 'warning',
      autoClose: false // Don't auto-close
    });

    // Add details section
    if (unmatchedNewFields.length > 0) {
      const newFieldsSection = document.createElement('div');
      newFieldsSection.className = 'fg-unmatched-section';
      newFieldsSection.innerHTML = `
        <div class="fg-unmatched-header">
          <strong>Fields on this form that need manual entry:</strong>
          <span class="fg-unmatched-count">${unmatchedNewFields.length}</span>
        </div>
        <ul class="fg-unmatched-list">
          ${unmatchedNewFields.map(f => `
            <li class="fg-unmatched-item" data-selector="${this.escapeHtml(f.selector)}">
              <span class="fg-unmatched-label">${this.escapeHtml(f.label)}</span>
              <button class="fg-locate-btn" data-selector="${this.escapeHtml(f.selector)}">
                Locate
              </button>
            </li>
          `).join('')}
        </ul>
      `;

      notification.querySelector('.fg-notification-body').appendChild(newFieldsSection);
    }

    if (unmatchedRecordedFields.length > 0) {
      const recordedFieldsSection = document.createElement('div');
      recordedFieldsSection.className = 'fg-unmatched-section';
      recordedFieldsSection.innerHTML = `
        <div class="fg-unmatched-header">
          <strong>Fields from recording not on this form:</strong>
          <span class="fg-unmatched-count">${unmatchedRecordedFields.length}</span>
        </div>
        <ul class="fg-unmatched-list fg-unmatched-list-secondary">
          ${unmatchedRecordedFields.map(f => `
            <li class="fg-unmatched-item-secondary">
              ${this.escapeHtml(f.label)}
            </li>
          `).join('')}
        </ul>
      `;

      notification.querySelector('.fg-notification-body').appendChild(recordedFieldsSection);
    }

    // Add event listeners for "Locate" buttons
    notification.querySelectorAll('.fg-locate-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const selector = e.target.dataset.selector;
        this.locateAndHighlight(selector);
      });
    });

    document.body.appendChild(notification);
  },

  /**
   * Creates a notification element
   */
  createNotification({ title, message, type = 'info', autoClose = false }) {
    this.injectStyles();

    const notification = document.createElement('div');
    notification.className = `fg-notification fg-notification-${type}`;
    notification.innerHTML = `
      <div class="fg-notification-header">
        <div class="fg-notification-title">${title}</div>
        <button class="fg-notification-close" aria-label="Close">×</button>
      </div>
      <div class="fg-notification-body">
        <p class="fg-notification-message">${message}</p>
      </div>
    `;

    // Close button handler
    notification.querySelector('.fg-notification-close').addEventListener('click', () => {
      this.close(notification);
    });

    // Auto-close timer
    if (autoClose) {
      setTimeout(() => {
        this.close(notification);
      }, autoClose);
    }

    return notification;
  },

  /**
   * Locates and highlights a field
   */
  locateAndHighlight(selector) {
    try {
      const element = document.querySelector(selector);
      if (!element) {
        alert(`Field not found: ${selector}`);
        return;
      }

      // Scroll into view
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });

      // Highlight with pulsing animation
      const originalOutline = element.style.outline;
      const originalBoxShadow = element.style.boxShadow;

      element.style.outline = '3px solid #f59e0b';
      element.style.boxShadow = '0 0 20px #f59e0baa';
      element.style.transition = 'all 0.3s ease';

      // Pulse 3 times
      let pulseCount = 0;
      const pulseInterval = setInterval(() => {
        element.style.outline = element.style.outline === 'none' ? '3px solid #f59e0b' : 'none';
        element.style.boxShadow = element.style.boxShadow === 'none' ? '0 0 20px #f59e0baa' : 'none';

        pulseCount++;
        if (pulseCount >= 6) {
          clearInterval(pulseInterval);
          setTimeout(() => {
            element.style.outline = originalOutline;
            element.style.boxShadow = originalBoxShadow;
          }, 300);
        }
      }, 300);

      // Focus the field
      element.focus();

    } catch (error) {
      console.error('Failed to locate field:', error);
      alert(`Error locating field: ${error.message}`);
    }
  },

  /**
   * Closes a notification
   */
  close(notification) {
    notification.style.opacity = '0';
    notification.style.transform = 'translateX(400px)';
    setTimeout(() => {
      notification.remove();
    }, 300);
  },

  /**
   * Escapes HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  /**
   * Injects CSS styles
   */
  injectStyles() {
    if (document.getElementById('fg-unmatched-ui-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'fg-unmatched-ui-styles';
    styles.textContent = `
      .fg-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 420px;
        max-width: calc(100vw - 40px);
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        color: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px;
        opacity: 1;
        transform: translateX(0);
        transition: all 0.3s ease;
        max-height: calc(100vh - 40px);
        overflow-y: auto;
      }

      .fg-notification-success {
        border-left: 4px solid #10b981;
      }

      .fg-notification-warning {
        border-left: 4px solid #f59e0b;
      }

      .fg-notification-error {
        border-left: 4px solid #ef4444;
      }

      .fg-notification-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }

      .fg-notification-title {
        font-weight: 600;
        font-size: 16px;
      }

      .fg-notification-close {
        background: none;
        border: none;
        color: white;
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
      }

      .fg-notification-close:hover {
        background: rgba(255, 255, 255, 0.1);
      }

      .fg-notification-body {
        padding: 16px 20px;
      }

      .fg-notification-message {
        margin: 0 0 16px 0;
        color: rgba(255, 255, 255, 0.9);
      }

      .fg-unmatched-section {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }

      .fg-unmatched-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }

      .fg-unmatched-count {
        background: #f59e0b;
        color: #1a1a2e;
        padding: 2px 10px;
        border-radius: 12px;
        font-weight: 600;
        font-size: 12px;
      }

      .fg-unmatched-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .fg-unmatched-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 12px;
        margin-bottom: 8px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 6px;
        border-left: 3px solid #f59e0b;
      }

      .fg-unmatched-label {
        flex: 1;
        color: rgba(255, 255, 255, 0.9);
      }

      .fg-locate-btn {
        background: #f59e0b;
        color: #1a1a2e;
        border: none;
        padding: 6px 14px;
        border-radius: 6px;
        font-weight: 600;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s;
        margin-left: 12px;
      }

      .fg-locate-btn:hover {
        background: #fbbf24;
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(251, 191, 36, 0.3);
      }

      .fg-unmatched-list-secondary {
        opacity: 0.7;
      }

      .fg-unmatched-item-secondary {
        padding: 8px 12px;
        margin-bottom: 6px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 4px;
        color: rgba(255, 255, 255, 0.7);
        font-size: 13px;
      }

      @keyframes slideInRight {
        from {
          opacity: 0;
          transform: translateX(400px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      .fg-notification {
        animation: slideInRight 0.3s ease;
      }
    `;

    document.head.appendChild(styles);
  }
};

// Listen for fill completion messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SHOW_UNMATCHED_FIELDS') {
    UnmatchedFieldsUI.show(message.result);
    sendResponse({ success: true });
    return true;
  }
});

// Expose to global scope
window.UnmatchedFieldsUI = UnmatchedFieldsUI;

console.log('FormGhost Unmatched Fields UI: Loaded');
