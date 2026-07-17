// One-off script: force-logs-out every user by revoking all Firebase refresh
// tokens. Existing ID tokens stay valid up to 1 hour (Firebase token lifetime);
// each client is signed out when its SDK next tries to refresh.
//
// Usage: npx tsx --env-file=.env server/scripts/revoke-all-sessions.ts

import { adminAuth } from "../lib/firebase-admin";

async function main() {
  const auth = adminAuth();
  if (!auth) {
    console.error("Firebase Admin not initialized — check FIREBASE_SERVICE_ACCOUNT_JSON in .env");
    process.exit(1);
  }

  let revoked = 0;
  let failed = 0;
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      try {
        await auth.revokeRefreshTokens(user.uid);
        revoked++;
        console.log(`✓ Revoked sessions for ${user.email ?? user.uid}`);
      } catch (e) {
        failed++;
        console.error(`✗ Failed for ${user.email ?? user.uid}:`, e);
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  console.log(`\nDone: revoked ${revoked} user(s)${failed ? `, ${failed} failed` : ""}`);
  if (failed > 0) process.exit(1);
}

main();
