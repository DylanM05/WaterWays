const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Environment, SignedDataVerifier } = require('@apple/app-store-server-library');
const AppleSubscription = require('../models/AppleSubscription');
const AppleSubscriptionAccount = require('../models/AppleSubscriptionAccount');

const DEFAULT_PRODUCT_IDS = [
  'ca.waterways.native.premium.monthly',
  'ca.waterways.native.premium.annual'
];

function allowedProductIds() {
  return (process.env.APPLE_SUBSCRIPTION_PRODUCT_IDS || DEFAULT_PRODUCT_IDS.join(','))
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

async function getOrCreateAccount(userId) {
  let account = await AppleSubscriptionAccount.findOne({ userId });
  if (account) return account;

  try {
    account = await AppleSubscriptionAccount.create({
      userId,
      appAccountToken: crypto.randomUUID()
    });
    return account;
  } catch (error) {
    if (error.code !== 11000) throw error;
    return AppleSubscriptionAccount.findOne({ userId });
  }
}

// Apple's public root certificate ships with the server; APPLE_ROOT_CA_PATH can override it.
const DEFAULT_ROOT_CA_PATH = path.join(__dirname, '..', 'certs', 'AppleRootCA-G3.cer');
let cachedVerifiers;

/**
 * Builds one verifier per environment Apple may sign for. The library does not check signatures for
 * Xcode and local-testing transactions, so those are only accepted when explicitly enabled for local
 * development; otherwise anyone could forge a transaction and grant themselves premium.
 */
function createVerifiers() {
  if (cachedVerifiers) return cachedVerifiers;

  const rootPath = process.env.APPLE_ROOT_CA_PATH || DEFAULT_ROOT_CA_PATH;
  const rootCertificate = fs.readFileSync(path.isAbsolute(rootPath) ? rootPath : path.resolve(process.cwd(), rootPath));
  const bundleId = process.env.APPLE_BUNDLE_ID || 'ca.waterways.native';
  const appAppleId = process.env.APPLE_APP_ID ? Number(process.env.APPLE_APP_ID) : undefined;
  const allowUnsignedTesting = AppleSubscription.allowsUnsignedTesting();

  const environments = [Environment.SANDBOX];
  if (Number.isInteger(appAppleId)) {
    environments.push(Environment.PRODUCTION);
  } else {
    console.error('APPLE_APP_ID is not set; App Store (production) purchases will be rejected until it is configured.');
  }
  if (allowUnsignedTesting) {
    console.warn('APPLE_ALLOW_UNSIGNED_TESTING is enabled; unsigned Xcode StoreKit transactions are accepted.');
    environments.push(Environment.XCODE, Environment.LOCAL_TESTING);
  }

  cachedVerifiers = environments.map(environment => new SignedDataVerifier(
    [rootCertificate],
    true,
    environment,
    bundleId,
    environment === Environment.PRODUCTION ? appAppleId : undefined
  ));
  return cachedVerifiers;
}

async function verifyWithAnyEnvironment(verify) {
  let lastError;
  for (const verifier of createVerifiers()) {
    try {
      return await verify(verifier);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('No Apple verifier is configured');
}

function verifyTransaction(signedTransaction) {
  return verifyWithAnyEnvironment(verifier => verifier.verifyAndDecodeTransaction(signedTransaction));
}

async function persistVerifiedTransaction(transaction, userId, account) {
  if (!account || transaction.appAccountToken?.toLowerCase() !== account.appAccountToken.toLowerCase()) {
    throw new Error('Transaction app account token mismatch');
  }
  if (!allowedProductIds().includes(transaction.productId)) {
    throw new Error('Unrecognized Apple subscription product');
  }
  if (transaction.bundleId !== (process.env.APPLE_BUNDLE_ID || 'ca.waterways.native')) {
    throw new Error('Apple transaction bundle identifier mismatch');
  }
  if (!transaction.transactionId || !transaction.originalTransactionId) {
    throw new Error('Apple transaction is missing required identifiers');
  }

  const existingOwner = await AppleSubscription.findOne({ originalTransactionId: transaction.originalTransactionId });
  if (existingOwner && existingOwner.userId !== userId) {
    throw new Error('Apple subscription is linked to another WaterWays account');
  }

  const existingTransaction = await AppleSubscription.findOne({ transactionId: transaction.transactionId });
  if (existingTransaction && existingTransaction.userId !== userId) {
    throw new Error('Apple transaction is linked to another WaterWays account');
  }

  const expiresAt = transaction.expiresDate ? new Date(transaction.expiresDate) : null;
  const revocationDate = transaction.revocationDate ? new Date(transaction.revocationDate) : null;
  const purchaseDate = transaction.purchaseDate ? new Date(transaction.purchaseDate) : null;
  // Apple keeps one original transaction ID per subscriber, across renewals, plan changes and resubscribing
  // after a refund, so the newest purchase decides access, not the latest expiry. Updates to the stored
  // transaction itself (such as its refund) always apply; older transactions arriving late are ignored.
  const sameTransaction = existingOwner?.transactionId === transaction.transactionId;
  const newerPurchase = !existingOwner?.purchaseDate || (purchaseDate && purchaseDate > existingOwner.purchaseDate);
  const shouldApply = !existingOwner || sameTransaction || newerPurchase;

  if (shouldApply) {
    await AppleSubscription.findOneAndUpdate(
      { originalTransactionId: transaction.originalTransactionId },
      {
        $set: {
          userId,
          originalTransactionId: transaction.originalTransactionId,
          transactionId: transaction.transactionId,
          productId: transaction.productId,
          appAccountToken: account.appAccountToken,
          purchaseDate,
          expiresAt,
          revocationDate,
          environment: transaction.environment
        }
      },
      { upsert: true, new: true, runValidators: true }
    );
  }

  return shouldApply;
}

/**
 * Applies a refund to a subscription this user already owns. A refund can only remove access, so it is
 * accepted even when the transaction's app account token is missing (StoreKit testing omits it on refunds).
 */
async function revokeOwnedSubscription(transaction, userId) {
  if (!transaction.revocationDate || !transaction.originalTransactionId) return false;
  // Match the exact transaction so a late refund of an older purchase can't revoke a newer one.
  const result = await AppleSubscription.updateOne(
    { originalTransactionId: transaction.originalTransactionId, transactionId: transaction.transactionId, userId },
    { $set: { revocationDate: new Date(transaction.revocationDate) } }
  );
  return result.matchedCount > 0;
}

exports.handleServerNotification = async (req, res) => {
  try {
    const signedPayload = req.body?.signedPayload;
    if (typeof signedPayload !== 'string') {
      return res.status(400).json({ error: 'Apple signedPayload is required' });
    }

    const notification = await verifyNotification(signedPayload);
    const signedTransaction = notification.data?.signedTransactionInfo;
    if (!signedTransaction) return res.status(200).json({ received: true });

    const transaction = await verifyTransaction(signedTransaction);
    const account = transaction.appAccountToken
      ? await AppleSubscriptionAccount.findOne({ appAccountToken: transaction.appAccountToken.toLowerCase() })
      : null;
    if (!account) {
      const owner = await AppleSubscription.findOne({ originalTransactionId: transaction.originalTransactionId }).lean();
      if (owner) await revokeOwnedSubscription(transaction, owner.userId);
      return res.status(200).json({ received: true });
    }

    await persistVerifiedTransaction(transaction, account.userId, account);

    // Tracks whether the subscriber turned off auto-renew, so the app can show "access through" instead of "renews".
    const signedRenewalInfo = notification.data?.signedRenewalInfo;
    if (signedRenewalInfo) {
      const renewalInfo = await verifyWithAnyEnvironment(verifier => verifier.verifyAndDecodeRenewalInfo(signedRenewalInfo));
      if (renewalInfo.originalTransactionId === transaction.originalTransactionId && typeof renewalInfo.autoRenewStatus === 'number') {
        await AppleSubscription.updateOne(
          { originalTransactionId: transaction.originalTransactionId, userId: account.userId },
          { $set: { autoRenewEnabled: renewalInfo.autoRenewStatus === 1 } }
        );
      }
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Apple server notification verification failed:', error);
    return res.status(400).json({ error: 'Apple notification could not be verified' });
  }
};

function verifyNotification(signedPayload) {
  return verifyWithAnyEnvironment(verifier => verifier.verifyAndDecodeNotification(signedPayload));
}

exports.getAccountToken = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });

    const account = await getOrCreateAccount(userId);
    return res.json({ appAccountToken: account.appAccountToken });
  } catch (error) {
    console.error('Failed to create Apple account token:', error);
    return res.status(500).json({ error: 'Failed to prepare Apple subscription account' });
  }
};

