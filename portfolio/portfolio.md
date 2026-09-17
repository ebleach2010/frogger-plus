# Buy-and-Hold vs. InTheMoney: A $500 Three-Engine Portfolio

*Portfolio memo, September 16, 2026, revised September 17. Markdown source of `Buy-and-Hold-vs-InTheMoney-Sept-2026.pdf`. Sources for every figure are in `research-notes.md`. Educational research, not individualized investment advice.*

## The bet in one sentence

Three engines instead of one (AI compute, the GLP-1 franchise, and the electricity AI runs on), rebalanced mechanically inside wide bands. It should compound at least as fast as a single concentrated AI bet, keeps working when AI capex pauses, and needs almost none of the trading.

## What InTheMoney holds (Autopilot "Actively Managed", screenshot Sept 16, 2026)

| Ticker | Weight | Ticker | Weight |
|---|---|---|---|
| MU | 12% | AVGO | 6% |
| NVDA | 12% | META | 6% |
| AMD | 12% | LRCX | 5% |
| TSM | 10% | AMZN | 4% |
| MSFT | 9% | FRO | 4% |
| GOOGL | 9% | VLO | 3% |
| ASML | 6% | AEM | 3% |

Roughly 94% AI semiconductors and megacap platforms, 7% tankers, refining and gold, zero healthcare, zero power or grid (app percentages sum to 101 from rounding). 2026 has been exceptional for it: MU about +256% YTD, AMD about +135%, VLO about +141%, LRCX about +55%, ASML about +48%.

## The portfolio as entered: 17 positions, no sells

The account already held twelve positions worth $259.63 that express most of this thesis. Rather than sell five of them to rebuild, the $241 deposit goes entirely to buys, and the four names outside the plan (VOO, HIMS, WST, AMZN) are never added to again. They shrink into rounding errors as deposits arrive; selling them is optional, never required. Zero tax events.

**The twelve orders** (dollar-amount fractional buys): LLY $42, NVO $35, GEV $25, CEG $25, SGOV $25, AMGN $20, NVDA $15, TSM $15, VRT $15, AVGO $12, MSFT $11, GPCR $1. Total $241.00. Nothing sold.

Bands are per position: core names have an add-first level at half their target and a trim level at twice it (trim back to 1.5x). Legacy and speculative names have no add level and are trimmed if they double. The workbook's Quarterly check tab does the arithmetic.

### Engine one: AI compute and platforms, 39% ($195)

| Ticker | Weight | Target | Add first below | Trim above | Back to | Role |
|---|---|---|---|---|---|---|
| NVDA | 10.8% | 11% | 5.5% | 22% | 16.5% | Accelerator leader; supply-constrained through FY28 |
| TSM | 7.7% | 8% | 4% | 16% | 12% | Leading-edge foundry, ~72% share |
| AMD | 6.7% | 7% | 3.5% | 14% | 10.5% | Direct chip bet, kept rather than swapped for SMH |
| MSFT | 5.4% | 5% | 2.5% | 10% | 7.5% | Azure +43%; steadiest cash flow |
| AVGO | 5.0% | 5% | 2.5% | 10% | 7.5% | Custom AI silicon and networking |
| AMZN | 3.2% | legacy | never | 6% | 3% | AWS exposure; never add |

### Engine two: GLP-1 / obesity, 36% ($180)

| Ticker | Weight | Target | Add first below | Trim above | Back to | Role |
|---|---|---|---|---|---|---|
| LLY | 15.7% | 16% | 8% | 32% | 24% | Category leader |
| NVO | 7.0% | 7% | 3.5% | 14% | 10.5% | Contrarian second source |
| AMGN | 4.0% | 4% | 2% | 8% | 6% | MariTide monthly dosing, dividend payer |
| GPCR | 2.0% | 2% | never | 6% | 3% | Speculative oral GLP-1 in Phase 3 |
| HIMS | 3.7% | legacy | never | 8% | 4% | Distributor, not developer |
| WST | 3.6% | legacy | never | 8% | 4% | Pen components at ~30x |

### Engine three: power and grid, 15% ($75)

| Ticker | Weight | Target | Add first below | Trim above | Back to | Role |
|---|---|---|---|---|---|---|
| VRT | 5.1% | 5% | 2.5% | 10% | 7.5% | Data-center power and liquid cooling |
| GEV | 5.0% | 5% | 2.5% | 10% | 7.5% | Turbines, transformers, switchgear. **Not price-checked; chart-check before buying** |
| CEG | 5.0% | 5% | 2.5% | 10% | 7.5% | Largest US nuclear fleet. **Not price-checked; chart-check before buying** |

