# Project Brief — Personal Day-Trading Dashboard ("The Process")

## 1. Summary

A personal, single-user web app that supports pre-trade discipline, trade logging, performance analytics, and stock/options research for one active day trader. This document is a complete functional specification, intended to be built from scratch — every formula, threshold, and behavior needed to implement each feature is spelled out below.

**Not a SaaS product.** This is being built for one user's own trading. No multi-tenancy, no public signup, no billing.

## 2. Goals

- A single coherent multipage app (shared shell/nav/state — not disconnected pages) that slows the user down before a bad trade, and tells them the truth about their own track record afterward.
- Trade history lives entirely inside the app — one system, not a spreadsheet plus a separate tracker that have to be kept in sync by hand.
- No market-data credentials or secrets exposed to the browser at any point.

## 3. Non-Goals

- No user accounts, login, or multi-device sync. Single device is the target (per product decision — see §8).
- No real money movement, brokerage integration, or order execution. This is a pre-trade and post-trade tool, not a trading platform.
- No investment advice. Every research/verdict feature is explicitly a screening aid, not a recommendation — this framing and disclaimer should run throughout the product's copy.
- Not being built for other users or resale at this stage.

## 4. Target User

One active day trader (stocks + options) who wants a daily/pre-trade working tool, not a beginner-onboarding product — though the language throughout should stay plain-English and jargon-free, since it needs to be usable and fast to read under pressure, not just on first use.

## 5. Information Architecture

