# FormGhost Client Data Storage Deep Dive

## 📦 **1. Storage Location & Mechanism**

### **Primary Storage: chrome.storage.local**
```javascript
Storage Key: 'formGhostClients'
API: chrome.storage.local (Chrome Extension Storage API)
Type: Asynchronous key-value store
Persistence: Local to browser, survives extension updates
```

**Why chrome.storage.local?**
- ✅ Persistent across browser sessions
- ✅ Survives extension reload/update
- ✅ Syncs with Chrome account (if using chrome.storage.sync)
- ✅ No expiration (unlike session storage)
- ❌ NOT IndexedDB (simpler but less powerful)
- ❌ NOT localStorage (different API, extension sandboxing)

### **Storage Architecture:**
```
chrome.storage.local
├── formGhostClients: [Array of client objects]
├── formghost_ai_settings: {Settings object}
├── formghost_mapping_cache: {Cache object}
├── currentRecording: {Recording in progress}
└── savedRecordings: {Map of saved workflows}
```

---

## 🗂️ **2. Client Profile Schema**

### **Complete Data Structure:**
```javascript
{
  // Metadata (auto-generated)
  id: "client_1735689123456_abc123",        // Unique ID
  createdAt: 1735689123456,                  // Timestamp (ms)
  updatedAt: 1735689123456,                  // Timestamp (ms)

  // Basic Info (REQUIRED)
  firstName: "John",                         // Required
  lastName: "Doe",                           // Required
  middleName: "Q",                           // Optional

  // Contact Info
  email: "john@example.com",
  phone: "(555) 123-4567",
  phoneAlt: "(555) 987-6543",

  // Address
  address: "123 Main St",
  addressLine2: "Apt 4B",
  city: "Springfield",
  state: "CA",                               // 2-letter uppercase
  zip: "12345",
  country: "USA",                            // Default

  // Dates
  dob: "1990-01-15",                        // ISO format: YYYY-MM-DD

  // Identification (Sensitive)
  ssnLast4: "1234",                         // Last 4 digits only
  driversLicense: "D1234567",
  dlState: "CA",
  dlExpiration: "2025-12-31",

  // Employment
  employer: "Acme Corp",
  occupation: "Software Engineer",
  workPhone: "(555) 111-2222",

  // Custom Fields (Extensible)
  customFields: {
    "Policy Number": "POL-12345",
    "Member ID": "MEM-98765",
    "Preferred Contact Time": "Evening"
  }
}
```

### **ID Generation:**
```javascript
`client_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`

Example: "client_1735689123456_a3b7f2"
         ^^^^^^^^ ^^^^^^^^^^^^^^ ^^^^^^
         prefix   timestamp      random
```

**Why this format?**
- Time-based: Sortable by creation time
- Unique: Timestamp + random prevents collisions
- Readable: Easy to debug/identify

---

## 🔄 **3. CRUD Operations**

### **CREATE - Adding a Client**

**UI Flow:**
```
User clicks "+ Add" button
  ↓
Opens modal with form (clients.html:33-169)
  ↓
User fills required fields (firstName, lastName)
  ↓
User clicks "Save Client"
  ↓
clients.js:saveClient() validates & sends message
  ↓
service-worker.js:createClient() creates client
  ↓
chrome.storage.local.set() saves to storage
  ↓
Returns to UI → refreshes list
```

**Code Path:**
1. **UI:** `popup/clients.js:246-302` - `saveClient()`
   ```javascript
   await sendMessage({
     type: 'CREATE_CLIENT',
     clientData: {
       firstName: 'John',
       lastName: 'Doe',
       // ... other fields
     }
   });
   ```

2. **Background:** `background/service-worker.js:1393-1414` - `createClient()`
   ```javascript
   async function createClient(clientData) {
     const result = await chrome.storage.local.get('formGhostClients');
     const clients = result.formGhostClients || [];

     const newClient = {
       ...clientData,
       id: `client_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
       createdAt: Date.now(),
       updatedAt: Date.now()
     };

     clients.push(newClient);
     await chrome.storage.local.set({ formGhostClients: clients });

     return { success: true, client: newClient };
   }
   ```

3. **Library:** `lib/clientStorage.js:84-102` - `create()`
   - Alternative API (not currently used by UI)
   - More robust with error handling
   - Used by new privacy-first fill system

---

### **READ - Retrieving Clients**

**All Clients:**
```javascript
// UI calls
const response = await sendMessage({ type: 'GET_CLIENTS' });
const clients = response.clients; // Array of all clients

