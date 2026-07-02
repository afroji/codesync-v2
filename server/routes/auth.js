/*
 * auth.js — Authentication routes:
 * POST /api/auth/register
 * POST /api/auth/login
 * GET  /api/auth/me
 * GET  /api/auth/google
 * GET  /api/auth/google/callback
 * POST /api/auth/logout (client-side only, but acknowledge it)
 */
const express = require('express');
const passport = require('passport');
const { User, Project } = require('../models');
const generateToken = require('../utils/generateToken');
const { protect } = require('../middleware/auth');
const { CLIENT_URL } = require('../config/constants');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, error: 'Name, email, and password are required' });
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ success: false, error: 'Invalid email address' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return res.status(400).json({ success: false, error: 'Email already registered' });
  }

  const user = await User.create({
    name,
    email,
    provider: 'local',
    passwordHash: password,
  });

  const token = generateToken(user._id);
  res.status(201).json({ success: true, data: { user, token } });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  // passwordHash has no `select: false` in the schema, so it's already
  // present on the fetched document — toJSON only strips it on serialization.
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return res.status(401).json({ success: false, error: 'Invalid email or password' });
  }
  if (user.provider !== 'local') {
    return res.status(401).json({ success: false, error: 'Please log in with Google' });
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return res.status(401).json({ success: false, error: 'Invalid email or password' });
  }

  user.lastSeen = Date.now();
  await user.save();

  const token = generateToken(user._id);
  res.status(200).json({ success: true, data: { user, token } });
});

// GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  const projectCount = await Project.countDocuments({ owner: req.user._id });
  res.status(200).json({ success: true, data: { user: req.user, projectCount } });
});

// GET /api/auth/google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

// GET /api/auth/google/callback
router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${CLIENT_URL}/login?error=oauth_failed`,
  }),
  (req, res) => {
    if (!req.user) {
      return res.redirect(`${CLIENT_URL}/login?error=account_exists`);
    }
    const token = generateToken(req.user._id);
    res.redirect(`${CLIENT_URL}/oauth?token=${token}&user=${encodeURIComponent(JSON.stringify(req.user))}`);
  }
);

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.status(200).json({ success: true, message: 'Logged out' });
});

module.exports = router;
