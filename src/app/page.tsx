export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        fontFamily: 'system-ui, sans-serif',
        background: '#f7f4ee',
        color: '#222',
        padding: 24,
      }}
    >
      <h1 style={{ fontSize: 56, margin: 0 }}>VibeCity</h1>
      <p style={{ fontSize: 18, margin: 0, opacity: 0.75 }}>
        A fully vibed city builder you can actually drive around in.
      </p>
      <p style={{ fontSize: 14, marginTop: 24, opacity: 0.55 }}>
        Scaffold landed. Routing, editor, and drive mode coming next.
      </p>
    </main>
  )
}
