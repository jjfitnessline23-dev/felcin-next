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

// Baked as a compile-time constant by Next.js — tree-shakes the unused branch.
const IS_CAP = process.env.NEXT_PUBLIC_CAPACITOR_BUILD === "true";

// ─── Exported db instance (still needed as first arg to doc/collection) ───────
export const db = _db;

// ─── Types ────────────────────────────────────────────────────────────────────
// Field values are `any` to match Firebase's own DocumentData — Firestore data is
// untyped at the boundary. Use docData<T>(snap) below when you want a real type.
export type DocumentData = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type QueryDocumentSnapshot = {
  id: string;
  exists(): boolean;
  // Typed non-undefined to match Firebase's QueryDocumentSnapshot (a doc in a
  // query result always has data). For getDoc(), guard with .exists() first.
  // options mirrors Firebase's SnapshotOptions (e.g. { serverTimestamps: "estimate" }).
  data(options?: any): DocumentData; // eslint-disable-line @typescript-eslint/no-explicit-any
  ref: DocRef;
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
};

// Typed accessor: docData<Post>(snap) returns the data cast to your interface,
// with the doc id merged in. Prefer this over `{ id: snap.id, ...snap.data() }`.
export function docData<T = DocumentData>(snap: { id: string; data(): DocumentData }): T & { id: string } {
  return { id: snap.id, ...(snap.data() || {}) } as T & { id: string };
}

// Shape returned by getDocs()/onSnapshot() — a clean, non-generic query result so
// call sites see QueryDocumentSnapshot (data(): DocumentData) instead of Firebase's
// generic Query<unknown> whose .data() resolves to `unknown`.
export type QuerySnap = {
  docs: QueryDocumentSnapshot[];
  empty: boolean;
  size: number;
  forEach: (fn: (d: QueryDocumentSnapshot) => void) => void;
};

// Union shape handed to an onSnapshot callback — a listener may be on a single doc
// (id/data/exists) or a collection query (docs/forEach/docChanges). All members are
// present so call sites can use whichever applies without casting.
export type Snapshot = {
  // collection-query shape
  docs: QueryDocumentSnapshot[];
  empty: boolean;
  size: number;
  forEach: (fn: (d: QueryDocumentSnapshot) => void) => void;
  docChanges: () => { type: "added" | "modified" | "removed"; doc: QueryDocumentSnapshot }[];
  // single-doc shape
  id: string;
  exists: () => boolean;
  data: (options?: any) => DocumentData; // eslint-disable-line @typescript-eslint/no-explicit-any
  ref: DocRef;
};

// Structural ref types — call sites only ever read .id/.path/.parent or pass refs
// back into these wrappers (which accept unknown), so a minimal shape is all that's
// needed. parent is `any` so admin collectionGroup path-walking (ref.parent.parent)
// type-checks; on the native branch it's undefined (guarded with ?.) at runtime.
export type DocRef = { id: string; path?: string; parent?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
export type CollRef = { id?: string; path?: string; parent?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

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

// ─── Timestamp ────────────────────────────────────────────────────────────────
// On web: use Firebase's real Timestamp so addDoc/setDoc serialize it correctly.
// On Capacitor: use a plain-object version serialized via serialize() before
// being sent to the native plugin.
class CapTimestamp {
  constructor(public readonly seconds: number, public readonly nanoseconds: number) {}
  toDate() { return new Date(this.seconds * 1000 + Math.round(this.nanoseconds / 1e6)); }
  toMillis() { return this.seconds * 1000 + Math.round(this.nanoseconds / 1e6); }
  isEqual(o: CapTimestamp) { return this.seconds === o.seconds && this.nanoseconds === o.nanoseconds; }
  static now() { return CapTimestamp.fromMillis(Date.now()); }
  static fromDate(d: Date) { const ms = d.getTime(); return new CapTimestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6); }
  static fromMillis(ms: number) { return new CapTimestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6); }
}
export const Timestamp: typeof fs.Timestamp = IS_CAP
  ? (CapTimestamp as unknown as typeof fs.Timestamp)
  : fs.Timestamp;

// ─── FieldValue markers (Capacitor path only) ────────────────────────────────
class CapFieldValue {
  constructor(public __capFV: string, public __val?: unknown) {}
}

// ─── Web-path sanitizer: converts any CapTimestamp that leaked through into a
// real Firebase Timestamp so writes never fail with "Unsupported field value".
// Firebase FieldValue sentinels (serverTimestamp, increment, arrayUnion, etc.)
// must be passed through unchanged — Object.entries() on them destroys the
// sentinel and causes Firestore to reject the write with "Unsupported field value".
function sanitizeForWeb(v: unknown): unknown {
  if (v instanceof CapTimestamp) return fs.Timestamp.fromMillis(v.toMillis());
  if (v instanceof fs.FieldValue) return v;
  if (Array.isArray(v)) return v.map(sanitizeForWeb);
  if (v && typeof v === "object" && !(v instanceof Date) && !(v instanceof fs.Timestamp)) {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, sanitizeForWeb(val)]));
  }
  return v;
}

