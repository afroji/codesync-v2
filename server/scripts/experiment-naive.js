/*
 * experiment-naive.js — Automated test script for
 * paper Experiment 2 (naive side).
 * Run this with SYNC_MODE=naive to generate baseline data.
 * Run experiment-crdt.js (Day 9) with SYNC_MODE=crdt
 * to generate comparison data.
 * Then call GET /api/metrics/compare to get the table.
 *
 * Usage: node scripts/experiment-naive.js <roomId>
 */
const io = require('socket.io-client');
const { v4: uuidv4 } = require('uuid');

const ROOM_ID = process.argv[2] || 'experiment-naive-001';
const USER_COUNT = 5;
const EDITS_PER_USER = 200;
const EDIT_INTERVAL_MS = 20; // 20ms between edits = fast typing
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

// Characters to type (simulate realistic code typing)
const SAMPLE_CHARS = 'abcdefghijklmnopqrstuvwxyz ' + '(){}[];=><+-*/ \n';

async function runUser(userId, userName, color) {
  return new Promise((resolve) => {
    const socket = io(SERVER_URL, {
      transports: ['websocket'],
    });
    let content = '';
    let editCount = 0;

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
      // Start typing after joining
      const interval = setInterval(() => {
        if (editCount >= EDITS_PER_USER) {
          clearInterval(interval);
          socket.emit('leave_room', { roomId: ROOM_ID, userId });
          socket.disconnect();
          resolve({ userId, edits: editCount });
          return;
        }
        // Add a random character to content
        content += SAMPLE_CHARS[Math.floor(Math.random() * SAMPLE_CHARS.length)];
        socket.emit('code_change', {
          roomId: ROOM_ID,
          userId,
          fileName: 'main.js',
          content,
          timestamp: Date.now(),
          byteSize: Buffer.byteLength(content, 'utf8'),
        });
        editCount++;
      }, EDIT_INTERVAL_MS);
    });

    // Accept incoming changes (naive: overwrite local content)
    socket.on('code_change', (data) => {
      if (data.userId !== userId) {
        content = data.content; // naive: last write wins
      }
    });
  });
}

async function main() {
  console.log(
    `Running naive sync experiment: ${USER_COUNT} users x ${EDITS_PER_USER} edits = ${USER_COUNT * EDITS_PER_USER} total`
  );
  console.log(`Room: ${ROOM_ID}`);
  console.log('---');

  const colors = ['#2dd4bf', '#fb7185', '#a78bfa', '#fbbf24', '#3fb950'];
  const users = Array.from({ length: USER_COUNT }, (_, i) => ({
    userId: uuidv4(),
    userName: `ExperimentUser${i + 1}`,
    color: colors[i],
  }));

  const start = Date.now();
  const results = await Promise.all(users.map((u) => runUser(u.userId, u.userName, u.color)));
  const duration = Date.now() - start;

  console.log('Results:');
  results.forEach((r) => console.log(`  ${r.userId}: ${r.edits} edits`));
  console.log(`Total time: ${duration}ms`);
  console.log(`\nFetch metrics:`);
  console.log(`  GET ${SERVER_URL}/api/metrics/${ROOM_ID}`);
  console.log('This is your Experiment 2 naive baseline.');
}

main().catch(console.error);
