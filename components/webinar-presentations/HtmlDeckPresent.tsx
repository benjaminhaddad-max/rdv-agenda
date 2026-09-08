export function HtmlDeckPresent({
  src,
  title,
  backHref,
}: {
  src: string
  title: string
  backHref: string
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483647,
        background: '#0d2238',
      }}
    >
      <iframe
        src={src}
        title={title}
        allow="fullscreen"
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          border: 'none',
          background: '#0d2238',
        }}
      />
      <a
        href={backHref}
        style={{
          position: 'fixed',
          top: 16,
          left: 16,
          zIndex: 2147483647,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          borderRadius: 999,
          background: 'rgba(13,34,56,0.92)',
          border: '1px solid rgba(211,171,103,0.45)',
          color: '#d3ab67',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 12,
          fontWeight: 700,
          textDecoration: 'none',
        }}
      >
        ← Quitter
      </a>
    </div>
  )
}

