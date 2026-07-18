"use client";
// lib/db.ts — Unified Firestore API
//
// Drop-in replacement for "firebase/firestore" that routes to the native
// @capacitor-firebase/firestore plugin on iOS (native SDK = offline persistence,
// no WKWebView IndexedDB deadlock) and falls back to firebase/firestore on web.
//
// Migrate a file by changing ONE import line:
//   import { ... } from "firebase/firestore"
//   ↓
//   import { ... } from "@/lib/db"
//
// All call sites stay the same — API is identical.

import * as fs from "firebase/firestore";
import { db as _db } from "@/lib/firebase";

// Always use the web Firestore SDK. The native @capacitor-firebase/firestore
// plugin was intended to avoid the iOS WKWebView IDB deadlock, but the IDB
// issue is now fixed at the build level (idb no-op + Firebase Auth patch).
// The native plugin's gRPC connection hangs on first load; web SDK with
// memoryLocalCache is reliable and needs no native bridge.
const IS_CAP = false;

// ─── Exported db instance (still needed as first arg to doc/collection) ───────
export const db = _db;

// ─── Types ────────────────────────────────────────────────────────────────────
export type DocumentData = Record<string, unknown>;

export type QueryDocumentSnapshot = {
  id: string;
  exists(): boolean;
  data(): DocumentData | undefined;
  ref: CapRef;
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
};

type CapRef = { __capPath: string; id: string };
type CapColl = { __capPath: string; __capColl: true; __capIsGroup?: boolean };
type CapConstraint =
  | { __cap: "where"; fieldPath: string; opStr: string; value: unknown }
  | { __cap: "orderBy"; fieldPath: string; directionStr: "asc" | "desc" }
  | { __cap: "limit"; value: number }
  | { __cap: "limitToLast"; value: number }
  | { __cap: "startAfter"; snapshot: unknown }
  | { __cap: "or"; constraints: CapConstraint[] };
type CapQuery = CapColl & { __capConstraints: CapConstraint[] };

// ─── Timestamp (compatible with Firestore Timestamp) ──────────────────────────
export class Timestamp {
  constructor(public readonly seconds: number, public readonly nanoseconds: number) {}
  toDate() { return new Date(this.seconds * 1000 + Math.round(this.nanoseconds / 1e6)); }
  toMillis() { return this.seconds * 1000 + Math.round(this.nanoseconds / 1e6); }
  isEqual(o: Timestamp) { return this.seconds === o.seconds && this.nanoseconds === o.nanoseconds; }
  static now() { return Timestamp.fromMillis(Date.now()); }
  static fromDate(d: Date) { const ms = d.getTime(); return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6); }
  static fromMillis(ms: number) { return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6); }
}

// ─── FieldValue markers (Capacitor path only) ────────────────────────────────
class CapFieldValue {
  constructor(public __capFV: string, public __val?: unknown) {}
}

// ─── Data serialization for native plugin ─────────────────────────────────────
function serialize(v: unknown): unknown {
  if (v instanceof CapFieldValue) {
    if (v.__capFV === "serverTimestamp") return { specialValue: "serverTimestamp" };
    if (v.__capFV === "increment") return { specialValue: "increment", value: v.__val };
    if (v.__capFV === "arrayUnion") return { specialValue: "arrayUnion", elements: v.__val };
    if (v.__capFV === "arrayRemove") return { specialValue: "arrayRemove", elements: v.__val };
  }
  if (v instanceof Timestamp) return { seconds: v.seconds, nanoseconds: v.nanoseconds };
  if (Array.isArray(v)) return v.map(serialize);
  if (v && typeof v === "object" && !(v instanceof Date)) {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, serialize(val)]));
  }
  return v;
}

