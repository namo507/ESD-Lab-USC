import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

const cardStyle: React.CSSProperties = {
  maxWidth: 460,
  textAlign: "center",
  border: "1px solid var(--border)",
  background: "var(--bg-surface)",
  borderRadius: "var(--r-card)",
  padding: 28,
};

const actionStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 34,
  padding: "6px 14px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "var(--bg-surface)",
  color: "var(--ink)",
  font: "inherit",
  fontSize: 13,
  textDecoration: "none",
  cursor: "pointer",
};

/**
 * Catches render-time errors from a route so a single failing component cannot
 * blank the whole dashboard. Remount it with a `key` (e.g. the pathname) to
 * reset the boundary on navigation.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error("Route error boundary caught:", error, info.componentStack);
    }
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div role="alert" style={{ padding: 40, display: "grid", placeItems: "center", minHeight: 320 }}>
        <div style={cardStyle}>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 600, color: "var(--ink)" }}>
            This view could not be displayed
          </div>
          <p style={{ color: "var(--slate-500)", fontSize: 14, margin: "10px 0 18px" }}>
            Something went wrong while rendering this page. Your session and the rest of the dashboard are unaffected.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button type="button" style={actionStyle} onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            <a
              style={{ ...actionStyle, background: "var(--usc-garnet)", borderColor: "var(--usc-garnet)", color: "#fff8f3" }}
              href="/overview"
            >
              Go to overview
            </a>
          </div>
          {import.meta.env.DEV && (
            <pre style={{ marginTop: 16, textAlign: "left", fontSize: 11, color: "var(--slate-500)", whiteSpace: "pre-wrap" }}>
              {error.message}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
