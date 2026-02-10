"use client";

import { useEffect, useRef, useCallback, useState } from "react";

export type PipelineEventType =
  | "connected"
  | "batch_queued"
  | "batch_started"
  | "batch_completed"
  | "batch_retry";

export interface PipelineEvent {
  type: PipelineEventType;
  batchId?: string;
  supplierId?: string;
  value?: number;
  poCount?: number;
  actionTypes?: string[];
  externalUrl?: string;
  outcome?: "success" | "partial" | "failed";
  reason?: string;
  attemptCount?: number;
  scheduledFor?: string;
}

interface UsePipelineEventsOptions {
  enabled?: boolean;
  onEvent?: (event: PipelineEvent) => void;
  onBatchQueued?: (event: PipelineEvent) => void;
  onBatchStarted?: (event: PipelineEvent) => void;
  onBatchCompleted?: (event: PipelineEvent) => void;
  onError?: (error: Event) => void;
}

export function usePipelineEvents({
  enabled = true,
  onEvent,
  onBatchQueued,
  onBatchStarted,
  onBatchCompleted,
  onError,
}: UsePipelineEventsOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<PipelineEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    if (!enabled || typeof window === "undefined") return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource("/api/pipeline/events");
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      reconnectAttempts.current = 0;
    };

    eventSource.onmessage = (e) => {
      try {
        const event: PipelineEvent = JSON.parse(e.data);
        setLastEvent(event);
        onEvent?.(event);

        // Call specific handlers
        switch (event.type) {
          case "batch_queued":
            onBatchQueued?.(event);
            break;
          case "batch_started":
            onBatchStarted?.(event);
            break;
          case "batch_completed":
            onBatchCompleted?.(event);
            break;
        }
      } catch {
        // Ignore parse errors (heartbeat messages)
      }
    };

    eventSource.onerror = (e) => {
      setIsConnected(false);
      onError?.(e);

      // Exponential backoff reconnection
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
      reconnectAttempts.current += 1;

      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };
  }, [enabled, onEvent, onBatchQueued, onBatchStarted, onBatchCompleted, onError]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    isConnected,
    lastEvent,
    connect,
    disconnect,
  };
}
