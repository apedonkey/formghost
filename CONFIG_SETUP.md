# FormGhost Configuration Setup

## For Development/Self-Hosting

To enable AI form filling features, you need to configure your Anthropic API key:

### Setup Steps:

1. **Copy the example configuration:**
   ```bash
   cp config.example.js config.js
   ```

2. **Get your Anthropic API key:**
   - Visit https://console.anthropic.com/settings/keys
   - Create a new API key
   - Copy the key (starts with `sk-ant-`)

3. **Add your API key:**
   - Open `config.js`
   - Replace `'YOUR_ANTHROPIC_API_KEY_HERE'` with your actual API key
   - Save the file

4. **Load the extension:**
   - Chrome → Extensions → Developer mode → Load unpacked
   - Select the `formghost` directory
   - The extension will now use your API key

### Rate Limiting

The free tier includes:
- **50 AI fills per month**
- Automatic reset on the 1st of each month
- Usage tracked locally in browser storage

### Security Notes

- `config.js` is gitignored and won't be committed to version control
- Your API key stays local on your machine
- Privacy-first: Only field labels are sent to Claude AI (zero PII transmission)

---

## For Published Extension

If you're downloading FormGhost from the Chrome Web Store, the extension comes pre-configured with a built-in API key. No setup required!

