import { db } from "@/drizzle/db"
import {
  JobInfoTable,
  questionDifficulties,
  QuestionTable,
} from "@/drizzle/schema"
import { getJobInfoIdTag } from "@/features/jobInfos/dbCache"
import { getQuestionJobInfoTag } from "@/features/questions/dbCache"
import { canCreateQuestion } from "@/features/questions/permissions"
import { PLAN_LIMIT_MESSAGE } from "@/lib/errorToast"
import { generateAiQuestion } from "@/services/ai/questions"
import { getCurrentUser } from "@/services/clerk/lib/getCurrentUser"
import { and, asc, eq } from "drizzle-orm"
import { cacheTag } from "next/dist/server/use-cache/cache-tag"
import z from "zod"

const schema = z.object({
  prompt: z.enum(questionDifficulties),
  jobInfoId: z.string().min(1),
})

export async function POST(req: Request) {
  const body = await req.json()
  const result = schema.safeParse(body)

  if (!result.success) {
    return new Response("Error generating your question", { status: 400 })
  }

  const { prompt: difficulty, jobInfoId } = result.data
  const { userId } = await getCurrentUser()

  if (userId == null) {
    return new Response("You are not logged in", { status: 401 })
  }

  if (!(await canCreateQuestion())) {
    return new Response(PLAN_LIMIT_MESSAGE, { status: 403 })
  }

  const jobInfo = await getJobInfo(jobInfoId, userId)
  if (jobInfo == null) {
    return new Response("You do not have permission to do this", {
      status: 403,
    })
  }

  const previousQuestions = await getQuestions(jobInfoId)

  try {
    // Try primary model first
    let res = generateAiQuestion({
      previousQuestions,
      jobInfo,
      difficulty,
      // do not persist on the server; client will persist the question after completion
      onFinish: () => {},
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
        res = generateAiQuestion({
          previousQuestions,
          jobInfo,
          difficulty,
          onFinish: () => {},
        })
        baseRes = res.toTextStreamResponse()
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
          // If we fell back to a smaller model, send a short notice first
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
          console.error('Stream error while generating question', err)
          const msg = 'AI quota exhausted — please check your billing or try again later.'
          controller.enqueue(new TextEncoder().encode(msg))
          controller.close()
        }
      },
    })

    return new Response(wrapped, { headers: baseRes.headers })
  } catch (err) {
    console.error('Error creating question stream', err)

    // Detect quota errors from AI and return a 429 so the client can display a clear message
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

async function getQuestions(jobInfoId: string) {
  "use cache"
  cacheTag(getQuestionJobInfoTag(jobInfoId))

  return db.query.QuestionTable.findMany({
    where: eq(QuestionTable.jobInfoId, jobInfoId),
    orderBy: asc(QuestionTable.createdAt),
  })
}

async function getJobInfo(id: string, userId: string) {
  "use cache"
  cacheTag(getJobInfoIdTag(id))

  return db.query.JobInfoTable.findFirst({
    where: and(eq(JobInfoTable.id, id), eq(JobInfoTable.userId, userId)),
  })
}