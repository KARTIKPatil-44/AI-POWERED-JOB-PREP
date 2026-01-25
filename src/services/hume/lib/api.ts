import { env } from "@/data/env/server"
import { HumeClient } from "hume"

// Local lightweight type mirroring the chat event shape we consume
export type ReturnChatEvent = {
  type?: string
  messageText?: string | null
  role?: string
  // Hume's SDK sometimes serializes emotion features as a string; accept both shapes.
  emotionFeatures?: Record<string, number> | string
}

export async function fetchChatMessages(humeChatId: string): Promise<ReturnChatEvent[]> {
  "use cache"

  const client = new HumeClient({ apiKey: env.HUME_API_KEY })
  const allChatEvents: ReturnChatEvent[] = []
  const chatEventsIterator = await client.empathicVoice.chats.listChatEvents(
    humeChatId,
    { pageNumber: 0, pageSize: 100 }
  )

  for await (const chatEvent of chatEventsIterator) {
    allChatEvents.push(chatEvent)
  }

  return allChatEvents
}