import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
} from '@clerk/clerk-react'
import { useState } from 'react'
import './App.css'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'
const chatEndpoint = import.meta.env.VITE_CHAT_ENDPOINT ?? '/api/v1/chat'

type ToolCall = {
  id: string
  name: string
  status: 'completed' | 'running' | 'failed'
  input?: string
  output?: string
  durationMs?: number
}

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  tools?: ToolCall[]
}

function App() {
  const { getToken } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [latestTools, setLatestTools] = useState<ToolCall[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const parseToolCalls = (data: Record<string, unknown>): ToolCall[] => {
    const raw = data.tool_calls
    if (!Array.isArray(raw)) return []

    return raw.map((item, index) => {
      const entry = (item ?? {}) as Record<string, unknown>
      return {
        id: String(entry.id ?? `tool-${index + 1}`),
        name: String(entry.name ?? entry.tool ?? `Tool ${index + 1}`),
        status:
          entry.status === 'failed'
            ? 'failed'
            : entry.status === 'running'
              ? 'running'
              : 'completed',
        input: entry.input ? JSON.stringify(entry.input, null, 2) : undefined,
        output: entry.output ? JSON.stringify(entry.output, null, 2) : undefined,
        durationMs:
          typeof entry.duration_ms === 'number'
            ? entry.duration_ms
            : typeof entry.durationMs === 'number'
              ? entry.durationMs
              : undefined,
      }
    })
  }

  const sendMessage = async () => {
    const content = input.trim()
    if (!content) return

    setMessages((prev) => [...prev, { role: 'user', content }])
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const token = await getToken()
      if (!token) {
        throw new Error('No Clerk session token was found.')
      }

      const response = await fetch(`${apiBaseUrl}${chatEndpoint}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          conversation_id: 'default',
        }),
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Chat request failed (${response.status}): ${text}`)
      }

      const data = (await response.json()) as Record<string, unknown>
      const parsedTools = parseToolCalls(data)
      const assistantText =
        typeof data.message === 'string'
          ? data.message
          : typeof data.content === 'string'
            ? data.content
            : 'No response content'

      setLatestTools(parsedTools)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: assistantText, tools: parsedTools },
      ])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="container">
      <header className="header">
        <h1>TrailChat</h1>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </header>

      <SignedOut>
        <section className="landing">
          <div className="hero">
            <p className="eyebrow">Adventure Park Theme</p>
            <h2>Your AI Basecamp for Multi-Tool Journeys</h2>
            <p className="hero-copy">
              Start at the gate, sign in, and explore conversations where every tool call leaves
              a visible trail.
            </p>
            <div className="actions">
              <SignUpButton mode="modal">
                <button className="primary">Get Park Pass</button>
              </SignUpButton>
              <SignInButton mode="modal">
                <button className="secondary">Enter Camp</button>
              </SignInButton>
            </div>
          </div>

          <div className="feature-grid">
            <article className="feature-card">
              <h3>Trail Log</h3>
              <p>Tool calls are shown as structured cards with status and payload blocks.</p>
            </article>
            <article className="feature-card">
              <h3>Secure Gate</h3>
              <p>Clerk authentication controls entry and signs every backend request.</p>
            </article>
            <article className="feature-card">
              <h3>Template Ready</h3>
              <p>Designed for open-source forks with clear layout and styling primitives.</p>
            </article>
          </div>
        </section>
      </SignedOut>

      <SignedIn>
        <section className="workspace">
          <div className="card chat-card">
            <h2>Explorer Chat</h2>
            <p>Send prompts and inspect the assistant responses in real time.</p>

            <div className="chat-window">
              {messages.length === 0 && (
                <p className="muted">No messages yet. Send your first message.</p>
              )}
              {messages.map((msg, idx) => (
                <div key={`${msg.role}-${idx}`} className={`bubble ${msg.role}`}>
                  {msg.content}
                </div>
              ))}
            </div>

            <div className="chat-input-row">
              <input
                className="chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask the guide..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !loading) {
                    void sendMessage()
                  }
                }}
              />
              <button className="primary" onClick={sendMessage} disabled={loading}>
                {loading ? 'Sending...' : 'Send'}
              </button>
            </div>
            {error && <p className="error">{error}</p>}
          </div>

          <aside className="card tools-card">
            <h2>Tool Trail</h2>
            <p>Latest model tool calls rendered from backend response metadata.</p>
            {latestTools.length === 0 ? (
              <p className="muted">No tool calls yet. Response-only mode is active.</p>
            ) : (
              <div className="tool-list">
                {latestTools.map((tool) => (
                  <article key={tool.id} className="tool-item">
                    <div className="tool-row">
                      <strong>{tool.name}</strong>
                      <span className={`pill ${tool.status}`}>{tool.status}</span>
                    </div>
                    {tool.durationMs !== undefined && (
                      <p className="tool-meta">{tool.durationMs} ms</p>
                    )}
                    {tool.input && <pre className="tool-block">{tool.input}</pre>}
                    {tool.output && <pre className="tool-block">{tool.output}</pre>}
                  </article>
                ))}
              </div>
            )}
          </aside>
        </section>
      </SignedIn>
    </main>
  )
}

export default App
