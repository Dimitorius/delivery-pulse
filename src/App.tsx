export default function App() {
  return (
    <main className="stage0">
      <svg className="pulse" viewBox="0 0 240 48" aria-hidden="true">
        <polyline points="0,24 70,24 84,8 100,42 114,16 124,24 240,24" />
      </svg>
      <h1>Delivery Pulse</h1>
      <p className="lead">
        Live flow, DORA and program metrics for Delivery Managers and TPMs.
      </p>
      <p className="status">
        <span className="dot" /> Stage 0 · deployment pipeline is live. The dashboard is being built.
      </p>
    </main>
  )
}
