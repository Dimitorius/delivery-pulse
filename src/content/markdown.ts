// Minimal Markdown for the content files (articles, symptoms): YAML front
// matter, `##` sections, paragraphs, bullet and numbered lists, **bold**,
// *italic*, `code` and [links](url). Parsed into plain data; the UI renders
// it as React elements (no raw HTML is ever injected).

import { parse } from 'yaml'

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'b'; c: Inline[] }
  | { t: 'i'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'a'; href: string; c: Inline[] }

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'ul'; items: Inline[][] }
  | { t: 'ol'; items: Inline[][] }
  | { t: 'h3'; c: Inline[] }

export interface Section {
  title: string
  blocks: Block[]
}

export function splitFrontMatter(text: string): { data: Record<string, unknown>; body: string } {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { data: {}, body: text }
  return { data: (parse(m[1]) as Record<string, unknown>) ?? {}, body: m[2] }
}

/** Split the body into `## ` sections (text before the first heading is ignored). */
export function sections(body: string): Section[] {
  const out: Section[] = []
  let cur: { title: string; lines: string[] } | undefined
  for (const line of body.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.*)$/)
    if (h) {
      if (cur) out.push({ title: cur.title, blocks: blocks(cur.lines.join('\n')) })
      cur = { title: h[1].trim(), lines: [] }
    } else if (cur) cur.lines.push(line)
  }
  if (cur) out.push({ title: cur.title, blocks: blocks(cur.lines.join('\n')) })
  return out
}

export function blocks(text: string): Block[] {
  const out: Block[] = []
  let para: string[] = []
  let list: { t: 'ul' | 'ol'; items: string[] } | undefined
  const flushPara = () => {
    if (para.length) out.push({ t: 'p', c: inline(para.join(' ')) })
    para = []
  }
  const flushList = () => {
    if (list) out.push({ t: list.t, items: list.items.map(inline) })
    list = undefined
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd()
    const ul = line.match(/^\s*[-*]\s+(.*)$/)
    const ol = line.match(/^\s*\d+\.\s+(.*)$/)
    const h3 = line.match(/^###\s+(.*)$/)
    if (!line.trim()) {
      flushPara()
      flushList()
    } else if (h3) {
      flushPara()
      flushList()
      out.push({ t: 'h3', c: inline(h3[1]) })
    } else if (ul || ol) {
      flushPara()
      const t = ul ? 'ul' : 'ol'
      if (list && list.t !== t) flushList()
      list ??= { t, items: [] }
      list.items.push((ul ?? ol)![1])
    } else if (list && /^\s{2,}\S/.test(raw)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`
    } else {
      flushList()
      para.push(line.trim())
    }
  }
  flushPara()
  flushList()
  return out
}

const TOKEN = /(\*\*([^*]+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*\s][^*]*?)\*)/

export function inline(text: string): Inline[] {
  const out: Inline[] = []
  let rest = text
  while (rest) {
    const m = rest.match(TOKEN)
    if (!m || m.index === undefined) {
      out.push({ t: 'text', v: rest })
      break
    }
    if (m.index > 0) out.push({ t: 'text', v: rest.slice(0, m.index) })
    if (m[2] !== undefined) out.push({ t: 'b', c: inline(m[2]) })
    else if (m[3] !== undefined) out.push({ t: 'code', v: m[3] })
    else if (m[4] !== undefined) out.push({ t: 'a', href: m[5], c: inline(m[4]) })
    else out.push({ t: 'i', c: inline(m[6]) })
    rest = rest.slice(m.index + m[0].length)
  }
  return out
}

/** Plain text of inline nodes (search, tests). */
export function plain(nodes: Inline[]): string {
  return nodes.map((n) => (n.t === 'text' || n.t === 'code' ? n.v : plain(n.c))).join('')
}
