/**
 * FormGhost - Claude API Client
 * Handles communication with Anthropic's Claude API for form field mapping
 */

const ClaudeClient = {
  API_URL: 'https://api.anthropic.com/v1/messages',
  MODEL: 'claude-haiku-3-5-20241022', // Fast and cheap for field mapping
  MAX_TOKENS: 2048,

  /**
   * Calls Claude API to map form fields to client profile
   * @param {string} apiKey - Anthropic API key
   * @param {Array} formFields - Array of form field metadata
   * @param {Object} clientProfile - Client profile data
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Field mappings
   */
  async mapFormFields(apiKey, formFields, clientProfile, options = {}) {
    if (!apiKey) {
      throw new Error('API key is required');
    }

    const systemPrompt = this.buildSystemPrompt(options);
    const userPrompt = this.buildUserPrompt(formFields, clientProfile);

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
      console.error('ClaudeClient: API call failed:', error);
      throw error;
    }
  },

  /**
   * Builds the system prompt for field mapping
   */
  buildSystemPrompt(options = {}) {
    const dateFormat = options.dateFormat || 'MM/DD/YYYY';
    const phoneFormat = options.phoneFormat || '(###) ###-####';

    return `You are a form field mapping assistant. Your job is to match client profile data to web form fields.

TASK: Given a list of form fields and a client profile, return a JSON object mapping field selectors to the appropriate values.

RULES:
1. Only map fields where you have HIGH confidence the match is correct
2. For combined fields like "Full Name", concatenate first + middle + last names
3. Format dates as: ${dateFormat}
4. Format phone numbers as: ${phoneFormat}
5. For dropdowns/selects, return the value that best matches the option text
6. For state fields, use 2-letter abbreviation (CA, NY, TX, etc.)
7. For fields you cannot confidently map, add them to "unmapped" array with reason
8. Never guess or make up data - only use provided profile values

OUTPUT FORMAT (JSON only, no explanation):
{
  "mappings": [
    {
      "selector": "CSS selector or field identifier",
      "value": "value to fill",
      "confidence": 0.0-1.0,
      "fieldType": "text|select|date|phone|email|checkbox|radio",
      "notes": "optional notes about formatting applied"
    }
  ],
  "unmapped": [
    {
      "selector": "CSS selector",
      "label": "field label",
      "reason": "why it couldn't be mapped"
    }
  ]
}`;
  },

  /**
   * Builds the user prompt with form fields and profile
   */
  buildUserPrompt(formFields, clientProfile) {
    return `MAP THESE FORM FIELDS:

FORM FIELDS:
${JSON.stringify(formFields, null, 2)}

CLIENT PROFILE:
${JSON.stringify(clientProfile, null, 2)}

Return JSON mapping only.`;
  },

  /**
   * Parses Claude's response to extract JSON
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
      console.error('ClaudeClient: Key validation failed:', error);
      return false;
    }
  },

  /**
   * Estimates token count for a request (rough approximation)
   * @param {Array} formFields - Form fields
   * @param {Object} clientProfile - Client profile
   * @returns {number} Estimated tokens
   */
  estimateTokens(formFields, clientProfile) {
    const text = JSON.stringify(formFields) + JSON.stringify(clientProfile);
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4) + 500; // Add buffer for prompts
  }
};

// Export for use in service worker
if (typeof module !== 'undefined') {
  module.exports = ClaudeClient;
}