// Direct storage access (in service worker)
const result = await chrome.storage.local.get('formGhostClients');
const clients = result.formGhostClients || [];
```

**Single Client:**
```javascript
// ClientStorage library
const client = await ClientStorage.get(clientId);
```

**With Sorting:**
```javascript
// Auto-sorted by last name, then first name
clients.sort((a, b) => {
  const lastCompare = (a.lastName || '').localeCompare(b.lastName || '');
  if (lastCompare !== 0) return lastCompare;
  return (a.firstName || '').localeCompare(b.firstName || '');
});
```

**Code Locations:**
- `service-worker.js:1381-1390` - `getClients()`
- `clientStorage.js:53-67` - `getAll()`
- `clientStorage.js:74-77` - `get(clientId)`

---

### **UPDATE - Modifying a Client**

**UI Flow:**
```
User clicks "Edit" button on client card
  ↓
Opens modal pre-filled with client data
  ↓
User modifies fields
  ↓
Clicks "Save Client"
  ↓
Sends UPDATE_CLIENT message
  ↓
Finds client by ID in array
  ↓
Merges updates, preserves ID & createdAt
  ↓
Saves entire array back to storage
```

**Code:**
```javascript
// UI
await sendMessage({
  type: 'UPDATE_CLIENT',
  clientId: 'client_123...',
  updates: {
    phone: '(555) 999-8888',
    email: 'newemail@example.com'
  }
});

// Background
async function updateClient(clientId, updates) {
  const result = await chrome.storage.local.get('formGhostClients');
  const clients = result.formGhostClients || [];

  const index = clients.findIndex(c => c.id === clientId);
  if (index === -1) {
    return { success: false, error: 'Client not found' };
  }

  clients[index] = {
    ...clients[index],
    ...updates,
    id: clientId,                           // Preserve ID
    createdAt: clients[index].createdAt,   // Preserve creation
    updatedAt: Date.now()                  // Update timestamp
  };

  await chrome.storage.local.set({ formGhostClients: clients });
  return { success: true, client: clients[index] };
}
```

**Important:** Updates are **merged**, not replaced. Only provided fields change.

**Code Locations:**
- `clients.js:246-302` - UI handler
- `service-worker.js:1418-1442` - Background handler
- `clientStorage.js:110-131` - Library method

---

### **DELETE - Removing a Client**

**UI Flow:**
```
User clicks "Delete" button
  ↓
Confirmation modal appears
  ↓
User confirms deletion
  ↓
Sends DELETE_CLIENT message
  ↓
Filters client out of array
  ↓
Saves filtered array
```

**Code:**
```javascript
// UI
await sendMessage({
  type: 'DELETE_CLIENT',
  clientId: 'client_123...'
});

// Background
async function deleteClient(clientId) {
  const result = await chrome.storage.local.get('formGhostClients');
  const clients = result.formGhostClients || [];

  const filtered = clients.filter(c => c.id !== clientId);

  if (filtered.length === clients.length) {
    return { success: false, error: 'Client not found' };
  }

  await chrome.storage.local.set({ formGhostClients: filtered });
  return { success: true };
}
```

**Safety:** Confirmation modal prevents accidental deletion

**Code Locations:**
- `clients.js:365-380` - `confirmDelete()`
- `service-worker.js:1446-1463` - `deleteClient()`
- `clientStorage.js:138-152` - Library method

---

## 🔍 **4. Search & Filtering**

### **Search Implementation:**
```javascript
// Real-time search as user types
async function search(query) {
  const clients = await ClientStorage.getAll();
  const q = query.toLowerCase().trim();

  if (!q) return clients; // Empty query returns all

  return clients.filter(c => {
    const fullName = `${c.firstName} ${c.middleName} ${c.lastName}`.toLowerCase();
    const email = (c.email || '').toLowerCase();
    return fullName.includes(q) || email.includes(q);
  });
}
```

**Searches:**
- Full name (first + middle + last)
- Email address

**Does NOT search:**
- Phone numbers
- Addresses
- Custom fields

**Code:** `clientStorage.js:159-169`, `clients.js:82-103`

---

## 📤 **5. Import/Export Features**

### **Export (JSON)**

**Available but NOT in UI:**
```javascript
// Export single client
const exported = await ClientStorage.export(clientId, includeSensitive);

// Result:
{
  firstName: "John",
  lastName: "Doe",
  email: "john@example.com",
  // ... all fields
  // SSN/DL excluded if includeSensitive = false
}
```

**Privacy Options:**
- `includeSensitive: false` (default) → excludes SSN, DL
- `includeSensitive: true` → includes all fields

**Missing from UI:**
- ❌ No "Export to JSON" button
- ❌ No "Download Client Data" feature
- ❌ No bulk export (all clients)

**Code:** `clientStorage.js:177-189`

---

### **Import (JSON)**

**Available but NOT in UI:**
```javascript
// Import client from JSON
const newClient = await ClientStorage.import(jsonData);

