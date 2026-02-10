"use client";

import { useCallback, useRef } from "react";

export interface Position {
  x: number;
  y: number;
}

export function useBlobPositions(stageRefs: React.RefObject<Map<string, HTMLDivElement>>) {
  // Cache positions to avoid excessive getBoundingClientRect calls
  const positionCache = useRef<Map<string, Position>>(new Map());
  const lastUpdateTime = useRef<number>(0);
  const CACHE_TTL = 100; // ms

  const getPosition = useCallback(
    (stageId: string): Position | null => {
      const now = Date.now();
      const cached = positionCache.current.get(stageId);

      // Return cached position if still valid
      if (cached && now - lastUpdateTime.current < CACHE_TTL) {
        return cached;
      }

      const el = stageRefs.current?.get(stageId);
      if (!el) return null;

      const rect = el.getBoundingClientRect();
      const position: Position = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };

      positionCache.current.set(stageId, position);
      lastUpdateTime.current = now;

      return position;
    },
    [stageRefs]
  );

  // Get position of a child blob (substate) within a stage
  const getSubStatePosition = useCallback(
    (stageId: string, subStateId: string): Position | null => {
      const stageEl = stageRefs.current?.get(stageId);
      if (!stageEl) return null;

      // Find the child blob element
      const childBlob = stageEl.querySelector(`[data-substate="${subStateId}"]`) as HTMLElement;
      if (!childBlob) {
        // Fallback to stage position if child not found
        return getPosition(stageId);
      }

      const rect = childBlob.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    },
    [stageRefs, getPosition]
  );

  // Invalidate cache (call when layout changes)
  const invalidateCache = useCallback(() => {
    positionCache.current.clear();
    lastUpdateTime.current = 0;
  }, []);

  return {
    getPosition,
    getSubStatePosition,
    invalidateCache,
  };
}
