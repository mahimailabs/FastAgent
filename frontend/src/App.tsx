import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
  useUser,
} from '@clerk/clerk-react'
import { useState } from 'react'
import './App.css'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

function App() {
  const { getToken } = useAuth()
  const { user } = useUser()
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const loadProfile = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = await getToken()
      if (!token) {
        throw new Error('No Clerk session token was found.')
      }

      const response = await fetch(`${apiBaseUrl}/api/v1/users/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`Backend auth failed (${response.status}): ${text}`)
      }

      const data = await response.json()
      setProfile(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error'
      setError(message)
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="container">
      <header className="header">
        <h1>Kurious Frontend</h1>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </header>

      <SignedOut>
        <section className="card">
          <h2>Authenticate with Clerk</h2>
          <p>Use email or username with password to create an account and sign in.</p>
          <div className="actions">
            <SignUpButton mode="modal">
              <button className="primary">Sign up</button>
            </SignUpButton>
            <SignInButton mode="modal">
              <button className="secondary">Sign in</button>
            </SignInButton>
          </div>
        </section>
      </SignedOut>

      <SignedIn>
        <section className="card">
          <h2>Welcome{user?.firstName ? `, ${user.firstName}` : ''}</h2>
          <p>Verify the Clerk bearer token against your FastAPI backend.</p>
          <div className="actions">
            <button className="primary" onClick={loadProfile} disabled={loading}>
              {loading ? 'Checking...' : 'Load /api/v1/users/me'}
            </button>
          </div>

          {error && <p className="error">{error}</p>}

          {profile && (
            <pre className="json">{JSON.stringify(profile, null, 2)}</pre>
          )}
        </section>
      </SignedIn>
    </main>
  )
}

export default App
