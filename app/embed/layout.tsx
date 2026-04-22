export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
        body { font-family: Inter, system-ui, -apple-system, sans-serif; }
        * { box-sizing: border-box; }
      `}</style>
      {children}
    </>
  )
}