function deserialize(v: unknown): unknown {
  if (!v || typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  if (typeof o.seconds === "number" && typeof o.nanoseconds === "number") {
    return new Timestamp(o.seconds, o.nanoseconds);
  }
  if (Array.isArray(v)) return v.map(deserialize);
  return Object.fromEntries(Object.entries(o).map(([k, val]) => [k, deserialize(val)]));
}

function makeSnap(snapshot: Record<string, unknown> | null | undefined, refPath: string): QueryDocumentSnapshot {
  const rawData = snapshot?.data as Record<string, unknown> | undefined;
  const data = rawData ? deserialize(rawData) as DocumentData : undefined;
  const id = (snapshot?.id as string) || refPath.split("/").pop() || "";
  const capRef: CapRef = { __capPath: refPath, id };
  return {
    id,
    ref: capRef,
    exists: () => data !== undefined && snapshot !== null && snapshot !== undefined,
    data: () => data,
    metadata: { fromCache: false, hasPendingWrites: false },
  };
}

// ─── Build native compositeFilter and queryConstraints from CapConstraints ────
function buildNativeQuery(constraints: CapConstraint[]) {
  const whereList = constraints.filter((c): c is Extract<CapConstraint, { __cap: "where" }> => c.__cap === "where");
  const orList = constraints.filter((c): c is Extract<CapConstraint, { __cap: "or" }> => c.__cap === "or");
  const others = constraints.filter(c => c.__cap !== "where" && c.__cap !== "or");

  let compositeFilter: Record<string, unknown> | undefined;
  if (orList.length > 0) {
    compositeFilter = {
      type: "or",
      queryConstraints: orList[0].constraints.map((c) => {
        const w = c as Extract<CapConstraint, { __cap: "where" }>;
        return { type: "where", fieldPath: w.fieldPath, opStr: w.opStr, value: w.value };
      }),
    };
  } else if (whereList.length === 1) {
    compositeFilter = {
      type: "and",
      queryConstraints: [{ type: "where", fieldPath: whereList[0].fieldPath, opStr: whereList[0].opStr, value: whereList[0].value }],
    };
  } else if (whereList.length > 1) {
    compositeFilter = {
      type: "and",
      queryConstraints: whereList.map(c => ({ type: "where", fieldPath: c.fieldPath, opStr: c.opStr, value: c.value })),
    };
  }

  const queryConstraints = others.map(c => {
    if (c.__cap === "orderBy") return { type: "orderBy", fieldPath: c.fieldPath, directionStr: c.directionStr };
    if (c.__cap === "limit") return { type: "limit", limit: c.value };
    if (c.__cap === "limitToLast") return { type: "limitToLast", limit: c.value };
    if (c.__cap === "startAfter") {
      const snap = c.snapshot as (QueryDocumentSnapshot | CapRef | null);
      const ref = snap && "ref" in snap ? snap.ref : snap;
      return { type: "startAfter", reference: ref ? (ref as CapRef).__capPath : undefined };
    }
    return null;
  }).filter(Boolean) as Record<string, unknown>[];

  return { compositeFilter, queryConstraints };
}

// ─── Reference helpers ────────────────────────────────────────────────────────
export function doc(dbOrRef: unknown, ...pathSegments: string[]): CapRef | ReturnType<typeof fs.doc> {
  if (!IS_CAP) return fs.doc(dbOrRef as Parameters<typeof fs.doc>[0], ...pathSegments);
  const path = pathSegments.join("/");
  return { __capPath: path, id: pathSegments[pathSegments.length - 1] };
}

export function collection(dbOrRef: unknown, ...pathSegments: string[]): CapColl | ReturnType<typeof fs.collection> {
  if (!IS_CAP) return fs.collection(dbOrRef as Parameters<typeof fs.collection>[0], ...pathSegments);
  return { __capPath: pathSegments.join("/"), __capColl: true };
}

export function collectionGroup(dbInst: unknown, collectionId: string): CapColl | ReturnType<typeof fs.collectionGroup> {
  if (!IS_CAP) return fs.collectionGroup(dbInst as Parameters<typeof fs.collectionGroup>[0], collectionId);
  return { __capPath: collectionId, __capColl: true, __capIsGroup: true };
}

// ─── Query builders ───────────────────────────────────────────────────────────
export function query(ref: unknown, ...constraints: unknown[]): CapQuery | ReturnType<typeof fs.query> {
  if (!IS_CAP) return fs.query(ref as Parameters<typeof fs.query>[0], ...(constraints as Parameters<typeof fs.query>[1][]));
  const base = ref as CapColl;
  return { ...base, __capConstraints: constraints as CapConstraint[] };
}

export function where(fieldPath: string, opStr: string, value: unknown) {
  if (!IS_CAP) return fs.where(fieldPath, opStr as Parameters<typeof fs.where>[1], value);
  return { __cap: "where" as const, fieldPath, opStr, value };
}

export function orderBy(fieldPath: string, directionStr: "asc" | "desc" = "asc") {
  if (!IS_CAP) return fs.orderBy(fieldPath, directionStr);
  return { __cap: "orderBy" as const, fieldPath, directionStr };
}

export function limit(n: number) {
  if (!IS_CAP) return fs.limit(n);
  return { __cap: "limit" as const, value: n };
}

export function limitToLast(n: number) {
  if (!IS_CAP) return fs.limitToLast(n);
  return { __cap: "limitToLast" as const, value: n };
}

export function startAfter(snapshot: unknown) {
  if (!IS_CAP) return fs.startAfter(snapshot as Parameters<typeof fs.startAfter>[0]);
  return { __cap: "startAfter" as const, snapshot };
}

export function or(...constraints: unknown[]) {
  if (!IS_CAP) return fs.or(...(constraints as Parameters<typeof fs.or>));
  return { __cap: "or" as const, constraints: constraints as CapConstraint[] };
}

// ─── FieldValues ──────────────────────────────────────────────────────────────
export function serverTimestamp() {
  if (!IS_CAP) return fs.serverTimestamp();
  return new CapFieldValue("serverTimestamp");
}

export function increment(n: number) {
  if (!IS_CAP) return fs.increment(n);
  return new CapFieldValue("increment", n);
}

export function arrayUnion(...elements: unknown[]) {
  if (!IS_CAP) return fs.arrayUnion(...elements);
  return new CapFieldValue("arrayUnion", elements);
}

export function arrayRemove(...elements: unknown[]) {
  if (!IS_CAP) return fs.arrayRemove(...elements);
  return new CapFieldValue("arrayRemove", elements);
}

// ─── Document reads ───────────────────────────────────────────────────────────
export async function getDoc(ref: unknown) {
  if (!IS_CAP) return fs.getDoc(ref as Parameters<typeof fs.getDoc>[0]);
  const { __capPath } = ref as CapRef;
  const { FirebaseFirestore } = await import("@capacitor-firebase/firestore");
  const result = await FirebaseFirestore.getDocument({ reference: __capPath });
  return makeSnap(result.snapshot as Record<string, unknown>, __capPath);
}

export async function getDocs(queryOrRef: unknown) {
  if (!IS_CAP) return fs.getDocs(queryOrRef as Parameters<typeof fs.getDocs>[0]);
  const q = queryOrRef as CapQuery;
  const { compositeFilter, queryConstraints } = buildNativeQuery(q.__capConstraints || []);
  const { FirebaseFirestore } = await import("@capacitor-firebase/firestore");
  let snapshots: Record<string, unknown>[];
  if (q.__capIsGroup) {
    const r = await FirebaseFirestore.getCollectionGroup({ reference: q.__capPath, compositeFilter, queryConstraints } as Parameters<typeof FirebaseFirestore.getCollectionGroup>[0]);
    snapshots = (r.snapshots || []) as Record<string, unknown>[];
  } else {
    const r = await FirebaseFirestore.getCollection({ reference: q.__capPath, compositeFilter, queryConstraints } as Parameters<typeof FirebaseFirestore.getCollection>[0]);
    snapshots = (r.snapshots || []) as Record<string, unknown>[];
  }
  const docs = snapshots.map(s => makeSnap(s, `${q.__capPath}/${s.id}`));
  return { docs, empty: docs.length === 0, size: docs.length, forEach: (fn: (d: QueryDocumentSnapshot) => void) => docs.forEach(fn) };
}

// ─── Document writes ──────────────────────────────────────────────────────────
export async function setDoc(ref: unknown, data: DocumentData, options?: { merge?: boolean }) {
  if (!IS_CAP) return fs.setDoc(ref as Parameters<typeof fs.setDoc>[0], data, options as Parameters<typeof fs.setDoc>[2]);
  const { __capPath } = ref as CapRef;
  const { FirebaseFirestore } = await import("@capacitor-firebase/firestore");
  await FirebaseFirestore.setDocument({ reference: __capPath, data: serialize(data) as DocumentData, merge: options?.merge ?? false });
}

export async function updateDoc(ref: unknown, data: DocumentData) {
  if (!IS_CAP) return fs.updateDoc(ref as Parameters<typeof fs.updateDoc>[0], data);
  const { __capPath } = ref as CapRef;
  const { FirebaseFirestore } = await import("@capacitor-firebase/firestore");
  // Native plugin updateDocument uses fields array format
  const fields = Object.entries(data).map(([fieldPath, value]) => ({ fieldPath, value: serialize(value) }));
  await FirebaseFirestore.updateDocument({ reference: __capPath, fields } as Parameters<typeof FirebaseFirestore.updateDocument>[0]);
}

export async function addDoc(collRef: unknown, data: DocumentData) {
  if (!IS_CAP) return fs.addDoc(collRef as Parameters<typeof fs.addDoc>[0], data);
  const { __capPath } = collRef as CapColl;
  const { FirebaseFirestore } = await import("@capacitor-firebase/firestore");
  const result = await FirebaseFirestore.addDocument({ reference: __capPath, data: serialize(data) as DocumentData });
  const id = result.reference?.id || "";
  return { id, __capPath: `${__capPath}/${id}` } as CapRef;
}

export async function deleteDoc(ref: unknown) {
  if (!IS_CAP) return fs.deleteDoc(ref as Parameters<typeof fs.deleteDoc>[0]);
  const { __capPath } = ref as CapRef;
  const { FirebaseFirestore } = await import("@capacitor-firebase/firestore");
  await FirebaseFirestore.deleteDocument({ reference: __capPath });
}

// ─── Real-time listeners ──────────────────────────────────────────────────────
export function onSnapshot(refOrQuery: unknown, callbackOrOptions: unknown, maybeCallback?: unknown): () => void {
  if (!IS_CAP) {
    return fs.onSnapshot(
      refOrQuery as Parameters<typeof fs.onSnapshot>[0],
      callbackOrOptions as Parameters<typeof fs.onSnapshot>[1],
      maybeCallback as Parameters<typeof fs.onSnapshot>[2]
    ) as unknown as () => void;
  }

  const cb = typeof callbackOrOptions === "function" ? callbackOrOptions : maybeCallback;
  const callback = cb as (snap: unknown) => void;
  const rq = refOrQuery as (CapRef | CapQuery);
  const isCollection = "__capColl" in rq || "__capConstraints" in rq;

  let callbackId: string | undefined;
  let unsubscribed = false;

  (async () => {
    const { FirebaseFirestore } = await import("@capacitor-firebase/firestore");
    if (unsubscribed) return;

    if (isCollection) {
      const q = rq as CapQuery;
      const { compositeFilter, queryConstraints } = buildNativeQuery(q.__capConstraints || []);
      callbackId = await FirebaseFirestore.addCollectionSnapshotListener(
        { reference: q.__capPath, compositeFilter, queryConstraints } as Parameters<typeof FirebaseFirestore.addCollectionSnapshotListener>[0],
        (event: Record<string, unknown> | null, _error: unknown) => {
          if (unsubscribed) return;
          const snaps = ((event?.snapshots || []) as Record<string, unknown>[]).map(s => makeSnap(s, `${q.__capPath}/${s.id}`));
          callback({ docs: snaps, empty: snaps.length === 0, size: snaps.length, forEach: (fn: (d: QueryDocumentSnapshot) => void) => snaps.forEach(fn) });
        }
      ) as unknown as string;
    } else {
      const r = rq as CapRef;
      callbackId = await FirebaseFirestore.addDocumentSnapshotListener(
        { reference: r.__capPath },
        (event: Record<string, unknown> | null, _error: unknown) => {
          if (unsubscribed) return;
          callback(makeSnap(event?.snapshot as Record<string, unknown>, r.__capPath));
        }
      ) as unknown as string;
    }
  })();

  return () => {
    unsubscribed = true;
    if (callbackId) {
      import("@capacitor-firebase/firestore").then(({ FirebaseFirestore }) => {
        FirebaseFirestore.removeSnapshotListener({ callbackId: callbackId! }).catch(() => {});
      });
    }
  };
}

// ─── Batch writes ─────────────────────────────────────────────────────────────
export function writeBatch(dbInst: unknown) {
  if (!IS_CAP) return fs.writeBatch(dbInst as Parameters<typeof fs.writeBatch>[0]);
  const operations: Record<string, unknown>[] = [];
  return {
    set(ref: unknown, data: DocumentData, options?: { merge?: boolean }) {
      operations.push({ type: "set", reference: (ref as CapRef).__capPath, data: serialize(data), merge: options?.merge ?? false });
    },
    update(ref: unknown, data: DocumentData) {
      const fields = Object.entries(data).map(([fieldPath, value]) => ({ fieldPath, value: serialize(value) }));
      operations.push({ type: "update", reference: (ref as CapRef).__capPath, fields });
    },
    delete(ref: unknown) {
      operations.push({ type: "delete", reference: (ref as CapRef).__capPath });
    },
    async commit() {
      const { FirebaseFirestore } = await import("@capacitor-firebase/firestore");
      await FirebaseFirestore.writeBatch({ operations } as Parameters<typeof FirebaseFirestore.writeBatch>[0]);
    },
  };
}
