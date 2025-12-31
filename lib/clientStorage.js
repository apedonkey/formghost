/**
 * FormGhost - Client Profile Storage
 * Manages client profiles in Chrome storage
 */

const ClientStorage = {
  STORAGE_KEY: 'formghost_clients',
  SETTINGS_KEY: 'formghost_ai_settings',

  /**
   * Default client profile schema
   */
  createEmptyProfile() {
    return {
      id: `client_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      // Basic Info
      firstName: '',
      lastName: '',
      middleName: '',
      // Contact
      email: '',
      phone: '',
      phoneAlt: '',
      // Address
      address: '',
      addressLine2: '',
      city: '',
      state: '',
      zip: '',
      country: 'USA',
      // Dates
      dob: '', // ISO format: YYYY-MM-DD
      // Identification (sensitive - excluded from API by default)
      ssnLast4: '',
      driversLicense: '',
      dlState: '',
      dlExpiration: '',
      // Employment
      employer: '',
      occupation: '',
      workPhone: '',
      // Custom fields
      customFields: {} // { fieldName: value }
    };
  },

  /**
   * Gets all client profiles
   * @returns {Promise<Array>} Array of client profiles
   */
  async getAll() {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEY);
      const clients = result[this.STORAGE_KEY] || [];
      // Sort by last name, then first name
      return clients.sort((a, b) => {
        const lastCompare = (a.lastName || '').localeCompare(b.lastName || '');
        if (lastCompare !== 0) return lastCompare;
        return (a.firstName || '').localeCompare(b.firstName || '');
      });
    } catch (error) {
      console.error('ClientStorage: Failed to get clients:', error);
      return [];
    }
  },

  /**
   * Gets a single client by ID
   * @param {string} clientId - Client ID
   * @returns {Promise<Object|null>} Client profile or null
   */
  async get(clientId) {
    const clients = await this.getAll();
    return clients.find(c => c.id === clientId) || null;
  },

  /**
   * Saves a new client profile
   * @param {Object} profile - Client profile data
   * @returns {Promise<Object>} Saved profile with ID
   */
  async create(profile) {
    try {
      const clients = await this.getAll();
      const newProfile = {
        ...this.createEmptyProfile(),
        ...profile,
        id: `client_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      clients.push(newProfile);
      await chrome.storage.local.set({ [this.STORAGE_KEY]: clients });
      console.log('ClientStorage: Created client:', newProfile.id);
      return newProfile;
    } catch (error) {
      console.error('ClientStorage: Failed to create client:', error);
      throw error;
    }
  },

  /**
   * Updates an existing client profile
   * @param {string} clientId - Client ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated profile
   */
  async update(clientId, updates) {
    try {
      const clients = await this.getAll();
      const index = clients.findIndex(c => c.id === clientId);
      if (index === -1) {
        throw new Error('Client not found');
      }
      clients[index] = {
        ...clients[index],
        ...updates,
        id: clientId, // Preserve ID
        createdAt: clients[index].createdAt, // Preserve creation date
        updatedAt: Date.now()
      };
      await chrome.storage.local.set({ [this.STORAGE_KEY]: clients });
      console.log('ClientStorage: Updated client:', clientId);
      return clients[index];
    } catch (error) {
      console.error('ClientStorage: Failed to update client:', error);
      throw error;
    }
  },

  /**
   * Deletes a client profile
   * @param {string} clientId - Client ID
   * @returns {Promise<boolean>} Success
   */
  async delete(clientId) {
    try {
      const clients = await this.getAll();
      const filtered = clients.filter(c => c.id !== clientId);
      if (filtered.length === clients.length) {
        return false; // Not found
      }
      await chrome.storage.local.set({ [this.STORAGE_KEY]: filtered });
      console.log('ClientStorage: Deleted client:', clientId);
      return true;
    } catch (error) {
      console.error('ClientStorage: Failed to delete client:', error);
      throw error;
    }
  },

  /**
   * Searches clients by name or email
   * @param {string} query - Search query
   * @returns {Promise<Array>} Matching clients
   */
  async search(query) {
    const clients = await this.getAll();
    const q = query.toLowerCase().trim();
    if (!q) return clients;

    return clients.filter(c => {
      const fullName = `${c.firstName} ${c.middleName} ${c.lastName}`.toLowerCase();
      const email = (c.email || '').toLowerCase();
      return fullName.includes(q) || email.includes(q);
    });
  },

  /**
   * Exports a client profile as JSON
   * @param {string} clientId - Client ID
   * @param {boolean} includeSensitive - Include SSN/DL fields
   * @returns {Promise<Object>} Exportable profile
   */
  async export(clientId, includeSensitive = false) {
    const client = await this.get(clientId);
    if (!client) return null;

    const exported = { ...client };
    if (!includeSensitive) {
      delete exported.ssnLast4;
      delete exported.driversLicense;
      delete exported.dlState;
      delete exported.dlExpiration;
    }
    return exported;
  },

  /**
   * Imports a client profile from JSON
   * @param {Object} data - Profile data
   * @returns {Promise<Object>} Created profile
   */
  async import(data) {
    // Strip ID to create new one
    const { id, createdAt, updatedAt, ...profileData } = data;
    return this.create(profileData);
  },

  /**
   * Gets AI fill settings
   * @returns {Promise<Object>} Settings
   */
  async getSettings() {
    try {
      const result = await chrome.storage.local.get(this.SETTINGS_KEY);
      return {
        apiKey: '',
        excludeSensitive: true,
        defaultDateFormat: 'MM/DD/YYYY',
        defaultPhoneFormat: '(###) ###-####',
        cacheEnabled: true,
        cacheDurationDays: 30,
        showFloatingButton: false,
        ...result[this.SETTINGS_KEY]
      };
    } catch (error) {
      console.error('ClientStorage: Failed to get settings:', error);
      return {};
    }
  },

  /**
   * Saves AI fill settings
   * @param {Object} settings - Settings to save
   * @returns {Promise<void>}
   */
  async saveSettings(settings) {
    try {
      const current = await this.getSettings();
      await chrome.storage.local.set({
        [this.SETTINGS_KEY]: { ...current, ...settings }
      });
      console.log('ClientStorage: Settings saved');
    } catch (error) {
      console.error('ClientStorage: Failed to save settings:', error);
      throw error;
    }
  },

  /**
   * Gets profile data formatted for Claude API (excludes sensitive by default)
   * @param {string} clientId - Client ID
   * @returns {Promise<Object>} API-safe profile
   */
  async getForAPI(clientId) {
    const client = await this.get(clientId);
    if (!client) return null;

    const settings = await this.getSettings();

    // Build API-safe profile
    const profile = {
      firstName: client.firstName,
      lastName: client.lastName,
      middleName: client.middleName,
      fullName: [client.firstName, client.middleName, client.lastName].filter(Boolean).join(' '),
      email: client.email,
      phone: client.phone,
      phoneAlt: client.phoneAlt,
      address: client.address,
      addressLine2: client.addressLine2,
      city: client.city,
      state: client.state,
      zip: client.zip,
      country: client.country,
      dob: client.dob,
      employer: client.employer,
      occupation: client.occupation,
      workPhone: client.workPhone,
      customFields: client.customFields || {}
    };

    // Include sensitive only if setting allows
    if (!settings.excludeSensitive) {
      profile.ssnLast4 = client.ssnLast4;
      profile.driversLicense = client.driversLicense;
      profile.dlState = client.dlState;
      profile.dlExpiration = client.dlExpiration;
    }

    return profile;
  }
};

// Export for use in service worker
if (typeof module !== 'undefined') {
  module.exports = ClientStorage;
}
