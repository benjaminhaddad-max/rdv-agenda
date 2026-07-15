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

    // Connexion via le serveur (Vercel → Supabase) : passe même quand le
    // réseau local est bloqué/rate-limité par Supabase Auth.
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        router.push('/')
        router.refresh()
        return
      }
      if (res.status === 401) {
        setError('Email ou mot de passe incorrect')
        setLoading(false)
        return
      }
      // 504 ou autre erreur serveur → tentative directe navigateur ci-dessous.
    } catch {
      // Erreur réseau → tentative directe navigateur ci-dessous.
    }

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
      background: '#f7f4ee',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
    }}>
      <form onSubmit={handleLogin} style={{
        background: '#ffffff',
        border: '1px solid #e5ddc8',
        borderRadius: 16,
        padding: '40px 36px',
        width: 380,
        boxShadow: '0 4px 24px -8px rgba(11, 22, 40, 0.1)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 48, height: 48,
            borderRadius: 12,
            background: 'linear-gradient(168deg, #0e1e35 0%, #1a3350 100%)',
            marginBottom: 14,
            boxShadow: '0 4px 12px rgba(14, 30, 53, 0.25)',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#0e1e35', letterSpacing: '-0.3px' }}>
            Diploma Santé
          </div>
          <div style={{ fontSize: 13, color: '#7d8c9e', marginTop: 4 }}>
            Outil de gestion des RDV
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{
            fontSize: 11, fontWeight: 700, color: '#4a6070',
            marginBottom: 6, display: 'block',
            textTransform: 'uppercase', letterSpacing: '0.06em',
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
              background: '#fbf8f1',
              border: '1.5px solid #e5ddc8',
              borderRadius: 10,
              padding: '11px 14px',
              color: '#0e1e35',
              fontSize: 14,
              outline: 'none',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
            placeholder="votre@email.com"
            onFocus={e => { e.currentTarget.style.borderColor = '#C9A84C' }}
            onBlur={e => { e.currentTarget.style.borderColor = '#e5ddc8' }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{
            fontSize: 11, fontWeight: 700, color: '#4a6070',
            marginBottom: 6, display: 'block',
            textTransform: 'uppercase', letterSpacing: '0.06em',
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
              background: '#fbf8f1',
              border: '1.5px solid #e5ddc8',
              borderRadius: 10,
              padding: '11px 14px',
              color: '#0e1e35',
              fontSize: 14,
              outline: 'none',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
            placeholder="••••••••"
            onFocus={e => { e.currentTarget.style.borderColor = '#C9A84C' }}
            onBlur={e => { e.currentTarget.style.borderColor = '#e5ddc8' }}
          />
        </div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.06)',
            border: '1px solid rgba(239,68,68,0.22)',
            borderRadius: 8,
            padding: '10px 14px',
            color: '#dc2626',
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
            background: 'linear-gradient(168deg, #0e1e35 0%, #1a3350 100%)',
            color: '#f7f4ee',
            border: 'none',
            borderRadius: 10,
            padding: '13px',
            fontSize: 14,
            fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
            fontFamily: 'inherit',
            letterSpacing: '0.02em',
            boxShadow: '0 4px 14px rgba(14, 30, 53, 0.22)',
          }}
        >
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>

        <div style={{
          marginTop: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <div style={{ flex: 1, height: 1, background: '#e5ddc8' }} />
          <span style={{ fontSize: 10, color: '#a89e8a', fontWeight: 600, letterSpacing: '0.1em' }}>DIPLOMA SANTÉ</span>
          <div style={{ flex: 1, height: 1, background: '#e5ddc8' }} />
        </div>
      </form>
    </div>
  )
}
