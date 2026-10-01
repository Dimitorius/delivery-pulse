// Shape of every SYNTHETIC series (catalog status synthetic / featured that
// the simulator does not produce). These are illustrative, plausible ranges
// for a healthy ("elite") organisation — NOT benchmarks and never coloured
// against a target. Values are per team; the program value aggregates teams.

export interface SynthSpec {
  unit: string
  decimals: number
  /** Typical value of one team. */
  base: number
  /** Additive spread (absolute units) — or, with `log`, the log-space sigma (fat right tail, for times). */
  sd: number
  log?: boolean
  min?: number
  max?: number
  /** How the program value combines teams: counts add up, everything else is the median. */
  agg: 'sum' | 'median'
  /** A new value every N weeks (surveys monthly = 4, quarterly = 13). */
  every?: number
  /** Week-to-week persistence of the noise (0..1). */
  phi?: number
  /** Linear drift per week (absolute units). */
  drift?: number
  /** Quarter progress: climbs within each 13-week quarter, then resets (OKR progress). */
  quarter?: boolean
  /** What exactly the number is, when the name alone is ambiguous. */
  what?: string
  /** Show a sign (+/−): variances. */
  signed?: boolean
}

const pct = (base: number, sd: number, o: Partial<SynthSpec> = {}): SynthSpec => ({ unit: '%', decimals: 0, base, sd, min: 0, max: 100, agg: 'median', ...o })
const cnt = (unit: string, base: number, sd: number, o: Partial<SynthSpec> = {}): SynthSpec => ({ unit, decimals: 0, base, sd, min: 0, agg: 'sum', ...o })
const time = (unit: string, base: number, sigma: number, o: Partial<SynthSpec> = {}): SynthSpec => ({ unit, decimals: 1, base, sd: sigma, log: true, agg: 'median', ...o })
const num = (unit: string, base: number, sd: number, decimals: number, o: Partial<SynthSpec> = {}): SynthSpec => ({ unit, decimals, base, sd, min: 0, agg: 'median', ...o })
const fav = (base: number, o: Partial<SynthSpec> = {}) => pct(base, 3, { every: 4, phi: 0.5, what: 'share of favourable survey answers', ...o })

