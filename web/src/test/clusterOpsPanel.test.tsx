import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClusterOpsPanel } from "@/components/cluster/ClusterOpsPanel";

const { hookState } = vi.hoisted(() => ({
  hookState: {
    topologyError: false,
    pipelineError: false,
  },
}));

vi.mock("@/api/hooks", () => ({
  useClusterTopology: () => ({
    isLoading: false,
    isError: hookState.topologyError,
    data: hookState.topologyError
      ? undefined
      : {
          schema: "cluster_topology.v1",
          mode: "local",
          enabled: true,
          generated_at: "2026-06-03T00:00:00Z",
          degraded: false,
          errors: [],
          summary: {
            nodes: 1,
            pods: 0,
            deployments: 0,
            jobs: 0,
            cronjobs: 0,
            health: "simulated",
          },
          components: [
            {
              id: "local-runtime",
              name: "Local dashboard runtime",
              kind: "process",
              status: "ok",
              role: "dashboard",
            },
          ],
          edges: [],
        },
  }),
  useClusterPipeline: () => ({
    isLoading: false,
    isError: hookState.pipelineError,
    data: hookState.pipelineError
      ? undefined
      : {
          schema: "cluster_pipeline.v1",
          mode: "local",
          generated_at: "2026-06-03T00:00:00Z",
          state: "succeeded",
          queue_depth: 0,
          running: false,
          last_run: {},
          last_success: {
            event_id: "event-1",
            trigger_source: "unit-test",
            finished_at: "2026-06-03T00:01:00Z",
          },
          last_failure: null,
          last_duration_ms: 1200,
          last_trigger: "unit-test",
          degraded: false,
          freshness: {
            schema: "readings_freshness.v1",
            mode: "local",
            generated_at: "2026-06-03T00:00:00Z",
            total_indexed: 12,
            total_pages: 140,
            files_changed_since_last_run: 0,
            warnings: [],
          },
          events: [
            {
              event_id: "event-1",
              trigger_source: "unit-test",
              status: "succeeded",
              duration_ms: 1200,
              paths: ["paper.pdf"],
            },
          ],
        },
  }),
  useReadingsFreshness: () => ({
    isLoading: false,
    isError: false,
    data: {
      schema: "readings_freshness.v1",
      mode: "local",
      generated_at: "2026-06-03T00:00:00Z",
      total_indexed: 12,
      total_pages: 140,
      files_changed_since_last_run: 0,
      warnings: [],
    },
  }),
}));

describe("ClusterOpsPanel", () => {
  it("renders topology, freshness, and pipeline events", () => {
    hookState.topologyError = false;
    hookState.pipelineError = false;

    render(<ClusterOpsPanel />);

    expect(screen.getByText(/Kubernetes readings pipeline/i)).toBeInTheDocument();
    expect(screen.getByText(/Local dashboard runtime/i)).toBeInTheDocument();
    expect(screen.getByText(/event-1/i)).toBeInTheDocument();
    expect(screen.getByText(/readings · 12/i)).toBeInTheDocument();
  });

  it("renders offline telemetry state", () => {
    hookState.topologyError = true;
    hookState.pipelineError = true;

    render(<ClusterOpsPanel />);

    expect(screen.getByText(/Cluster telemetry is offline/i)).toBeInTheDocument();
  });
});