A true multipage app with shared nav, layout, and a shared local data layer. Suggested grouping below — the developer may restructure freely (e.g. combining the Screener and Stock Analyzer into one "Research" page, or splitting the Trade Cockpit's sub-tools across more pages) as long as every feature in §6 exists somewhere and is reachable in ≤2 clicks from any page.

- **Trade Cockpit** — pre-trade discipline tools (checklist, position sizer, options tools)
- **Daily Guardrail** — same-day circuit breaker and result logging
- **Trade Log** — the permanent, all-time trade record
- **Analytics Dashboard** — auto-generated performance analysis, read from the Trade Log
- **Screener** — multi-stock fundamental grading
- **Stock Analyzer** — single-stock research read (fundamental + technical + verdict)
- **Reference** — dictionary and a risk-of-ruin simulator
- Shared: global nav, a live price ticker

## 6. Detailed Feature Specifications

### 6.1 Shared Elements
- **Live price ticker**, present on every page: a rotating set of roughly 10 stock symbols with live price and % change, refreshing about every 30 seconds. If the market-data source is unreachable, fall back to the last known (or clearly-labeled demo) prices, and always show the user which state they're looking at ("live" vs. "demo/last known").
- **Account Settings**, a single persistent record (account size in $, default risk per trade in %), editable from one place. The Position Sizer (§6.2.3) and Options Contract Ticket (§6.2.4) both prefill from these values, and both allow a per-calculation override for a one-off "what if" without changing the standing default. The Trade Log's "max dollar risk" column (§6.4) uses whichever account size/risk % were actually in effect on the tool at the moment that specific row was logged — so an override doesn't retroactively change past rows, but it also isn't silently lost. This keeps risk % behaving as the standing rule the rest of the product treats it as, rather than something re-entered per trade.
- Currency values formatted as currency; percentages to 1 decimal place unless noted otherwise.

### 6.2 Trade Cockpit

#### 6.2.1 Four Account Killers (reference cards)
Four expandable cards, each naming a failure mode and its mechanical fix:

1. **Overleveraging** — Cap total exposure across all open positions (e.g. never more than 20–30% of the account deployed at once). Size every position from stop distance × risk %, never from available buying power. Use less leverage than the broker's max, always.
2. **Poor risk management** — A real stop-loss order at entry, every time — not a mental one. The same fixed risk % on every trade regardless of conviction. Never widen a stop after entry to avoid taking a loss.
3. **Overtrading** — A hard cap on trades per day and per week. A written checklist that must be fully met before entry — no match, no trade. Commissions and slippage tracked monthly so the cost is visible, not invisible.
4. **Emotional decisions** — The full plan (entry, stop, target, size) written before entering, while calm. Bracket orders so exits are automatic. A mandatory cooling-off period after any loss before the next trade.

#### 6.2.2 Pre-Trade Checklist
Seven checkboxes the user ticks before every individual trade (not once a day). A live counter shows "X / 7 cleared" and should read as complete only at 7/7. If fewer than 7 are checked, the product's stance is: wait — don't block the trade technically, but make waiting the obviously-correct move through the UI and copy. Include a "reset for next trade" control (clears all seven) and a "print blank checklist" control (a clean printable version, useful as a physical desk reference).

The seven rules:
- **R-01:** Stop-loss price is set — I can say exactly where I'm wrong.
- **R-02:** Position size calculated from risk %, not from gut feel or buying power.
- **R-03:** Setup matches my written entry criteria — no exceptions today.
- **R-04:** Reward-to-risk ratio checked and worth taking.
- **R-05:** Daily and weekly loss limit not yet hit.
- **R-06:** Not entering within 30 minutes of my last loss.
- **R-07:** IV rank / earnings date checked, if this is an options trade.

The checklist's checked/unchecked state feeds a "matched my rules? Y/N" flag used by the Trade Log (§6.4) — Y only when all 7 are checked at the moment a trade is logged from this page.

#### 6.2.3 Position Sizer (shares/futures)
Inputs: account size ($), risk per trade (%), entry price ($), stop price ($), target price ($).

Outputs, recomputed live on every input change:
```
stop_distance   = abs(entry − stop)
dollar_risk     = account_size × (risk_pct / 100)
position_size   = floor(dollar_risk / stop_distance)     // shares/units
reward_distance = abs(target − entry)
reward_to_risk  = reward_distance / stop_distance
```
Show a warning and blank the outputs whenever any field is empty/non-numeric, risk % ≤ 0, or stop_distance = 0 (entry equals stop).

Include a control to push a completed setup directly into the Trade Log (§6.4) as a new row — capturing date, symbol, trade type, buy price, stop price, target price, direction ("Up" if target ≥ entry, else "Down"), and the current checklist's "matched my rules" flag. This is the app's replacement for ever manually re-typing a setup between tools.

#### 6.2.4 Options Contract Ticket (premium-based sizing)
Inputs: account size ($), risk per trade (%), entry premium ($/share), stop premium ($/share), target premium ($/share), contract multiplier (default 100).

```
dollar_risk       = account_size × (risk_pct / 100)
risk_per_contract = (entry_premium − stop_premium) × multiplier
contracts          = floor(dollar_risk / risk_per_contract)
reward_to_risk     = (target_premium − entry_premium) / (entry_premium − stop_premium)
capital_deployed   = contracts × entry_premium × multiplier
pct_of_account     = (capital_deployed / account_size) × 100
```
Validation: warn if any field is missing/non-numeric, risk % ≤ 0, multiplier ≤ 0, or entry_premium ≤ stop_premium (a long option's stop must sit below its entry). If contracts computes to 0, tell the user one contract alone exceeds their risk budget and suggest widening the stop, raising risk %, or skipping the trade. If pct_of_account exceeds 25%, show an overleverage warning alongside the outlay figure.

#### 6.2.5 Greeks Lab (live options pricing)
Inputs: option type (call/put toggle), underlying spot price ($), strike price ($), days to expiry, implied volatility (%), risk-free rate (%).

Standard Black-Scholes model:
```
T   = days_to_expiry / 365
σ   = IV_pct / 100
r   = rate_pct / 100
d1  = (ln(spot/strike) + (r + σ²/2) × T) / (σ × sqrt(T))
d2  = d1 − σ × sqrt(T)

Call price  = spot × N(d1) − strike × e^(−r×T) × N(d2)
Put price   = strike × e^(−r×T) × N(−d2) − spot × N(−d1)

Call delta  = N(d1)
Put delta   = N(d1) − 1
Gamma       = φ(d1) / (spot × σ × sqrt(T))            // same for calls and puts
Call theta  = [ −(spot × φ(d1) × σ)/(2×sqrt(T)) − r × strike × e^(−r×T) × N(d2)  ] / 365
Put theta   = [ −(spot × φ(d1) × σ)/(2×sqrt(T)) + r × strike × e^(−r×T) × N(−d2) ] / 365
Vega        = spot × φ(d1) × sqrt(T) / 100             // per 1-percentage-point IV move

where N()  = standard normal cumulative distribution function
      φ()  = standard normal probability density function = e^(−x²/2) / sqrt(2π)
```
Display the theoretical premium, breakeven (call: strike + premium; put: strike − premium), a moneyness label (in/at/out of the money from spot vs. strike), and the four Greeks (Delta, Gamma, Theta per day, Vega per 1-point IV move).

Below the Greeks, show a payoff-at-expiration diagram for a long position of the selected type: a kinked profit/loss line against underlying price at expiry, with the loss region (bounded at −premium × multiplier, i.e. max loss) shaded distinctly from the gain region, a marked breakeven point, and a dashed vertical line at the current spot price. Redraw live as any input changes.

#### 6.2.6 Volatility Read (IV rank & expected move)
Inputs: current IV (%), 52-week IV low (%), 52-week IV high (%). Reuses spot price and days-to-expiry from the Greeks Lab (§6.2.5).

```
IV_rank = clamp( (current_IV − IV_low) / (IV_high − IV_low) × 100 ,  0, 100 )
```
Verdict copy by rank: below 25 → vol is cheap, favors buying premium; above 75 → vol is rich, favors selling premium with defined risk; otherwise → mid-range, no strong volatility edge either way.

```
expected_move = spot × (current_IV / 100) × sqrt(days_to_expiry / 365)   // ±1 standard deviation
implied_range = [spot − expected_move, spot + expected_move]              // ~68% of outcomes fall inside this band
```
If the expiry window falls within 3 weeks of a known earnings date for the symbol, surface an earnings/IV-crush callout tying the two together.

#### 6.2.7 Options vs. Futures Reference Table
A static comparison table:

| Trait | Futures | Options |
|---|---|---|
| Leverage | High, margin-based | High, baked into premium |
| Max loss | Effectively uncapped if unhedged | Capped at premium if buying |
| Time decay | None | Works against buyers |
| Payoff shape | Linear | Non-linear (convex) |
| Complexity | Simpler to reason about | Requires Greeks / IV literacy |

### 6.3 Daily Guardrail
A same-day circuit breaker, auto-resetting at local midnight.

Settings: max trades per day (integer), daily loss limit in R (decimal).
State for the current day: a list of logged results, each an R value (float) with an optional symbol and a "followed plan?" Y/N tag.

```
trades_used   = count(results)
net_R         = sum(results)
loss_R        = max(0, −net_R)
room_left_R   = max(0, loss_limit − loss_R)
trades_left   = max(0, max_trades − trades_used)

locked_by_trades = max_trades > 0 AND trades_used >= max_trades
locked_by_loss   = loss_limit > 0 AND loss_R >= loss_limit
locked           = locked_by_trades OR locked_by_loss
caution          = NOT locked AND (trades_left <= 1 OR (loss_limit > 0 AND room_left_R <= 1))
```
Three status states: **clear to trade** (shows trades and room remaining), **caution** (one trade left, or within 1R of the loss limit), **stand down** (locked). While locked, disable all logging controls (result entry, quick-loss shortcut, symbol field, plan-followed selector) until the day resets or the user resets manually.

Controls: log a result (numeric R, submit via button or Enter), a one-click "+ stop hit (−1R)" shortcut, "undo last" (removes the most recent entry from both today's list and the permanent Trade Log), and "reset day" (clears today's entries only). Show each logged result as a small colored chip (positive vs. negative).

Every logged result also becomes a permanent row in the Trade Log (§6.4) — the Guardrail is a same-day lens on that same data, not a separate store.

### 6.4 Trade Log (permanent record)
A dedicated page holding every trade ever logged — the single source of truth that the Analytics Dashboard, the all-time Scoreboard, and any export all read from.

Columns:

| Field | Type | Notes |
|---|---|---|
| Date | input | |
| Stock (symbol) | input | |
| Up or down? | input | auto-derived as "Up" if target ≥ entry, else "Down", when logged from the Position Sizer; editable |
| Matched my rules? (Y/N) | input | auto-filled from the 7-point checklist (§6.2.2) when logged from the Cockpit — Y only if all 7 were checked |
| Trade type | input | e.g. "Stock", "Call", "Put", "Spread" |
| Buy price | input | |
| Stop price ("sell if wrong") | input | |
| Target price ("goal") | input | |
| Stop distance | computed | `abs(buy_price − stop_price)` |
| Reward vs. risk | computed | `abs(target_price − buy_price) / stop_distance` |
| Max dollar risk | computed | `account_size × risk_pct` (from current account settings) |
| Position size ("how many to buy") | computed | `floor(max_dollar_risk / stop_distance)` |
| Sold at | input | filled in once the trade closes |
| Money made or lost ($) | computed | **proposed formula, please confirm:** for an "Up" trade, `(sold_at − buy_price) × position_size`; for a "Down" trade, `(buy_price − sold_at) × position_size`. For options trades sized via the Contract Ticket (§6.2.4), also multiply by the contract multiplier. This wasn't pinned down elsewhere in the spec — it's the natural formula given everything else in this table, but worth a deliberate yes before the developer builds against it. |
| Score (R) | computed | `money_made_or_lost / max_dollar_risk` |
| Followed my plan? (Y/N) | input | the user's honest post-trade self-assessment — distinct from the pre-trade "matched my rules" flag; this is what feeds plan-adherence analytics |
| How I was feeling | input | free text |
| Notes | input | free text |

Behavior:
- Rows arrive two ways: (1) automatically, pushed from the Position Sizer/Contract Ticket or logged via the Daily Guardrail — no manual retyping; or (2) entered directly on this page, for trades placed outside those flows.
- Sortable and filterable (by date, symbol, R, followed-plan).
- Inline edit and delete on any row.
- Visually distinguish input fields from computed fields (e.g. a subtle background difference) so it's always obvious what's typed vs. calculated.
- A summary strip at the top of the page: all-time wins–losses, win rate, net R, average win, average loss, current streak, and an expectancy verdict once at least 30 trades are logged (formula in §6.5).
- A one-click export produces a spreadsheet file reproducing this exact table, for offline use, taxes, or sharing with an accountant.

### 6.5 Analytics Dashboard
Reads every row in the Trade Log automatically — nothing is typed on this page.

Core stats:
```
wins       = results where R > 0
losses     = results where R < 0
net_R      = sum(all R)
gross_win  = sum(wins)
gross_loss = abs(sum(losses))
decided    = count(wins) + count(losses)
win_rate   = count(wins) / decided                 (undefined if decided = 0)
avg_win    = gross_win / count(wins)                (undefined if no wins)
avg_loss   = gross_loss / count(losses)              (undefined if no losses)
expectancy = net_R / count(all results)
profit_factor = gross_win / gross_loss               (∞ if gross_loss = 0 and gross_win > 0)
```
Equity curve & drawdown — running cumulative sum of R, trade by trade, starting at 0:
```
peak = running maximum of the cumulative curve so far
drawdown_at_each_point = peak − cumulative_value_at_that_point
max_drawdown = maximum drawdown_at_each_point over the whole curve
```
Streaks — two distinct computations, not one:
```
Longest win streak / longest loss streak: scan the full result list in order (oldest → newest),
  tracking the current run length; reset to 0 on a losing/winning result respectively;
  keep the maximum run length seen for each direction.

Current streak: scan backward from the most recent result. Take its direction (win/loss).
  Keep counting backward while results keep matching that same direction.
  Stop at the first result that breaks the streak (opposite direction, or an exact 0).
```
Both are useful and should both be shown — "longest ever" is a ceiling reference, "current" is what the user is living through right now.

Required visuals:
- **Equity curve** — cumulative R over trade sequence, current max drawdown annotated.
- **R-distribution histogram** — bucketed results (e.g. ≤−2, −2…−1, −1…0, 0…1, 1…2, 2…3, 3+) with counts per bucket. A healthy pattern shows losses bunched near −1R (stops honored) and wins spread wider to the right; losses drifting past −1R signals stops slipping.
- **Rolling win rate** — win rate over a trailing window, plotted as it evolves, to show recent form rather than only the lifetime average. Use a window of 20 trades once the user has enough history; for smaller trade counts, shrink the window (e.g. `max(5, floor(total_trades / 2))`) rather than showing nothing — the chart should be usable from roughly the 8th logged trade onward, not gated behind 20.
- **Net R by weekday** — bar chart summing R across Monday–Friday.
- **Net R by month** — bar chart summing R per calendar month, showing the most recent 6 months.
- **Plan adherence panel** — split trades into followed-plan Y vs. N (from the Trade Log's "followed my plan?" field), show each group's average R and the adherence rate (Y ÷ total tagged). Needs a handful of tagged trades on both sides before it's meaningful (a reasonable minimum: ≥3 per side, ≥5 tagged overall).
- **Per-symbol performance** — group by symbol: trade count, win rate, net R, sorted by net R.

Auto-written plain-English insights — generate short observations rather than presenting numbers alone. Each trigger below includes the minimum sample size it needs before firing — these gates matter; showing a confident-sounding insight off 4 trades undermines the whole "don't draw conclusions too early" message the product is built around.
- Below ~30 total trades: flag the sample as too small for conclusions. (No gate — this itself is the gate for most other early feedback.)
- Once ≥10 total trades: expectancy positive vs. negative gets different messaging ("the method makes money on average" vs. "trade smaller while you find the leak").
- Once ≥5 losing trades: flag if average loss is noticeably larger than plan (e.g. > 1.2R against a −1R plan) — stops being widened or slipped.
- No gate — a single worst trade beyond roughly −2R is called out as an outlier worth writing a rule to prevent, whenever it occurs.
- Once ≥15 total trades, and only when profit factor is finite (i.e. there's at least one losing trade): ≥1.5 called out as healthy; <1 called out as a warning sign.
- Once a weekday has ≥5 trades on it: flag if that weekday's net R is materially negative (e.g. below −1R) as a possible real pattern, not noise.
- Breaches of the user's own max-trades-per-day cap, counted across days. (No minimum gate — any breach is worth surfacing.)
- Once ≥20 total trades: a recent-form callout on the last 10 trades — notably cold (e.g. net ≤ −3R) or hot (e.g. net ≥ +5R) stretches.
- Once the longest losing streak reaches ≥5: tie it back to what a streak that long costs at the user's current risk % (§6.8.2).
- Once ≥10 tagged trades total, with ≥3 tagged "followed plan" and ≥3 tagged "broke plan": state the R-per-trade gap between the two groups. Separately, once adherence dips below 75% (i.e. plan broken on >25% of tagged trades), flag that directly.
- Once a symbol has ≥5 trades logged against it: flag if its net R is ≤ −2R — worth a temporary ban.

Exports: CSV of the full trade log (date, symbol, R, followed-plan at minimum), and a full JSON backup/restore covering all of the app's local data (Trade Log, settings, screener watchlist).

### 6.6 Screener (multi-stock fundamental grading)
An editable watchlist (default: a broad set of large, liquid US names — developer's choice of a sensible starting list) graded on live fundamental data.

**Grading methodology.** Five category scores (0–100, computed only from whichever sub-metrics are actually available for a given stock — average the available ones, ignore missing ones) plus one weighted composite.

**Valuation** (cheaper multiples score higher):
```
P/E score:        unprofitable → 15
                   else: ≤12 → 95, ≤18 → 85, ≤25 → 70, ≤35 → 55, ≤50 → 35, else → 15
PEG score:         ≤1 → 95, ≤1.5 → 80, ≤2 → 65, ≤3 → 45, else → 25
Price/Sales score: ≤2 → 85, ≤5 → 70, ≤10 → 50, else → 30
EV/EBITDA score:   ≤10 → 90, ≤15 → 75, ≤25 → 55, else → 30
Price/FCF score:   (only if positive) ≤15 → 90, ≤25 → 70, ≤40 → 50, else → 30
Valuation = average of the available sub-scores
```
**Growth** (revenue & EPS growth, year-over-year and 5-year CAGR):
```
YoY growth score (rev or EPS):  >25% → 95, >15% → 85, >8% → 70, >3% → 55, >0% → 45, else → 20
5-yr CAGR score (rev or EPS):   >12% → 85, >7% → 70, >3% → 55, >0% → 45, else → 25
Growth = average of the 4 available sub-scores (YoY rev, YoY EPS, 5yr rev, 5yr EPS)
```
**Profitability** (margins & returns):
```
Margin score (net margin or operating margin):  >25% → 95, >15% → 85, >8% → 70, >3% → 55, >0% → 45, else → 10
ROE score:  >30% → 95, >18% → 85, >10% → 70, >5% → 55, >0% → 45, else → 10
ROA score:  >15% → 95, >8% → 80, >4% → 65, >0% → 50, else → 10
Profitability = average of the available sub-scores (net margin, operating margin, ROE, ROA) — note: gross margin is not part of this category
```
**Financial Health** (ability to survive a bad year):
```
Current ratio score:    ≥2 → 95, ≥1.5 → 85, ≥1 → 65, ≥0.8 → 45, else → 20
Debt/equity score:       ≤0.3 → 95, ≤0.8 → 85, ≤1.5 → 65, ≤2.5 → 40, else → 15
Interest coverage score: ≥20 → 95, ≥8 → 80, ≥3 → 60, ≥1 → 35, else → 10
Financial Health = average of the available sub-scores
```
**Dividend** (only scored if the stock pays a meaningful dividend; no score at all if yield ≤ ~0.01%):
```
Yield score:                ≥6% → 50 (yield-trap caution), ≥4% → 75, ≥2% → 90, ≥0.5% → 70, else → 55
Payout score:                ≤40% → 95, ≤60% → 80, ≤80% → 55, else → 25
5-yr dividend growth score:  ≥8% → 90, ≥4% → 75, ≥0% → 60, else → 35
Dividend = average of the available sub-scores
```
**Composite:**
```
weights: Valuation 25, Growth 25, Profitability 25, Financial Health 15, Dividend 10
composite = weighted average of whichever category scores are available (renormalize weights to just the available categories)
If fewer than 2 of the first 4 categories (Valuation/Growth/Profitability/Health) have data, treat the stock as ungraded (e.g. a fund/ETF with no company fundamentals) rather than forcing a grade.
```
**Letter grades** (applied per category and to the composite):
```
≥85 → A, ≥70 → B, ≥55 → C, ≥40 → D, else → F     (no score at all → "n/a")
```
Table columns: symbol, composite grade, P/E, forward P/E, revenue growth, EPS growth, net margin, ROE, debt/equity, dividend yield, market cap. Sortable by any column; clicking a row opens a full report card with roughly 30 underlying metrics, the 52-week range, performance relative to a broad market index, and a short written verdict.

**Preset filters** (single click, applied on top of the full list):
```
Value:    P/E > 0 and ≤ 18, and net margin > 0
Growth:   revenue growth ≥ 15%
Dividend: dividend yield ≥ 2.5%
Fortress: debt/equity ≤ 0.5 and net margin ≥ 15%
```
Watchlist management: add/remove any valid US ticker symbol (validate: starts with a letter, then letters/digits/periods/hyphens, ≤10 characters); a "restore default list" control resets to the default watchlist.

Data freshness: fundamentals are slow-moving, so cache each symbol's data for roughly 24 hours before re-fetching, with a manual "force re-scan all" override. If the market-data source enforces a rate limit, throttle requests accordingly (roughly one symbol per second is a safe default), surface scan progress to the user, and handle rate-limit errors gracefully (pause and retry rather than failing the whole scan).

### 6.7 Stock Analyzer (single-stock research read)
Given any valid US ticker, produce a live research read combining a fundamental score, a charted technical read, analyst consensus, a risk grade, a bull/bear case, and one overall verdict.

**Scoring model.** Maintain a running numeric score, and for every signal that moves it, push a short plain-English sentence into either a "bull" list (positive) or "bear" list (negative), tagged with the signal's point weight so each list can be sorted strongest-first. This is the mechanism behind both the bull/bear case and the overall verdict — every position on the gauge should be traceable to one of these listed sentences.

Fundamental signals (skipped for ETFs/funds — detected by the absence of company-level fundamentals):
```
Unprofitable (EPS ≤ 0 or P/E ≤ 0):        −2
P/E ≤ 18 (and profitable):                 +2
P/E > 60:                                   −2
P/E > 35 (and ≤ 60):                        −1
Revenue growth > 15%/yr:                   +2
Revenue growth 5–15%/yr:                   +1
Revenue growth < 0%/yr:                     −2
Net margin > 15% (and profitable):         +1
Net margin < 0%:                            −2
Return on equity > 15% (and profitable):   +1
Debt/equity > 2:                            −1
Debt/equity < 0.5:                         +1
Dividend yield > 2%:                       +1
```
Analyst consensus signal (only if ≥5 analysts cover the stock):
```
Sell/Strong-sell ratio ≥ 30% of analysts:  −2
Buy/Strong-buy ratio ≥ 65%:                +2
Buy/Strong-buy ratio ≥ 50% (< 65%):        +1
Otherwise (mostly Hold):                    −1
```
Momentum signals:
```
3-month return ≥ 0:  +1   (< 0: −1)
6-month return ≥ 0:  +1   (< 0: −1)
1-year return ≥ 0:   +1   (< 0: −1)
5-day return > +8%:   −1   (a spike — caution against chasing)
5-day return < −8%:   −1   (a sharp drop — caution against catching a falling knife)
```
52-week range signals:
```
Price in top 15% of its 52-week range:    +1
   (bear-list note only, no extra score, if 1-year return also > 60%: "already run a lot, near the top of its range")
Price in bottom 20% of its 52-week range:  −1
```
Earnings-proximity: if a confirmed earnings date falls within 21 days, add a bear-list note about event risk (no extra score) and trigger a prominent earnings-soon callout in the UI (tie back to checklist rule R-07, §6.2.2).

**Overall verdict**, from the same running score:
```
score ≥ 5:        "leans long" — clearly more bullish signals than bearish
2 ≤ score < 5:     "mild long bias" — lean long, not decisive
−2 < score < 2:    "no edge either way — wait"
−5 < score ≤ −2:    "mild short bias" — for most users, read this as simply avoiding the stock
score ≤ −5:         "leans short" — mostly bearish; flag that shorting carries theoretically unlimited loss and for most users this just means staying away
```
Map the score onto a visual gauge running from "lean short" through "no edge" to "lean long."

**Risk grade** (independent of direction — describes how volatile/fragile the position is):
```
Beta > 1.5:                  +2 risk points     Beta 1.2–1.5:                +1
3-month volatility > 45%:    +2                  3-month volatility 30–45%:   +1
Unprofitable:                 +2
Debt/equity > 2:               +1
Market cap < ~$2B:             +2                 Market cap $2B–$10B:         +1
Price < 60% of 52-week high:   +1
Earnings within 3 weeks:        +1

Risk points ≤1 → LOW, ≤3 → MEDIUM, ≤5 → HIGH, else → VERY HIGH
```
List the specific contributing reasons (e.g. "swings ~1.8× harder than the market," "not yet profitable," "small company — thinner, easier to whipsaw") so the grade is explained, not just labeled.

**Fundamental read panel**: a plain metrics table — P/E, EPS, revenue growth, gross margin, net margin, ROE, debt/equity, dividend yield, price/sales, market value — each with a color cue (good/caution/bad) from the thresholds above. For ETFs/funds, replace this panel with a short note that company fundamentals don't apply and the technical read still works normally.

**Technical read panel — a chart, not a metrics table:**
- A price chart (price line plus 50-day and 200-day moving averages) over roughly a 6–12 month window.
- A momentum row: 5-day, 1-month, 3-month, 6-month, and 1-year % change as color-coded chips.
- A 52-week range indicator (low/high with the current price's position marked).
- **Auto-detected bullish/bearish setups drawn directly on the chart**, each paired with a one-line plain-English thesis — for example: a golden cross or death cross (50-day moving average crossing above/below the 200-day), a breakout above or breakdown below a recent resistance/support level, and momentum decelerating or accelerating relative to the longer-term trend (e.g. a strong 6-month gain alongside a flat or negative last-5-day change, framed as "cooling off, not yet reversing").
- An overall technical bias (bullish / bearish / neutral), derived from how the detected setups skew, feeding into the same overall verdict gauge described above.
- This requires historical daily price data (open/high/low/close bars, ideally 1+ year of history) to compute moving averages and detect crossovers/breakouts — called out again as a specific data dependency in §9.

**Analyst consensus panel**: a stacked bar (strong buy / buy / hold / sell / strong sell) with raw counts, shown only when ≥5 analysts cover the stock.

**Bull case / bear case**: the accumulated bull-list and bear-list sentences from the scoring model above, sorted strongest-first. If a list is empty, say so plainly rather than leaving it blank (e.g. "not much — the data gives this stock very few green flags right now" / "surprisingly little — no major red flags in the data, stay humble anyway").

**Handoff**: a control to send the analyzed symbol and its current price into the Position Sizer (§6.2.3), prefilling entry at the live price, a stop roughly 5% away, and a 2:1 reward:risk target, for the user to adjust.

Throughout, reinforce that this is a screening aid, not a recommendation: a "leans long" verdict still requires the full pre-trade checklist and standard 1% risk sizing before acting on it.

### 6.8 Reference

#### 6.8.1 Dictionary
Sixteen terms, each defined in one to three plain-English sentences with no further jargon:

- **Stop-loss** — a price you choose before buying, where you'll sell and accept a small loss if the trade goes against you. Decided while calm, never moved while scared.
- **Position size** — how many shares or contracts you buy, calculated from what you can afford to lose, never from confidence.
- **Risk % / the 1% rule** — the slice of your account one trade is allowed to lose. At 1%, a $10,000 account risks $100 per trade.
- **R (R-multiple)** — your unit of risk. 1R = the dollars you risked on a trade. Making double what you risked is +2R; losing it all is −1R.
- **Reward-to-risk ratio** — potential profit divided by potential loss.
- **Win rate** — the percentage of trades that make money. Meaningless on its own — needs average win/loss alongside it.
- **Expectancy** — average profit per trade, counting both wins and losses.
- **Drawdown** — how far an account has fallen from its highest point.
- **Leverage** — trading with borrowed money or instruments that multiply exposure; makes wins and losses both bigger.
- **Overtrading** — taking trades from boredom, excitement, or trying to win back a loss, instead of because the checklist says so.
- **Option (call/put)** — a contract covering 100 shares; a call profits if the stock rises enough, a put if it falls enough, both with a deadline.
- **Premium** — the price of an option, quoted per share; a $2.50 premium costs $250 per contract (×100).
- **Implied volatility (IV)** — the market's guess at how wildly a stock will move, priced into the option.
- **IV crush** — the sudden collapse in option prices right after big news (like earnings), which can cause a loss even with the right directional call.
- **Bracket order** — an order that attaches the stop-loss and profit target at entry, so both exits are automatic.
- **Paper trading** — practicing with fake money on a real platform before risking real capital.

#### 6.8.2 Risk of Ruin Simulator
Inputs: win rate (%), average win (R), average loss (R), risk per trade (%), and a drawdown threshold defining "ruin" (default 50%).

Methodology — fixed-fractional betting, Monte Carlo:
```
Simulate N = 2,000 independent "careers," each M = 200 trades long.
For each trade in a career: draw a random outcome; win with probability = win_rate.
  If win:  equity *= (1 + risk_fraction × avg_win_R)
  If loss: equity *= max(0, 1 − risk_fraction × avg_loss_R)
A career is "ruined" the moment equity falls to or below (1 − ruin_drawdown_pct).
Risk of ruin = (number of ruined careers) / N
Also report the median ending equity multiple across all careers (0 / "wiped" if the median career was ruined).
```
Also compute plain expectancy per trade: `expectancy = win_rate × avg_win_R − (1 − win_rate) × avg_loss_R`.

Re-run the simulation across a fixed ladder of risk percentages (0.5%, 1%, 2%, 3%, 5%, 10%), holding win rate and average win/loss constant, and display it as a ladder so the user sees ruin probability climb with position size alone. Color-code the result (a reasonable default: <8% low-risk, <30% medium, else high).

## 7. Suggested Enhancements (not required for v1 — worth discussing with the developer)

These extend the concept beyond the core spec above. None are committed scope; flagging them so the developer can estimate and the user can prioritize:

- **Setup/strategy tagging on trades** (e.g. breakout, pullback, earnings play) in addition to symbol and plan-adherence, so the Analytics Dashboard can show which *types* of setups actually make money, not just which symbols.
- **Chart snapshot on each Trade Log entry** — attach the price chart as it looked at entry, so a trade can be reviewed later without relying on memory of the setup.
- **Earnings/event calendar on the Trade Cockpit** — surface upcoming earnings dates for watchlist symbols and other market-moving events for the day, since the checklist already asks about earnings proximity (rule R-07) but nothing currently surfaces it proactively.
- **Weekly/monthly review page** — an auto-generated retro pulling from the Analytics Dashboard plus a few reflection prompts.
- **Visible cooling-off timer** after a logged loss, tied to rule R-06 (30 minutes since last loss), instead of relying on the user to track it mentally.
- **Automatic rule-break flagging** — e.g. a trade logged inside the cooling-off window, or a day that exceeded the trade cap — surfaced immediately rather than only showing up later as an Analytics insight.
- **Light/dark theme toggle.**
- **Printable personal trading plan** — a single exportable document combining the checklist, account rules, and risk settings for an offline desk reference.

## 8. Confirmed Architecture Decisions

| Decision | Choice | Why |
|---|---|---|
| Accounts / multi-device sync | **No.** Single-device, local data only. | Matches actual usage; avoids auth complexity for a one-user tool. |
| Market-data API key | **Backend proxy from day one.** Client never sees the key. | No market-data secret should ever ship to the browser. |
| Trade record keeping | **One system.** The app's Trade Log (§6.4) is the sole source of truth; a spreadsheet-style export is available for convenience, not as a second system to keep in sync. | Avoids the failure mode of two records drifting apart. |

## 9. Technical Requirements

- **Backend:** a service whose primary job is proxying market-data requests (quotes, fundamentals, historical price bars, options IV) so no API key or secret ships to the browser. It should also own rate-limiting and caching for market-data requests (e.g. cache fundamentals for ~24h, throttle screener requests to roughly 1/sec) rather than pushing that logic into browser JS.
- **New data requirement — historical price series:** the Technical Read (§6.7) needs historical OHLC price bars (daily, ideally 1+ year back) to draw its chart and detect moving-average crossovers or support/resistance breaks. This is a genuine data dependency the backend proxy must support — signal detection itself (crossovers, breakouts, momentum deceleration) can run client-side once the series is fetched, so no separate "signals" endpoint is needed.
- **Data storage:** local persistence on the user's device via IndexedDB rather than `localStorage` — trade history will accumulate over months/years, and IndexedDB doesn't have `localStorage`'s tighter size ceiling. No server-side database is required given the no-accounts decision, but the developer should flag if local-only storage is a durability risk worth revisiting.
- **Backup/restore:** since there's no server-side copy of the data, a JSON backup/export plus the spreadsheet export from §6.4 are the durability plan. Consider prompting for backup on a schedule (e.g. after 20 logged trades, or every 30 days).
- **Frontend architecture:** one app — shared nav/shell, shared state/data layer, real routing between the pages in §5. Framework choice is the developer's call.
- **Charts:** hand-rolled SVG or a charting library — developer's judgment. The Technical Read chart (§6.7) in particular will likely need a proper charting library given the moving-average overlays and signal annotations.
- **Accessibility:** keyboard-operable controls throughout, labeled inputs for screen readers, `prefers-reduced-motion` respected.
- **Responsive/mobile:** fully usable on a phone — nav collapses appropriately, inputs sized to avoid mobile zoom quirks.
- **Offline behavior:** the app should work fully offline except for live-price and research features, which should fail gracefully to a clearly-labeled last-known/demo state rather than breaking the page.

## 10. Design Direction

Dark theme, amber (`#E8A33D`) accent against a near-black background, monospace numerals for all data/metrics, green/red for gain/loss. This is a working reference the user will look at daily/pre-trade — legibility and a calm, non-flashy feel matter more than novelty.

## 11. Explicitly Out of Scope for This Build

- Multi-user support, accounts, or cloud sync
- Brokerage/order execution integration
- Push notifications or alerting
- Monetization/SaaS packaging — this is being built for personal use only, not intended for resale at this stage

## 12. Open Questions for the Developer

- Preferred stack/framework (no constraint from the product side).
- Whether IndexedDB alone is durable enough long-term, or whether even a single-user tool warrants a lightweight self-hosted backend datastore for the journal (separate from the market-data proxy) as extra insurance against browser data loss.
- Which market-data provider to use for the backend proxy, covering quotes, fundamentals, options IV, and historical price bars (needed specifically for §6.7's chart).
- Which, if any, of the §7 suggested enhancements to include in v1 vs. a later pass.