export const SYNTH_SPECS: Record<string, SynthSpec> = {
  // Flow
  'arrival-rate': cnt('items/wk', 7, 2),
  'time-in-status': time('d', 1.2, 0.25, { what: 'median days items spend in the slowest stage' }),
  'handoffs-per-item': num('handoffs', 3.2, 0.3, 1),
  'batch-size': num('items/release', 4, 1, 1),
  'wip-per-person': num('items', 1.6, 0.2, 1, { what: 'team WIP ÷ team size (never per name)' }),
  'wip-limit-breaches': cnt('breaches/wk', 1, 0.8),
  'throughput-variability': pct(30, 5, { what: 'coefficient of variation of weekly throughput' }),
  'cycle-time-tail-ratio': num('×', 2.2, 0.3, 1, { min: 1, what: 'cycle time P85 ÷ P50' }),
  // Scrum
  'velocity-variability': pct(15, 4, { every: 2, what: 'coefficient of variation of sprint velocity' }),
  'focus-factor': num('ratio', 0.65, 0.05, 2, { every: 2, max: 1 }),
  'capacity-availability': pct(85, 4, { every: 2 }),
  'estimation-accuracy': pct(70, 6, { every: 2, what: 'items finished within their estimate band' }),
  'retro-action-completion': pct(65, 8, { every: 2 }),
  'dod-compliance': pct(94, 3),
  'sprint-review-engagement': pct(70, 8, { every: 2, what: 'invited stakeholders who attended and gave feedback' }),
  // Backlog
  'ready-backlog-depth': num('sprints', 1.8, 0.3, 1),
  'backlog-size-trend': cnt('items', 120, 6, { phi: 0.95, drift: 0.05 }),
  'stale-backlog': cnt('items', 25, 4, { what: 'backlog items untouched for 90+ days' }),
  'dor-pass-rate': pct(85, 5),
  'requirements-volatility': pct(8, 3, { what: 'started items whose acceptance criteria changed' }),
  'item-size-distribution': pct(10, 3, { what: 'share of ready items above the team’s split threshold' }),
  // Delivery
  'release-frequency': num('per month', 4, 1, 0, { every: 4 }),
  'rollback-rate': pct(2, 1, { decimals: 1 }),
  'hotfix-rate': pct(3, 1.5, { decimals: 1 }),
  'time-to-market': time('d', 45, 0.2, { every: 4, decimals: 0 }),
  'change-approval-time': time('h', 2, 0.5),
  'review-iterations': num('rounds', 1.4, 0.15, 1, { min: 1 }),
  'unreviewed-merges': pct(1, 0.8, { decimals: 1 }),
  'pr-throughput': cnt('PRs/wk', 18, 4),
  'stale-prs': cnt('PRs', 2, 1, { what: 'open pull requests without activity for 3+ days' }),
  'review-load-balance': pct(45, 6, { what: 'share of reviews done by the two busiest reviewers (team level, no names)' }),
  'time-to-fix-build': time('min', 35, 0.4, { decimals: 0 }),
  'test-coverage-trend': pct(78, 1, { phi: 0.97, drift: 0.02 }),
  // Quality
  'open-bug-trend': cnt('bugs', 14, 3),
  'defect-removal-efficiency': pct(92, 2),
  'time-to-fix-defects': time('d', 3, 0.3, { what: 'median days to fix (all severities)' }),
  'defect-density': num('per KLOC', 0.4, 0.1, 2),
  'tech-debt-trend': cnt('items', 40, 4, { phi: 0.95 }),
  'tech-debt-ratio': pct(4, 0.4, { decimals: 1 }),
  // Reliability
  mttd: time('min', 6, 0.4),
  'error-budget-remaining': pct(65, 10),
  'repeat-incident-rate': pct(10, 5),
  availability: pct(99.95, 0.03, { decimals: 2, min: 99, max: 100 }),
  'on-call-load': num('pages/shift', 1.2, 0.4, 1),
  mtbf: time('d', 21, 0.3, { decimals: 0 }),
  'toil-share': pct(25, 4, { every: 4 }),
  // Security
  'vulnerability-mttr': time('d', 9, 0.3),
  'vuln-sla-compliance': pct(92, 4),
  'open-critical-vulns': cnt('vulns', 0.4, 0.6),
  'security-debt': cnt('items', 3, 1.5, { what: 'known security items past their due date' }),
  'dependency-freshness': num('libyears', 12, 1.5, 1, { phi: 0.97 }),
  // Program
  'dependency-count-trend': cnt('deps', 6, 2, { what: 'open cross-team dependencies' }),
  'external-dependency-ratio': pct(12, 3),
  'open-risks': cnt('risks', 1.2, 0.8, { what: 'open high risks' }),
  'decision-latency': time('d', 3, 0.4),
  'escalation-age': time('d', 4, 0.5),
  'action-item-closure': pct(80, 6),
  'milestone-slippage': num('d', 2, 2, 1),
  'interrupt-rate': cnt('per wk', 3, 1),
  // Scale (featured): self-assessments, quarterly
  'safe-competency': num('score', 3.6, 0.15, 1, { every: 13, min: 1, max: 5, what: 'self-assessment score on a 1–5 scale' }),
  'devops-health-radar': num('score', 3.4, 0.2, 1, { every: 13, min: 1, max: 5, what: 'self-assessment score on a 1–5 scale' }),
  // Value
  'ebm-unrealized-value': num('pts', 60, 3, 0, { every: 4, max: 100, what: 'unrealized-value index (0–100)' }),
  'innovation-rate': pct(58, 4),
  'feature-adoption': pct(42, 8, { every: 4 }),
  'feature-usage-index': pct(64, 4, { every: 4 }),
  'okr-progress': pct(70, 4, { quarter: true, what: 'average key-result progress in the current quarter' }),
  'okr-attainment': pct(70, 8, { every: 13 }),
  csat: pct(82, 3, { every: 4 }),
  nps: num('NPS', 38, 5, 0, { every: 13, min: -100, max: 100 }),
  'support-ticket-inflow': cnt('tickets/wk', 24, 4),
  'customer-reported-defects': cnt('per wk', 1.5, 0.8),
  'time-to-value': time('d', 14, 0.25, { every: 4, decimals: 0 }),
  'cost-of-delay': time('k€/wk', 30, 0.4, { decimals: 0, what: 'cost of delay of the top backlog item' }),
  'experiment-success-rate': pct(33, 8, { every: 4 }),
  // People (team-level surveys, monthly)
  'devex-flow-state': fav(68),
  'devex-feedback-loops': fav(72),
  'devex-cognitive-load': fav(60),
  'perceived-delivery-rate': fav(70),
  'focus-time': num('h/day', 3.2, 0.3, 1),
  'meeting-load': pct(22, 3),
  'regrettable-attrition': pct(4, 1.5, { every: 4, decimals: 1, what: 'annualised regrettable attrition' }),
  'time-to-10th-pr': time('d', 24, 0.3, { every: 4, decimals: 0 }),
  'knowledge-concentration': cnt('components', 2, 0.8, { every: 4, what: 'components only one person can change' }),
  'team-stability': pct(92, 3, { every: 13, what: 'members unchanged over the quarter' }),
  'space-satisfaction': fav(74),
  'psychological-safety': fav(78),
  'after-hours-work': pct(6, 2, { decimals: 1, what: 'share of commits outside working hours (team level)' }),
  interruptions: num('per day', 4, 0.8, 1),
  // Finance
  spi: num('ratio', 1, 0.05, 2),
  'cost-variance': cnt('k€', 5, 15, { decimals: 0, min: undefined, signed: true }),
  'schedule-variance': cnt('k€', -3, 15, { decimals: 0, min: undefined, signed: true }),
  eac: cnt('k€', 480, 10, { phi: 0.95 }),
  tcpi: num('ratio', 1, 0.04, 2),
  'budget-burn-rate': cnt('k€/wk', 9, 0.8, { decimals: 1 }),
  'cost-per-item': num('k€', 2.4, 0.3, 1),
  'cloud-cost-per-service': cnt('k€/month', 18, 1.5, { every: 4, drift: 0.05, decimals: 1 }),
  'rd-share-of-revenue': pct(18, 0.5, { every: 13, decimals: 1 }),
  'capex-opex-split': pct(55, 3, { every: 4, what: 'share of effort capitalised (CapEx)' }),
  // AI
  'ai-tool-adoption': pct(78, 3, { drift: 0.05 }),
  'ai-time-savings': num('h/wk', 3.5, 0.5, 1, { every: 4 }),
  'ai-suggestion-acceptance': pct(28, 3),
  'ai-change-review-time': num('×', 1.15, 0.08, 2, { what: 'review time of AI-assisted PRs ÷ other PRs' }),
}
