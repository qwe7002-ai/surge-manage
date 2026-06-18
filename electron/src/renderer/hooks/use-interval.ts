import { useEffect, useRef } from "react";

/** Calls `cb` every `delayMs`. Pass `delayMs = null` to pause. */
export function useInterval(cb: () => void, delayMs: number | null): void {
  const saved = useRef(cb);
  useEffect(() => {
    saved.current = cb;
  }, [cb]);
  useEffect(() => {
    if (delayMs === null) return;
    const id = setInterval(() => saved.current(), delayMs);
    return () => clearInterval(id);
  }, [delayMs]);
}
