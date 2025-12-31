/**
 * FormGhost - Clients Management Page
 * Handles client profile CRUD and AI settings
 */

// State
let clients = [];
let editingClientId = null;
let deletingClientId = null;
let importData = null; // Temporary storage for CSV import data

// DOM Elements
const elements = {
  backBtn: document.getElementById('backBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  searchInput: document.getElementById('searchInput'),
  addClientBtn: document.getElementById('addClientBtn'),
  clientsList: document.getElementById('clientsList'),
  emptyState: document.getElementById('emptyState'),
  // CSV Import/Export
  importCsvBtn: document.getElementById('importCsvBtn'),
  exportCsvBtn: document.getElementById('exportCsvBtn'),
  csvFileInput: document.getElementById('csvFileInput'),
  // Edit Modal
  editModal: document.getElementById('editModal'),
  editModalTitle: document.getElementById('editModalTitle'),
  closeEditModal: document.getElementById('closeEditModal'),
  clientForm: document.getElementById('clientForm'),
  customFieldsContainer: document.getElementById('customFieldsContainer'),
  addCustomFieldBtn: document.getElementById('addCustomFieldBtn'),
  cancelEditBtn: document.getElementById('cancelEditBtn'),
  saveClientBtn: document.getElementById('saveClientBtn'),
  // Settings Modal
  settingsModal: document.getElementById('settingsModal'),
  closeSettingsModal: document.getElementById('closeSettingsModal'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  toggleApiKey: document.getElementById('toggleApiKey'),
  validateKeyBtn: document.getElementById('validateKeyBtn'),
  keyStatus: document.getElementById('keyStatus'),
  excludeSensitive: document.getElementById('excludeSensitive'),
  dateFormat: document.getElementById('dateFormat'),
  phoneFormat: document.getElementById('phoneFormat'),
  cacheEnabled: document.getElementById('cacheEnabled'),
  cacheStats: document.getElementById('cacheStats'),
  clearCacheBtn: document.getElementById('clearCacheBtn'),
  cancelSettingsBtn: document.getElementById('cancelSettingsBtn'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  // Delete Modal
  deleteModal: document.getElementById('deleteModal'),
  closeDeleteModal: document.getElementById('closeDeleteModal'),
  deleteClientName: document.getElementById('deleteClientName'),
  cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
  confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
  // Export CSV Modal
  exportCsvModal: document.getElementById('exportCsvModal'),
  closeExportCsvModal: document.getElementById('closeExportCsvModal'),
  exportClientCount: document.getElementById('exportClientCount'),
  exportIncludeSensitive: document.getElementById('exportIncludeSensitive'),
  cancelExportCsvBtn: document.getElementById('cancelExportCsvBtn'),
  confirmExportCsvBtn: document.getElementById('confirmExportCsvBtn'),
  // Import Preview Modal
  importPreviewModal: document.getElementById('importPreviewModal'),
  closeImportPreviewModal: document.getElementById('closeImportPreviewModal'),
  importRowCount: document.getElementById('importRowCount'),
  columnMappingsContainer: document.getElementById('columnMappingsContainer'),
  importPreviewTable: document.getElementById('importPreviewTable'),
  duplicateStrategy: document.getElementById('duplicateStrategy'),
  cancelImportPreviewBtn: document.getElementById('cancelImportPreviewBtn'),
  confirmImportBtn: document.getElementById('confirmImportBtn'),
  // Import Results Modal
  importResultsModal: document.getElementById('importResultsModal'),
  closeImportResultsModal: document.getElementById('closeImportResultsModal'),
  importedCount: document.getElementById('importedCount'),
  updatedCount: document.getElementById('updatedCount'),
  skippedCount: document.getElementById('skippedCount'),
  errorsCount: document.getElementById('errorsCount'),
  updatedResult: document.getElementById('updatedResult'),
  skippedResult: document.getElementById('skippedResult'),
  errorsResult: document.getElementById('errorsResult'),
  errorDetails: document.getElementById('errorDetails'),
  errorList: document.getElementById('errorList'),
  closeImportResultsBtn: document.getElementById('closeImportResultsBtn')
};

/**
 * Sends message to background script
 */
async function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Loads clients from storage
 */
async function loadClients() {
  try {
    const response = await sendMessage({ type: 'GET_CLIENTS' });
    clients = response.clients || [];
    renderClients();
  } catch (error) {
    console.error('Failed to load clients:', error);
  }
}

/**
 * Renders the client list
 */
function renderClients() {
  const searchTerm = elements.searchInput.value.toLowerCase();
  const filtered = clients.filter(c => {
    const fullName = `${c.firstName} ${c.middleName || ''} ${c.lastName}`.toLowerCase();
    const email = (c.email || '').toLowerCase();
    return fullName.includes(searchTerm) || email.includes(searchTerm);
  });

  if (filtered.length === 0) {
    elements.emptyState.style.display = 'block';
    elements.clientsList.innerHTML = '';
    elements.clientsList.appendChild(elements.emptyState);
    return;
  }

  elements.emptyState.style.display = 'none';
  elements.clientsList.innerHTML = '';

  filtered.forEach(client => {
    const card = createClientCard(client);
    elements.clientsList.appendChild(card);
  });
}

/**
 * Creates a client card element
 */
function createClientCard(client) {
  const card = document.createElement('div');
  card.className = 'client-card';
  card.dataset.id = client.id;

  const initials = getInitials(client.firstName, client.lastName);
  const fullName = [client.firstName, client.middleName, client.lastName].filter(Boolean).join(' ');
  const details = [client.email, client.phone].filter(Boolean).join(' | ') || 'No contact info';

  card.innerHTML = `
    <div class="client-avatar">${initials}</div>
    <div class="client-info">
      <div class="client-name">${escapeHtml(fullName)}</div>
      <div class="client-details">${escapeHtml(details)}</div>
    </div>
    <div class="client-actions">
      <button class="btn-icon btn-edit" title="Edit">&#9998;</button>
      <button class="btn-icon btn-delete" title="Delete">&#128465;</button>
    </div>
  `;

  // Card click - select for fill (could open a quick action menu)
  card.addEventListener('click', (e) => {
    if (!e.target.closest('.client-actions')) {
      // Select this client for filling
      selectClientForFill(client);
    }
  });

  card.querySelector('.btn-edit').addEventListener('click', (e) => {
    e.stopPropagation();
    openEditModal(client);
  });

  card.querySelector('.btn-delete').addEventListener('click', (e) => {
    e.stopPropagation();
    openDeleteModal(client);
  });

  return card;
}

/**
 * Gets initials from name
 */
function getInitials(firstName, lastName) {
  const first = (firstName || '')[0] || '';
  const last = (lastName || '')[0] || '';
  return (first + last).toUpperCase() || '?';
}

/**
 * Escapes HTML
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Selects a client for form filling
 */
async function selectClientForFill(client) {
  try {
    // Check if we have an API key
    const settings = await sendMessage({ type: 'GET_AI_SETTINGS' });
    if (!settings.apiKey) {
      alert('Please configure your API key in settings first.');
      openSettingsModal();
      return;
    }

    // Trigger form fill on active tab
    const response = await sendMessage({
      type: 'AI_FILL_FORM',
      clientId: client.id
    });

    if (response.success) {
      // Close popup after successful fill
      window.close();
    } else {
      alert('Fill failed: ' + (response.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Failed to fill form:', error);
    alert('Failed to fill form: ' + error.message);
  }
}

/**
 * Opens the edit modal for a client
 */
function openEditModal(client = null) {
  editingClientId = client?.id || null;
  elements.editModalTitle.textContent = client ? 'Edit Client' : 'Add Client';

  // Reset form
  elements.clientForm.reset();
  elements.customFieldsContainer.innerHTML = '';

  // Populate form if editing
  if (client) {
    const form = elements.clientForm;
    Object.keys(client).forEach(key => {
      const input = form.elements[key];
      if (input && key !== 'customFields') {
        input.value = client[key] || '';
      }
    });

    // Populate custom fields
    if (client.customFields) {
      Object.entries(client.customFields).forEach(([key, value]) => {
        addCustomFieldRow(key, value);
      });
    }
  }

  elements.editModal.style.display = 'flex';
}

/**
 * Closes the edit modal
 */
function closeEditModal() {
  elements.editModal.style.display = 'none';
  editingClientId = null;
}

/**
 * Saves the current client
 */
async function saveClient() {
  const form = elements.clientForm;
  const formData = new FormData(form);

  // Validate required fields
  const firstName = formData.get('firstName')?.trim();
  const lastName = formData.get('lastName')?.trim();

  if (!firstName || !lastName) {
    alert('First name and last name are required.');
    return;
  }

  // Build client object
  const clientData = {
    firstName,
    lastName,
    middleName: formData.get('middleName')?.trim() || '',
    email: formData.get('email')?.trim() || '',
    phone: formData.get('phone')?.trim() || '',
    phoneAlt: formData.get('phoneAlt')?.trim() || '',
    address: formData.get('address')?.trim() || '',
    addressLine2: formData.get('addressLine2')?.trim() || '',
    city: formData.get('city')?.trim() || '',
    state: formData.get('state')?.trim().toUpperCase() || '',
    zip: formData.get('zip')?.trim() || '',
    dob: formData.get('dob') || '',
    ssnLast4: formData.get('ssnLast4')?.trim() || '',
    driversLicense: formData.get('driversLicense')?.trim() || '',
    dlState: formData.get('dlState')?.trim().toUpperCase() || '',
    employer: formData.get('employer')?.trim() || '',
    occupation: formData.get('occupation')?.trim() || '',
    workPhone: formData.get('workPhone')?.trim() || '',
    customFields: collectCustomFields()
  };

  try {
    if (editingClientId) {
      await sendMessage({
        type: 'UPDATE_CLIENT',
        clientId: editingClientId,
        updates: clientData
      });
    } else {
      await sendMessage({
        type: 'CREATE_CLIENT',
        clientData
      });
    }

    closeEditModal();
    await loadClients();
  } catch (error) {
    console.error('Failed to save client:', error);
    alert('Failed to save client: ' + error.message);
  }
}

/**
 * Collects custom fields from the form
 */
function collectCustomFields() {
  const fields = {};
  const rows = elements.customFieldsContainer.querySelectorAll('.custom-field-row');

  rows.forEach(row => {
    const keyInput = row.querySelector('input[name="customKey"]');
    const valueInput = row.querySelector('input[name="customValue"]');
    const key = keyInput?.value?.trim();
    const value = valueInput?.value?.trim();

    if (key && value) {
      fields[key] = value;
    }
  });

  return fields;
}

/**
 * Adds a custom field row
 */
function addCustomFieldRow(key = '', value = '') {
  const row = document.createElement('div');
  row.className = 'custom-field-row';
  row.innerHTML = `
    <input type="text" name="customKey" placeholder="Field name" value="${escapeHtml(key)}">
    <input type="text" name="customValue" placeholder="Value" value="${escapeHtml(value)}">
    <button type="button" class="btn-remove">&times;</button>
  `;

  row.querySelector('.btn-remove').addEventListener('click', () => {
    row.remove();
  });

  elements.customFieldsContainer.appendChild(row);
}

/**
 * Opens the delete confirmation modal
 */
function openDeleteModal(client) {
  deletingClientId = client.id;
  const fullName = [client.firstName, client.lastName].filter(Boolean).join(' ');
  elements.deleteClientName.textContent = fullName;
  elements.deleteModal.style.display = 'flex';
}

/**
 * Closes the delete modal
 */
function closeDeleteModal() {
  elements.deleteModal.style.display = 'none';
  deletingClientId = null;
}

/**
 * Confirms client deletion
 */
async function confirmDelete() {
  if (!deletingClientId) return;

  try {
    await sendMessage({
      type: 'DELETE_CLIENT',
      clientId: deletingClientId
    });

    closeDeleteModal();
    await loadClients();
  } catch (error) {
    console.error('Failed to delete client:', error);
    alert('Failed to delete client');
  }
}

/**
 * Opens settings modal
 */
async function openSettingsModal() {
  try {
    const settings = await sendMessage({ type: 'GET_AI_SETTINGS' });

    elements.apiKeyInput.value = settings.apiKey || '';
    elements.excludeSensitive.checked = settings.excludeSensitive !== false;
    elements.dateFormat.value = settings.defaultDateFormat || 'MM/DD/YYYY';
    elements.phoneFormat.value = settings.defaultPhoneFormat || '(###) ###-####';
    elements.cacheEnabled.checked = settings.cacheEnabled !== false;

    // Load cache stats
    const cacheStats = await sendMessage({ type: 'GET_CACHE_STATS' });
    updateCacheStats(cacheStats);

    elements.settingsModal.style.display = 'flex';
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

/**
 * Closes settings modal
 */
function closeSettingsModal() {
  elements.settingsModal.style.display = 'none';
}

/**
 * Updates cache stats display
 */
function updateCacheStats(stats) {
  if (stats) {
    elements.cacheStats.querySelector('strong').textContent = stats.totalEntries || 0;
  }
}

/**
 * Saves settings
 */
async function saveSettings() {
  try {
    await sendMessage({
      type: 'SAVE_AI_SETTINGS',
      settings: {
        apiKey: elements.apiKeyInput.value.trim(),
        excludeSensitive: elements.excludeSensitive.checked,
        defaultDateFormat: elements.dateFormat.value,
        defaultPhoneFormat: elements.phoneFormat.value,
        cacheEnabled: elements.cacheEnabled.checked
      }
    });

    closeSettingsModal();
  } catch (error) {
    console.error('Failed to save settings:', error);
    alert('Failed to save settings');
  }
}

/**
 * Validates API key
 */
async function validateApiKey() {
  const key = elements.apiKeyInput.value.trim();
  if (!key) {
    elements.keyStatus.textContent = 'Enter a key first';
    elements.keyStatus.className = 'invalid';
    return;
  }

  elements.keyStatus.textContent = 'Checking...';
  elements.keyStatus.className = 'checking';

  try {
    const response = await sendMessage({
      type: 'VALIDATE_API_KEY',
      apiKey: key
    });

    if (response.valid) {
      elements.keyStatus.textContent = 'Valid!';
      elements.keyStatus.className = 'valid';
    } else {
      elements.keyStatus.textContent = 'Invalid key';
      elements.keyStatus.className = 'invalid';
    }
  } catch (error) {
    elements.keyStatus.textContent = 'Error validating';
    elements.keyStatus.className = 'invalid';
  }
}

/**
 * Clears mapping cache
 */
async function clearCache() {
  if (!confirm('Clear all cached form mappings?')) return;

  try {
    await sendMessage({ type: 'CLEAR_MAPPING_CACHE' });
    updateCacheStats({ totalEntries: 0 });
  } catch (error) {
    console.error('Failed to clear cache:', error);
  }
}

/**
 * Toggles API key visibility
 */
function toggleApiKeyVisibility() {
  const input = elements.apiKeyInput;
  const btn = elements.toggleApiKey;

  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'Hide';
  } else {
    input.type = 'password';
    btn.textContent = 'Show';
  }
}

// ============================================================================
// CSV IMPORT/EXPORT FUNCTIONS
// ============================================================================

/**
 * Opens export CSV modal
 */
function openExportCsvModal() {
  if (clients.length === 0) {
    alert('No clients to export');
    return;
  }

  elements.exportClientCount.textContent = clients.length;
  elements.exportIncludeSensitive.checked = false;
  elements.exportCsvModal.style.display = 'flex';
}

/**
 * Closes export CSV modal
 */
function closeExportCsvModal() {
  elements.exportCsvModal.style.display = 'none';
}

/**
 * Exports clients to CSV
 */
async function exportClientsToCSV() {
  try {
    const includeSensitive = elements.exportIncludeSensitive.checked;
    const csvContent = CSVHandler.exportToCSV(clients, includeSensitive);

    if (!csvContent) {
      alert('Failed to generate CSV');
      return;
    }

    const filename = CSVHandler.generateExportFilename();
    CSVHandler.downloadCSV(csvContent, filename);

    closeExportCsvModal();
  } catch (error) {
    console.error('Export failed:', error);
    alert('Export failed: ' + error.message);
  }
}

/**
 * Triggers file picker for CSV import
 */
function triggerCsvImport() {
  elements.csvFileInput.click();
}

/**
 * Handles CSV file selection
 */
async function handleCsvFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Reset file input
  event.target.value = '';

  if (!file.name.endsWith('.csv')) {
    alert('Please select a CSV file');
    return;
  }

  try {
    const csvContent = await readFileAsText(file);
    await processCsvImport(csvContent);
  } catch (error) {
    console.error('CSV read error:', error);
    alert('Failed to read CSV file: ' + error.message);
  }
}

/**
 * Reads file as text
 */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/**
 * Processes CSV import and shows preview
 */
async function processCsvImport(csvContent) {
  try {
    // Check for Papa Parse
    if (typeof Papa === 'undefined') {
      alert('CSV parser not loaded. Please refresh the page.');
      return;
    }

    // Parse CSV
    const parseResult = await CSVHandler.parseCSV(csvContent);

    if (parseResult.errors && parseResult.errors.length > 0) {
      console.error('Parse errors:', parseResult.errors);
      alert('Could not parse CSV file. Please check it\'s a valid CSV.');
      return;
    }

    if (!parseResult.data || parseResult.data.length === 0) {
      alert('CSV file is empty');
      return;
    }

    // Detect column mappings
    const headers = Object.keys(parseResult.data[0]);
    const columnMappings = CSVHandler.detectColumnMappings(headers);

    // Check if any columns were mapped
    const mappedCount = Object.values(columnMappings).filter(v => v !== null).length;
    if (mappedCount === 0) {
      alert('Could not detect any matching columns. Please check your CSV headers match expected field names.');
      return;
    }

    // Store import data
    importData = {
      rows: parseResult.data,
      columnMappings: columnMappings,
      headers: headers
    };

    // Show preview modal
    showImportPreview();

  } catch (error) {
    console.error('CSV processing error:', error);
    alert('Failed to process CSV: ' + error.message);
  }
}

/**
 * Shows import preview modal
 */
function showImportPreview() {
  if (!importData) return;

  const { rows, columnMappings, headers } = importData;

  // Update row count
  elements.importRowCount.textContent = rows.length;

  // Show column mappings
  renderColumnMappings(headers, columnMappings);

  // Show preview table
  renderPreviewTable(rows.slice(0, 5), columnMappings);

  // Reset duplicate strategy
  elements.duplicateStrategy.value = 'skip';

  // Show modal
  elements.importPreviewModal.style.display = 'flex';
}

/**
 * Renders column mappings UI
 */
function renderColumnMappings(headers, columnMappings) {
  const container = elements.columnMappingsContainer;
  container.innerHTML = '';

  const fieldOptions = [
    { value: '', label: '(Unmapped)' },
    { value: 'firstName', label: 'First Name' },
    { value: 'middleName', label: 'Middle Name' },
    { value: 'lastName', label: 'Last Name' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'phoneAlt', label: 'Alt Phone' },
    { value: 'address', label: 'Address' },
    { value: 'addressLine2', label: 'Address Line 2' },
    { value: 'city', label: 'City' },
    { value: 'state', label: 'State' },
    { value: 'zip', label: 'ZIP' },
    { value: 'country', label: 'Country' },
    { value: 'dob', label: 'Date of Birth' },
    { value: 'ssnLast4', label: 'SSN Last 4' },
    { value: 'driversLicense', label: 'Driver License' },
    { value: 'dlState', label: 'DL State' },
    { value: 'dlExpiration', label: 'DL Expiration' },
    { value: 'employer', label: 'Employer' },
    { value: 'occupation', label: 'Occupation' },
    { value: 'workPhone', label: 'Work Phone' }
  ];

  headers.forEach(header => {
    const mappedField = columnMappings[header];
    const row = document.createElement('div');
    row.className = 'mapping-row';

    const csvColumn = document.createElement('span');
    csvColumn.className = 'csv-column';
    csvColumn.textContent = header;

    const arrow = document.createElement('span');
    arrow.className = 'mapping-arrow';
    arrow.textContent = '→';

    const select = document.createElement('select');
    select.className = 'mapping-select';
    select.dataset.csvColumn = header;

    fieldOptions.forEach(opt => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      if (opt.value === mappedField) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    // Update mapping on change
    select.addEventListener('change', (e) => {
      importData.columnMappings[header] = e.target.value || null;
    });

    row.appendChild(csvColumn);
    row.appendChild(arrow);
    row.appendChild(select);

    container.appendChild(row);
  });
}

/**
 * Renders preview table
 */
function renderPreviewTable(rows, columnMappings) {
  const container = elements.importPreviewTable;
  container.innerHTML = '';

  if (rows.length === 0) {
    container.textContent = 'No data to preview';
    return;
  }

  const table = document.createElement('table');
  table.className = 'preview-data-table';

  // Header row
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  Object.keys(rows[0]).forEach(csvColumn => {
    const th = document.createElement('th');
    const mappedField = columnMappings[csvColumn];
    th.innerHTML = `<div class="preview-header">${escapeHtml(csvColumn)}<br><small>${mappedField || '(unmapped)'}</small></div>`;
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Data rows
  const tbody = document.createElement('tbody');

  rows.forEach(row => {
    const tr = document.createElement('tr');

    Object.values(row).forEach(value => {
      const td = document.createElement('td');
      td.textContent = value || '';
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

/**
 * Closes import preview modal
 */
function closeImportPreviewModal() {
  elements.importPreviewModal.style.display = 'none';
  importData = null;
}

/**
 * Confirms and executes import
 */
async function confirmImport() {
  if (!importData) return;

  try {
    const { rows, columnMappings } = importData;
    const duplicateStrategy = elements.duplicateStrategy.value;

    // Import clients
    const results = CSVHandler.importClients(rows, columnMappings, clients, duplicateStrategy);

    // Create new clients
    for (const clientData of results.imported) {
      await sendMessage({
        type: 'CREATE_CLIENT',
        clientData
      });
    }

    // Update existing clients
    for (const clientData of results.updated) {
      await sendMessage({
        type: 'UPDATE_CLIENT',
        clientId: clientData.id,
        updates: clientData
      });
    }

    // Reload clients
    await loadClients();

    // Close preview modal
    closeImportPreviewModal();

    // Show results modal
    showImportResults(results);

  } catch (error) {
    console.error('Import failed:', error);
    alert('Import failed: ' + error.message);
  }
}

/**
 * Shows import results modal
 */
function showImportResults(results) {
  // Update counts
  elements.importedCount.textContent = results.imported.length;
  elements.updatedCount.textContent = results.updated.length;
  elements.skippedCount.textContent = results.skipped.length;
  elements.errorsCount.textContent = results.errors.length;

  // Show/hide sections
  elements.updatedResult.style.display = results.updated.length > 0 ? 'block' : 'none';
  elements.skippedResult.style.display = results.skipped.length > 0 ? 'block' : 'none';
  elements.errorsResult.style.display = results.errors.length > 0 ? 'block' : 'none';

  // Show error details
  if (results.errors.length > 0) {
    elements.errorDetails.style.display = 'block';
    renderErrorList(results.errors);
  } else {
    elements.errorDetails.style.display = 'none';
  }

  // Show modal
  elements.importResultsModal.style.display = 'flex';
}

/**
 * Renders error list
 */
function renderErrorList(errors) {
  const list = elements.errorList;
  list.innerHTML = '';

  errors.forEach(error => {
    const item = document.createElement('div');
    item.className = 'error-item';
    item.innerHTML = `
      <strong>Row ${error.row}:</strong> ${error.errors.join(', ')}
    `;
    list.appendChild(item);
  });
}

/**
 * Closes import results modal
 */
function closeImportResultsModal() {
  elements.importResultsModal.style.display = 'none';
}

// Event Listeners

// Navigation
elements.backBtn.addEventListener('click', () => {
  window.location.href = 'popup.html';
});

elements.settingsBtn.addEventListener('click', openSettingsModal);

// Search
elements.searchInput.addEventListener('input', renderClients);

// Add client
elements.addClientBtn.addEventListener('click', () => openEditModal());

// Edit modal
elements.closeEditModal.addEventListener('click', closeEditModal);
elements.cancelEditBtn.addEventListener('click', closeEditModal);
elements.saveClientBtn.addEventListener('click', saveClient);
elements.addCustomFieldBtn.addEventListener('click', () => addCustomFieldRow());

// Settings modal
elements.closeSettingsModal.addEventListener('click', closeSettingsModal);
elements.cancelSettingsBtn.addEventListener('click', closeSettingsModal);
elements.saveSettingsBtn.addEventListener('click', saveSettings);
elements.toggleApiKey.addEventListener('click', toggleApiKeyVisibility);
elements.validateKeyBtn.addEventListener('click', validateApiKey);
elements.clearCacheBtn.addEventListener('click', clearCache);

// Delete modal
elements.closeDeleteModal.addEventListener('click', closeDeleteModal);
elements.cancelDeleteBtn.addEventListener('click', closeDeleteModal);
elements.confirmDeleteBtn.addEventListener('click', confirmDelete);

// CSV Import/Export
elements.exportCsvBtn.addEventListener('click', openExportCsvModal);
elements.closeExportCsvModal.addEventListener('click', closeExportCsvModal);
elements.cancelExportCsvBtn.addEventListener('click', closeExportCsvModal);
elements.confirmExportCsvBtn.addEventListener('click', exportClientsToCSV);

elements.importCsvBtn.addEventListener('click', triggerCsvImport);
elements.csvFileInput.addEventListener('change', handleCsvFileSelect);
elements.closeImportPreviewModal.addEventListener('click', closeImportPreviewModal);
elements.cancelImportPreviewBtn.addEventListener('click', closeImportPreviewModal);
elements.confirmImportBtn.addEventListener('click', confirmImport);

elements.closeImportResultsModal.addEventListener('click', closeImportResultsModal);
elements.closeImportResultsBtn.addEventListener('click', closeImportResultsModal);

// Close modals on outside click
[
  elements.editModal,
  elements.settingsModal,
  elements.deleteModal,
  elements.exportCsvModal,
  elements.importPreviewModal,
  elements.importResultsModal
].forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });
});

// Initialize
loadClients();
