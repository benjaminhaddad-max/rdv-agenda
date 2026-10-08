'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Page de connexion — design V2 (tokens .crm-v2 : fond #f5f8fa, bordures
// #dfe3eb, texte #2d3e50, accent or #C9A84C, marine Hub Diploma #12314D).
// Premier écran de l'app mobile Hub Diploma (App Store) : liens Assistance /
// Confidentialité obligatoires et champs compatibles remplissage auto iOS.

const NAVY = '#12314D'
const BORDER = '#dfe3eb'
const GOLD = '#C9A84C'

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
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        router.push('/')
        router.refresh()
        return
      }
      setError(
        typeof data.error === 'string'
          ? data.error
          : res.status === 401
            ? 'Email ou mot de passe incorrect'
            : 'Connexion impossible pour le moment.'
      )
      setLoading(false)
      return
    } catch {
      setError("Impossible de joindre le serveur. Vérifie ta connexion et réessaie.")
      setLoading(false)
      return
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: '#ffffff',
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    padding: '12px 14px',
    color: '#2d3e50',
    fontSize: 16, // ≥ 16px : évite le zoom automatique de Safari iOS
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    transition: 'border-color .15s, box-shadow .15s',
  }
  const focus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = GOLD
    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(201,168,76,0.18)'
  }
  const blur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = BORDER
    e.currentTarget.style.boxShadow = 'none'
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: '#2d3e50', marginBottom: 6, display: 'block',
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#f5f8fa',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
      padding: 'max(24px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom))',
      boxSizing: 'border-box',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif',
      color: '#2d3e50',
    }}>
      <form onSubmit={handleLogin} style={{
        background: '#ffffff',
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: '36px 28px 28px',
        width: '100%',
        maxWidth: 400,
        boxSizing: 'border-box',
        boxShadow: '0 1px 3px rgba(45,62,80,0.06), 0 8px 24px -12px rgba(45,62,80,0.12)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-hub-diploma-horizontal.svg"
            alt="Hub Diploma"
            width={200}
            height={48}
            style={{ height: 48, width: 'auto', display: 'inline-block' }}
          />
          <div style={{ fontSize: 14, color: '#516f90', marginTop: 12 }}>
            CRM et rendez-vous des équipes Diploma Santé
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="login-email" style={labelStyle}>E-mail</label>
          <input
            id="login-email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
            style={inputStyle}
            placeholder="prenom@diploma-sante.fr"
            onFocus={focus}
            onBlur={blur}
          />
        </div>

        <div style={{ marginBottom: 22 }}>
          <label htmlFor="login-password" style={labelStyle}>Mot de passe</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={inputStyle}
            placeholder="••••••••"
            onFocus={focus}
            onBlur={blur}
          />
        </div>

        {error && (
          <div role="alert" style={{
            background: '#fdedee',
            border: '1px solid #f2b8bd',
            borderRadius: 8,
            padding: '10px 14px',
            color: '#c0392b',
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
            background: NAVY,
            color: '#ffffff',
            border: 'none',
            borderRadius: 8,
            padding: '13px',
            fontSize: 15,
            fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
            fontFamily: 'inherit',
          }}
        >
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>

        <p style={{ fontSize: 12.5, color: '#7c98b6', textAlign: 'center', margin: '18px 0 0', lineHeight: 1.5 }}>
          Accès réservé aux collaborateurs Diploma Santé.
          <br />
          Mot de passe oublié ? Contactez l’administration.
        </p>
      </form>

      <nav style={{ fontSize: 13, display: 'flex', gap: 16 }}>
        <a href="/assistance" style={{ color: '#516f90', textDecoration: 'none' }}>Assistance</a>
        <span style={{ color: '#cbd6e2' }}>·</span>
        <a href="/confidentialite" style={{ color: '#516f90', textDecoration: 'none' }}>Confidentialité</a>
      </nav>
    </div>
  )
}
