# Chess Game - Codebase Audit & Investigation

**Date:** 2026-02-15
**Scope:** Full codebase investigation covering security, performance, accessibility, code quality, and architecture.
**Best practices sourced from:** Context7 (Supabase JS Client docs, Stockfish.js UCI protocol docs)

---

## Architecture Overview

```
index.html ── DOM structure (auth modals, board, chat/coach panels, opponent grid)
    |
chess.js ── Main app (ChessGame class + AccountSystem class)
    |         |
    |         ├── Board state, move validation, game rules (castling, en passant, promotion)
    |         ├── Stockfish engine integration via Web Worker (UCI protocol)
    |         ├── Chat/Coach AI messaging system
    |         ├── Chess clock timers (100ms tick)
    |         ├── Sound effects via Web Audio API
    |         └── Leaderboard (localStorage)
    |
Auth.js ── Supabase authentication (signUp, logIn, logOut, getSession)
    |
stockfish.js ── Pre-compiled Stockfish engine (~136K lines, runs in Worker thread)
    |
styles.css ── Full styling (~1770 lines): 3D board, animations, responsive design
```

**Data flow:** User clicks board -> chess.js event delegation -> move validation -> board state update -> DOM update -> Stockfish Worker receives FEN -> returns bestmove via postMessage -> chess.js applies AI move.

---

## Issues Found & Fixed

### 1. CRITICAL: 3D CSS Transform Broke All Click Handling

**File:** `styles.css:224-234`
**Symptom:** Users could not click any pieces on the board.
**Root Cause:** `.board-wrapper` had `transform: rotateX(8deg)` with `perspective: 1000px` and `transform-style: preserve-3d`. This caused the browser's hit-testing to misidentify click targets - `elementFromPoint()` returned `#board` instead of the `.square` children. The click handler's `e.target.closest('.square')` returned `null`, so every click was silently ignored.
**Fix:** Removed the 3D perspective/rotation CSS. The board retains its wooden textures, piece shadows, and beveled frame effects.
**Verified:** Playwright click tests confirm piece selection, move execution, and AI response all work.

### 2. HIGH: Dead Insecure Password Hash Function

**File:** `chess.js` (was at line ~2785)
**Issue:** A `hashPassword()` method used DJB2 hashing - trivially reversible, not cryptographically secure. While unused (Supabase handles auth), it was a security liability and could mislead future developers.
**Fix:** Deleted the entire method.

### 3. HIGH: XSS-Prone innerHTML Patterns in Captured Pieces

**Files:** `chess.js:2310-2348`
**Issue:** `updateCapturedPieces()` and `updateTrayPieces()` used template literals with `innerHTML` to inject `<img>` tags. While the `src` values are currently hardcoded Wikimedia URLs, this pattern is fragile - any future change to `pieceImages` sourcing could introduce XSS.
**Fix:** Replaced with safe DOM construction using `document.createElement('img')` + `appendChild()`. Created a shared `_buildCapturedPieceElements()` helper to eliminate the duplicate code between the two methods.

### 4. MEDIUM: Move History Rebuilt From Scratch Every Move

**File:** `chess.js:2515-2557`
**Issue:** `updateMoveHistory()` cleared `innerHTML` and rebuilt the entire move list on every single move. In a 100-move game, this meant 100 DOM elements created and destroyed every time.
**Fix:** Changed to incremental append - only creates the new move element and appends it to the container. Previous "current move" highlight is removed and applied to the new move. O(1) per move instead of O(n).

### 5. MEDIUM: Auth.js Missing Error Handling & Cleanup

**File:** `Auth.js`
**Issues found:**
- `getCurrentUser()` and `getSession()` didn't handle errors - would throw on network failure
- `onAuthStateChange` listener was never cleaned up (no unsubscribe)
- Supabase client created without explicit auth configuration
- No detection of email confirmation requirement on signup

**Fixes applied:**
- Added error handling to `getCurrentUser()` and `getSession()` (return `null` on error)
- Auth state listener now exports its `subscription` for cleanup
- Supabase client configured with `autoRefreshToken`, `persistSession`, `detectSessionInUrl`
- `signUp()` now returns `confirmationRequired: true` when session is null (email not yet confirmed)

