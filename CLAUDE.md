# CodeSync — Project Context

## What this is
CodeSync is a real-time collaborative multi-language programming
environment. The core research contribution is a CRDT-based
synchronization engine (Yjs) compared against naive Socket.IO
broadcast, measured under concurrent user load.

Anonymous users can create and join rooms instantly with no login.
Login (Google OAuth) unlocks AI assistance, project saving,
version history, and cloud persistence.

This is an MCA research project at Parul University targeting
publication in Future Internet (MDPI), a Scopus-indexed journal.

## Research question
Can CRDT-based collaborative editing (Yjs) reduce edit conflicts
and input loss compared to conventional WebSocket broadcast
synchronization under concurrent user load?

## Tech stack
- Frontend: React 18 + Vite + Tailwind CSS (v4)
- Editor: Monaco Editor (@monaco-editor/react)
- Backend: Node.js + Express
- Database: MongoDB via Mongoose
- Real-time: Socket.IO + Yjs (CRDT library)
- Presence/Cache: Redis (ioredis)
- Auth: JWT + Google OAuth via Passport.js
- AI: Google Gemini 2.5 Flash (free tier, 1500 req/day)
- Code execution: Piston API (open source, unlimited free)
  with JDoodle as fallback
- Deployment: Railway (supports WebSockets + persistent processes)

## Why Railway not Vercel
Vercel is serverless — Socket.IO requires persistent WebSocket
connections. Serverless functions close after the request completes,
killing WebSocket connections. Railway supports persistent processes
natively and is what the existing CodeSync is already deployed on.

## User flows

### Anonymous user
- Land on home page
- Click "Create Room" → gets a UUID room code
- Share the link, friends join instantly
- Edit code collaboratively in real time (Yjs CRDT)
- Chat with room members in right sidebar
- Run code via Piston API
- See other users' colored cursors in Monaco
- Room expires after 24 hours
- CANNOT: save projects, use AI, access history

### Authenticated user (Google login)
- All anonymous features PLUS:
- AI assistant (Gemini) in right sidebar — auth gated
- Autosave every 30 seconds to MongoDB
- Version history — restore any snapshot
- Project browser in left sidebar
- Rooms never expire
- Can claim an anonymous room after logging in

## Project structure
codesync/
├── server/
│   ├── index.js                 # Express + Socket.IO entry point
│   ├── config/
│   │   ├── db.js                # Mongoose connection
│   │   ├── redis.js             # Redis connection (ioredis)
│   │   └── constants.js         # Env var exports + SYNC_MODE
│   ├── models/
│   │   ├── User.js
│   │   ├── Project.js
│   │   ├── Room.js
│   │   └── SessionMetrics.js    # Core research data collection
│   ├── routes/
│   │   ├── auth.js
│   │   ├── projects.js
│   │   └── ai.js                # Gemini proxy (auth protected)
│   ├── middleware/
│   │   └── auth.js              # JWT protect middleware
│   ├── socket/
│   │   ├── collab.js            # Yjs CRDT sync over Socket.IO
│   │   └── metrics.js           # Latency + conflict collection
│   └── services/
│       ├── gemini.js            # Gemini API streaming
│       └── piston.js            # Piston code execution
├── client/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── api/
│   │   │   └── client.js        # Axios with auth interceptor
│   │   ├── context/
│   │   │   └── AuthContext.jsx
│   │   ├── pages/
│   │   │   ├── Home.jsx         # Landing — create/join room
│   │   │   ├── Room.jsx         # The editor workspace
│   │   │   └── Dashboard.jsx    # Auth only: project list
│   │   ├── components/
│   │   │   ├── editor/
│   │   │   │   ├── EditorPane.jsx
│   │   │   │   ├── TabBar.jsx
│   │   │   │   └── LanguageSelector.jsx
│   │   │   ├── sidebar/
│   │   │   │   ├── ChatTab.jsx
│   │   │   │   ├── AiTab.jsx
│   │   │   │   └── MembersTab.jsx
│   │   │   ├── output/
│   │   │   │   └── OutputPanel.jsx
│   │   │   └── shared/
│   │   │       ├── Navbar.jsx
│   │   │       └── Presence.jsx
│   │   └── hooks/
│   │       ├── useYjs.js        # Yjs + Socket.IO binding
│   │       ├── useRoom.js       # Room state
│   │       └── useMetrics.js    # Client-side metric collection
│   ├── index.html
│   └── vite.config.js
├── CLAUDE.md
├── paper-notes.md
├── .env.example
├── .gitignore
└── package.json

