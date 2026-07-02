/*
 * SessionMetrics — research data collected per room session.
 * THIS IS THE MOST IMPORTANT MODEL FOR THE PAPER.
 * Every sync event, conflict, and bandwidth measurement
 * is recorded here. Days 25-26 query this to generate
 * the paper's experimental results.
 */
const mongoose = require('mongoose');

const syncLatencySchema = new mongoose.Schema(
  {
    value: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now },
    userCount: { type: Number, default: 0 },
    roundTripLatency: { type: Number },
  },
  { _id: false }
);

const roundTripLatencySchema = new mongoose.Schema(
  {
    value: { type: Number, required: true },
    oneWayValue: { type: Number },
    timestamp: { type: Date, default: Date.now },
    userCount: { type: Number, default: 0 },
    syncMode: { type: String, enum: ['crdt', 'naive'] },
  },
  { _id: false }
);

const concurrentUsersSchema = new mongoose.Schema(
  {
    count: { type: Number, required: true },
    event: { type: String, enum: ['join', 'leave'] },
    userName: { type: String },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const editHistorySchema = new mongoose.Schema(
  {
    userId: { type: String },
    fileName: { type: String },
    bytesChanged: { type: Number },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const bandwidthPerEditSchema = new mongoose.Schema(
  {
    bytes: { type: Number },
    deltaApprox: { type: Number },
    timestamp: { type: Date, default: Date.now },
    syncMode: { type: String, enum: ['crdt', 'naive'] },
  },
  { _id: false }
);

const inputLossEventSchema = new mongoose.Schema(
  {
    userId: { type: String },
    timestamp: { type: Date, default: Date.now },
    detail: { type: String },
  },
  { _id: false }
);

const execLatencySchema = new mongoose.Schema(
  {
    value: { type: Number, required: true }, // ms, wall-clock POST /api/execute -> response
    timestamp: { type: Date, default: Date.now },
    language: { type: String },
  },
  { _id: false }
);

const sessionMetricsSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true },
    syncMode: { type: String, enum: ['crdt', 'naive'], required: true },
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date },
    syncLatencies: [syncLatencySchema],
    roundTripLatencies: [roundTripLatencySchema],
    conflictCount: { type: Number, default: 0 },
    revisionCount: { type: Number, default: 0 },
    concurrentUsersOverTime: [concurrentUsersSchema],
    editHistory: [editHistorySchema],
    bandwidthPerEdit: [bandwidthPerEditSchema],
    inputLossEvents: [inputLossEventSchema],
    execLatencies: [execLatencySchema],
  },
  { timestamps: true }
);

sessionMetricsSchema.virtual('averageSyncLatency').get(function () {
  if (!this.syncLatencies || this.syncLatencies.length === 0) return 0;
  const sum = this.syncLatencies.reduce((acc, entry) => acc + entry.value, 0);
  return sum / this.syncLatencies.length;
});

sessionMetricsSchema.virtual('peakConcurrentUsers').get(function () {
  if (!this.concurrentUsersOverTime || this.concurrentUsersOverTime.length === 0) return 0;
  return Math.max(...this.concurrentUsersOverTime.map((entry) => entry.count));
});

sessionMetricsSchema.virtual('totalInputLoss').get(function () {
  return this.inputLossEvents.length;
});

sessionMetricsSchema.virtual('averageRoundTripLatency').get(function () {
  if (!this.roundTripLatencies || this.roundTripLatencies.length === 0) return 0;
  const sum = this.roundTripLatencies.reduce((acc, entry) => acc + entry.value, 0);
  return sum / this.roundTripLatencies.length;
});

sessionMetricsSchema.virtual('p95SyncLatency').get(function () {
  if (!this.syncLatencies || this.syncLatencies.length === 0) return 0;
  const sorted = this.syncLatencies.map((entry) => entry.value).sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length));
  return sorted[index];
});

sessionMetricsSchema.index({ roomId: 1 });
sessionMetricsSchema.index({ syncMode: 1 });
sessionMetricsSchema.index({ startedAt: 1 });

sessionMetricsSchema.set('toJSON', { virtuals: true });
sessionMetricsSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('SessionMetrics', sessionMetricsSchema);
