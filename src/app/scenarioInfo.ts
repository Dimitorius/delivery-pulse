// Joins the simulator scenarios with the Diagnose symptoms (content): the
// symptom name is what the screen says ("Scenario active: …"), the simulator
// label is only the event-log name.

import { PLAYBOOK_BY_ID, SYMPTOMS, type SymptomIndexEntry } from '../content/symptoms'
import { SCENARIO_BY_ID, type ScenarioDef } from '../sim/scenarios'

export interface ScenarioInfo {
  def: ScenarioDef
  symptom: SymptomIndexEntry
  hasPlaybook: boolean
}

export const SCENARIO_INFO: ScenarioInfo[] = SYMPTOMS.filter((s) => s.scenario && SCENARIO_BY_ID.has(s.scenario)).map((symptom) => ({
  def: SCENARIO_BY_ID.get(symptom.scenario!)!,
  symptom,
  hasPlaybook: PLAYBOOK_BY_ID.has(symptom.id),
}))

export const scenarioInfo = (scenarioId: string) => SCENARIO_INFO.find((s) => s.def.id === scenarioId)
