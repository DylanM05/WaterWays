// Scripts print which database they are about to write to. Only the host(s) and database name are shown:
// the username, password and options in the connection string never are.

/** "host[,host2]/database" from a mongodb:// or mongodb+srv:// URI; "test" is the driver's default database. */
function describeMongoTarget(uri) {
    const match = /^mongodb(?:\+srv)?:\/\/(.*)$/.exec(String(uri ?? ''));
    if (!match) return 'an unrecognised MongoDB URI';
    // The credentials end at the last "@" (passwords are URL-encoded, but don't rely on it).
    const rest = match[1].split('?')[0];
    const address = rest.slice(rest.lastIndexOf('@') + 1);
    const slash = address.indexOf('/');
    const hosts = slash === -1 ? address : address.slice(0, slash);
    const database = slash === -1 ? '' : address.slice(slash + 1);
    return `${hosts || 'unknown host'}/${database || 'test'}`;
}

/** Prints the target before a script writes, so a run against the wrong database is noticed. */
function logMongoTarget(uri, { apply = true } = {}) {
    console.log(`Database: ${describeMongoTarget(uri)}${apply ? '' : ' (dry run; nothing will be written)'}`);
}

module.exports = { describeMongoTarget, logMongoTarget };
