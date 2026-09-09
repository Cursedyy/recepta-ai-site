import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchAdmin } from '../api/painel-admin';

/**
 * useRealtimeDashboard — Live dashboard data with SSE + adaptive polling.
 *
 * Strategy:
 * 1. Fetch initial data via REST (instant, reliable).
 * 2. Open an SSE connection to /api/admin/events for push updates.
 * 3. If SSE is unavailable or disconnects, fall back to adaptive polling
 *    (5s when tab is active, 30s when backgrounded).
 * 4. Merges incoming events into local state without full refetches.
 */

const POLL_ACTIVE_MS = 5000;    // poll every 5s when tab visible
const POLL_IDLE_MS = 30000;     // poll every 30s when tab hidden
const SSE_RECONNECT_MS = 3000;  // retry SSE after 3s
const SSE_URL = '/api/admin/events';

export function useRealtimeDashboard() {
  const [metrics, setMetrics] = useState(null);
  const [clinicas, setClinicas] = useState([]);
  const [logs, setLogs] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // connecting | live | polling | disconnected
  const [lastUpdate, setLastUpdate] = useState(null);

  const pollingRef = useRef(null);
  const eventSourceRef = useRef(null);
  const mountedRef = useRef(true);

  // ── Initial data load ──
  const loadInitial = useCallback(async () => {
    try {
      const [metRes, clinRes, logRes] = await Promise.all([
        fetchAdmin('metricas'),
        fetchAdmin('clinicas'),
        fetchAdmin('logs', { limit: 20 }),
      ]);

      if (!mountedRef.current) return;

      if (metRes.ok) setMetrics(metRes.body);
      if (clinRes.ok) setClinicas(clinRes.body.clinicas || []);
      if (logRes.ok) setLogs(logRes.body.logs || []);

      setLastUpdate(new Date());
      setConnectionStatus('polling'); // will upgrade to 'live' if SSE connects
    } catch {
      if (mountedRef.current) setConnectionStatus('disconnected');
    }
  }, []);

  // ── Polling (adaptive) ──
  const startPolling = useCallback(() => {
    stopPolling();

    const tick = async () => {
      if (!mountedRef.current) return;
      try {
        const [metRes, clinRes, logRes] = await Promise.all([
          fetchAdmin('metricas'),
          fetchAdmin('clinicas'),
          fetchAdmin('logs', { limit: 20 }),
        ]);

        if (!mountedRef.current) return;

        if (metRes.ok) setMetrics(metRes.body);
        if (clinRes.ok) setClinicas(clinRes.body.clinicas || []);
        if (logRes.ok) setLogs(logRes.body.logs || []);

        setLastUpdate(new Date());
      } catch {
        // silent — will retry on next interval
      }

      // Schedule next poll with adaptive interval
      if (mountedRef.current) {
        const delay = document.hidden ? POLL_IDLE_MS : POLL_ACTIVE_MS;
        pollingRef.current = setTimeout(tick, delay);
      }
    };

    // First poll uses active interval
    pollingRef.current = setTimeout(tick, POLL_ACTIVE_MS);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // ── SSE (Server-Sent Events) ──
  const connectSSE = useCallback(() => {
    if (!mountedRef.current) return;
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const es = new EventSource(SSE_URL);
      eventSourceRef.current = es;

      es.onopen = () => {
        if (mountedRef.current) {
          setConnectionStatus('live');
          // SSE is live — stop polling
          stopPolling();
        }
      };

      // Handle metric updates
      es.addEventListener('metrics', (e) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(e.data);
          setMetrics((prev) => ({ ...prev, ...data }));
          setLastUpdate(new Date());
        } catch { /* ignore malformed */ }
      });

      // Handle new clinic events
      es.addEventListener('clinica', (e) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(e.data);
          if (data.event === 'created' || data.event === 'updated') {
            setClinicas((prev) => {
              const idx = prev.findIndex((c) => c.id === data.clinica?.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = data.clinica;
                return next;
              }
              return [data.clinica, ...prev];
            });
          } else if (data.event === 'deleted') {
            setClinicas((prev) => prev.filter((c) => c.id !== data.id));
          }
          setLastUpdate(new Date());
        } catch { /* ignore */ }
      });

      // Handle new activity log
      es.addEventListener('log', (e) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(e.data);
          setLogs((prev) => [data, ...prev].slice(0, 20));
          setLastUpdate(new Date());
        } catch { /* ignore */ }
      });

      // Generic message handler (fallback)
      es.onmessage = (e) => {
        if (!mountedRef.current) return;
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'metrics') {
            setMetrics((prev) => ({ ...prev, ...data.payload }));
            setLastUpdate(new Date());
          }
        } catch { /* ignore */ }
      };

      es.onerror = () => {
        if (!mountedRef.current) return;
        es.close();
        eventSourceRef.current = null;

        // Downgrade to polling
        setConnectionStatus('polling');
        startPolling();

        // Retry SSE after delay
        if (mountedRef.current) {
          setTimeout(() => {
            if (mountedRef.current) connectSSE();
          }, SSE_RECONNECT_MS);
        }
      };
    } catch {
      // SSE not supported — stay on polling
      setConnectionStatus('polling');
    }
  }, [startPolling, stopPolling]);

  // ── Lifecycle ──
  useEffect(() => {
    mountedRef.current = true;

    // Load initial data
    loadInitial().then(() => {
      if (!mountedRef.current) return;
      // Try SSE first, fall back to polling
      connectSSE();

      // If SSE doesn't connect within 2s, start polling as backup
      const fallbackTimer = setTimeout(() => {
        if (mountedRef.current && connectionStatus === 'connecting') {
          setConnectionStatus('polling');
          startPolling();
        }
      }, 2000);

      return () => clearTimeout(fallbackTimer);
    });

    return () => {
      mountedRef.current = false;
      stopPolling();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [loadInitial, connectSSE, startPolling, stopPolling]);

  // ── Visibility change: adjust polling speed ──
  useEffect(() => {
    function handleVisibility() {
      // If polling is active and tab becomes visible, poll immediately
      if (!document.hidden && pollingRef.current) {
        clearTimeout(pollingRef.current);
        pollingRef.current = setTimeout(async () => {
          try {
            const [metRes, clinRes, logRes] = await Promise.all([
              fetchAdmin('metricas'),
              fetchAdmin('clinicas'),
              fetchAdmin('logs', { limit: 20 }),
            ]);
            if (mountedRef.current) {
              if (metRes.ok) setMetrics(metRes.body);
              if (clinRes.ok) setClinicas(clinRes.body.clinicas || []);
              if (logRes.ok) setLogs(logRes.body.logs || []);
              setLastUpdate(new Date());
            }
          } catch { /* silent */ }

          if (mountedRef.current) {
            pollingRef.current = setTimeout(async () => {
              // Continue normal polling cycle
            }, POLL_ACTIVE_MS);
          }
        }, 100); // immediate-ish
      }
    }

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // ── Manual refresh ──
  const refresh = useCallback(async () => {
    setConnectionStatus('connecting');
    await loadInitial();
    if (connectionStatus !== 'live') {
      setConnectionStatus('polling');
      startPolling();
    }
  }, [loadInitial, startPolling, connectionStatus]);

  return {
    metrics,
    clinicas,
    logs,
    connectionStatus,
    lastUpdate,
    refresh,
  };
}
