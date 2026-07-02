/*
 * TopBar.jsx — Room top bar. Matches design file exactly.
 * Height: 40px (--layout-topbar-height)
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { LANGUAGE_DOT_COLORS, LANGUAGE_OPTIONS, EXECUTABLE_LANGUAGES } from '../../styles/index.js'

const TYPING_TIMEOUT_MS = 2000
const MAX_VISIBLE_AVATARS = 4

function PlayIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="#ffffff">
      <polygon points="6 4 20 12 6 20" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 12v7h16v-7" />
      <polyline points="8 7 12 3 16 7" />
      <line x1="12" y1="3" x2="12" y2="14" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function TopBar({ room, user, myUserId, connected, isSyncing, metrics, socket, activeFile, changeLanguage, runCode, isRunning }) {
  const { logout } = useAuth()
  const [copiedCode, setCopiedCode] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [langMenuOpen, setLangMenuOpen] = useState(false)
  const [typingUsers, setTypingUsers] = useState(new Set())
  const langMenuRef = useRef(null)

  useEffect(() => {
    if (!langMenuOpen) return
    function handleClickOutside(e) {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target)) setLangMenuOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [langMenuOpen])

  // Listen for edit events to drive the "typing..." pulse dot on avatars.
  // yjs_update only reaches us for OTHER users' edits (server uses
  // socket.to(), excluding the sender), so there's no risk of showing our
  // own avatar as typing. code_change covers naive mode the same way.
  useEffect(() => {
    if (!socket) return
    const timers = new Map() // userId -> timeout id, so rapid typing resets the timer instead of stacking redundant ones

    function handleEdit(data) {
      setTypingUsers((prev) => new Set(prev).add(data.userId))

      if (timers.has(data.userId)) clearTimeout(timers.get(data.userId))
      timers.set(
        data.userId,
        setTimeout(() => {
          setTypingUsers((prev) => {
            const next = new Set(prev)
            next.delete(data.userId)
            return next
          })
          timers.delete(data.userId)
        }, TYPING_TIMEOUT_MS)
      )
    }

    socket.on('yjs_update', handleEdit)
    socket.on('code_change', handleEdit)
    return () => {
      socket.off('yjs_update', handleEdit)
      socket.off('code_change', handleEdit)
      timers.forEach((t) => clearTimeout(t))
    }
  }, [socket])

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(room.roomId)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 1500)
  }

  const handleShare = async () => {
    await navigator.clipboard.writeText(window.location.href)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 1500)
  }

  const visibleMembers = room.members.slice(0, MAX_VISIBLE_AVATARS)
  const overflowCount = room.members.length - visibleMembers.length

  const activeFileObj = room.files.find((f) => f.name === activeFile)
  const currentLanguage = activeFileObj?.language || room.language
  const isExecutable = EXECUTABLE_LANGUAGES.includes(currentLanguage)

  return (
    <div className="panel-topbar">
      {/* left section */}
      <div className="flex items-center" style={{ gap: 8 }}>
        <div
          className="flex items-center justify-center"
          style={{ width: 16, height: 16, background: 'var(--color-accent-primary)', borderRadius: 4 }}
        >
          <div style={{ width: 6, height: 6, background: 'var(--color-bg-topbar)', borderRadius: 1 }} />
        </div>
        <span className="font-semibold" style={{ fontSize: 13, letterSpacing: '-0.01em' }}>
          CodeSync
        </span>
      </div>

      <div className="divider" style={{ height: 18 }} />

      <div className="room-code" onClick={handleCopyCode}>
        <span>{copiedCode ? 'Copied!' : room.roomId}</span>
        <CopyIcon />
      </div>

      <span className={`sync-mode-badge${room.syncMode === 'naive' ? ' naive' : ''}`}>
        {room.syncMode === 'crdt' ? 'CRDT' : 'NAIVE'}
      </span>

      {metrics && (
        <div className="metrics-pill">
          {/* REST /api/metrics/:roomId nests avg under syncLatency.avg; the
              Socket.IO metrics_snapshot event (Day 7) uses a flat avgSyncLatency
              field instead — read both shapes defensively. */}
          <span>&empty; {Math.round(metrics.syncLatency?.avg ?? metrics.avgSyncLatency ?? 0)}ms</span>
          <span>&middot;</span>
          <span>{metrics.revisionCount ?? 0} edits</span>
          {(metrics.conflictCount ?? 0) > 0 && (
            <span className="metrics-conflicts">&middot; {metrics.conflictCount} conflicts</span>
          )}
        </div>
      )}

      <div ref={langMenuRef} style={{ position: 'relative' }}>
        <div
          className="flex items-center"
          style={{ gap: 6, padding: '4px 8px', borderRadius: 6, cursor: 'pointer', color: 'var(--color-text-secondary)' }}
          onClick={() => setLangMenuOpen((v) => !v)}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: LANGUAGE_DOT_COLORS[currentLanguage] || 'var(--color-text-muted)',
            }}
          />
          <span style={{ fontSize: 13, textTransform: 'capitalize' }}>
            {LANGUAGE_OPTIONS.find((l) => l.value === currentLanguage)?.label || currentLanguage}
          </span>
          <ChevronDownIcon />
        </div>
        {langMenuOpen && (
          <div
            style={{
              position: 'absolute',
              top: 32,
              left: 0,
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border-strong)',
              borderRadius: 8,
              padding: 4,
              minWidth: 180,
              zIndex: 20,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
            }}
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <div
                key={opt.value}
                className="sidebar-row"
                style={{ justifyContent: 'space-between' }}
                onClick={() => {
                  if (activeFile) changeLanguage(activeFile, opt.value)
                  setLangMenuOpen(false)
                }}
              >
                <span className="flex items-center" style={{ gap: 8 }}>
                  <span
                    style={{ width: 8, height: 8, borderRadius: 2, background: LANGUAGE_DOT_COLORS[opt.value] || 'var(--color-text-muted)' }}
                  />
                  {opt.label}
                </span>
                {!opt.executable && (
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>(preview only)</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center" style={{ gap: 6 }}>
        <span
          className="status-dot"
          style={{
            background: !connected
              ? 'var(--color-accent-danger)'
              : isSyncing
                ? 'var(--color-accent-warning)'
                : 'var(--color-accent-success)',
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          {!connected ? 'Offline' : isSyncing ? 'Syncing...' : 'Live'}
        </span>
      </div>

      {/* center section */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center">
          {visibleMembers.map((member) => {
            const isYou = member.userId === myUserId
            const isTyping = typingUsers.has(member.userId)
            return (
              <div key={member.userId} className="presence-avatar-wrapper">
                <div
                  className="presence-avatar"
                  style={{
                    background: member.color,
                    color: 'var(--color-bg-room)',
                    borderWidth: isYou ? 3 : 2,
                  }}
                  title={isYou ? 'You' : member.name}
                >
                  {member.name[0].toUpperCase()}
                </div>
                {isTyping && <span className="avatar-typing-dot" />}
              </div>
            )
          })}
          {overflowCount > 0 && (
            <div
              className="presence-avatar"
              style={{ background: 'var(--color-bg-chip)', color: 'var(--color-text-secondary)', fontSize: 10, fontWeight: 500 }}
            >
              +{overflowCount}
            </div>
          )}
        </div>
      </div>

      {/* right section */}
      <div className="flex items-center" style={{ gap: 8 }}>
        <button
          className="btn btn-run"
          onClick={runCode}
          disabled={isRunning || !isExecutable}
          title={!isExecutable ? `${currentLanguage} cannot be executed` : undefined}
        >
          {isRunning ? <span className="spinner-sm" /> : <PlayIcon />}
          {isRunning ? 'Running...' : 'Run'}
        </button>

        {user ? (
          <button className="btn btn-secondary" onClick={() => {}}>
            Save
          </button>
        ) : (
          <button className="btn" disabled title="Login to save your work">
            <LockIcon />
            Save
          </button>
        )}

        <button className="btn btn-secondary" onClick={handleShare}>
          <ShareIcon />
          {linkCopied ? 'Link copied!' : 'Share'}
        </button>

        <div className="divider" style={{ height: 18 }} />

        {user ? (
          <div style={{ position: 'relative' }}>
            <div
              className="flex items-center justify-center font-semibold"
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: 'var(--color-cursor-1)',
                color: 'var(--color-bg-room)',
                fontSize: 11,
                cursor: 'pointer',
              }}
              onClick={() => setMenuOpen((v) => !v)}
            >
              {user.name?.[0]?.toUpperCase()}
            </div>
            {menuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 32,
                  right: 0,
                  background: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  padding: 6,
                  minWidth: 160,
                  zIndex: 10,
                }}
              >
                <Link
                  to="/dashboard"
                  className="sidebar-row"
                  style={{ textDecoration: 'none' }}
                  onClick={() => setMenuOpen(false)}
                >
                  Go to Dashboard
                </Link>
                <div
                  className="sidebar-row"
                  onClick={() => {
                    setMenuOpen(false)
                    logout()
                  }}
                >
                  Logout
                </div>
              </div>
            )}
          </div>
        ) : (
          <Link to="/login" style={{ fontSize: 13, color: 'var(--color-text-accent)', textDecoration: 'none', padding: '0 4px' }}>
            Login
          </Link>
        )}
      </div>
    </div>
  )
}

export default TopBar
