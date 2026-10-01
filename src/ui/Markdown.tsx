import type { Block, Inline } from '../content/markdown'

export function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case 'text':
            return <span key={i}>{n.v}</span>
          case 'b':
            return (
              <strong key={i}>
                <Inlines nodes={n.c} />
              </strong>
            )
          case 'i':
            return (
              <em key={i}>
                <Inlines nodes={n.c} />
              </em>
            )
          case 'code':
            return <code key={i}>{n.v}</code>
          case 'a': {
            const external = /^https?:/.test(n.href)
            return (
              <a key={i} href={n.href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
                <Inlines nodes={n.c} />
              </a>
            )
          }
        }
      })}
    </>
  )
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.t === 'p')
          return (
            <p key={i}>
              <Inlines nodes={b.c} />
            </p>
          )
        if (b.t === 'h3')
          return (
            <h4 key={i}>
              <Inlines nodes={b.c} />
            </h4>
          )
        const items = b.items.map((it, k) => (
          <li key={k}>
            <Inlines nodes={it} />
          </li>
        ))
        return b.t === 'ul' ? <ul key={i}>{items}</ul> : <ol key={i}>{items}</ol>
      })}
    </>
  )
}
