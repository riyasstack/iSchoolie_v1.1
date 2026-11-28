"use client";
/**
 * Gliding selection pill: one absolutely positioned highlight that springs between the
 * items of a tab bar, dock or segmented control instead of each item lighting up on its own.
 *
 * Mark each item with `data-glide="<key>"`, put `ref` on a `position: relative` container
 * and render `pill` inside it (items need `relative z-[1]` to sit above it). A `memory` key
 * lets a tab bar that remounts on every route change glide from where the pill last was.
 */
import { useLayoutEffect, useRef, type ReactNode } from "react";
import clsx from "clsx";

type Box = { x: number; y: number; w: number; h: number };
const remembered = new Map<string, Box>();

export function useGlide<T extends HTMLElement>(activeKey: string | null | undefined, opts: { className?: string; memory?: string } = {}) {
  const ref = useRef<T>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const shown = useRef(false);
  const { memory } = opts;

  useLayoutEffect(() => {
    const container = ref.current;
    const pill = pillRef.current;
    if (!container || !pill) return;

    const measure = (): Box | null => {
      if (!activeKey) return null;
      const item = container.querySelector<HTMLElement>(`[data-glide="${CSS.escape(activeKey)}"]`);
      if (!item || !item.offsetWidth) return null;
      const c = container.getBoundingClientRect();
      const r = item.getBoundingClientRect();
      return { x: r.left - c.left - container.clientLeft + container.scrollLeft, y: r.top - c.top - container.clientTop + container.scrollTop, w: r.width, h: r.height };
    };
    const apply = (b: Box, animate: boolean) => {
      if (!animate) pill.style.transition = "none";
      pill.style.transform = `translate(${b.x}px, ${b.y}px)`;
      pill.style.width = `${b.w}px`;
      pill.style.height = `${b.h}px`;
      pill.style.opacity = "1";
      if (!animate) {
        void pill.offsetWidth; // commit the jump before transitions come back
        pill.style.transition = "";
      }
    };
    const place = (animate: boolean) => {
      const b = measure();
      if (!b) {
        pill.style.opacity = "0";
        shown.current = false;
        return;
      }
      if (!shown.current) {
        // First appearance: start from the remembered spot (if any) so the pill still glides.
        const from = memory ? remembered.get(memory) : undefined;
        if (from && animate && (from.x !== b.x || from.y !== b.y)) {
          apply(from, false);
          apply(b, true);
        } else apply(b, false);
      } else apply(b, animate);
      shown.current = true;
      if (memory) remembered.set(memory, b);
    };

    place(true);
    // Re-measure (without animating) only when the container really changes size; the
    // observer's first report is the current size and must not cut the glide short.
    let size = `${container.clientWidth}x${container.clientHeight}`;
    const ro = new ResizeObserver(() => {
      const next = `${container.clientWidth}x${container.clientHeight}`;
      if (next === size) return;
      size = next;
      place(false);
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [activeKey, memory]);

  const pill: ReactNode = <span ref={pillRef} aria-hidden="true" className={clsx("glide-pill", opts.className)} />;
  return { ref, pill };
}
