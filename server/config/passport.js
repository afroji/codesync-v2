/*
 * passport.js — Google OAuth strategy.
 * We use JWT not sessions, so no serialize/deserialize.
 */
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { User } = require('../models');
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, BACKEND_URL } = require('./constants');

function configure(passport) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.warn('WARNING: GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set — Google OAuth strategy not registered.');
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: `${BACKEND_URL}/api/auth/google/callback`,
        scope: ['profile', 'email'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails[0].value;
          const name = profile.displayName;
          const avatar = profile.photos?.[0]?.value;

          let user = await User.findOne({ provider: 'google', providerId: profile.id });
          if (user) {
            user.lastSeen = Date.now();
            await user.save();
            return done(null, user);
          }

          const existingEmail = await User.findOne({ email });
          if (existingEmail) {
            return done(null, false, {
              message:
                'Email already registered with a different login method. Please use email/password.',
            });
          }

          const newUser = await User.create({
            name,
            email,
            avatar,
            provider: 'google',
            providerId: profile.id,
            passwordHash: null,
          });

          return done(null, newUser);
        } catch (err) {
          return done(err);
        }
      }
    )
  );
}

module.exports = configure;
