export default function AlternanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="alternance-module" style={{ minHeight: '100vh' }}>
      {children}
    </div>
  )
}
