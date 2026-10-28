const Sentry = require('@sentry/node');

// Errors are reported to Sentry when SENTRY_DSN is set; without it, nothing is sent anywhere.
const enabled = Boolean(process.env.SENTRY_DSN);

if (enabled) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    // Controllers catch their own errors and log them with console.error, so those logs are the reports.
    // An Error among the logged values is reported with its stack trace.
    integrations: [Sentry.captureConsoleIntegration({ levels: ['error'] })],
    // Errors only; no performance tracing.
    tracesSampleRate: 0,
    sendDefaultPii: false
  });
}

/** Reports an error message logged outside console.error (the winston logger). */
function reportError(message) {
  if (enabled) Sentry.captureMessage(String(message), 'error');
}

module.exports = { Sentry, enabled, reportError };
