// Redis connection (ioredis). Redis being down should not crash the server.
const Redis = require('ioredis');
const { REDIS_URL } = require('./constants');

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 200, 5000),
});

redis.on('ready', () => {
  console.log('Redis connected');
});

redis.on('error', (err) => {
  console.error('Redis error:', err.message);
});

module.exports = redis;
