// Framework lens (SPEC §6): rename the UI into SAFe or Flow Framework
// vocabulary; metrics with no named equivalent in the lens are dimmed.

import type { MetricDef } from '../metrics/registry'
import type { Lens } from './state'

export function lensAka(def: MetricDef, lens: Lens) {
  return lens === 'default' ? undefined : def.aka?.[lens]
}

export function displayName(def: MetricDef, lens: Lens, short = false): string {
  return lensAka(def, lens)?.name ?? (short ? def.short : def.name)
}

export function dimmed(def: MetricDef, lens: Lens): boolean {
  return lens !== 'default' && !lensAka(def, lens)
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
