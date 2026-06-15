import { useEffect, useRef } from 'react';

export function usePolling(callback: () => void, intervalMs: number = 10000) {
  const savedCallback = useRef(callback);

  // Remember the latest callback if it changes.
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval.
  useEffect(() => {
    const tick = () => {
      savedCallback.current();
    };

    if (intervalMs !== null) {
      const id = setInterval(tick, intervalMs);
      return () => clearInterval(id);
    }
  }, [intervalMs]);
}
