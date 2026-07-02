/*
 * useMetrics.js — Polls metrics for the current room.
 * Used by the performance dashboard (Day 21).
 * Also used by experiment scripts (Days 25-26).
 */
import { useState, useEffect, useCallback } from 'react'
import api from '../api/client'

const POLL_INTERVAL_MS = 5000

export default function useMetrics(roomId, socket) {
  const [metrics, setMetrics] = useState(null)

  useEffect(() => {
    if (!roomId) return

    let cancelled = false

    async function poll() {
      try {
        const res = await api.get(`/metrics/${roomId}`)
        if (!cancelled) setMetrics(res.data.data)
      } catch {
        // No metrics yet for this room (e.g. before the first edit) — skip this tick.
      }
    }

    poll()
    const interval = setInterval(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [roomId])

  useEffect(() => {
    if (!socket) return

    function handleSnapshot(data) {
      setMetrics((prev) => ({ ...prev, ...data }))
    }

    socket.on('metrics_snapshot', handleSnapshot)
    return () => socket.off('metrics_snapshot', handleSnapshot)
  }, [socket])

  const requestSnapshot = useCallback(() => {
    socket?.emit('request_metrics', { roomId })
  }, [socket, roomId])

  return { metrics, requestSnapshot }
}
