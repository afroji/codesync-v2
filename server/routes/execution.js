/*
 * execution.js — Code execution endpoint.
 * POST /api/execute
 *
 * Does NOT require auth — anonymous users can run code.
 * Rate limited to prevent abuse (basic in-memory limiting).
 */

const express = require('express');
const router = express.Router();
const { executeCode } = require('../services/piston');
const { SessionMetrics } = require('../models');

// Simple in-memory rate limiter — max 10 executions per IP per minute.
const rateLimitMap = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 10;

  const requests = (rateLimitMap.get(ip) || []).filter((t) => now - t < windowMs);

  if (requests.length >= maxRequests) {
    return res.status(429).json({
      success: false,
      error: 'Too many execution requests. Please wait a moment before running again.',
    });
  }

  requests.push(now);
  rateLimitMap.set(ip, requests);
  next();
}

// Clean up rate limit map periodically so it doesn't grow unbounded over
// a long-running server process.
setInterval(() => {
  const now = Date.now();
  rateLimitMap.forEach((times, ip) => {
    const valid = times.filter((t) => now - t < 60000);
    if (valid.length === 0) rateLimitMap.delete(ip);
    else rateLimitMap.set(ip, valid);
  });
}, 60000);

// Defense-in-depth only — Piston/JDoodle both run code in their own
// sandboxed containers, which is the actual security boundary. Scoped to
// just the require('child_process') form (the one unambiguous signal of
// intent to escape the sandbox from Node) rather than also matching bare
// exec(/spawn(/process.exit — those false-positive on completely benign
// code (e.g. RegExp.prototype.exec(), a local function named spawn, or a
// script that legitimately calls process.exit()), which would silently
// block valid demo code for no real security benefit.
const DANGEROUS_PATTERN = /require\s*\(\s*['"]child_process['"]\s*\)/;

router.post('/', rateLimit, async (req, res) => {
  const { code, language, stdin, roomId } = req.body;

  if (!code) {
    return res.status(400).json({ success: false, error: 'No code provided' });
  }
  if (!language) {
    return res.status(400).json({ success: false, error: 'No language specified' });
  }

  if (language === 'javascript' && DANGEROUS_PATTERN.test(code)) {
    return res.status(400).json({ success: false, error: 'Code contains potentially unsafe patterns' });
  }

  const startTime = Date.now();
  const result = await executeCode(code, language, stdin || '');
  const durationMs = Date.now() - startTime;

  // Record execution latency to SessionMetrics if roomId given — fire and
  // forget, same pattern as every other metrics write in this codebase
  // (a failed metrics write must never fail the actual user-facing action).
  if (roomId) {
    SessionMetrics.findOneAndUpdate(
      { roomId, endedAt: null },
      { $push: { execLatencies: { value: durationMs, timestamp: new Date(), language } } }
    ).catch((err) => console.error('execLatencies write error:', err.message));
  }

  return res.status(200).json({
    success: true,
    data: { ...result, durationMs },
  });
});

module.exports = router;
