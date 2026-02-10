import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
  type ChatModelAdapter,
  type ChatModelRunOptions,
  type ThreadAssistantMessagePart,
} from '@assistant-ui/react'
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown'
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
  useAuth,
} from '@clerk/clerk-react'
import type { ReadonlyJSONObject } from 'assistant-stream/utils'
import { motion } from 'framer-motion'
import {
  Bot,
  Cable,
  CheckCheck,
  Cloud,
  DatabaseZap,
  ExternalLink,
  Github,
  KeyRound,
  Play,
  PlugZap,
  Rocket,
  Server,
  Workflow,
} from 'lucide-react'
import type { ComponentType, ReactNode } from 'react'
import { useMemo, useState } from 'react'

type AppProps = {
  clerkEnabled: boolean
}

type Feature = {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  accent: string
}

type StreamEvent =
  | { type: 'token'; content: string }
  | { type: 'tool_start'; id: string; name: string; input?: unknown }
  | { type: 'tool_end'; id: string; name: string; output?: unknown }
  | {
      type: 'final'
      content: string
      tool_calls?: Array<{
        id: string
        name: string
        input?: unknown
        output?: unknown
      }>
      conversation_id?: string
      response_id?: string
    }

type ToolState = {
  id: string
  name: string
  args: unknown
  result?: unknown
}

const features: Feature[] = [
  {
    icon: Bot,
    title: 'LangChain Agent',
    description:
      'Pre-wired chat endpoint with create_react_agent. Plug in your tools and go.',
    accent: 'from-violet-500 to-indigo-500',
  },
  {
    icon: PlugZap,
    title: 'MCP Server Built-in',
    description:
      'FastAPI endpoints auto-exposed as MCP tools via fastapi-mcp. Ready for MCP clients.',
    accent: 'from-emerald-500 to-teal-500',
  },
  {
    icon: KeyRound,
    title: 'Auth Ready',
    description:
      'Clerk auth integrated end-to-end with protected routes and DB-linked user IDs.',
    accent: 'from-sky-500 to-cyan-500',
  },
  {
    icon: DatabaseZap,
    title: 'Postgres',
    description:
      'Serverless Postgres with migrations and pooling pre-configured for production.',
    accent: 'from-orange-400 to-rose-500',
  },
]

const techStack = [
  { label: 'FastAPI', icon: Server },
  { label: 'LangChain', icon: Workflow },
  { label: 'React', icon: Play },
  { label: 'Clerk', icon: KeyRound },
  { label: 'Postgres', icon: Cloud },
  { label: 'MCP', icon: Cable },
]

const quickSteps = [
  {
    title: 'Clone',
    code: 'git clone https://github.com/yourusername/fastagent && cd fastagent',
  },
  {
    title: 'Configure',
    code: 'cp .env.example .env  # Add your Clerk + Postgres + LLM API keys',
  },
  {
    title: 'Launch',
    code: 'docker-compose up  # Backend, frontend, and MCP server — all running',
  },
]

const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const },
  },
}

