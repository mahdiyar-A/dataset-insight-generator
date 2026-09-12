import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HistoryTape from "@/components/HistoryTape";
import type { Analysis } from "@/lib/types";

/**
 * The history tape is now the primary way to reach a past analysis, so the
 * behaviours here are load-bearing rather than cosmetic.
 *
 * Context worth keeping in mind: until recently every history entry resolved to
 * the same stored files, because only Word and PowerPoint were keyed by
 * analysis id. Thumbnails made that bug visible — every card showed an
 * identical chart. These tests assert each card carries its own data.
 */

function analysis(over: Partial<Analysis> = {}): Analysis {
  return {
    id: "a1",
    fileName: "sales.csv",
    status: "done",
    completedAt: "2026-03-01T10:00:00Z",
    rowCount: 1200,
    hasPdfReport: true,
    ...over,
  };
}

describe("HistoryTape rendering", () => {
  it("renders one card per analysis", () => {
    render(<HistoryTape history={[
      analysis({ id: "a1", fileName: "jan.csv" }),
      analysis({ id: "a2", fileName: "feb.csv" }),
      analysis({ id: "a3", fileName: "mar.csv" }),
    ]} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("gives each card its own thumbnail", () => {
    // Risk: this is what made the shared-storage bug visible. Identical
    // thumbnails across entries mean the files have collided again.
    //
    // Queried by tag rather than role: the thumbnail carries alt="" because the
    // card button already supplies the accessible name, so its ARIA role is
    // "presentation" and it is correctly invisible to role-based queries.
    const { container } = render(<HistoryTape history={[
      analysis({ id: "a1", fileName: "jan.csv", thumbnailUrl: "https://cdn/a1.png" }),
      analysis({ id: "a2", fileName: "feb.csv", thumbnailUrl: "https://cdn/a2.png" }),
    ]} />);

    const sources = Array.from(container.querySelectorAll("img"))
      .map(img => img.getAttribute("src"));

    expect(sources).toHaveLength(2);
    expect(new Set(sources).size).toBe(sources.length);
  });

  it("thumbnails are marked decorative, not announced twice", () => {
    // The enclosing button is already labelled "Load jan.csv". A descriptive
    // alt here would make a screen reader read the same file name twice.
    const { container } = render(<HistoryTape history={[
      analysis({ fileName: "jan.csv", thumbnailUrl: "https://cdn/a1.png" }),
    ]} />);

    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });

  it("falls back to a placeholder when an analysis has no thumbnail", () => {
    // Risk: a missing chart must not render a broken image icon.
    const { container } = render(<HistoryTape history={[analysis({ thumbnailUrl: null })]} />);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("listitem")).toBeInTheDocument();
  });

  it("shows a badge for each generated output", () => {
    render(<HistoryTape history={[analysis({
      hasPdfReport: true, hasWordReport: true, hasPptx: false, hasCleanedCsv: true,
    })]} />);

    const card = screen.getByRole("listitem");
    expect(within(card).getByText("PDF")).toBeInTheDocument();
    expect(within(card).getByText("DOC")).toBeInTheDocument();
    expect(within(card).getByText("CSV")).toBeInTheDocument();
    expect(within(card).queryByText("PPT")).toBeNull();
  });

  it("shows an empty state rather than a blank strip", () => {
    render(<HistoryTape history={[]} />);
    expect(screen.getByText(/no analyses yet/i)).toBeInTheDocument();
  });

  it("reports usage against the plan limit", () => {
    render(<HistoryTape history={[analysis()]} plan="free" />);
    expect(screen.getByText("1 / 5")).toBeInTheDocument();
  });

  it("uses the pro limit for pro users", () => {
    render(<HistoryTape history={[analysis()]} plan="pro" />);
    expect(screen.getByText("1 / 15")).toBeInTheDocument();
  });
});

describe("HistoryTape interaction", () => {
  it("loads the analysis that was clicked", async () => {
    // Risk: passing the wrong item — or an index — loads someone else's
    // analysis into the dashboard.
    const onLoad = vi.fn();
    const feb = analysis({ id: "a2", fileName: "feb.csv" });

    render(<HistoryTape
      history={[analysis({ id: "a1", fileName: "jan.csv" }), feb]}
      onLoad={onLoad}
    />);

    await userEvent.click(screen.getByRole("button", { name: /load feb\.csv/i }));

    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledWith(feb);
  });

  it("requires confirmation before deleting", async () => {
    // Risk: a single mis-click destroying an analysis and its files, which the
    // backend now deletes for real.
    const onDelete = vi.fn();
    render(<HistoryTape history={[analysis({ fileName: "sales.csv" })]} onDelete={onDelete} />);

    const card = screen.getByRole("listitem");
    await userEvent.hover(card);
    await userEvent.click(within(card).getByRole("button", { name: /delete sales\.csv/i }));

    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("a1");
  });

  it("cancelling the confirmation deletes nothing", async () => {
    const onDelete = vi.fn();
    render(<HistoryTape history={[analysis({ fileName: "sales.csv" })]} onDelete={onDelete} />);

    const card = screen.getByRole("listitem");
    await userEvent.hover(card);
    await userEvent.click(within(card).getByRole("button", { name: /delete sales\.csv/i }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("listitem")).toBeInTheDocument();
  });

  it("pinning moves an entry to the front", async () => {
    // Pinning exists so a reference analysis stays reachable while the user
    // works through newer ones — it has to actually reorder.
    render(<HistoryTape history={[
      analysis({ id: "a1", fileName: "jan.csv" }),
      analysis({ id: "a2", fileName: "feb.csv" }),
      analysis({ id: "a3", fileName: "mar.csv" }),
    ]} />);

    const third = screen.getAllByRole("listitem")[2];
    await userEvent.hover(third);
    await userEvent.click(within(third).getByRole("button", { name: /^pin$/i }));

    const first = screen.getAllByRole("listitem")[0];
    expect(within(first).getByText("mar.csv")).toBeInTheDocument();
  });

  it("pin state is exposed to assistive technology", async () => {
    render(<HistoryTape history={[analysis({ fileName: "jan.csv" })]} />);

    const card = screen.getByRole("listitem");
    await userEvent.hover(card);
    const pin = within(card).getByRole("button", { name: /^pin$/i });

    expect(pin).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(pin);
    expect(within(screen.getByRole("listitem")).getByRole("button", { name: /unpin/i }))
      .toHaveAttribute("aria-pressed", "true");
  });

  it("offers an upgrade only when a free user is at the limit", async () => {
    const onUpgrade = vi.fn();
    const five = Array.from({ length: 5 }, (_, i) =>
      analysis({ id: `a${i}`, fileName: `f${i}.csv` }));

    const { rerender } = render(
      <HistoryTape history={five.slice(0, 3)} plan="free" onUpgrade={onUpgrade} />);
    expect(screen.queryByRole("button", { name: /upgrade/i })).toBeNull();

    rerender(<HistoryTape history={five} plan="free" onUpgrade={onUpgrade} />);
    await userEvent.click(screen.getByRole("button", { name: /upgrade/i }));

    expect(onUpgrade).toHaveBeenCalled();
  });

  it("never offers an upgrade to a pro user", () => {
    const fifteen = Array.from({ length: 15 }, (_, i) =>
      analysis({ id: `a${i}`, fileName: `f${i}.csv` }));

    render(<HistoryTape history={fifteen} plan="pro" />);

    expect(screen.queryByRole("button", { name: /upgrade/i })).toBeNull();
  });

  it("exposes scroll controls, so the strip is reachable without a trackpad", () => {
    render(<HistoryTape history={[analysis()]} />);

    expect(screen.getByRole("button", { name: /scroll history left/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /scroll history right/i })).toBeInTheDocument();
  });
});
