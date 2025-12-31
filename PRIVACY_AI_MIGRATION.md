# Privacy-First AI Migration Guide

## 🎯 **What Changed**

### **Before (Privacy Risk)**
- ❌ Sent full client PII to Claude API (names, addresses, DOB, phones, emails)
- ❌ SSN/DL excluded by default but could be enabled
- ❌ No way to know what data was being sent
- ❌ Every form fill = API call with PII

### **After (Privacy-First)**
- ✅ **ZERO PII sent to Claude** - only field labels
- ✅ AI compares "First Name" vs "Given Name" (semantic matching)
- ✅ Client data stays 100% local
- ✅ Same form replay = no AI needed at all

---

## 🏗️ **Architecture Changes**

### **New Files Created:**

1. **`lib/fieldMapper.js`**
   - Detects if replaying on same vs different form
   - Extracts field labels from recorded workflows
   - Prepares label-only data for AI
   - Applies AI mappings locally with client data

2. **`lib/privacyAI.js`**
   - New AI client that ONLY sends labels
   - Validates no PII in payload before sending
   - Parses label-to-label mappings from Claude

3. **`background/privacyAiFill.js`**
   - New fill orchestration logic
   - Checks if same form → direct replay
   - Checks if different form → AI label matching
   - Never sends PII in either path

4. **`content/unmatchedFieldsUI.js`**
   - Beautiful UI showing unmatched fields
   - "Locate" buttons to highlight fields
   - Shows what needs manual attention

---

## 🔄 **New User Flow**

### **Scenario 1: Replaying on SAME Form**
```
User clicks "Fill Form" → Extension detects same form
→ Direct replay with variable substitution
→ NO AI CALL → Form filled
```

**Privacy:** No AI, no API call, everything local

---

### **Scenario 2: Replaying on DIFFERENT Form**

```
User clicks "Fill Form" → Extension detects different form
→ Extracts labels from recorded workflow
→ Scans labels from current form
→ Sends ONLY labels to Claude (e.g., ["First Name", "Email"])
→ Claude returns label-to-label mappings
→ Extension applies client data locally
→ Form filled + shows unmatched fields notification
```

**Privacy:** Only field labels sent to Claude, zero PII

---

## 📝 **Recording Changes (Future)**

### **Current State:**
- Recording works as before
- Does NOT yet capture data-field mappings

### **TODO for Full Implementation:**
When recording, after user types a value, show a prompt:
```
┌─────────────────────────────────────────┐
│ You filled: "John"                      │
│ What client field does this map to?    │
│                                         │
│ [First Name ▼]  [Skip]  [Custom...]    │
└─────────────────────────────────────────┘
```

Store in action:
```javascript
{
  type: 'type',
  value: '{{firstName}}',  // Variable placeholder
  dataFieldMapping: 'firstName',  // Maps to client.firstName
  element: { ... }
}
```

This allows replay to substitute `client.firstName` for `{{firstName}}`.

---

## 🧪 **Testing Checklist**

### **Privacy Tests:**

- [ ] **Test 1: Verify No PII in Network**
  - Open DevTools → Network tab
  - Trigger AI form fill on different form
  - Inspect request to `api.anthropic.com`
  - **PASS if:** Only field labels visible, no names/emails/addresses

- [ ] **Test 2: Privacy Validation**
  - Add `console.log` in `privacyAI.js:validateNoPII()`
  - Trigger fill
  - **PASS if:** "✓ Privacy check passed" in console

- [ ] **Test 3: Same Form Bypass**
  - Record workflow on Form A
  - Replay on same Form A
  - **PASS if:** Console shows "SAME FORM detected - using direct replay (no AI needed)"
  - **PASS if:** No API call made

### **Functionality Tests:**

- [ ] **Test 4: Different Form Matching**
  - Record workflow with fields: "First Name", "Last Name", "Email"
  - Replay on form with fields: "Given Name", "Surname", "Email Address"
  - **PASS if:** AI correctly maps all 3 fields
  - **PASS if:** Form fills correctly

- [ ] **Test 5: Unmatched Fields UI**
  - Replay on form with extra fields (SSN, Employer)
  - **PASS if:** Notification appears showing unmatched fields
  - **PASS if:** "Locate" button highlights the field

- [ ] **Test 6: Confidence Filtering**
  - Replay on form with ambiguous labels
  - **PASS if:** Low confidence matches (<0.6) are not auto-filled
  - **PASS if:** Shown in unmatched fields list

---

## 🔌 **Integration Steps**

### **Step 1: Update Manifest**
Add new content scripts:
```json
{
  "content_scripts": [{
    "js": [
      // ... existing scripts ...
      "content/unmatchedFieldsUI.js"
    ]
  }]
}
```

### **Step 2: Load Libraries in Service Worker**
In `background/service-worker.js`:
```javascript
// Add at top of file
importScripts(
  'lib/fieldMapper.js',
  'lib/privacyAI.js',
  'background/privacyAiFill.js'
);
```

