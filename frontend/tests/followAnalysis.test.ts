import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECK_EVERY_MS, NO_ANSWER_LIMIT_MS, RUN_LIMIT_MS, followAnalysis } from "@/lib/followAnalysis";

/** A run the page follows always ends, whatever the server says or fails to say. */

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function follow(check: () => Promise<{ status: string } | null>) {
  const onStatus = vi.fn();
  const onEnd = vi.fn();
  const stop = followAnalysis({ check, onStatus, onEnd });
  return { onStatus, onEnd, stop };
}

describe("a run the server can see", () => {
  it("ends when the run is done, and stops checking", async () => {
    const check = vi.fn().mockResolvedValue({ status: "done" });
    const { onEnd } = follow(check);

    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS * 3);

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith("done");
    expect(check).toHaveBeenCalledTimes(1);
  });

  it("ends when the run failed", async () => {
    const { onEnd } = follow(vi.fn().mockResolvedValue({ status: "failed" }));

    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS);

    expect(onEnd).toHaveBeenCalledWith("failed");
  });

  it("waits while the run is going", async () => {
    const { onEnd, onStatus } = follow(vi.fn().mockResolvedValue({ status: "processing" }));

    await vi.advanceTimersByTimeAsync(RUN_LIMIT_MS - CHECK_EVERY_MS);

    expect(onEnd).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith("processing");
  });

  it("gives up on a run that never finishes", async () => {
    const check = vi.fn().mockResolvedValue({ status: "processing" });
    const { onEnd } = follow(check);

    await vi.advanceTimersByTimeAsync(RUN_LIMIT_MS);

    expect(onEnd).toHaveBeenCalledWith("lost");
    const checks = check.mock.calls.length;
    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS * 5);
    expect(check).toHaveBeenCalledTimes(checks);
  });
});

describe("a run the server cannot see", () => {
  it("gives up when the server keeps saying there is no such run", async () => {
    const { onEnd } = follow(vi.fn().mockResolvedValue(null));

    await vi.advanceTimersByTimeAsync(NO_ANSWER_LIMIT_MS);

    expect(onEnd).toHaveBeenCalledWith("lost");
  });

  it("gives up when every check fails", async () => {
    const { onEnd } = follow(vi.fn().mockRejectedValue(new Error("401")));

    await vi.advanceTimersByTimeAsync(NO_ANSWER_LIMIT_MS);

    expect(onEnd).toHaveBeenCalledWith("lost");
  });

  it("rides out a short blip", async () => {
    const check = vi.fn()
      .mockRejectedValueOnce(new Error("blip"))
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ status: "done" });
    const { onEnd } = follow(check);

    await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS * 3);

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledWith("done");
  });

  it("starts the silence over after any answer", async () => {
    let silent = false;
    const check = vi.fn(async () => (silent ? null : { status: "processing" }));
    const { onEnd } = follow(check);

    await vi.advanceTimersByTimeAsync(NO_ANSWER_LIMIT_MS);
    silent = true;
    await vi.advanceTimersByTimeAsync(NO_ANSWER_LIMIT_MS - CHECK_EVERY_MS);

    expect(onEnd).not.toHaveBeenCalled();
  });
});

it("stopping ends the checks without an outcome", async () => {
  const check = vi.fn().mockResolvedValue({ status: "processing" });
  const { onEnd, stop } = follow(check);

  stop();
  await vi.advanceTimersByTimeAsync(CHECK_EVERY_MS * 3);

  expect(check).not.toHaveBeenCalled();
  expect(onEnd).not.toHaveBeenCalled();
});
