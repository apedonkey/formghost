/**
 * FormGhost - CSV Import/Export Handler
 * Handles CSV parsing, column mapping, and data conversion for client profiles
 */

const CSVHandler = {
  /**
   * Column mapping definitions
   * Maps various possible CSV column names to client profile fields
   */
  COLUMN_MAPPINGS: {
    firstName: [
      'first name', 'firstname', 'first_name', 'fname', 'first', 'given name', 'givenname'
    ],
    lastName: [
      'last name', 'lastname', 'last_name', 'lname', 'last', 'surname', 'family name', 'familyname'
    ],
    middleName: [
      'middle name', 'middlename', 'middle_name', 'middle', 'middle initial', 'mi'
    ],
    email: [
      'email', 'email address', 'e-mail', 'e_mail', 'emailaddress', 'mail'
    ],
    phone: [
      'phone', 'phone number', 'phonenumber', 'mobile', 'cell', 'telephone', 'tel', 'primary phone'
    ],
    phoneAlt: [
      'alt phone', 'altphone', 'phone 2', 'phone2', 'secondary phone', 'alternate phone', 'home phone'
    ],
    address: [
      'address', 'street', 'street address', 'streetaddress', 'address line 1', 'address1', 'addr1'
    ],
    addressLine2: [
      'address 2', 'address2', 'address line 2', 'addressline2', 'apt', 'unit', 'suite', 'apartment', 'addr2'
    ],
    city: [
      'city', 'town', 'locality'
    ],
    state: [
      'state', 'province', 'region', 'st'
    ],
    zip: [
      'zip', 'zipcode', 'zip code', 'postal code', 'postalcode', 'postcode', 'postal'
    ],
    country: [
      'country', 'nation'
    ],
    dob: [
      'dob', 'date of birth', 'dateofbirth', 'birth date', 'birthdate', 'birthday', 'birth_date', 'bdate'
    ],
    ssnLast4: [
      'ssn', 'ssn last 4', 'last 4', 'last4', 'social security', 'social security number', 'ss#'
    ],
    driversLicense: [
      'driver license', 'drivers license', 'dl', 'dl number', 'license number', 'driver\'s license', 'license'
    ],
    dlState: [
      'dl state', 'license state', 'dl_state', 'license_state'
    ],
    dlExpiration: [
      'dl expiration', 'license expiration', 'dl exp', 'license exp', 'dl_expiration'
    ],
    employer: [
      'employer', 'company', 'company name', 'organization', 'org'
    ],
    occupation: [
      'occupation', 'job title', 'title', 'position', 'job', 'role'
    ],
    workPhone: [
      'work phone', 'workphone', 'business phone', 'office phone', 'work number'
    ]
  },

  /**
   * Exports clients to CSV format
   * @param {Array} clients - Array of client objects
   * @param {boolean} includeSensitive - Include SSN/DL fields
   * @returns {string} CSV content
   */
  exportToCSV(clients, includeSensitive = false) {
    if (!clients || clients.length === 0) {
      return '';
    }

    // Define column order
    const columns = [
      { key: 'firstName', label: 'First Name' },
      { key: 'middleName', label: 'Middle Name' },
      { key: 'lastName', label: 'Last Name' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'phoneAlt', label: 'Alt Phone' },
      { key: 'address', label: 'Address' },
      { key: 'addressLine2', label: 'Address Line 2' },
      { key: 'city', label: 'City' },
      { key: 'state', label: 'State' },
      { key: 'zip', label: 'ZIP' },
      { key: 'country', label: 'Country' },
      { key: 'dob', label: 'Date of Birth' },
      { key: 'employer', label: 'Employer' },
      { key: 'occupation', label: 'Occupation' },
      { key: 'workPhone', label: 'Work Phone' }
    ];

    // Add sensitive fields if requested
    if (includeSensitive) {
      columns.push(
        { key: 'ssnLast4', label: 'SSN Last 4' },
        { key: 'driversLicense', label: 'Driver License' },
        { key: 'dlState', label: 'DL State' },
        { key: 'dlExpiration', label: 'DL Expiration' }
      );
    }

    // Build CSV
    const rows = [];

    // Header row
    rows.push(columns.map(col => this.escapeCSV(col.label)).join(','));

    // Data rows
    for (const client of clients) {
      const row = columns.map(col => {
        const value = client[col.key] || '';
        return this.escapeCSV(String(value));
      });
      rows.push(row.join(','));
    }

    return rows.join('\n');
  },

  /**
   * Escapes a value for CSV format
   * @param {string} value - Value to escape
   * @returns {string} Escaped value
   */
  escapeCSV(value) {
    if (!value) return '';

    const stringValue = String(value);

    // If contains comma, quote, or newline, wrap in quotes and escape quotes
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return '"' + stringValue.replace(/"/g, '""') + '"';
    }

    return stringValue;
  },

  /**
   * Parses CSV content using Papa Parse
   * @param {string} csvContent - CSV file content
   * @returns {Promise<Object>} Parse result {data, errors, meta}
   */
  async parseCSV(csvContent) {
    return new Promise((resolve, reject) => {
      if (typeof Papa === 'undefined') {
        reject(new Error('Papa Parse library not loaded'));
        return;
      }

      Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        trimHeaders: true,
        complete: (results) => {
          resolve(results);
        },
        error: (error) => {
          reject(error);
        }
      });
    });
  },

  /**
   * Detects column mappings from CSV headers
   * @param {Array} headers - CSV column headers
   * @returns {Object} Mapping of CSV columns to client fields
   */
  detectColumnMappings(headers) {
    const mappings = {};

    for (const header of headers) {
      const normalizedHeader = header.toLowerCase().trim();

      // Try to find a matching client field
      for (const [clientField, possibleNames] of Object.entries(this.COLUMN_MAPPINGS)) {
        if (possibleNames.includes(normalizedHeader)) {
          mappings[header] = clientField;
          break;
        }
      }

      // If no match found, mark as unmapped
      if (!mappings[header]) {
        mappings[header] = null;
      }
    }

    return mappings;
  },

  /**
   * Validates and converts a row to client profile format
   * @param {Object} row - CSV row data
   * @param {Object} columnMappings - Column to field mappings
   * @returns {Object} {valid: boolean, client: Object, errors: Array}
   */
  convertRowToClient(row, columnMappings) {
    const client = {};
    const errors = [];

    // Apply mappings
    for (const [csvColumn, clientField] of Object.entries(columnMappings)) {
      if (!clientField) continue; // Skip unmapped columns

      const value = row[csvColumn];
      if (value !== undefined && value !== null && value !== '') {
        client[clientField] = this.formatValue(clientField, value);
      }
    }

    // Validate required fields
    if (!client.firstName || client.firstName.trim() === '') {
      errors.push('Missing required field: First Name');
    }
    if (!client.lastName || client.lastName.trim() === '') {
      errors.push('Missing required field: Last Name');
    }

    // Format special fields
    if (client.state) {
      client.state = client.state.toUpperCase().substring(0, 2);
    }
    if (client.dlState) {
      client.dlState = client.dlState.toUpperCase().substring(0, 2);
    }

    // Format dates to YYYY-MM-DD
    if (client.dob) {
      client.dob = this.formatDate(client.dob);
    }
    if (client.dlExpiration) {
      client.dlExpiration = this.formatDate(client.dlExpiration);
    }

    // Ensure SSN is last 4 only
    if (client.ssnLast4) {
      const digits = client.ssnLast4.replace(/\D/g, '');
      client.ssnLast4 = digits.slice(-4);
    }

    return {
      valid: errors.length === 0,
      client,
      errors
    };
  },

  /**
   * Formats a value based on field type
   * @param {string} field - Field name
   * @param {string} value - Raw value
   * @returns {string} Formatted value
   */
  formatValue(field, value) {
    const trimmed = String(value).trim();

    // Phone fields - remove non-digits if user wants to reformat
    if (field.includes('Phone') || field === 'phone' || field === 'phoneAlt' || field === 'workPhone') {
      // Keep as-is if already formatted, otherwise strip to digits
      return trimmed;
    }

    return trimmed;
  },

  /**
   * Formats date to YYYY-MM-DD
   * @param {string} dateStr - Date string in various formats
   * @returns {string} ISO format YYYY-MM-DD
   */
  formatDate(dateStr) {
    if (!dateStr) return '';

    // Already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }

    // Try to parse the date
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    } catch (e) {
      // Fall through
    }

    // Try MM/DD/YYYY format
    const match = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (match) {
      const [, month, day, year] = match;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    // Return as-is if can't parse
    return dateStr;
  },

  /**
   * Checks if a client is a duplicate
   * @param {Object} newClient - New client to check
   * @param {Array} existingClients - Existing clients
   * @returns {Object|null} Matching client or null
   */
  findDuplicate(newClient, existingClients) {
    return existingClients.find(existing => {
      const nameMatch =
        existing.firstName.toLowerCase() === newClient.firstName.toLowerCase() &&
        existing.lastName.toLowerCase() === newClient.lastName.toLowerCase();

      if (!nameMatch) return false;

      // Additional matching criteria
      const dobMatch = existing.dob && newClient.dob && existing.dob === newClient.dob;
      const emailMatch = existing.email && newClient.email &&
        existing.email.toLowerCase() === newClient.email.toLowerCase();

      return dobMatch || emailMatch;
    });
  },

  /**
   * Imports clients from CSV with duplicate handling
   * @param {Array} rows - Parsed CSV rows
   * @param {Object} columnMappings - Column mappings
   * @param {Array} existingClients - Existing clients
   * @param {string} duplicateStrategy - 'skip' | 'update' | 'import'
   * @returns {Object} Import results
   */
  importClients(rows, columnMappings, existingClients, duplicateStrategy = 'skip') {
    const results = {
      imported: [],
      updated: [],
      skipped: [],
      errors: []
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2; // +2 because header is row 1 and index is 0-based

      const converted = this.convertRowToClient(row, columnMappings);

      if (!converted.valid) {
        results.errors.push({
          row: rowNumber,
          data: row,
          errors: converted.errors
        });
        continue;
      }

      const duplicate = this.findDuplicate(converted.client, existingClients);

      if (duplicate) {
        if (duplicateStrategy === 'skip') {
          results.skipped.push({
            row: rowNumber,
            client: converted.client,
            reason: `Duplicate of ${duplicate.firstName} ${duplicate.lastName}`
          });
          continue;
        } else if (duplicateStrategy === 'update') {
          // Merge new data into existing
          const updated = {
            ...duplicate,
            ...converted.client,
            id: duplicate.id,
            createdAt: duplicate.createdAt,
            updatedAt: Date.now()
          };
          results.updated.push(updated);
          continue;
        }
        // 'import' strategy falls through to create new
      }

      // Create new client
      results.imported.push(converted.client);
    }

    return results;
  },

  /**
   * Generates filename for CSV export
   * @returns {string} Filename with date
   */
  generateExportFilename() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `formghost_clients_${year}-${month}-${day}.csv`;
  },

  /**
   * Triggers download of CSV file
   * @param {string} csvContent - CSV content
   * @param {string} filename - Filename
   */
  downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }
};

// Export for use in popup
if (typeof module !== 'undefined') {
  module.exports = CSVHandler;
}
