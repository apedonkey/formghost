/**
 * FormGhost - Storage Module
 * Handles persistence of recording data and workflows to chrome.storage.local
 */

/**
 * Default recording structure
 * @returns {Object} Empty recording object
 */
function createEmptyRecording() {
  return {
    id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    status: 'ready',
    startTime: null,
    endTime: null,
    actions: [],
    networkRequests: [],
    annotations: [],
    sessionContext: null
  };
}

/**
 * Default settings structure
 * @returns {Object} Default settings object
 */
function getDefaultSettings() {
  return {
    captureScreenshots: true,
    captureNetwork: true,
    captureStorage: true,
    captureHover: false,
    redactSensitive: false
  };
}

/**
 * Storage API wrapper for recording operations
 */
const RecordingStorage = {
  /**
   * Gets the current recording from storage
   * @returns {Promise<Object>} Current recording object
   */
  async getRecording() {
    try {
      const result = await chrome.storage.local.get('currentRecording');
      return result.currentRecording || createEmptyRecording();
    } catch (error) {
      console.error('Storage: Failed to get recording:', error);
      return createEmptyRecording();
    }
  },

  /**
   * Saves the current recording to storage
   * @param {Object} recording - Recording object to save
   * @returns {Promise<void>}
   */
  async saveRecording(recording) {
    try {
      await chrome.storage.local.set({ currentRecording: recording });
    } catch (error) {
      console.error('Storage: Failed to save recording:', error);
      throw error;
    }
  },

  /**
   * Updates specific fields of the current recording
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated recording
   */
  async updateRecording(updates) {
    const recording = await this.getRecording();
    const updated = { ...recording, ...updates };
    await this.saveRecording(updated);
    return updated;
  },

  /**
   * Adds an action to the current recording
   * @param {Object} action - Action to add
   * @returns {Promise<Object>} Updated recording
   */
  async addAction(action) {
    const recording = await this.getRecording();
    recording.actions.push(action);

    // Auto-save every 10 actions
    if (recording.actions.length % 10 === 0) {
      console.log(`Storage: Auto-saving at ${recording.actions.length} actions`);
    }

    await this.saveRecording(recording);
    return recording;
  },

  /**
   * Adds a network request to the current recording
   * @param {Object} request - Network request to add
   * @returns {Promise<Object>} Updated recording
   */
  async addNetworkRequest(request) {
    const recording = await this.getRecording();
    recording.networkRequests.push(request);
    await this.saveRecording(recording);
    return recording;
  },

  /**
   * Adds an annotation to the current recording
   * @param {Object} annotation - Annotation to add
   * @returns {Promise<Object>} Updated recording
   */
  async addAnnotation(annotation) {
    const recording = await this.getRecording();
    recording.annotations.push(annotation);
    await this.saveRecording(recording);
    return recording;
  },

  /**
   * Updates the session context
   * @param {Object} context - Session context data
   * @returns {Promise<Object>} Updated recording
   */
  async updateSessionContext(context) {
    return this.updateRecording({ sessionContext: context });
  },

  /**
   * Clears the current recording
   * @returns {Promise<Object>} New empty recording
   */
  async clearRecording() {
    const newRecording = createEmptyRecording();
    await this.saveRecording(newRecording);
    return newRecording;
  },

  /**
   * Gets recording statistics
   * @returns {Promise<Object>} Statistics object
   */
  async getStats() {
    const recording = await this.getRecording();
    return {
      actions: recording.actions.length,
      requests: recording.networkRequests.length,
      annotations: recording.annotations.length,
      duration: recording.endTime
        ? recording.endTime - recording.startTime
        : recording.startTime
          ? Date.now() - recording.startTime
          : 0
    };
  }
};

/**
 * Storage API wrapper for settings
 */
const SettingsStorage = {
  /**
   * Gets current settings
   * @returns {Promise<Object>} Settings object
   */
  async getSettings() {
    try {
      const result = await chrome.storage.local.get('settings');
      return { ...getDefaultSettings(), ...result.settings };
    } catch (error) {
      console.error('Storage: Failed to get settings:', error);
      return getDefaultSettings();
    }
  },

  /**
   * Saves settings
   * @param {Object} settings - Settings to save
   * @returns {Promise<void>}
   */
  async saveSettings(settings) {
    try {
      await chrome.storage.local.set({ settings });
    } catch (error) {
      console.error('Storage: Failed to save settings:', error);
      throw error;
    }
  },

  /**
   * Updates specific settings
   * @param {Object} updates - Settings to update
   * @returns {Promise<Object>} Updated settings
   */
  async updateSettings(updates) {
    const settings = await this.getSettings();
    const updated = { ...settings, ...updates };
    await this.saveSettings(updated);
    return updated;
  }
};

