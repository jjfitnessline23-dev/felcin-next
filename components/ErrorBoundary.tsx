"use client";

import { Component, ReactNode } from "react";
import OutageScreen from "./OutageScreen";

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? <OutageScreen showReload />;
    }
    return this.props.children;
  }
}
