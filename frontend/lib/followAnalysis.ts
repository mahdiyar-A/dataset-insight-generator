/**
 * Follows one analysis until it ends, and it always ends.
 *
 * The page used to check for as long as it stayed open and treated every failure
 * as a network blip, so a run it could not see looked like a run still going. A
 * person watched "Running…" for 15 minutes over a report finished in 6 seconds.
 */

export type RunOutcome = "done" | "failed" | "lost";

export const CHECK_EVERY_MS = 10_000;

/** A run waiting for a free slot has no row yet, so a short silence is normal. */
export const NO_ANSWER_LIMIT_MS = 3 * 60_000;

/** Longer than the 6 minutes the server gives a run. */
export const RUN_LIMIT_MS = 10 * 60_000;

type Follow = {
  /** Null means the server has no such run. Reads the token on every call. */
  check: () => Promise<{ status: string } | null>;
  onStatus: (status: string) => void;
  onEnd: (outcome: RunOutcome) => void;
};

/** Starts following. Returns a function that stops without calling onEnd. */
export function followAnalysis({ check, onStatus, onEnd }: Follow): () => void {
  const started = Date.now();
  let lastAnswer = started;
  let stopped = false;

  const stop = () => {
    stopped = true;
    clearInterval(timer);
  };

  const tick = async () => {
    const answer = await check().catch(() => null);
    if (stopped) return;

    const now = Date.now();
    if (answer) {
      lastAnswer = now;
      onStatus(answer.status);
      if (answer.status === "done" || answer.status === "failed") {
        stop();
        onEnd(answer.status);
        return;
      }
    }
    if (now - lastAnswer >= NO_ANSWER_LIMIT_MS || now - started >= RUN_LIMIT_MS) {
      stop();
      onEnd("lost");
    }
  };

  const timer = setInterval(tick, CHECK_EVERY_MS);
  return stop;
}
