/*
 * CursorPresence.jsx — Renders remote users' floating name labels.
 * MonacoBinding + Awareness (in useSync) already renders the actual
 * cursor/selection line decoration automatically — this component only
 * adds the floating name badge above each remote cursor, matching the
 * design file's cursor label style.
 *
 * Non-rendering: returns null. All output goes through Monaco's content
 * widget API, since Monaco's canvas isn't part of React's DOM tree — we
 * can't position ordinary React elements over it.
 */
import { useEffect, useRef } from 'react'
import * as Y from 'yjs'

function getContrastColor(hexColor) {
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#000000' : '#ffffff'
}

export default function CursorPresence({ awarenessRef, editorRef, monacoRef, awarenessVersion, myUserId }) {
  const widgetsRef = useRef(new Map()) // clientId -> { widget, labelEl }

  useEffect(() => {
    // awarenessVersion is a counter, not a boolean — switching from tab A's
    // awareness to tab B's still needs to re-run this effect even though
    // awarenessRef.current was already "truthy" before the switch. A
    // boolean can't signal "changed again to another truthy value"; a
    // counter that increments on every bind always produces a fresh value.
    if (!awarenessVersion) return
    if (!awarenessRef?.current || !editorRef?.current || !monacoRef?.current) return

    const awareness = awarenessRef.current
    const editor = editorRef.current
    const monaco = monacoRef.current
    const ydoc = awareness.doc
    const ytext = ydoc.getText('content')

    function updateCursors() {
      const states = awareness.getStates()
      const currentClientIds = new Set()

      states.forEach((state, clientId) => {
        if (!state.user) return
        if (state.user.userId === myUserId) return // never render our own cursor

        // MonacoBinding stores the remote selection under 'selection' (not
        // 'cursor'), as a pair of Yjs *relative* positions — not plain
        // offsets. They need resolving against this doc before Monaco's
        // getPositionAt() can turn them into a line/column.
        const anchor = state.selection?.anchor
        if (!anchor) return

        const anchorAbs = Y.createAbsolutePositionFromRelativePosition(anchor, ydoc)
        if (!anchorAbs || anchorAbs.type !== ytext) return

        const position = editor.getModel()?.getPositionAt(anchorAbs.index)
        if (!position) return

        currentClientIds.add(clientId)
        const { name, color } = state.user

        if (!widgetsRef.current.has(clientId)) {
          const labelEl = document.createElement('div')
          labelEl.className = 'cursor-label'
          labelEl.style.cssText = `
            background: ${color};
            color: ${getContrastColor(color)};
            font-family: var(--font-sans, 'Geist', sans-serif);
            font-size: 11px;
            font-weight: 600;
            padding: 1px 6px;
            border-radius: 4px 4px 4px 0;
            pointer-events: none;
            white-space: nowrap;
            position: relative;
            z-index: 100;
          `
          labelEl.textContent = name

          let currentPosition = position
          const widget = {
            getId: () => `cursor-${clientId}`,
            getDomNode: () => labelEl,
            getPosition: () => ({
              position: currentPosition,
              preference: [monaco.editor.ContentWidgetPositionPreference.ABOVE],
            }),
          }

          editor.addContentWidget(widget)
          widgetsRef.current.set(clientId, { widget, labelEl, setPosition: (p) => (currentPosition = p) })
        } else {
          const existing = widgetsRef.current.get(clientId)
          existing.setPosition(position)
          editor.layoutContentWidget(existing.widget)
        }
      })

      // Remove widgets for users who left or switched away from this file
      widgetsRef.current.forEach((val, clientId) => {
        if (!currentClientIds.has(clientId)) {
          editor.removeContentWidget(val.widget)
          widgetsRef.current.delete(clientId)
        }
      })
    }

    updateCursors()
    awareness.on('change', updateCursors)
    return () => {
      awareness.off('change', updateCursors)
      widgetsRef.current.forEach((val) => editor.removeContentWidget(val.widget))
      widgetsRef.current.clear()
    }
    // widgetsRef holds a single Map instance for the component's entire
    // lifetime (created once via useRef(new Map())), never reassigned —
    // unlike a DOM-node ref, it can't have "changed" out from under this
    // closure by the time cleanup runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awarenessRef, editorRef, monacoRef, myUserId, awarenessVersion])

  return null
}
