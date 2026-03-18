import React from "react";
import { captureClientError } from "@/lib/error-tracking";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    void captureClientError({
      source: "react.error-boundary",
      level: "fatal",
      message: error.message || "React render crash",
      error,
      stack: error.stack,
      componentStack: errorInfo.componentStack || undefined,
      extra: {
        digest: (error as Error & { digest?: string | null }).digest || undefined,
      },
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 text-card-foreground shadow-lg">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Something went wrong
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-foreground">
            We hit an unexpected error.
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            The issue has been logged so it can be investigated. Reload the page to try again.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-6 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
