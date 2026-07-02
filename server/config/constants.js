// Central export of env vars with sensible fallbacks
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me_please_32chars';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
let CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
if (CLIENT_URL.endsWith('/')) {
  CLIENT_URL = CLIENT_URL.slice(0, -1);
}
const SYNC_MODE = process.env.SYNC_MODE || 'crdt';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/codesync';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';

let BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${PORT}`;
if (BACKEND_URL && !/^https?:\/\//i.test(BACKEND_URL)) {
  const isLocal = BACKEND_URL.includes('localhost') || BACKEND_URL.includes('127.0.0.1');
  BACKEND_URL = `${isLocal ? 'http' : 'https'}://${BACKEND_URL}`;
}
if (BACKEND_URL.endsWith('/')) {
  BACKEND_URL = BACKEND_URL.slice(0, -1);
}

if (JWT_SECRET.length < 32) {
  console.warn('WARNING: JWT_SECRET is shorter than 32 characters. Use a longer secret in production.');
}

module.exports = {
  PORT,
  NODE_ENV,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  CLIENT_URL,
  BACKEND_URL,
  SYNC_MODE,
  MONGODB_URI,
  REDIS_URL,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
};