exports.verifyTransaction = async (req, res) => {
  try {
    const userId = req.userId;
    const signedTransaction = req.body?.signedTransaction;
    if (!userId) return res.status(401).json({ error: 'Authentication required' });
    if (typeof signedTransaction !== 'string' || signedTransaction.length > 30000) {
      return res.status(400).json({ error: 'A valid signed transaction is required' });
    }

    const transaction = await verifyTransaction(signedTransaction);
    const account = await AppleSubscriptionAccount.findOne({ userId });
    if (!account || transaction.appAccountToken?.toLowerCase() !== account.appAccountToken.toLowerCase()) {
      if (await revokeOwnedSubscription(transaction, userId)) {
        return res.json({ success: true, productId: transaction.productId, revoked: true });
      }
      console.warn(
        `Rejected Apple transaction ${transaction.originalTransactionId} (${transaction.environment}) for ${userId}: ` +
        `app account token ${transaction.appAccountToken ? 'belongs to another account' : 'missing'}`
      );
      return res.status(403).json({ error: 'Transaction does not belong to this app account' });
    }
    try {
      await persistVerifiedTransaction(transaction, userId, account);
    } catch (error) {
      if (/another WaterWays account/.test(error.message)) {
        return res.status(409).json({ error: error.message });
      }
      const detail = error.code === 11000
        ? 'transaction ID is already stored for a different subscription (Xcode reuses IDs after test transactions are deleted)'
        : error.message;
      console.warn(`Could not store Apple transaction ${transaction.transactionId} (${transaction.environment}) for ${userId}: ${detail}`);
      return res.status(400).json({ error: 'Apple transaction could not be stored' });
    }

    return res.json({ success: true, productId: transaction.productId });
  } catch (error) {
    console.error('Apple transaction verification failed:', error);
    return res.status(400).json({ error: 'Apple transaction could not be verified' });
  }
};
