/*
 * LeftSidebar.jsx — File explorer panel.
 * Width: 220px (--layout-sidebar-width)
 * Shows every file in the room; open ones (in openTabs) are marked with a
 * dot, distinct from "active" (currently shown in Monaco) which uses the
 * existing highlighted-row style.
 */
import { useEffect, useRef, useState } from 'react'
import { LANGUAGE_DOT_COLORS } from '../../styles/index.js'

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2">
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="5" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="12" cy="19" r="1.2" />
    </svg>
  )
}

function FileRow({ file, isActive, isOpen, onOpen, onDelete, onRename, fileError, clearFileError }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState(file.name)
  const inputRef = useRef(null)
  const menuRef = useRef(null)
  const submittedNameRef = useRef(null) // set while a rename we sent is awaiting the server's echo

  useEffect(() => {
    if (!menuOpen) return
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  useEffect(() => {
    if (renaming) inputRef.current?.focus()
  }, [renaming])

  const startRename = () => {
    setDraftName(file.name)
    setRenaming(true)
    setMenuOpen(false)
  }

  const submitRename = () => {
    const trimmed = draftName.trim()
    if (!trimmed || trimmed === file.name) {
      setRenaming(false)
      clearFileError()
      return
    }
    submittedNameRef.current = trimmed
    onRename(file.name, trimmed)
  }

  // The server echoes a successful rename back through room.files (via
  // useRoom's file_renamed listener), which updates this row's `file` prop
  // — that's the actual confirmation, not the emit itself. Only then do we
  // leave rename mode; if it was a duplicate name instead, file.name never
  // changes and the input (with its error) just stays open for a retry.
  useEffect(() => {
    if (renaming && submittedNameRef.current && file.name === submittedNameRef.current) {
      submittedNameRef.current = null
      setRenaming(false)
      clearFileError()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.name])

  if (renaming) {
    return (
      <div style={{ padding: '2px 8px 6px 10px' }}>
        <input
          ref={inputRef}
          className={`input${fileError ? ' input-error' : ''}`}
          style={{ width: '100%', height: 26, fontSize: 12.5, padding: '0 8px' }}
          value={draftName}
          onChange={(e) => {
            setDraftName(e.target.value)
            if (fileError) clearFileError()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitRename()
            if (e.key === 'Escape') {
              setRenaming(false)
              clearFileError()
            }
          }}
          onBlur={() => {
            if (submittedNameRef.current) return // awaiting the server's response — don't dismiss mid-flight
            setRenaming(false)
            clearFileError()
          }}
        />
        {fileError && (
          <div style={{ fontSize: 11, color: 'var(--color-accent-danger)', marginTop: 4 }}>{fileError}</div>
        )}
      </div>
    )
  }

  return (
    <div className={`sidebar-row${isActive ? ' active' : ''}`} onClick={() => onOpen(file.name)}>
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: 2,
          background: LANGUAGE_DOT_COLORS[file.language] || 'var(--color-text-muted)',
          flexShrink: 0,
        }}
      />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
      {isOpen && <span className="open-file-dot" title="Open in a tab" />}
      <div ref={menuRef} style={{ marginLeft: 'auto', position: 'relative', flexShrink: 0 }}>
        <span
          className="file-row-menu-btn"
          onClick={(e) => {
            e.stopPropagation()
            setMenuOpen((v) => !v)
          }}
        >
          <MoreIcon />
        </span>
        {menuOpen && (
          <div className="file-row-menu" onClick={(e) => e.stopPropagation()}>
            <div className="file-row-menu-item" onClick={startRename}>
              Rename
            </div>
            <div
              className="file-row-menu-item danger"
              onClick={() => {
                setMenuOpen(false)
                onDelete(file.name)
              }}
            >
              Delete
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function LeftSidebar({ room, user, openTabs, activeFile, openTab, deleteFile, renameFile, onAddFile, fileError, clearFileError }) {
  const handleDelete = (fileName) => {
    if (room.files.length <= 1) {
      window.alert('Cannot delete the only file in the room')
      return
    }
    if (window.confirm(`Delete "${fileName}"? This can't be undone.`)) {
      deleteFile(fileName)
    }
  }

  return (
    <div className="panel-sidebar">
      <div className="flex items-center justify-between" style={{ height: 36, padding: '0 12px', flexShrink: 0 }}>
        <span className="section-label">Files</span>
        <button
          onClick={onAddFile}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}
          aria-label="Add file"
        >
          <PlusIcon />
        </button>
      </div>

      <div className="flex flex-col" style={{ gap: 2, padding: '0 6px' }}>
        {room.files.map((file) => (
          <FileRow
            key={file.name}
            file={file}
            isActive={file.name === activeFile}
            isOpen={openTabs.includes(file.name)}
            onOpen={openTab}
            onDelete={handleDelete}
            onRename={renameFile}
            fileError={fileError}
            clearFileError={clearFileError}
          />
        ))}
      </div>

      <div style={{ marginTop: 'auto', padding: 12, borderTop: '1px solid var(--color-border)' }}>
        <div className="section-label" style={{ marginBottom: 8 }}>
          Projects
        </div>
        {user ? (
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.35 }}>No saved projects</div>
        ) : (
          <div className="flex items-center" style={{ gap: 8, color: 'var(--color-text-muted)' }}>
            <LockIcon />
            <span style={{ fontSize: 12, lineHeight: 1.35 }}>Login to save projects &amp; use AI</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default LeftSidebar
