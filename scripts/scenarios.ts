// Dev helper: inject each scenario and print when every early and confirming
// signal reacts (working days after injection), at the two injection points
// the tests use. Run: npm run scenarios [-- <scenario-id>]
import { checkScenario, INJECT_POINTS, leadsLag, scenarioSignals } from '../src/app/scenarioCheck'
import { SCENARIOS } from '../src/sim/scenarios'

const only = process.argv[2]
for (const sc of SCENARIOS.filter((s) => !only || s.id === only)) {
  for (const p of INJECT_POINTS) {
    const rs = checkScenario(sc.id, { injectW: p.w })
    const fmt = (g: string) => rs.filter((r) => r.group === g).map((r) => `${r.id}${r.worse === 'up' ? '↑' : '↓'} ${r.days === null ? '—' : r.days.toFixed(1) + 'd'}`).join(', ')
    console.log(`${leadsLag(rs) ? '✅' : '❌'} ${sc.id.padEnd(27)} ${p.label.padEnd(10)} ${scenarioSignals(sc.id).fromContent ? '[content]' : '[default]'} early: ${fmt('early')} | confirming: ${fmt('confirming')}`)
  }
}
