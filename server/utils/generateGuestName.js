/*
 * generateGuestName.js — Generates a random guest display
 * name for anonymous room members.
 * e.g. "Guest Falcon", "Guest Nebula", "Guest Cipher"
 */
const NAMES = [
  'Falcon', 'Wolf', 'Raven', 'Lynx', 'Otter', 'Hawk', 'Panther', 'Cobra', 'Heron', 'Orca',
  'Nebula', 'Comet', 'Quasar', 'Pulsar', 'Nova', 'Orbit', 'Meteor', 'Cosmos', 'Vega', 'Zenith',
  'Cipher', 'Vector', 'Kernel', 'Byte', 'Pixel', 'Daemon', 'Syntax', 'Runtime', 'Cache', 'Node',
  'Socket', 'Thread', 'Buffer', 'Photon', 'Ion', 'Flux',
];

function generateGuestName() {
  const name = NAMES[Math.floor(Math.random() * NAMES.length)];
  return `Guest ${name}`;
}

module.exports = generateGuestName;
