/**
 * FormGhost - Mapping Cache
 * Caches Claude's form field mappings to reduce API calls
 */

const MappingCache = {
  STORAGE_KEY: 'formghost_mapping_cache',
  DEFAULT_TTL_DAYS: 30,

  /**
   * Generates a unique hash for a form structure
   * @param {string} url - Page URL (domain + path)
   * @param {Array} formFields - Form field metadata
   * @returns {string} Cache key hash
   */
  generateCacheKey(url, formFields) {
    // Create a signature from the form structure
    const urlPart = new URL(url).hostname + new URL(url).pathname;
    const fieldSignature = formFields
      .map(f => `${f.name || ''}:${f.id || ''}:${f.type || ''}:${f.label || ''}`)
      .sort()
      .join('|');

    // Simple hash function
    const str = urlPart + '::' + fieldSignature;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `cache_${Math.abs(hash).toString(36)}`;
  },

  /**
   * Gets all cached mappings
   * @returns {Promise<Object>} Cache object
   */
  async getAll() {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEY);
      return result[this.STORAGE_KEY] || {};
    } catch (error) {
      console.error('MappingCache: Failed to get cache:', error);
      return {};
    }
  },

  /**
   * Gets a cached mapping
   * @param {string} cacheKey - Cache key
   * @returns {Promise<Object|null>} Cached mapping or null
   */
  async get(cacheKey) {
    const cache = await this.getAll();
    const entry = cache[cacheKey];

    if (!entry) {
      return null;
    }

    // Check if expired
    const ttlMs = (this.DEFAULT_TTL_DAYS) * 24 * 60 * 60 * 1000;
    if (Date.now() - entry.cachedAt > ttlMs) {
      // Expired, remove it
      await this.remove(cacheKey);
      return null;
    }

    console.log('MappingCache: Cache hit for', cacheKey);
    return entry.mappings;
  },

  /**
   * Caches a mapping result
   * @param {string} cacheKey - Cache key
   * @param {Object} mappings - Mappings to cache
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<void>}
   */
  async set(cacheKey, mappings, metadata = {}) {
    try {
      const cache = await this.getAll();
      cache[cacheKey] = {
        mappings,
        cachedAt: Date.now(),
        url: metadata.url || '',
        fieldCount: metadata.fieldCount || 0,
        hits: 0
      };
      await chrome.storage.local.set({ [this.STORAGE_KEY]: cache });
      console.log('MappingCache: Cached mappings for', cacheKey);
    } catch (error) {
      console.error('MappingCache: Failed to cache:', error);
    }
  },

  /**
   * Removes a cached mapping
   * @param {string} cacheKey - Cache key
   * @returns {Promise<void>}
   */
  async remove(cacheKey) {
    try {
      const cache = await this.getAll();
      delete cache[cacheKey];
      await chrome.storage.local.set({ [this.STORAGE_KEY]: cache });
      console.log('MappingCache: Removed cache entry', cacheKey);
    } catch (error) {
      console.error('MappingCache: Failed to remove:', error);
    }
  },

  /**
   * Clears all cached mappings
   * @returns {Promise<void>}
   */
  async clear() {
    try {
      await chrome.storage.local.set({ [this.STORAGE_KEY]: {} });
      console.log('MappingCache: Cache cleared');
    } catch (error) {
      console.error('MappingCache: Failed to clear:', error);
    }
  },

  /**
   * Clears expired entries
   * @returns {Promise<number>} Number of entries removed
   */
  async clearExpired() {
    try {
      const cache = await this.getAll();
      const ttlMs = this.DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000;
      const now = Date.now();
      let removed = 0;

      for (const key of Object.keys(cache)) {
        if (now - cache[key].cachedAt > ttlMs) {
          delete cache[key];
          removed++;
        }
      }

      if (removed > 0) {
        await chrome.storage.local.set({ [this.STORAGE_KEY]: cache });
        console.log('MappingCache: Cleared', removed, 'expired entries');
      }

      return removed;
    } catch (error) {
      console.error('MappingCache: Failed to clear expired:', error);
      return 0;
    }
  },

  /**
   * Gets cache statistics
   * @returns {Promise<Object>} Cache stats
   */
  async getStats() {
    const cache = await this.getAll();
    const entries = Object.values(cache);
    const ttlMs = this.DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000;
    const now = Date.now();

    return {
      totalEntries: entries.length,
      activeEntries: entries.filter(e => now - e.cachedAt <= ttlMs).length,
      expiredEntries: entries.filter(e => now - e.cachedAt > ttlMs).length,
      totalHits: entries.reduce((sum, e) => sum + (e.hits || 0), 0),
      oldestEntry: entries.length > 0
        ? new Date(Math.min(...entries.map(e => e.cachedAt))).toISOString()
        : null,
      newestEntry: entries.length > 0
        ? new Date(Math.max(...entries.map(e => e.cachedAt))).toISOString()
        : null
    };
  },

  /**
   * Records a cache hit
   * @param {string} cacheKey - Cache key
   */
  async recordHit(cacheKey) {
    try {
      const cache = await this.getAll();
      if (cache[cacheKey]) {
        cache[cacheKey].hits = (cache[cacheKey].hits || 0) + 1;
        cache[cacheKey].lastHit = Date.now();
        await chrome.storage.local.set({ [this.STORAGE_KEY]: cache });
      }
    } catch (error) {
      // Non-critical, ignore
    }
  }
};

// Export for use in service worker
if (typeof module !== 'undefined') {
  module.exports = MappingCache;
}
