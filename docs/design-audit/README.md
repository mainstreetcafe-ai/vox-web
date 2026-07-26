# Design Audit -- Vox (vox.mainstreetcafe.ai)

**Date:** 2026-07-04
**Method:** Booted the real app locally (`npm run dev`, Vite at localhost:5173) against the live Supabase backend, in mobile emulation (390x844, the actual use case -- servers on their phones). Logged in with a throwaway PIN, walked all three views + the core dictation action, captured console + network. Screenshots in `assets/` (`mobile-*` / `desktop-*` = as found; `after-*` = after the on-the-spot fixes).
**Lens:** first-day senior design lead. Not "does it look nice" -- can a normal user (a server: Megan, Jake, Citlali) understand it, trust what it shows, and finish the core action without training. For Vox the **core action** is: log in, dictate a table command, verify the parse, read it back while typing into SHIFT4, mark it done. "Conversion" here = completing that loop; "trust" = believing the floor/ticket data on screen.
**Audit account:** a temporary `server`-role staff row with a known PIN was created for the walk and **deleted afterward**. No payment/delete/publish action was touched. PINs are bcrypt-hashed (`vox_verify_pin` RPC); no real staff credential was read or changed.

---

## Executive summary

Vox is genuinely well-built for its job: a dark, native-feeling, phone-first tool with one obvious core action ("TAP TO SPEAK") and a clean three-view swipe model (Floor / Command / Feed). The login and empty states are among the best I have seen in an internal tool. The problems are not aesthetic -- they are **trust and fail-loud gaps on exactly the surfaces a server relies on mid-shift**:

1. The Floor screen showed tables "seated" for **2,088 hours** (87 days) -- stale session data rendered with no sanity guard. A server who sees a table open 2,088 hours stops trusting the whole screen.
2. The core action can **fail silently**: deny the microphone permission and tapping the ring just returns to "TAP TO SPEAK" with no message. For a product whose whole methodology is fail-loud, the one screen that must never fail quietly does.
3. A backend view Vox depends on (`shift4_card_customer`, the customer-lookup source) **intermittently returns HTTP 500** (statement timeout -- the same one flagged in the dashboard audit and BRAIN), and the app has no error state for it.

Four safe copy/display fixes were applied on the spot (details below); the three above and the rest are recommendations.

**Scores (1-10, first-day-server lens):** first impressions 8 · navigation 6 · visual hierarchy 8 · component consistency 7 · loading/empty/error states 4 · trust signals 5 · core-action completion 6.

---

## Findings

Severity: P0 = actively breaks trust/the core action now · P1 = fix this sprint · P2 = fix this pilot cycle · P3 = polish.
Hurts: U = understanding, T = trust, C = conversion (completing the core action).