// Strips metadata, creates new ID:
const { id, createdAt, updatedAt, ...profileData } = jsonData;
return this.create(profileData);
```

**Behavior:**
- Strips existing ID (prevents conflicts)
- Generates new ID & timestamps
- Creates as new client (not overwrite)

**Missing from UI:**
- ❌ No "Import from JSON" button
- ❌ No drag-and-drop import
- ❌ No bulk import

**Code:** `clientStorage.js:196-200`

---

### **CSV Import/Export: NOT IMPLEMENTED**

**Status:** ❌ No CSV support at all

**Potential Implementation:**
```javascript
// Would need:
1. CSV parser library
2. Field mapping UI
3. Export formatting
4. Download trigger
```

---

## 📊 **6. Storage Limits**

### **chrome.storage.local Limits:**

| Metric | Limit | FormGhost Status |
|--------|-------|-----------------|
| **Total Size** | 10 MB | ~470 KB code (4.7% used) |
| **Per Item** | Unlimited | Clients stored as single array |
| **Total Items** | Unlimited | Using 5 keys currently |
| **Sync Quota** | 102.4 KB (if using sync) | Not using sync |

### **Practical Limits:**

**Assuming average client:**
```javascript
// Average client object size
{
  id: 32 bytes,
  timestamps: 16 bytes,
  strings: ~500 bytes (names, address, etc.),
  customFields: ~200 bytes
}
Average: ~750 bytes per client
```

**Capacity Calculation:**
```
10 MB total limit - 470 KB code = 9.53 MB available
9.53 MB / 750 bytes per client = ~13,000 clients
```

**Realistic Limits:**
- **Safe:** Up to 5,000 clients (~3.75 MB)
- **Warning:** 5,000-10,000 clients
- **Max:** ~13,000 clients before hitting 10 MB limit

**Current Usage:**
- Extension code: 477 KB (0.47 MB)
- Available for data: 9.53 MB
- **Users are nowhere near limits** for typical use

### **Performance Considerations:**

**Reading all clients:**
```javascript
const result = await chrome.storage.local.get('formGhostClients');
// Loads entire array into memory
```

⚠️ **Potential Issues:**
- 1,000+ clients: Minor lag on load
- 5,000+ clients: Noticeable lag
- 10,000+ clients: Significant lag

**Solution for large datasets:**
```javascript
// Pagination (not implemented)
const page = clients.slice(offset, offset + limit);

// Indexing by first letter (not implemented)
const index = clients.reduce((acc, c) => {
  const letter = c.lastName[0].toUpperCase();
  acc[letter] = acc[letter] || [];
  acc[letter].push(c);
  return acc;
}, {});
```

---

## 🔧 **7. Key Files & Functions**

### **Storage Layer:**
```
lib/clientStorage.js (292 lines)
├── createEmptyProfile()     - Schema template
├── getAll()                 - Fetch all clients
├── get(id)                  - Fetch single client
├── create(profile)          - Add new client
├── update(id, updates)      - Modify client
├── delete(id)               - Remove client
├── search(query)            - Search clients
├── export(id, sensitive)    - Export to JSON
├── import(data)             - Import from JSON
├── getSettings()            - Get AI settings
├── saveSettings()           - Save AI settings
└── getForAPI(id)            - Get API-safe profile
```

### **UI Layer:**
```
popup/clients.html (266 lines)
├── Search input
├── Client list grid
├── Edit modal (comprehensive form)
├── Settings modal (API key, formats)
└── Delete confirmation modal

popup/clients.js (552 lines)
├── loadClients()            - Fetch & render
├── renderClients()          - Display list
├── createClientCard()       - Build card HTML
├── openEditModal()          - Show edit form
├── saveClient()             - Create/Update
├── confirmDelete()          - Delete with confirm
├── openSettingsModal()      - AI settings
└── selectClientForFill()    - Trigger AI fill
```

### **Background Handlers:**
```
background/service-worker.js (lines 1381-1463)
├── getClients()             - Handler for GET_CLIENTS
├── createClient()           - Handler for CREATE_CLIENT
├── updateClient()           - Handler for UPDATE_CLIENT
├── deleteClient()           - Handler for DELETE_CLIENT
├── getAISettings()          - Get settings
├── saveAISettings()         - Save settings
└── validateApiKey()         - Check API key
```

### **Message Flow:**
```
popup/clients.js (UI)
    ↓ sendMessage()
background/service-worker.js (Orchestrator)
    ↓ chrome.storage.local
Storage (Persistence)
```

---

## 🔐 **8. Security & Privacy**

### **Sensitive Data Handling:**

**Protected Fields:**
```javascript
{
  ssnLast4: "1234",           // Last 4 only, not full SSN
  driversLicense: "D1234567",
  dlState: "CA",
  dlExpiration: "2025-12-31"
}
```

**Privacy Controls:**
```javascript
// Settings
{
  excludeSensitive: true  // Default: Don't send SSN/DL to AI
}