## Mongoose models

User
  email, name, avatar, provider (google/local),
  providerId (sparse index), createdAt
  timestamps: true

Project
  owner (ref User), name, description,
  files: [{name, language, content, updatedAt}],
  language, roomId (optional), isPublic,
  snapshots: [{version, files, savedAt, description}],
  lastActivity
  timestamps: true

Room
  roomId (unique), owner (ref User, optional),
  isAnonymous (boolean), members: [{userId, name, color, joinedAt}],
  files: [{name, language, content}], activeFile, language,
  chat: [{userId, name, message, timestamp}],
  expiresAt (24h for anonymous, null for auth)
  timestamps: true

SessionMetrics
  roomId, syncMode (enum: crdt, naive),
  startedAt, endedAt,
  syncLatencies: [{value (ms), timestamp, userCount}],
  conflictCount, revisionCount,
  concurrentUsersOverTime: [{count, event, timestamp}],
  editHistory: [{userId, fileName, bytesChanged, timestamp}],
  bandwidthPerEdit: [{bytes, timestamp, syncMode}]
  Virtual: averageSyncLatency
  timestamps: true

## Socket.IO events (snake_case)
Client → Server:
  join_room, leave_room, yjs_update, chat_message,
  cursor_move, run_code, save_project, request_metrics

Server → Client:
  room_state, user_joined, user_left, yjs_update,
  chat_message, cursor_update, run_result, metrics_snapshot

## SYNC_MODE — critical for paper experiments
SYNC_MODE env var toggles between 'crdt' and 'naive'.
- 'crdt': uses Yjs CRDT (production mode, the contribution)
- 'naive': full document broadcast on every keystroke (baseline)
Same room, same users, both modes collect into SessionMetrics.
Day 16 wires the toggle. Days 25-26 run the actual experiments.
This comparison IS the paper's core empirical contribution.

## AI integration
- Provider: Google Gemini 2.5 Flash
- Free tier: 1500 requests/day, no credit card needed
- Auth required — clicking AI panel while logged out shows login prompt
- Streams responses via SSE
- Context per request: active file content + language + last 10 turns
- Features: explain, debug, refactor, optimize, translate language

## Code execution
- Primary: Piston API (https://emkc.org/api/v2/piston)
  No API key, no rate limits, open source
- Fallback: JDoodle (200 runs/day free)
- Languages: JS, Python, Java, C, C++, TypeScript, Go, Rust

## Coding conventions
- React functional components + hooks only (no class components)
- async/await everywhere, no raw callbacks
- All API routes return { success, data, error }
- Socket events in snake_case
- Tailwind for all styling (no separate CSS files)
- Every file has a short comment block at top explaining its purpose
- Mongoose schemas use timestamps: true

## Research metrics (DO NOT SKIP)
Every sync event records to SessionMetrics:
- syncLatency: time from client emit to server broadcast (ms)
- conflictCount: Yjs conflict resolution events per session
- revisionCount: total document revisions
- concurrentUsers: recorded on every join/leave event
- bandwidthPerEdit: bytes sent per edit operation (key for paper)

Baseline experiment runs Day 25-26:
  Toggle SYNC_MODE between 'crdt' and 'naive'
  5 users, 1000 scripted edits each mode
  Measure: conflict count, input loss %, avg latency, bandwidth
  Results go directly into paper Table 2 and Figures 3-5

## Environment variables
PORT, NODE_ENV, CLIENT_URL,
MONGODB_URI, REDIS_URL,
JWT_SECRET, JWT_EXPIRES_IN,
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
GEMINI_API_KEY,
PISTON_API_URL=https://emkc.org/api/v2/piston,
JDOODLE_CLIENT_ID, JDOODLE_CLIENT_SECRET,
SYNC_MODE=crdt

## Deployment
Platform: Railway
Frontend + Backend: same Railway project, two services
WebSocket proxy: configured in vite.config.js for dev,
  handled natively by Railway in production
MongoDB: MongoDB Atlas free tier
Redis: Railway Redis plugin or Redis Cloud free tier

## Paper target
Journal: Future Internet (MDPI)
ISSN: 1999-5903
Status: Confirmed active in Scopus May 2026
Scope: Web-based systems, distributed computing, internet apps
APC waiver: Email futureinternet@mdpi.com citing student status
Guide approval: Required before submission (Parul University policy)
Max authors: 4 students + 1 guide, guide name last
AI content: Must be 0% — rewrite all Claude output in own words
Plagiarism: Run Turnitin before submission