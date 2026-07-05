"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc, collection, getDocs, addDoc, query, orderBy, serverTimestamp, updateDoc, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import Link from "next/link";

interface ChallengeNode {
  id: string; userId: string; userName: string;
  userPhoto?: string; parentNodeId: string | null;
  completedAt?: { seconds: number };
}
interface Challenge {
  id: string; title: string; description?: string;
  creatorId: string; creatorName: string; creatorPhoto?: string;
  nodeCount?: number;
}

function timeAgo(seconds: number) {
  const d = Date.now() / 1000 - seconds;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export default function ChallengePage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useAuth();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [nodes, setNodes] = useState<ChallengeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  const alreadyJoined = user ? nodes.some((n) => n.userId === user.uid) : false;

  useEffect(() => {
    async function load() {
      try {
        const [chalSnap, nodesSnap] = await Promise.all([
          getDoc(doc(db, "challenges", id)),
          getDocs(query(collection(db, "challenges", id, "nodes"), orderBy("completedAt", "asc"))),
        ]);
        if (chalSnap.exists()) setChallenge({ id: chalSnap.id, ...(chalSnap.data() as Omit<Challenge, "id">) });
        setNodes(nodesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChallengeNode, "id">) })));
      } catch {}
      setLoading(false);
    }
    load();
  }, [id]);

  async function joinChain() {
    if (!user || joining || alreadyJoined) return;
    setJoining(true);
    try {
      const lastNode = nodes[nodes.length - 1];
      const ref = await addDoc(collection(db, "challenges", id, "nodes"), {
        userId: user.uid, userName: user.displayName || "User",
        userPhoto: user.photoURL || null, parentNodeId: lastNode?.id ?? null,
        completedAt: serverTimestamp(), taggedUsers: [],
      });
      await updateDoc(doc(db, "challenges", id), { nodeCount: increment(1) });
      setNodes((p) => [...p, {
        id: ref.id, userId: user.uid,
        userName: user.displayName || "User",
        userPhoto: user.photoURL || undefined,
        parentNodeId: lastNode?.id ?? null,
      }]);
      setShowJoin(false);
    } catch {}
    setJoining(false);
  }

  if (loading) return <div className="flex justify-center py-32"><div className="spinner" /></div>;
  if (!challenge) return (
    <div className="flex flex-col items-center justify-center py-32">
      <p className="text-lg font-semibold mb-3" style={{ color: "#f2f2f2" }}>Challenge not found</p>
      <Link href="/challenges" className="text-sm" style={{ color: "#888" }}>← Challenge Chains</Link>
    </div>
  );

  const creatorInit = (challenge.creatorName || "U").charAt(0).toUpperCase();

  return (
    <div className="max-w-xl mx-auto px-4 py-6">
      <Link href="/challenges" className="inline-flex items-center gap-1 text-sm mb-5" style={{ color: "#888" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
        Challenge Chains
      </Link>

      {/* Challenge info */}
      <div className="rounded-2xl p-5 mb-6" style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center gap-3 mb-3">
          {challenge.creatorPhoto
            ? <img src={challenge.creatorPhoto} alt="" className="rounded-full object-cover" style={{ width: 36, height: 36 }} />
            : <div className="rounded-full flex items-center justify-center font-bold" style={{ width: 36, height: 36, background: "#222", color: "#aaa" }}>{creatorInit}</div>}
          <div>
            <p className="text-xs" style={{ color: "#555" }}>Started by</p>
            <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>{challenge.creatorName}</p>
          </div>
        </div>
        <h1 className="text-xl font-bold mb-1" style={{ color: "#f2f2f2" }}>{challenge.title}</h1>
        {challenge.description && <p className="text-sm" style={{ color: "#666" }}>{challenge.description}</p>}
        <div className="flex items-center gap-2 mt-3">
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#555" }}>link</span>
          <span className="text-xs" style={{ color: "#555" }}>{nodes.length} {nodes.length === 1 ? "person" : "people"} in the chain</span>
        </div>
      </div>

      {/* Chain visualization */}
      <p className="text-xs font-bold mb-3 px-1" style={{ color: "#444" }}>THE CHAIN</p>
      <div className="flex flex-col mb-6">
        {nodes.map((node, i) => {
          const ninit = (node.userName || "U").charAt(0).toUpperCase();
          const isLast = i === nodes.length - 1;
          return (
            <div key={node.id} className="flex items-start">
              <div className="flex flex-col items-center" style={{ width: 48, flexShrink: 0 }}>
                <div className="rounded-full overflow-hidden flex items-center justify-center font-bold"
                  style={{ width: 40, height: 40, background: "#222", color: "#aaa", flexShrink: 0 }}>
                  {node.userPhoto
                    ? <img src={node.userPhoto} alt="" style={{ width: 40, height: 40, objectFit: "cover" }} />
                    : <span style={{ fontSize: 16 }}>{ninit}</span>}
                </div>
                {!isLast && (
                  <div style={{ width: 2, flex: 1, minHeight: 20, background: "rgba(255,255,255,0.08)", margin: "3px 0" }} />
                )}
              </div>
              <div className="flex-1 min-w-0 pb-4 pl-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold" style={{ color: "#f2f2f2" }}>{node.userName}</p>
                  {i === 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                      style={{ background: "rgba(255,255,255,0.06)", color: "#666" }}>Starter</span>
                  )}
                </div>
                {node.completedAt && (
                  <p className="text-xs mt-0.5" style={{ color: "#444" }}>{timeAgo(node.completedAt.seconds)}</p>
                )}
              </div>
            </div>
          );
        })}

        {/* Next link placeholder */}
        <div className="flex items-center">
          <div className="flex flex-col items-center" style={{ width: 48, flexShrink: 0 }}>
            <div className="rounded-full flex items-center justify-center"
              style={{ width: 40, height: 40, background: "rgba(255,255,255,0.03)", border: "2px dashed rgba(255,255,255,0.1)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: "#333" }}>person_add</span>
            </div>
          </div>
          <div className="flex-1 pl-3">
            <p className="text-sm" style={{ color: "#333" }}>Your turn</p>
          </div>
        </div>
      </div>

      {/* Join action */}
      {!user ? (
        <Link href="/login"
          className="block w-full py-3.5 rounded-2xl font-bold text-sm text-center"
          style={{ background: "#f2f2f2", color: "#000" }}>
          Sign in to join the chain
        </Link>
      ) : alreadyJoined ? (
        <div className="w-full py-3.5 rounded-2xl text-sm text-center font-semibold"
          style={{ background: "rgba(255,255,255,0.04)", color: "#555", border: "1px solid rgba(255,255,255,0.08)" }}>
          You&apos;re already in this chain
        </div>
      ) : (
        <button onClick={() => setShowJoin(true)}
          className="w-full py-3.5 rounded-2xl font-bold text-sm border-none cursor-pointer flex items-center justify-center gap-2"
          style={{ background: "#f2f2f2", color: "#000" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>link</span>
          Add Your Link
        </button>
      )}

      {/* Join modal */}
      {showJoin && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.8)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowJoin(false); }}>
          <div className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl overflow-y-auto"
            style={{ background: "#131313", border: "1px solid rgba(255,255,255,0.1)", maxHeight: "85dvh", marginBottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)", padding: "24px 24px calc(env(safe-area-inset-bottom, 16px) + 24px)" }}>
            <p className="text-base font-bold mb-1" style={{ color: "#f2f2f2" }}>Add Your Link</p>
            <p className="text-xs mb-5" style={{ color: "#555" }}>{challenge.title}</p>
            <p className="text-sm mb-5 leading-relaxed" style={{ color: "#666" }}>
              Complete the challenge, then confirm below to add yourself to the chain. Tag 3 followers to keep it going!
            </p>
            <button onClick={joinChain} disabled={joining}
              className="w-full py-3 rounded-xl font-bold text-sm border-none cursor-pointer"
              style={{ background: joining ? "rgba(255,255,255,0.08)" : "#f2f2f2", color: joining ? "#444" : "#000" }}>
              {joining ? "Adding…" : "I Completed It — Add Me"}
            </button>
            <button onClick={() => setShowJoin(false)}
              className="w-full py-2.5 mt-2 rounded-xl text-sm border-none cursor-pointer"
              style={{ background: "transparent", color: "#555" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
