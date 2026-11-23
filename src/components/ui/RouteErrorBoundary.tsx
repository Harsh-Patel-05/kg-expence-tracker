import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; label?: string };
type State = { hasError: boolean; message: string };

/** Keeps the shell alive when a route/listener throws — blank screens become a recoverable panel. */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || "Something went wrong" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[RouteErrorBoundary]", this.props.label || "app", error, info);
  }

  componentDidUpdate(prev: Props) {
    if (prev.children !== this.props.children && this.state.hasError) {
      this.setState({ hasError: false, message: "" });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-[var(--radius-xl)] border border-danger/30 bg-card-0 p-8 text-center shadow-panel">
          <div className="text-lg font-bold text-text-primary">This screen hit a snag</div>
          <p className="mt-2 text-sm text-text-secondary">{this.state.message}</p>
          <button
            type="button"
            className="mt-4 rounded-[var(--rp-radius-btn)] bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-neonCyan)] hover:bg-primary-hover"
            onClick={() => this.setState({ hasError: false, message: "" })}
          >
            Try again
          </button>
          <button
            type="button"
            className="ml-2 mt-4 rounded-[var(--rp-radius-btn)] border border-stroke-0 bg-card-0 px-4 py-2.5 text-sm font-semibold text-text-secondary hover:bg-bg-1"
            onClick={() => window.location.reload()}
          >
            Refresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
