/*
 * useRoom.js — Manages Socket.IO connection for a room.
 * Handles: connect, join_room, receive events, disconnect.
 * Returns room state that Room.jsx and all child components use.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { io } from 'socket.io-client'
import { useAuth } from '../context/AuthContext'
import { CURSOR_COLORS } from '../styles/index.js'
import { BACKEND_URL } from '../config'

// Duplicated from server/utils/generateGuestName.js — that file is a CJS
// module meant for the server; this is the small client-side equivalent
// the task calls for rather than sharing code across the client/server boundary.
const GUEST_NAMES = [
  'Falcon', 'Wolf', 'Raven', 'Lynx', 'Otter', 'Hawk', 'Panther', 'Cobra', 'Heron', 'Orca',
  'Nebula', 'Comet', 'Quasar', 'Pulsar', 'Nova', 'Orbit', 'Meteor', 'Cosmos', 'Vega', 'Zenith',
  'Cipher', 'Vector', 'Kernel', 'Byte', 'Pixel', 'Daemon', 'Syntax', 'Runtime', 'Cache', 'Node',
  'Socket', 'Thread', 'Buffer', 'Photon', 'Ion', 'Flux',
]

function generateGuestName() {
  return `Guest ${GUEST_NAMES[Math.floor(Math.random() * GUEST_NAMES.length)]}`
}

function hashToIndex(str, mod) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) % mod
  }
  return hash
}

export default function useRoom(roomId) {
  const { user } = useAuth()
  const socketRef = useRef(null)
  const cursorsRef = useRef({})

  const [room, setRoom] = useState(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState(null)
  const [fileError, setFileError] = useState(null)

  const [myUserId] = useState(() => {
    let id = sessionStorage.getItem('codesync_user_id')
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem('codesync_user_id', id)
    }
    return id
  })

  const guestNameRef = useRef(null)
  if (guestNameRef.current === null) {
    guestNameRef.current = generateGuestName()
  }
  const displayName = user ? user.name : guestNameRef.current

  const myColorRef = useRef(null)
  if (myColorRef.current === null) {
    myColorRef.current = CURSOR_COLORS[hashToIndex(myUserId, CURSOR_COLORS.length)].bg
  }
  const myColor = myColorRef.current

  useEffect(() => {
    const socket = io(BACKEND_URL || '/', {
      transports: ['websocket', 'polling'],
      auth: { token: localStorage.getItem('codesync_token') },
    })
    socketRef.current = socket

    socket.on('connect', () => {
      console.log('Connected to Socket.IO', socket.id)
      socket.emit('join_room', {
        roomId,
        userId: myUserId,
        name: displayName,
        color: myColor,
        isAnonymous: !user,
      })
    })

    socket.on('room_state', (data) => {
      setRoom(data.room)
      setConnected(true)
    })

    socket.on('user_joined', ({ userId, name, color, isAnonymous }) => {
      setRoom((prev) => {
        if (!prev) return prev
        if (prev.members.some((m) => m.userId === userId)) return prev
        return { ...prev, members: [...prev.members, { userId, name, color, isAnonymous }] }
      })
    })

    socket.on('user_left', ({ userId }) => {
      setRoom((prev) => {
        if (!prev) return prev
        return { ...prev, members: prev.members.filter((m) => m.userId !== userId) }
      })
    })

    socket.on('chat_message', (chatEntry) => {
      setRoom((prev) => {
        if (!prev) return prev
        return { ...prev, chat: [...prev.chat, chatEntry] }
      })
    })

    socket.on('cursor_update', ({ userId, position }) => {
      cursorsRef.current[userId] = position
    })

    socket.on('file_added', ({ file }) => {
      setRoom((prev) => {
        if (!prev) return prev
        if (prev.files.some((f) => f.name === file.name)) return prev
        return { ...prev, files: [...prev.files, file] }
      })
    })

    socket.on('file_deleted', ({ fileName }) => {
      setRoom((prev) => {
        if (!prev) return prev
        return { ...prev, files: prev.files.filter((f) => f.name !== fileName) }
      })
    })

    socket.on('file_renamed', ({ oldName, newName, newLanguage }) => {
      setRoom((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          files: prev.files.map((f) => (f.name === oldName ? { ...f, name: newName, language: newLanguage } : f)),
          activeFile: prev.activeFile === oldName ? newName : prev.activeFile,
        }
      })
    })

    socket.on('file_error', (data) => {
      setFileError(data.message)
    })

    socket.on('language_changed', ({ fileName, language }) => {
      setRoom((prev) => {
        if (!prev) return prev
        return { ...prev, files: prev.files.map((f) => (f.name === fileName ? { ...f, language } : f)) }
      })
    })

    socket.on('error', (data) => {
      setError(data.message)
    })

    socket.on('connect_error', (err) => {
      setError(err.message)
    })

    return () => {
      socket.emit('leave_room', { roomId, userId: myUserId })
      socket.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  const sendChat = useCallback(
    (message) => {
      socketRef.current?.emit('chat_message', {
        roomId,
        userId: myUserId,
        name: displayName,
        color: myColor,
        message,
      })
    },
    [roomId, myUserId, displayName, myColor]
  )

  const moveCursor = useCallback(
    (position) => {
      socketRef.current?.emit('cursor_move', { roomId, userId: myUserId, position })
    },
    [roomId, myUserId]
  )

  const addFile = useCallback(
    (fileName, language, content = '') => {
      socketRef.current?.emit('add_file', { roomId, fileName, language, content, userId: myUserId })
    },
    [roomId, myUserId]
  )

  const deleteFile = useCallback(
    (fileName) => {
      socketRef.current?.emit('delete_file', { roomId, fileName, userId: myUserId })
    },
    [roomId, myUserId]
  )

  const renameFile = useCallback(
    (oldName, newName) => {
      socketRef.current?.emit('rename_file', { roomId, oldName, newName, userId: myUserId })
    },
    [roomId, myUserId]
  )

  const clearFileError = useCallback(() => setFileError(null), [])

  const changeLanguage = useCallback(
    (fileName, language) => {
      socketRef.current?.emit('change_language', { roomId, fileName, language, userId: myUserId })
    },
    [roomId, myUserId]
  )

  return {
    room,
    connected,
    error,
    fileError,
    clearFileError,
    myUserId,
    myColor,
    myUserName: displayName,
    socket: socketRef.current,
    sendChat,
    moveCursor,
    addFile,
    deleteFile,
    renameFile,
    changeLanguage,
  }
}
