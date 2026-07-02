/*
 * metrics.js — Read-only metrics endpoints.
 * Used by the performance dashboard (Day 21) and
 * by the experiment scripts (Days 25-26).
 */
const express = require('express');
const { SessionMetrics } = require('../models');

const router = express.Router();

function average(values) {
  if (!values || values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function sum(values) {
  if (!values || values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0);
}

function percentile(values, p) {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[index];
}

function latencyStats(values) {
  return {
    avg: Math.round(average(values)),
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0,
    p95: percentile(values, 0.95),
    count: values.length,
  };
}

// GET /api/metrics/compare?roomId1=X&roomId2=Y
// Registered before /:roomId so Express doesn't treat "compare" as a roomId.
router.get('/compare', async (req, res) => {
  const { roomId1, roomId2 } = req.query;
  if (!roomId1 || !roomId2) {
    return res.status(400).json({ success: false, error: 'roomId1 and roomId2 query params are required' });
  }

  const metrics1 = await SessionMetrics.findOne({ roomId: roomId1 }).sort({ startedAt: -1 });
  const metrics2 = await SessionMetrics.findOne({ roomId: roomId2 }).sort({ startedAt: -1 });

  if (!metrics1 || !metrics2) {
    return res.status(404).json({ success: false, error: 'One or both sessions not found' });
  }

  function summarize(m) {
    const syncValues = m.syncLatencies.map((l) => l.value);
    const bwValues = m.bandwidthPerEdit.map((b) => b.bytes);
    const inputLossRate = m.revisionCount > 0 ? Number(((m.inputLossEvents.length / m.revisionCount) * 100).toFixed(2)) : 0;
    return {
      syncMode: m.syncMode,
      conflictCount: m.conflictCount,
      inputLossRate,
      avgLatency: Math.round(average(syncValues)),
      totalBandwidth: sum(bwValues),
    };
  }

  const session1 = summarize(metrics1);
  const session2 = summarize(metrics2);

  const conflictReduction =
    session1.conflictCount > 0
      ? (((session1.conflictCount - session2.conflictCount) / session1.conflictCount) * 100).toFixed(1) + '%'
      : '0.0%';
  const latencyDiff = (session1.avgLatency - session2.avgLatency).toFixed(1) + 'ms';
  const bandwidthReduction =
    session1.totalBandwidth > 0
      ? (((session1.totalBandwidth - session2.totalBandwidth) / session1.totalBandwidth) * 100).toFixed(1) + '%'
      : '0.0%';

  res.status(200).json({
    success: true,
    data: {
      session1,
      session2,
      improvement: {
        conflictReduction,
        latencyDiff,
        bandwidthReduction,
      },
    },
  });
});

// GET /api/metrics/:roomId
router.get('/:roomId', async (req, res) => {
  const { roomId } = req.params;

  let metrics = await SessionMetrics.findOne({ roomId, endedAt: null }).sort({ startedAt: -1 });
  if (!metrics) {
    metrics = await SessionMetrics.findOne({ roomId }).sort({ endedAt: -1 });
  }
  if (!metrics) {
    return res.status(404).json({ success: false, error: 'No metrics found for this room' });
  }

  const syncValues = metrics.syncLatencies.map((l) => l.value);
  const rtValues = metrics.roundTripLatencies.map((l) => l.value);
  const bwValues = metrics.bandwidthPerEdit.map((b) => b.bytes);
  const deltaValues = metrics.bandwidthPerEdit.map((b) => b.deltaApprox).filter((v) => v !== undefined);

  const sessionDuration = metrics.endedAt
    ? metrics.endedAt.getTime() - metrics.startedAt.getTime()
    : Date.now() - metrics.startedAt.getTime();

  const inputLossCount = metrics.inputLossEvents.length;
  const inputLossRate = metrics.revisionCount > 0 ? Number(((inputLossCount / metrics.revisionCount) * 100).toFixed(2)) : 0;

  res.status(200).json({
    success: true,
    data: {
      roomId: metrics.roomId,
      syncMode: metrics.syncMode,
      sessionDuration,
      revisionCount: metrics.revisionCount,
      conflictCount: metrics.conflictCount,
      inputLossCount,
      inputLossRate,
      syncLatency: latencyStats(syncValues),
      roundTripLatency: latencyStats(rtValues),
      bandwidth: {
        totalBytes: sum(bwValues),
        avgBytesPerEdit: Math.round(average(bwValues)),
        totalDeltaApprox: sum(deltaValues),
        editCount: metrics.bandwidthPerEdit.length,
      },
      concurrentUsers: {
        peak: metrics.peakConcurrentUsers,
        timeline: metrics.concurrentUsersOverTime.slice(-50),
      },
    },
  });
});

module.exports = router;
