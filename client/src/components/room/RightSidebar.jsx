/*
 * RightSidebar.jsx — Tabbed right panel.
 * Tabs: Chat | Members | AI
 * Width: 280px (--layout-right-panel-width)
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

function LockIcon({ size = 20, color = 'var(--color-text-secondary)' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent-primary)" strokeWidth="2">
      <line x1="4" y1="12" x2="19" y2="12" />
      <polyline points="13 6 19 12 13 18" />
    </svg>
  )
}

function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000)
  if (seconds < 30) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

function ChatTab({ room, sendChat, myUserId }) {
  const [draft, setDraft] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [room.chat])

  const sendMessage = () => {
    if (!draft.trim()) return
    sendChat(draft.trim())
    setDraft('')
  }

  return (
    <>
      <div className="flex-1 flex flex-col overflow-y-auto" style={{ padding: '14px 12px', gap: 14 }}>
        {room.chat.map((msg, i) => {
          const isYou = msg.userId === myUserId
          return (
            <div key={i} className="flex" style={{ gap: 8, flexDirection: isYou ? 'row-reverse' : 'row', marginBottom: 12 }}>
              {!isYou && (
                <div
                  className="flex items-center justify-center font-semibold"
                  style={{ width: 22, height: 22, borderRadius: '50%', background: msg.color, color: 'var(--color-bg-room)', fontSize: 10, flexShrink: 0 }}
                >
                  {msg.name[0].toUpperCase()}
                </div>
              )}
              {isYou ? (
                <div className="flex flex-col" style={{ gap: 3, alignItems: 'flex-end' }}>
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {timeAgo(msg.timestamp)}
                  </span>
                  <div
                    style={{
                      fontSize: 13,
                      color: 'var(--color-text-primary)',
                      lineHeight: 1.4,
                      background: '#1c2a44',
                      border: '1px solid #26385c',
                      padding: '6px 10px',
                      borderRadius: '8px 8px 2px 8px',
                    }}
                  >
                    {msg.message}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col" style={{ gap: 3 }}>
                  <div className="flex items-baseline" style={{ gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>{msg.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {timeAgo(msg.timestamp)}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#c4c4c4', lineHeight: 1.4 }}>{msg.message}</div>
                </div>
              )}
            </div>
          )
        })}
        <div ref={scrollRef} />
      </div>
      <div style={{ flexShrink: 0, padding: '10px 12px', borderTop: '1px solid var(--color-border)' }}>
        <div
          className="flex items-center"
          style={{ gap: 8, background: 'var(--color-bg-editor)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 10px' }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') sendMessage()
            }}
            placeholder="Message the room..."
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', fontSize: 13 }}
          />
          <span onClick={sendMessage} style={{ display: 'flex', cursor: 'pointer' }}>
            <SendIcon />
          </span>
        </div>
      </div>
    </>
  )
}

function MembersTab({ room, myUserId }) {
  return (
    <div className="flex flex-col" style={{ padding: '8px 6px', gap: 2 }}>
      {room.members.map((member) => {
        const isYou = member.userId === myUserId
        return (
        <div key={member.userId} className="flex items-center" style={{ height: 30, padding: '0 10px', gap: 10 }}>
          <span className="status-dot status-online" />
          <span style={{ fontSize: 13, fontWeight: isYou ? 600 : 400, color: 'var(--color-text-primary)' }}>
            {member.name}
            {isYou ? ' (You)' : ''}
          </span>
          {member.isAnonymous && (
            <span
              style={{
                fontSize: 10,
                color: 'var(--color-text-muted)',
                border: '1px solid var(--color-border-strong)',
                borderRadius: 3,
                padding: '1px 5px',
              }}
            >
              Guest
            </span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-accent-success)' }}>Online</span>
        </div>
        )
      })}
    </div>
  )
}

function AiTab({ user }) {
  if (!user) {
    return (
      <div style={{ position: 'relative', flex: 1 }}>
        <div className="flex flex-col" style={{ padding: '14px 12px', gap: 12, opacity: 0.28, filter: 'grayscale(0.4)' }}>
          <div className="flex" style={{ gap: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: 'var(--color-accent-primary)', flexShrink: 0 }} />
            <div style={{ background: 'var(--color-bg-hover)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
              This function broadcasts cursor events to every connected peer in the room.
            </div>
          </div>
          <div className="flex" style={{ gap: 8, flexDirection: 'row-reverse' }}>
            <div style={{ background: '#1c2a44', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: '#c4c4c4' }}>explain line 10</div>
          </div>
        </div>
        <div
          className="flex flex-col items-center justify-center"
          style={{ position: 'absolute', inset: '0 0 0 0', gap: 14, background: 'rgba(10,10,10,0.72)', padding: '0 32px' }}
        >
          <div
            className="flex items-center justify-center"
            style={{ width: 44, height: 44, border: '1px solid var(--color-border-strong)', borderRadius: 10, background: 'var(--color-bg-chip)' }}
          >
            <LockIcon />
          </div>
          <div className="text-center">
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>
              AI assistance requires an account
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
              Get code explanations, fixes, and refactors inline.
            </div>
          </div>
          <Link to="/login" className="btn btn-primary">
            Login &rarr;
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>AI panel coming on Day 17</span>
    </div>
  )
}

function RightSidebar({ room, user, activeTab, setActiveTab, sendChat, myUserId }) {
  return (
    <div className="panel-right">
      <div className="flex" style={{ height: 36, flexShrink: 0, alignItems: 'stretch', borderBottom: '1px solid var(--color-border)' }}>
        <div
          className={`tab-underline${activeTab === 'chat' ? ' active' : ''}`}
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={() => setActiveTab('chat')}
        >
          Chat
        </div>
        <div
          className={`tab-underline${activeTab === 'members' ? ' active' : ''}`}
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={() => setActiveTab('members')}
        >
          Members
        </div>
        <div
          className={`tab-underline${activeTab === 'ai' ? ' active' : ''}`}
          style={{ flex: 1, justifyContent: 'center', gap: 5 }}
          onClick={() => setActiveTab('ai')}
        >
          AI <LockIcon size={11} color="currentColor" />
        </div>
      </div>

      {activeTab === 'chat' && <ChatTab room={room} sendChat={sendChat} myUserId={myUserId} />}
      {activeTab === 'members' && <MembersTab room={room} myUserId={myUserId} />}
      {activeTab === 'ai' && <AiTab user={user} />}
    </div>
  )
}

export default RightSidebar
