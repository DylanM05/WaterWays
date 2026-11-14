const NodeCache = require('node-cache');

/**
 * A NodeCache holding at most maxKeys entries. NodeCache throws ECACHEFULL when a set would go past the
 * cap; here a full cache just doesn't store the new entry (an existing key is still replaced).
 */
function boundedCache({ maxKeys, ...options }) {
  const cache = new NodeCache({ ...options, maxKeys });
  const set = cache.set.bind(cache);
  cache.set = (key, value, ttl) => {
    try {
      return set(key, value, ttl);
    } catch (error) {
      if (error.name !== 'ECACHEFULL') throw error;
      if (!cache.has(key)) return false;
      cache.del(key);
      return set(key, value, ttl);
    }
  };
  return cache;
}

module.exports = { boundedCache };
