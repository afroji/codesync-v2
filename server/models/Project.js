/*
 * Project — a saved coding project belonging to an auth user.
 * Anonymous rooms are NOT stored here — they live in Room.
 * When an auth user saves a room, it becomes a Project.
 */
const mongoose = require('mongoose');

const LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'java',
  'c',
  'cpp',
  'html',
  'css',
  'json',
  'markdown',
  'plaintext',
];

const fileSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    path: { type: String, required: true },
    language: { type: String, enum: LANGUAGES, required: true },
    content: { type: String, default: '' },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const snapshotSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true },
    files: [fileSchema],
    savedAt: { type: Date, default: Date.now },
    description: { type: String, default: '' },
  },
  { _id: false }
);

const projectSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxLength: 100 },
    description: { type: String, trim: true, maxLength: 300 },
    files: [fileSchema],
    language: { type: String, enum: LANGUAGES, default: 'javascript' },
    roomId: { type: String },
    isPublic: { type: Boolean, default: false },
    snapshots: [snapshotSchema],
    lastActivity: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

projectSchema.virtual('fileCount').get(function () {
  return this.files.length;
});

projectSchema.index({ owner: 1 });
projectSchema.index({ roomId: 1 });

projectSchema.pre('save', function (next) {
  if (this.files.length === 0) {
    this.files.push({ name: 'main.js', path: '/main.js', language: 'javascript', content: '' });
  }
  next();
});

projectSchema.set('toJSON', { virtuals: true });
projectSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Project', projectSchema);
