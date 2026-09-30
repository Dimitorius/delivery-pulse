// The fictional organisation (SPEC §3): one program on an e-commerce payments
// platform, four stream-aligned teams (one on Kanban) and one platform team.

import type { Program, Team } from '../domain/model'

export const PROGRAM: Program = { id: 'commerce', name: 'Commerce Platform' }

export const TEAMS: Team[] = [
  { id: 'checkout', key: 'CHK', name: 'Checkout', method: 'scrum', kind: 'stream', service: 'checkout-web', devs: 6, qa: 1 },
  { id: 'payments', key: 'PAY', name: 'Payments', method: 'scrum', kind: 'stream', service: 'payments-api', devs: 6, qa: 1 },
  { id: 'catalog', key: 'CAT', name: 'Catalog & Search', method: 'scrum', kind: 'stream', service: 'catalog-svc', devs: 5, qa: 1 },
  { id: 'onboarding', key: 'ONB', name: 'Merchant Onboarding', method: 'kanban', kind: 'stream', service: 'onboarding-portal', devs: 4, qa: 1 },
  { id: 'platform', key: 'PLT', name: 'Platform', method: 'scrum', kind: 'platform', service: 'platform-core', devs: 5, qa: 1 },
]

/** Vocabulary for believable item titles. */
export const VOCAB: Record<string, { features: string[]; objects: string[] }> = {
  checkout: {
    features: ['Express checkout', 'Guest checkout v2', 'Saved carts', 'Promo engine', 'Address autocomplete', 'One-click reorder', 'Checkout localisation', 'Delivery slots'],
    objects: ['cart summary', 'promo code field', 'shipping step', 'order review page', 'Apple Pay button', 'tax breakdown', 'gift card input', 'address form', 'order confirmation email', 'checkout analytics'],
  },
  payments: {
    features: ['Split payments', '3-D Secure 2.2', 'Refund automation', 'Payout reconciliation', 'Local payment methods', 'Chargeback workflow', 'Card vault migration', 'Payment retries'],
    objects: ['authorisation flow', 'refund API', 'webhook handler', 'settlement report', 'card tokenisation', 'fraud score check', 'currency conversion', 'payout scheduler', 'ledger entries', 'PSP adapter'],
  },
  catalog: {
    features: ['Faceted search', 'Search relevance tuning', 'Product bundles', 'Variant pricing', 'Catalog import v3', 'Recently viewed', 'Stock badges', 'Synonym dictionary'],
    objects: ['search index', 'facet filters', 'product page', 'price feed', 'image pipeline', 'autocomplete', 'category tree', 'sorting options', 'stock sync job', 'SEO metadata'],
  },
  onboarding: {
    features: [],
    objects: ['KYC document upload', 'merchant signup form', 'contract e-signature', 'bank account check', 'onboarding checklist', 'risk questionnaire', 'welcome email', 'merchant settings page', 'VAT validation', 'store preview'],
  },
  platform: {
    features: ['Service mesh rollout', 'Observability stack', 'Feature flag service', 'CI runners upgrade', 'Secrets rotation', 'Rate limiting', 'Event bus v2', 'Database failover'],
    objects: ['deploy pipeline', 'metrics exporter', 'auth gateway', 'rate limiter', 'feature flag SDK', 'Kubernetes cluster', 'log retention', 'alert rules', 'event bus client', 'config service'],
  },
}

export const STORY_VERBS = ['Add', 'Improve', 'Redesign', 'Refactor', 'Speed up', 'Validate', 'Localise', 'Instrument', 'A/B test', 'Harden']
export const BUG_SYMPTOMS = ['fails on Safari', 'shows wrong rounding', 'times out under load', 'drops query params', 'double-submits', 'breaks on long names', 'returns 500 intermittently', 'ignores locale']
export const DEBT_TASKS = ['Remove dead code in', 'Upgrade dependencies of', 'Add tests for', 'Split module:', 'Migrate config of', 'Clean up logging in']

export const POSTMORTEM_ACTIONS = [
  'add alert on error budget burn',
  'add canary step to the deploy pipeline',
  'write runbook for the failure mode',
  'add contract test for the dependency',
  'raise test coverage of the failing path',
  'add feature flag kill switch',
  'tune autoscaling limits',
]