### 6. LOW: Dead Code - `initAccountSystem()` and `getUsers()`

**File:** `chess.js`
**Issue:** `initAccountSystem()` (with its `setupAccountEventListeners()`) was defined but never called - the AccountSystem is created separately in the `DOMContentLoaded` handler. It also referenced a non-existent element ID (`account-login-btn` vs the actual `login-btn`). `getUsers()` was a leftover from the pre-Supabase localStorage auth system.
**Fix:** Removed all three dead methods (~35 lines).

### 7. LOW: Typo in Property Name

**File:** `chess.js:191, 425`
**Issue:** `this.chesseTips` had a typo (extra 'e').
**Fix:** Renamed to `this.chessTips` across all references.

### 8. MEDIUM: Missing Accessibility Features

**File:** `styles.css` (appended)
**Issues:**
- No `prefers-reduced-motion` media query - animations run regardless of user preference
- No visible focus indicators on interactive elements - keyboard users can't see what's focused
- Turn indicator relies solely on green color - invisible to colorblind users

**Fixes applied:**
- Added `@media (prefers-reduced-motion: reduce)` that disables all animations/transitions
- Added `:focus-visible` outlines on buttons, inputs, selects, opponent cards, and squares
- Added a play-arrow Unicode character inside the turn indicator light for colorblind differentiation

---

## Issues Identified But NOT Fixed (Require Design Decisions)

### Security

