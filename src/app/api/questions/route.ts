import z from "zod"
import { insertQuestion } from "@/features/questions/db"
import { getCurrentUser } from "@/services/clerk/lib/getCurrentUser"

const schema = z.object({
  text: z.string().min(1),
  jobInfoId: z.string().min(1),
  difficulty: z.enum(["easy", "medium", "hard"] as const),
})

export async function POST(req: Request) {
  const body = await req.json()
  const result = schema.safeParse(body)

  if (!result.success) {
    return new Response(JSON.stringify({ error: true }), { status: 400 })
  }

  const { text, jobInfoId, difficulty } = result.data

  const { userId } = await getCurrentUser()
  if (userId == null) return new Response(JSON.stringify({ error: true }), { status: 401 })

  const inserted = await insertQuestion({ text, jobInfoId, difficulty })

  return new Response(JSON.stringify({ id: inserted.id }), { status: 200 })
}
