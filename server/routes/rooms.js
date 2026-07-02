/*
 * rooms.js — REST endpoints for room management.
 * Socket.IO handles real-time events.
 * REST handles room creation, fetching initial state,
 * and room metadata.
 */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { Room, SessionMetrics } = require('../models');
const { protect, optionalAuth } = require('../middleware/auth');
const { SYNC_MODE } = require('../config/constants');

const router = express.Router();

// POST /api/rooms
router.post('/', optionalAuth, async (req, res) => {
  const roomId = req.body.roomId || uuidv4();

  let room = await Room.findOne({ roomId });
  if (room) {
    return res.status(201).json({ success: true, data: { room } });
  }

  room = await Room.create({
    roomId,
    isAnonymous: !req.user,
    owner: req.user?._id || null,
    expiresAt: req.user ? null : new Date(Date.now() + 24 * 60 * 60 * 1000),
    syncMode: SYNC_MODE,
    files: [{ name: 'main.js', language: 'javascript', content: '' }],
  });

  await SessionMetrics.create({
    roomId,
    syncMode: SYNC_MODE,
    startedAt: new Date(),
  });

  res.status(201).json({ success: true, data: { room } });
});

// GET /api/rooms/:roomId
router.get('/:roomId', optionalAuth, async (req, res) => {
  const room = await Room.findOne({ roomId: req.params.roomId });
  if (!room) {
    return res.status(404).json({ success: false, error: 'Room not found' });
  }
  res.status(200).json({ success: true, data: { room } });
});

// DELETE /api/rooms/:roomId
router.delete('/:roomId', protect, async (req, res) => {
  const room = await Room.findOne({ roomId: req.params.roomId });
  if (!room) {
    return res.status(404).json({ success: false, error: 'Room not found' });
  }
  if (!room.owner || room.owner.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, error: 'Not authorized to close this room' });
  }

  await SessionMetrics.findOneAndUpdate({ roomId: room.roomId, endedAt: null }, { endedAt: new Date() });
  await Room.deleteOne({ roomId: room.roomId });

  res.status(200).json({ success: true });
});

module.exports = router;