### Other, 10% ($51)

| Ticker | Weight | Target | Rule |
|---|---|---|---|
| VOO | 5.2% | legacy | Never add; trim above 10% back to 7.5% |
| SGOV | 5.0% | 5% | Reservoir; refill to 5% whenever below 3% |

**Total: 100%, $500.63 after the deposit.** A clean-sheet 14-position version (SMH for AMD, GOOGL for AMZN, VKTX added, legacy names sold) is in the git history for anyone starting from cash.

## Why it can win over the long run

1. **Two uncorrelated growth engines.** GLP-1 revenue depends on prescriptions and pricing, not on hyperscaler capex.
2. **Less blow-up risk in the same theme.** His book has 36% in MU, AMD and NVDA after memory margins hit 85%. SMH plus the toll collectors captures the upside with 25 names.
3. **Bands sell strength and buy weakness automatically.** A band rule is right on average, and a 5% T-bill reservoir funds it without selling a winner.
4. **A chokepoint he does not own.** Every data center in the capex numbers needs electricity. Turbines and transformers are backlogged for years; nuclear output is contracted a decade out. Vertiv, GE Vernova and Constellation collect that toll; his book has zero exposure.
5. **Lower cost and lower taxes.** No subscription, no adviser layer, a handful of trades a year.

**Honest caveat.** If AI keeps melting up, a 94% AI book beats this one. This version deliberately carries no gold or energy ballast: it is built to race, and when AI corrects it will fall harder than a ballasted book because the power names fall with the chips. Judge both on a rolling three-year total-return basis.

## Macro backdrop (Sept 16, 2026)

- **Fed:** +25 bp to 3.75 to 4.00%, unanimous, first hike since July 2023. Warsh: inflation "too high, for too long." 16 of 18 participants see at least one more hike; median path one more in 2026, one in 2027. 10-year Treasury ~5.0%, highest since 2007.
- **Inflation:** August CPI +0.4% m/m, 3.4% y/y; core +0.3% m/m, 2.4% y/y (lowest since 2021). Gasoline +3.9% m/m, +27% y/y, more than a third of the monthly rise. Shelter easing to 3.0%. PPI +5.4% y/y, energy three quarters of the rise. Energy inflation is also what is repricing electricity, the tailwind behind the Constellation position.
- **Valuation:** S&P 500 ~7,550, +12% YTD; forward P/E ~19x, down from 22.5x in January on 30%+ earnings growth. Morgan Stanley target 8,000 YE / 8,300 mid-2027. Capital Economics: "consistent with a late-stage bubble," 8,250 YE then -21% in 2027.
- **AI risk event:** Sept 12 "We Must Pace the Frontier" essay; OpenAI IPO pushed to 2027; chips fell Sept 14 (MU -5%, AMD -5 to -6%, AVGO -3%, NVDA -2%).

## Engine one: AI compute (45%)

Big-4 hyperscaler 2026 capex ~$725 to 765B (+77%), consensus 2027 near $1T. GOOGL $195 to 205B, MSFT FY27 $255 to 260B, AMZN ~$220B, META $135 to 145B. Cloud backlogs: Google $514B, AWS $496B. NVDA supply commitments $279B. Toll collectors (NVDA, TSM, AVGO) over cyclical inputs (memory, equipment), which SMH holds at ~5% each.

**Thesis-break signals:** hyperscaler capex declining y/y; chip tariffs "phase two"; China export-control loophole closure (NVDA guides zero China DC already); 10-year above 5%; an industry-led slowdown showing up in orders.

## Engine two: GLP-1 / obesity (35%)

Class sales ~$132B in 2025 (+33%); 2030 forecasts $114B (Goldman, obesity) to $200B (J.P. Morgan, incretins). Oral drugs went from zero to ~206k weekly US scripts in under a year. Lilly leads (Zepbound beat CagriSema; Foundayo approved April 1; retatrutide up to 30.3% weight loss). Novo priced for permanent decline (12x trailing) despite oral Wegovy share and six Phase 3 amycretin trials. Next wave is dosing and delivery: monthly injections (AMGN MariTide, Pfizer berobenatide) and daily pills (GPCR aleniglipron, VKTX oral, AZN elecoglipron). Over $50B of obesity M&A since 2025.

