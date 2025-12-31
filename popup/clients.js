/**
 * FormGhost - Clients Management Page
 * Handles client profile CRUD and AI settings
 */

// State
let clients = [];
let editingClientId = null;
let deletingClientId = null;

// DOM Elements
const elements = {
  backBtn: document.getElementById('backBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  searchInput: document.getElementById('searchInput'),
  addClientBtn: document.getElementById('addClientBtn'),
  clientsList: document.getElementById('clientsList'),
  emptyState: document.getElementById('emptyState'),
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
  confirmDeleteBtn: document.getElementById('confirmDeleteBtn')
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

// Close modals on outside click
[elements.editModal, elements.settingsModal, elements.deleteModal].forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });
});

// Initialize
loadClients();
