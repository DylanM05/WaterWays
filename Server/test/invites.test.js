// Invite links grant lifetime premium: only admins may create or list them, and each redeems once.
const { bearer, clerkTestTokens, fakeModel, serve } = require('./helpers');

const sessionToken = clerkTestTokens();

const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Admin = require('../models/Admin');
const InviteLink = require('../models/InviteLink');
const LifetimePremium = require('../models/LifetimePremium');

const CODE = 'a1b2c3d4e5f6';
const as = user => bearer(sessionToken({ sub: user }));

let api;
let invites;
let lifetime;

before(async () => {
  console.error = () => {};
  const app = express();
  app.use(express.json());
  app.use('/inv', require('../routes/inviteRoutes'));
  api = await serve(app);
});

after(() => api.close());

beforeEach(() => {
  fakeModel(Admin, [{ userId: 'user_admin', status: true }, { userId: 'user_former_admin', status: false }]);
  invites = fakeModel(InviteLink, [{ code: CODE, createdBy: 'user_admin', isRedeemed: false, redeemedBy: null }]);
  lifetime = fakeModel(LifetimePremium);
  InviteLink.create = async (doc) => {
    invites.push({ isRedeemed: false, redeemedBy: null, ...doc });
    return doc;
  };
});

test('only admins can create invite links', async () => {
  assert.equal((await api.request('/inv/generate', { method: 'POST' })).status, 401);
  assert.equal((await api.request('/inv/generate', { method: 'POST', headers: as('user_member') })).status, 403);
  assert.equal((await api.request('/inv/generate', { method: 'POST', headers: as('user_former_admin') })).status, 403);
  assert.equal(invites.length, 1);

  const created = await api.request('/inv/generate', { method: 'POST', headers: as('user_admin') });
  assert.equal(created.status, 200);
  assert.equal(invites.length, 2);
  assert.equal(invites[1].createdBy, 'user_admin');
});

test('only admins can list invite links', async () => {
  assert.equal((await api.request('/inv/list', { headers: as('user_member') })).status, 403);
  const listed = await api.request('/inv/list', { headers: as('user_admin') });
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.inviteLinks.map(invite => invite.code), [CODE]);
});

test('redeeming a code grants lifetime premium once', async () => {
  const redeemed = await api.request('/inv/redeem', { method: 'POST', headers: as('user_member'), body: { code: CODE } });
  assert.equal(redeemed.status, 200);
  assert.deepEqual(lifetime.map(grant => [grant.userId, grant.grantedBy]), [['user_member', 'user_admin']]);
  assert.equal(invites[0].redeemedBy, 'user_member');

  const again = await api.request('/inv/redeem', { method: 'POST', headers: as('user_other'), body: { code: CODE } });
  assert.equal(again.status, 404);
  assert.equal(lifetime.length, 1);
});

test('two people redeeming the same code at once: only one succeeds', async () => {
  const [first, second] = await Promise.all(['user_one', 'user_two'].map(user =>
    api.request('/inv/redeem', { method: 'POST', headers: as(user), body: { code: CODE } })));
  assert.deepEqual([first.status, second.status].sort(), [200, 404]);
  assert.equal(lifetime.length, 1);
});

test('signed-out requests cannot use up a code', async () => {
  assert.equal((await api.request('/inv/redeem', { method: 'POST', body: { code: CODE } })).status, 401);
  assert.equal(invites[0].isRedeemed, false);
});

test('existing lifetime members are turned away without using up the code', async () => {
  lifetime.push({ userId: 'user_member', grantedBy: 'user_admin', inviteCode: 'ffffffffffff' });
  const response = await api.request('/inv/redeem', { method: 'POST', headers: as('user_member'), body: { code: CODE } });
  assert.equal(response.status, 400);
  assert.equal(invites[0].isRedeemed, false);
});

test('a failed grant releases the code', async () => {
  LifetimePremium.create = async () => { throw new Error('database unavailable'); };
  const response = await api.request('/inv/redeem', { method: 'POST', headers: as('user_member'), body: { code: CODE } });
  assert.equal(response.status, 500);
  assert.equal(invites[0].isRedeemed, false);
  assert.equal(invites[0].redeemedBy, null);
});

test('malformed codes are rejected', async () => {
  const response = await api.request('/inv/redeem', { method: 'POST', headers: as('user_member'), body: { code: 'x'.repeat(12) } });
  assert.equal(response.status, 400);
});

test('the lifetime audit flags grants and invite links that did not come from an admin', async () => {
  const { findNonAdminGrants } = require('../scripts/auditLifetimePremium');
  invites.push({ code: 'bbbbbbbbbbbb', createdBy: 'user_member', isRedeemed: true, redeemedBy: 'user_member' });
  invites.push({ code: 'cccccccccccc', createdBy: 'user_former_admin', isRedeemed: false, redeemedBy: null });
  lifetime.push({ userId: 'user_friend', grantedBy: 'user_admin', inviteCode: CODE });
  lifetime.push({ userId: 'user_member', grantedBy: 'user_member', inviteCode: 'bbbbbbbbbbbb' });

  const { suspiciousGrants, suspiciousInvites } = await findNonAdminGrants();
  assert.deepEqual(suspiciousGrants.map(grant => grant.userId), ['user_member']);
  assert.deepEqual(suspiciousInvites.map(invite => invite.code).sort(), ['bbbbbbbbbbbb', 'cccccccccccc']);
});
