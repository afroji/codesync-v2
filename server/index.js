// Express + Socket.IO entry point
require('express-async-errors');

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
const passport = require('passport');

const db = require('./config/db');
require('./config/redis');
const constants = require('./config/constants');
require('./models');
const configurePassport = require('./config/passport');
const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const metricsRoutes = require('./routes/metrics');
const executionRoutes = require('./routes/execution');
const initializeSocket = require('./socket/collab');
const { getPistonRuntimes, PISTON_LANGUAGES } = require('./services/piston');

const app = express();
app.set('trust proxy', true);
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: constants.CLIENT_URL },
});

initializeSocket(io);

app.use(cors({ origin: constants.CLIENT_URL }));
app.use(helmet());
if (constants.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(passport.initialize());
configurePassport(passport);

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/execute', executionRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'CodeSync running',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    syncMode: constants.SYNC_MODE,
    timestamp: new Date(),
  });
});

app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ success: false, error: err.message });
});

// One-time reachability check, not a hard dependency of startup — Piston
// is the execution fallback as of this session (see services/piston.js),
// so a failure here is a warning, never something that should block the
// server from coming up.
function checkPistonRuntimes() {
  getPistonRuntimes()
    .then((runtimes) => {
      if (runtimes.length === 0) {
        console.warn('Could not reach Piston API (or /runtimes changed) — execution will rely on JDoodle');
        return;
      }
      console.log(`Piston /runtimes reachable. ${runtimes.length} runtimes listed (note: /execute is whitelist-only as of 2/15/2026 — see services/piston.js)`);

      // Some Piston runtimes share a language name across multiple
      // runtimes (e.g. "javascript" is listed for both the Node.js build
      // AND a Deno-based one) — matching on language name alone can find
      // the wrong entry and silently confirm a version we're not actually
      // configured to request. Check the exact (language, version) pair
      // PISTON_LANGUAGES asks for instead.
      Object.entries(PISTON_LANGUAGES).forEach(([ourKey, config]) => {
        const exactMatch = runtimes.find((r) => r.language === config.language && r.version === config.version);
        if (exactMatch) {
          console.log(`  ${ourKey}: ${config.version} (confirmed available)`);
          return;
        }
        const sameLanguage = runtimes.filter((r) => r.language === config.language);
        if (sameLanguage.length > 0) {
          console.warn(
            `  Piston: "${ourKey}" configured for ${config.language}@${config.version}, but that exact version isn't listed — available: ${sameLanguage.map((r) => r.version).join(', ')}`
          );
        } else {
          console.warn(`  Piston: "${ourKey}" (${config.language}) runtime not found at all — check PISTON_LANGUAGES`);
        }
      });
    })
    .catch(() => {});
}

async function start() {
  await db.connect();
  server.listen(constants.PORT, () => {
    console.log(`CodeSync server running on port ${constants.PORT}`);
    console.log(`Sync mode: ${constants.SYNC_MODE}`);
  });
  checkPistonRuntimes();
}

start();

module.exports = { app, server, io };
