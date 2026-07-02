/*
 * NewFileModal.jsx — Small centered dialog for creating a new file.
 * Server validates the actual name-uniqueness (a race between two users
 * naming a file the same thing at once can't be resolved client-side) —
 * this only does the "non-empty" check locally, and surfaces the server's
 * file_error message (duplicate name) inline if it comes back.
 */
import { useEffect, useRef, useState } from 'react'

function NewFileModal({ isOpen, onClose, onCreate, error, onClearError }) {
  const [name, setName] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setName('')
      // Wait a tick for the input to actually mount before focusing.
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed)
  }

  const handleChange = (e) => {
    setName(e.target.value)
    if (error) onClearError()
  }

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="section-label" style={{ marginBottom: 12 }}>
          New file
        </div>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className={`input${error ? ' input-error' : ''}`}
            style={{ width: '100%' }}
            placeholder="e.g. utils.js"
            value={name}
            onChange={handleChange}
          />
          {error && (
            <div style={{ fontSize: 12, color: 'var(--color-accent-danger)', marginTop: 8 }}>{error}</div>
          )}
          <div className="flex items-center justify-end" style={{ gap: 8, marginTop: 16 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default NewFileModal
