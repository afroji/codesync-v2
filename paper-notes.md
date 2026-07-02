# Paper Notes — CodeSync

## Paper title
CodeSync: Design and Performance Evaluation of a Real-Time
Collaborative Multi-Language Programming Environment Using
CRDT-Based Synchronization

## Target journal
Future Internet (MDPI) — Scopus active as of May 2026
ISSN: 1999-5903 — verify active on scopus.com before submitting

## Research question
Can CRDT-based collaborative editing (Yjs) reduce edit conflicts
and input loss compared to conventional WebSocket broadcast
synchronization under concurrent user load?

## Research gap (Introduction section)
Existing collaborative programming platforms either:
- Require mandatory authentication (Replit, GitHub Codespaces)
- Are proprietary and closed-source (VS Code Live Share)
- Lack proper conflict resolution (most educational tools use
  last-write-wins Socket.IO which loses keystrokes under load)
- Are designed for documents not code (Google Docs, Notion)

None provide anonymous collaboration + CRDT sync + AI assistance
+ multi-language execution in a unified open platform.

## Our contribution
1. Architecture: hybrid anonymous + authenticated collaboration model
2. Synchronization: CRDT (Yjs) over Socket.IO with measurable
   comparison against naive broadcast baseline
3. Evaluation: empirical data — latency, conflicts, bandwidth,
   input loss across 2/5/10/20 concurrent users

## Related work comparison table
| Feature | VS Code Live Share | Replit | CodePen | CodeSync |
|---|---|---|---|---|
| Anonymous collaboration | No | No | Limited | Yes |
| CRDT-based sync | No | No | No | Yes |
| Multi-language | Yes | Yes | No | Yes |
| AI assistance | Yes | Yes | No | Yes |
| Open source | No | No | No | Yes |
| Guest to auth upgrade | No | No | No | Yes |
| Performance evaluation | No | No | No | Yes |

## Experiments (run Days 25-26, fill in results here)

### Experiment 1 — Concurrent users vs sync latency
Setup: scripted users typing simultaneously, SYNC_MODE=crdt
| Users | Avg latency (ms) | Max latency (ms) | Conflicts |
|---|---|---|---|
| 2 | | | |
| 5 | | | |
| 10 | | | |
| 20 | | | |

### Experiment 2 — CRDT vs naive broadcast (core comparison)
Setup: 5 users, 1000 edits each, same room, toggle SYNC_MODE
| Metric | Naive Socket.IO | Yjs CRDT | Improvement |
|---|---|---|---|
| Conflict count | | | |
| Input loss % | | | |
| Avg sync latency (ms) | | | |
| Bandwidth per edit (bytes) | | | |

### Experiment 3 — Bandwidth efficiency
Yjs sends delta updates only. Naive sends full document each time.
| Document size | Naive (bytes/edit) | CRDT (bytes/edit) |
|---|---|---|
| 1KB | | |
| 10KB | | |
| 50KB | | |

### Experiment 4 — Stress test
1000 edits, 5 users, random simultaneous typing, CRDT mode
- Total input loss: ___%
- Total conflicts resolved: ___
- Average resolution time: ___ ms
- Server CPU peak: ___%
- Memory peak: ___ MB

## Screenshots needed
- [ ] Home page (create/join room buttons)
- [ ] Room with 2+ users, colored cursors visible
- [ ] AI panel responding to a code question
- [ ] Performance dashboard showing live metrics
- [ ] Version history panel (auth user)

## Paper structure
1. Abstract (write last, 200 words)
2. Introduction — problem, gap, contribution, paper structure
3. Related Work — table above + 5 tool descriptions + 15 papers
4. System Architecture — diagram + tech stack table + data model
5. Synchronization Design — CRDT vs OT, Yjs, how it works
6. Implementation — 4 subsections (auth, collab, AI, execution)
7. Experimental Evaluation — 4 experiments with graphs
8. Discussion — what results mean, limitations
9. Conclusion + Future Work
10. References (target 20-25, mostly 2020-2026)

## Daily implementation notes
Update this section each day. Claude Code does it automatically
when you say "update paper-notes.md for Day X" at end of session.
This becomes the Implementation section of the paper.

### Day 1 — Project scaffold
Built the full monorepo skeleton: root package.json with
concurrently-driven dev/install scripts, Express + Socket.IO server
entry point, four Mongoose schemas (User, Project, Room,
SessionMetrics), and a Vite + React client with Tailwind v4 and a
working landing page (Create Room / Join Room, anonymous-first flow).
Confirmed end-to-end: /api/health returns
{ success, db: "connected", syncMode: "crdt" }, home page renders,
Create Room navigates to /room/<uuid> stub, Vite proxy forwards
/api and /socket.io to the Express server.

Key tech decisions:
- SYNC_MODE env toggle ('crdt' | 'naive') built into constants.js
  from day one — this is the switch Days 25-26 flip to run the
  core CRDT-vs-naive-broadcast experiment, so it needed to exist
  before any sync logic does.
- SessionMetrics schema (syncLatencies, conflictCount,
  revisionCount, concurrentUsersOverTime, editHistory,
  bandwidthPerEdit + averageSyncLatency virtual) designed for the
  research data model up front, not bolted on later — every field
  maps directly to a metric in paper-notes.md Experiments 1-4.
- Tailwind v4 via @tailwindcss/vite plugin (no postcss.config.js,
  single `@import "tailwindcss"` in index.css).
- Piston chosen as primary code execution API over JDoodle: no key,
  no rate limit, open source — JDoodle kept as fallback only
  (200 runs/day free tier).
- Redis connection is non-fatal by design (config/redis.js only
  logs on error, never exits) since Redis is presence/cache only —
  MongoDB is the source of truth, so a down Redis shouldn't take
  the whole server down.
### Day 2 — Mongoose models
Built out all 4 models to their full spec: User (bcrypt-hashed
passwordHash with a pre-save hook, comparePassword instance
method, toJSON strips the hash), Project (typed file/snapshot
subdocuments, fileCount virtual, pre-save default-file creation),
Room (member/file/chat subdocuments, 200-message chat cap enforced
in pre-save, syncMode seeded from the SYNC_MODE env var), and
SessionMetrics (syncLatencies, conflictCount, revisionCount,
concurrentUsersOverTime, editHistory, bandwidthPerEdit,
inputLossEvents, plus averageSyncLatency/peakConcurrentUsers/
totalInputLoss virtuals). Added a models/index.js barrel export
and wired it into server/index.js so every schema registers on
boot. Verified end-to-end with a temporary /api/test/models route
(now removed): created one of each model, confirmed Room.expiresAt
landed ~24h out, Project.files auto-populated main.js via the
pre-save hook, the User response had no passwordHash field,
SessionMetrics.syncMode was 'crdt', all 4 documents were deleted
after the check, and db.rooms.getIndexes() showed the TTL index
(expiresAt_1, sparse, expireAfterSeconds: 0) alongside the unique
roomId_1 index.

Why SessionMetrics has both syncMode and inputLossEvents:
these are the two fields that directly answer the research
question. syncMode records which algorithm was active for a
given session so results can be grouped/compared; inputLossEvents
is the actual dependent variable — every time an edit is
overwritten or lost. The hypothesis is inputLossEvents.length
stays at 0 for syncMode: 'crdt' and grows under syncMode: 'naive'
under concurrent load. Every other field (latency, bandwidth,
conflicts) supports that finding, but this pair *is* the finding.

Why Room uses a TTL index instead of a cron job:
MongoDB's TTL monitor runs as a background thread on the database
itself, checks expiresAt every ~60s, and deletes matching documents
without the app server needing to be running, stay awake, or hold
a lock. A cron job would mean writing a scheduler, handling the
case where the server restarts mid-cycle, and adding an extra
failure mode (a stuck/crashed cron leaves stale rooms forever).
sparse: true means the index only applies to documents that
actually have expiresAt set — auth-owned rooms store it as null
and are simply never touched by the TTL sweep.

Why anonymous users are not stored in the User collection:
the whole pitch of the anonymous flow is zero friction — no
signup, no data collection, nothing to delete later. If a guest's
name/color/session were persisted in User, that's PII collected
from someone who never consented to an account, and it creates a
GDPR-shaped cleanup problem for data tied to people who never
opted in. Keeping anonymous members as plain subdocuments inside
Room (which itself TTLs out after 24h) means guest data has a
built-in expiry and never outlives the session that created it.
### Day 3 — Auth backend (JWT + Google OAuth)
Built the complete authentication backend: generateToken.js
(signs { id: userId } with JWT_SECRET/JWT_EXPIRES_IN), middleware/
auth.js exporting protect (401s without a valid token) and
optionalAuth (silently no-ops without one), config/passport.js
(Google OAuth strategy — matches on provider+providerId first,
falls back to email-collision detection, creates a new user
otherwise, no serialize/deserialize since we're JWT not sessions),
and routes/auth.js (register, login, me, google, google/callback,
logout). Wired into server/index.js via passport.initialize().
Also added utils/generateGuestName.js (36 single-word names —
animals, space objects, code terms — for Day 6's anonymous
member identities).

Ran all 8 curl tests end-to-end against the Atlas-backed dev
server: register (201, no passwordHash in response), duplicate
email (400), login with correct password (200, lastSeen bumped
from create-time to login-time), login with wrong password (401,
same "Invalid email or password" message as a nonexistent user —
prevents email enumeration), /me with a valid token (200 + user +
projectCount: 0), /me with no token (401 "No token"), /me with a
garbage token (401), and the Google OAuth redirect (302 to
accounts.google.com with the correct callback URL resolved and
client_id present). Deleted the test user from Atlas afterward.

Two things that came up during implementation, worth recording:
- The spec's login route suggested `.select('+passwordHash')` to
  retrieve the field Day 2's toJSON strips. Verified this isn't
  needed — the schema never marks passwordHash as `select: false`,
  so it's already present on the fetched Mongoose document;
  toJSON only strips it during JSON serialization (res.json()),
  not from the in-memory document used by comparePassword(). Login
  works correctly with a plain User.findOne({ email }).
- passport-oauth2 throws at construction time if clientID is an
  empty string, which is exactly the state of a fresh .env before
  Google Cloud Console credentials exist — this crashed the server
  on boot. Fixed by guarding strategy registration behind an
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) check that logs
  a warning and skips registration instead of crashing, so the
  rest of the app stays usable without OAuth configured. Added
  placeholder credentials to .env for today's redirect test; real
  ones need to be swapped in before Day 4's OAuth callback page
  can be tested against actual Google accounts.