| # | Sev | Screen | Issue | Hurts | Fix |
|---|-----|--------|-------|-------|-----|
| 1 | P1 | Floor | **Tables show absurd durations ("2088h 21m", "2090h 50m").** Stale `vox_table_sessions` rows (never closed) with no display guard -> the elapsed timer renders ~87 days as a plausible-looking hour count. Instantly reads as broken. | T | **Applied:** `formatElapsed` now caps past 24h to "Nd (stale)" so it reads as obviously-stale, not alarming. **Root:** close/purge the stale test sessions in `vox_table_sessions` (pilot data cleanup). |
| 2 | P1 | Command (core action) | **Silent failure on mic-permission denial.** Tapping the ring with the mic blocked returns to "TAP TO SPEAK" with no message (console: `Speech error: not-allowed`). The code handles "speech not supported" (demo-mode notice) but not "permission denied." A server with mic off dead-taps forever. | C, T | Surface the error: on a `not-allowed` / `service-not-allowed` speech error, set an error state and show "Microphone blocked -- enable mic access in Settings" with a retry. Touches `SpeechService` + `useCommandState` + `CommandView` (recommendation, not a one-liner). |
| 3 | P1 | Command (customer lookup), load | **Intermittent HTTP 500 with no UI error state.** `shift4_card_customer` (the `customer_lookup` source, `commandExecutor.ts:102`) times out under load (seen once on this walk; matches the known statement-timeout in BRAIN). No loading/error affordance -- the app just shows nothing or stale. | T, C | **BACKEND FIXED 2026-07-04:** a partial covering index (`idx_card_tx_customer_agg`) cut the view aggregate from 35,331 -> 441 buffers (Index Only Scan); the intermittent 500 is structurally gone (`_system/scripts/migrations/2026-07-04-card-customer-covering-index.sql`, shared with the dashboard P0). **STILL OPEN (UI):** give data reads a real error state ("Couldn't reach the loyalty data -- try again") instead of silent empty. |
| 4 | P2 | Floor | **Header said "Your Tables" but showed the entire floor** (all ~54 tables across every section; the server filter only feeds the shift-total). Misleading. | U, T | **Applied:** renamed header to "The Floor." (If it should show only this server's tables, that's a logic change -- recommendation.) |
| 5 | P2 | Floor | **"Open / unsat" jargon** on every empty table card. "unsat" is not a word a server parses mid-rush. | U | **Applied:** changed to "Open." |
| 6 | P2 | Command (landing) | **The default view after login has no wayfinding.** A new server lands on the ring with no hint the Floor and Feed exist -- yet Floor and Feed both carry "Swipe ... for voice commands" hints. The one view everyone starts on is the one that doesn't teach the model. | U | **Applied:** added "Swipe right for the floor -- left for the feed" (idle only), matching the other views. |
| 7 | P2 | All | **No logout / no way to switch server.** Nothing in any view logs out or shows a lock. On a shared or handed-off phone at shift change, the session can't be ended without clearing the app. | T | Add a small logout affordance (e.g. long-press the page indicator, or a control on the Floor header) that calls `logout()`. Consider an idle auto-lock for the pilot. |
| 8 | P2 | Command | **Ticket / response states not reachable without a mic**, so a server cannot preview the read-back flow, and QA can't screenshot it. The `mockVoice` demo path only fires when speech is *unsupported*, not when it errors -- so on a real denied-mic phone there is neither a live path nor a demo path. | C | Route a denied/errored mic into the same demo/mock path (or a manual text-entry fallback) so the core loop is always demonstrable and testable. |
| 9 | P3 | Floor | **"--" on the right of tables with no check total** is unexplained next to the "$25.00" tables. | U | Use a lighter placeholder or omit; or label ("no check yet"). |
| 10 | P3 | Login | **No "Enter your PIN" label.** iOS convention (4 dots + numpad) makes it inferable, but a one-line label removes all doubt for a first-time server. | U | Add a subtle "Enter your PIN" line under the wordmark. |
| 11 | P3 | Login | **No lockout feedback detail.** After max attempts it shows "Too many attempts. Try again later." with no countdown. Minor, but a locked-out server doesn't know how long. | U | Show the remaining lockout time. |
| 12 | P3 | Desktop | **On a laptop the phone layout floats centered in a black field** with no "open this on your phone" note. Out of scope by design (phone PWA), but a manager opening the URL on a desktop gets an odd first impression. | U | A responsive hint ("Vox is built for your phone -- open vox.mainstreetcafe.ai there") on wide viewports. |
| 13 | P3 | Floor | **Attention state is a color-only left border** (maroon/amber). "Needs attention" text does appear for the attention status, so this is minor, but the active-vs-open distinction is otherwise color-only. | U | Keep the text label pattern for active tables too. |

Items 1-3 have data/backend roots (stale sessions; the speech-permission contract; the view timeout); the UI fixes reduce the blast radius but the root fixes are flagged to the operator/pilot.

---

## Fixed on the spot (safe copy/display only, typecheck clean)

All four verified in the running app (`after-*.png`); `npx tsc --noEmit` passes. Nothing committed -- changes are in the working tree for review.

