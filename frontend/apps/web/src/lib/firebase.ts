import { initializeApp } from "firebase/app";
import { browserLocalPersistence, getAuth, setPersistence } from "firebase/auth";

// Same Firebase project (monysa-prod) and web app registration as mobile —
// see moby/lib/firebase_options.dart (FirebaseOptions.web). These values are
// public client config, not secrets. Firebase UID is the shared identity across
// mobile + web and the key RevenueCat entitlements / plans are stored under.
const firebaseConfig = {
  apiKey: "AIzaSyDxUwTXVxZi36SZLdHwwIhFt3V-xO4QPlw",
  authDomain: "monysa-prod.firebaseapp.com",
  projectId: "monysa-prod",
  storageBucket: "monysa-prod.firebasestorage.app",
  messagingSenderId: "234828339364",
  appId: "1:234828339364:web:261bca2b472e09a65cee31",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

// Keep the user signed in across reloads/tabs (mirrors mobile's persistent
// session). Fire-and-forget — the default is already local, this just asserts it.
setPersistence(auth, browserLocalPersistence).catch(() => {});
