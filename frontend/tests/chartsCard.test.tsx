import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ChartsCard from "@/components/chartsCard";
import BackendAPI from "@/lib/BackendAPI";

/**
 * The panel asked for charts without saying which analysis, so the request went
 * to /api/analyses/undefined/visualizations and the panel was always empty.
 */

vi.mock("@/app/contexts/AuthContext", () => ({ useAuth: () => ({ token: "tok" }) }));
vi.mock("@/app/contexts/SettingsContext", () => ({ useSettings: () => ({ lang: "en" }) }));

const charts = vi.fn();
const on = (over: { id: string; isPending?: boolean }) => ({ fileName: "jobs.xlsx", status: "done" as const, ...over });

beforeEach(() => {
  charts.mockReset().mockResolvedValue([
    { type: "bar", label: "Roles by sector", desc: "", color: "#3b82f6", url: "https://signed.example/0.png" },
  ]);
  BackendAPI.getVisualizations = charts as unknown as typeof BackendAPI.getVisualizations;
});

describe("the charts panel", () => {
  it("asks for the charts of the analysis on screen and shows them", async () => {
    render(<ChartsCard dataset={on({ id: "run-1" })} />);

    await waitFor(() => expect(charts).toHaveBeenCalledWith("tok", "run-1"));
    expect((await screen.findAllByText("Roles by sector")).length).toBeGreaterThan(0);
  });

  it("asks for nothing when no analysis is on screen", async () => {
    render(<ChartsCard dataset={null} />);

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(charts).not.toHaveBeenCalled();
  });

  it("asks for nothing while a new upload has no id yet", async () => {
    render(<ChartsCard dataset={on({ id: "", isPending: true })} />);

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(charts).not.toHaveBeenCalled();
  });

  it("asks again when the run finishes and the id arrives", async () => {
    const { rerender } = render(<ChartsCard dataset={on({ id: "", isPending: true })} />);

    rerender(<ChartsCard dataset={on({ id: "run-1", isPending: false })} />);

    await waitFor(() => expect(charts).toHaveBeenCalledWith("tok", "run-1"));
  });
});
