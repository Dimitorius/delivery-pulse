// Content and registry flags (⚠ in the YAML/Markdown) are shown on the public
// site as neutral caveats: the ⚠ marker is for the owner's review, the reader
// sees a plain "Caveat" (decision 02.10.2026, docs/stage-3b.md).

/** "⚠ practice: …" / "⚠ …" → "…" */
export function caveatText(flag: string): string {
  return flag.replace(/^\s*⚠\s*/, '').replace(/^practice:\s*/i, '')
}

export const isFlagged = (text: string | undefined): text is string => !!text && /^\s*⚠/.test(text)

/** One caveat, inline. */
export function Caveat({ text, className = '' }: { text: string; className?: string }) {
  return (
    <p className={`caveat small ${className}`}>
      <strong>Caveat:</strong> {caveatText(text)}
    </p>
  )
}

/** A block of caveats (article or symptom card front matter `flags`). */
export function Caveats({ flags }: { flags: string[] }) {
  if (!flags.length) return null
  return (
    <section className="notice caveats">
      <strong>{flags.length === 1 ? 'Caveat' : 'Caveats'}</strong>
      <ul className="small">
        {flags.map((f) => (
          <li key={f}>{caveatText(f)}</li>
        ))}
      </ul>
    </section>
  )
}