| # | Issue | Severity | Why Not Fixed |
|---|-------|----------|---------------|
| S1 | **Supabase anon key in client source** | INFO | This is [expected by Supabase's architecture](https://supabase.com/docs/guides/api/api-keys). The anon key is designed to be public. Security comes from Row Level Security (RLS) policies on the database, not from hiding the key. However, **RLS policies must be configured** on any public-facing tables. |
| S2 | **Leaderboard stored in localStorage** | HIGH | Anyone can open DevTools and inject fake records. Needs migration to a Supabase `leaderboard` table with RLS policies that only allow authenticated inserts and a server-side function to validate game completion. |
| S3 | **No rate limiting on auth** | MEDIUM | Supabase provides built-in rate limiting on auth endpoints. Verify it's enabled in your Supabase dashboard under Auth > Rate Limits. |
| S4 | **localStorage stores user object** | LOW | `chess_current_user` in localStorage contains `{username, email, id}`. On a shared computer this is readable. Consider using `sessionStorage` instead, or rely solely on `supabase.auth.getUser()` for session state. |

### Performance

| # | Issue | Severity | Notes |
|---|-------|----------|-------|
| P1 | **Piece images loaded from Wikimedia CDN** | MEDIUM | 12 SVG requests on game start. If Wikimedia is slow/down, pieces won't render. Consider inlining SVGs as data URIs or hosting locally. |
| P2 | **stockfish.js is 4.2MB** | MEDIUM | Loaded synchronously as a Worker. Consider lazy-loading after the page is interactive (only needed when user starts a vs-computer game). |
| P3 | **positionHistory array grows unbounded** | LOW | For threefold repetition detection. In very long games (100+ moves), this array grows indefinitely. Could cap at last ~50 positions since repetition only matters for recent positions. |
| P4 | **Chat message DOM never pruned** | LOW | Long games accumulate many chat message elements. Could limit to last 50 messages in the DOM. |

### Architecture

| # | Issue | Severity | Notes |
|---|-------|----------|-------|
| A1 | **Monolithic ChessGame class (~2500 lines)** | MEDIUM | Mixes game logic, UI rendering, audio, engine communication, and chat. Ideally split into: `ChessEngine` (rules/validation), `BoardUI` (rendering), `AudioManager`, `StockfishBridge`, `ChatSystem`. |
| A2 | **No test infrastructure** | MEDIUM | Move validation logic (en passant, castling, check detection, promotion) has no unit tests. These are complex algorithms that benefit greatly from testing. |
| A3 | **No build system** | LOW | No bundler, minifier, or transpiler. For a learning project this is fine, but for production you'd want at least minification. |

### Accessibility (Beyond What Was Fixed)

| # | Issue | Severity | Notes |
|---|-------|----------|-------|
| AC1 | **No keyboard navigation for the board** | HIGH | Can't use arrow keys to navigate squares or Enter to select/move pieces. Requires adding `tabindex`, `keydown` handlers, and ARIA roles. |
| AC2 | **No screen reader support** | HIGH | Board squares are plain `<div>` elements with no ARIA labels. Pieces have `alt` text on `<img>` but squares themselves have no semantic meaning. Needs `role="grid"`, `role="gridcell"`, and `aria-label` for each square. |
| AC3 | **Board is fixed 480x480px** | MEDIUM | Doesn't scale on mobile. Needs responsive sizing with `vmin` units or container queries. |

---

## Supabase Best Practices Assessment (via Context7)

Checked against [Supabase JS Client documentation](https://context7.com/supabase/supabase-js):

| Practice | Status | Notes |
|----------|--------|-------|
| Use anon key (not service role) in client | PASS | Auth.js correctly uses the anon key |
| Configure `autoRefreshToken` | FIXED | Now explicitly set to `true` |
| Configure `persistSession` | FIXED | Now explicitly set to `true` |
| Handle `signUp` email confirmation flow | FIXED | Now checks for `data.user && !data.session` |
| Error handling on all auth calls | FIXED | `getCurrentUser()` and `getSession()` now handle errors |
| Clean up auth state listener | FIXED | Subscription is now exported for cleanup |
| Use `signInWithPassword` (not deprecated methods) | PASS | Already using the correct method |
| Store user metadata in signup options | PASS | Username stored in `options.data` |
| Enable RLS on database tables | NEEDS CHECK | No public tables found yet, but when leaderboard migrates to Supabase, RLS policies are mandatory |

## Stockfish Integration Assessment (via Context7)

Checked against [Stockfish.js UCI protocol docs](https://context7.com/nmrugg/stockfish.js):

| Practice | Status | Notes |
|----------|--------|-------|
| Send `uci` and wait for `uciok` | PASS | `initEngine()` sends `uci` and waits for `uciok` in `onmessage` |
| Use `isready`/`readyok` synchronization | MISSING | Engine commands are sent without `isready` sync. Should send `isready` after `setoption` and wait for `readyok` before `go` |
| Set `Skill Level` via `setoption` | PASS | `setEngineSkill()` correctly uses UCI `setoption` |
| Use `position fen` before `go` | PASS | `makeEngineMove()` sends FEN then `go depth N` |
| Handle `bestmove` response | PASS | Parses `bestmove` and applies via `applyEngineMove()` |
| Depth limits per opponent | PASS | Each opponent has a configured depth (1-15+) |
| Run in Web Worker | PASS | `new Worker('stockfish.js')` keeps engine off main thread |

---

## Summary of Changes Made

| File | Lines Changed | What Changed |
|------|--------------|--------------|
| `styles.css` | ~30 removed, ~25 added | Removed 3D transform; added reduced-motion, focus-visible, colorblind support |
| `chess.js` | ~75 removed, ~50 added | Removed dead code (hashPassword, getUsers, initAccountSystem); fixed innerHTML XSS patterns; incremental move history; fixed `chesseTips` typo |
| `Auth.js` | Full rewrite (~97 lines) | Added error handling, auth config options, email confirmation detection, subscription export |

**All changes tested via Playwright:** piece selection, move execution, AI response, move history display, and captured pieces all verified working.

---

## Recommended Next Steps (Priority Order)

1. **Migrate leaderboard to Supabase** - Create a `leaderboard` table with RLS policies. This is the biggest remaining security gap.
2. **Add `isready` sync to Stockfish protocol** - Prevents race conditions where commands are sent before the engine processes previous ones.
3. **Add keyboard navigation** - `tabindex` on squares, arrow key navigation, Enter to select/move. This is the biggest accessibility gap.
4. **Lazy-load Stockfish** - Only instantiate the Worker when a vs-computer game starts, not on page load.
5. **Inline piece SVGs** - Remove dependency on Wikimedia CDN availability.
6. **Add unit tests for move validation** - The most complex and bug-prone code in the project.