/**
 * Utility functions for storage management
 */
const StorageUtils = {
  /**
   * Gets storage usage statistics
   * @returns {Promise<Object>} Storage usage info
   */
  async getStorageUsage() {
    try {
      const bytesInUse = await chrome.storage.local.getBytesInUse();
      const quota = chrome.storage.local.QUOTA_BYTES || 5242880; // 5MB default
      return {
        bytesUsed: bytesInUse,
        quota,
        percentUsed: ((bytesInUse / quota) * 100).toFixed(2)
      };
    } catch (error) {
      console.error('Storage: Failed to get usage:', error);
      return { bytesUsed: 0, quota: 5242880, percentUsed: '0.00' };
    }
  },

  /**
   * Clears all extension storage
   * @returns {Promise<void>}
   */
  async clearAll() {
    try {
      await chrome.storage.local.clear();
    } catch (error) {
      console.error('Storage: Failed to clear all:', error);
      throw error;
    }
  },

  /**
   * Exports all storage data
   * @returns {Promise<Object>} All stored data
   */
  async exportAll() {
    try {
      return await chrome.storage.local.get(null);
    } catch (error) {
      console.error('Storage: Failed to export all:', error);
      throw error;
    }
  }
};

/**
 * Creates a new workflow object from a recording
 * @param {Object} recording - Recording to convert to workflow
 * @param {string} name - Workflow name
 * @param {Array} tags - Optional tags for organization
 * @returns {Object} Workflow object
 */