| Asset (holder) | Stage / registry | Key number | Next catalyst |
|---|---|---|---|
| Retatrutide (LLY) | Ph3 complete, NCT05929066 | 30.3% at 80 wk | H2H vs tirzepatide Nov 2026 |
| Foundayo (LLY) | Approved Apr 1, 2026 | 34k weekly Rx (July) | EASD Oct 1 |
| Wegovy pill (NVO) | Approved Dec 2025 | ~172k weekly Rx | EU rollout; EASD Sept 28 to Oct 2 |
| Amycretin (NVO) | Ph3 AMAZE 1 to 8, NCT07339423 | ~22 to 24% at 36 wk | 2028 to 2029 |
| MariTide (AMGN) | Ph3 MARITIME-1/2, NCT06858839 | ~20% at 52 wk | Topline 1H 2027 |
| VK2735 (VKTX) | Ph3 VANQUISH-1/2, NCT07104500 | Oral 12.2% at 13 wk | Q3 2026 maintenance data |
| Aleniglipron (GPCR) | Ph3 ACCOMPLISH-1/2, NCT07654361 | ~16% pbo-adj at 44 wk | ~2028 |

**Thesis-break signals:** US net price cut >40% (MFN deal already set Medicare at $245/month); ex-US semaglutide generics (Canada, China 2026); class-wide safety label; single-trial failure (why VKTX + GPCR are capped at 4%).

## Engine three: power and grid (15%)

Hyperscaler capex buys chips that have to be plugged in. Interconnection queues run years, gas-turbine order books are sold out into the next decade, and the existing nuclear fleet is being contracted to data centers on 20-year terms. InTheMoney owns the chips and the clouds and none of the electricity. Vertiv is the rack-level power and cooling, GE Vernova the turbines and grid gear, Constellation the nuclear megawatts. Correlated with AI on the way up, with a second driver (grid replacement, electrification) that continues if AI capex pauses.

**Thesis-break signals:** hyperscaler capex decline (kill switch A halves this sleeve too); a regulator blocking data-center co-location deals with nuclear plants (halve CEG into SGOV); turbine backlogs unwinding.

## Rules

- **Rule 1, cadence.** Check quarterly (mid-January, April, July, October). Fifteen minutes. If nothing is triggered, close the app.
- **Rule 2, per-position bands.** Above a name's trim level, sell back to 1.5x target; cash goes to SGOV until it is 5%, then to the name furthest below target. Legacy and speculative names are never added to and are trimmed if they double. SGOV is refilled to 5% whenever it falls under 3%.
- **Rule 3, the one sleeve check.** If NVDA, TSM, AMD, AVGO, MSFT and AMZN together exceed 55% of the account, trim the largest until the group is 50%. The chip names rise together and each can sit just under its own cap while the book is two-thirds chips. This is the only sleeve arithmetic in the plan.
- **Rule 4, new money.** Every deposit goes to the core name with the lowest weight divided by target. Never to a legacy or speculative name. This converges the portfolio without selling.

### Kill switches (thesis triggers, not price triggers)

- **A, AI.** Two or more top-five hyperscalers guide capex down y/y, or NVDA data-center revenue declines two consecutive quarters. Cut the AI group to 25% (AMD and AMZN first, then pro rata) and halve the power sleeve (VRT and GEV before CEG); proceeds to VOO and SGOV half and half.
- **B, GLP-1.** US branded net pricing cut >40% by law or negotiation, or a class-wide safety label change. Cut the GLP-1 group to 20%; keep LLY and AMGN, exit GPCR, HIMS and WST, halve NVO; proceeds to VOO and SGOV.
- **C, macro.** Fed funds above 5%. Raise SGOV to 15% from the overweight names. Reverse after two cuts.
- **Position failure.** If GPCR halves on a trial failure, do nothing. If acquired, cash goes to the GLP-1 names at target weights. If a regulator blocks nuclear co-location deals, halve CEG into SGOV.

### Quarterly checklist

1. Type today's position values into the workbook's Quarterly check tab.
2. Any row says TRIM? Sell to the "back to" level, cash to SGOV first.
3. AI group above 55%? Trim the largest.
4. Did a kill-switch trigger actually occur (a guide, a filing, a label), not a headline?
5. Close the app.

## Revision note

The first draft (Sept 16) held 45% AI, 40% GLP-1 (with PFE and WST at 3% each), and 15% ballast in GLDM, XLE and SGOV. It was revised on Sept 17 after the question "is there a version that better fits a hold-and-outperform challenge": the gold and energy ballast was a structural drag in a return race, and the power-and-grid chokepoint is a thesis InTheMoney's book does not cover. The ballasted version remains in the git history for anyone who prefers the smaller drawdown. Later on Sept 17 the entry path was changed to buys-only on top of the existing 12-position account (AMD kept instead of SMH, AMZN kept instead of GOOGL, VKTX not bought, legacy names never added to), and the sleeve bands were replaced with per-position bands plus a single AI-group ceiling.
