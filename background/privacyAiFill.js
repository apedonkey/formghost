/**
 * FormGhost - Privacy-First AI Form Filling
 * Replaces the old approach that sent PII to Claude
 *
 * NEW APPROACH:
 * 1. If replaying on SAME form → direct replay with variable substitution (no AI)
 * 2. If replaying on DIFFERENT form → AI matches labels only (NO PII sent)
 */

// Import FieldMapper and PrivacyAIClient (these will be loaded in service worker)
// const FieldMapper = require('./lib/fieldMapper.js');
// const PrivacyAIClient = require('./lib/privacyAI.js');

// Configuration constants loaded from config.js via service-worker.js

/**
 * Privacy-first AI form filling
 * @param {string} workflowId - ID of recorded workflow to replay
 * @param {string} clientId - Client profile ID
 * @param {number} tabId - Tab to fill form in
 * @returns {Promise<Object>} Fill result
 */
async function privacyAiFillForm(workflowId, clientId, tabId) {
  try {
    console.log('PrivacyAI Fill: Starting (NO PII will be sent to Claude)');

    // 1. Get the recorded workflow
    const savedWorkflows = await chrome.storage.local.get('savedRecordings');
    const workflows = savedWorkflows.savedRecordings || {};
    const workflow = workflows[workflowId];

    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }

    // 2. Get client profile (stays local)
    const clientsResult = await chrome.storage.local.get('formGhostClients');
    const clients = clientsResult.formGhostClients || [];
    const client = clients.find(c => c.id === clientId);

    if (!client) {
      return { success: false, error: 'Client not found' };
    }

    // 3. Scan current form
    const scanResult = await chrome.tabs.sendMessage(tabId, { type: 'SCAN_FORM' });
    if (!scanResult?.success || !scanResult.fields?.length) {
      return { success: false, error: 'No form fields found on current page' };
    }

    const currentFormFields = scanResult.fields;
    const currentFormSignature = {
      url: scanResult.url,
      fieldCount: currentFormFields.length,
      fields: currentFormFields.map(f => ({
        name: f.name,
        id: f.id,
        label: f.label,
        type: f.type
      }))
    };

    // 4. Check if this is the SAME form as the recorded workflow
    const recordedFormSignature = workflow.formSignature;

    // Get the actual recording (actions are nested under workflow.recording)
    const recording = workflow.recording || workflow;
    const actions = recording.actions || [];

    if (FieldMapper.isSameForm(recordedFormSignature, currentFormSignature)) {
      console.log('PrivacyAI Fill: SAME FORM detected - using direct replay (no AI needed)');
      return await directReplay({ ...workflow, actions }, client, tabId);
    }

    console.log('PrivacyAI Fill: DIFFERENT FORM detected - using AI label matching');

    // 5. Get AI settings
    const settings = await getAISettings();
    if (!settings.apiKey) {
      return { success: false, error: 'API key not configured for cross-form filling' };
    }

    // 6. Extract field labels from recorded workflow
    const recordedFields = FieldMapper.extractRecordedFields(actions);

    if (recordedFields.length === 0) {
      return { success: false, error: 'No fillable fields found in recorded workflow' };
    }

    // 7. Prepare data for AI (labels only - NO PII)
    const { recordedLabels, currentLabels } = FieldMapper.prepareForAI(
      recordedFields,
      currentFormFields
    );

    // 8. Call Claude API with LABELS ONLY
    let aiResult;
    try {
      aiResult = await PrivacyAIClient.matchFieldLabels(
        settings.apiKey,
        recordedLabels,
        currentLabels
      );
    } catch (error) {
      return {
        success: false,
        error: `AI matching failed: ${error.message}`
      };
    }

    if (!aiResult.mappings || aiResult.mappings.length === 0) {
      return {
        success: false,
        error: 'AI could not match any fields',
        unmatchedNewFields: aiResult.unmatchedNewFields || [],
        unmatchedRecordedFields: aiResult.unmatchedRecordedFields || []
      };
    }

    // 9. Apply mappings locally (get actual client data values)
    const fillMappings = FieldMapper.applyMappings(
      aiResult.mappings,
      recordedFields,
      client
    );

    console.log(`PrivacyAI Fill: Matched ${fillMappings.length} fields`);
    console.log(`Unmatched new fields: ${aiResult.unmatchedNewFields?.length || 0}`);
    console.log(`Unmatched recorded fields: ${aiResult.unmatchedRecordedFields?.length || 0}`);

    // 10. Fill the form
    const fillResult = await chrome.tabs.sendMessage(tabId, {
      type: 'FILL_FORM',
      mappings: fillMappings,
      options: {
        fieldDelay: settings.fieldDelay || 50
      }
    });

    // 11. Return results with unmatched fields
    return {
      ...fillResult,
      unmatchedNewFields: aiResult.unmatchedNewFields || [],
      unmatchedRecordedFields: aiResult.unmatchedRecordedFields || [],
      aiUsed: true,
      privacy: 'NO PII SENT TO AI'
    };

  } catch (error) {
    console.error('PrivacyAI Fill: Error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Direct replay on same form (no AI needed)
 * @param {Object} workflow - Recorded workflow
 * @param {Object} client - Client profile
 * @param {number} tabId - Tab ID
 * @returns {Promise<Object>} Replay result
 */
async function directReplay(workflow, client, tabId) {
  try {
    // Build variable substitutions from client data
    const variables = buildVariablesFromClient(client);

    // Send replay command with variables
    const replayResult = await chrome.tabs.sendMessage(tabId, {
      type: 'START_REPLAY',
      workflow: workflow,
      variables: variables,
      options: {
        stepDelay: 100,
        timeout: 10000,
        stopOnError: false,
        highlightElements: true
      }
    });

    return {
      ...replayResult,
      aiUsed: false,
      privacy: 'Direct replay - no AI needed'
    };

  } catch (error) {
    console.error('Direct replay failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Builds variable map from client data
 * @param {Object} client - Client profile
 * @returns {Object} Variables map {variableName: value}
 */
function buildVariablesFromClient(client) {
  return {
    firstName: client.firstName || '',
    lastName: client.lastName || '',
    middleName: client.middleName || '',
    fullName: [client.firstName, client.middleName, client.lastName].filter(Boolean).join(' '),
    email: client.email || '',
    phone: client.phone || '',
    phoneAlt: client.phoneAlt || '',
    address: client.address || '',
    addressLine2: client.addressLine2 || '',
    city: client.city || '',
    state: client.state || '',
    zip: client.zip || '',
    country: client.country || '',
    dob: client.dob || '',
    employer: client.employer || '',
    occupation: client.occupation || '',
    workPhone: client.workPhone || '',
    ...client.customFields
  };
}

/**
 * Gets AI settings
 * @returns {Promise<Object>} Settings
 */
async function getAISettings() {
  try {
    const result = await chrome.storage.local.get('formghost_ai_settings');
    const userSettings = result.formghost_ai_settings || {};

    // Always use built-in API key, allow user to override other settings
    return {
      apiKey: FORMGHOST_API_KEY,
      excludeSensitive: true,
      defaultDateFormat: 'MM/DD/YYYY',
      defaultPhoneFormat: '(###) ###-####',
      cacheEnabled: false, // Disable cache for privacy
      fieldDelay: 50,
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
      cacheEnabled: false,
      fieldDelay: 50
    };
  }
}

/**
 * OLD FUNCTION - DEPRECATED
 * This function sends PII to Claude - DO NOT USE
 */
async function aiFillFormOLD_DEPRECATED(clientId) {
  console.error('DEPRECATED: aiFillFormOLD sends PII to Claude - use privacyAiFillForm instead');
  throw new Error('This function is deprecated for privacy reasons');
}

// Export functions
if (typeof module !== 'undefined') {
  module.exports = {
    privacyAiFillForm,
    directReplay,
    buildVariablesFromClient,
    getAISettings,
    aiFillFormOLD_DEPRECATED
  };
}
