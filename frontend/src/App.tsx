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
import { Badge } from './components/ui/badge'
import { Button, buttonVariants } from './components/ui/button'
import { Card, CardTitle } from './components/ui/card'
import { cn } from './lib/utils'

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
    accent: 'from-[#7f56d9] to-[#5f64ff]',
  },
  {
    icon: PlugZap,
    title: 'MCP Server Built-in',
    description:
      'FastAPI endpoints auto-exposed as MCP tools via fastapi-mcp. Ready for MCP clients.',
    accent: 'from-[#2dd4bf] to-[#22d3ee]',
  },
  {
    icon: KeyRound,
    title: 'Auth Ready',
    description:
      'Clerk auth integrated end-to-end with protected routes and DB-linked user IDs.',
    accent: 'from-[#4bb8ff] to-[#2f8cff]',
  },
  {
    icon: DatabaseZap,
    title: 'Postgres',
    description:
      'Serverless Postgres with migrations and pooling pre-configured for production.',
    accent: 'from-[#ff8f72] to-[#ff6f91]',
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
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-r from-[#7f56d9] to-[#fa7d66] px-4 py-2 text-sm text-white">
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
    <div className="mb-2 rounded-xl border border-[#503f9e] bg-[#1a1b4f] px-3 py-2 text-xs">
      <p className="font-semibold text-[#ffb4a3]">
        Tool: {toolName} {isRunning ? '(running...)' : '(completed)'}
      </p>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[#d8dbff]">
        {argsText}
      </pre>
      {result !== undefined ? (
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-[#10163e] p-2 text-[#cdd6ff]">
          {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </div>
  )
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-[#2b3f70] bg-[#172345] px-4 py-3 text-sm text-[#e4e8ff] shadow-sm">
        <MessagePrimitive.Parts
          components={{
            Text: () => (
              <MarkdownTextPrimitive className="prose prose-sm max-w-none prose-invert prose-p:text-[#e4e8ff] prose-strong:text-white prose-code:text-[#8dc3ff]" />
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
      <div className="rounded-3xl border border-[#2d3a72] bg-[#0d1539]/90 p-4 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-[#ff8f72]">FastAgent Workspace</h3>
          <Badge variant="warning" className="normal-case tracking-normal">
            {status}
          </Badge>
        </div>

        <ThreadPrimitive.Root className="flex h-[560px] flex-col rounded-2xl border border-[#34457a] bg-[#081334]/75 p-3">
          <ThreadPrimitive.Viewport className="flex-1 space-y-3 overflow-y-auto pr-1">
            <ThreadPrimitive.Empty>
              <div className="mx-auto mt-8 max-w-md rounded-2xl border border-dashed border-[#4d5aa0] bg-[#171d4b]/85 p-4 text-center text-sm text-[#d7ddff]">
                <img src="/cat.png" alt="FastAgent mascot" className="mx-auto mb-2 h-14 w-14" />
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

          <ComposerPrimitive.Root className="mt-3 flex items-end gap-2 rounded-xl border border-[#324278] bg-[#0d193f] p-2">
            <ComposerPrimitive.Input
              className="min-h-[48px] flex-1 resize-none rounded-lg border border-transparent bg-transparent px-3 py-2 text-sm text-[#ecf0ff] outline-none focus:border-[#7f56d9]"
              placeholder="Ask FastAgent anything..."
            />
            <ComposerPrimitive.Send className="rounded-lg bg-gradient-to-r from-[#7f56d9] to-[#fa7d66] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">
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

      <header className="sticky top-0 z-30 border-b border-[#29376d] bg-[#060e2f]/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
          <a href="#hero" className="inline-flex items-center gap-2">
            <img src="/logo.png" alt="FastAgent logo" className="h-8 w-auto md:h-9" />
            <span className="sr-only">FastAgent</span>
          </a>
          <nav className="hidden items-center gap-5 text-sm text-[#b7c0ea] md:flex">
            <a href="#features" className="hover:text-white">
              Features
            </a>
            <a href="#stack" className="hover:text-white">
              Stack
            </a>
            <a href="#quickstart" className="hover:text-white">
              Quick Start
            </a>
            <a href="#app" className="hover:text-white">
              App
            </a>
          </nav>
          <div className="flex items-center gap-2">
            {clerkEnabled ? (
              <>
                <SignedOut>
                  <SignInButton mode="modal">
                    <Button variant="secondary" size="sm">
                      Sign in
                    </Button>
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
              className={cn(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'rounded-full border-[#324278] bg-[#0d173f] text-[#d7deff]',
              )}
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
            <Badge className="mb-3">
              <Rocket className="h-3.5 w-3.5" />
              Open-Source AI Boilerplate
            </Badge>
            <h1 className="max-w-xl text-4xl font-black leading-tight text-white md:text-5xl">
              Ship AI Apps,
              <span className="bg-gradient-to-r from-[#7f56d9] via-[#6f7cff] to-[#fa7d66] bg-clip-text text-transparent">
                {' '}
                Not Boilerplate
              </span>
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-[#bfc7eb]">
              FastAgent bundles FastAPI, LangChain Agent, React, Clerk Auth, Postgres DB, and MCP
              server wiring so you can launch useful AI workflows on day one.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="#quickstart"
                className={cn(
                  buttonVariants({ variant: 'default', size: 'lg' }),
                  'shadow-soft hover:-translate-y-0.5',
                )}
              >
                Get Started
                <Rocket className="h-4 w-4" />
              </a>
              {clerkEnabled ? (
                <>
                  <SignedOut>
                    <SignUpButton mode="modal">
                      <Button variant="secondary" size="lg" className="hover:-translate-y-0.5">
                        Sign up
                        <KeyRound className="h-4 w-4" />
                      </Button>
                    </SignUpButton>
                  </SignedOut>
                  <SignedIn>
                    <a
                      href="#app"
                      className={cn(
                        buttonVariants({ variant: 'secondary', size: 'lg' }),
                        'hover:-translate-y-0.5',
                      )}
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

          <div className="relative rounded-2xl border border-[#40509a] bg-[#0d173e]/85 p-4 shadow-soft">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-[#ecf0ff]">Live Chat Demo</p>
              <Badge variant="success" className="normal-case tracking-normal">
                stream
              </Badge>
            </div>
            <div className="space-y-3 rounded-xl border border-[#324278] bg-[#070f2c] p-3">
              <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-r from-[#7f56d9] to-[#9258ff] px-3 py-2 text-sm text-white">
                Find all users who signed in this week and summarize trends.
              </div>
              <div className="w-fit max-w-[88%] rounded-2xl rounded-bl-md bg-[#232f4d] px-3 py-2 text-sm text-[#dde4ff] shadow-sm">
                Running MCP tools:
                <br />
                <span className="text-xs text-[#98a6d8]">
                  • users.query_by_date
                  <br />• analytics.summarize_activity
                </span>
              </div>
              <div className="w-fit max-w-[88%] rounded-2xl rounded-bl-md bg-[#232f4d] px-3 py-2 text-sm text-[#dde4ff] shadow-sm">
                You had 128 active users (+18% WoW). Peak sign-ins happened around 9 AM UTC.
              </div>
              <div className="inline-flex items-center gap-1 rounded-full bg-[#2e3c61] px-3 py-1">
                <span className="h-1.5 w-1.5 animate-blink rounded-full bg-[#9da9d6] [animation-delay:-0.2s]" />
                <span className="h-1.5 w-1.5 animate-blink rounded-full bg-[#9da9d6] [animation-delay:-0.1s]" />
                <span className="h-1.5 w-1.5 animate-blink rounded-full bg-[#9da9d6]" />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#34457a] bg-[#111c43] px-3 py-2 text-sm text-[#9eabdc]">
              <Bot className="h-4 w-4 text-[#8a6cff]" />
              Ask FastAgent anything...
            </div>
          </div>
        </Section>

        <Section id="features" className="mt-20">
          <h2 className="text-3xl font-black text-white">
            Everything You Need, Nothing You Don&apos;t
          </h2>
          <div className="mt-7 grid gap-4 md:grid-cols-2">
            {features.map((item) => (
              <motion.div
                key={item.title}
                whileHover={{ y: -4 }}
                className="transition"
              >
                <Card className="p-5 shadow-sm">
                  <div
                    className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r ${item.accent} text-white`}
                  >
                    <item.icon className="h-5 w-5" />
                  </div>
                  <CardTitle>{item.title}</CardTitle>
                  <p className="mt-2 text-sm text-[#b8c3ea]">{item.description}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </Section>

        <Section id="stack" className="mt-20">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#97a8e0]">
            Built with
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {techStack.map((item) => (
              <div
                key={item.label}
                className="inline-flex animate-floaty items-center gap-2 rounded-full border border-[#34457a] bg-[#111b42] px-4 py-2 text-sm font-semibold text-[#d6ddff]"
              >
                <item.icon className="h-4 w-4 text-[#ff8f72]" />
                {item.label}
              </div>
            ))}
          </div>
        </Section>

        <Section id="quickstart" className="mt-20">
          <h2 className="text-3xl font-black text-white">
            Up and Running in 3 Steps
          </h2>
          <div className="mt-7 space-y-4">
            {quickSteps.map((step, idx) => (
              <Card
                key={step.title}
                className="border-[#34457a] bg-[#0a1233] p-4 text-slate-100"
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-semibold">
                    <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-r from-[#7f56d9] to-[#fa7d66] text-xs font-black">
                      {idx + 1}
                    </span>
                    {step.title}
                  </p>
                  <Button
                    onClick={() => void copyCode(step.code)}
                    variant="outline"
                    size="sm"
                    className="h-8 border-[#405092] px-2.5 text-xs text-[#c8d1fb] hover:border-[#7182c5] hover:text-white"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    {copied === step.code ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <pre className="overflow-x-auto rounded-xl bg-[#020a26] p-3 text-sm leading-relaxed text-[#8dc3ff]">
                  <code>{step.code}</code>
                </pre>
              </Card>
            ))}
          </div>
        </Section>

        <Section className="mt-20">
          <h2 className="text-3xl font-black text-white">Architecture</h2>
          <div className="mt-6 grid gap-4 rounded-3xl border border-[#34457a] bg-[#0d173e]/85 p-5 shadow-sm md:grid-cols-3">
            <div className="rounded-2xl border border-[#2d7ab3] bg-[#103258]/70 p-4">
              <p className="font-bold text-[#9bdeff]">React Frontend</p>
              <p className="mt-1 text-sm text-[#c7def5]">Assistant UI + Clerk</p>
            </div>
            <div className="rounded-2xl border border-[#5b4caf] bg-[#281f62]/70 p-4">
              <p className="font-bold text-[#d6cbff]">FastAPI Backend</p>
              <p className="mt-1 text-sm text-[#cfc7f7]">LangChain agent endpoints</p>
            </div>
            <div className="rounded-2xl border border-[#278f7d] bg-[#0b4a4b]/70 p-4">
              <p className="font-bold text-[#8af0e2]">MCP + Tools</p>
              <p className="mt-1 text-sm text-[#b4ebdf]">fastapi-mcp mounted server</p>
            </div>

            <div className="rounded-2xl border border-[#c05a6b] bg-[#5f2741]/70 p-4">
              <p className="font-bold text-[#ffb5c2]">Clerk Auth</p>
              <p className="mt-1 text-sm text-[#ffd0d8]">sessions + protected routes</p>
            </div>
            <div className="rounded-2xl border border-[#f58e73] bg-[#5e2f41]/70 p-4 md:col-span-2">
              <p className="font-bold text-[#ffc4b4]">Postgres</p>
              <p className="mt-1 text-sm text-[#ffd8cd]">user data + thread memory + checkpoints</p>
            </div>
          </div>
        </Section>

        <Section id="app" className="mt-20">
          <h2 className="text-3xl font-black text-white">App</h2>
          <p className="mt-2 text-[#bac5ef]">
            Sign in to use the real assistant workspace connected to your FastAPI stream endpoint.
          </p>

          <div className="mt-6">
            {clerkEnabled ? (
              <>
                <SignedOut>
                  <Card className="border-[#3a4a86] bg-[#0f1940]/90 p-6 text-center">
                    <img src="/cat.png" alt="FastAgent mascot" className="mx-auto mb-3 h-16 w-16" />
                    <p className="text-[#dce3ff]">
                      You are signed out. Sign in or create an account to continue.
                    </p>
                    <div className="mt-4 flex justify-center gap-3">
                      <SignInButton mode="modal">
                        <Button>
                          Sign in
                        </Button>
                      </SignInButton>
                      <SignUpButton mode="modal">
                        <Button variant="secondary">
                          Sign up
                        </Button>
                      </SignUpButton>
                    </div>
                  </Card>
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
