/*
 * experiment-crdt.js — Automated test for Experiment 2
 * (CRDT side). Run with SYNC_MODE=crdt.
 * Compare results with experiment-naive.js output via
 * GET /api/metrics/compare?roomId1=<naive>&roomId2=<crdt>
 */
const io = require('socket.io-client');
const { v4: uuidv4 } = require('uuid');
const Y = require('yjs');

const ROOM_ID = process.argv[2] || 'experiment-crdt-001';
const USER_COUNT = 5;
const EDITS_PER_USER = 200;
const EDIT_INTERVAL_MS = 20;
// Grace period after a user's last edit before disconnecting. Without this,
// a user that finishes typing slightly before the others tears its socket
// down while other users' updates are still in flight (sent but not yet
// received+applied) — those updates never arrive, and the final doc looks
// "diverged" per-client even though the CRDT merge itself is correct. This
// is a measurement artifact, not a sync bug — verified by re-running a small
// scale test with this same grace period, which converges perfectly.
const SETTLE_MS = 1500;
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const SAMPLE_CHARS = 'abcdefghijklmnopqrstuvwxyz(){}[];';

async function runUser(userId, userName, color) {
  return new Promise((resolve) => {
    const socket = io(SERVER_URL, {
      transports: ['websocket'],
    });
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText('content');
    let editCount = 0;
    let joinedRoom = false;

    // When local doc changes, send the Yjs update
    ydoc.on('update', (update, origin) => {
      if (origin === 'remote' || !joinedRoom) return;
      socket.emit('yjs_update', {
        roomId: ROOM_ID,
        userId,
        fileName: 'main.js',
        update: Array.from(update),
        timestamp: Date.now(),
        byteSize: update.byteLength,
      });
    });

    // Apply incoming Yjs updates from other clients
    socket.on('yjs_update', (data) => {
      if (data.userId === userId) return;
      const update = new Uint8Array(data.update);
      Y.applyUpdate(ydoc, update, 'remote');
    });

    socket.on('yjs_sync', (data) => {
      if (data.fileName !== 'main.js') return;
      const sv = new Uint8Array(data.stateVector);
      Y.applyUpdate(ydoc, sv, 'remote');
    });

    socket.on('connect', () => {
      socket.emit('join_room', {
        roomId: ROOM_ID,
        userId,
        name: userName,
        color,
        isAnonymous: true,
      });
    });

    socket.on('room_state', () => {
      joinedRoom = true;
      const interval = setInterval(() => {
        if (editCount >= EDITS_PER_USER) {
          clearInterval(interval);
          setTimeout(() => {
            socket.emit('leave_room', { roomId: ROOM_ID, userId });
            socket.disconnect();
            const finalLength = ytext.toString().length;
            ydoc.destroy();
            resolve({ userId, userName, edits: editCount, finalLength });
          }, SETTLE_MS);
          return;
        }
        // Insert a character at a random position
        const pos = Math.floor(Math.random() * Math.max(ytext.length, 1));
        const char = SAMPLE_CHARS[Math.floor(Math.random() * SAMPLE_CHARS.length)];
        ytext.insert(pos, char);
        editCount++;
      }, EDIT_INTERVAL_MS);
    });
  });
}

async function main() {
  console.log(`Running CRDT sync experiment: ${USER_COUNT} users x ${EDITS_PER_USER} edits`);
  console.log(`Room: ${ROOM_ID}`);
  console.log('---');

  const colors = ['#2dd4bf', '#fb7185', '#a78bfa', '#fbbf24', '#3fb950'];
  const users = Array.from({ length: USER_COUNT }, (_, i) => ({
    userId: uuidv4(),
    userName: `CRDTUser${i + 1}`,
    color: colors[i],
  }));

  const start = Date.now();
  const results = await Promise.all(users.map((u) => runUser(u.userId, u.userName, u.color)));
  const duration = Date.now() - start;

  console.log('Results:');
  results.forEach((r) => console.log(`  ${r.userName}: ${r.edits} edits, final doc length: ${r.finalLength} chars`));
  console.log(`Total time: ${duration}ms`);
  console.log('\nKey CRDT verification:');
  const lengths = results.map((r) => r.finalLength);
  const allSame = lengths.every((l) => l === lengths[0]);
  console.log(allSame ? `✓ All clients converged to same length: ${lengths[0]}` : `✗ DIVERGENCE DETECTED: ${lengths.join(', ')}`);
  console.log('\nFetch metrics:');
  console.log(`  GET ${SERVER_URL}/api/metrics/${ROOM_ID}`);
  console.log('\nCompare with naive:');
  console.log(`  GET ${SERVER_URL}/api/metrics/compare?roomId1=experiment-naive-001&roomId2=${ROOM_ID}`);
}

main().catch(console.error);
