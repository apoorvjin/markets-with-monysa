import { type App, initializeApp, getApps, cert } from "firebase-admin/app";
import { type Auth, getAuth } from "firebase-admin/auth";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { type Messaging, getMessaging } from "firebase-admin/messaging";
import { type RemoteConfig, getRemoteConfig } from "firebase-admin/remote-config";

let _app: App | null = null;

function app(): App | null {
  if (_app) return _app;
  if (getApps().length > 0) {
    _app = getApps()[0];
    return _app;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const serviceAccount = JSON.parse(raw);
    _app = initializeApp({ credential: cert(serviceAccount) });
    console.log("✓ Firebase Admin SDK initialized");
  } catch (e) {
    console.error("[firebase-admin] Init failed:", e);
  }
  return _app;
}

let _db: Firestore | null = null;

export function adminFirestore(): Firestore | null {
  if (_db) return _db;
  const a = app();
  if (!a) return null;
  const dbId = process.env.FIRESTORE_DATABASE_ID ?? "(default)";
  console.log(`[firebase-admin] Connecting to Firestore database: "${dbId}"`);
  _db = getFirestore(a, dbId);
  return _db;
}

export function adminAuth(): Auth | null {
  const a = app();
  return a ? getAuth(a) : null;
}

export function adminMessaging(): Messaging | null {
  const a = app();
  return a ? getMessaging(a) : null;
}

export function adminRemoteConfig(): RemoteConfig | null {
  const a = app();
  return a ? getRemoteConfig(a) : null;
}