### **Step 3: Replace Message Handler**
Replace `AI_FILL_FORM` handler:
```javascript
case 'AI_FILL_FORM':
  // OLD: return await aiFillForm(message.clientId);
  // NEW:
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return await privacyAiFillForm(message.workflowId, message.clientId, tab.id);
```

### **Step 4: Update Popup UI**
Modify `popup/clients.js` fill button:
```javascript
// Need to select workflow, not just client
const response = await sendMessage({
  type: 'AI_FILL_FORM',
  workflowId: selectedWorkflow,  // NEW: must select which workflow to replay
  clientId: client.id
});
```

### **Step 5: Add Workflow Selection UI**
In `popup/clients.html`, add workflow selector:
```html
<select id="workflow-select">
  <option value="">Select a recorded workflow...</option>
  <!-- Populated dynamically -->
</select>
```

---

## 🚨 **Breaking Changes**

### **API Changes:**
1. **Old:** `aiFillForm(clientId)`
2. **New:** `privacyAiFillForm(workflowId, clientId, tabId)`

### **Storage Changes:**
Workflows now need `formSignature`:
```javascript
{
  id: 'workflow_123',
  actions: [...],
  formSignature: {  // NEW
    url: 'https://example.com/form',
    fieldCount: 15,
    fields: [{name, id, label, type}]
  }
}
```

### **UI Changes:**
- User must select a workflow to replay (can't just "AI fill")
- Unmatched fields notification appears after fill

---

## 📊 **Privacy Comparison**

### **Data Sent to Claude API**

| Feature | Old Approach | New Approach |
|---------|-------------|--------------|
| Client Name | ❌ Sent | ✅ NOT sent |
| Email | ❌ Sent | ✅ NOT sent |
| Phone | ❌ Sent | ✅ NOT sent |
| Address | ❌ Sent | ✅ NOT sent |
| DOB | ❌ Sent | ✅ NOT sent |
| SSN (if enabled) | ❌ Sent | ✅ NOT sent |
| Field Labels | ✅ Sent | ✅ Sent |
| Field Types | ✅ Sent | ✅ Sent |

### **Example API Payload**

**Old (Privacy Risk):**
```json
{
  "formFields": [{"selector": "#fname", "label": "First Name"}],
  "clientProfile": {
    "firstName": "John",          ← PII
    "lastName": "Doe",            ← PII
    "email": "john@example.com",  ← PII
    "phone": "555-1234",          ← PII
    "address": "123 Main St"      ← PII
  }
}
```

**New (Privacy-First):**
```json
{
  "recordedLabels": [
    {"label": "First Name", "type": "text", "context": "first-name"}
  ],
  "currentLabels": [
    {"selector": "#givenName", "label": "Given Name", "type": "text"}
  ]
}
```
**No PII anywhere!**

---

## ✅ **Benefits**

1. **Privacy**: Zero PII sent to third-party API
2. **Compliance**: Easier GDPR/CCPA compliance
3. **Trust**: Users can verify in DevTools
4. **Performance**: Same-form replay skips AI entirely
5. **Transparency**: Shows what couldn't be matched
6. **Flexibility**: Works across similar but different forms

---

## 🔧 **Maintenance**

### **Deprecated Functions:**
- `aiFillForm()` in `service-worker.js:1564` - Mark as deprecated
- `getAIMappings()` in `service-worker.js:1706` - Mark as deprecated
- `claudeClient.js` - Old approach, keep for reference but don't use

### **New Functions to Maintain:**
- `privacyAiFillForm()` - Main entry point
- `FieldMapper.matchFieldLabels()` - Label extraction
- `PrivacyAIClient.matchFieldLabels()` - AI call (labels only)
- `UnmatchedFieldsUI.show()` - UI notification

---

## 📚 **Documentation Updates Needed**

1. Update README: Explain privacy-first approach
2. User Guide: How to replay workflows on different forms
3. API Docs: Document new message types
4. Privacy Policy: Update to reflect zero PII transmission

---

## 🎓 **User Education**

### **Key Messages:**
1. "Your data never leaves your computer"
2. "AI only sees field names like 'First Name', not your actual name"
3. "Same form = instant replay with no AI"
4. "Different form = smart matching without sharing your data"

### **FAQ:**
**Q: What data goes to Claude?**
A: Only field labels like "First Name", "Email Address". Never your actual name or email.

**Q: Can I verify this?**
A: Yes! Open DevTools → Network tab while filling a form. You'll see only labels in the API request.

**Q: What if fields don't match?**
A: We'll show you which fields need manual entry with a handy "Locate" button.

---

## 🚀 **Next Steps**

1. ✅ Create new privacy-first modules
2. ⏳ Integrate into service worker
3. ⏳ Update manifest.json
4. ⏳ Add workflow selector UI
5. ⏳ Update recording to capture data-field mappings
6. ⏳ Test privacy with DevTools
7. ⏳ Update documentation
8. ⏳ Release as v2.1.0

---

**Status:** Core privacy-first modules created and ready for integration.

**Next Action:** Integrate into manifest and service worker, then test with DevTools to verify zero PII transmission.
