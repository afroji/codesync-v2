// Mongoose connection to MongoDB
const mongoose = require('mongoose');
const { MONGODB_URI } = require('./constants');

async function connect() {
  try {
    const conn = await mongoose.connect(MONGODB_URI);
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
}

module.exports = { connect };
