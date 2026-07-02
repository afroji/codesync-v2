/*
 * Room.jsx — Collaborative room page.
 * Handles room initialization, loading state, and
 * passes room data down to RoomLayout.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import useRoom from '../hooks/useRoom'
import useSync from '../hooks/useSync'
import useMetrics from '../hooks/useMetrics'
import useFileTabs from '../hooks/useFileTabs'
import RoomLayout from '../components/room/RoomLayout'
import apiClient from '../api/client'
import { EXECUTABLE_LANGUAGES } from '../styles/index.js'

function Room() {
  const { roomId } = useParams()
  const { user } = useAuth()
  const {
    room,
    connected,
    error,
    fileError,
    clearFileError,
    myUserId,
    myColor,
    myUserName,
    socket,
    sendChat,
    addFile,
    deleteFile,
    renameFile,
    changeLanguage,
  } = useRoom(roomId)

  // useFileTabs' own activeTab/setActiveTab are aliased to activeFile/
  // setActiveFile here — RightSidebar's chat/members/AI selector already
  // owns the name "activeTab" for something unrelated, so it's kept as its
  // own state (rightPanelTab) below to avoid the collision.
  const {
    openTabs,
    activeTab: activeFile,
    dirtyTabs,
    openTab,
    closeTab,
    setActiveTab: setActiveFile,
    setOpenTabs,
    markDirty,
  } = useFileTabs(room?.files || [])

  const [rightPanelTab, setRightPanelTab] = useState('chat')
  const [newFileModalOpen, setNewFileModalOpen] = useState(false)
  const pendingNewFileRef = useRef(null)

  // Monaco editor instance refs + a mounted flag. Created here (not in
  // EditorPane) because useSync — which needs them to build the
  // MonacoBinding — is also lifted here (see note below).
  const editorRef = useRef(null)
  const monacoRef = useRef(null)
  const [editorMounted, setEditorMounted] = useState(false)
  const handleEditorMount = useCallback(() => setEditorMounted(true), [])

  const handleLocalEdit = useCallback((fileName) => markDirty(fileName), [markDirty])

  // Lifted here (rather than inside EditorPane) because isSyncing needs to
  // reach TopBar too — Room.jsx is the nearest common ancestor of both.
  const { naiveContent, handleNaiveChange, isSyncing, destroyYDoc, renameYDoc, getCurrentContent, awarenessRef, awarenessVersion } =
    useSync({
      socket,
      roomId,
      userId: myUserId,
      userName: myUserName,
      userColor: myColor,
      activeFile,
      files: room?.files,
      syncMode: room?.syncMode || 'crdt',
      editorRef,
      monacoRef,
      editorMounted,
      userCount: room?.members.length ?? 1,
      onLocalEdit: handleLocalEdit,
    })

  const { metrics } = useMetrics(roomId, socket)

  const [isRunning, setIsRunning] = useState(false)
  const [output, setOutput] = useState(null)
  const [stdin, setStdin] = useState('')

  const runCode = useCallback(async () => {
    const activeFileObj = room?.files.find((f) => f.name === activeFile)
    if (!activeFileObj) return

    if (!EXECUTABLE_LANGUAGES.includes(activeFileObj.language)) {
      setOutput({ success: false, error: `${activeFileObj.language} cannot be executed` })
      return
    }

    // CRDT mode: room.files[].content lags the live Y.Doc by up to
    // CONTENT_PERSIST_INTERVAL-1 edits (server batches Mongo writes) — read
    // straight from the open Y.Doc so Run always executes what's actually
    // in the editor, not a stale persisted snapshot. Naive mode persists
    // every edit immediately, so activeFileObj.content is already current;
    // getCurrentContent returns undefined for it and this just falls
    // through to that.
    const code = getCurrentContent(activeFile) ?? activeFileObj.content

    setIsRunning(true)
    setOutput({ running: true })

    try {
      const response = await apiClient.post('/execute', {
        code,
        language: activeFileObj.language,
        stdin,
        roomId: room.roomId,
      })
      setOutput(response.data.data)
    } catch (err) {
      setOutput({ success: false, error: err.response?.data?.error || 'Execution failed' })
    } finally {
      setIsRunning(false)
    }
  }, [room, activeFile, stdin, getCurrentContent])

  // File add/delete/rename land in room.files via useRoom's own listeners
  // (so LeftSidebar/EditorPane always see the current file list); these
  // extra listeners handle the SIDE EFFECTS specific to this page — which
  // tabs are open, which Y.Doc is bound — that useRoom has no business
  // knowing about.
  useEffect(() => {
    if (!socket) return

    function handleFileAdded({ file }) {
      if (pendingNewFileRef.current === file.name) {
        pendingNewFileRef.current = null
        openTab(file.name)
        setNewFileModalOpen(false)
      }
    }

    function handleFileDeleted({ fileName }) {
      closeTab(fileName)
      destroyYDoc(fileName)
    }

    function handleFileRenamed({ oldName, newName }) {
      setOpenTabs((prev) => prev.map((t) => (t === oldName ? newName : t)))
      setActiveFile((prev) => (prev === oldName ? newName : prev))
      renameYDoc(oldName)
    }

    socket.on('file_added', handleFileAdded)
    socket.on('file_deleted', handleFileDeleted)
    socket.on('file_renamed', handleFileRenamed)
    return () => {
      socket.off('file_added', handleFileAdded)
      socket.off('file_deleted', handleFileDeleted)
      socket.off('file_renamed', handleFileRenamed)
    }
  }, [socket, openTab, closeTab, setOpenTabs, setActiveFile, destroyYDoc, renameYDoc])

  const handleCreateFile = useCallback(
    (fileName) => {
      pendingNewFileRef.current = fileName
      addFile(fileName)
    },
    [addFile]
  )

  const handleCloseModal = useCallback(() => {
    setNewFileModalOpen(false)
    pendingNewFileRef.current = null
    clearFileError()
  }, [clearFileError])

  if (error) {
    return (
      <div
        className="min-h-screen w-full flex flex-col items-center justify-center"
        style={{ background: 'var(--color-bg-room)', color: 'var(--color-text-primary)', gap: 12 }}
      >
        <span style={{ color: 'var(--color-accent-danger)', fontSize: 14 }}>Room not found or expired</span>
        <Link to="/" style={{ color: 'var(--color-text-accent)', fontSize: 13, textDecoration: 'none' }}>
          &larr; Back to home
        </Link>
      </div>
    )
  }

  if (!connected || !room) {
    return (
      <div
        className="min-h-screen w-full flex flex-col items-center justify-center"
        style={{ background: 'var(--color-bg-room)', color: 'var(--color-text-primary)', gap: 16 }}
      >
        <div className="flex items-center" style={{ gap: 8 }}>
          <div
            className="flex items-center justify-center"
            style={{ width: 16, height: 16, background: 'var(--color-accent-primary)', borderRadius: 4 }}
          >
            <div style={{ width: 6, height: 6, background: 'var(--color-bg-room)', borderRadius: 1 }} />
          </div>
          <span className="font-semibold" style={{ fontSize: 14, letterSpacing: '-0.01em' }}>
            CodeSync
          </span>
        </div>
        <div className="spinner" />
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Connecting to room...</span>
        <div className="room-code">{roomId}</div>
      </div>
    )
  }

  return (
    <RoomLayout
      room={room}
      user={user}
      openTabs={openTabs}
      activeFile={activeFile}
      setActiveFile={setActiveFile}
      dirtyTabs={dirtyTabs}
      onTabClose={closeTab}
      onTabAdd={() => setNewFileModalOpen(true)}
      openTab={openTab}
      deleteFile={deleteFile}
      renameFile={renameFile}
      fileError={fileError}
      clearFileError={clearFileError}
      rightPanelTab={rightPanelTab}
      setRightPanelTab={setRightPanelTab}
      sendChat={sendChat}
      myUserId={myUserId}
      myColor={myColor}
      connected={connected}
      naiveContent={naiveContent}
      handleNaiveChange={handleNaiveChange}
      syncMode={room?.syncMode || 'crdt'}
      isSyncing={isSyncing}
      metrics={metrics}
      editorRef={editorRef}
      monacoRef={monacoRef}
      onEditorMount={handleEditorMount}
      awarenessRef={awarenessRef}
      awarenessVersion={awarenessVersion}
      socket={socket}
      newFileModalOpen={newFileModalOpen}
      onCloseNewFileModal={handleCloseModal}
      onCreateFile={handleCreateFile}
      changeLanguage={changeLanguage}
      runCode={runCode}
      isRunning={isRunning}
      output={output}
      stdin={stdin}
      setStdin={setStdin}
    />
  )
}

export default Room
