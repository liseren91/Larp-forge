"use client";

import { Component, type ReactNode } from "react";
import { Button } from "./ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8 text-center">
            <AlertTriangle size={48} className="text-amber-500" />
            <h2 className="text-lg font-semibold">Something went wrong</h2>
            <p className="max-w-md text-sm text-zinc-400">
              {this.state.error?.message ?? "An unexpected error occurred."}
            </p>
            <Button
              variant="secondary"
              onClick={() => this.setState({ hasError: false, error: undefined })}
            >
              Try Again
            </Button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
