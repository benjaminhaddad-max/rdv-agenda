'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Email ou mot de passe incorrect')
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f1117',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <form onSubmit={handleLogin} style={{
        background: '#1e2130',
        border: '1px solid #2a2d3e',
        borderRadius: 16,
        padding: '40px 36px',
        width: 380,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#e8eaf0' }}>
            Diploma Santé
          </div>
          <div style={{ fontSize: 13, color: '#555870', marginTop: 4 }}>
            Outil de gestion des RDV
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{
            fontSize: 12, fontWeight: 600, color: '#8b8fa8',
            marginBottom: 6, display: 'block',
          }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
            style={{
              width: '100%',
              background: '#252840',
              border: '1px solid #2a2d3e',
              borderRadius: 10,
              padding: '12px 14px',
              color: '#e8eaf0',
              fontSize: 14,
              outline: 'none',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
            placeholder="votre@email.com"
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{
            fontSize: 12, fontWeight: 600, color: '#8b8fa8',
            marginBottom: 6, display: 'block',
          }}>
            Mot de passe
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{
              width: '100%',
              background: '#252840',
              border: '1px solid #2a2d3e',
              borderRadius: 10,
              padding: '12px 14px',
              color: '#e8eaf0',
              fontSize: 14,
              outline: 'none',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
            placeholder="••••••••"
          />
        </div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
            borderRadius: 8,
            padding: '10px 14px',
            color: '#ef4444',
            fontSize: 13,
            marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            background: '#4f6ef7',
            color: 'white',
            border: 'none',
            borderRadius: 10,
            padding: '13px',
            fontSize: 14,
            fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
            fontFamily: 'inherit',
          }}
        >
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
    </div>
  )
}
