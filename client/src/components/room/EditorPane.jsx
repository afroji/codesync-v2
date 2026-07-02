/*
 * EditorPane.jsx — Monaco editor, the center of everything.
 * CRDT mode: Monaco is bound directly to a Y.Text via MonacoBinding
 * (inside useSync) — value/onChange are not used, Yjs owns the content.
 * Naive mode: Monaco is a plain controlled editor via naiveContent/
 * handleNaiveChange, same as Day 7.
 *
 * Day 11: the tab bar now shows only OPEN tabs (openTabs), not every file
 * in the room — LeftSidebar is the full file list; this is just what's
 * currently open for editing, same distinction as any real IDE.
 */
import Editor from '@monaco-editor/react'
import { LANGUAGE_DOT_COLORS } from '../../styles/index.js'
import CursorPresence from './CursorPresence'

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2">
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function EditorPane({
  room,
  openTabs,
  activeFile,
  setActiveFile,
  dirtyTabs,
  onTabClose,
  onTabAdd,
  naiveContent,
  handleNaiveChange,
  syncMode,
  editorRef,
  monacoRef,
  onEditorMount,
  awarenessRef,
  awarenessVersion,
  myUserId,
}) {
  const activeFileObj = room.files.find((f) => f.name === activeFile)

  const handleCloseTab = (e, fileName) => {
    e.stopPropagation()
    onTabClose(fileName)
  }

  const handleMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    onEditorMount()

    // Prevent browser save dialog
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      // Day 15 wires real save here
      console.log('Save triggered')
    })
  }

  const isNaive = syncMode === 'naive'

  return (
    <>
      <div className="tab-bar">
        {openTabs.map((fileName) => {
          const file = room.files.find((f) => f.name === fileName)
          if (!file) return null // file was deleted by someone else while its tab was still open
          const isActive = fileName === activeFile
          const isDirty = dirtyTabs.has(fileName)
          return (
            <div
              key={fileName}
              className={`tab${isActive ? ' active' : ''}`}
              onClick={() => setActiveFile(fileName)}
            >
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 2,
                  background: LANGUAGE_DOT_COLORS[file.language] || 'var(--color-text-muted)',
                  flexShrink: 0,
                }}
              />
              <span>{fileName}</span>
              {isDirty && <span className="tab-dirty-dot" />}
              <span onClick={(e) => handleCloseTab(e, fileName)} className="tab-close">
                <CloseIcon />
              </span>
            </div>
          )
        })}
        <button className="tab-add" onClick={onTabAdd} aria-label="New file">
          <PlusIcon />
        </button>
      </div>

      {activeFileObj ? (
        <div className="monaco-container">
          <Editor
            height="100%"
            language={activeFileObj.language}
            theme="vs-dark"
            onMount={handleMount}
            options={{
              fontSize: 14,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              minimap: { enabled: true },
              automaticLayout: true,
              scrollBeyondLastLine: false,
              tabSize: 2,
              wordWrap: 'off',
              padding: { top: 12 },
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              renderLineHighlight: 'all',
              lineNumbers: 'on',
            }}
            // In CRDT mode value/onChange are omitted entirely — MonacoBinding
            // (inside useSync) controls the editor directly. In naive mode,
            // Monaco is a normal controlled component.
            {...(isNaive ? { value: naiveContent, onChange: (val) => handleNaiveChange(val ?? '') } : {})}
          />
          {!isNaive && (
            <CursorPresence
              awarenessRef={awarenessRef}
              editorRef={editorRef}
              monacoRef={monacoRef}
              awarenessVersion={awarenessVersion}
              myUserId={myUserId}
            />
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--color-bg-editor)' }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No file open</span>
        </div>
      )}
    </>
  )
}

export default EditorPane
