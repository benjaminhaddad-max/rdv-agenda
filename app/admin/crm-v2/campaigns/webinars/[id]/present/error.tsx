'use client'

export default function PresentError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 4000,
      background: '#050d16',
      color: '#e8eef6',
      display: 'grid',
      placeItems: 'center',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 420, padding: 24 }}>
        <div style={{ letterSpacing: '0.22em', textTransform: 'uppercase', fontSize: 11, fontWeight: 700, color: '#d3ab67', marginBottom: 12 }}>
          Diploma Santé
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>
          La présentation n’a pas pu s’ouvrir.
        </div>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: 8,
            background: '#d3ab67',
            color: '#12314d',
            border: 'none',
            borderRadius: 999,
            padding: '10px 18px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Réessayer
        </button>
      </div>
    </div>
  )
}
