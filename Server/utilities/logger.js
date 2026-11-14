const winston = require('winston');
const path = require('path');
const fs = require('fs');
const { reportError } = require('./monitoring');

const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp }) => {
    return `${timestamp} ${level}: ${message}`;
  })
);

// Sends logged errors (from the scheduler and scripts) to error monitoring.
class ErrorReportingTransport extends winston.Transport {
  log(info, callback) {
    reportError(info.message);
    callback();
  }
}

// Each file rolls over at 5 MB and keeps 5 files; tailable keeps the newest in error.log / combined.log.
const rotation = { maxsize: 5 * 1024 * 1024, maxFiles: 5, tailable: true };

const logger = winston.createLogger({
  level: 'info',
  format: logFormat,
  transports: [
    // Write all errors to error.log
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error',
      ...rotation
    }),
    // Write all logs to combined.log
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log'),
      ...rotation
    }),
    // Also log to console in development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    }),
    new ErrorReportingTransport({ level: 'error' })
  ],
});

module.exports = logger;