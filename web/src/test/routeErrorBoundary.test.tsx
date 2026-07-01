import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RouteErrorBoundary } from "@/components/shell/RouteErrorBoundary";

function Boom() {
  throw new Error("boom-xyz");
}

describe("RouteErrorBoundary", () => {
  it("renders children when nothing throws", () => {
    render(
      <RouteErrorBoundary>
        <div>safe content</div>
      </RouteErrorBoundary>,
    );
    expect(screen.getByText("safe content")).toBeInTheDocument();
  });

  it("shows a fallback instead of crashing the tree when a child throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <RouteErrorBoundary>
        <Boom />
      </RouteErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/could not be displayed/i)).toBeInTheDocument();
    // recovery affordances are present
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go to overview/i })).toBeInTheDocument();
    spy.mockRestore();
  });
});
