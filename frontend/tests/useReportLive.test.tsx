import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

/**
 * The live channel for an open report: it watches only while asked to, passes
 * on only what concerns this report, watches again after a dropped connection,
 * and lets go when the report closes.
 */

const handlers: Record<string, (payload?: unknown) => void> = {};
let reconnected: () => void = () => {};
const hub = {
  on: vi.fn((event: string, handler: (payload?: unknown) => void) => { handlers[event] = handler; }),
  onreconnected: vi.fn((handler: () => void) => { reconnected = handler; }),
  start: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
  invoke: vi.fn(async () => true),
};
const urls: string[] = [];

vi.mock("@microsoft/signalr", () => {
  class HubConnectionBuilder {
    withUrl(url: string) { urls.push(url); return this; }
    withAutomaticReconnect() { return this; }
    configureLogging() { return this; }
    build() { return hub; }
  }
  return { HubConnectionBuilder, LogLevel: { Warning: 3 } };
});

type Hook = (options: Record<string, unknown>) => void;
let useReportLive: Hook;

beforeEach(async () => {
  urls.length = 0;
  for (const key of Object.keys(handlers)) delete handlers[key];
  Object.values(hub).forEach(fn => fn.mockClear());
  // tests/setup.ts stands in for this hook everywhere else; here it is the real one.
  ({ useReportLive } = await vi.importActual<{ useReportLive: Hook }>("@/lib/useReportLive"));
});

const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe("the live channel for a report", () => {
  it("connects only once the report is open", async () => {
    const { rerender } = renderHook((p: { active: boolean }) =>
      useReportLive({ token: "tok", analysisId: "a1", active: p.active }), { initialProps: { active: false } });
    expect(hub.start).not.toHaveBeenCalled();

    rerender({ active: true });
    await settle();

    expect(urls).toEqual(["http://test.local/hubs/report?access_token=tok"]);
    expect(hub.invoke).toHaveBeenCalledWith("WatchReport", "a1");
  });

  it("passes on saves of this report only, whatever the case of its id", async () => {
    const onSaved = vi.fn();
    renderHook(() => useReportLive({ token: "tok", analysisId: "abc-1", active: true, onSaved }));
    await settle();

    handlers.ReportSaved({ analysisId: "ABC-1", version: 2 });
    handlers.ReportSaved({ analysisId: "other", version: 9 });

    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith({ analysisId: "ABC-1", version: 2 });
  });

  it("says when this report is no longer theirs, and no other", async () => {
    const onRemoved = vi.fn();
    renderHook(() => useReportLive({ token: "tok", analysisId: "a1", active: true, onRemoved }));
    await settle();

    handlers.ReportAccessRemoved({ analysisId: "other" });
    expect(onRemoved).not.toHaveBeenCalled();
    handlers.ReportAccessRemoved({ analysisId: "a1" });
    expect(onRemoved).toHaveBeenCalledTimes(1);
  });

  it("watches again and catches up after the connection comes back", async () => {
    const onReconnected = vi.fn();
    renderHook(() => useReportLive({ token: "tok", analysisId: "a1", active: true, onReconnected }));
    await settle();
    hub.invoke.mockClear();

    reconnected();

    expect(hub.invoke).toHaveBeenCalledWith("WatchReport", "a1");
    expect(onReconnected).toHaveBeenCalledTimes(1);
  });

  it("lets go when the report closes", async () => {
    const { rerender } = renderHook((p: { active: boolean }) =>
      useReportLive({ token: "tok", analysisId: "a1", active: p.active }), { initialProps: { active: true } });
    await settle();

    rerender({ active: false });

    expect(hub.stop).toHaveBeenCalledTimes(1);
  });

  it("keeps working when the server cannot be reached", async () => {
    hub.start.mockRejectedValueOnce(new Error("offline"));
    renderHook(() => useReportLive({ token: "tok", analysisId: "a1", active: true }));
    await settle();

    expect(hub.invoke).not.toHaveBeenCalled();
  });
});