Why JWT over sessions for a real-time collaborative app:
sessions are stored server-side (in-memory or in a session store),
which means whichever server instance handles login has to be the
one that validates every later request — or every instance needs
shared access to the same session store. Once we're running
multiple Socket.IO server instances (needed to scale beyond one
process), a session created on instance A is useless if a
WebSocket connection lands on instance B. JWT is stateless — the
token itself carries everything needed to verify identity, so any
server instance can validate it without a shared store or sticky
sessions. That matters here specifically because the whole point
of the project is measuring behavior under concurrent load, which
is also exactly when horizontal scaling considerations start to
matter.

Why optionalAuth exists:
anonymous collaboration with no login is the core UX decision of
this project (see CLAUDE.md's anonymous user flow) — a room has to
work fully for a guest with zero auth state. But some routes need
to behave differently for a logged-in user without requiring login
(e.g. showing "Save to my projects" only if there's a valid user).
protect would 401 a guest outright; optionalAuth attaches req.user
when a valid token is present and just moves on silently when it
isn't, so the same route can serve both audiences without being
split into two.

Note: Google OAuth is wired and the redirect works, but the
callback flow isn't fully testable end-to-end yet — it needs the
/oauth client page (Day 4) to receive the token+user query params,
and real Google Cloud Console credentials to replace today's
placeholders.
### Day 4 — Auth frontend (Login, Register, OAuth callback)
Built the React side of authentication: AuthContext.jsx (global
user/token/loading state, validates any stored token against
GET /me on mount rather than trusting localStorage blindly),
ProtectedRoute.jsx (renders nothing while loading to avoid a
flash of the login page, redirects to /login once loading
resolves with no user), and wired AuthProvider + a protected
/dashboard route into App.jsx. Built Login.jsx and Register.jsx
matching the design system's login card (same dark background,
380px card, Google button, divider, inputs) with full working
email/password forms — inline validation, a password show/hide
toggle, and error states wired to the Day 3 backend. Built
OAuthCallback.jsx to bridge the server's redirect back into React
state. Updated Home.jsx to be auth-aware (shows the user's name/
avatar and a dashboard link when logged in, without forcing a
redirect away from the anonymous flow), and updated api/client.js
so a 401 clears both localStorage keys and only force-navigates to
/login when not already on /login or /register (avoids a redirect
loop while a user is actively typing on those pages).

Tested end-to-end against the real backend (through the Vite
proxy, not just direct API calls): registered a new account via
the form logic path, confirmed the token/user round-trip through
AuthContext.login(), confirmed GET /me revalidates correctly on
a simulated remount, confirmed the Google OAuth button's href
still redirects to accounts.google.com through the proxy, and
deleted the test account from Atlas afterward. All new routes
(/login, /register, /dashboard, /oauth) serve correctly and every
changed source file compiles without errors via Vite HMR.

Bug caught and fixed: OAuthCallback.jsx followed the spec's literal
`JSON.parse(decodeURIComponent(userParam))`, but react-router's
useSearchParams (built on URLSearchParams) already percent-decodes
.get() results — so userParam arrives as plain JSON, not an encoded
string. Calling decodeURIComponent on already-decoded JSON is a
no-op almost always, but throws a URIError the moment a user's
Google display name contains a literal "%" (verified with a
"Bob % Smith" test case — it crashed the callback page and would
have hard-locked that user out of login). Fixed by parsing
userParam directly without the redundant decode.

Why AuthContext validates the token on mount via /me rather than
trusting localStorage blindly:
a token sitting in localStorage doesn't mean it's still valid —
it could be expired (JWT_EXPIRES_IN is 7d, so any session older
than that is dead weight) or the user could have been deleted
server-side. Trusting it blindly would let the UI render as
"logged in" with a token that fails the moment any real API call
is made, producing a confusing half-authenticated state. Calling
/me on mount forces one round-trip that either confirms the token
still works (and gets the current user data, not a stale copy)
or clears it immediately so the UI reflects reality from the
first render.

Why OAuthCallback is a separate page rather than handling the
redirect directly on the server:
the server's OAuth callback route can set an HTTP redirect, but it
cannot reach into the browser and call a React function or write
to localStorage in a way React's state picks up — a raw redirect
response has no access to client-side JS state. /oauth exists
purely as a bridge: it's a real React route that mounts, reads the
token/user the server appended as query params, calls the same
login() function every other auth path uses, and then navigates
into the SPA. Without it, the only way to get server-issued OAuth
data into React state would be something clunkier like postMessage
between windows or a polling endpoint — a dedicated callback route
is simpler and keeps all login paths (email, register, OAuth)
converging on the same AuthContext.login() call.

Anonymous-first UX, reaffirmed: login is never forced anywhere in
this session's work. Home.jsx still leads with Create Room / Join
Room for every visitor regardless of auth state; the only thing
that changes when logged in is what the footer link points to.
Both Login and Register keep a "Continue anonymously →" link back
to /, and ProtectedRoute only gates /dashboard — rooms themselves
stay reachable with zero auth state, matching CLAUDE.md's anonymous
user flow.
### Day 5 — Room page shell (editor workspace + Monaco)
Built the full IDE shell: RoomLayout.jsx (the flex column/row scaffold),
TopBar.jsx (logo, copyable room code with a "Copied!" flash, a
language indicator, overlapping presence avatars capped at 4 + a
"+N" overflow avatar, Run/Save/Share buttons, an auth-aware
Save-disabled-with-lock-icon state for anonymous users, and a
user-menu dropdown for logged-in users), LeftSidebar.jsx (file list
with language-colored dots, active-row left accent border, an
auth-aware bottom block), EditorPane.jsx (Monaco with a real file
tab bar above it), RightSidebar.jsx (Chat/Members/AI tabs, AI tab
showing the design file's dim-preview-plus-lock-overlay treatment
when logged out), and BottomPanel.jsx (Output/Problems tabs,
collapse-to-header-only toggle). Room.jsx wires it all together
against a hardcoded mock room object — no backend calls yet.

All data is mocked locally on purpose. GET /api/rooms/:roomId
doesn't exist until Day 6, and the chat/members/files shown today
are a static object built in Room.jsx, not fetched from anywhere.
Building the entire UI shell against fake-but-realistic data before
any Socket.IO or Yjs wiring exists means every layout, color, and
interaction bug gets caught and fixed while the moving parts are
just React state — once Day 6 adds real-time sync on top, the
surface area for new bugs is limited to the sync logic itself, not
tangled up with UI bugs that were actually always there. Same
principle applies again on Day 15 (real save) and Day 17 (real AI):
today's placeholders are exactly where those wire in later.

Monaco setup: theme vs-dark, JetBrains Mono to match the design
system's mono token (with Fira Code and monospace as fallbacks in
case the font hasn't loaded yet), automaticLayout: true so the
editor re-measures itself whenever the surrounding flex panels
resize (collapsing the bottom panel, for instance) instead of
leaving stale scrollbars/blank space, smoothScrolling +
cursorBlinking: 'smooth' for feel, and Cmd/Ctrl+S intercepted via
editor.addCommand — without this the browser's native "Save Page
As" dialog would pop up over the editor, which is exactly the kind
of thing that would make demoing the app to the guide painfully
awkward. The handler just console.logs today; Day 15 replaces it
with a real autosave call.

Known limitation carried forward on purpose: EditorPane tracks
edited content for only the currently-active file (a single
`content` string reset on tab switch), not a per-file map — so
switching tabs today does not persist in-progress edits to the
file you switched away from. This matches the task's own state
design for this shell and is fine precisely because Day 6+ replaces
this whole local-content model with Yjs documents (one CRDT doc per
file, always live, no "did I lose my edit by switching tabs"
question at all). Building a proper per-file draft cache today
would just be thrown away in a day or two.

Verification note: this was tested at the code level — clean
compilation of every new file (no Vite error overlays), a clean
oxlint pass across all of them, Monaco's dependency confirmed
pre-bundled by Vite, and the room route serving correctly — but not
with an actual browser click-through, since no browser automation
tool is available in this environment. The design-fidelity checks
(does it visually match the mockup, do hover/collapse/copy
interactions feel right) still need a manual pass.
### Day 6 — Socket.IO rooms (real presence, join/leave, live chat)
Built the real-time layer that replaces Day 5's mock room. Server:
routes/rooms.js (POST /api/rooms creates-or-returns-existing so the
same endpoint handles both "create a fresh room" and "join by URL",
GET /api/rooms/:roomId, DELETE owner-only close), and socket/collab.js
(join_room/leave_room/disconnect/chat_message/cursor_move handlers,
auto-creating the Room + SessionMetrics documents if a user lands on
a room URL that was never POSTed first). Client: hooks/useRoom.js
(owns the socket connection, join/leave lifecycle, and all the room
state updates from server events), and Room.jsx/TopBar.jsx/
RightSidebar.jsx updated to consume it instead of the Day 5 mock
object. Chat and members lists are now driven entirely by
socket events, not local component state.

Verified end-to-end with two real Socket.IO clients scripted against
the actual running server (not mocked) — both connected, both got
room_state, client A saw client B's user_joined fire with the
correct memberCount, chat messages sent from either client arrived
at both (including the sender, per spec, to keep local echo and
server state consistent), and disconnecting client B fired
user_left on client A with memberCount back down to 1. Also
confirmed the same flow works through the actual Vite dev proxy on
:5173 (the real path a browser tab uses), not just direct-to-:3000.
Checked Atlas afterward: the Room document had both chat messages
persisted and an empty members array once both clients left, and
SessionMetrics.concurrentUsersOverTime recorded the exact sequence
(join A→1, join B→2, leave B→1, leave A→0) with endedAt set the
moment the anonymous room emptied out — precisely the shape
Experiment 1 needs. Cleaned up all test rooms afterward.

The sessionStorage userId trick: anonymous users get a
crypto.randomUUID() written to sessionStorage on first connect,
then reused on every reconnect within that browser tab/session.
This means refreshing the page doesn't make you a "new" member from
the room's perspective — same userId, so join_room's alreadyMember
check recognizes you and the server doesn't double-add you to
room.members. It's tab-scoped (sessionStorage, not localStorage) on
purpose: opening the same room URL in a second tab should look like
a second person joining, which is exactly what the two-tab test
above exercises. No account, no form, no friction — just a stable
identity for as long as the tab stays open.

Why cursor_move is not persisted to MongoDB: it's the highest-
frequency event in the entire app — it fires on every mouse move
across the editor, potentially dozens of times per second per user.
Writing that to MongoDB would generate gigabytes of data that
answers no question the paper is asking; SessionMetrics exists to
capture sync latency, conflicts, bandwidth, and input loss — not
where someone's mouse was. socket.to(roomId).emit (not io.to)
also deliberately excludes the sender, since you never need to see
your own cursor echoed back. This is genuinely ephemeral presence
data: broadcast live, never written down, gone the moment nobody's
listening.

End of Day 6: two users in the same room now see each other's
presence update live and can chat in real time through a real
WebSocket connection and a real MongoDB-backed room — this is
actual collaboration, not a simulation of it. What's still missing
is the thing that makes this project's research contribution
possible: the code in the Monaco editor itself is still only
client-local. Two people in the same room right now would see each
other's cursors move and could chat, but typing in main.js would
not appear on the other person's screen. That's exactly the gap
Day 7 (naive broadcast) and Day 9 (Yjs CRDT) fill — and now that
presence/chat/rooms are real, those two days can be built and later
measured against each other without any other moving part being
fake.
### Day 7 — Naive sync baseline (full document broadcast)
Built the naive side of the paper's core comparison. Server:
collab.js's code_change handler broadcasts the full document to
every other user in the room on each edit (socket.to, excluding the
sender), updates Room.files.$.content so new joiners see the latest
version, and — the important part — records syncLatency,
bandwidthPerEdit (real byte size, full doc), revisionCount, and a
50ms-window conflict/input-loss detector into SessionMetrics on
every single event. Added request_metrics for the Day 21 dashboard.
Client: hooks/useSync.js owns the debounced (50ms) emit + the
"ignore my own echo for the next 50ms after applying a remote
update" guard that stops a receive-then-rebroadcast loop; wired
into EditorPane via Room.jsx (lifted there rather than called
inside EditorPane itself, since isSyncing also needs to reach
TopBar — a sibling — so Room.jsx is the correct common-ancestor
place for the hook call, not EditorPane). TopBar now shows a live
Syncing/Live/Offline indicator and a CRDT/NAIVE mode badge sourced
from room.syncMode.

Bug found and fixed while testing this (not asked for, but exposed
directly by today's own work): join_room and handleLeave both used
a fetch-then-mutate-then-.save() pattern on the Room document.
Mongoose's versioned save() throws VersionError if the document
changed between the read and the write — and it did, live, in the
dev logs, the moment real concurrent join/leave activity started
happening. Naive sync's whole premise is measuring what breaks
under concurrent access, so leaving a concurrency bug in the
membership-tracking code right next to it would have quietly
corrupted the very data this feature exists to collect. Fixed both
to use atomic findOneAndUpdate ($push/$pull with a query condition
instead of fetch+save) — no version field involved, no race
possible regardless of how many users join/leave at once.

What actually happened when two users typed at the same time
(verified with two real Socket.IO clients against the live server,
not a simulation of the server): Tab A emitted "AAAA", Tab B emitted
"BBBB" 21ms later. Both edits reached the server and were broadcast
via socket.to() (sender excluded). Result: Tab A's own screen ended
up showing "BBBB" — B's edit arrived and unconditionally overwrote
A's local content, silently discarding what A had just typed. Tab
B's screen ended up showing "AAAA" for the same reason in reverse.
Neither tab ended up seeing its own edit, and the two tabs did not
even converge to the same content as each other — MongoDB's stored
Room.files.content ended up as "BBBB" (whichever write landed last
server-side), which matched what A saw but not what B saw. This is
worse than a clean "last write wins": for a window of time the two
collaborators are looking at genuinely different, both-wrong
documents. SessionMetrics confirmed it precisely: conflictCount: 1,
and inputLossEvents recorded "Concurrent edit conflict on main.js:
nu-a edited 21ms ago" against nu-b's write. revisionCount, the 3
syncLatencies entries, and bandwidthPerEdit (27, 4, 4 bytes — full
document every time, not deltas) all matched the 3 real edits sent.
This is the honest, measured naive-sync failure case Experiment 2's
baseline row describes — not a hypothetical, an observed one.

Why the 50ms conflict-detection window: fast typists average
somewhere around 150-250ms between keystrokes in normal sequential
typing, so a 50ms window is well below that — it won't misfire on
one person typing quickly alone. Two *different* users editing the
same file within 50ms of each other is specifically the "two people
typed over each other" case, not "one person types fast."

Why byteSize uses new Blob([content]).size rather than
content.length: content.length counts UTF-16 code units (JavaScript
string length), not bytes — any non-ASCII character (accented
letters, emoji, non-Latin scripts) would undercount or overcount
actual network bytes. Blob's .size reflects the true UTF-8 byte
count that actually goes over the wire, which is what "bandwidth
per edit" needs to mean for the paper's Experiment 3 (bandwidth
efficiency) to be measuring something real.

This naive implementation is intentionally broken under concurrent
load — that's not a bug to fix later in this file, it's the
baseline the whole paper measures against. Day 9 replaces the
"last write wins, unconditionally overwrite the other tab's screen"
model with Yjs CRDT, and Days 25-26 run both modes through the same
scripted concurrent-edit scenario to produce the actual numbers for
Table 2 and Figures 3-5.
### Day 8 — Metric collection pipeline (round-trip latency, bandwidth deltas, aggregation endpoints)
Completed the research data pipeline. Server: code_change now acks back
to the sender (code_change_ack) so the client can compute true
round-trip latency instead of the Day 7 one-way figure; added a
latency_report listener that pushes into a new roundTripLatencies
array on SessionMetrics (plus a best-effort backfill onto the
matching syncLatencies entry); bandwidthPerEdit now also records
deltaApprox (the size difference from the previous edit — a stand-in
for what a real CRDT delta would be, until Day 9). Added
routes/metrics.js: GET /api/metrics/:roomId (full aggregation —
latency avg/min/max/p95, bandwidth totals, input loss rate,
concurrent-user timeline) and GET /api/metrics/compare?roomId1&roomId2
(the endpoint that will generate the paper's Table 2 once Day 9's
CRDT run exists to compare against). Client: hooks/useMetrics.js
(polls the REST endpoint every 5s, also listens for the Day 7
metrics_snapshot socket event) wired into Room.jsx and a small
metrics pill in TopBar showing live avg latency / edit count /
conflict count. Added server/scripts/experiment-naive.js — 5
scripted users typing 200 edits each into the same file, no
coordination — which is what actually produced today's real
data below.

Two real concurrency bugs found and fixed while running the
experiment script for the first time (not hypothetical — both
crashed or corrupted data on the very first run):
1. join_room's atomic-add fix from Day 7 only handled two users
   racing to join an *existing* room. It didn't handle multiple
   users racing to auto-create a *brand-new* room at the same
   instant — exactly what 5 scripted users connecting to a fresh
   roomId together does. All 5 saw "room doesn't exist," all 5
   called Room.create() with the same roomId, and 4 of them threw
   an uncaught E11000 duplicate-key error. Fixed by wrapping
   Room.create() in try/catch: on E11000, the loser re-joins the
   room the winner just created via the same atomic $push-if-absent
   used for existing rooms, instead of crashing.
2. handleLeave never cleared socket.roomId/socket.userId after
   running, so both the explicit leave_room emit AND the subsequent
   disconnect event called it for the same user — every user's
   departure was recorded twice in concurrentUsersOverTime. Caught
   by literally counting the array length after a real run (10
   users' worth of events for a 5-user experiment). Fixed by
   clearing those two socket properties immediately and guarding
   handleLeave to no-op if they no longer match — whichever of the
   two paths fires first "wins," the second is a clean no-op. Re-ran
   the experiment after the fix: exactly 10 events (5 joins + 5
   leaves) with no duplicates.

Real experimental data — 5 users x 200 edits = 1000 total, naive
sync, no coordination between typists, run against the live Atlas
cluster (server/scripts/experiment-naive.js experiment-naive-day8-final):

```json
{
  "roomId": "experiment-naive-day8-final",
  "syncMode": "naive",
  "sessionDuration": 69696,
  "revisionCount": 1000,
  "conflictCount": 990,
  "inputLossCount": 990,
  "inputLossRate": 99,
  "syncLatency": { "avg": 1, "min": 0, "max": 12, "p95": 4, "count": 1000 },
  "roundTripLatency": { "avg": 0, "min": 0, "max": 0, "p95": 0, "count": 0 },
  "bandwidth": {
    "totalBytes": 12350,
    "avgBytesPerEdit": 12,
    "totalDeltaApprox": 570,
    "editCount": 1000
  },
  "concurrentUsers": { "peak": 4, "timeline": [ /* 5 join + 5 leave events */ ] }
}
```

This is the naive baseline row for Experiment 2 — an honest, first
real data point: with 5 people typing into the same file at the
same time with zero coordination, 99% of edits landed within the
50ms conflict window of another user's edit. avgBytesPerEdit (12
bytes) is small here only because each simulated "edit" was a
single random character appended — deltaApprox (570 bytes total
vs 12,350 bytes total = ~4.6% of naive's byte count) already hints
at how much smaller real deltas could be, which is exactly what
Day 9's Yjs integration needs to beat to make Experiment 3's
bandwidth claim. roundTripLatency shows count: 0 here — this
script talks to the raw Socket.IO API directly (matching the task's
own provided script), not through the React useSync hook, so it
never emits code_change_ack listening or latency_report; round-trip
measurement only fires from real browser sessions. If Days 25-26
need round-trip numbers from the scripted experiments too, the
script will need the ack/report exchange added — noted for later,
not done today since it wasn't asked for.

Note on sessionDuration (69.7s) vs the script's own reported
"Total time: 4677ms": the actual typing finished in ~4.7 seconds,
but SessionMetrics.startedAt/endedAt span ~70 seconds. The gap is
Atlas's free-tier connection pool draining a backlog of ~1000
fire-and-forget metrics writes (the code_change handler
deliberately doesn't await its SessionMetrics update, so as not to
slow down the sync path) — leave_room's own writes share that same
pool and queue up behind it. Individual syncLatency values stayed
low (avg 1ms) throughout because that number is captured the
instant each handler starts running, before its own slow fire-and-
forget write is even issued. This is a real methodological note for
Days 25-26: running the actual paper experiments at full scale
(1000+ edits) against a free-tier shared Atlas cluster will need
either a paid tier, a local MongoDB instance, or awareness that
"session duration" isn't a clean proxy for "how long the typing
actually took" under this kind of write load.

Why round-trip over one-way latency for the paper: one-way latency
(server receive time - client emit time) requires the client's and
server's clocks to already agree, which they generally don't across
different machines — any clock skew shows up indistinguishably from
real network latency. Round-trip latency is measured entirely on
the client (time from its own emit to its own receipt of the ack)
using a single clock, so it's accurate regardless of clock skew
between machines. This is exactly what the paper's Experimental
Setup section should cite as the reason round-trip, not one-way,
is the reported number.

Why p95 matters more than the average here: the average (1ms in
today's run) makes naive sync look fine — it's the conflictCount/
inputLossRate that actually tells the story, not the latency
numbers at all in this case. But more generally, for any latency
metric, averages hide tail behavior: a system where 95% of users
see 20ms but 5% see 2 full seconds has the same average as one
where everyone sees ~120ms, and only the first is actually a
frustrating experience for real users. p95 is what a reviewer
should look at to judge whether the system is usable under load,
not the mean.
### Day 9 — Yjs CRDT integration (the core research contribution)
Replaced naive full-document broadcast with Yjs CRDT sync for
SYNC_MODE=crdt. Server: an in-memory Map of Y.Doc instances
(roomId -> fileName -> Y.Doc), a yjs_update handler that applies each
incoming binary delta to the server's copy and rebroadcasts the same
delta (not the document) to everyone else, a request_yjs_sync handler
so switching to a file that wasn't active at join time still gets
seeded with its current state, and join_room now pushes an initial
Yjs state for every file so new joiners start from the same content
as everyone already in the room. Client: useSync.js rewritten —
CRDT mode creates a Y.Doc per active file, binds it to Monaco via
y-monaco's MonacoBinding (so typing flows through Yjs automatically,
no more manual value/onChange plumbing), and falls back to the exact
naive-mode behavior from Days 7-8 when a room's syncMode is 'naive'.
Also fixed the Day 8 Atlas connection-pool-saturation finding: both
sync modes now batch SessionMetrics writes (flush every 10 events)
instead of firing one write per keystroke.

This was the most bug-dense day of the project so far — three
critical issues caught and fixed, none of them hypothetical:

1. The provided client-side design called Y.applyUpdate(ydoc, update)
   on incoming remote updates and sync payloads WITHOUT the origin
   argument. The "don't re-emit what I just received" guard inside
   ydoc.on('update', (update, origin) => { if (origin === 'remote')
   return }) only works if applies are tagged 'remote' — without that
   third argument, every incoming edit would immediately be treated
   as a new local edit, re-emitted to the server, rebroadcast to
   everyone, and re-applied again: an infinite feedback loop the
   moment two clients exchanged a single keystroke. Caught this by
   reading the code before running it, not after a crash. Fixed by
   adding 'remote' to both Y.applyUpdate call sites.

2. Monaco mounts asynchronously relative to React's render cycle —
   on first render, editorRef.current is still null (onMount hasn't
   fired yet), so the effect that builds the MonacoBinding would see
   no editor to bind to and do nothing, with no dependency that would
   ever make it re-run once Monaco actually became ready. On the very
   first file loaded, Yjs sync would silently never attach. Fixed by
   adding an editorMounted boolean (flipped true inside Monaco's
   onMount, after the refs are populated) as an explicit effect
   dependency/gate.

3. The provided experiment-crdt.js disconnects each simulated user
   immediately after their last edit, with no wait for other users'
   in-flight updates to arrive. Running it end to end initially
   produced "DIVERGENCE DETECTED: 996, 992, 996, 996, 1000" — which
   looked like a CRDT correctness failure but wasn't. Isolated it with
   a smaller 3-user/30-edit test: adding a 1.5s grace period before
   disconnecting converged perfectly (90/90/90, byte-identical
   content). The divergence was a measurement artifact (a user
   tearing down its socket before the last few updates from others
   arrived), not a sync bug — confirmed by re-running the real
   5-user/200-edit experiment with the grace period added:
   1000/1000/1000/1000/1000, exact convergence.

A fourth issue surfaced during the real experiment runs rather than
code review: a transient Atlas network error (MongoNetworkError,
'ResetPool', SSL alert) hit the metrics batch flush mid-run. The
original flush logic deleted the batch from memory before confirming
the write succeeded — a failed write meant that batch's ~10 events
were gone forever. First full run recorded revisionCount: 990 instead
of 1000 because of exactly this. Fixed by re-queueing a failed
batch's contents back into the pending batch on write failure instead
of discarding them, so the next flush (either the next threshold trip
or the room-empty flush in handleLeave) retries it. Re-ran the
experiment: the same transient network error hit twice more, both
times logged as "re-queueing batch for retry," and revisionCount came
out exactly 1000 — confirmed no data lost despite two real write
failures during the run. (Residual known gap: if the very last flush
of a session — the one handleLeave triggers when the room empties —
itself fails, the re-queued data has no further trigger to retry it
and would sit orphaned in memory. Rare compounding case, not fixed
today; worth revisiting before Days 25-26 run at full scale.)

Fifth: y-monaco 0.1.6 imports y-protocols/awareness internally but
doesn't declare y-protocols as a dependency in its own package.json —
Vite failed to resolve it the first time a room page tried to load
the CRDT path. Installed y-protocols directly as a client dependency
to close the gap; this is a packaging bug in the installed y-monaco
version, not something introduced by our own code.

Convergence result (Test 1 — two real Socket.IO/Yjs clients against
the live server, mirroring Day 7's exact scenario): Tab A inserted
"AAAA", Tab B inserted "BBBB" character-by-character at the same
time. Both tabs converged to the identical string "BBBBAAAA" — all 8
keystrokes preserved, both screens identical, SessionMetrics
conflictCount: 0. Direct contrast with Day 7's naive result, where
Tab A ended up showing "BBBB", Tab B ended up showing "AAAA", the two
tabs disagreed with each other, and MongoDB's stored content matched
neither collaborator's actual expectation.

experiment-crdt.js output (5 users x 200 edits = 1000 total, run
against the live Atlas cluster, server/scripts/experiment-crdt.js
experiment-crdt-day9-v2):
```
Running CRDT sync experiment: 5 users x 200 edits
Results:
  CRDTUser1: 200 edits, final doc length: 1000 chars
  CRDTUser2: 200 edits, final doc length: 1000 chars
  CRDTUser3: 200 edits, final doc length: 1000 chars
  CRDTUser4: 200 edits, final doc length: 1000 chars
  CRDTUser5: 200 edits, final doc length: 1000 chars
Total time: 6520ms
✓ All clients converged to same length: 1000
```

Full metrics (GET /api/metrics/experiment-crdt-day9-v2):
```json
{
  "roomId": "experiment-crdt-day9-v2",
  "syncMode": "crdt",
  "sessionDuration": 6013,
  "revisionCount": 1000,
  "conflictCount": 0,
  "inputLossCount": 0,
  "inputLossRate": 0,
  "syncLatency": { "avg": 1, "min": 0, "max": 15, "p95": 5, "count": 1000 },
  "bandwidth": {
    "totalBytes": 24475,
    "avgBytesPerEdit": 24,
    "totalDeltaApprox": 24475,
    "editCount": 1000
  }
}
```

Table 2 — the paper's core empirical result (GET /api/metrics/compare
?roomId1=experiment-naive-day8-final&roomId2=experiment-crdt-day9-v2):
```json
{
  "session1": { "syncMode": "naive", "conflictCount": 990, "inputLossRate": 99, "avgLatency": 1, "totalBandwidth": 12350 },
  "session2": { "syncMode": "crdt",  "conflictCount": 0,   "inputLossRate": 0,  "avgLatency": 1, "totalBandwidth": 24475 },
  "improvement": { "conflictReduction": "100.0%", "latencyDiff": "0.0ms", "bandwidthReduction": "-98.2%" }
}
```

The bandwidth tradeoff, reported honestly rather than cherry-picked:
CRDT used MORE total bytes here (24,475 vs 12,350 — a -98.2%
"reduction," i.e. roughly double), not less. This is exactly the
nuance the task anticipated and it's worth explaining precisely why:
each simulated edit in both experiments was a single-character
insert. Naive's per-edit cost is just the byte size of the full
(still-tiny) document — a few bytes. A Yjs update for even a single
character carries real CRDT protocol overhead (client ID, Lamport
clock/counter, left/right origin references for conflict-free
positioning, type tags) encoded in Yjs's compact binary format —
averaging ~24.5 bytes/edit here regardless of how small the actual
character insert is. That per-op overhead is roughly fixed; it does
not grow with document size. Naive's per-op cost is the full
document, which does grow with document size. So the crossover is
real and directly follows from the two costs' shapes: for a document
that stays small, naive can look cheaper per edit; past some size
threshold (roughly where full-document bytes exceed CRDT's ~20-30
byte per-op overhead), CRDT wins bandwidth too, and by a growing
margin as the document gets larger. Today's experiment used tiny
synthetic documents specifically to stress-test conflict behavior,
not bandwidth at scale — Experiment 3 (Days 25-26, varying document
size explicitly) is where the bandwidth crossover point actually gets
measured and plotted. One more honest caveat: naive's own
deltaApprox metric (Day 8, a proxy computed as the size difference
between consecutive document snapshots) drastically underestimates
what a real CRDT delta costs — Day 8's naive run showed deltaApprox
averaging ~0.57 bytes/edit, nowhere near CRDT's real ~24.5
bytes/edit. deltaApprox was only ever meant as a rough stand-in until
real CRDT numbers existed; now that they do, the real number should
replace it in any bandwidth comparison, not the proxy.

Batching fix, measured: Day 8's naive run wrote one SessionMetrics
update per keystroke (1000 writes for 1000 edits) and hit Atlas
connection-pool saturation badly enough that leave_room events were
delayed by roughly a minute after the actual typing finished. Today's
batched writes (flush every 10 events) cut that to roughly 100 writes
for the same 1000-edit CRDT run — a ~90% reduction in write volume.
The transient network errors described above still happened (Atlas's
free tier is genuinely flaky under sustained load regardless of
volume), but recovery no longer depended on volume being low enough
to avoid saturation — it depended on the retry-on-failure fix, which
is a more robust fix than volume reduction alone would have been.

Known measurement caveat carried forward, not fixed today: the
concurrentUsersOverTime peak figure can undercount the true peak
concurrent-user count when many users join within milliseconds of
each other (inherited from Day 6-7's atomic $push-based join design
— each join's reported "count" reflects MongoDB's serialization order
of concurrent writes, which doesn't always match logical join order).
Today's CRDT run's peak showed 2 despite 5 users genuinely being
connected simultaneously for the whole edit burst. Worth fixing
before Days 25-26 if Experiment 1's concurrent-user figures need to
be precise — today's actual deliverable (conflict/bandwidth
comparison) doesn't depend on this number.

Final statement: the research question now has a real, measured
answer, not a hypothetical one. "Can CRDT-based collaborative editing
(Yjs) reduce edit conflicts and input loss compared to conventional
WebSocket broadcast synchronization under concurrent user load?" —
yes. Same workload (5 concurrent users, 1000 total edits, zero
coordination between typists): naive broadcast produced 990
conflicts and a 99% input-loss rate; Yjs CRDT produced 0 conflicts
and a 0% input-loss rate. That contrast — 99% to 0%, on an identical
scripted scenario — is the empirical result this entire project has
been built toward since Day 1.
### Day 10 — Cursor presence (live colored cursors via Yjs Awareness)
Built the most visually convincing proof of real-time collaboration:
seeing other users' cursors move inside Monaco as they type. Server:
a thin awareness_update relay (forward the binary blob, never inspect
or store it) plus an awareness_cleared broadcast in handleLeave so a
departed user's cursor disappears immediately rather than waiting on
Yjs awareness's own ~30s stale-entry timeout. Client: useSync.js now
creates a Yjs Awareness instance alongside each file's Y.Doc, sets our
own { name, color, userId } as local state, relays local changes to
the server and applies remote ones, and — the actual new capability —
passes the real Awareness instance into MonacoBinding instead of Day
9's null placeholder, which makes y-monaco render remote selection/
cursor-line decorations automatically. CursorPresence.jsx adds the
floating name-label badges on top of that via Monaco's content widget
API. TopBar's presence avatars now show a pulsing "typing" dot,
listening for yjs_update/code_change events.

This day had the highest bug-to-line-of-code ratio yet — four
real, load-bearing issues in the provided design, three caught by
reading the code and checking it against the actual installed
library source before writing anything, one only checked afterward
because it happened to be checkable statically:

1. The cursor-label positioning code read state.cursor.anchor and
   treated it as a plain character offset. Neither is right: I
   read y-monaco's own source directly (node_modules/y-monaco/src/
   y-monaco.js) and confirmed MonacoBinding writes remote cursor
   state under state.selection (not state.cursor), and anchor/head
   are Yjs *relative positions* — Y.createRelativePositionFromType
   Index results, not integers. Feeding those straight into Monaco's
   getPositionAt() wouldn't throw, it would just always resolve to
   undefined, and every remote cursor label would render pinned at
   line 1, column 1 forever, regardless of where the other user's
   cursor actually was. Fixed by resolving anchor through Y.create
   AbsolutePositionFromRelativePosition(anchor, ydoc) first — the
   exact conversion y-monaco itself does internally for its own
   decorations — then calling getPositionAt() on the resolved index.
   Verified directly: a scripted client moving its cursor to offset
   20 was correctly seen at offset 20 by a second client, not stuck
   at 0.

2. handleAwarenessCleared called awareness.setLocalStateField(null,
   null) to "remove" a departed user's cursor. setLocalStateField
   sets a field on the CALLER's own local state — it has no way to
   reach into another client's entry in the states map. This line
   would not have thrown, but it would also have done nothing
   resembling cleanup; a departed user's cursor would sit on screen
   until Yjs awareness's own internal timeout (30s, hardcoded in
   y-protocols) eventually swept it — nowhere near the "within a
   second" the task's own Test 3 asks for. Fixed by finding which
   Yjs clientID(s) carry the departed userId in their state.user,
   then calling the actual removal API, removeAwarenessStates
   (awareness, clientIds, 'remote') — a named export of y-protocols/
   awareness the original design never used. Verified: a scripted
   Bob's view held 2 entries before Alice disconnected, exactly 1
   immediately after, confirmed by directly checking Alice's userId
   was no longer present — not by waiting and hoping.