/** Risk register: plausible, distinct risks per team (each used once, in order). */
export const RISKS_BY_TEAM: Record<string, string[]> = {
  checkout: [
    'Black Friday traffic may exceed checkout capacity',
    'New EU address rules may require a redesign of the address form',
    'Apple Pay certificate renewal may lapse',
    'A/B test tooling contract ends mid-PI',
    'Promo engine rewrite depends on a pricing API still in beta',
    'Only one engineer knows the tax calculation module',
    'Browser change to third-party cookies may break the cart',
    'Translation vendor may miss the localisation deadline',
  ],
  payments: [
    'PSP contract renewal may slip past the PI',
    'PSD2 strong customer authentication update due this quarter',
    'Card scheme fee change may alter routing rules',
    'Fraud model retraining may lower approval rates',
    'Settlement bank changes its file format',
    'PCI DSS audit may find gaps in the card vault migration',
    'Refund backlog if the automation launch slips',
    'FX rate provider deprecates its v1 API',
  ],
  catalog: [
    'Search vendor price increase may force a migration',
    'Largest merchant plans a 10× catalog import',
    'Image CDN contract ends next quarter',
    'Relevance tuning needs data science time that is not secured',
    'Stock sync depends on warehouse API rate limits',
    'SEO ranking may drop during the URL change',
    'Only one engineer can operate the search cluster',
    'GDPR request volume may slow catalog exports',
  ],
  onboarding: [
    'KYC provider may change pricing',
    'New AML rules may add onboarding steps',
    'E-signature vendor outage history',
    'Bank account verification API sunset announced',
    'Merchant sign-up spike after the marketing campaign',
    'Legal review of the new contract template may be late',
    'Risk questionnaire changes need compliance sign-off',
    'Support team capacity for manual reviews',
  ],
  platform: [
    'Kubernetes version end-of-life before the upgrade',
    'Cloud reserved-instance renewal decision due',
    'Observability vendor licence cap may be reached',
    'Database failover untested at peak load',
    'Secrets rotation may break legacy services',
    'CI runner capacity during release weeks',
    'Event bus v2 migration touches every team',
    'On-call rotation thin during the holiday period',
  ],
}

/** Requests per hour at peak for each team's service (SLI simulation). */
export const SERVICE_TRAFFIC: Record<string, number> = {
  checkout: 18_000,
  payments: 12_000,
  catalog: 40_000,
  onboarding: 2_000,
  platform: 60_000,
}

/** Suffixes for follow-up features after the base feature names are used up. */
export const FEATURE_SUFFIXES = ['mobile', 'EU rollout', 'B2B', 'v2', 'accessibility', 'performance', 'analytics', 'partners', 'APAC', 'wallets', 'self-service', 'hardening']

/** Business outcomes used as PI objective titles (cycled per team). */
export const PI_OUTCOMES: Record<string, string[]> = {
  checkout: [
    'Lift mobile checkout conversion',
    'Cut cart abandonment on the shipping step',
    'Launch express checkout for returning customers',
    'Make checkout available in two new EU markets',
    'Reduce failed promo-code redemptions',
    'Speed up the order review page',
    'Enable guest checkout for marketplace sellers',
    'Improve accessibility of the payment step',
  ],
  payments: [
    'Reduce card authorisation declines',
    'Automate refunds end to end',
    'Pass the 3-D Secure 2.2 compliance review',
    'Add local payment methods for the Nordics',
    'Shorten merchant payout time',
    'Lower chargeback handling cost',
    'Retire the legacy card vault',
    'Make payment retries self-healing',
  ],
  catalog: [
    'Improve search relevance for top queries',
    'Launch product bundles for merchants',
    'Keep stock badges accurate in real time',
    'Speed up catalog imports for large merchants',
    'Grow product page SEO traffic',
    'Support variant-level pricing',
    'Reduce zero-result searches',
    'Make catalog images load faster on mobile',
  ],
  platform: [
    'Give every team self-service feature flags',
    'Complete the observability stack rollout',
    'Make database failover automatic',
    'Cut CI runner queue time',
    'Rotate all secrets automatically',
    'Move services to the event bus v2',
    'Introduce rate limiting at the edge',
    'Upgrade the Kubernetes clusters without downtime',
  ],
  onboarding: ['Shorten merchant onboarding time'],
}
