/*
 * CursorPresence.jsx — Renders remote users' floating name labels AND a
 * colored cursor-line decoration. MonacoBinding + Awareness (in useSync)
 * renders remote SELECTION highlighting on its own, but doesn't reliably
 * render a visible caret line for a zero-width cursor (no selection) —
 * this component adds both the name label and an explicit colored
 * cursor-line decoration so a lone cursor (not actively selecting text)
 * is still visible, not just implied by the floating label.
 *
 * Non-rendering: returns null. All output goes through Monaco's content
 * widget + decoration APIs, since Monaco's canvas isn't part of React's
 * DOM tree — we can't position ordinary React elements over it.
 */
import { useEffect, useRef } from 'react'
import * as Y from 'yjs'

const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/
const DEFAULT_CURSOR_COLOR = '#6b6b6b' // awareness state is set by remote, unauthenticated clients — never trust it to be a safe CSS value outright

function getContrastColor(hexColor) {
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#000000' : '#ffffff'
}

// clientId (a Yjs numeric client ID) isn't safe to use directly in a CSS
// class/id, and userId can contain characters CSS identifiers don't
// allow either — sanitize before it ever reaches a class name or a
// document.getElementById key.
function sanitizeForCssId(id) {
  return String(id).replace(/[^a-zA-Z0-9-]/g, '-')
}

export default function CursorPresence({ awarenessRef, editorRef, monacoRef, awarenessVersion, myUserId }) {
  const widgetsRef = useRef(new Map()) // clientId -> { widget, labelEl, setPosition }
  const decorationsRef = useRef(new Map()) // clientId -> Monaco IEditorDecorationsCollection
  const styleKeysRef = useRef(new Map()) // clientId -> sanitizedUserId, so cleanup can find the right <style> tag

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

    function removeCursorForClient(clientId) {
      const w = widgetsRef.current.get(clientId)
      if (w) {
        editor.removeContentWidget(w.widget)
        widgetsRef.current.delete(clientId)
      }
      const d = decorationsRef.current.get(clientId)
      if (d) {
        d.clear()
        decorationsRef.current.delete(clientId)
      }
      const sanitizedUserId = styleKeysRef.current.get(clientId)
      if (sanitizedUserId) {
        const styleEl = document.getElementById(`cursor-style-${sanitizedUserId}`)
        if (styleEl) styleEl.remove()
        styleKeysRef.current.delete(clientId)
      }
    }

    function ensureCursorStyle(clientId, sanitizedUserId, color) {
      const safeColor = HEX_COLOR_RE.test(color) ? color : DEFAULT_CURSOR_COLOR
      const styleId = `cursor-style-${sanitizedUserId}`
      let styleEl = document.getElementById(styleId)
      if (!styleEl) {
        styleEl = document.createElement('style')
        styleEl.id = styleId
        document.head.appendChild(styleEl)
      }
      styleEl.textContent = `
        .remote-cursor-before-${sanitizedUserId} {
          border-left: 2px solid ${safeColor} !important;
          margin-left: -1px;
          height: 1.2em !important;
          position: relative;
        }
      `
      styleKeysRef.current.set(clientId, sanitizedUserId)
    }

    function updateCursors() {
      const states = awareness.getStates()
      const currentClientIds = new Set()

      states.forEach((state, clientId) => {
        if (!state.user) return
        if (state.user.userId === myUserId) return // never render our own cursor

        // Editor isn't focused for this user (or they haven't focused it
        // yet this session) — useSync.js's blur handler explicitly
        // broadcasts focused:false the instant focus leaves, precisely so
        // a stale cursor doesn't linger on everyone else's screen. Falls
        // through to the sweep below, which removes any existing
        // widget/decoration/style for this client.
        if (!state.focused) return

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
        const { name, color, userId } = state.user
        const sanitizedUserId = sanitizeForCssId(userId)

        ensureCursorStyle(clientId, sanitizedUserId, color)

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

        // Colored cursor-line decoration — a zero-width range whose
        // beforeContentClassName renders a thin colored bar right at the
        // caret position. className (applied to content INSIDE the
        // range) is inert here since the range is zero-width; it's kept
        // for forward-compatibility if this is ever extended to
        // highlight an actual selection span, not just a lone caret.
        let decoration = decorationsRef.current.get(clientId)
        if (!decoration) {
          decoration = editor.createDecorationsCollection([])
          decorationsRef.current.set(clientId, decoration)
        }
        decoration.set([
          {
            range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
            options: {
              className: `remote-cursor-${sanitizedUserId}`,
              beforeContentClassName: `remote-cursor-before-${sanitizedUserId}`,
              stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
            },
          },
        ])
      })

      // Remove entries for clients who left, switched away from this
      // file's awareness, or (per the focused:false check above) blurred
      // — anything still tracked but not confirmed present-and-focused
      // in this pass gets torn down (widget + decoration + style).
      const trackedClientIds = new Set([
        ...widgetsRef.current.keys(),
        ...decorationsRef.current.keys(),
        ...styleKeysRef.current.keys(),
      ])
      trackedClientIds.forEach((clientId) => {
        if (!currentClientIds.has(clientId)) {
          removeCursorForClient(clientId)
        }
      })
    }

    updateCursors()
    awareness.on('change', updateCursors)
    return () => {
      awareness.off('change', updateCursors)
      // widgetsRef/decorationsRef/styleKeysRef are stable Map instances
      // (see comment below) — safe to read .current directly in cleanup,
      // unlike a DOM-node ref that could've gone stale by now.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const trackedClientIds = new Set([...widgetsRef.current.keys(), ...decorationsRef.current.keys(), ...styleKeysRef.current.keys()])
      trackedClientIds.forEach((clientId) => removeCursorForClient(clientId))
    }
    // widgetsRef/decorationsRef/styleKeysRef each hold a single Map
    // instance for the component's entire lifetime (created once via
    // useRef(new Map())), never reassigned — unlike a DOM-node ref, they
    // can't have "changed" out from under this closure by the time
    // cleanup runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awarenessRef, editorRef, monacoRef, myUserId, awarenessVersion])

  return null
}
