/*
 * RoomLayout.jsx — The IDE shell layout.
 * Matches the design file's editor workspace proportions.
 */
import TopBar from './TopBar'
import LeftSidebar from './LeftSidebar'
import EditorPane from './EditorPane'
import BottomPanel from './BottomPanel'
import RightSidebar from './RightSidebar'
import NewFileModal from './NewFileModal'

function RoomLayout({
  room,
  user,
  openTabs,
  activeFile,
  setActiveFile,
  dirtyTabs,
  onTabClose,
  onTabAdd,
  openTab,
  deleteFile,
  renameFile,
  fileError,
  clearFileError,
  rightPanelTab,
  setRightPanelTab,
  sendChat,
  myUserId,
  myColor,
  connected,
  naiveContent,
  handleNaiveChange,
  syncMode,
  isSyncing,
  metrics,
  editorRef,
  monacoRef,
  onEditorMount,
  awarenessRef,
  awarenessVersion,
  socket,
  newFileModalOpen,
  onCloseNewFileModal,
  onCreateFile,
}) {
  return (
    <div className="room-layout">
      <TopBar
        room={room}
        user={user}
        myUserId={myUserId}
        connected={connected}
        isSyncing={isSyncing}
        metrics={metrics}
        socket={socket}
      />
      <div className="room-body">
        <LeftSidebar
          room={room}
          user={user}
          openTabs={openTabs}
          activeFile={activeFile}
          openTab={openTab}
          deleteFile={deleteFile}
          renameFile={renameFile}
          onAddFile={onTabAdd}
          fileError={fileError}
          clearFileError={clearFileError}
        />
        <div className="room-center">
          <EditorPane
            room={room}
            openTabs={openTabs}
            activeFile={activeFile}
            setActiveFile={setActiveFile}
            dirtyTabs={dirtyTabs}
            onTabClose={onTabClose}
            onTabAdd={onTabAdd}
            naiveContent={naiveContent}
            handleNaiveChange={handleNaiveChange}
            syncMode={syncMode}
            editorRef={editorRef}
            monacoRef={monacoRef}
            onEditorMount={onEditorMount}
            awarenessRef={awarenessRef}
            awarenessVersion={awarenessVersion}
            myUserId={myUserId}
          />
          <BottomPanel />
        </div>
        <RightSidebar
          room={room}
          user={user}
          activeTab={rightPanelTab}
          setActiveTab={setRightPanelTab}
          sendChat={sendChat}
          myUserId={myUserId}
          myColor={myColor}
        />
      </div>
      <NewFileModal
        isOpen={newFileModalOpen}
        onClose={onCloseNewFileModal}
        onCreate={onCreateFile}
        error={fileError}
        onClearError={clearFileError}
      />
    </div>
  )
}

export default RoomLayout