function createWorkflow(recording, name, tags = []) {
  return {
    id: `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: name || `Workflow ${new Date().toLocaleDateString()}`,
    savedAt: Date.now(),
    actionCount: recording.actions?.length || 0,
    tags: tags,
    lastRun: null,
    runCount: 0,
    variables: {},
    presets: [],
    recording: recording
  };
}

/**
 * Storage API wrapper for workflow operations
 */
const WorkflowStorage = {
  /**
   * Gets all saved workflows
   * @returns {Promise<Array>} Array of workflow objects
   */
  async getWorkflows() {
    try {
      const result = await chrome.storage.local.get('workflows');
      return result.workflows || [];
    } catch (error) {
      console.error('Storage: Failed to get workflows:', error);
      return [];
    }
  },

  /**
   * Gets a single workflow by ID
   * @param {string} id - Workflow ID
   * @returns {Promise<Object|null>} Workflow object or null
   */
  async getWorkflow(id) {
    try {
      const workflows = await this.getWorkflows();
      return workflows.find(w => w.id === id) || null;
    } catch (error) {
      console.error('Storage: Failed to get workflow:', error);
      return null;
    }
  },

  /**
   * Saves a new workflow
   * @param {Object} recording - Recording to save as workflow
   * @param {string} name - Workflow name
   * @param {Array} tags - Optional tags
   * @returns {Promise<Object>} Saved workflow
   */
  async saveWorkflow(recording, name, tags = []) {
    try {
      const workflows = await this.getWorkflows();
      const workflow = createWorkflow(recording, name, tags);

      // Extract variables from actions
      if (typeof window !== 'undefined' && window.FormGhostVariableSystem) {
        workflow.variables = window.FormGhostVariableSystem.extractVariables(recording.actions);
      }

      workflows.unshift(workflow); // Add to beginning
      await chrome.storage.local.set({ workflows });
      return workflow;
    } catch (error) {
      console.error('Storage: Failed to save workflow:', error);
      throw error;
    }
  },

  /**
   * Updates an existing workflow
   * @param {string} id - Workflow ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated workflow
   */
  async updateWorkflow(id, updates) {
    try {
      const workflows = await this.getWorkflows();
      const index = workflows.findIndex(w => w.id === id);

      if (index === -1) {
        throw new Error(`Workflow not found: ${id}`);
      }

      workflows[index] = { ...workflows[index], ...updates };
      await chrome.storage.local.set({ workflows });
      return workflows[index];
    } catch (error) {
      console.error('Storage: Failed to update workflow:', error);
      throw error;
    }
  },

  /**
   * Deletes a workflow
   * @param {string} id - Workflow ID
   * @returns {Promise<void>}
   */
  async deleteWorkflow(id) {
    try {
      const workflows = await this.getWorkflows();
      const filtered = workflows.filter(w => w.id !== id);
      await chrome.storage.local.set({ workflows: filtered });
    } catch (error) {
      console.error('Storage: Failed to delete workflow:', error);
      throw error;
    }
  },

  /**
   * Records a workflow run (updates lastRun and runCount)
   * @param {string} id - Workflow ID
   * @returns {Promise<Object>} Updated workflow
   */
  async recordWorkflowRun(id) {
    try {
      const workflow = await this.getWorkflow(id);
      if (!workflow) {
        throw new Error(`Workflow not found: ${id}`);
      }

      return await this.updateWorkflow(id, {
        lastRun: Date.now(),
        runCount: (workflow.runCount || 0) + 1
      });
    } catch (error) {
      console.error('Storage: Failed to record workflow run:', error);
      throw error;
    }
  },

  /**
   * Saves a variable preset for a workflow
   * @param {string} workflowId - Workflow ID
   * @param {string} presetName - Name for the preset
   * @param {Object} values - Variable values
   * @returns {Promise<Object>} Updated workflow
   */
  async savePreset(workflowId, presetName, values) {
    try {
      const workflow = await this.getWorkflow(workflowId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      const presets = workflow.presets || [];
      const existingIndex = presets.findIndex(p => p.name === presetName);

      const preset = {
        id: `preset_${Date.now()}`,
        name: presetName,
        values: values,
        createdAt: Date.now()
      };

      if (existingIndex >= 0) {
        presets[existingIndex] = preset;
      } else {
        presets.push(preset);
      }

      return await this.updateWorkflow(workflowId, { presets });
    } catch (error) {
      console.error('Storage: Failed to save preset:', error);
      throw error;
    }
  },

  /**
   * Deletes a variable preset
   * @param {string} workflowId - Workflow ID
   * @param {string} presetId - Preset ID to delete
   * @returns {Promise<Object>} Updated workflow
   */
  async deletePreset(workflowId, presetId) {
    try {
      const workflow = await this.getWorkflow(workflowId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      const presets = (workflow.presets || []).filter(p => p.id !== presetId);
      return await this.updateWorkflow(workflowId, { presets });
    } catch (error) {
      console.error('Storage: Failed to delete preset:', error);
      throw error;
    }
  },

  /**
   * Gets workflows by tag
   * @param {string} tag - Tag to filter by
   * @returns {Promise<Array>} Filtered workflows
   */
  async getWorkflowsByTag(tag) {
    try {
      const workflows = await this.getWorkflows();
      return workflows.filter(w => w.tags && w.tags.includes(tag));
    } catch (error) {
      console.error('Storage: Failed to get workflows by tag:', error);
      return [];
    }
  },

  /**
   * Gets all unique tags across workflows
   * @returns {Promise<Array>} Array of unique tags
   */
  async getAllTags() {
    try {
      const workflows = await this.getWorkflows();
      const tagSet = new Set();
      workflows.forEach(w => {
        if (w.tags && Array.isArray(w.tags)) {
          w.tags.forEach(t => tagSet.add(t));
        }
      });
      return Array.from(tagSet).sort();
    } catch (error) {
      console.error('Storage: Failed to get all tags:', error);
      return [];
    }
  },

  /**
   * Duplicates a workflow
   * @param {string} id - Workflow ID to duplicate
   * @param {string} newName - Name for the copy
   * @returns {Promise<Object>} New workflow copy
   */
  async duplicateWorkflow(id, newName) {
    try {
      const original = await this.getWorkflow(id);
      if (!original) {
        throw new Error(`Workflow not found: ${id}`);
      }

      const workflows = await this.getWorkflows();
      const duplicate = {
        ...original,
        id: `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: newName || `${original.name} (Copy)`,
        savedAt: Date.now(),
        lastRun: null,
        runCount: 0
      };

      workflows.unshift(duplicate);
      await chrome.storage.local.set({ workflows });
      return duplicate;
    } catch (error) {
      console.error('Storage: Failed to duplicate workflow:', error);
      throw error;
    }
  },

  /**
   * Gets recent workflows sorted by lastRun
   * @param {number} limit - Maximum workflows to return
   * @returns {Promise<Array>} Recent workflows
   */
  async getRecentWorkflows(limit = 5) {
    try {
      const workflows = await this.getWorkflows();
      return workflows
        .filter(w => w.lastRun)
        .sort((a, b) => b.lastRun - a.lastRun)
        .slice(0, limit);
    } catch (error) {
      console.error('Storage: Failed to get recent workflows:', error);
      return [];
    }
  }
};

// Export for ES modules
export { RecordingStorage, SettingsStorage, StorageUtils, WorkflowStorage, createEmptyRecording, createWorkflow };
