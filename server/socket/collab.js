/*
 * collab.js — Socket.IO event handlers for room collaboration.
 * Handles: join_room, leave_room, chat_message, cursor_move.
 * Day 7 added naive sync (code_change broadcast).
 * Day 9 adds Yjs CRDT sync (yjs_update) — SYNC_MODE picks which
 * path actually runs; both handlers exist simultaneously so the
 * mode can be toggled per-room for the paper's experiments.
 *
 * IMPORTANT FOR PAPER:
 * Every join/leave updates SessionMetrics.concurrentUsersOverTime.
 * This data is used in Experiment 1 (concurrent users vs latency).
 */
const Y = require('yjs');
const { Room, SessionMetrics } = require('../models');
const { SYNC_MODE } = require('../config/constants');

const METRICS_BATCH_SIZE = 10;
const CONTENT_PERSIST_INTERVAL = 10;

function detectLanguage(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  const map = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    html: 'html',
    css: 'css',
    json: 'json',
    md: 'markdown',
  };
  return map[ext] || 'plaintext';
}

// In-memory Y.Doc store: roomId -> Map(fileName -> Y.Doc).
// Kept in memory for performance — MongoDB stores the merged content
// periodically (every 10th edit, see CONTENT_PERSIST_INTERVAL below) and
// on save/autosave (Day 15). If the server restarts, docs rebuild lazily
// from MongoDB content the next time each file is touched.
const roomDocs = new Map();

function getOrCreateDoc(roomId, fileName, initialContent = '') {
  if (!roomDocs.has(roomId)) {
    roomDocs.set(roomId, new Map());
  }
  const fileDocs = roomDocs.get(roomId);
  if (!fileDocs.has(fileName)) {
    const ydoc = new Y.Doc();
    const ytext = ydoc.getText('content');
    if (initialContent && initialContent.length > 0) {
      ytext.insert(0, initialContent);
    }
    fileDocs.set(fileName, ydoc);
  }
  return fileDocs.get(fileName);
}

// Cleanup: remove docs when room empties
function cleanupRoomDocs(roomId) {
  if (roomDocs.has(roomId)) {
    const fileDocs = roomDocs.get(roomId);
    fileDocs.forEach((doc) => doc.destroy());
    roomDocs.delete(roomId);
  }
}

// Destroy and remove a single file's Y.Doc (used on delete_file) — without
// this, a deleted file's in-memory doc would leak forever, and a later
// file created with the same name would incorrectly inherit its old content.
function destroyFileDoc(roomId, fileName) {
  const fileDocs = roomDocs.get(roomId);
  if (!fileDocs?.has(fileName)) return;
  fileDocs.get(fileName).destroy();
  fileDocs.delete(fileName);
}

// Move a file's live in-memory Y.Doc to a new key (used on rename_file) —
// without this, a rename would orphan the live CRDT state under the old
// name and force every client back to whatever was last periodically
// persisted to MongoDB (up to CONTENT_PERSIST_INTERVAL - 1 edits stale),
// instead of the actual current content.
function renameFileDoc(roomId, oldName, newName) {
  const fileDocs = roomDocs.get(roomId);
  if (!fileDocs?.has(oldName)) return;
  const doc = fileDocs.get(oldName);
  fileDocs.delete(oldName);
  fileDocs.set(newName, doc);
}

/*
 * Batched metrics recording — fixes the Day 8 finding that per-edit
 * fire-and-forget SessionMetrics writes saturate Atlas's free-tier
 * connection pool under sustained load. Both code_change (naive) and
 * yjs_update (crdt) push into the same per-room batch; it flushes to
 * MongoDB every METRICS_BATCH_SIZE events instead of on every single one.
 *
 * IMPORTANT: batches only flush on the count threshold — if a session
 * ends with a partial batch still pending, those events would be lost
 * forever unless something flushes them. handleLeave (below) does that
 * flush when a room empties, precisely to avoid silently dropping the
 * last (up to METRICS_BATCH_SIZE - 1) events of every single session.
 */
