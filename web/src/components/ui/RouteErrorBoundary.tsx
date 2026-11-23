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
        <div className="rounded-[28px] border border-rose-200 bg-white/95 p-8 text-center shadow-lg">
          <div className="text-lg font-extrabold text-slate-900">This screen hit a snag</div>
          <p className="mt-2 text-sm text-slate-600">{this.state.message}</p>
          <button
            type="button"
            className="mt-4 rounded-2xl bg-gradient-to-r from-teal-500 to-cyan-500 px-4 py-2.5 text-sm font-bold text-white shadow-md"
            onClick={() => this.setState({ hasError: false, message: "" })}
          >
            Try again
          </button>
          <button
            type="button"
            className="ml-2 mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
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
