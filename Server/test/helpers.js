// Shared test helpers. Tests never touch MongoDB: models are swapped for in-memory stores.
const crypto = require('crypto');
const http = require('http');

function matchesCondition(value, condition) {
  if (condition instanceof RegExp) return typeof value === 'string' && condition.test(value);
  if (condition && typeof condition === 'object' && !(condition instanceof Date) && !Array.isArray(condition)) {
    return Object.entries(condition).every(([operator, operand]) => {
      switch (operator) {
        case '$gt': return value > operand;
        case '$gte': return value >= operand;
        case '$lt': return value < operand;
        case '$lte': return value <= operand;
        case '$ne': return value !== operand;
        case '$in': return operand.includes(value);
        case '$nin': return !operand.includes(value);
        case '$exists': return (value !== undefined) === operand;
        case '$type':
          if (operand !== 'date') throw new Error(`fakeModel does not support $type ${operand}`);
          return value instanceof Date;
        default: throw new Error(`fakeModel does not support ${operator}`);
      }
    });
  }
  if (condition === null) return value === null || value === undefined;
  if (condition instanceof Date) return value instanceof Date && value.getTime() === condition.getTime();
  return value === condition;
}

const matches = (doc, filter = {}) => Object.entries(filter).every(([key, condition]) => matchesCondition(doc[key], condition));

// A query that can be awaited directly or chained like Mongoose's (.sort(), .limit(), .lean(), .select()).
function query(getDocs, { single = false } = {}) {
  let sortSpec = null;
  let limitCount = null;
  const run = () => {
    let docs = [...getDocs()];
    if (sortSpec) {
      docs.sort((a, b) => {
        for (const [key, direction] of Object.entries(sortSpec)) {
          if (a[key] < b[key]) return -direction;
          if (a[key] > b[key]) return direction;
        }
        return 0;
      });
    }
    if (limitCount !== null) docs = docs.slice(0, limitCount);
    return single ? docs[0] ?? null : docs;
  };
  const chain = {
    lean: () => chain,
    select: () => chain,
    sort: (spec) => { sortSpec = spec; return chain; },
    limit: (count) => { limitCount = count; return chain; },
    then: (resolve, reject) => Promise.resolve().then(run).then(resolve, reject)
  };
  return chain;
}

/**
 * Replaces a model's static query methods with an in-memory store and returns the store's documents.
 * Supports the filters and updates the controllers use: equality, $gt/$lt/$ne/$in/$nin/$exists, $set and
 * $setOnInsert, upserts, and deleteMany.
 */
function fakeModel(Model, documents = []) {
  const docs = documents.map(doc => ({ ...doc }));
  // Operator updates apply $set; a plain object replaces fields directly.
  const apply = (doc, update) => {
    if (update.$set || update.$setOnInsert) Object.assign(doc, update.$set || {});
    else Object.assign(doc, update);
  };

  Object.assign(Model, {
    find: (filter) => query(() => docs.filter(doc => matches(doc, filter))),
    findOne: (filter) => query(() => docs.filter(doc => matches(doc, filter)), { single: true }),
    distinct: async (field, filter) => [...new Set(docs.filter(doc => matches(doc, filter)).map(doc => doc[field]))],
    exists: async (filter) => (docs.some(doc => matches(doc, filter)) ? { _id: 'exists' } : null),
    countDocuments: async (filter) => docs.filter(doc => matches(doc, filter)).length,
    create: async (doc) => {
      docs.push({ ...doc });
      return { ...doc };
    },
    findOneAndUpdate: (filter, update, options = {}) => query(() => {
      let doc = docs.find(candidate => matches(candidate, filter));
      if (!doc) {
        if (!options.upsert) return [];
        doc = { ...filter };
        docs.push(doc);
        Object.assign(doc, update.$setOnInsert || {});
      }
      apply(doc, update);
      return [doc];
    }, { single: true }),
    updateOne: async (filter, update) => {
      const doc = docs.find(candidate => matches(candidate, filter));
      if (doc) apply(doc, update);
      return { matchedCount: doc ? 1 : 0, modifiedCount: doc ? 1 : 0 };
    },
    updateMany: async (filter, update) => {
      const matched = docs.filter(doc => matches(doc, filter));
      matched.forEach(doc => apply(doc, update));
      return { matchedCount: matched.length, modifiedCount: matched.length };
    },
    deleteOne: async (filter) => {
      const index = docs.findIndex(doc => matches(doc, filter));
      if (index !== -1) docs.splice(index, 1);
      return { deletedCount: index === -1 ? 0 : 1 };
    },
    // Supports the updateOne operations the sync and backfill scripts send.
    bulkWrite: async (operations) => {
      let upsertedCount = 0;
      let modifiedCount = 0;
      for (const { updateOne } of operations) {
        const doc = docs.find(candidate => matches(candidate, updateOne.filter));
        if (doc) {
          if (updateOne.update.$set) {
            apply(doc, updateOne.update);
            modifiedCount++;
          }
        } else if (updateOne.upsert) {
          docs.push({ ...updateOne.filter, ...(updateOne.update.$setOnInsert || {}), ...(updateOne.update.$set || {}) });
          upsertedCount++;
        }
      }
      return { upsertedCount, modifiedCount };
    },
    deleteMany: async (filter) => {
      const before = docs.length;
      for (let index = docs.length - 1; index >= 0; index--) {
        if (matches(docs[index], filter)) docs.splice(index, 1);
      }
      return { deletedCount: before - docs.length };
    }
  });
  return docs;
}

/** Starts an Express app on a free port and returns a request helper; call close() when done. */
async function serve(app) {
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  // Uses http directly: fetch adds Cache-Control: no-cache to conditional requests, which hides 304s.
  const request = (path, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body));
    const req = http.request(base + path, {
      method,
      headers: payload === undefined ? headers : { 'Content-Type': 'application/json', ...headers }
    }, (res) => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => {
        let json;
        try { json = JSON.parse(text); } catch { json = undefined; }
        resolve({ status: res.statusCode, headers: res.headers, text, body: json });
      });
    });
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });

  return { request, close: () => new Promise(resolve => server.close(resolve)) };
}

/**
 * Makes Clerk's SDK verify session tokens against a local key (CLERK_JWT_KEY), so sign-in is checked by
 * Clerk's real code without network access. Call before requiring the auth middleware. Returns a function
 * that signs a session token; pass `key` to sign with a different (untrusted) key.
 */
function clerkTestTokens() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.CLERK_PUBLISHABLE_KEY = 'pk_live_Y2xlcmsud2F0ZXItd2F5cy5jYSQ';
  process.env.CLERK_SECRET_KEY = 'sk_live_test_only';
  process.env.CLERK_JWT_KEY = publicKey.export({ type: 'spki', format: 'pem' });

  return function sessionToken(claims = {}, key = privateKey) {
    const now = Math.floor(Date.now() / 1000);
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
      iss: 'https://clerk.water-ways.ca', sub: 'user_a', sid: 'sess_1', iat: now - 5, nbf: now - 5, exp: now + 60, ...claims
    })}`;
    return `${unsigned}.${crypto.sign('RSA-SHA256', Buffer.from(unsigned), key).toString('base64url')}`;
  };
}

const bearer = token => ({ Authorization: `Bearer ${token}` });

module.exports = { bearer, clerkTestTokens, fakeModel, serve };
