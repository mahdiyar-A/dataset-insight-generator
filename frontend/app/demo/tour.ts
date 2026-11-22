'use client';

import { createContext, useContext, useEffect } from 'react';

import type { DigMood } from './DigFigure';
import type { PersonaId } from './demoFacts';

/**
 * What the demo's stops share. The tour (DemoTour) owns DIG, the plan being
 * shown, the tips found and the report's versions; each stop owns the rest of
 * its own state and stays mounted, so leaving a stop and coming back keeps it.
 */

export type Plan = 'free' | 'pro';

/** One thing DIG says, and how DIG looks while saying it. */
export type Line = { mood: DigMood; say: string };

/** One saved version of the sample report. `notes` are answers added from the chat. */
export type Draft = {
  title: string;
  order: number[];
  hidden: number[];
  notes: number[];
  by: 'You' | 'Sam';
};

export type Tour = {
  plan: Plan;
  setPlan: (plan: Plan) => void;
  /** DIG's bubble in the guide. */
  say: (line: Line) => void;
  /** DIG pops in at the corner to say what just happened. */
  done: (text: string) => void;
  seeTip: (id: string) => void;
  seen: ReadonlySet<string>;
  burst: () => void;
  persona: PersonaId | null;
  go: (stop: number) => void;
  drafts: Draft[];
  /** Saves a new version made from the newest one. */
  commit: (change: (current: Draft) => Draft, message: string, by?: Draft['by']) => void;
  undo: () => void;
  /** A stop tells the tour what DIG says when the visitor arrives there. */
  register: (stop: number, arrive: () => Line) => void;
};

export const TourContext = createContext<Tour | null>(null);

export function useTour(): Tour {
  const tour = useContext(TourContext);
  if (!tour) throw new Error('useTour is only for the demo tour');
  return tour;
}

/** Keeps the tour's arrival line for this stop current with the stop's state. */
export function useArrival(stop: number, arrive: () => Line) {
  const { register } = useTour();
  useEffect(() => {
    register(stop, arrive);
  });
}