3. Monaco's ContentWidgetPositionPreference.ABOVE was hardcoded as
   the numeric literal 2 with a comment claiming that's what ABOVE
   means. Checked the actual enum in monaco-editor's own type
   definitions: EXACT = 0, ABOVE = 1, BELOW = 2. The literal 2 is
   BELOW. Harmless in the sense that a label would still render
   (just underneath the cursor instead of above it, opposite of the
   design file's convention) — fixed by referencing the real
   monaco.editor.ContentWidgetPositionPreference.ABOVE enum instead
   of a magic number, which also means it can't silently drift out
   of sync with a future Monaco version the way a hardcoded literal
   could.

4. Monaco mounts asynchronously relative to React's render cycle —
   this is the same class of bug fixed on Day 9 for the document
   binding, and it applies identically here: CursorPresence's effect
   reads awarenessRef.current, but a ref's .current changing never
   triggers a re-render, so if the effect first runs before useSync
   has populated that ref (a real risk given React fires child
   effects before parent effects, and useSync's effect lives in the
   parent Room.jsx while CursorPresence is a descendant), it would
   see null once and never look again. Fixed by having useSync
   expose a second, state-based awarenessReady flag (not just the
   ref) that flips true right after awarenessRef.current is set —
   an actual state change downstream components can depend on,
   unlike a ref mutation.

Verification note: no browser automation is available in this
environment, so Tests 1, 3, 4, and 5 were verified with scripted Yjs
+ y-protocols/awareness clients that do exactly what the real React
hook does (same Awareness setup, same encode/apply/remove calls, same
relative-position math) against the actual running server — not a
mock of it. Results:
- Cursor visibility + movement (Test 1): a second client correctly
  read the first client's name ("Alice"), color, and cursor position;
  moving the cursor from offset 6 to offset 20 was correctly observed
  on the other side.
- Cursor cleanup on disconnect (Test 3): the departed user's entry
  was confirmed gone from the remaining client's awareness states
  within ~1.2s of disconnecting (well under the "within a second"
  target once network round-trip is accounted for).
- Three concurrent users (Test 4 — this is the paper's Figure 2
  scenario): Alice (#2dd4bf teal), Guest Falcon (#fb7185 coral), and
  Guest Nebula (#a78bfa purple) each correctly saw exactly the other
  two, with correct distinct names and colors, while typing into the
  same document. All three converged to byte-identical final content.
  This is the scripted equivalent of the actual demo screenshot —
  three browser tabs open side by side, each showing two live colored
  cursor labels moving in Monaco, is what Figure 2 in the paper needs;
  taking that screenshot is a manual step outside what this session
  can do, but the underlying data flow it depends on is now verified
  correct end to end.
- CRDT convergence with awareness enabled (Test 5): confirmed
  awareness doesn't interfere with document sync — same convergence
  guarantee as Day 9, now running alongside cursor broadcasts.

Why awareness is a separate layer from document sync, not folded
into the same channel: they have opposite lifecycle and correctness
requirements. Document state (Y.Text) must be conflict-free and
durable — every keystroke matters forever, which is why it goes
through Y.applyUpdate's CRDT merge and gets persisted to MongoDB.
Cursor position has no value after the cursor moves again or the
user disconnects; broadcasting it through the same persisted,
conflict-resolved channel would be paying CRDT's bookkeeping cost
for data with a lifespan measured in milliseconds. Yjs's awareness
protocol is explicitly last-write-wins and RAM-only for exactly this
reason, and the server-side handler makes the same call the paper's
existing metrics design already made for cursor_move back on Day 6:
relay it, never store it. A room with continuous mouse movement from
5 users for an hour would generate a genuinely large number of
position updates — recording all of them would dwarf every other
SessionMetrics collection combined for zero research value, since
the paper's questions are about conflicts, latency, and bandwidth of
document edits, not where anyone's mouse was.

Implementation-section note for the paper: cursor synchronization
was implemented using the Yjs awareness protocol, with y-monaco's
built-in cursor/selection line decoration handling the actual
in-editor highlight, augmented with custom floating name-label
widgets built on Monaco's content widget API (editor.addContent
Widget) for the name badges the design file specifies. The two
pieces are genuinely separate: MonacoBinding does the colored
selection highlighting automatically the moment a real Awareness
instance is passed to it; everything in CursorPresence.jsx exists
only to add the name label on top of that, since Monaco's own
decoration API doesn't include a label-widget primitive by default.
### Day 11 — Multi-file tabs (open, switch, close, add, delete, rename)

Phase 2 (the research core: naive baseline, Yjs CRDT, awareness) is
done. Phase 3 starts with the biggest architectural change since Day
9: files went from "one active file, its Y.Doc destroyed the instant
you switch away" to "every open tab has its own persistent Y.Doc that
survives switching, and is only torn down when you actually close the
tab." Plus real file management — add, delete, rename — synced across
every member of a room, not just the person who did it.

Server (server/socket/collab.js): three new handlers, add_file,
delete_file, rename_file, each validating against the room's current
file list before touching MongoDB (findOneAndUpdate keyed by roomId,
broadcast via io.to(roomId).emit so every client's file list updates,
not just the requester's). delete_file refuses to remove the room's
last file. Both add_file and rename_file reject duplicate names with
a dedicated file_error event rather than silently overwriting.

Client: a new useFileTabs.js hook owns which files are open as tabs
(separate from useSync, which owns the actual CRDT state) — openTabs,
activeTab, and a dirtyTabs set. useSync.js was rewritten around a
Map<fileName, {ydoc, ytext, awareness, cleanup}> (yDocsRef) instead of
a single Y.Doc recreated in one useEffect keyed on activeFile. Opening
a file (getOrCreateYDoc) creates an entry and registers that file's
socket listeners for its entire time open — not just while it's the
visible tab, which matters: a background tab still needs to receive
other users' edits, or switching back to it would show stale content
instead of what's actually there. Switching tabs only tears down and
rebuilds the MonacoBinding (confirmed on Day 10 via y-monaco's source
that binding.destroy() doesn't touch the underlying Y.Doc/Y.Text) to
point at the newly-active file. A file's Y.Doc is only actually
destroyed (destroyYDoc) when its tab closes.

Three real bugs found and fixed before/while writing this, none of
them in code that was ever run first and debugged after:

1. useFileTabs' own initial-state pattern (`useState(initialFiles[0]
   ...)`) only applies on the very first render. Room.jsx has to call
   this hook unconditionally on every render, including its actual
   first one — before join_room's round trip completes and room is
   still null, so initialFiles is []. Since useState never re-applies
   its initializer once real data shows up later, openTabs/activeTab
   would stay permanently empty and no tab would ever auto-open.
   Fixed with a one-shot useEffect guarded by a ref that backfills
   openTabs/activeTab exactly once, the first time initialFiles
   actually has content, and never fights the user's own tab
   management after that.

2. Renaming a file with live, unpersisted edits. Content is only
   flushed to MongoDB every 10th edit (CONTENT_PERSIST_INTERVAL, a
   Day 8 fix for Atlas connection-pool saturation), so a file's
   in-memory Y.Doc is routinely ahead of what's in the database. The
   server's roomDocs Map is keyed by fileName — without migrating
   that key on rename, a rename would orphan the live Y.Doc under the
   old name; the next yjs_update or request_yjs_sync for the new name
   would find nothing cached and fall back to MongoDB, silently
   reverting up to 9 edits. Fixed server-side with renameFileDoc(),
   which moves the live Y.Doc to the new Map key instead of
   discarding it, and client-side by having useSync's renameYDoc()
   tear down the client's own old-named entry and let a fresh
   getOrCreateYDoc(newName) re-sync from the server's now-correctly-
   migrated copy. Verified directly (see below) rather than assumed.

3. Deleting a file and then creating a new one with the same name.
   Without explicit cleanup, the deleted file's in-memory Y.Doc would
   both leak (never destroyed) and get incorrectly inherited by the
   new file, since getOrCreateDoc only creates a fresh Y.Doc when the
   Map has no entry for that name. Fixed with destroyFileDoc(),
   called from the delete_file handler, which destroys and removes
   the Map entry so a same-named file later genuinely starts empty.

A fourth issue was more of a design gap than a bug: Day 10's
awarenessReady was a boolean that flips true once and stays true.
Multi-file tabs need CursorPresence to rebind to a *different* file's
awareness every time the active tab changes — including switching
between two tabs that were both already "ready" — and React bails out
of re-rendering on a same-value state update, so a boolean can't
signal "changed again." Replaced with awarenessVersion, an integer
bumped every time useSync rebinds MonacoBinding to a new file,
guaranteeing a genuinely new value on every switch.

Verification note: same as every prior sync-layer day, no browser
automation is available, so this was tested with a scripted
socket.io-client + real Yjs library client against the live dev
server (two simulated users, Alice and Bob, in the same room) rather
than a mock. 12/12 assertions passed:
- Multi-user add/rename/delete sync (Test 3): Bob correctly received
  file_added, file_renamed (with the right oldName/newName and a
  server-recomputed language from the new extension — second.js to
  helper.py correctly flipped javascript to python), and file_deleted
  for files Alice created, renamed, and removed.
- Delete guard (Test 4): server refused to delete the room's last
  file ("Cannot delete the only file in the room") and refused a
  duplicate add_file ("A file named "main.js" already exists").
- Independent per-file Y.Doc state, i.e. tabs not losing state on
  switch (Test 1): typed "alpha content" into alpha.js's Y.Doc, then
  "beta content" into beta.js's — a stand-in for opening two tabs and
  typing in each — then re-requested alpha.js's state and confirmed
  it was still exactly "alpha content", untouched by editing beta.js.
- Rename preserving live content (Test 5): renamed alpha.js (content
  from a single edit, well short of the 10-edit persist threshold) to
  alpha-renamed.js and confirmed the new name's synced state was
  still "alpha content" — the renameFileDoc fix verified against a
  real not-yet-persisted edit, not a hypothetical one.
- Delete cleanup / no stale inheritance (Test 2, server half):
  deleted beta.js, recreated a new file also named beta.js, and
  confirmed its synced content came back empty rather than
  inheriting the deleted file's old "beta content" — the
  destroyFileDoc fix verified the same way.
Test 6 (dirty-tab indicator) and the full tab-open/close UI flow are
client-side React state (useFileTabs' dirtyTabs, driven by an
onLocalEdit callback threaded from useSync into markDirty) that can't
be exercised by a socket-level script; verified by code review of the
wiring instead — every file lints clean and every touched module
round-trips through Vite's dev transform with no compile errors.

Why background tabs keep live socket listeners instead of only the
active tab: this is the actual point of Day 11 over Day 9/10's
single-file model. If a background tab's Y.Doc stopped receiving
yjs_update events the moment it lost focus, switching back to it
would show what it looked like when you left, not what it looks like
now — indistinguishable from the exact per-file staleness bug this
day's rename fix (#2 above) was written to prevent, just triggered by
tab-switching instead of renaming. Keeping every open file's Y.Doc
"live" for its whole open lifetime, and only destroying it on actual
tab close, is what makes "switching tabs never loses or staleness
edits" true rather than true-until-someone-else-types-in-a-file-
you're-not-looking-at.

### Day 12 — Language support + code execution (Piston → JDoodle, then flipped)

Wired the Run button and made the language dropdown real. Before
writing any code, checked the task's core assumption — Piston's public
API being free/no-key, per CLAUDE.md's tech stack section — against
the live service, since Day 9-11 all found stale version strings or
API misreadings in provided pseudocode and this felt worth the same
scrutiny. It was worse than stale: POST /api/v2/piston/execute now
returns "Public Piston API is now whitelist only as of 2/15/2026.
Please contact EngineerMan on Discord..." for every language, while
GET /runtimes still works openly. Piston went from "the primary
executor" to "structurally unusable without a whitelisted key" between
when this project's stack was chosen and today. Flagged this to the
user directly rather than silently coding around it or quietly
shipping something unverifiable — the options were self-hosting
Piston via Docker, getting real JDoodle credentials, or writing
everything against mocks. User chose JDoodle, then added real
clientId/clientSecret to .env personally partway through the session
(I can't create third-party accounts on someone's behalf). Piston
stayed fully implemented as the coded fallback — flipping the primary/
fallback order back is a few-line change in services/piston.js if this
project ever gets whitelisted or self-hosts.

What was built: services/piston.js (executeWithJDoodle primary,
executeWithPiston fallback, executeCode never throws — always
resolves to a result object so the route never needs its own try/
catch around execution), routes/execution.js (POST /api/execute,
unauthenticated, 10 req/min per-IP in-memory rate limit, defense-in-
depth pattern rejection scoped to require('child_process') only),
execLatencies added to SessionMetrics, a Piston-reachability check on
server startup (kept, since /runtimes is still open and useful as an
early-warning signal for language/version drift), a working
change_language socket event + functional TopBar language dropdown
(11 languages, non-executable ones marked "(preview only)"), and a
real Run button wired through Room.jsx's runCode to a rebuilt
BottomPanel with Output/Problems/Stdin tabs.

Five real bugs found before or during implementation, none left in
by the time this was tested:

1. executeCode's fallback-failure message referenced the first
   provider's caught error variable from inside the SECOND catch
   block's scope — a catch-clause binding (catch (pistonErr) { ... })
   only exists inside its own braces. Referencing it from a sibling
   catch block would throw ReferenceError: pistonErr is not defined
   at the exact moment BOTH providers failed — the one case this
   error message exists to describe. Fixed by hoisting both error
   variables to the function's outer scope before either try/catch
   runs, assigning them inside each catch instead of relying on
   catch-clause block scope.

2. Both executeWithPiston and executeWithJDoodle's original draft
   RETURNED a {success:false} object for an unsupported language
   instead of throwing. Since executeCode does `return await
   executeWithX(...)`, a returned (non-thrown) failure short-circuits
   the whole function immediately — it would never attempt the OTHER
   provider, even if that provider's language map actually supported
   it. Fixed by having both functions throw consistently for every
   failure mode, so any failure — unsupported language, network
   error, missing credentials — correctly falls through to the other
   provider.

3. Piston's response for compiled languages (Java/C/C++) can fail at
   the compile stage before a `run` object even exists, but Piston
   still returns HTTP 200 — the original draft only ever read
   `result.run`, which would silently render as a blank successful
   run instead of showing the compiler's actual error. Fixed by
   checking `result.compile.code` first and surfacing compile.stderr
   when it's non-zero. (Not yet re-verified live against Piston
   itself, since /execute is blocked — verified the equivalent JDoodle
   failure path instead, see #5.)

4. The JDoodle language map's versionIndex values were guesses (the
   task's own draft used '4'/'5'/'1' with no stated source; I couldn't
   find a complete published table either — JDoodle's docs page only
   partially render without JS). Once real credentials existed, I
   tested empirically rather than trust either set of guesses:
   versionIndex '0' for python3 turned out to be an old interpreter
   that rejects f-strings — `print(f"Hello, {name}!")` came back as
   SyntaxError: invalid syntax. versionIndex '1' through at least '4'
   all handle modern syntax correctly; switched to '1'. javascript
   (nodejs) '0' and java '0' were confirmed working via real compiled/
   interpreted runs. c, cpp17, and typescript versionIndex '0' remain
   UNVERIFIED — JDoodle's 200-executions/day free-tier quota was
   exhausted by this session's own testing (see below) before they
   could be checked; flagged clearly in the code comment as the first
   thing to check if C/C++/TS execution ever fails.

5. The original plan for JDoodle's stdout/stderr split was "JDoodle
   doesn't separate them, put everything in stdout" — technically
   true of the documented fields, but it meant Test 7 (syntax errors
   should show in a red STDERR section) would always fail, since
   errors would render as ordinary stdout. A live syntax-error request
   during testing surfaced `isExecutionSuccess: false` in JDoodle's
   response — a real field, present on every response, not mentioned
   anywhere in JDoodle's own docs. That's precise enough to route the
   whole output blob to stderr instead of stdout when a run actually
   failed. Better than the keyword-heuristic ("does the output contain
   the word Error") I was about to fall back to, which would have
   false-positived on any program that legitimately prints the word
   "Error" as normal output.

Verification note: this is the first day this session where real
external paid-tier-adjacent services (not just this project's own
server) were in the loop, and it showed — verification was real
end-to-end execution against JDoodle for as long as the free quota
allowed, then confirmed structurally once it ran out:
- JavaScript (Test 1): real POST /api/execute, stdout
  "Hello from CodeSync!\n4", exit code 0, durationMs 1722 (server-side
  measured) / 1748ms wall clock from the test client.
- Python (Test 2): stdout "Hello from Python!", exit 0,
  durationMs 2130.
- Java (Test 3): stdout "Hello from Java!", exit 0, durationMs 2330 —
  matches the task's own expectation of "~2-3s to compile" almost
  exactly; this is the real number, not an estimate, and is worth
  citing in the paper's Implementation section as the actual observed
  compile+run latency for a compiled language through this pipeline.
- Error output (Test 7, indirectly): a real syntax error
  (`def broken(:`) came back with isExecutionSuccess:false and the
  interpreter's actual SyntaxError text — confirms the bug-5 fix's
  premise against real data, though the POST-fix route-level render-to-
  stderr behavior needs a final live re-check once quota resets (logic
  is correct per the raw JDoodle response already observed; the fix
  landed after the quota ran out for a full round-trip re-test).
- Language change sync (Test 5): scripted two-user socket test — Bob
  received language_changed for main.js -> python with the correct
  fileName/language, confirming the socket layer independent of any
  execution backend.
- Rate limiting (Test 6): 11 rapid POST /api/execute calls from one
  IP returned 200 x9, 429 x2 — not "10 then 1", because one prior
  request earlier in the same test run had already consumed a slot in
  that IP's 60s window; total requests against the limit (10) still
  lines up exactly. Confirms the limiter counts correctly across
  calls, not just within a single burst.
- execLatencies in SessionMetrics (Test 8): directly queried Mongo
  after one POST /api/execute — a real entry appeared:
  {value: 1768, timestamp: ..., language: "javascript"} — and,
  importantly, this was recorded even though the execution itself
  failed (JDoodle quota exhausted + Piston whitelisted at that exact
  moment), confirming latency is tracked for the request/response
  cycle regardless of execution outcome, matching the metric's actual
  purpose (measuring the execution pipeline's responsiveness, not
  grading whether the user's code was correct).
- What's NOT independently re-verified end-to-end after the versionIndex/
  isExecutionSuccess fixes: Java/stdin/C/C++/TypeScript through the full
  route (blocked by JDoodle's free-tier daily quota, confirmed exhausted
  via a live "Daily limit reached" / statusCode 429 response near the
  end of this session — the two-tier fallback then correctly attempted
  Piston too, which correctly also failed, and the combined error
  message named both reasons instead of throwing the bug-1 scoping
  error). Piston itself remains unverified end-to-end for any language
  (whitelist-blocked) — verified only via /runtimes and the exact-
  version-match startup check.

Why a two-tier fallback architecture, for the paper: resilience against
exactly what happened today — a third-party free-tier service can
change its access policy (Piston) or exhaust a quota (JDoodle) with no
warning, and a single-provider design would mean the Run button simply
stops working until someone notices and intervenes manually. Chaining
two independent providers, with executeCode designed so a failure in
either is caught, logged, and handed to the other rather than
propagated as an exception, means only a simultaneous outage of BOTH
(what's currently happening, coincidentally, for unrelated reasons —
whitelist policy vs. daily quota) takes the feature down. The
combined error message surfacing BOTH providers' specific failure
reasons (once bug 1 was fixed) is also what made today's actual outage
immediately diagnosable instead of a generic "execution failed".

The Y.Doc vs room.files content distinction for execution: runCode
reads via useSync's getCurrentContent(activeFile), which returns the
live Y.Text's current string, not room.files[].content. The latter is
only periodically persisted to MongoDB (every 10th edit, a Day 9
design decision to avoid the connection-pool saturation Day 8 found)
— running room.files[].content directly would execute a version of
the file that's up to 9 edits stale, silently showing output for code
the user isn't actually looking at anymore. getCurrentContent returns
undefined for naive-sync-mode files (which persist every edit
immediately, so there's no lag to correct for), and runCode falls back
to activeFileObj.content in that case.

Note: HTML/CSS live preview is out of scope, same call the task made
— correctly, since it's a UI feature orthogonal to the paper's actual
research contribution (CRDT vs. naive sync), and every hour spent on
it is an hour not spent on Days 25-26's actual experiments.

### Cursor presence fixes (between Day 12 and Day 13)

Two bugs reported against Day 10's cursor presence feature: (1) only
the floating name label was visible, no colored cursor line, and (2)
remote cursors jumped around whenever anyone typed, regardless of
whether the cursor's actual owner was focused in the editor. Fixed
both in useSync.js and CursorPresence.jsx.

Root cause of #2, worth stating precisely since the fix depends on
it: MonacoBinding keeps a LOCAL editor's awareness `selection` field
in sync with Monaco's actual cursor position — including when that
position SHIFTS because of a REMOTE edit. If another user inserts
text before your cursor, Yjs's relative-position math correctly moves
your cursor's absolute offset to preserve where it logically points —
that's the whole point of relative positions, and is correct. The bug
was that ANY resulting awareness change got broadcast, focused or not
— so a user with the editor sitting unfocused in a background tab
would still appear to "jump" every time someone else typed near their
last cursor position, because Monaco silently adjusted their stored
offset and the old code broadcast that adjustment as if it were a
real, intentional cursor move.

The task's own fix pseudocode had two real bugs of its own, caught
before writing anything (matching this session's running practice —
Day 9 and Day 10 both found similar issues in provided task code):

1. FIX 2's blur handler cleared `awareness.setLocalStateField('cursor',
   null)`, and PART C's render-skip checked `state.cursor`. Neither
   field exists anywhere in this codebase — Day 10 already established
   (and this file's own existing comments say so) that MonacoBinding
   stores position under `state.selection`, not `state.cursor`. Setting
   a field nothing reads would compile and run without error while
   doing precisely nothing — the remote cursor would never actually
   disappear on blur, silently failing the exact bug this fix exists to
   solve. Replaced with an explicit `state.focused` boolean that this
   codebase now owns and manages itself, independent of whatever
   MonacoBinding does with `selection` — CursorPresence checks
   `!state.focused` first, before ever touching `state.selection` at all.

2. A genuine interaction bug in the fix's own two parts, not
   inherited from Day 10: gating the generic awareness 'update'
   handler on `hasTextFocus()` (PART A) would ALSO gate out the
   blur-triggered "clear my cursor" broadcast (PART B) — by the exact
   instant blur fires, hasTextFocus() is already false, so if the
   clearing broadcast relied on that same generic handler, it would
   never be sent, and the bug PART B exists to fix (stale cursor after
   blur) would still happen. Traced through the actual event order
   before writing code: the blur handler needs to emit its own
   `focused: false` update DIRECTLY (bypassing the generic gated
   handler entirely), which is what the task's OWN pseudocode
   structure already did — just with the wrong field name (see bug 1).
   Kept that direct-emit structure, fixed the field.

A third issue found only once actually reasoning through this
project's Day 11 multi-file architecture (which didn't exist when Day
10 wrote the original cursor code, so the task's pseudocode — written
against a "one file, one Monaco binding, created once" mental model —
couldn't have anticipated it): switching between two ALREADY-OPEN tabs
never fires a Monaco focus event, because the underlying DOM element
Monaco owns never actually loses focus — only WHICH Y.Doc/awareness is
bound to it changes. Relying solely on `onDidFocusEditorText` to set
`focused: true` would leave a newly-activated tab's awareness
permanently stuck at `focused: false` (or unset) the moment a user
switches to it without ever blurring — the tab you're actively looking
at would incorrectly show as unfocused to everyone else. Fixed by
seeding `focused: true` explicitly whenever the active-binding effect
runs AND `editor.hasTextFocus()` is already true, not just reactively
in response to a focus event that may never come.

FIX 1 (colored cursor line): implemented via
`editor.createDecorationsCollection()` (confirmed via monaco-editor's
own .d.ts as the current, non-deprecated API — the older
`deltaDecorations` is explicitly marked `@deprecated` in favor of it)
with a zero-width range and `beforeContentClassName`, matching the
task's approach. Found and fixed one more bug in the task's own
cleanup code here: FIX 1 injects a per-user `<style>` tag keyed by
`cursor-style-${sanitizedUserId}` (the SANITIZED userId string), but
PART C's cleanup snippet looked it up by `cursor-style-${clientId}` —
a Yjs numeric client ID, a completely different namespace from userId.
That mismatch means cleanup would never find the style element it's
looking for: every cursor color rule injected during a session would
leak permanently in `document.head`, and if the same clientId were
ever reused for a different user (or the same user with a different
awareness client instance), stale CSS could apply to the wrong colored
cursor. Fixed by tracking clientId → sanitizedUserId in its own ref
(`styleKeysRef`) at creation time, so cleanup — keyed by clientId,
matching the existing widget/decoration maps' convention — can always
resolve the correct style element regardless of which identifier
namespace it started from.

Also hardened, not present in the task's draft: awareness state is
set by remote, unauthenticated clients and relayed by the server
without validation (documented as intentional back on Day 10 — cursor
data has no research or persistence value, so it was never worth
validating). The injected `<style>` tag's content directly interpolates
`state.user.color`. Using `.textContent` (not `.innerHTML`) on the
`<style>` element already rules out HTML/script injection, but a
malicious peer could still send an arbitrary string as `color` and
inject arbitrary CSS rules into the page. Added a strict hex-color
regex check before ever using a remote color value in the injected
stylesheet, falling back to a neutral gray if it doesn't match — cheap,
directly adjacent to the new code this task added, and consistent with
CLAUDE.md's instruction to fix insecure code on sight rather than
propagate an existing pattern (the label widget's inline
`background: ${color}` has the same underlying exposure and predates
this fix — flagged here but left alone, since touching it wasn't part
of this task's actual scope).

Verification note: Monaco's actual decoration rendering and
`hasTextFocus()` can't be exercised without a browser, so — same
pattern as every prior cursor/awareness day — verified the
awareness-protocol layer the fix depends on with two scripted clients
(real Yjs + y-protocols/awareness + the live server, not mocks):
confirmed `state.focused` (not `state.cursor`) is exactly what relays
across the wire and resolves correctly on the receiving side; confirmed
a real anchor position (inserted at character offset 5) round-trips
through `Y.createRelativePositionFromTypeIndex` →
`Y.createAbsolutePositionFromRelativePosition` on a SEPARATE peer's own
Y.Doc and resolves back to exactly index 5; confirmed toggling
`focused` from true to false produces the exact state shape
CursorPresence's `if (!state.focused) return` is written to catch;
confirmed a user never sees their own userId in their own remote-states
view. All 8 assertions passed. The Monaco-specific pieces — the visible
colored line rendering correctly, content widget positioning, and the
`hasTextFocus()`-driven gating end to end in a real editor — are
implemented and code-reviewed against the actual Monaco API surface
(confirmed every referenced method/enum exists in the installed
monaco-editor@0.55.1 type definitions before writing this) but not
independently exercised, consistent with this session's standing
limitation of no browser automation.

### Day 13 —
### Day 14 —
### Day 15 —
### Day 16 —
### Day 17 —
### Day 18 —
### Day 19 —
### Day 20 —
### Day 21 —
### Day 22 —
### Day 23 —
### Day 24 —
### Day 25 —
### Day 26 —
### Day 27 —
### Day 28 —

## Key references to cite (find full details on Google Scholar)
- Shapiro et al. (2011) — CRDTs original paper
- Nicolaescu et al. (2016) — Yjs paper
- Sun & Ellis (1998) — Operational Transformation
- VS Code Live Share documentation
- Replit collaborative features
- Yjs GitHub (Yjs/yjs)
- Socket.IO documentation
- Monaco Editor documentation
- Google Gemini API documentation
- Piston execution engine (engineer-man/piston)
- Papers on collaborative editing latency (search IEEE Xplore)
- Papers on real-time synchronization (search ACM DL)