// ─── Data serialization for native plugin ─────────────────────────────────────
function serialize(v: unknown): unknown {
  if (v instanceof CapFieldValue) {
    if (v.__capFV === "serverTimestamp") return { specialValue: "serverTimestamp" };
    if (v.__capFV === "increment") return { specialValue: "increment", value: v.__val };
    if (v.__capFV === "arrayUnion") return { specialValue: "arrayUnion", elements: v.__val };
    if (v.__capFV === "arrayRemove") return { specialValue: "arrayRemove", elements: v.__val };
  }
  if (v instanceof CapTimestamp) return { seconds: v.seconds, nanoseconds: v.nanoseconds };
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
    data: () => data as DocumentData,
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
export function doc(dbOrRef: unknown, ...pathSegments: string[]): DocRef {
  if (!IS_CAP) return (fs.doc as any)(dbOrRef, ...pathSegments) as DocRef;
  const path = pathSegments.join("/");
  return { __capPath: path, id: pathSegments[pathSegments.length - 1] } as unknown as DocRef;
}

export function collection(dbOrRef: unknown, ...pathSegments: string[]): CollRef {
  if (!IS_CAP) return (fs.collection as any)(dbOrRef, ...pathSegments) as CollRef;
  return { __capPath: pathSegments.join("/"), __capColl: true } as unknown as CollRef;
}

export function collectionGroup(dbInst: unknown, collectionId: string): CollRef {
  if (!IS_CAP) return (fs.collectionGroup as any)(dbInst, collectionId) as CollRef;
  return { __capPath: collectionId, __capColl: true, __capIsGroup: true } as unknown as CollRef;
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
export async function getDoc(ref: unknown): Promise<QueryDocumentSnapshot> {
  if (!IS_CAP) return (await fs.getDoc(ref as Parameters<typeof fs.getDoc>[0])) as unknown as QueryDocumentSnapshot;
  const { __capPath } = ref as CapRef;
  const { FirebaseFirestore } = await import("@capacitor-firebase/firestore");
  const result = await FirebaseFirestore.getDocument({ reference: __capPath });
  return makeSnap(result.snapshot as unknown as Record<string, unknown>, __capPath);
}

export async function getDocs(queryOrRef: unknown): Promise<QuerySnap> {
  if (!IS_CAP) return (await fs.getDocs(queryOrRef as Parameters<typeof fs.getDocs>[0])) as unknown as QuerySnap;
  const q = queryOrRef as CapQuery;
  const { compositeFilter, queryConstraints } = buildNativeQuery(q.__capConstraints || []);
  const { FirebaseFirestore } = await import("@capacitor-firebase/firestore");
  let snapshots: Record<string, unknown>[];
  if (q.__capIsGroup) {
    const r = await FirebaseFirestore.getCollectionGroup({ reference: q.__capPath, compositeFilter, queryConstraints } as unknown as Parameters<typeof FirebaseFirestore.getCollectionGroup>[0]);
    snapshots = (r.snapshots || []) as unknown as Record<string, unknown>[];
  } else {
    const r = await FirebaseFirestore.getCollection({ reference: q.__capPath, compositeFilter, queryConstraints } as unknown as Parameters<typeof FirebaseFirestore.getCollection>[0]);
    snapshots = (r.snapshots || []) as unknown as Record<string, unknown>[];
  }
  const docs = snapshots.map(s => makeSnap(s, `${q.__capPath}/${s.id}`));
  return { docs, empty: docs.length === 0, size: docs.length, forEach: (fn: (d: QueryDocumentSnapshot) => void) => docs.forEach(fn) };
}

// ─── Document writes ──────────────────────────────────────────────────────────
export async function setDoc(ref: unknown, data: DocumentData, options?: { merge?: boolean }) {
  if (!IS_CAP) return fs.setDoc(ref as Parameters<typeof fs.setDoc>[0], sanitizeForWeb(data) as DocumentData, options as Parameters<typeof fs.setDoc>[2]);
  const { __capPath } = ref as CapRef;
  const { FirebaseFirestore } = await import("@capacitor-firebase/firestore");
  await FirebaseFirestore.setDocument({ reference: __capPath, data: serialize(data) as DocumentData, merge: options?.merge ?? false });
}

export async function updateDoc(ref: unknown, data: DocumentData) {
  if (!IS_CAP) return fs.updateDoc(ref as Parameters<typeof fs.updateDoc>[0], sanitizeForWeb(data) as DocumentData);
  const { __capPath } = ref as CapRef;
  const { FirebaseFirestore } = await import("@capacitor-firebase/firestore");
  // Native plugin updateDocument uses fields array format
  const fields = Object.entries(data).map(([fieldPath, value]) => ({ fieldPath, value: serialize(value) }));
  await FirebaseFirestore.updateDocument({ reference: __capPath, fields } as unknown as Parameters<typeof FirebaseFirestore.updateDocument>[0]);
}

export async function addDoc(collRef: unknown, data: DocumentData): Promise<DocRef> {
  if (!IS_CAP) return (await fs.addDoc(collRef as Parameters<typeof fs.addDoc>[0], sanitizeForWeb(data) as DocumentData)) as unknown as DocRef;
  const { __capPath } = collRef as CapColl;
  const { FirebaseFirestore } = await import("@capacitor-firebase/firestore");
  const result = await FirebaseFirestore.addDocument({ reference: __capPath, data: serialize(data) as DocumentData });
  const id = result.reference?.id || "";
  return { id, __capPath: `${__capPath}/${id}` } as unknown as DocRef;
}

export async function deleteDoc(ref: unknown) {
  if (!IS_CAP) return fs.deleteDoc(ref as Parameters<typeof fs.deleteDoc>[0]);
  const { __capPath } = ref as CapRef;
  const { FirebaseFirestore } = await import("@capacitor-firebase/firestore");
  await FirebaseFirestore.deleteDocument({ reference: __capPath });
}

// ─── Real-time listeners ──────────────────────────────────────────────────────
// A snapshot passed to onSnapshot is either a single-doc snapshot (data()/exists())
// or a query snapshot (docs/forEach). Callbacks get `any` so both shapes are usable
// without casts — matching how the app already consumes them.
export function onSnapshot(refOrQuery: unknown, onNext: (snap: Snapshot) => void, onError?: (e: any) => void): () => void; // eslint-disable-line @typescript-eslint/no-explicit-any
export function onSnapshot(refOrQuery: unknown, options: unknown, onNext: (snap: Snapshot) => void, onError?: (e: any) => void): () => void; // eslint-disable-line @typescript-eslint/no-explicit-any
export function onSnapshot(refOrQuery: unknown, callbackOrOptions: unknown, maybeCallback?: unknown): () => void {
  // Normalize the two call shapes: (ref, onNext[, onError]) and (ref, options, onNext[, onError]).
  const optionsFirst = typeof callbackOrOptions !== "function";
  const onNext = (optionsFirst ? maybeCallback : callbackOrOptions) as (snap: unknown) => void;
  const providedError = (optionsFirst ? undefined : maybeCallback) as ((e: unknown) => void) | undefined;
  // Default handler so a listener error (permission denied, missing index, network)
  // is never swallowed silently — the historical cause of "stuck forever" spinners.
  const onError = (e: unknown) => {
    const path = (() => { try { const r = refOrQuery as any; return r?.__capPath || r?.path || "(unknown)"; } catch { return "(unknown)"; } })();
    console.error(`[Firestore onSnapshot] listener error on ${path}:`, e);
    providedError?.(e);
  };

  if (!IS_CAP) {
    return (optionsFirst
      ? fs.onSnapshot(refOrQuery as any, callbackOrOptions as any, onNext as any, onError as any)
      : fs.onSnapshot(refOrQuery as any, onNext as any, onError as any)
    ) as unknown as () => void;
  }

  const callback = onNext;
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
        { reference: q.__capPath, compositeFilter, queryConstraints } as unknown as Parameters<typeof FirebaseFirestore.addCollectionSnapshotListener>[0],
        ((event: Record<string, unknown> | null, error: unknown) => {
          if (unsubscribed) return;
          if (error) { onError(error); return; }
          const snaps = ((event?.snapshots || []) as Record<string, unknown>[]).map(s => makeSnap(s, `${q.__capPath}/${s.id}`));
          callback({ docs: snaps, empty: snaps.length === 0, size: snaps.length, forEach: (fn: (d: QueryDocumentSnapshot) => void) => snaps.forEach(fn) });
        }) as any
      ) as unknown as string;
    } else {
      const r = rq as CapRef;
      callbackId = await FirebaseFirestore.addDocumentSnapshotListener(
        { reference: r.__capPath },
        ((event: Record<string, unknown> | null, error: unknown) => {
          if (unsubscribed) return;
          if (error) { onError(error); return; }
          callback(makeSnap(event?.snapshot as unknown as Record<string, unknown>, r.__capPath));
        }) as any
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
      await FirebaseFirestore.writeBatch({ operations } as unknown as Parameters<typeof FirebaseFirestore.writeBatch>[0]);
    },
  };
}
