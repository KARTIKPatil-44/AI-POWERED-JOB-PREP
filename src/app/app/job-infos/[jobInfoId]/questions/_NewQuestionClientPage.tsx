"use client"

import { BackLink } from "@/components/BackLink"
import { MarkdownRenderer } from "@/components/MarkdownRenderer"
import { Button } from "@/components/ui/button"
import { LoadingSwap } from "@/components/ui/loading-swap"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
  JobInfoTable,
  questionDifficulties,
  QuestionDifficulty,
} from "@/drizzle/schema"
import { formatQuestionDifficulty } from "@/features/questions/formatters"
import { useState, useRef, useEffect } from "react"
import { useCompletion } from "@ai-sdk/react"
import { errorToast } from "@/lib/errorToast"

// Helper: safely extract a message from unknown errors
function getErrorMessage(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>
    if (typeof obj.message === 'string') return obj.message
    if (obj.data && typeof obj.data === 'object') {
      const data = obj.data as Record<string, unknown>
      if (data.error && typeof data.error === 'object') {
        const inner = data.error as Record<string, unknown>
        if (typeof inner.message === 'string') return inner.message
        if (typeof inner.status === 'string') return inner.status
      }
    }
    try {
      return JSON.stringify(obj)
    } catch {
      return String(obj)
    }
  }
  return String(err)
}

function isQuotaError(err: unknown): boolean {
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>
    if (obj.data && typeof obj.data === 'object') {
      const data = obj.data as Record<string, unknown>
      if (data.error && typeof data.error === 'object') {
        const inner = data.error as Record<string, unknown>
        if (inner.status === 'RESOURCE_EXHAUSTED') return true
      }
    }
    const msg = typeof obj.message === 'string' ? obj.message : undefined
    if (msg && /quota|RESOURCE_EXHAUSTED/i.test(msg)) return true
  } else {
    const s = String(err)
    if (/quota|RESOURCE_EXHAUSTED/i.test(s)) return true
  }
  return false
}

// Clean AI streamed text by removing any SSE/metadata lines (e.g., `data: {...}`)
function sanitizeAIText(text: string | null): string | null {
  if (text == null) return null
  const lines = text.split(/\r?\n/)
  const filtered = lines.filter(l => !/^\s*data:\s*/i.test(l) && !/^\s*\[done\]\s*$/i.test(l))
  const cleaned = filtered.join('\n').trim()
  return cleaned === '' ? null : cleaned
}

type Status = "awaiting-answer" | "awaiting-difficulty" | "init"

