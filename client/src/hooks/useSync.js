/*
 * useSync.js — CRDT-based sync using Yjs + y-monaco.
 * When syncMode is 'crdt' (default), uses Yjs — Monaco is bound directly
 * to a Y.Text via MonacoBinding, so typing flows through Yjs automatically.
 * When syncMode is 'naive', falls back to the Day 7 full-document-broadcast
 * behavior (debounced emit, remote-echo guard, controlled Monaco value).
 *
 * Day 11 rewrite: multiple files can be open as tabs simultaneously, each
 * with its OWN persistent Y.Doc that survives tab switches. Switching tabs
 * just rebinds Monaco to a different (already-live) Y.Doc — it no longer
 * destroys and recreates one. A file's Y.Doc is only torn down when its
 * tab actually closes (destroyYDoc, called from Room.jsx). Background
 * (open-but-not-active) tabs keep their own socket listeners live, so
 * edits from other users still land even while you're looking at a
 * different file — switching back shows current content, not stale.
 */
import { useEffect, useRef, useCallback, useState } from 'react'
import * as Y from 'yjs'
import { MonacoBinding } from 'y-monaco'
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness'

const DEBOUNCE_MS = 50
const SYNCING_INDICATOR_MS = 300
const REMOTE_CHANGE_GUARD_MS = 50

