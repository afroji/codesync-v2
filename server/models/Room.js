/*
 * Room — an active collaboration session.
 * Anonymous rooms expire after 24h via TTL index.
 * Auth rooms have expiresAt: null and never expire.
 * This is the real-time state of who is in the room
 * and what files they are editing.
 */
const mongoose = require('mongoose');
const { SYNC_MODE } = require('../config/constants');

const CHAT_MESSAGE_LIMIT = 200;

const memberSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    name: { type: String, required: true },
    color: { type: String },
    isAnonymous: { type: Boolean, default: true },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const fileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    language: { type: String, required: true },
    content: { type: String, default: '' },
  },
  { _id: false }
);

const chatMessageSchema = new mongoose.Schema(
  {
    userId: { type: String },
    name: { type: String },
    color: { type: String },
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const roomSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, unique: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isAnonymous: { type: Boolean, default: true },
    members: [memberSchema],
    files: {
      type: [fileSchema],
      default: () => [{ name: 'main.js', language: 'javascript', content: '' }],
    },
    activeFile: { type: String, default: 'main.js' },
    language: { type: String, default: 'javascript' },
    chat: [chatMessageSchema],
    expiresAt: { type: Date, default: null },
    syncMode: { type: String, enum: ['crdt', 'naive'], default: SYNC_MODE },
  },
  { timestamps: true }
);

roomSchema.pre('save', function (next) {
  if (this.chat.length > CHAT_MESSAGE_LIMIT) {
    this.chat = this.chat.slice(this.chat.length - CHAT_MESSAGE_LIMIT);
  }
  next();
});

roomSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

module.exports = mongoose.model('Room', roomSchema);
