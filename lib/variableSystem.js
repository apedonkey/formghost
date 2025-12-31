/**
 * FormGhost - Variable System Module
 * Handles variable extraction, injection, and validation for workflow replay
 */

/**
 * Variable pattern for matching {{variableName}} syntax
 */
const VARIABLE_PATTERN = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

/**
 * Variable System API
 */
const VariableSystem = {
  /**
   * Extracts all variable names from a workflow's actions
   * @param {Array} actions - Array of action objects
   * @returns {Object} Map of variable names to metadata
   */
  extractVariables(actions) {
    const variables = {};

    if (!actions || !Array.isArray(actions)) {
      return variables;
    }

    actions.forEach((action, index) => {
      // Check value field (most common for type actions)
      if (action.value && typeof action.value === 'string') {
        this._extractFromString(action.value, variables, {
          stepIndex: index,
          field: 'value',
          actionType: action.type
        });
      }

      // Check URL for navigate actions
      if (action.url && typeof action.url === 'string') {
        this._extractFromString(action.url, variables, {
          stepIndex: index,
          field: 'url',
          actionType: action.type
        });
      }

      // Check assertion values
      if (action.assertion) {
        if (action.assertion.expected && typeof action.assertion.expected === 'string') {
          this._extractFromString(action.assertion.expected, variables, {
            stepIndex: index,
            field: 'assertion.expected',
            actionType: action.type
          });
        }
      }

      // Check any nested data object
      if (action.data && typeof action.data === 'object') {
        Object.entries(action.data).forEach(([key, val]) => {
          if (typeof val === 'string') {
            this._extractFromString(val, variables, {
              stepIndex: index,
              field: `data.${key}`,
              actionType: action.type
            });
          }
        });
      }
    });

    return variables;
  },

  /**
   * Internal helper to extract variables from a string
   * @private
   */
  _extractFromString(str, variables, context) {
    let match;
    const pattern = new RegExp(VARIABLE_PATTERN.source, 'g');

    while ((match = pattern.exec(str)) !== null) {
      const varName = match[1];

      if (!variables[varName]) {
        variables[varName] = {
          name: varName,
          usages: [],
          required: true,
          type: 'string',
          description: ''
        };
      }

      variables[varName].usages.push(context);
    }
  },

  /**
   * Injects variable values into a string
   * @param {string} str - String containing {{variable}} placeholders
   * @param {Object} values - Map of variable names to values
   * @returns {string} String with variables replaced
   */
  injectVariables(str, values) {
    if (!str || typeof str !== 'string') {
      return str;
    }

    return str.replace(VARIABLE_PATTERN, (match, varName) => {
      if (values.hasOwnProperty(varName)) {
        return values[varName];
      }
      // Return original placeholder if no value provided
      return match;
    });
  },

  /**
   * Injects variables into an entire action object
   * @param {Object} action - Action object with potential variables
   * @param {Object} values - Map of variable names to values
   * @returns {Object} Action with variables injected
   */
  injectIntoAction(action, values) {
    if (!action || !values) {
      return action;
    }

    const injected = { ...action };

    // Inject into value field
    if (injected.value && typeof injected.value === 'string') {
      injected.value = this.injectVariables(injected.value, values);
    }

    // Inject into URL
    if (injected.url && typeof injected.url === 'string') {
      injected.url = this.injectVariables(injected.url, values);
    }

    // Inject into assertion
    if (injected.assertion) {
      injected.assertion = { ...injected.assertion };
      if (injected.assertion.expected && typeof injected.assertion.expected === 'string') {
        injected.assertion.expected = this.injectVariables(injected.assertion.expected, values);
      }
    }

    // Inject into data object
    if (injected.data && typeof injected.data === 'object') {
      injected.data = { ...injected.data };
      Object.keys(injected.data).forEach(key => {
        if (typeof injected.data[key] === 'string') {
          injected.data[key] = this.injectVariables(injected.data[key], values);
        }
      });
    }

    return injected;
  },

  /**
   * Validates that all required variables have values
   * @param {Object} required - Map of required variable names to metadata
   * @param {Object} provided - Map of provided variable values
   * @returns {Object} Validation result with missing variables
   */
  validateVariables(required, provided) {
    const missing = [];
    const empty = [];

    Object.keys(required).forEach(varName => {
      if (!provided.hasOwnProperty(varName)) {
        missing.push(varName);
      } else if (provided[varName] === '' || provided[varName] === null || provided[varName] === undefined) {
        empty.push(varName);
      }
    });

    return {
      valid: missing.length === 0,
      missing,
      empty,
      message: missing.length > 0
        ? `Missing required variables: ${missing.join(', ')}`
        : empty.length > 0
          ? `Empty variables (allowed but flagged): ${empty.join(', ')}`
          : 'All variables provided'
    };
  },

  /**
   * Checks if a string contains any variables
   * @param {string} str - String to check
   * @returns {boolean} True if string contains variables
   */
  hasVariables(str) {
    if (!str || typeof str !== 'string') {
      return false;
    }
    return VARIABLE_PATTERN.test(str);
  },

  /**
   * Gets all variable names from a string
   * @param {string} str - String to extract from
   * @returns {Array} Array of variable names
   */
  getVariableNames(str) {
    if (!str || typeof str !== 'string') {
      return [];
    }

    const names = [];
    let match;
    const pattern = new RegExp(VARIABLE_PATTERN.source, 'g');

    while ((match = pattern.exec(str)) !== null) {
      if (!names.includes(match[1])) {
        names.push(match[1]);
      }
    }

    return names;
  },

  /**
   * Creates a variable placeholder string
   * @param {string} name - Variable name
   * @returns {string} Variable placeholder {{name}}
   */
  createPlaceholder(name) {
    return `{{${name}}}`;
  },

  /**
   * Parses a variable definition from user input
   * @param {string} input - User input (e.g., "clientName" or "clientName:string:required")
   * @returns {Object} Parsed variable definition
   */
  parseVariableDefinition(input) {
    const parts = input.split(':').map(p => p.trim());

    return {
      name: parts[0] || 'variable',
      type: parts[1] || 'string',
      required: parts[2] !== 'optional',
      description: parts[3] || ''
    };
  },

  /**
   * Generates sample values for testing
   * @param {Object} variables - Map of variable definitions
   * @returns {Object} Map of variable names to sample values
   */
  generateSampleValues(variables) {
    const samples = {};

    Object.entries(variables).forEach(([name, meta]) => {
      const type = meta.type || 'string';

      switch (type) {
        case 'email':
          samples[name] = 'test@example.com';
          break;
        case 'phone':
          samples[name] = '555-123-4567';
          break;
        case 'number':
          samples[name] = '12345';
          break;
        case 'date':
          samples[name] = new Date().toISOString().split('T')[0];
          break;
        case 'url':
          samples[name] = 'https://example.com';
          break;
        default:
          samples[name] = `Sample ${name}`;
      }
    });

    return samples;
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VariableSystem, VARIABLE_PATTERN };
}

// Make available globally in content scripts
if (typeof window !== 'undefined') {
  window.FormGhostVariableSystem = VariableSystem;
}
