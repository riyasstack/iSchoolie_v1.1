"use client";
import { useSyncExternalStore } from "react";

/** Matches the layout breakpoint below which iSchoolie uses its phone chrome (Tailwind's `sm`). */
export const PHONE_QUERY = "(max-width: 639px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches, () => false);
}
