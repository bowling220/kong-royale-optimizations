# Kong Royale — Optimization & Quality Lab

Standalone public showcase site for Kong Royale's graphics presets (**Low / Medium / High / Ultra**), real benchmark results (`main` vs. `optimization`), CI-enforced memory/download budgets, and active optimization test queue.

## Updating results as new tests finish

1. Update numbers in `data.json` (benchmarks, system specs, budgets).
2. Drop new WebP/PNG captures into `images/presets/{low,medium,high,ultra}/` or `images/opt/`.
3. Commit and push to `main` — GitHub Pages automatically redeploys the live site.
