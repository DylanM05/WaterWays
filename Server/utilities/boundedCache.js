const NodeCache = require('node-cache');

/**
 * A NodeCache holding at most maxKeys entries. NodeCache throws ECACHEFULL when a set would go past the
 * cap; here a full cache just doesn't store the new entry (an existing key is still replaced).
 * With maxBytes, string values are also counted by length, and one that would take the total past it isn't
 * stored (an older value under the same key is dropped, so it isn't served in its place).
 */
function boundedCache({ maxKeys, maxBytes, ...options }) {
  const cache = new NodeCache({ ...options, maxKeys });
  const set = cache.set.bind(cache);
  const store = (key, value, ttl) => {
    try {
      return set(key, value, ttl);
    } catch (error) {
      if (error.name !== 'ECACHEFULL') throw error;
      if (!cache.has(key)) return false;
      cache.del(key);
      return set(key, value, ttl);
    }
  };
  if (!maxBytes) {
    cache.set = store;
    return cache;
  }

  const sizes = new Map();
  let bytes = 0;
  const forget = key => {
    bytes -= sizes.get(key) || 0;
    sizes.delete(key);
  };
  // Expired entries are deleted too, so this sees every value that leaves the cache.
  cache.on('del', forget);
  cache.on('flush', () => {
    sizes.clear();
    bytes = 0;
  });
  cache.set = (key, value, ttl) => {
    const size = typeof value === 'string' ? value.length : 0;
    if (bytes - (sizes.get(key) || 0) + size > maxBytes) {
      cache.del(key);
      return false;
    }
    const stored = store(key, value, ttl);
    if (stored) {
      forget(key);
      sizes.set(key, size);
      bytes += size;
    }
    return stored;
  };
  return cache;
}

module.exports = { boundedCache };
