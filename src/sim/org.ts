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

export const RISK_TITLES = [
  'PSP contract renewal may slip',
  'Key engineer leaving',
  'Peak season traffic above capacity',
  'Regulatory change to payment authentication',
  'Vendor API deprecation',
  'Data migration may exceed maintenance window',
  'Security audit findings',
  'Cross-team dependency on Platform at risk',
]

/** Requests per hour at peak for each team's service (SLI simulation). */
export const SERVICE_TRAFFIC: Record<string, number> = {
  checkout: 18_000,
  payments: 12_000,
  catalog: 40_000,
  onboarding: 2_000,
  platform: 60_000,
}
