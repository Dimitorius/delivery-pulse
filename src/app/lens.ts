// Framework lens (SPEC §6): rename the UI into SAFe or Flow Framework
// vocabulary. Metrics without a framework name keep their own; only metrics
// that contradict the framework are dimmed.

import type { MetricDef } from '../metrics/registry'
import type { Lens } from './state'

export function lensAka(def: MetricDef, lens: Lens) {
  return lens === 'default' ? undefined : def.aka?.[lens]
}

export function displayName(def: MetricDef, lens: Lens, short = false): string {
  return lensAka(def, lens)?.name ?? (short ? def.short : def.name)
}

/**
 * The lens is a vocabulary, not a filter: a metric without a framework name
 * keeps its own name. Only a metric that contradicts the framework is dimmed.
 */
export function dimmed(def: MetricDef, lens: Lens): boolean {
  return lens !== 'default' && !!def.lensConflict?.[lens]
}

export function conflictNote(def: MetricDef, lens: Lens): string | undefined {
  return lens === 'default' ? undefined : def.lensConflict?.[lens]
}

const VOCAB: Record<Lens, Record<string, string>> = {
  default: {},
  safe: { Program: 'ART', program: 'ART', Sprint: 'Iteration', sprint: 'iteration', Sprints: 'Iterations' },
  flow: {},
}

/** Translate a UI term (Program, Sprint…) into the lens vocabulary. */
export function term(word: string, lens: Lens): string {
  return VOCAB[lens][word] ?? word
}

export const LENS_NAME: Record<Lens, string> = { default: 'Default', safe: 'SAFe', flow: 'Flow Framework' }
