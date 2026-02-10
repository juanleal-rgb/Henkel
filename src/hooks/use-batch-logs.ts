"use client";

import { useEffect, useRef, useCallback, useState } from "react";

export type BatchLogType = "connected" | "log" | "po_update" | "status_change";

export interface BatchLogEntry {
  type: BatchLogType;
  batchId: string;
  timestamp: string;
  currentStatus?: string;
  data?: {
    message?: string;
    level?: "info" | "warning" | "error" | "success";
    poId?: string;
    poNumber?: string;
    poLine?: number;
    oldStatus?: string;
    newStatus?: string;
    resolved?: boolean;
    reason?: string;
    outcome?: string;
    [key: string]: unknown;
  };
}

interface UseBatchLogsOptions {
  batchId: string;
  enabled?: boolean;
  onLog?: (entry: BatchLogEntry) => void;
  onPOUpdate?: (entry: BatchLogEntry) => void;
  onStatusChange?: (entry: BatchLogEntry) => void;
  onError?: (error: Event) => void;
}

export function useBatchLogs({
  batchId,
  enabled = true,
  onLog,
  onPOUpdate,
  onStatusChange,
  onError,
}: UseBatchLogsOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<BatchLogEntry[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);

  // Use refs to store callbacks so they don't trigger reconnection
  const onLogRef = useRef(onLog);
  const onPOUpdateRef = useRef(onPOUpdate);
  const onStatusChangeRef = useRef(onStatusChange);
  const onErrorRef = useRef(onError);

  // Update refs when callbacks change
  useEffect(() => {
    onLogRef.current = onLog;
  }, [onLog]);
  useEffect(() => {
    onPOUpdateRef.current = onPOUpdate;
  }, [onPOUpdate]);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const connect = useCallback(() => {
    if (!enabled || !batchId || typeof window === "undefined") return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(`/api/batches/${batchId}/events`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      reconnectAttempts.current = 0;
    };

    eventSource.onmessage = (e) => {
      try {
        const entry: BatchLogEntry = JSON.parse(e.data);

        // Add to logs array (for log type entries)
        if (entry.type === "log" || entry.type === "po_update" || entry.type === "status_change") {
          setLogs((prev) => [...prev, entry]);
        }

        // Call specific handlers via refs
        switch (entry.type) {
          case "log":
            onLogRef.current?.(entry);
            break;
          case "po_update":
            onPOUpdateRef.current?.(entry);
            break;
          case "status_change":
            onStatusChangeRef.current?.(entry);
            break;
        }
      } catch {
        // Ignore parse errors (heartbeat messages)
      }
    };

    eventSource.onerror = (e) => {
      setIsConnected(false);
      onErrorRef.current?.(e);

      // Exponential backoff reconnection
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
      reconnectAttempts.current += 1;

      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };
  }, [enabled, batchId]);

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

  const clearLogs = useCallback(() => {
    setLogs([]);
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

  // Reset logs when batchId changes
  useEffect(() => {
    setLogs([]);
  }, [batchId]);

  return {
    isConnected,
    logs,
    clearLogs,
    connect,
    disconnect,
  };
}
