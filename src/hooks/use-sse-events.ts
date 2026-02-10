"use client";

import { useEffect, useRef, useCallback, useState } from "react";

// Event types from Redis pub/sub
export type AgentEventType =
  | "CONNECTED"
  | "CALL_STARTED"
  | "CALL_ENDED"
  | "AGENT_SPEAKING"
  | "LEAD_SPEAKING"
  | "ESCALATION_TRIGGERED"
  | "RUN_COMPLETED"
  | "RUN_FAILED"
  | "RUN_STATUS_CHANGED"
  | "NOTE_ADDED"
  | "STAGE_CHANGED"
  | "LEAD_UPDATED";

export interface AgentEvent {
  type: AgentEventType;
  data?: {
    leadId?: string;
    phone?: string;
    direction?: "inbound" | "outbound";
    callId?: string;
    agentRunId?: string;
    activityId?: string;
    duration?: number;
    outcome?: string;
    text?: string;
    reason?: string;
    priority?: string;
    wasTransferred?: boolean;
    stage?: string;
    previousStage?: string;
    prospect?: {
      firstName: string;
      lastName: string;
      phone: string;
    };
    program?: {
      name: string;
      code: string;
    } | null;
  };
  timestamp?: string;
}

interface UseSSEEventsOptions {
  url?: string;
  enabled?: boolean;
  onEvent?: (event: AgentEvent) => void;
  onError?: (error: Event) => void;
  onConnect?: () => void;
}

export function useSSEEvents({
  url = "/api/events",
  enabled = true,
  onEvent,
  onError,
  onConnect,
}: UseSSEEventsOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<AgentEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    if (!enabled || typeof window === "undefined") return;

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      reconnectAttempts.current = 0;
      onConnect?.();
    };

    eventSource.onmessage = (e) => {
      try {
        const event: AgentEvent = JSON.parse(e.data);
        setLastEvent(event);
        onEvent?.(event);
      } catch {
        // Ignore parse errors (e.g., heartbeat messages)
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
  }, [enabled, url, onEvent, onError, onConnect]);

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
