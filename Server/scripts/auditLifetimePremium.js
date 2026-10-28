require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const InviteLink = require('../models/InviteLink');
const LifetimePremium = require('../models/LifetimePremium');

// Until the invite routes required an admin, any signed-in user could create an invite link and redeem it
// for lifetime premium. This lists grants and invite links that didn't come from an admin. Read-only.

async function findNonAdminGrants() {
    const admins = new Set((await Admin.find({ status: true }).select('userId').lean()).map(admin => admin.userId));
    const grants = await LifetimePremium.find().sort({ grantedAt: 1 }).lean();
    const invites = await InviteLink.find().sort({ createdAt: 1 }).lean();
    return {
        admins,
        grants,
        invites,
        suspiciousGrants: grants.filter(grant => !admins.has(grant.grantedBy)),
        suspiciousInvites: invites.filter(invite => !admins.has(invite.createdBy))
    };
}

async function main() {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('Set MONGO_URI or MONGODB_URI before running the audit.');
    await mongoose.connect(mongoUri);

    const { admins, grants, invites, suspiciousGrants, suspiciousInvites } = await findNonAdminGrants();

    console.log(`Admins: ${admins.size}. Lifetime grants: ${grants.length}. Invite links (unexpired): ${invites.length}.`);
    console.log(`\nLifetime grants not made by an admin: ${suspiciousGrants.length}`);
    for (const grant of suspiciousGrants) {
        const selfGranted = grant.grantedBy === grant.userId ? ' (granted to themselves)' : '';
        console.log(`  user ${grant.userId}, granted by ${grant.grantedBy}${selfGranted}, code ${grant.inviteCode}, ${grant.grantedAt?.toISOString?.() ?? 'unknown date'}`);
    }
    console.log(`\nInvite links not created by an admin: ${suspiciousInvites.length}`);
    for (const invite of suspiciousInvites) {
        console.log(`  code ${invite.code}, created by ${invite.createdBy}, ${invite.isRedeemed ? `redeemed by ${invite.redeemedBy}` : 'not redeemed'}`);
    }
    if (!suspiciousGrants.length && !suspiciousInvites.length) console.log('\nNothing to clean up.');
}

if (require.main === module) {
    main()
        .catch(error => {
            console.error(`Audit failed: ${error.message}`);
            process.exitCode = 1;
        })
        .finally(() => mongoose.disconnect());
}

module.exports = { findNonAdminGrants };
