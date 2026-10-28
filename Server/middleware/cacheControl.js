// Lets browsers and the iOS app reuse a public response for `maxAgeSeconds` without asking the server.
// Only successful responses are marked cacheable, so a brief outage isn't remembered by clients.
// Client and server-side cache times add up, so data can be as old as both combined.
const cacheFor = (maxAgeSeconds) => (req, res, next) => {
  const writeHead = res.writeHead;
  res.writeHead = function (statusCode, ...args) {
    const succeeded = (statusCode >= 200 && statusCode < 300) || statusCode === 304;
    if (succeeded && !res.getHeader('Cache-Control')) {
      res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds}`);
    }
    return writeHead.call(this, statusCode, ...args);
  };
  next();
};

module.exports = { cacheFor };
