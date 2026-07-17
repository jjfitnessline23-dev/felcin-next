import { readFileSync } from "fs";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const raw = readFileSync("C:\\Users\\johnj\\felcin-next\\.env.check", "utf8");
const saLine = raw.split("\n").find(l => l.startsWith("FIREBASE_SERVICE_ACCOUNT_JSON=")) || "";
const jsonStr = saLine.slice(saLine.indexOf("{"), saLine.lastIndexOf("}") + 1);

// Debug
process.stderr.write("jsonStr chars 0-3: " + [0,1,2,3].map(i => jsonStr.charCodeAt(i)).join(",") + "\n");

// Replace literal \n (chars 92+110) outside JSON strings with space
function fixJson(s) {
  const BS = String.fromCharCode(92); // backslash
  let out = "", inStr = false, i = 0;
  while (i < s.length) {
    if (inStr) {
      if (s[i] === BS && i + 1 < s.length) {
        out += s[i] + s[i + 1]; i += 2;
      } else {
        if (s[i] === '"') inStr = false;
        out += s[i++];
      }
    } else {
      if (s[i] === '"') { inStr = true; out += s[i++]; }
      else if (s[i] === BS && s[i + 1] === "n") { out += " "; i += 2; }
      else { out += s[i++]; }
    }
  }
  return out;
}

const fixed = fixJson(jsonStr);
process.stderr.write("fixed chars 0-3: " + [0,1,2,3].map(i => fixed.charCodeAt(i)).join(",") + "\n");
const sa = JSON.parse(fixed);
if (!getApps().length) initializeApp({ credential: cert(sa) });
const auth = getAuth();
const db = getFirestore();

let totalAuth = 0, pageToken;
do {
  const r = await auth.listUsers(1000, pageToken);
  totalAuth += r.users.length;
  pageToken = r.pageToken;
} while (pageToken);

const snap = await db.collection("users").count().get();
const firestoreCount = snap.data().count;

const jul5 = new Date("2026-07-05T00:00:00Z");
let newSinceAds = 0, pt2;
do {
  const r = await auth.listUsers(1000, pt2);
  newSinceAds += r.users.filter(u => new Date(u.metadata.creationTime) >= jul5).length;
  pt2 = r.pageToken;
} while (pt2);

console.log("=== Felcin User Count ===");
console.log(`Total Firebase Auth users:   ${totalAuth}`);
console.log(`Total Firestore user docs:   ${firestoreCount}`);
console.log(`New since Jul 5 (ads live):  ${newSinceAds}`);
console.log(`Sign-up rate from 1706 DLs:  ${((newSinceAds / 1706) * 100).toFixed(1)}%`);
