/**
 * FormGhost Configuration Example
 *
 * To use this extension:
 * 1. Copy this file to config.js
 * 2. Add your Anthropic API key below
 * 3. config.js is gitignored and won't be committed
 */

// Built-in API key for zero-friction AI fills
const FORMGHOST_API_KEY = 'YOUR_ANTHROPIC_API_KEY_HERE';
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-3-5-haiku-20241022';

// Rate limiting constants
const AI_FILLS_PER_MONTH = 50;
const AI_USAGE_STORAGE_KEY = 'formghost_ai_usage';
