const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const TwitterStrategy = require("passport-twitter").Strategy;
const GitHubStrategy = require("passport-github2").Strategy;
const { getConnection } = require("./database");
const bcrypt = require("bcrypt");

// Serialize/Deserialize user for session management
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const db = getConnection();
    const [users] = await db.execute("SELECT * FROM users WHERE id = ?", [id]);
    done(null, users[0] || null);
  } catch (error) {
    done(error, null);
  }
});

// Helper function to find or create user
const findOrCreateUser = async (profile, provider) => {
  try {
    const db = getConnection();

    // Check if user exists with this social provider ID
    const [existingUsers] = await db.execute(
      "SELECT * FROM users WHERE socialId = ? AND socialProvider = ?",
      [profile.id, provider],
    );

    if (existingUsers.length > 0) {
      return existingUsers[0];
    }

    // Check if user exists with same email
    const email =
      profile.emails && profile.emails[0] ? profile.emails[0].value : null;
    if (email) {
      const [emailUsers] = await db.execute(
        "SELECT * FROM users WHERE email = ?",
        [email],
      );

      if (emailUsers.length > 0) {
        // Link social account to existing user
        await db.execute(
          "UPDATE users SET socialId = ?, socialProvider = ?, avatar = ? WHERE id = ?",
          [profile.id, provider, profile.photos?.[0]?.value, emailUsers[0].id],
        );
        return emailUsers[0];
      }
    }

    // Create new user
    const firstName =
      profile.name?.givenName || profile.displayName?.split(" ")[0] || "";
    const lastName =
      profile.name?.familyName || profile.displayName?.split(" ")[1] || "";
    const avatar = profile.photos?.[0]?.value || null;

    const [result] = await db.execute(
      `INSERT INTO users (
        email, firstName, lastName, socialId, socialProvider, avatar, 
        emailVerified, profileSetup
      ) VALUES (?, ?, ?, ?, ?, ?, 1, 0)`,
      [email, firstName, lastName, profile.id, provider, avatar],
    );

    const [newUser] = await db.execute("SELECT * FROM users WHERE id = ?", [
      result.insertId,
    ]);

    return newUser[0];
  } catch (error) {
    console.error("Error in findOrCreateUser:", error);
    throw error;
  }
};

// Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.***REMOVED***,
      clientSecret: process.env.***REMOVED***,
      callbackURL: "/api/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await findOrCreateUser(profile, "google");
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    },
  ),
);

// Facebook OAuth Strategy
passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.***REMOVED***,
      clientSecret: process.env.***REMOVED***,
      callbackURL: "/api/auth/facebook/callback",
      profileFields: ["id", "displayName", "email", "picture.type(large)"],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await findOrCreateUser(profile, "facebook");
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    },
  ),
);

// Twitter OAuth Strategy
passport.use(
  new TwitterStrategy(
    {
      consumerKey: process.env.***REMOVED***,
      consumerSecret: process.env.***REMOVED***,
      callbackURL: "/api/auth/twitter/callback",
      includeEmail: true,
    },
    async (token, tokenSecret, profile, done) => {
      try {
        const user = await findOrCreateUser(profile, "twitter");
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    },
  ),
);

// GitHub OAuth Strategy
passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: "/api/auth/github/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await findOrCreateUser(profile, "github");
        return done(null, user);
      } catch (error) {
        return done(error, null);
      }
    },
  ),
);

module.exports = passport;
