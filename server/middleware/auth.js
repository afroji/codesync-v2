/*
 * auth.js — JWT verification middleware.
 * Attaches req.user to every protected route.
 * Also exports optionalAuth — attaches user if token
 * exists but does not block anonymous requests.
 */
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/constants');
const { User } = require('../models');

function getTokenFromHeader(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.split(' ')[1];
}

async function protect(req, res, next) {
  try {
    const token = getTokenFromHeader(req);
    if (!token) {
      return res.status(401).json({ success: false, error: 'No token' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select('-passwordHash');

    if (!user) {
      return res.status(401).json({ success: false, error: 'User no longer exists' });
    }

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ success: false, error: 'Not authorized' });
  }
}

async function optionalAuth(req, res, next) {
  try {
    const token = getTokenFromHeader(req);
    if (!token) return next();

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select('-passwordHash');

    if (user) req.user = user;
    next();
  } catch (err) {
    next();
  }
}

module.exports = { protect, optionalAuth };
