/*
 * useFileTabs.js — Manages which files are open as tabs.
 * Separate from useSync (which handles the CRDT per file).
 * Tracks: openTabs[], activeTab, per-tab unsaved state.
 */
import { useState, useCallback, useEffect, useRef } from 'react'

export default function useFileTabs(initialFiles = []) {
  // openTabs: array of file names currently open as tabs
  const [openTabs, setOpenTabs] = useState(initialFiles.length > 0 ? [initialFiles[0].name] : [])

  // activeTab: which tab is currently shown in Monaco
  const [activeTab, setActiveTab] = useState(initialFiles.length > 0 ? initialFiles[0].name : null)

  // dirtyTabs: Set of file names with unsaved changes
  const [dirtyTabs, setDirtyTabs] = useState(new Set())

  // Room.jsx calls useFileTabs(room?.files || []) unconditionally on every
  // render (hooks can't be called after an early return), but `room` is
  // still null on the very first render — before the join_room round trip
  // completes. useState only applies its initializer on that first render,
  // so if real files only became available later, openTabs/activeTab would
  // otherwise stay permanently empty with no tab ever opening automatically.
  // This backfills exactly once, the first time real file data shows up.
  const hasInitializedRef = useRef(initialFiles.length > 0)
  useEffect(() => {
    if (hasInitializedRef.current) return
    if (initialFiles.length === 0) return
    hasInitializedRef.current = true
    setOpenTabs([initialFiles[0].name])
    setActiveTab(initialFiles[0].name)
  }, [initialFiles])

  // openTab: open a file as a tab (or switch to it if already open)
  const openTab = useCallback((fileName) => {
    setOpenTabs((prev) => {
      if (prev.includes(fileName)) return prev
      return [...prev, fileName]
    })
    setActiveTab(fileName)
  }, [])

  // closeTab: close a tab. If it's the active tab, switch to the nearest
  // remaining tab (to the left, or the first one).
  const closeTab = useCallback(
    (fileName) => {
      setOpenTabs((prev) => {
        const idx = prev.indexOf(fileName)
        const next = prev.filter((t) => t !== fileName)
        if (fileName === activeTab) {
          setActiveTab(next.length > 0 ? next[Math.max(0, idx - 1)] : null)
        }
        return next
      })
      setDirtyTabs((prev) => {
        if (!prev.has(fileName)) return prev
        const next = new Set(prev)
        next.delete(fileName)
        return next
      })
    },
    [activeTab]
  )

  // markDirty / markClean: track unsaved state per tab
  const markDirty = useCallback((fileName) => {
    setDirtyTabs((prev) => (prev.has(fileName) ? prev : new Set(prev).add(fileName)))
  }, [])

  const markClean = useCallback((fileName) => {
    setDirtyTabs((prev) => {
      if (!prev.has(fileName)) return prev
      const next = new Set(prev)
      next.delete(fileName)
      return next
    })
  }, [])

  return {
    openTabs,
    activeTab,
    dirtyTabs,
    openTab,
    closeTab,
    setActiveTab,
    setOpenTabs,
    markDirty,
    markClean,
  }
}
