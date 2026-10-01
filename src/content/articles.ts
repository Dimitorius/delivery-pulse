// Learn articles (content/articles/<id>.md): front matter + fixed sections
// (content/README.md). Missing article → the screen says "article coming".

import { SOURCES, type Source } from '../metrics/registry'
import { resolveId, type Tier } from './catalog'
import { sections, splitFrontMatter, type Section } from './markdown'

export type Role = 'dm' | 'tpm' | 'pjm'
export const ROLES: { id: Role; label: string; long: string }[] = [
  { id: 'dm', label: 'DM', long: 'Delivery Manager' },
  { id: 'tpm', label: 'TPM', long: 'Technical Program Manager' },
  { id: 'pjm', label: 'PjM', long: 'Project Manager' },
]

/** Calculators that exist in the app; an article names one in `calculator`. */
export const CALCULATORS = ['cycle-percentiles', 'say-do', 'monte-carlo'] as const
export type CalculatorId = (typeof CALCULATORS)[number]

export const SECTION_ORDER = [
  'Why it exists',
  "How it's calculated",
  'How to read it',
  'When to use it — and when not to',
  'How it gets gamed',
  'Say it in an interview',
] as const
export const OPTIONAL_SECTIONS = ['Framework names', 'Primary source quotes'] as const

export interface Article {
  /** App id (registry id for live metrics). */
  id: string
  /** id as written in the file. */
  fileId: string
  tier: Tier
  roles: Role[]
  answers: string[]
  useWhen?: string
  avoidWhen?: string
  readWith: { id: string; why: string }[]
  calculator?: CalculatorId
  sourceKeys: string[]
  sources: Source[]
  flags: string[]
  sections: Section[]
}

const files = import.meta.glob<string>('../../content/articles/*.md', { query: '?raw', import: 'default', eager: true })

export function parseArticle(text: string, fileName: string): Article {
  const { data, body } = splitFrontMatter(text)
  const fileId = String(data.id ?? fileName)
  const sourceKeys = (data.sources as string[] | undefined) ?? []
  return {
    id: resolveId(fileId),
    fileId,
    tier: Number(data.tier) as Tier,
    roles: (data.roles as Role[] | undefined) ?? [],
    answers: (data.answers as string[] | undefined) ?? [],
    useWhen: data.use_when as string | undefined,
    avoidWhen: data.avoid_when as string | undefined,
    readWith: ((data.read_with as { id: string; why: string }[] | undefined) ?? []).map((r) => ({ ...r, id: resolveId(r.id) })),
    calculator: data.calculator as CalculatorId | undefined,
    sourceKeys,
    sources: sourceKeys.flatMap((k) => (SOURCES[k] ? [SOURCES[k]] : [])),
    flags: (data.flags as string[] | undefined) ?? [],
    sections: sections(body),
  }
}

export const ARTICLES: Article[] = Object.entries(files).map(([path, text]) => parseArticle(text, path.split('/').pop()!.replace(/\.md$/, '')))
export const ARTICLE_BY_ID = new Map(ARTICLES.map((a) => [a.id, a]))
export const articleFor = (id: string) => ARTICLE_BY_ID.get(resolveId(id))
