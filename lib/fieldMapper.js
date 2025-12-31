/**
 * FormGhost - Field Mapper (Privacy-First)
 * Maps field labels between recorded and new forms WITHOUT sending PII to Claude
 */

const FieldMapper = {
  /**
   * Detects if two forms are likely the same based on field structure
   * @param {Object} recordedFormSignature - Signature of recorded form
   * @param {Object} currentFormSignature - Signature of current form
   * @returns {boolean} True if forms match
   */
  isSameForm(recordedFormSignature, currentFormSignature) {
    if (!recordedFormSignature || !currentFormSignature) return false;

    // Compare URLs (same domain and path)
    const recordedUrl = new URL(recordedFormSignature.url);
    const currentUrl = new URL(currentFormSignature.url);

    if (recordedUrl.hostname !== currentUrl.hostname ||
        recordedUrl.pathname !== currentUrl.pathname) {
      return false;
    }

    // Compare field count (allow ±2 difference for dynamic fields)
    const countDiff = Math.abs(recordedFormSignature.fieldCount - currentFormSignature.fieldCount);
    if (countDiff > 2) return false;

    // Compare field signatures (at least 80% match)
    const recordedFields = recordedFormSignature.fields || [];
    const currentFields = currentFormSignature.fields || [];

    const matchCount = recordedFields.filter(rf =>
      currentFields.some(cf =>
        (rf.name && cf.name === rf.name) ||
        (rf.id && cf.id === rf.id) ||
        (rf.label && cf.label === rf.label)
      )
    ).length;

    const matchPercent = matchCount / Math.max(recordedFields.length, 1);
    return matchPercent >= 0.8;
  },

  /**
   * Extracts field labels from recorded workflow actions
   * @param {Array} actions - Workflow actions
   * @returns {Array} Array of {label, dataField, selector}
   */
  extractRecordedFields(actions) {
    const fields = [];

    for (const action of actions) {
      if (action.type === 'type' && action.element) {
        fields.push({
          label: action.element.humanLabel || action.element.attributes?.name || 'Unknown field',
          dataField: action.dataFieldMapping || null, // Maps to client data field
          selector: action.element.recommended,
          recordedValue: action.value // For reference, not sent to AI
        });
      }
    }

    return fields;
  },

  /**
   * Prepares field labels for AI matching (NO PII sent)
   * @param {Array} recordedFields - Fields from recorded workflow
   * @param {Array} currentFormFields - Fields from current page scan
   * @returns {Object} Data to send to Claude (labels only)
   */
  prepareForAI(recordedFields, currentFormFields) {
    // Extract only labels and metadata - NO client data values
    const recordedLabels = recordedFields.map(f => ({
      label: f.label,
      type: this.inferFieldType(f.label),
      context: this.extractContext(f.label)
    }));

    const currentLabels = currentFormFields.map(f => ({
      selector: f.selector,
      label: f.label || f.placeholder || f.name || 'Unlabeled field',
      type: f.inputType || f.type,
      name: f.name,
      id: f.id,
      placeholder: f.placeholder,
      autocomplete: f.autocomplete
    }));

    return {
      recordedLabels,
      currentLabels
    };
  },

  /**
   * Infers field type from label
   * @param {string} label - Field label
   * @returns {string} Inferred type
   */
  inferFieldType(label) {
    const lower = label.toLowerCase();

    if (lower.includes('email') || lower.includes('e-mail')) return 'email';
    if (lower.includes('phone') || lower.includes('tel') || lower.includes('mobile')) return 'phone';
    if (lower.includes('date') || lower.includes('dob') || lower.includes('birth')) return 'date';
    if (lower.includes('zip') || lower.includes('postal')) return 'zip';
    if (lower.includes('state') || lower.includes('province')) return 'state';
    if (lower.includes('city') || lower.includes('town')) return 'city';
    if (lower.includes('address') || lower.includes('street')) return 'address';
    if (lower.includes('name')) return 'name';

    return 'text';
  },

  /**
   * Extracts semantic context from label
   * @param {string} label - Field label
   * @returns {string} Context hint
   */
  extractContext(label) {
    const lower = label.toLowerCase();

    if (lower.includes('first') || lower.includes('given')) return 'first-name';
    if (lower.includes('last') || lower.includes('surname') || lower.includes('family')) return 'last-name';
    if (lower.includes('middle')) return 'middle-name';
    if (lower.includes('full') && lower.includes('name')) return 'full-name';
    if (lower.includes('employer') || lower.includes('company')) return 'employer';
    if (lower.includes('work') && lower.includes('phone')) return 'work-phone';
    if (lower.includes('home') && lower.includes('phone')) return 'home-phone';
    if (lower.includes('address') && lower.includes('2')) return 'address-line-2';
    if (lower.includes('address')) return 'address-line-1';

    return 'generic';
  },

  /**
   * Applies AI label mappings to get actual data
   * @param {Array} mappings - Mappings from AI (label to label)
   * @param {Array} recordedFields - Original recorded fields with dataField mappings
   * @param {Object} clientData - Client profile data (used locally, never sent to AI)
   * @returns {Array} Final mappings with actual values
   */
  applyMappings(mappings, recordedFields, clientData) {
    const result = [];

    for (const mapping of mappings) {
      // Find the recorded field that matches this mapping
      const recordedField = recordedFields.find(f =>
        f.label === mapping.recordedLabel
      );

      if (!recordedField || !recordedField.dataField) continue;

      // Get the actual client data value locally (never sent to AI)
      const value = this.getClientValue(clientData, recordedField.dataField);

      if (value === null || value === undefined || value === '') continue;

      result.push({
        selector: mapping.newSelector,
        value: value,
        confidence: mapping.confidence,
        fieldType: mapping.type || 'text',
        notes: `Mapped from "${mapping.recordedLabel}" to "${mapping.newLabel}"`
      });
    }

    return result;
  },

  /**
   * Gets client data value by field name
   * @param {Object} client - Client profile
   * @param {string} fieldName - Field name (e.g., "firstName", "email")
   * @returns {any} Field value
   */
  getClientValue(client, fieldName) {
    if (!fieldName || !client) return null;

    // Handle nested custom fields
    if (fieldName.startsWith('customFields.')) {
      const key = fieldName.replace('customFields.', '');
      return client.customFields?.[key] || null;
    }

    // Handle full name composition
    if (fieldName === 'fullName') {
      return [client.firstName, client.middleName, client.lastName]
        .filter(Boolean)
        .join(' ');
    }

    return client[fieldName] || null;
  },

  /**
   * Builds system prompt for AI (label matching only - NO PII)
   * @returns {string} System prompt
   */
  buildSystemPrompt() {
    return `You are a form field label matching assistant. Your job is to match field labels from a recorded workflow to field labels on a new form based on SEMANTIC MEANING.

IMPORTANT: You will receive ONLY field labels, NO actual user data.

TASK: Match recorded field labels to new form field labels.

MATCHING RULES:
1. Match fields that mean the same thing even if worded differently
   - "First Name" = "Given Name" = "fname" = "First"
   - "Last Name" = "Surname" = "Family Name" = "lname"
   - "Date of Birth" = "DOB" = "Birth Date" = "Birthday"
   - "Email Address" = "Email" = "E-mail"
   - "Phone Number" = "Telephone" = "Mobile" = "Phone"
   - "Street Address" = "Address Line 1" = "Address" = "Street"
   - "Apartment/Unit" = "Address Line 2" = "Apt" = "Suite"
   - "ZIP Code" = "Postal Code" = "ZIP" = "Post Code"
   - "SSN" = "Social Security Number" = "Social Security #"

2. Use context clues from autocomplete, name, and placeholder attributes
3. Only match if confidence is >0.6 (don't force matches)
4. Consider field type (date, email, phone, etc.) in matching

OUTPUT FORMAT (JSON only, no explanation):
{
  "mappings": [
    {
      "recordedLabel": "First Name",
      "newSelector": "#givenName",
      "newLabel": "Given Name",
      "confidence": 0.95,
      "type": "text"
    }
  ],
  "unmatchedNewFields": [
    {
      "selector": "#ssn",
      "label": "SSN",
      "reason": "Not present in recorded workflow"
    }
  ],
  "unmatchedRecordedFields": [
    {
      "label": "Fax Number",
      "reason": "Not present on new form"
    }
  ]
}

CONFIDENCE SCORING:
- 0.95-1.0: Exact semantic match (e.g., "Email" → "Email Address")
- 0.8-0.94: Strong match with minor variation (e.g., "First Name" → "Given Name")
- 0.6-0.79: Probable match but different wording (e.g., "Phone" → "Telephone Number")
- <0.6: Don't match (too uncertain)`;
  },

  /**
   * Builds user prompt for AI label matching
   * @param {Array} recordedLabels - Labels from recorded workflow
   * @param {Array} currentLabels - Labels from current form
   * @returns {string} User prompt
   */
  buildUserPrompt(recordedLabels, currentLabels) {
    return `RECORDED WORKFLOW FIELDS:
${JSON.stringify(recordedLabels, null, 2)}

NEW FORM FIELDS:
${JSON.stringify(currentLabels, null, 2)}

Match the recorded fields to the new form fields based on semantic meaning. Return JSON only.`;
  },

  /**
   * Parses AI response
   * @param {string} content - Response from Claude
   * @returns {Object} Parsed mappings
   */
  parseAIResponse(content) {
    try {
      // Try direct JSON parse first
      return JSON.parse(content);
    } catch (e) {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1].trim());
      }

      // Try to find JSON object in text
      const objectMatch = content.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        return JSON.parse(objectMatch[0]);
      }

      throw new Error('Could not parse JSON from AI response');
    }
  }
};

// Export for use in service worker
if (typeof module !== 'undefined') {
  module.exports = FieldMapper;
}