const DEFAULT_API_BASE = 'http://127.0.0.1:8000'
const DEFAULT_CHAT_ENDPOINT = '/api/v1/chat'

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, '')}${normalizePath(path)}`
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function extractUserPrompt(options: ChatModelRunOptions): string {
  for (let i = options.messages.length - 1; i >= 0; i -= 1) {
    const message = options.messages[i]
    if (message.role !== 'user') continue
    return message.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
      .trim()
  }
  return ''
}

function buildAssistantParts(text: string, toolStates: ToolState[]): ThreadAssistantMessagePart[] {
  const parts: ThreadAssistantMessagePart[] = toolStates.map((tool) => ({
    type: 'tool-call',
    toolCallId: tool.id,
    toolName: tool.name,
    args: (typeof tool.args === 'object' && tool.args !== null
      ? tool.args
      : {}) as ReadonlyJSONObject,
    argsText:
      typeof tool.args === 'string' ? tool.args : JSON.stringify(tool.args ?? {}, null, 2),
    ...(tool.result !== undefined ? { result: tool.result } : {}),
  }))

  if (text.trim().length > 0 || parts.length === 0) {
    parts.push({ type: 'text', text })
  }

  return parts
}

async function* streamChat(
  response: Response,
): AsyncGenerator<StreamEvent, void, unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('No stream body returned from backend')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let boundary = buffer.indexOf('\n\n')
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary).trim()
      buffer = buffer.slice(boundary + 2)

      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload) continue
        const event = safeJsonParse(payload)
        if (event && typeof event === 'object' && 'type' in event) {
          yield event as StreamEvent
        }
      }

      boundary = buffer.indexOf('\n\n')
    }
  }
}

function Section({
  id,
  className,
  children,
}: {
  id?: string
  className?: string
  children: ReactNode
}) {
  return (
    <motion.section
      id={id}
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      variants={fadeInUp}
    >
      {children}
    </motion.section>
  )
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-violet-600 px-4 py-2 text-sm text-white">
        <MessagePrimitive.Parts
          components={{
            Text: ({ text }) => <p className="whitespace-pre-wrap">{text}</p>,
          }}
        />
      </div>
    </MessagePrimitive.Root>
  )
}

function ToolPart({
  toolName,
  argsText,
  result,
}: {
  toolName: string
  argsText: string
  result?: unknown
}) {
  const isRunning = result === undefined
  return (
    <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs dark:border-amber-500/30 dark:bg-amber-500/10">
      <p className="font-semibold text-amber-800 dark:text-amber-200">
        Tool: {toolName} {isRunning ? '(running...)' : '(completed)'}
      </p>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-amber-900/90 dark:text-amber-100/90">
        {argsText}
      </pre>
      {result !== undefined ? (
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-white/80 p-2 text-slate-700 dark:bg-slate-900/60 dark:text-slate-200">
          {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </div>
  )
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-white px-4 py-3 text-sm text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-100">
        <MessagePrimitive.Parts
          components={{
            Text: () => (
              <MarkdownTextPrimitive className="prose prose-sm max-w-none prose-slate dark:prose-invert" />
            ),
            tools: {
              Fallback: ({ toolName, argsText, result }) => (
                <ToolPart toolName={toolName} argsText={argsText} result={result} />
              ),
            },
          }}
        />
      </div>
    </MessagePrimitive.Root>
  )
}

function AssistantChat() {
  const { getToken } = useAuth()
  const [status, setStatus] = useState<string>('Idle')

  const runtime = useLocalRuntime(
    useMemo<ChatModelAdapter>(
      () => ({
        run: async function* (options) {
          const prompt = extractUserPrompt(options)
          if (!prompt) {
            yield {
              content: [{ type: 'text', text: 'Please enter a message.' }],
            }
            return
          }

          setStatus('Authenticating...')
          const template = import.meta.env.VITE_CLERK_JWT_TEMPLATE as string | undefined
          const token = template
            ? await getToken({ template })
            : await getToken()

          if (!token) {
            throw new Error(
              template
                ? `Unable to get Clerk JWT for template "${template}".`
                : 'Unable to get Clerk JWT token.',
            )
          }

          const baseUrl = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE
          const chatEndpoint = import.meta.env.VITE_CHAT_ENDPOINT ?? DEFAULT_CHAT_ENDPOINT
          const streamUrl = joinUrl(baseUrl, `${chatEndpoint.replace(/\/$/, '')}/stream`)
          const conversationId = options.unstable_threadId ?? 'default'

          setStatus('Streaming...')
          const response = await fetch(streamUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              content: prompt,
              conversation_id: conversationId,
            }),
            signal: options.abortSignal,
          })

          if (!response.ok) {
            const details = await response.text()
            throw new Error(`Chat request failed (${response.status}): ${details}`)
          }

          let assistantText = ''
          const toolMap = new Map<string, ToolState>()
          const toolOrder: string[] = []
          let finalResponseId = ''

          for await (const event of streamChat(response)) {
            if (event.type === 'token') {
              assistantText += event.content
            }

            if (event.type === 'tool_start') {
              if (!toolMap.has(event.id)) {
                toolOrder.push(event.id)
              }
              toolMap.set(event.id, {
                id: event.id,
                name: event.name,
                args: event.input ?? {},
              })
            }

            if (event.type === 'tool_end') {
              const existing = toolMap.get(event.id)
              toolMap.set(event.id, {
                id: event.id,
                name: event.name,
                args: existing?.args ?? {},
                result: event.output,
              })
              if (!toolOrder.includes(event.id)) {
                toolOrder.push(event.id)
              }
            }

            if (event.type === 'final') {
              if (event.content) {
                assistantText = event.content
              }
              if (event.response_id) {
                finalResponseId = event.response_id
              }
              for (const call of event.tool_calls ?? []) {
                toolMap.set(call.id, {
                  id: call.id,
                  name: call.name,
                  args: call.input ?? {},
                  result: call.output,
                })
                if (!toolOrder.includes(call.id)) {
                  toolOrder.push(call.id)
                }
              }
            }

            const orderedTools = toolOrder
              .map((id) => toolMap.get(id))
              .filter((tool): tool is ToolState => Boolean(tool))

            yield {
              content: buildAssistantParts(assistantText, orderedTools),
              metadata: {
                custom: {
                  response_id: finalResponseId,
                },
              },
            }
          }

          setStatus('Idle')
        },
      }),
      [getToken],
    ),
  )

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">FastAgent Workspace</h3>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800 dark:bg-violet-500/20 dark:text-violet-200">
            {status}
          </span>
        </div>

        <ThreadPrimitive.Root className="flex h-[560px] flex-col rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/70">
          <ThreadPrimitive.Viewport className="flex-1 space-y-3 overflow-y-auto pr-1">
            <ThreadPrimitive.Empty>
              <div className="mx-auto mt-10 max-w-md rounded-2xl border border-dashed border-violet-300 bg-violet-50 p-4 text-center text-sm text-violet-800 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-200">
                Ask a question to test your LangChain agent + MCP tools.
              </div>
            </ThreadPrimitive.Empty>
            <ThreadPrimitive.Messages
              components={{
                UserMessage,
                AssistantMessage,
              }}
            />
          </ThreadPrimitive.Viewport>

          <ComposerPrimitive.Root className="mt-3 flex items-end gap-2 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
            <ComposerPrimitive.Input
              className="min-h-[48px] flex-1 resize-none rounded-lg border border-transparent bg-transparent px-3 py-2 text-sm text-slate-800 outline-none focus:border-violet-300 dark:text-slate-100 dark:focus:border-violet-500/50"
              placeholder="Ask FastAgent anything..."
            />
            <ComposerPrimitive.Send className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60">
              Send
            </ComposerPrimitive.Send>
          </ComposerPrimitive.Root>
        </ThreadPrimitive.Root>
      </div>
    </AssistantRuntimeProvider>
  )
}

function App({ clerkEnabled }: AppProps) {
  const [copied, setCopied] = useState<string | null>(null)
  const githubUrl = import.meta.env.VITE_GITHUB_URL ?? 'https://github.com/yourusername/fastagent'

  const copyCode = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="relative overflow-x-clip">
      <div className="grain-overlay pointer-events-none absolute inset-0 opacity-80" />

      <header className="sticky top-0 z-30 border-b border-white/50 bg-white/70 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/70">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
          <a href="#hero" className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
            FastAgent
          </a>
          <nav className="hidden items-center gap-5 text-sm text-slate-600 md:flex dark:text-slate-300">
            <a href="#features" className="hover:text-slate-900 dark:hover:text-white">
              Features
            </a>
            <a href="#stack" className="hover:text-slate-900 dark:hover:text-white">
              Stack
            </a>
            <a href="#quickstart" className="hover:text-slate-900 dark:hover:text-white">
              Quick Start
            </a>
            <a href="#app" className="hover:text-slate-900 dark:hover:text-white">
              App
            </a>
          </nav>
          <div className="flex items-center gap-2">
            {clerkEnabled ? (
              <>
                <SignedOut>
                  <SignInButton mode="modal">
                    <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                      Sign in
                    </button>
                  </SignInButton>
                </SignedOut>
                <SignedIn>
                  <UserButton />
                </SignedIn>
              </>
            ) : (
              <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-200">
                Missing Clerk key
              </span>
            )}
            <a
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <Github className="h-4 w-4" />
              GitHub
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-10">
        <Section id="hero" className="grid items-start gap-8 lg:grid-cols-[1.08fr_0.92fr]">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-200">
              <Rocket className="h-3.5 w-3.5" />
              Open-Source AI Boilerplate
            </p>
            <h1 className="max-w-xl text-4xl font-black leading-tight text-slate-900 md:text-5xl dark:text-white">
              Ship AI Apps,
              <span className="bg-gradient-to-r from-violet-600 via-indigo-600 to-sky-500 bg-clip-text text-transparent">
                {' '}
                Not Boilerplate
              </span>
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-slate-600 dark:text-slate-300">
              FastAgent bundles FastAPI, LangChain Agent, React, Clerk Auth, Postgres DB, and MCP
              server wiring so you can launch useful AI workflows on day one.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="#quickstart"
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-violet-700"
              >
                Get Started
                <Rocket className="h-4 w-4" />
              </a>
              {clerkEnabled ? (
                <>
                  <SignedOut>
                    <SignUpButton mode="modal">
                      <button className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                        Sign up
                        <KeyRound className="h-4 w-4" />
                      </button>
                    </SignUpButton>
                  </SignedOut>
                  <SignedIn>
                    <a
                      href="#app"
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      Open App
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </SignedIn>
                </>
              ) : (
                <span className="inline-flex items-center rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                  Set `VITE_CLERK_PUBLISHABLE_KEY` to enable login/signup.
                </span>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-violet-200 bg-white p-4 shadow-soft dark:border-violet-500/30 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Live Chat Demo</p>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                stream
              </span>
            </div>
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/70">
              <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-violet-600 px-3 py-2 text-sm text-white">
                Find all users who signed in this week and summarize trends.
              </div>
              <div className="w-fit max-w-[88%] rounded-2xl rounded-bl-md bg-white px-3 py-2 text-sm text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200">
                Running MCP tools:
                <br />
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  • users.query_by_date
                  <br />• analytics.summarize_activity
                </span>
              </div>
              <div className="w-fit max-w-[88%] rounded-2xl rounded-bl-md bg-white px-3 py-2 text-sm text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200">
                You had 128 active users (+18% WoW). Peak sign-ins happened around 9 AM UTC.
              </div>
              <div className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-3 py-1 dark:bg-slate-700">
                <span className="h-1.5 w-1.5 animate-blink rounded-full bg-slate-500 [animation-delay:-0.2s]" />
                <span className="h-1.5 w-1.5 animate-blink rounded-full bg-slate-500 [animation-delay:-0.1s]" />
                <span className="h-1.5 w-1.5 animate-blink rounded-full bg-slate-500" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              <Bot className="h-4 w-4 text-violet-500" />
              Ask FastAgent anything...
            </div>
          </div>
        </Section>

        <Section id="features" className="mt-20">
          <h2 className="text-3xl font-black text-slate-900 dark:text-white">
            Everything You Need, Nothing You Don&apos;t
          </h2>
          <div className="mt-7 grid gap-4 md:grid-cols-2">
            {features.map((item) => (
              <motion.article
                key={item.title}
                whileHover={{ y: -4 }}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition dark:border-slate-800 dark:bg-slate-900"
              >
                <div
                  className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r ${item.accent} text-white`}
                >
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.description}</p>
              </motion.article>
            ))}
          </div>
        </Section>

        <Section id="stack" className="mt-20">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Built with
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {techStack.map((item) => (
              <div
                key={item.label}
                className="inline-flex animate-floaty items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
              >
                <item.icon className="h-4 w-4 text-violet-500" />
                {item.label}
              </div>
            ))}
          </div>
        </Section>

        <Section id="quickstart" className="mt-20">
          <h2 className="text-3xl font-black text-slate-900 dark:text-white">
            Up and Running in 3 Steps
          </h2>
          <div className="mt-7 space-y-4">
            {quickSteps.map((step, idx) => (
              <article
                key={step.title}
                className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-slate-100"
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-semibold">
                    <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-violet-500 text-xs font-black">
                      {idx + 1}
                    </span>
                    {step.title}
                  </p>
                  <button
                    onClick={() => void copyCode(step.code)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:text-white"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    {copied === step.code ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="overflow-x-auto rounded-xl bg-slate-900 p-3 text-sm leading-relaxed text-sky-200">
                  <code>{step.code}</code>
                </pre>
              </article>
            ))}
          </div>
        </Section>

        <Section className="mt-20">
          <h2 className="text-3xl font-black text-slate-900 dark:text-white">Architecture</h2>
          <div className="mt-6 grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-500/40 dark:bg-sky-500/10">
              <p className="font-bold text-sky-800 dark:text-sky-300">React Frontend</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Assistant UI + Clerk</p>
            </div>
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-500/40 dark:bg-violet-500/10">
              <p className="font-bold text-violet-800 dark:text-violet-300">FastAPI Backend</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">LangChain agent endpoints</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/40 dark:bg-emerald-500/10">
              <p className="font-bold text-emerald-800 dark:text-emerald-300">MCP + Tools</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">fastapi-mcp mounted server</p>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
              <p className="font-bold text-amber-800 dark:text-amber-300">Clerk Auth</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">sessions + protected routes</p>
            </div>
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-500/40 dark:bg-indigo-500/10 md:col-span-2">
              <p className="font-bold text-indigo-800 dark:text-indigo-300">Postgres</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">user data + thread memory + checkpoints</p>
            </div>
          </div>
        </Section>

        <Section id="app" className="mt-20">
          <h2 className="text-3xl font-black text-slate-900 dark:text-white">App</h2>
          <p className="mt-2 text-slate-600 dark:text-slate-300">
            Sign in to use the real assistant workspace connected to your FastAPI stream endpoint.
          </p>

          <div className="mt-6">
            {clerkEnabled ? (
              <>
                <SignedOut>
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-slate-700 dark:text-slate-200">
                      You are signed out. Sign in or create an account to continue.
                    </p>
                    <div className="mt-4 flex justify-center gap-3">
                      <SignInButton mode="modal">
                        <button className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
                          Sign in
                        </button>
                      </SignInButton>
                      <SignUpButton mode="modal">
                        <button className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                          Sign up
                        </button>
                      </SignUpButton>
                    </div>
                  </div>
                </SignedOut>
                <SignedIn>
                  <AssistantChat />
                </SignedIn>
              </>
            ) : (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
                Clerk is not configured. Add `VITE_CLERK_PUBLISHABLE_KEY` in
                `frontend/.env` and restart the frontend.
              </div>
            )}
          </div>
        </Section>
      </main>
    </div>
  )
}

export default App
