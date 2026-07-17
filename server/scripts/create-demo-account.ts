// One-off script: creates (or updates) a pre-verified Firebase Auth account
// for App Store review, since the Firebase Console has no way to mark a
// user email-verified and the app now hard-gates unverified users.
//
// Usage: npx tsx --env-file=.env server/scripts/create-demo-account.ts <email> <password>

import { adminAuth } from "../lib/firebase-admin";

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: tsx server/scripts/create-demo-account.ts <email> <password>");
    process.exit(1);
  }

  const auth = adminAuth();
  if (!auth) {
    console.error("Firebase Admin not initialized — check FIREBASE_SERVICE_ACCOUNT_JSON in .env");
    process.exit(1);
  }

  try {
    const existing = await auth.getUserByEmail(email).catch(() => null);
    if (existing) {
      await auth.updateUser(existing.uid, { password, emailVerified: true });
      console.log(`✓ Updated existing user ${email} (uid: ${existing.uid}), set emailVerified: true`);
    } else {
      const user = await auth.createUser({ email, password, emailVerified: true });
      console.log(`✓ Created user ${email} (uid: ${user.uid}), emailVerified: true`);
    }
  } catch (e) {
    console.error("Failed:", e);
    process.exit(1);
  }
}

main();
