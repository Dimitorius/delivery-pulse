// Diagnose symptoms: content/symptoms/index.yaml (all 42) plus one
// content/symptoms/<id>.md per symptom, written in batches. Missing file →
// the card says "playbook coming".

import indexYaml from '../../content/symptoms/index.yaml'
import { SOURCES, type Source } from '../metrics/registry'
import { resolveId } from './catalog'
import { sections, splitFrontMatter, type Section } from './markdown'

export interface SymptomIndexEntry {
  id: string
  group: string
  name: string
  /** Simulator scenario that reproduces it (Inject scenario, stage 3b), or null. */
  scenario: string | null
}

export interface SignalRef {
  /** App id (registry id for live metrics). */
  id: string
  lookFor: string
}

export interface Playbook {
  id: string
  soundsLike: string[]
  earlySignals: SignalRef[]
  confirmingSignals: SignalRef[]
  hypotheses: { cause: string; check: string }[]
  playbook: { now: string[]; nextSprints: string[]; watchAfter?: string }
  antiPatterns: string[]
  evidence: { claim: string; sourceKeys: string[]; sources: Source[]; note?: string }[]
  flags: string[]
  sections: Section[]
}

export const SYMPTOMS: SymptomIndexEntry[] = indexYaml as SymptomIndexEntry[]
export const SYMPTOM_GROUPS = [...new Set(SYMPTOMS.map((s) => s.group))]
export const SYMPTOM_BY_ID = new Map(SYMPTOMS.map((s) => [s.id, s]))

const files = import.meta.glob<string>('../../content/symptoms/*.md', { query: '?raw', import: 'default', eager: true })

type RawSignal = { id: string; look_for: string }

export function parsePlaybook(text: string, fileName: string): Playbook {
  const { data, body } = splitFrontMatter(text)
  const signals = (k: string) => ((data[k] as RawSignal[] | undefined) ?? []).map((s) => ({ id: resolveId(s.id), lookFor: s.look_for }))
  const pb = (data.playbook as { now?: string[]; next_sprints?: string[]; watch_after?: string } | undefined) ?? {}
  return {
    id: String(data.id ?? fileName),
    soundsLike: (data.sounds_like as string[] | undefined) ?? [],
    earlySignals: signals('early_signals'),
    confirmingSignals: signals('confirming_signals'),
    hypotheses: (data.hypotheses as { cause: string; check: string }[] | undefined) ?? [],
    playbook: { now: pb.now ?? [], nextSprints: pb.next_sprints ?? [], watchAfter: pb.watch_after },
    antiPatterns: (data.anti_patterns as string[] | undefined) ?? [],
    evidence: ((data.evidence as { claim: string; sources?: string[]; note?: string }[] | undefined) ?? []).map((e) => ({
      claim: e.claim,
      note: e.note,
      sourceKeys: e.sources ?? [],
      sources: (e.sources ?? []).flatMap((k) => (SOURCES[k] ? [SOURCES[k]] : [])),
    })),
    flags: (data.flags as string[] | undefined) ?? [],
    sections: sections(body),
  }
}

export const PLAYBOOKS: Playbook[] = Object.entries(files).map(([path, text]) => parsePlaybook(text, path.split('/').pop()!.replace(/\.md$/, '')))
export const PLAYBOOK_BY_ID = new Map(PLAYBOOKS.map((p) => [p.id, p]))

/** Symptoms whose signals mention the metric (for the metric and Learn pages). */
export function symptomsForMetric(id: string): SymptomIndexEntry[] {
  return PLAYBOOKS.filter((p) => [...p.earlySignals, ...p.confirmingSignals].some((s) => s.id === id)).flatMap((p) => {
    const s = SYMPTOM_BY_ID.get(p.id)
    return s ? [s] : []
  })
}
