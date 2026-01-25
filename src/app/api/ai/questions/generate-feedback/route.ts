import { db } from "@/drizzle/db"
import { QuestionTable } from "@/drizzle/schema"
import { getJobInfoIdTag } from "@/features/jobInfos/dbCache"
import { getQuestionIdTag } from "@/features/questions/dbCache"
import { generateAiQuestionFeedback } from "@/services/ai/questions"
import { getCurrentUser } from "@/services/clerk/lib/getCurrentUser"
import { eq } from "drizzle-orm"
import { cacheTag } from "next/dist/server/use-cache/cache-tag"
import z from "zod"

const schema = z
  .object({
    prompt: z.string().min(1),
    questionId: z.string().min(1).optional(),
    questionText: z.string().min(1).optional(),
  })
  .refine(
    data => Boolean(data.questionId || data.questionText),
    {
      message: "questionId or questionText is required",
    }
  )

export async function POST(req: Request) {
  const body = await req.json()
  const result = schema.safeParse(body)

  if (!result.success) {
    return new Response("Error generating your feedback", { status: 400 })
  }

  const { prompt: answer, questionId, questionText } = result.data

  let questionTextToUse: string

  if (questionId) {
    const { userId } = await getCurrentUser()

    if (userId == null) {
      return new Response("You are not logged in", { status: 401 })
    }

    const question = await getQuestion(questionId, userId)
    if (question == null) {
      return new Response("You do not have permission to do this", {
        status: 403,
      })
    }

    questionTextToUse = question.text
  } else {
    // Use provided question text directly (no DB check)
    questionTextToUse = questionText!
  }

  try {
    // Try primary model first
    let res = generateAiQuestionFeedback({
      question: questionTextToUse,
      answer,
    })

    let baseRes
    let fallbackUsed = false
    try {
      baseRes = res.toTextStreamResponse()
    } catch (err) {
      // Primary model failed synchronously (likely quota); try fallback
      console.warn('Primary model failed, attempting fallback', err)
      const msg = String(err)
      if (/quota|RESOURCE_EXHAUSTED/i.test(msg)) {
        fallbackUsed = true
        res = generateAiQuestionFeedback({
          question: questionTextToUse,
          answer,
          modelName: 'gemini-2.1',
        })
        baseRes = res.toTextStreamResponse()
        // annotate for client to show a fallback banner if desired
        baseRes.headers.set('x-ai-fallback', 'true')
      } else {
        throw err
      }
    }

    const baseBody = baseRes.body
    if (!baseBody) {
      return new Response("AI did not return content", { status: 500 })
    }

    const wrapped = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = baseBody.getReader()
        try {
          // If we fell back to a smaller model, send a short notice first so
          // the client can show a banner or message.
          if (fallbackUsed) {
            controller.enqueue(new TextEncoder().encode('Notice: results are from a fallback model and may be shorter.\n'))
          }

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (value) controller.enqueue(value)
          }
          controller.close()
        } catch (err) {
          console.error('Stream error while generating feedback', err)
          const msg = 'AI quota exhausted — please check your billing or try again later.'
          controller.enqueue(new TextEncoder().encode(msg))
          controller.close()
        }
      },
    })

    return new Response(wrapped, { headers: baseRes.headers })
  } catch (err) {
    console.error('Error creating feedback stream', err)

    const errObj = err && typeof err === 'object' ? (err as Record<string, unknown>) : null
    const errStr = String(err) + (errObj ? JSON.stringify(errObj.data ?? errObj.response ?? {}) : '')
    if (/quota|RESOURCE_EXHAUSTED|generate_content_free_tier_requests/i.test(errStr)) {
      let msg = 'AI quota exhausted — please check your billing or try again later.'
      const retryMatch = errStr.match(/Please retry in (\d+(?:\.\d+)?)s/i) || errStr.match(/"retryDelay":"(\d+)s"/i)
      const headers: Record<string, string> = { "Content-Type": "text/plain; charset=utf-8" }
      if (retryMatch) {
        const secs = Math.ceil(Number(retryMatch[1]))
        msg += ` Please retry in ${secs}s.`
        headers['Retry-After'] = String(secs)
      }
      return new Response(msg, { status: 429, headers })
    }

    const msg = 'AI is currently unavailable — please try again later.'
    return new Response(msg, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }
}

async function getQuestion(id: string, userId: string) {
  "use cache"
  cacheTag(getQuestionIdTag(id))

  const question = await db.query.QuestionTable.findFirst({
    where: eq(QuestionTable.id, id),
    with: { jobInfo: { columns: { id: true, userId: true } } },
  })

  if (question == null) return null
  cacheTag(getJobInfoIdTag(question.jobInfo.id))

  if (question.jobInfo.userId !== userId) return null
  return question
}