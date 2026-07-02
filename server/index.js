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
const initializeSocket = require('./socket/collab');

const app = express();
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

async function start() {
  await db.connect();
  server.listen(constants.PORT, () => {
    console.log(`CodeSync server running on port ${constants.PORT}`);
    console.log(`Sync mode: ${constants.SYNC_MODE}`);
  });
}

start();

module.exports = { app, server, io };