function recordMetricsBatched(roomId, entry) {
  if (!global.metricsBatch) global.metricsBatch = {};
  if (!global.metricsBatch[roomId]) {
    global.metricsBatch[roomId] = {
      syncLatencies: [],
      bandwidthPerEdit: [],
      editHistory: [],
      inputLossEvents: [],
      conflictIncrement: 0,
    };
  }
  const batch = global.metricsBatch[roomId];
  batch.syncLatencies.push(entry.syncLatency);
  batch.bandwidthPerEdit.push(entry.bandwidth);
  batch.editHistory.push(entry.editHistory);
  if (entry.inputLossEvent) {
    batch.inputLossEvents.push(entry.inputLossEvent);
    batch.conflictIncrement += 1;
  }

  if (batch.syncLatencies.length >= METRICS_BATCH_SIZE) {
    return flushMetricsBatch(roomId);
  }
}

function flushMetricsBatch(roomId) {
  const batch = global.metricsBatch?.[roomId];
  if (!batch || batch.syncLatencies.length === 0) return;
  delete global.metricsBatch[roomId];

  const update = {
    $push: {
      syncLatencies: { $each: batch.syncLatencies },
      bandwidthPerEdit: { $each: batch.bandwidthPerEdit },
      editHistory: { $each: batch.editHistory },
    },
    $inc: { revisionCount: batch.syncLatencies.length },
  };
  if (batch.inputLossEvents.length > 0) {
    update.$push.inputLossEvents = { $each: batch.inputLossEvents };
  }
  if (batch.conflictIncrement > 0) {
    update.$inc.conflictCount = batch.conflictIncrement;
  }

  return SessionMetrics.findOneAndUpdate({ roomId, endedAt: null }, update).catch((err) => {
    // A failed write must not silently drop this batch's data — merge it
    // back into whatever has accumulated since so the next flush (either
    // the next threshold trip or the room-empty flush in handleLeave)
    // retries it. Verified this matters: a transient Atlas network reset
    // during a real experiment run lost exactly one batch's worth of
    // events (990/1000 recorded) before this fix.
    console.error('Metrics batch flush error, re-queueing batch for retry:', err.message);
    if (!global.metricsBatch) global.metricsBatch = {};
    const pending = global.metricsBatch[roomId];
    if (pending) {
      pending.syncLatencies.unshift(...batch.syncLatencies);
      pending.bandwidthPerEdit.unshift(...batch.bandwidthPerEdit);
      pending.editHistory.unshift(...batch.editHistory);
      pending.inputLossEvents.unshift(...batch.inputLossEvents);
      pending.conflictIncrement += batch.conflictIncrement;
    } else {
      global.metricsBatch[roomId] = batch;
    }
  });
}

