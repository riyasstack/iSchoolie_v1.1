"use client";
/**
 * Pull to refresh for phones: drag down from the very top of the Feed and let go past the
 * mark to reload it. The spinner rotates with the pull, and a light tick buzzes (where
 * supported) as you cross the mark. The browser's own pull-to-reload is switched off in CSS.
 */
import { useEffect, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { PHONE_QUERY } from "@/components/ui/use-phone";

const TRIGGER = 72;
const MAX = 124;

export function PullToRefresh({ onRefresh }: { onRefresh: () => Promise<unknown> }) {
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const refresh = useRef(onRefresh);
  useEffect(() => {
    refresh.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const phone = window.matchMedia(PHONE_QUERY);
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let decided = false;
    let armed = false;
    let dist = 0;
    const onStart = (e: TouchEvent) => {
      if (!phone.matches || busyRef.current || window.scrollY > 0 || e.touches.length !== 1) return;
      if ((e.target as HTMLElement | null)?.closest?.('[role="dialog"],input,textarea,[contenteditable="true"],[data-no-ptr]')) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
      decided = false;
      armed = false;
      dist = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!decided) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        decided = true;
        // Sideways swipes (the classmates rail, galleries) and upward scrolls aren't pulls.
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) {
          tracking = false;
          return;
        }
        setDragging(true);
      }
      dist = Math.min(MAX, Math.max(0, dy) * 0.5);
      if (dist >= TRIGGER && !armed) {
        armed = true;
        navigator.vibrate?.(8);
      } else if (dist < TRIGGER) armed = false;
      setPull(dist);
    };
    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      setDragging(false);
      if (dist < TRIGGER) {
        setPull(0);
        return;
      }
      busyRef.current = true;
      setBusy(true);
      setPull(TRIGGER * 0.7);
      const started = Date.now();
      refresh
        .current()
        .catch(() => {})
        .finally(() => {
          // Keep the spinner up long enough to read as "refreshed", not as a flicker.
          setTimeout(() => {
            busyRef.current = false;
            setBusy(false);
            setPull(0);
          }, Math.max(0, 650 - (Date.now() - started)));
        });
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const progress = Math.min(1, pull / TRIGGER);
  return (
    <>
      <div
        aria-hidden="true"
        className="ptr sm:hidden"
        style={{
          transform: `translateY(${pull - 46}px) scale(${0.6 + 0.4 * progress})`,
          opacity: busy ? 1 : progress,
          transition: dragging ? "none" : "transform 320ms var(--ease-out), opacity 220ms var(--ease-out)",
        }}
      >
        <RotateCw size={18} strokeWidth={2.4} className={busy ? "spin" : undefined} style={busy ? undefined : { transform: `rotate(${pull * 4}deg)` }} />
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {busy ? "Refreshing your Feed" : ""}
      </span>
    </>
  );
}
