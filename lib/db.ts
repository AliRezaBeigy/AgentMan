import { openDB, type DBSchema, type IDBPDatabase } from "idb"

import type { ChatSession } from "~/lib/types"

interface AgentManDB extends DBSchema {
  sessions: {
    key: string
    value: ChatSession
    indexes: { "by-updated": number }
  }
}

let dbPromise: Promise<IDBPDatabase<AgentManDB>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<AgentManDB>("agentman", 1, {
      upgrade(db) {
        const store = db.createObjectStore("sessions", { keyPath: "id" })
        store.createIndex("by-updated", "updatedAt")
      }
    })
  }
  return dbPromise
}

export async function saveSession(session: ChatSession): Promise<void> {
  const db = await getDb()
  await db.put("sessions", session)
}

export async function getSession(id: string): Promise<ChatSession | undefined> {
  const db = await getDb()
  return db.get("sessions", id)
}

export async function listSessions(): Promise<ChatSession[]> {
  const db = await getDb()
  const sessions = await db.getAllFromIndex("sessions", "by-updated")
  return sessions.reverse()
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDb()
  await db.delete("sessions", id)
}

export function createSession(mode: ChatSession["mode"]): ChatSession {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    title: "New chat",
    mode,
    messages: [],
    createdAt: now,
    updatedAt: now
  }
}
