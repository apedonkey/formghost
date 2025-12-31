/**
 * FormGhost - Privacy-First AI Client
 * Calls Claude API with ONLY field labels (NO PII)
 */

const PrivacyAIClient = {
  API_URL: 'https://api.anthropic.com/v1/messages',
  MODEL: 'claude-haiku-3-5-20241022',
  MAX_TOKENS: 2048,

  /**
   * Matches field labels between recorded and new forms
   * @param {string} apiKey - Anthropic API key
   * @param {Array} recordedLabels - Labels from recorded workflow [{label, type, context}]
   * @param {Array} currentLabels - Labels from current form [{selector, label, type, ...}]
   * @returns {Promise<Object>} Label mappings
   */
  async matchFieldLabels(apiKey, recordedLabels, currentLabels) {
    if (!apiKey) {
      throw new Error('API key is required');
    }

    // PRIVACY CHECK: Verify we're not sending any PII
    this.validateNoPII(recordedLabels, currentLabels);

    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(recordedLabels, currentLabels);

    console.log('PrivacyAI: Sending ONLY labels to Claude (NO PII)');
    console.log('Recorded labels:', recordedLabels.length);
    console.log('Current labels:', currentLabels.length);

    try {
      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: this.MODEL,
          max_tokens: this.MAX_TOKENS,
          system: systemPrompt,
          messages: [
            { role: 'user', content: userPrompt }
          ]
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.content?.[0]?.text;

      if (!content) {
        throw new Error('Empty response from API');
      }

      // Parse JSON from response
      return this.parseResponse(content);

    } catch (error) {
      console.error('PrivacyAI: Label matching failed:', error);
      throw error;
    }
  },

  /**
   * Validates that no PII is being sent
   * @param {Array} recordedLabels - Recorded labels
   * @param {Array} currentLabels - Current labels
   * @throws {Error} If PII detected
   */
  validateNoPII(recordedLabels, currentLabels) {
    // Check recorded labels for suspicious data
    for (const item of recordedLabels) {
      if (item.value || item.recordedValue || item.clientData) {
        throw new Error('PRIVACY VIOLATION: Attempted to send recorded values to AI');
      }

      // Check for email patterns
      if (item.label && /@/.test(item.label)) {
        console.warn('Possible email in label:', item.label);
      }

      // Check for phone patterns
      if (item.label && /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(item.label)) {
        console.warn('Possible phone number in label:', item.label);
      }
    }

    // Check current labels
    for (const item of currentLabels) {
      if (item.value || item.currentValue) {
        throw new Error('PRIVACY VIOLATION: Attempted to send current form values to AI');
      }
    }

    console.log('✓ Privacy check passed: No PII detected in payload');
  },

  /**
   * Builds system prompt for label matching
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
   * Builds user prompt with label data
   */
  buildUserPrompt(recordedLabels, currentLabels) {
    return `RECORDED WORKFLOW FIELDS:
${JSON.stringify(recordedLabels, null, 2)}

NEW FORM FIELDS:
${JSON.stringify(currentLabels, null, 2)}

Match the recorded fields to the new form fields based on semantic meaning. Return JSON only.`;
  },

  /**
   * Parses Claude's response
   */
  parseResponse(content) {
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

      throw new Error('Could not parse JSON from response');
    }
  },

  /**
   * Validates API key by making a minimal request
   * @param {string} apiKey - API key to validate
   * @returns {Promise<boolean>} Whether key is valid
   */
  async validateApiKey(apiKey) {
    try {
      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: this.MODEL,
          max_tokens: 10,
          messages: [
            { role: 'user', content: 'Reply with just: ok' }
          ]
        })
      });

      return response.ok;
    } catch (error) {
      console.error('PrivacyAI: Key validation failed:', error);
      return false;
    }
  },

  /**
   * Estimates token count for a request (rough approximation)
   * @param {Array} recordedLabels - Recorded labels
   * @param {Array} currentLabels - Current labels
   * @returns {number} Estimated tokens
   */
  estimateTokens(recordedLabels, currentLabels) {
    const text = JSON.stringify(recordedLabels) + JSON.stringify(currentLabels);
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4) + 500; // Add buffer for prompts
  }
};

// Export for use in service worker
if (typeof module !== 'undefined') {
  module.exports = PrivacyAIClient;
}