export default function useSync({
  socket,
  roomId,
  userId,
  userName,
  userColor,
  activeFile,
  files, // room.files — read via a ref so identity churn doesn't recreate getOrCreateYDoc
  syncMode = 'crdt',
  editorRef,
  monacoRef,
  editorMounted = false,
  userCount = 1,
  onLocalEdit, // optional (fileName) => void — lets Room.jsx mark a tab dirty on real typing, in either sync mode, without useSync needing to know about useFileTabs
}) {
  const onLocalEditRef = useRef(onLocalEdit)
  useEffect(() => {
    onLocalEditRef.current = onLocalEdit
  }, [onLocalEdit])

  const yDocsRef = useRef(new Map()) // fileName -> { ydoc, ytext, awareness, cleanup }
  const bindingRef = useRef(null) // MonacoBinding currently attached to the editor
  const boundFileRef = useRef(null) // which fileName that binding belongs to
  const awarenessRef = useRef(null) // awareness of whichever file is CURRENTLY bound
  const [isSyncing, setIsSyncing] = useState(false)
  // A ref's .current mutating never triggers a re-render, so consumers like
  // CursorPresence would never learn awarenessRef.current changed — this
  // increments every time the active binding switches (including repeated
  // switches, unlike a boolean which can't signal "changed again to another
  // truthy value"), giving them a real dependency to key an effect off of.
  const [awarenessVersion, setAwarenessVersion] = useState(0)

  const filesRef = useRef(files)
  useEffect(() => {
    filesRef.current = files
  }, [files])

  const userCountRef = useRef(userCount)
  useEffect(() => {
    userCountRef.current = userCount
  }, [userCount])

  // ---------- getOrCreateYDoc: build (or reuse) a file's live Y.Doc ----------
  const getOrCreateYDoc = useCallback(
    (fileName) => {
      if (yDocsRef.current.has(fileName)) {
        return yDocsRef.current.get(fileName)
      }
      if (!socket || !fileName) return null

      const ydoc = new Y.Doc()
      const ytext = ydoc.getText('content')
      const file = filesRef.current?.find((f) => f.name === fileName)
      if (file?.content) {
        ytext.insert(0, file.content)
      }

      const awareness = new Awareness(ydoc)
      awareness.setLocalStateField('user', { name: userName, color: userColor, userId })

      function handleLocalAwarenessUpdate({ added, updated, removed }) {
        const changed = [...added, ...updated, ...removed]
        if (!changed.includes(awareness.clientID)) return
        const update = encodeAwarenessUpdate(awareness, [awareness.clientID])
        socket.emit('awareness_update', { roomId, awarenessUpdate: Array.from(update) })
      }
      awareness.on('update', handleLocalAwarenessUpdate)

      function handleAwarenessUpdate(data) {
        applyAwarenessUpdate(awareness, new Uint8Array(data.awarenessUpdate), 'remote')
      }
      socket.on('awareness_update', handleAwarenessUpdate)

      function handleAwarenessCleared({ userId: clearedId }) {
        const staleClientIds = []
        awareness.getStates().forEach((state, clientId) => {
          if (state.user?.userId === clearedId) staleClientIds.push(clientId)
        })
        if (staleClientIds.length > 0) {
          removeAwarenessStates(awareness, staleClientIds, 'remote')
        }
      }
      socket.on('awareness_cleared', handleAwarenessCleared)

      // Listeners below are scoped to THIS file for its entire open
      // lifetime (not just while it's the active tab) — a background tab
      // still needs to receive remote edits, otherwise switching back to
      // it would show stale content.
      function handleYjsUpdate(data) {
        if (data.fileName !== fileName) return
        if (data.userId === userId) return
        Y.applyUpdate(ydoc, new Uint8Array(data.update), 'remote')
      }
      socket.on('yjs_update', handleYjsUpdate)

      function handleYjsSync(data) {
        if (data.fileName !== fileName) return
        Y.applyUpdate(ydoc, new Uint8Array(data.stateVector), 'remote')
      }
      socket.on('yjs_sync', handleYjsSync)

      function handleAck(ack) {
        if (ack.fileName !== fileName) return
        const roundTripLatency = Date.now() - ack.clientEmitTime
        socket.emit('latency_report', {
          roomId,
          roundTripLatency,
          oneWayLatency: ack.oneWayLatency,
          fileName,
          userCount: userCountRef.current,
        })
      }
      socket.on('yjs_ack', handleAck)

      function handleLocalUpdate(update, origin) {
        if (origin === 'remote') return // this doc can only be locally edited while it's the bound/active one

        if (boundFileRef.current === fileName) {
          setIsSyncing(true)
          setTimeout(() => setIsSyncing(false), SYNCING_INDICATOR_MS)
        }
        onLocalEditRef.current?.(fileName)

        socket.emit('yjs_update', {
          roomId,
          userId,
          fileName,
          update: Array.from(update),
          timestamp: Date.now(),
          byteSize: update.byteLength,
        })
      }
      ydoc.on('update', handleLocalUpdate)

      // Ask the server for this file's current state. join_room already
      // broadcasts yjs_sync for every file at join time, so this is
      // somewhat redundant for the first file opened (harmless — Yjs
      // updates are idempotent) — it's the only thing that covers opening
      // a file that wasn't part of that initial broadcast round, or that
      // changed since (e.g. someone else has been editing it in the
      // background of their own session).
      socket.emit('request_yjs_sync', { roomId, fileName })

      const entry = {
        ydoc,
        ytext,
        awareness,
        cleanup: () => {
          socket.off('yjs_update', handleYjsUpdate)
          socket.off('yjs_sync', handleYjsSync)
          socket.off('yjs_ack', handleAck)
          socket.off('awareness_update', handleAwarenessUpdate)
          socket.off('awareness_cleared', handleAwarenessCleared)
          ydoc.off('update', handleLocalUpdate)
          awareness.off('update', handleLocalAwarenessUpdate)
        },
      }
      yDocsRef.current.set(fileName, entry)
      return entry
    },
    [socket, roomId, userId, userName, userColor]
  )

  // ---------- destroyYDoc: tear down a file's Y.Doc entirely ----------
  // Called when a tab closes. Client-side only — this is per-browser-session
  // memory, not the room's actual data (that's server + MongoDB's concern).
  const destroyYDoc = useCallback((fileName) => {
    const entry = yDocsRef.current.get(fileName)
    if (!entry) return
    if (boundFileRef.current === fileName && bindingRef.current) {
      bindingRef.current.destroy()
      bindingRef.current = null
      boundFileRef.current = null
    }
    entry.cleanup()
    entry.awareness.destroy()
    entry.ydoc.destroy()
    yDocsRef.current.delete(fileName)
  }, [])

  // ---------- renameYDoc: file renamed while (possibly) open ----------
  // Can't cheaply relabel an entry in place — its socket listeners all
  // filter by the OLD fileName captured in their closures at creation
  // time. Simplest correct approach: tear down the old entry; the caller
  // (Room.jsx) re-opens under the new name via getOrCreateYDoc, which
  // re-syncs from the server — whose own in-memory copy was already
  // migrated to the new name server-side (see collab.js renameFileDoc),
  // so no live content is lost in the round trip.
  const renameYDoc = useCallback(
    (oldName) => {
      destroyYDoc(oldName)
    },
    [destroyYDoc]
  )

  // ---------- Switch which file's Y.Doc is bound to Monaco ----------
  useEffect(() => {
    if (syncMode !== 'crdt') return
    if (!activeFile || !editorMounted || !editorRef?.current || !monacoRef?.current) return

    const entry = getOrCreateYDoc(activeFile)
    if (!entry) return

    if (bindingRef.current) {
      bindingRef.current.destroy()
      bindingRef.current = null
    }

    bindingRef.current = new MonacoBinding(
      entry.ytext,
      editorRef.current.getModel(),
      new Set([editorRef.current]),
      entry.awareness
    )
    boundFileRef.current = activeFile
    awarenessRef.current = entry.awareness
    setAwarenessVersion((v) => v + 1)

    return () => {
      if (bindingRef.current) {
        bindingRef.current.destroy()
        bindingRef.current = null
      }
      boundFileRef.current = null
    }
  }, [activeFile, syncMode, editorMounted, getOrCreateYDoc, editorRef, monacoRef])

  // ---------- Full cleanup on room leave (component unmount) ----------
  useEffect(() => {
    return () => {
      // yDocsRef holds a single Map instance for the hook's entire
      // lifetime (created once via useRef(new Map())), never reassigned —
      // unlike a DOM-node ref, it can't go stale by the time this runs.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      yDocsRef.current.forEach((_, fileName) => destroyYDoc(fileName))
    }
    // Intentionally mount/unmount-only — destroyYDoc has a stable identity
    // (empty dep array of its own), and this must NOT re-run on every
    // render, only on the room page actually going away.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- Naive mode fallback (unchanged behavior from Day 7/8) ----------
  const naiveContentRef = useRef('')
  const [naiveContent, setNaiveContent] = useState('')
  const remoteChangeRef = useRef(false)
  const pendingEmit = useRef(null)

  // Reset content whenever the active file changes
  useEffect(() => {
    if (syncMode !== 'naive') return
    const file = filesRef.current?.find((f) => f.name === activeFile)
    const content = file?.content ?? ''
    setNaiveContent(content)
    naiveContentRef.current = content
  }, [activeFile, syncMode])

  useEffect(() => {
    if (syncMode !== 'naive') return
    if (!socket) return

    function handleRemoteChange(event) {
      if (event.fileName !== activeFile) return
      if (event.userId === userId) return // our own echo — shouldn't happen, guard anyway

      remoteChangeRef.current = true
      naiveContentRef.current = event.content
      setNaiveContent(event.content)

      setTimeout(() => {
        remoteChangeRef.current = false
      }, REMOTE_CHANGE_GUARD_MS)
    }
    socket.on('code_change', handleRemoteChange)

    function handleAck(ack) {
      if (ack.fileName !== activeFile) return
      const roundTripLatency = Date.now() - ack.clientEmitTime
      socket.emit('latency_report', {
        roomId,
        roundTripLatency,
        oneWayLatency: ack.oneWayLatency,
        fileName: ack.fileName,
        userCount,
      })
    }
    socket.on('code_change_ack', handleAck)

    return () => {
      socket.off('code_change', handleRemoteChange)
      socket.off('code_change_ack', handleAck)
    }
  }, [socket, activeFile, userId, syncMode, roomId, userCount])

  const handleNaiveChange = useCallback(
    (newContent) => {
      if (syncMode !== 'naive') return

      naiveContentRef.current = newContent
      setNaiveContent(newContent)

      if (remoteChangeRef.current) return // this onChange fired from a remote update, not typing

      onLocalEditRef.current?.(activeFile)

      if (pendingEmit.current) clearTimeout(pendingEmit.current)

      pendingEmit.current = setTimeout(() => {
        if (!socket) return
        setIsSyncing(true)
        socket.emit('code_change', {
          roomId,
          userId,
          fileName: activeFile,
          content: naiveContentRef.current,
          timestamp: Date.now(),
          byteSize: new Blob([naiveContentRef.current]).size,
        })
        setTimeout(() => setIsSyncing(false), SYNCING_INDICATOR_MS)
      }, DEBOUNCE_MS)
    },
    [socket, roomId, userId, activeFile, syncMode]
  )

  return {
    // CRDT mode: Monaco is controlled by MonacoBinding directly, so these
    // are left undefined — EditorPane uses that to decide whether to pass
    // value/onChange to <Editor> at all.
    naiveContent: syncMode === 'naive' ? naiveContent : undefined,
    handleNaiveChange: syncMode === 'naive' ? handleNaiveChange : undefined,
    isSyncing,
    yDocsRef,
    getOrCreateYDoc,
    destroyYDoc,
    renameYDoc,
    awarenessRef, // CursorPresence reads this for remote cursor labels — always the CURRENTLY BOUND file's
    awarenessVersion, // bump signal — see comment above
  }
}
