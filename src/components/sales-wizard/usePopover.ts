"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Closes a popover on an outside click or Escape, and returns focus to the
 * control that opened it — otherwise the tab order restarts at the top of the
 * form after every pick.
 */
export function useDismissable(open: boolean, close: () => void): RefObject<HTMLDivElement | null> {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      event.stopPropagation();
      close();
      rootRef.current?.querySelector<HTMLElement>("[data-popover-trigger]")?.focus();
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return rootRef;
}