1. **Absurd table durations** (`src/lib/time.ts`) -- `formatElapsed` caps past 24h to "Nd (stale)" so a never-closed session reads as obviously stale instead of a scary "2088h 21m."
2. **"Your Tables" -> "The Floor"** (`src/views/DashboardView.tsx`) -- the screen shows the whole floor, so the header now says so.
3. **"Open / unsat" -> "Open"** (`src/components/TableCard.tsx`) -- removed the jargon.
4. **Command-view wayfinding** (`src/views/CommandView.tsx`) -- added the swipe hint the landing view was missing, matching Floor + Feed.

---

## Update 2026-07-04 -- all 5 quick wins applied + verified

Following the initial 4 copy fixes, the 5 recommended quick wins were also applied and verified in the running app (`after-mic-error.png`, `after-floor-clean.png`, `after-desktop-banner.png`, `after-login-pinlabel.png`); `npx tsc --noEmit` passes.

1. **Stale sessions purged (finding #1 root).** Reset 3 stale `active` sessions (B1 opened 2026-04-08, B5, W6 opened 2026-06-17) to `open` -- scoped to `opened_at < now() - 18h` so it can never touch a live table. The Floor now shows clean "Open" tables, no absurd durations. Reset (not deleted), consistent with the never-delete discipline.
2. **Mic-blocked error message (finding #2).** `useCommandState` now handles the SpeechService `'error'` state and surfaces "Microphone blocked. Turn on mic access for Vox in your phone settings, then tap again." via the existing response card. The core action no longer dead-taps silently. (`src/hooks/useCommandState.ts`)
3. **Logout (finding #7).** Added a "Sign out" control to the Floor header (`logout()` from AuthContext). A server can end/hand off the session. (`src/views/DashboardView.tsx`)
4. **"Enter your PIN" (finding #10).** Added the label under the login wordmark. (`src/views/LoginView.tsx`)
5. **Desktop "open on your phone" banner (finding #12).** A maroon `md:`-only top banner tells a desktop visitor Vox is a phone tool. (`src/App.tsx`)

Backend `shift4_card_customer` timeout (#3) remains -- shared with the dashboard audit (index/materialize the view). The live dictate->ticket loop (#8) still needs a real device or a mic-error demo fallback to fully test.

## The 5 issues hurting the core action (conversion) most

1. **Silent mic-permission failure** (#2) -- the single most important tap in the app can do nothing with no explanation. If a server's mic is off, Vox is dead and doesn't say why.
2. **The `shift4_card_customer` 500 with no error state** (#3) -- customer-lookup (and anything reading that view) can fail with the app showing nothing, training servers that the feature "doesn't work."
3. **Stale/absurd floor data** (#1) -- once a server catches "2088h," they stop trusting the Floor screen, which is the context they dictate against.
4. **No demo/fallback when speech errors** (#8) -- there's no path to complete or even rehearse the core loop on a phone where live speech is unavailable.
5. **No logout / session control** (#7) -- at shift change on a shared phone, there's no clean way to hand off, so the wrong server's name rides on the next ticket.

## 5 quick wins fixable today (beyond the 4 already applied)

1. **Purge/close the stale `vox_table_sessions` rows** so the Floor shows real durations (one data cleanup; pairs with the #1 display cap already applied).
2. **Add the mic-permission error message** (#2) -- a single error state + string in the speech-error handler; the highest-value small fix in the app.
3. **Add a logout control** (#7) -- wire an existing gesture (long-press the page dots) to `logout()`.
4. **Add "Enter your PIN"** under the login wordmark (#10) -- one line.
5. **Add the desktop "open on your phone" hint** (#12) -- one responsive block.

---

## Coverage

**Screens:** Login (+ PIN entry), Command (idle + the tap-to-speak core action + mic-error path), Floor (top + scrolled, all sections), Feed (empty state), desktop login. **Flows:** PIN login, the three-view swipe navigation, the dictation tap (which surfaced the silent mic failure). **Not exercised (headless has no mic):** the live dictate -> parse -> ticket -> read-back -> mark-done loop and the ResponseCard/TicketView states -- reasoned about from code (`useCommandState`, `commandExecutor`, `TicketView`); flagged as untestable-without-a-device (#8). **Console/network:** clean except the one intermittent 500 (#3) and the expected headless `Speech error: not-allowed` that exposed #2.