function initializeSocket(io) {
  io.on('connection', (socket) => {
    /* ── join_room ── */
    socket.on('join_room', async (data) => {
      /*
       * data: {
       *   roomId: string,
       *   userId: string (UUID for anon, user._id for auth),
       *   name: string (display name),
       *   color: string (hex, one of 6 cursor colors),
       *   isAnonymous: boolean,
       *   token: string (optional, for auth users — verify it)
       * }
       */
      try {
        const { roomId, userId, name, color, isAnonymous } = data;

        // Join the Socket.IO room
        socket.join(roomId);
        socket.roomId = roomId;
        socket.userId = userId;
        socket.userName = name;

        // Add member atomically — findOneAndUpdate with a member-not-present
        // query condition avoids the fetch-then-save race that two users
        // joining at nearly the same instant would otherwise hit (Mongoose's
        // versioned .save() throws VersionError if the doc changed between
        // the read and the write, which happens under real concurrent joins).
        let room = await Room.findOneAndUpdate(
          { roomId, 'members.userId': { $ne: userId } },
          { $push: { members: { userId, name, color, isAnonymous, joinedAt: new Date() } } },
          { new: true }
        );

        if (!room) {
          // Either the room doesn't exist yet, or userId is already a member
          room = await Room.findOne({ roomId });

          if (!room) {
            // Auto-create if room doesn't exist yet (handles direct-URL
            // navigation). Multiple users can race to create the SAME new
            // room at once — e.g. several people opening a fresh room link
            // together, or the experiment scripts spinning up N users in
            // parallel. Only the first Room.create() wins; the rest hit the
            // unique roomId index (E11000) and must fall back to joining
            // the room the winner just created instead of crashing.
            try {
              room = await Room.create({
                roomId,
                isAnonymous,
                expiresAt: isAnonymous ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null,
                syncMode: SYNC_MODE,
                members: [{ userId, name, color, isAnonymous, joinedAt: new Date() }],
              });
              // Create SessionMetrics for this room
              await SessionMetrics.create({
                roomId,
                syncMode: SYNC_MODE,
                startedAt: new Date(),
              });
            } catch (err) {
              if (err.code !== 11000) throw err;
              room = await Room.findOneAndUpdate(
                { roomId, 'members.userId': { $ne: userId } },
                { $push: { members: { userId, name, color, isAnonymous, joinedAt: new Date() } } },
                { new: true }
              );
              if (!room) {
                room = await Room.findOne({ roomId });
              }
            }
          }
        }

        // Record join event in SessionMetrics
        await SessionMetrics.findOneAndUpdate(
          { roomId, endedAt: null },
          {
            $push: {
              concurrentUsersOverTime: {
                count: room.members.length,
                event: 'join',
                userName: name,
                timestamp: new Date(),
              },
            },
            $inc: { revisionCount: 0 }, // touch the doc
          }
        );

        // Send current room state to the joining user only
        socket.emit('room_state', {
          room: room.toObject(),
          yourUserId: userId,
        });

        // CRDT mode: send the current Yjs state for every file so the
        // joining client's Monaco starts from the same content everyone
        // else sees, not an empty doc. (Switching tabs later re-requests
        // this per-file via request_yjs_sync — see that handler below.)
        if (SYNC_MODE === 'crdt' && room.files) {
          room.files.forEach((file) => {
            const ydoc = getOrCreateDoc(roomId, file.name, file.content);
            const fullState = Y.encodeStateAsUpdate(ydoc);
            socket.emit('yjs_sync', {
              fileName: file.name,
              stateVector: Array.from(fullState),
            });
          });
        }

        // Notify everyone else in the room
        socket.to(roomId).emit('user_joined', {
          userId,
          name,
          color,
          isAnonymous,
          memberCount: room.members.length,
        });
      } catch (err) {
        console.error('join_room error:', err);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    /* ── leave_room ── */
    socket.on('leave_room', async ({ roomId, userId }) => {
      await handleLeave(socket, roomId, userId, io);
    });

    /* ── disconnect ── */
    socket.on('disconnect', async () => {
      if (socket.roomId && socket.userId) {
        await handleLeave(socket, socket.roomId, socket.userId, io);
      }
    });

    /* ── chat_message ── */
    socket.on('chat_message', async (data) => {
      /*
       * data: { roomId, userId, name, color, message }
       */
      try {
        const { roomId, userId, name, color, message } = data;
        if (!message?.trim()) return;

        const timestamp = new Date();
        const chatEntry = { userId, name, color, message: message.trim(), timestamp };

        // Add to room's chat array (cap at 200 messages)
        await Room.findOneAndUpdate(
          { roomId },
          {
            $push: {
              chat: {
                $each: [chatEntry],
                $slice: -200,
              },
            },
          }
        );

        // Broadcast to everyone in the room including sender
        io.to(roomId).emit('chat_message', chatEntry);
      } catch (err) {
        console.error('chat_message error:', err);
      }
    });

    /* ── cursor_move ── */
    socket.on('cursor_move', (data) => {
      /*
       * data: { roomId, userId, position: { lineNumber, column } }
       * Broadcast to others only (not back to sender).
       * Not persisted — ephemeral presence data.
       */
      socket.to(data.roomId).emit('cursor_update', {
        userId: data.userId,
        position: data.position,
      });
    });

    /*
     * ── code_change ──
     * NAIVE SYNC MODE
     * When SYNC_MODE === 'naive', every keystroke from any
     * user broadcasts the FULL document content to all other
     * users in the room. Last write wins. No conflict resolution.
     *
     * This is intentionally simple — it's the baseline.
     * Under concurrent editing it will drop keystrokes.
     * That's the point. We measure how many.
     *
     * PAPER NOTE: This is what most student collaborative
     * editor projects do. We measure its failure rate and
     * compare it to CRDT to prove the research contribution.
     */
    socket.on('code_change', async (data) => {
      /*
       * data: {
       *   roomId: string,
       *   userId: string,
       *   fileName: string,
       *   content: string (FULL document content),
       *   timestamp: number (Date.now() on client at emit time),
       *   byteSize: number (content.length in bytes)
       * }
       */
      if (SYNC_MODE !== 'naive') return;

      try {
        const receiveTime = Date.now();
        const syncLatency = receiveTime - data.timestamp;

        // Get current user count for this room
        const socketsInRoom = await io.in(data.roomId).fetchSockets();
        const userCount = socketsInRoom.length;

        // Detect naive conflicts: check if another user edited
        // the same file within the last 50ms
        // Track last edit per file in memory (not DB — fast)
        if (!global.lastEdits) global.lastEdits = {};
        const editKey = `${data.roomId}:${data.fileName}`;
        const lastEdit = global.lastEdits[editKey];
        let isConflict = false;

        if (lastEdit && lastEdit.userId !== data.userId && receiveTime - lastEdit.timestamp < 50) {
          isConflict = true;
        }
        global.lastEdits[editKey] = {
          userId: data.userId,
          timestamp: receiveTime,
        };

        // Bandwidth comparison baseline (Experiment 3): track what a delta
        // would look like size-wise — a stand-in for what a real CRDT delta
        // would be, for comparison against yjs_update's actual delta bytes.
        if (!global.fileContents) global.fileContents = {};
        const contentKey = `${data.roomId}:${data.fileName}`;
        const prevContent = global.fileContents[contentKey] || '';
        global.fileContents[contentKey] = data.content;
        const naiveDeltaBytes = Math.abs(new Blob([data.content]).size - new Blob([prevContent]).size);

        // Metrics: batched (fixes Day 8's Atlas connection pool saturation —
        // per-edit fire-and-forget writes at sustained load overwhelmed the
        // pool; batching every 10 events cuts write volume by ~90%).
        recordMetricsBatched(data.roomId, {
          syncLatency: { value: syncLatency, timestamp: new Date(), userCount },
          bandwidth: {
            bytes: data.byteSize,
            deltaApprox: naiveDeltaBytes,
            timestamp: new Date(),
            syncMode: SYNC_MODE,
          },
          editHistory: {
            userId: data.userId,
            fileName: data.fileName,
            bytesChanged: data.byteSize,
            timestamp: new Date(),
          },
          inputLossEvent: isConflict
            ? {
                userId: data.userId,
                timestamp: new Date(),
                detail:
                  `Concurrent edit conflict on ${data.fileName}: ` +
                  `${lastEdit.userId} edited ${receiveTime - lastEdit.timestamp}ms ago`,
              }
            : null,
        });

        // Update file content in MongoDB Room document
        // (so new joiners get the latest content)
        await Room.findOneAndUpdate(
          { roomId: data.roomId, 'files.name': data.fileName },
          {
            $set: {
              'files.$.content': data.content,
              lastActivity: new Date(),
            },
          }
        );

        // Broadcast to ALL OTHER users in the room
        // (not back to sender — they already have the content)
        socket.to(data.roomId).emit('code_change', {
          userId: data.userId,
          fileName: data.fileName,
          content: data.content,
          syncLatency,
          timestamp: receiveTime,
        });

        // Acknowledge back to the sender so the client can compute true
        // round-trip latency (client emit -> client receives ack), which
        // doesn't depend on client/server clocks being in sync the way
        // one-way (server - client timestamp) latency does.
        socket.emit('code_change_ack', {
          fileName: data.fileName,
          serverTime: receiveTime,
          clientEmitTime: data.timestamp,
          oneWayLatency: syncLatency,
        });
      } catch (err) {
        console.error('code_change error:', err);
      }
    });

    /*
     * ── yjs_update ──
     * CRDT SYNC MODE
     * Every keystroke generates a small binary Yjs update (a delta,
     * typically tens of bytes regardless of document size) instead of
     * the full document. The server merges it into its own in-memory
     * Y.Doc for that file and rebroadcasts the same binary update to
     * everyone else. Yjs's CRDT merge guarantees the same result
     * regardless of the order updates arrive in — no last-write-wins,
     * no lost keystrokes, no conflicts in the Day 7/8 sense.
     */
    socket.on('yjs_update', async (data) => {
      /*
       * data: {
       *   roomId, userId, fileName,
       *   update: number[] (Yjs binary update, serialized for JSON),
       *   timestamp: number,
       *   byteSize: number (size of the DELTA, not the full document)
       * }
       */
      if (SYNC_MODE !== 'crdt') return;

      try {
        const receiveTime = Date.now();
        const syncLatency = receiveTime - data.timestamp;

        const socketsInRoom = await io.in(data.roomId).fetchSockets();
        const userCount = socketsInRoom.length;

        // Only hit MongoDB for initial content the FIRST time this
        // room+file's Y.Doc is created in memory — every subsequent edit
        // reuses it, avoiding a read per keystroke (exactly the kind of
        // load Day 8 found saturates Atlas's connection pool).
        const alreadyLoaded = roomDocs.get(data.roomId)?.has(data.fileName);
        let ydoc;
        if (alreadyLoaded) {
          ydoc = getOrCreateDoc(data.roomId, data.fileName);
        } else {
          const room = await Room.findOne({ roomId: data.roomId, 'files.name': data.fileName }, 'files.$').lean();
          const fileContent = room?.files?.[0]?.content || '';
          ydoc = getOrCreateDoc(data.roomId, data.fileName, fileContent);
        }

        // Apply the Yjs update to server's Y.Doc — the CRDT merge,
        // mathematically guaranteed to converge regardless of order.
        Y.applyUpdate(ydoc, Buffer.from(data.update));
        const mergedContent = ydoc.getText('content').toString();

        // Broadcast to ALL OTHER users (send the binary delta, not content)
        socket.to(data.roomId).emit('yjs_update', {
          userId: data.userId,
          fileName: data.fileName,
          update: Array.from(data.update),
          timestamp: receiveTime,
        });

        // Ack back to sender for round-trip latency measurement
        socket.emit('yjs_ack', {
          fileName: data.fileName,
          serverTime: receiveTime,
          clientEmitTime: data.timestamp,
          oneWayLatency: syncLatency,
        });

        // Periodically persist merged content to MongoDB (not every edit —
        // that's exactly what caused Day 8's pool saturation).
        if (!global.editCounters) global.editCounters = {};
        const counterKey = `${data.roomId}:${data.fileName}`;
        global.editCounters[counterKey] = (global.editCounters[counterKey] || 0) + 1;

        if (global.editCounters[counterKey] % CONTENT_PERSIST_INTERVAL === 0) {
          Room.findOneAndUpdate(
            { roomId: data.roomId, 'files.name': data.fileName },
            { $set: { 'files.$.content': mergedContent, lastActivity: new Date() } }
          ).catch((err) => console.error('Room content persist error:', err));
        }

        // Metrics: batched, same as naive. CRDT has no conflict/input-loss
        // concept in the naive sense — Yjs merges instead of overwriting —
        // so conflictCount stays 0 for crdt sessions; that contrast IS the
        // paper's core result.
        recordMetricsBatched(data.roomId, {
          syncLatency: { value: syncLatency, timestamp: new Date(), userCount },
          bandwidth: {
            bytes: data.byteSize, // delta bytes, NOT full doc
            deltaApprox: data.byteSize, // for CRDT these are the same value
            timestamp: new Date(),
            syncMode: SYNC_MODE,
          },
          editHistory: {
            userId: data.userId,
            fileName: data.fileName,
            bytesChanged: data.byteSize,
            timestamp: new Date(),
          },
        });
      } catch (err) {
        console.error('yjs_update error:', err);
      }
    });

    /* ── request_yjs_sync ── */
    socket.on('request_yjs_sync', async ({ roomId, fileName }) => {
      /*
       * Sent by the client whenever it starts viewing a file for which it
       * doesn't yet have a live Y.Doc (initial join covers every file via
       * join_room's yjs_sync broadcast above, but switching to a file
       * that wasn't the active one at join time needs this — without it,
       * the client would create a blank Y.Doc for that file and only see
       * updates from the moment it switched, missing everything written
       * before that).
       */
      if (SYNC_MODE !== 'crdt') return;
      try {
        const alreadyLoaded = roomDocs.get(roomId)?.has(fileName);
        let ydoc;
        if (alreadyLoaded) {
          ydoc = getOrCreateDoc(roomId, fileName);
        } else {
          const room = await Room.findOne({ roomId, 'files.name': fileName }, 'files.$').lean();
          const fileContent = room?.files?.[0]?.content || '';
          ydoc = getOrCreateDoc(roomId, fileName, fileContent);
        }
        const fullState = Y.encodeStateAsUpdate(ydoc);
        socket.emit('yjs_sync', { fileName, stateVector: Array.from(fullState) });
      } catch (err) {
        console.error('request_yjs_sync error:', err);
      }
    });

    /* ── add_file ── */
    socket.on('add_file', async (data) => {
      /*
       * data: { roomId, fileName, language, content, userId }
       * Adds a new file to the room. Broadcasts to all clients so their
       * file lists (and tab bars) update.
       */
      try {
        const room = await Room.findOne({ roomId: data.roomId });
        if (!room) return;
        if (room.files.some((f) => f.name === data.fileName)) {
          socket.emit('file_error', { message: `A file named "${data.fileName}" already exists` });
          return;
        }

        const newFile = {
          name: data.fileName,
          language: data.language || detectLanguage(data.fileName),
          content: data.content || '',
        };

        await Room.findOneAndUpdate({ roomId: data.roomId }, { $push: { files: newFile } });

        io.to(data.roomId).emit('file_added', { file: newFile, addedBy: data.userId });
      } catch (err) {
        console.error('add_file error:', err);
      }
    });

    /* ── delete_file ── */
    socket.on('delete_file', async (data) => {
      /*
       * data: { roomId, fileName, userId }
       * Guard: cannot delete the last file in the room.
       */
      try {
        const room = await Room.findOne({ roomId: data.roomId });
        if (!room) return;

        if (room.files.length <= 1) {
          socket.emit('file_error', { message: 'Cannot delete the only file in the room' });
          return;
        }

        await Room.findOneAndUpdate({ roomId: data.roomId }, { $pull: { files: { name: data.fileName } } });

        // Free the in-memory Y.Doc for the deleted file — otherwise it
        // leaks, and a future file created with the same name would
        // incorrectly inherit the deleted file's old content.
        destroyFileDoc(data.roomId, data.fileName);
        if (global.editCounters) {
          delete global.editCounters[`${data.roomId}:${data.fileName}`];
        }

        io.to(data.roomId).emit('file_deleted', { fileName: data.fileName, deletedBy: data.userId });
      } catch (err) {
        console.error('delete_file error:', err);
      }
    });

    /* ── rename_file ── */
    socket.on('rename_file', async (data) => {
      /*
       * data: { roomId, oldName, newName, userId }
       */
      try {
        const room = await Room.findOne({ roomId: data.roomId });
        if (!room) return;

        if (room.files.some((f) => f.name === data.newName)) {
          socket.emit('file_error', { message: `A file named "${data.newName}" already exists` });
          return;
        }

        const newLanguage = detectLanguage(data.newName);
        await Room.findOneAndUpdate(
          { roomId: data.roomId, 'files.name': data.oldName },
          { $set: { 'files.$.name': data.newName, 'files.$.language': newLanguage } }
        );

        // Carry the live in-memory Y.Doc over to the new name so no
        // unpersisted edits are lost — see renameFileDoc's comment.
        renameFileDoc(data.roomId, data.oldName, data.newName);
        if (global.editCounters) {
          const oldKey = `${data.roomId}:${data.oldName}`;
          if (global.editCounters[oldKey] !== undefined) {
            global.editCounters[`${data.roomId}:${data.newName}`] = global.editCounters[oldKey];
            delete global.editCounters[oldKey];
          }
        }

        io.to(data.roomId).emit('file_renamed', {
          oldName: data.oldName,
          newName: data.newName,
          newLanguage,
          renamedBy: data.userId,
        });
      } catch (err) {
        console.error('rename_file error:', err);
      }
    });

    /* ── awareness_update ── */
    socket.on('awareness_update', (data) => {
      /*
       * data: { roomId, awarenessUpdate: number[] (serialized Uint8Array) }
       * Pure relay — awareness (cursor position, name, color) is ephemeral
       * presence data, same category as cursor_move. Not processed, not
       * stored, and deliberately never recorded to SessionMetrics: cursor
       * position updates fire on nearly every keystroke and mouse move,
       * so persisting them would generate gigabytes of data with zero
       * research value. Only join/leave/edit events matter for the paper.
       */
      socket.to(data.roomId).emit('awareness_update', {
        awarenessUpdate: data.awarenessUpdate,
      });
    });

    /* ── latency_report ── */
    socket.on('latency_report', async (data) => {
      /*
       * data: { roomId, roundTripLatency, oneWayLatency, fileName, userCount }
       * Sent by the client after receiving a code_change_ack or yjs_ack —
       * this is the round-trip number the paper reports (see paper-notes.md
       * Day 8). Shared by both sync modes; the payload shape is identical.
       */
      try {
        await SessionMetrics.findOneAndUpdate(
          { roomId: data.roomId, endedAt: null },
          {
            $push: {
              roundTripLatencies: {
                value: data.roundTripLatency,
                oneWayValue: data.oneWayLatency,
                timestamp: new Date(),
                userCount: data.userCount,
                syncMode: SYNC_MODE,
              },
            },
          }
        );

        // Best-effort enrichment of the matching syncLatencies entry too —
        // approximate (arrayFilters matches every entry in the 200ms window,
        // not only the single one this report belongs to), which is exactly
        // why roundTripLatencies above is the authoritative array to query.
        await SessionMetrics.findOneAndUpdate(
          { roomId: data.roomId, endedAt: null, 'syncLatencies.timestamp': { $gte: new Date(Date.now() - 200) } },
          { $set: { 'syncLatencies.$[last].roundTripLatency': data.roundTripLatency } },
          { arrayFilters: [{ 'last.timestamp': { $gte: new Date(Date.now() - 200) } }] }
        );
      } catch (err) {
        console.error('latency_report error:', err);
      }
    });

    /* ── request_metrics ── */
    socket.on('request_metrics', async ({ roomId }) => {
      try {
        const metrics = await SessionMetrics.findOne(
          { roomId, endedAt: null },
          'syncLatencies conflictCount revisionCount concurrentUsersOverTime bandwidthPerEdit'
        ).lean();

        if (!metrics) return;

        const latencies = metrics.syncLatencies.map((l) => l.value);
        const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

        socket.emit('metrics_snapshot', {
          avgSyncLatency: Math.round(avgLatency),
          conflictCount: metrics.conflictCount,
          revisionCount: metrics.revisionCount,
          userCount:
            metrics.concurrentUsersOverTime.length > 0
              ? metrics.concurrentUsersOverTime[metrics.concurrentUsersOverTime.length - 1].count
              : 0,
          bandwidthTotal: metrics.bandwidthPerEdit.reduce((sum, b) => sum + b.bytes, 0),
          syncMode: SYNC_MODE,
        });
      } catch (err) {
        console.error('request_metrics error:', err);
      }
    });
  });
}

/* ── handleLeave helper ── */
async function handleLeave(socket, roomId, userId, io) {
  try {
    // Both the explicit leave_room emit AND the subsequent disconnect event
    // call this — clear the markers immediately so the second call (whichever
    // path fires it) is a guaranteed no-op instead of double-recording the
    // leave in concurrentUsersOverTime (this was corrupting the timeline data
    // Experiment 1 needs — verified against real experiment output on Day 8).
    if (socket.roomId !== roomId || socket.userId !== userId) return;
    socket.roomId = null;
    socket.userId = null;

    socket.leave(roomId);

    // Atomic $pull avoids the same fetch-then-save version race as join_room.
    const room = await Room.findOneAndUpdate({ roomId }, { $pull: { members: { userId } } }, { new: true });
    if (!room) return;

    // Record leave event in SessionMetrics
    await SessionMetrics.findOneAndUpdate(
      { roomId, endedAt: null },
      {
        $push: {
          concurrentUsersOverTime: {
            count: room.members.length,
            event: 'leave',
            userName: socket.userName || userId,
            timestamp: new Date(),
          },
        },
      }
    );

    if (room.members.length === 0) {
      // Yjs in-memory cleanup — no-op in naive mode since roomDocs would
      // never have been populated for this room.
      cleanupRoomDocs(roomId);
      if (global.editCounters) {
        Object.keys(global.editCounters)
          .filter((key) => key.startsWith(`${roomId}:`))
          .forEach((key) => delete global.editCounters[key]);
      }

      // Flush any remaining batched metrics BEFORE marking endedAt — the
      // flush's { endedAt: null } query condition wouldn't match anymore
      // once endedAt is set, and up to METRICS_BATCH_SIZE - 1 events would
      // otherwise be silently lost at the end of every single session.
      await flushMetricsBatch(roomId);

      // If room is now empty AND anonymous, mark metrics as ended
      if (room.isAnonymous) {
        await SessionMetrics.findOneAndUpdate({ roomId, endedAt: null }, { endedAt: new Date() });
      }
    }

    // Notify remaining members
    io.to(roomId).emit('user_left', {
      userId,
      name: socket.userName || userId,
      memberCount: room.members.length,
    });

    // Tell remaining clients to drop this user's cursor immediately —
    // awareness has its own ~30s stale-entry timeout built in, far too
    // slow for a cursor to visibly linger after someone actually leaves.
    io.to(roomId).emit('awareness_cleared', { userId });
  } catch (err) {
    console.error('handleLeave error:', err);
  }
}

module.exports = initializeSocket;