// When preparing for API
async getForAPI(clientId) {
  const profile = { ...client };

  if (settings.excludeSensitive) {
    delete profile.ssnLast4;
    delete profile.driversLicense;
    delete profile.dlState;
    delete profile.dlExpiration;
  }

  return profile;
}
```

**NEW: Privacy-First AI (v2.1.0):**
- ✅ **Zero PII sent to Claude** - only field labels
- ✅ Client data stays 100% local
- ✅ No accidental PII leaks possible

---

## 📈 **9. Usage Patterns**

### **Typical User Flow:**

1. **Setup:**
   - Add 5-20 clients (family members, frequent customers)
   - Configure API key & settings

2. **Daily Use:**
   - Open FormGhost popup
   - Click client card
   - Form auto-fills on active tab

3. **Maintenance:**
   - Update client info occasionally
   - Add custom fields as needed

### **Real-World Scenarios:**

**Insurance Agent:**
- 100-500 clients
- Fills forms daily
- Needs: Phone, email, DOB, address

**Paralegal:**
- 10-50 clients
- Fills court forms
- Needs: Full legal info, case numbers (custom fields)

**Family Helper:**
- 3-5 family members
- Fills medical forms, applications
- Needs: Full profiles with SSN (protected)

---

## 🐛 **10. Known Limitations**

### **Current Issues:**

1. **No Bulk Operations:**
   - ❌ Can't export all clients at once
   - ❌ Can't import CSV
   - ❌ Can't delete multiple clients

2. **No Cloud Sync:**
   - Data is local to browser only
   - No backup to cloud
   - Extension uninstall = data loss (unless exported)

3. **No Search Advanced Features:**
   - Can't search by phone, address, custom fields
   - No fuzzy search
   - No filter by date range

4. **No Data Validation:**
   - Email format not validated
   - Phone format not enforced
   - Dates can be invalid

5. **Performance at Scale:**
   - Loads all clients into memory
   - No pagination
   - Slow with 1,000+ clients

6. **No Audit Trail:**
   - No history of changes
   - Can't undo deletions
   - No "last modified by"

---

## 🚀 **11. Future Enhancements**

### **Recommended Features:**

1. **Export/Import UI:**
   ```javascript
   // Add to clients.html
   <button id="exportAllBtn">Export All (JSON)</button>
   <button id="importBtn">Import from JSON</button>
   <button id="exportCsvBtn">Export as CSV</button>
   ```

2. **Cloud Backup:**
   ```javascript
   // Use chrome.storage.sync for automatic sync
   // Or manual export to Google Drive
   ```

3. **Advanced Search:**
   ```javascript
   // Search by any field
   return clients.filter(c =>
     Object.values(c).some(v =>
       String(v).toLowerCase().includes(query)
     )
   );
   ```

4. **Bulk Operations:**
   ```javascript
   // Select multiple → Delete/Export
   const selected = clients.filter(c => selectedIds.includes(c.id));
   ```

5. **Data Validation:**
   ```javascript
   // Email regex
   const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

   // Phone formatting
   const formatPhone = (raw) => {
     const digits = raw.replace(/\D/g, '');
     return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
   };
   ```

---

## 📚 **12. Code Reference Quick Guide**

### **Adding a Client (Full Stack):**
```javascript
// 1. UI (popup/clients.js:246)
await sendMessage({
  type: 'CREATE_CLIENT',
  clientData: { firstName: 'John', lastName: 'Doe', ... }
});

// 2. Background (service-worker.js:1393)
async function createClient(clientData) {
  const clients = await getStoredClients();
  const newClient = { ...clientData, id: generateId() };
  clients.push(newClient);
  await saveClients(clients);
  return newClient;
}

// 3. Storage
await chrome.storage.local.set({ formGhostClients: clients });
```

### **Using Client Data (Privacy-First):**
```javascript
// OLD (sends PII to Claude)
const client = await ClientStorage.get(clientId);
await sendToClaudeAPI(client); // ❌ Sends all data

// NEW (privacy-first)
const recordedLabels = FieldMapper.extractLabels(workflow);
const currentLabels = FormScanner.scan();
const mappings = await PrivacyAI.matchLabels(recordedLabels, currentLabels);
// ✅ Only labels sent, client data used locally
const filled = FieldMapper.applyMappings(mappings, client);
```

---

**Summary:** FormGhost uses `chrome.storage.local` to store client profiles as a simple array. All CRUD operations reload the entire array, modify it, and save back. This works well for typical use (up to ~1,000 clients) but may need optimization for larger datasets. Import/Export exists in code but not in UI.
