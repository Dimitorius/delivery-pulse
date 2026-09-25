# Registry

Source of truth for metric metadata (SPEC §8): one YAML file per metric.
The compute function with the same `id` lives in `src/metrics/defs/`, and its
hand-computed reference test in `src/metrics/reference.test.ts`
(`describe('metric:<id>')`). `src/metrics/registry.test.ts` fails if any of
the three is missing.

Benchmarks need ≥ 2 independent sources; otherwise set `flag: "⚠ …"` so
Dmitry makes the final call.