export function NewQuestionClientPage({
  jobInfo,
}: {
  jobInfo: Pick<typeof JobInfoTable.$inferSelect, "id" | "name" | "title">
}) {
  const [status, setStatus] = useState<Status>("init")
  const [answer, setAnswer] = useState<string | null>(null)

  const [questionId, setQuestionId] = useState<string | null>(null)
  const lastDifficultyRef = useRef<QuestionDifficulty | null>(null)

  type AiStatus = { type: 'error' | 'info'; message: string; retryAfter?: number } | null
  const [aiStatus, setAiStatus] = useState<AiStatus>(null)

  const {
    complete: generateQuestion,
    completion: question,
    setCompletion: setQuestion,
    isLoading: isGeneratingQuestion,
  } = useCompletion({
    api: "/api/ai/questions/generate-question",
    streamProtocol: 'text',
    onFinish: async () => {
      setStatus("awaiting-answer")

      // Persist the generated question to the DB and obtain its id
      try {
        if (question == null) return
        const difficulty = lastDifficultyRef.current
        if (difficulty == null) return

        const res = await fetch('/api/questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: question, jobInfoId: jobInfo.id, difficulty }),
        })

        const data = await res.json()
        if (res.ok) {
          setQuestionId(data.id)
        }
      } catch {
        // ignore - UI will still work without persistent id
      }
    },
    onError: (error: unknown) => {
      const serverMsg = getErrorMessage(error)
      const isQuota = isQuotaError(error)
      if (isQuota) {
        // If server returned a more specific message (including retry info), show it.
        const match = serverMsg.match(/Please retry in (\d+(?:\.\d+)?)s/i)
        const msg = match ? `${serverMsg}` : 'AI quota exhausted — please check your billing or try again later.'
        errorToast(msg)
        setQuestion(msg)
        const retrySecs = match ? Math.ceil(Number(match[1])) : undefined
        setAiStatus({ type: 'error', message: msg, retryAfter: retrySecs })
      } else {
        errorToast(serverMsg)
      }
    },
  })

  const {
    complete: generateFeedback,
    completion: feedback,
    setCompletion: setFeedback,
    isLoading: isGeneratingFeedback,
  } = useCompletion({
    api: "/api/ai/questions/generate-feedback",
    streamProtocol: 'text',
    onFinish: () => {
      setStatus("awaiting-difficulty")
    },
    onError: (error: unknown) => {
      const serverMsg = getErrorMessage(error)
      const isQuota = isQuotaError(error)
      if (isQuota) {
        const match = serverMsg.match(/Please retry in (\d+(?:\.\d+)?)s/i)
        const msg = match ? `${serverMsg}` : 'AI quota exhausted — please check your billing or try again later.'
        errorToast(msg)
        setFeedback(msg)
        const retrySecs = match ? Math.ceil(Number(match[1])) : undefined
        setAiStatus({ type: 'error', message: msg, retryAfter: retrySecs })
      } else {
        const msg = serverMsg
        errorToast(msg)
        setFeedback(`Error: ${msg}`)
      }
    },
  })

  // Sanitize streamed question and feedback after streaming completes to avoid clearing during generation
  useEffect(() => {
    if (isGeneratingQuestion) return

    const cleaned = sanitizeAIText(question)
    if (cleaned == null) {
      setQuestion("")
      return
    }

    if (cleaned !== question) {
      setQuestion(cleaned)
    }
  }, [isGeneratingQuestion, question, setQuestion])

  // Countdown for AI retry (when quota exceeded)
  useEffect(() => {
    if (!aiStatus || typeof aiStatus.retryAfter !== 'number') return
    if (aiStatus.retryAfter <= 0) {
      const t = setTimeout(() => setAiStatus(null), 0)
      return () => clearTimeout(t)
    }

    const id = setInterval(() => {
      setAiStatus(prev => {
        if (!prev || typeof prev.retryAfter !== 'number') return prev
        if (prev.retryAfter <= 1) return null
        return { ...prev, retryAfter: prev.retryAfter - 1 }
      })
    }, 1000)

    return () => clearInterval(id)
  }, [aiStatus])

  useEffect(() => {
    if (isGeneratingFeedback) return

    const cleaned = sanitizeAIText(feedback)
    if (cleaned == null) {
      setFeedback("")
      return
    }

    if (cleaned !== feedback) {
      setFeedback(cleaned)
    }
  }, [isGeneratingFeedback, feedback, setFeedback])


  const disableGenerateButtons = aiStatus?.retryAfter != null && aiStatus.retryAfter > 0

  return (
    <div className="flex flex-col items-center gap-4 w-full mx-w-[2000px] mx-auto flex-grow h-screen-header">
      <div className="container flex flex-col gap-4 mt-4">
        {aiStatus && (
          <div role="alert" className="w-full p-3 rounded-md bg-red-50 border border-red-200 text-red-800 flex items-center justify-between">
            <div className="text-sm">
              {aiStatus.message}
              {typeof aiStatus.retryAfter === 'number' && aiStatus.retryAfter > 0 && (
                <span className="ml-2 text-xs text-muted-foreground">Retry in {aiStatus.retryAfter}s</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button className="text-sm text-red-600 underline" onClick={() => setAiStatus(null)}>Dismiss</button>
            </div>
          </div>
        )}

        <div className="container flex gap-4 items-center justify-between">
          <div className="grow basis-0">
            <BackLink href={`/app/job-infos/${jobInfo.id}`}>
              {jobInfo.name}
            </BackLink>
          </div>
          <Controls
            reset={() => {
              setStatus("init")
              setQuestion("")
              setFeedback("")
              setAnswer(null)
              setQuestionId(null)
              setAiStatus(null)
            }}
            disableAnswerButton={
              answer == null || answer.trim() === "" || (questionId == null && question == null)
            }
            status={status}
            isLoading={isGeneratingFeedback || isGeneratingQuestion}
            disableGenerateButtons={disableGenerateButtons}
            generateFeedback={() => {
              if (answer == null || answer.trim() === "") return

              const payload = questionId != null
                ? { questionId }
                : question != null
                  ? { questionText: question }
                  : null

              if (payload == null) return

              // ensure the feedback panel opens immediately and shows the loading placeholder
              setFeedback("")
              generateFeedback(answer.trim(), { body: payload })
            }}
            generateQuestion={difficulty => {
              lastDifficultyRef.current = difficulty
              setQuestion("")
              setFeedback("")
              setAnswer(null)
              generateQuestion(difficulty, { body: { jobInfoId: jobInfo.id } })
            }}
          />
          <div className="grow hidden md:block" />
        </div>
      </div>
      <QuestionContainer
        question={question}
        feedback={feedback}
        isFeedbackLoading={isGeneratingFeedback}
        isQuestionLoading={isGeneratingQuestion}
        answer={answer}
        status={status}
        setAnswer={setAnswer}
      />
    </div>
  )
}

function QuestionContainer({
  question,
  feedback,
  isFeedbackLoading,
  isQuestionLoading,
  answer,
  status,
  setAnswer,
}: {
  question: string | null
  feedback: string | null
  isFeedbackLoading?: boolean
  isQuestionLoading?: boolean
  answer: string | null
  status: Status
  setAnswer: (value: string) => void
}) {
  const questionBottomRef = useRef<HTMLDivElement | null>(null)
  const feedbackBottomRef = useRef<HTMLDivElement | null>(null)

  // Auto-scroll question when new streaming content arrives
  useEffect(() => {
    if (question && question !== "") {
      questionBottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
    }
  }, [question])

  // Auto-scroll feedback as it streams in
  useEffect(() => {
    if (feedback && feedback !== "") {
      feedbackBottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
    }
  }, [feedback])



  return (
    <ResizablePanelGroup direction="horizontal" className="flex-grow border-t">
      <ResizablePanel id="question-and-feedback" defaultSize={60} minSize={5}>
        <ResizablePanelGroup direction="vertical" className="flex-grow">
          <ResizablePanel id="question" defaultSize={70} minSize={5}>
            <ScrollArea className="h-full min-w-48 *:h-full">
              {status === "init" && question == null ? (
                <p className="text-base md:text-lg flex items-center justify-center h-full p-6">
                  Get started by selecting a question difficulty above.
                </p>
              ) : isQuestionLoading ? (
                <p className="text-base md:text-lg flex items-center justify-center h-full p-6">
                  Generating question... Please wait
                </p>
              ) : question && question !== "" ? (
                <div>
                  <MarkdownRenderer className="p-6">
                    {question}
                  </MarkdownRenderer>
                  <div ref={questionBottomRef} />
                </div>
              ) : (
                <p className="text-base md:text-lg flex items-center justify-center h-full p-6">
                  No question yet. Select a difficulty to generate one.
                </p>
              )}
            </ScrollArea>
          </ResizablePanel>
          {((feedback != null && feedback !== "") || isFeedbackLoading) && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel id="feedback" defaultSize={30} minSize={5}>
                <ScrollArea className="h-full min-w-48 *:h-full">
                  {isFeedbackLoading ? (
                      <div className="p-6 text-sm text-muted-foreground">Grading... Please wait</div>
                    ) : feedback && feedback !== "" ? (
                      <div>
                        <MarkdownRenderer className="p-6">
                          {feedback}
                        </MarkdownRenderer>
                        <div ref={feedbackBottomRef} />
                      </div>
                  ) : null}
                </ScrollArea>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id="answer" defaultSize={40} minSize={5}>
        <ScrollArea className="h-full min-w-48 *:h-full">
          <Textarea
            disabled={status !== "awaiting-answer"}
            onChange={e => setAnswer(e.target.value)}
            value={answer ?? ""}
            placeholder="Type your answer here..."
            className="w-full h-full resize-none border-none rounded-none focus-visible:ring focus-visible:ring-inset !text-base p-6"
          />
        </ScrollArea>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

function Controls({
  status,
  isLoading,
  disableAnswerButton,
  disableGenerateButtons,
  generateQuestion,
  generateFeedback,
  reset,
}: {
  disableAnswerButton: boolean
  disableGenerateButtons?: boolean
  status: Status
  isLoading: boolean
  generateQuestion: (difficulty: QuestionDifficulty) => void
  generateFeedback: () => void
  reset: () => void
}) {
  return (
    <div className="flex gap-2">
      {status === "awaiting-answer" ? (
        <>
          <Button
            onClick={reset}
            disabled={isLoading}
            variant="outline"
            size="sm"
          >
            <LoadingSwap isLoading={isLoading}>Skip</LoadingSwap>
          </Button>
          <Button
            onClick={generateFeedback}
            disabled={disableAnswerButton}
            size="sm"
          >
            <LoadingSwap isLoading={isLoading}>Answer</LoadingSwap>
          </Button>
        </>
      ) : (
        questionDifficulties.map(difficulty => (
          <Button
            key={difficulty}
            size="sm"
            disabled={isLoading || Boolean(disableGenerateButtons)}
            onClick={() => generateQuestion(difficulty)}
          >
            <LoadingSwap isLoading={isLoading}>
              {formatQuestionDifficulty(difficulty)}
            </LoadingSwap>
          </Button>
        ))
      )}
    </div>
  )
}