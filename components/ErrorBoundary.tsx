"use client";

import { Component, ReactNode } from "react";

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div style={{ minHeight: "100dvh", background: "#090909", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 32, textAlign: "center" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, color: "#555" }}>error</span>
          <p style={{ color: "#888", fontSize: 14 }}>Something went wrong. Pull down to refresh.</p>
          <button onClick={() => window.location.reload()} style={{ marginTop: 8, padding: "10px 24px", borderRadius: 12, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "#f2f2f2", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
