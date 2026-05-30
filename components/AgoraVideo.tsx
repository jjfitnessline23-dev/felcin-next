"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  channelName: string;
  isHost: boolean;
  onCameraReady?: () => void;
}

export default function AgoraVideo({ channelName, isHost, onCameraReady }: Props) {
  const localRef = useRef<HTMLDivElement>(null);
  const remoteRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<unknown>(null);
  const tracksRef = useRef<unknown[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState("");
  const [remoteJoined, setRemoteJoined] = useState(false);

  const APP_ID = process.env.NEXT_PUBLIC_AGORA_APP_ID || "";

  useEffect(() => {
    if (!APP_ID) { setError("Agora App ID not configured"); return; }

    let cancelled = false;

    const init = async () => {
      try {
        // Dynamic import keeps Agora out of SSR
        const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
        AgoraRTC.setLogLevel(3); // warnings only

        const client = AgoraRTC.createClient({ mode: "live", codec: "vp8" });
        clientRef.current = client;

        await client.setClientRole(isHost ? "host" : "audience");
        // Join with null token (Testing mode — add token server for production)
        await client.join(APP_ID, channelName, null, null);

        if (isHost) {
          const [micTrack, cameraTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
            { encoderConfig: "music_standard" },
            { encoderConfig: { width: 720, height: 1280, frameRate: 30, bitrateMax: 2000 } }
          );
          tracksRef.current = [micTrack, cameraTrack];
          await client.publish([micTrack, cameraTrack]);
          if (localRef.current && !cancelled) {
            cameraTrack.play(localRef.current);
            onCameraReady?.();
          }
        } else {
          // Viewer: subscribe when host publishes
          client.on("user-published", async (remoteUser: any, mediaType: string) => {
            await client.subscribe(remoteUser, mediaType as any);
            if (mediaType === "video" && remoteRef.current && !cancelled) {
              remoteUser.videoTrack?.play(remoteRef.current);
              setRemoteJoined(true);
            }
            if (mediaType === "audio") {
              remoteUser.audioTrack?.play();
            }
          });
          client.on("user-unpublished", () => setRemoteJoined(false));
        }
      } catch (e: unknown) {
        if (!cancelled) setError((e as Error)?.message || "Could not access camera");
      }
    };

    init();

    return () => {
      cancelled = true;
      // Cleanup tracks and leave channel
      (tracksRef.current as any[]).forEach((t: any) => { try { t.stop(); t.close(); } catch {} });
      tracksRef.current = [];
      const c = clientRef.current as any;
      if (c) { try { c.leave(); } catch {} }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, isHost, APP_ID]);

  const toggleMic = async () => {
    const track = (tracksRef.current as any[])[0];
    if (!track) return;
    await track.setEnabled(!micOn);
    setMicOn((v) => !v);
  };

  const toggleCam = async () => {
    const track = (tracksRef.current as any[])[1];
    if (!track) return;
    await track.setEnabled(!camOn);
    setCamOn((v) => !v);
  };

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3" style={{ background: "#0a0a0a" }}>
        <span className="material-symbols-outlined" style={{ fontSize: 48, color: "#333" }}>videocam_off</span>
        <p className="text-sm text-center px-6" style={{ color: "#555" }}>{error}</p>
        {!APP_ID && (
          <p className="text-xs text-center px-6" style={{ color: "#444" }}>
            Add NEXT_PUBLIC_AGORA_APP_ID to Vercel environment variables
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full" style={{ background: "#000" }}>
      {/* Video container */}
      <div ref={isHost ? localRef : remoteRef} className="w-full h-full" style={{ background: "#000" }} />

      {/* Viewer: waiting for host */}
      {!isHost && !remoteJoined && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
          style={{ background: "#0a0a0a" }}>
          <div className="spinner" />
          <p className="text-sm" style={{ color: "#555" }}>Connecting to stream…</p>
        </div>
      )}

      {/* Host controls: mic + camera toggles */}
      {isHost && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3 z-10">
          <button onClick={toggleMic}
            className="w-12 h-12 rounded-full flex items-center justify-center border-none cursor-pointer"
            style={{ background: micOn ? "rgba(255,255,255,0.15)" : "rgba(239,68,68,0.8)" }}>
            <span className="material-symbols-outlined text-white" style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}>
              {micOn ? "mic" : "mic_off"}
            </span>
          </button>
          <button onClick={toggleCam}
            className="w-12 h-12 rounded-full flex items-center justify-center border-none cursor-pointer"
            style={{ background: camOn ? "rgba(255,255,255,0.15)" : "rgba(239,68,68,0.8)" }}>
            <span className="material-symbols-outlined text-white" style={{ fontSize: 22, fontVariationSettings: "'FILL' 1" }}>
              {camOn ? "videocam" : "videocam_off"}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
