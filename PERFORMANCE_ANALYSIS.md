# Chess Game - Performance Analysis

**Date:** 2026-02-15
**Scope:** Deep analysis of all performance bottlenecks causing perceived lag during gameplay.

---

## Executive Summary

The game feels sluggish for three categories of reasons, listed by impact:

1. **CSS rendering cost** - Every piece on the board has 5 `drop-shadow()` filters + brightness/contrast/saturate adjustments. Each of the 64 squares has 3 stacked gradients. The browser's GPU compositor is doing massive work on every repaint.
2. **Move validation complexity** - `findKing()` does a full O(64) board scan with no caching, and it's called 10-15 times per single move through the check detection call chain.
3. **Redundant work per move** - `finishTurn()` calls `isInCheck()` and `hasAnyValidMoves()` separately, meaning the king is located, check is tested, and all moves are generated twice in the worst case.

---

## Bottleneck #1: CSS Rendering (Highest Impact)

### Piece Filters — `styles.css:596-618`

Every `.piece` element (up to 32 on the board) has this filter stack:

```css
filter:
    drop-shadow(0 1px 1px rgba(0, 0, 0, 0.4))
    drop-shadow(1px 2px 1px rgba(0, 0, 0, 0.5))
    drop-shadow(2px 4px 2px rgba(0, 0, 0, 0.4))
    drop-shadow(3px 6px 4px rgba(0, 0, 0, 0.25))
    drop-shadow(4px 8px 8px rgba(0, 0, 0, 0.15))
    brightness(1.08) contrast(1.08) saturate(1.05);
```

**Why this is expensive:** Each `drop-shadow()` is a separate filter pass. The browser must rasterize the piece image, then apply 5 blur operations sequentially, then adjust brightness/contrast/saturate — totaling **8 filter passes per piece**. With 32 pieces, that's **256 filter operations** on every repaint.

**Hover adds more** (`styles.css:635-643`): When hovering a piece, the filter changes to 4 larger `drop-shadow()` values, triggering a full recomposite.

**Selected piece is worst** (`styles.css:645-658`): A selected piece has 4 `drop-shadow()` filters PLUS an infinite `pieceFloat` animation that continuously triggers repaints:

```css
animation: pieceFloat 1.5s ease-in-out infinite;
```

### Square Gradients — `styles.css:517-553`

Every light and dark square has **3 stacked CSS gradients**:

```css
.square.light {
    background:
        radial-gradient(ellipse 120% 80% at 30% 20%, ...),     /* reflection */
        repeating-linear-gradient(92deg, ...),                   /* wood grain */
        linear-gradient(145deg, ...);                            /* base color */
}
```

64 squares × 3 gradients = **192 gradient calculations** on the board. These are re-evaluated whenever the board repaints.

### Additional CSS Costs

| Selector | Location | Cost |
|----------|----------|------|
| `.square:has(.piece)::before` | `styles.css:621-633` | `:has()` pseudo-class forces the browser to evaluate parent-child relationships. Applied to all 64 squares. Creates a `radial-gradient` pseudo-element for base shadows. |
| `.square.check` animation | `styles.css:583-594` | `checkPulse` runs an infinite `box-shadow` animation that triggers repaints every frame while a king is in check. |
| `#board` box-shadow | `styles.css:111-118` | 5 layered `box-shadow` values on the board container. |
| `.table-surface` | `styles.css:155-200` | 4 `box-shadow` layers + 3 stacked gradients + a `::before` pseudo-element with 2 `repeating-linear-gradient` wood grain textures. |

### Estimated CSS Impact

On a mid-range device, the filter stack alone can add **8-15ms** per frame during interactions (piece hover, selection, move animation). On a 60fps budget of 16.6ms, this consumes most or all of the frame budget before any JavaScript runs.

---

## Bottleneck #2: Uncached King Lookup (High Impact)

### `findKing()` — `chess.js:2042-2052`

```javascript
findKing(color) {
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = this.board[row][col];
            if (piece && piece.type === 'king' && piece.color === color) {
                return { row, col };
            }
        }
    }
    return null;
}
```

This does a **linear scan of all 64 squares** every time it's called. The king's position rarely changes, but `findKing()` is called through these chains:

```
finishTurn()
├── checkForDraw()
│   └── getPositionKey()           // No findKing, but iterates board (64 squares)
├── isInCheck(currentPlayer)       // Call #1
│   └── findKing()                 ← O(64)
│   └── isSquareAttacked()
├── hasAnyValidMoves(currentPlayer)
│   └── for each of 16 pieces:
│       └── for each candidate move:
│           └── wouldBeInCheck()
│               └── isInCheck()    // Calls #2-#N
│                   └── findKing() ← O(64) EACH TIME
└── updateBoard()
    ├── findKing()                 ← O(64) again
    └── isInCheck()
        └── findKing()             ← O(64) again
```

**Call count per move:** In a typical mid-game position with ~30 candidate moves to validate, `findKing()` is called approximately **35-40 times** per single move. That's 35 × 64 = ~2,240 board cell accesses just for king lookups.

### Fix: Cache the king position

Track king positions in `this.kingPos = { white: {row, col}, black: {row, col} }`. Update it in `makeMove()` when a king moves. This reduces `findKing()` from O(64) to O(1) and eliminates ~2,200 wasted iterations per move.

---

## Bottleneck #3: Redundant Check/Move Validation in `finishTurn()` (High Impact)

### `finishTurn()` — `chess.js:1466-1560`

The turn-ending logic calls both `isInCheck()` and `hasAnyValidMoves()` independently:

```javascript
const inCheck = this.isInCheck(this.currentPlayer);           // line 1502
const hasValidMoves = this.hasAnyValidMoves(this.currentPlayer); // line 1503
```

`isInCheck()` internally calls `findKing()` + `isSquareAttacked()`.
`hasAnyValidMoves()` loops all 16 pieces, generates all candidate moves, and for EACH candidate move calls `wouldBeInCheck()` → `isInCheck()` → `findKing()` + `isSquareAttacked()`.

So `isInCheck()` is called once directly, then called again 30+ times inside `hasAnyValidMoves()`. The first call's result isn't reused.

Additionally, `updateBoard()` (called later at line 1497 in some branches, or implicitly) calls `isInCheck()` again.

### `hasAnyValidMoves()` — `chess.js:2205-2231`

```javascript
hasAnyValidMoves(color) {
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = this.board[row][col];
            if (piece && piece.color === color) {
                let moves = this.get[PieceType]Moves(row, col, color);
                for (const move of moves) {
                    if (!this.wouldBeInCheck(row, col, move.row, move.col, color)) {
                        return true;  // Early exit on first legal move
                    }
                }
            }
        }
    }
    return false;
}
```

**Best case:** Finds a legal move for the first piece checked → exits quickly.
**Worst case (stalemate check):** Must verify ALL moves for ALL 16 pieces, each calling `wouldBeInCheck()`. Complexity is **O(16 pieces × ~10 moves each × 64 for findKing × ~28 for isSquareAttacked)** ≈ O(286,720) operations.

The early exit helps for non-stalemate positions, but this is still the most expensive single function call per move.

---

## Bottleneck #4: `getPositionKey()` String Concatenation (Medium Impact)

### `getPositionKey()` — `chess.js:1658-1675`

```javascript
getPositionKey() {
    let key = '';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = this.board[r][c];
            if (piece) {
                key += `${piece.color[0]}${piece.type[0]}${r}${c}`;
            }
        }
    }
    key += this.currentPlayer;
    key += JSON.stringify(this.castlingRights);
    // ...
}
```

**Issues:**
1. **String concatenation in a loop** — Each `+=` on a string creates a new string object. With ~32 pieces, that's ~32 intermediate string allocations that immediately become garbage, creating GC pressure.
2. **`JSON.stringify(this.castlingRights)` on every call** — Serializes a nested object to JSON just to append to a key. This is called once per move via `finishTurn()`.

### `checkForDraw()` calls it twice — `chess.js:1677-1696`

```javascript
checkForDraw() {
    // ...
    const currentPosition = this.getPositionKey();                    // Call #1
    const occurrences = this.positionHistory.filter(p => p === currentPosition).length;  // O(n)
    // ...
}
```

The `positionHistory.filter()` does a **linear scan** of the entire position history. In a 100-move game, this is 100 string comparisons on every move. And `getPositionKey()` was already called once in `finishTurn()` at line 1484 — then `checkForDraw()` calls it again at line 1684. That's **2 calls per move** when 1 would suffice.

### Fix: Use array-based key or integer hashing

Replace string concatenation with array join or Zobrist hashing (XOR-based position hash). Pass the position key from `finishTurn()` into `checkForDraw()` to avoid computing it twice. Use a Map to count occurrences in O(1) instead of `.filter()` in O(n).

---

## Bottleneck #5: `generateFEN()` String Building (Medium Impact)

### `generateFEN()` — `chess.js:1796-1845`

Similar string concatenation pattern as `getPositionKey()` — builds a FEN string with `+=` in a loop over 64 squares. Called every time the engine needs to make a move (to send `position fen ... go depth N` to Stockfish).

Not as frequent as `getPositionKey()` (only on engine moves, not every move), but still allocates ~20+ intermediate strings per call.

---

## Bottleneck #6: `updateBoard()` Always Processes All 64 Squares (Medium Impact)

### `updateBoard()` — `chess.js:876-937`

The current implementation (already optimized from the full `renderBoard()` rebuild) still:

1. Iterates all 64 squares on every call
2. Performs 5 `classList.toggle()` calls per square = **320 classList operations per updateBoard()**
3. Calls `findKing()` + `isInCheck()` at the top (another king scan + attack check)
4. Calls `updateCapturedPieces()` on every update, which clears and rebuilds the captured piece tray via `innerHTML = ''`

Most moves only affect 2-4 squares (from-square, to-square, maybe castling rook or en passant). The other 60+ squares don't need their classes toggled.

### Fix: Track dirty squares

Maintain a set of squares that changed since last render. Only process those squares in `updateBoard()`. This reduces the per-move DOM work from O(64) to O(2-4).

---

## Bottleneck #7: Clock Tick Rate (Low-Medium Impact)

### `startClock()` — `chess.js` (clock interval)

```javascript
this.clockInterval = setInterval(() => this.tickClock(), 100);
```

The clock ticks **10 times per second**. `tickClock()` calls `updateClockDisplay()` on every tick. While `updateClockDisplay()` has been optimized to skip DOM updates when the formatted string hasn't changed (lines 2383-2405), it still:

1. Calls `formatTime()` twice per tick (player + opponent)
2. Performs 2 string comparisons per tick
3. Runs the `tickClock()` function itself, which computes `Date.now()` and does arithmetic

Since the display only shows seconds (format `M:SS`), the text only changes once per second. The other 9 ticks per second are wasted computation.

### Fix: Use 1000ms interval

Change from 100ms to 1000ms. For sub-second accuracy on time-critical operations (flagging at 0:00), use `Date.now()` comparison in the move handler rather than relying on tick granularity.

---

## Bottleneck #8: Multiple `setTimeout` Calls in `finishTurn()` (Low Impact)

### `finishTurn()` — `chess.js:1466-1600`

After each move, `finishTurn()` schedules multiple `setTimeout` callbacks:

```javascript
setTimeout(() => this.sendGameMessage('gameEnd', 'playerWin'), 500);   // line 1549
setTimeout(() => this.analyzeOpponentMove(lastMoveData), 400);         // line 1519
setTimeout(() => this.sendGameMessage('capture', ...), 300);           // varies
setTimeout(() => this.makeEngineMove(), 500);                          // engine move
```

Each `setTimeout` creates a closure, captures variables, and schedules a callback. While individually cheap, having 3-4 scheduled per move adds up. The real issue is that the engine move delay (500ms) makes every AI response feel artificially slow, even when Stockfish responds in <50ms.

---

## Bottleneck #9: `updateCapturedPieces()` Full Rebuild (Low Impact)

### `_buildCapturedPieceElements()` — `chess.js:2277-2287`

```javascript
_buildCapturedPieceElements(container, pieces, extraClass) {
    container.innerHTML = '';
    for (const p of pieces) {
        const img = document.createElement('img');
        // ...
        container.appendChild(img);
    }
}
```

Called via `updateCapturedPieces()` from `updateBoard()`, this clears and rebuilds ALL captured piece images on every single board update — even when no capture occurred. In a late game with 15 captured pieces, that's 15 elements destroyed and recreated when a non-capturing move is made.

### Fix: Only update when capture count changes

Cache `this.capturedPieces.white.length + this.capturedPieces.black.length`. Only rebuild the tray when the count changes.

---

## Summary: Cost Per Move

| Operation | Approx. Cost | Frequency |
|-----------|-------------|-----------|
| CSS filter repaints (32 pieces × 8 passes) | 8-15ms | Every repaint |
| CSS gradient calculations (64 squares × 3) | 2-5ms | Every repaint |
| `hasAnyValidMoves()` (worst case) | 3-8ms | Every move |
| `findKing()` × 35-40 calls | 0.5-1ms | Every move |
| `getPositionKey()` × 2 + `.filter()` | 0.2-0.5ms | Every move |
| `updateBoard()` 320 classList toggles | 0.5-1ms | Every move |
| `updateCapturedPieces()` full rebuild | 0.1-0.3ms | Every move |
| Clock tick overhead (9 wasted ticks/sec) | 0.1ms × 9 | Continuous |

**Total per-move cost (JS + paint):** ~15-30ms on a mid-range device, which creates perceptible lag especially when combined with the 500ms artificial delay before engine moves.

---

## Recommended Fixes (Priority Order)

### 1. Simplify Piece CSS Filters (Biggest single win)
Reduce from 5 `drop-shadow()` to 1-2. Remove `brightness`/`contrast`/`saturate` if not visually critical. This alone could cut repaint time by 60-70%.

```css
/* Before: 8 filter passes */
filter: drop-shadow(0 1px 1px ...) drop-shadow(1px 2px 1px ...)
        drop-shadow(2px 4px 2px ...) drop-shadow(3px 6px 4px ...)
        drop-shadow(4px 8px 8px ...) brightness(1.08) contrast(1.08) saturate(1.05);

/* After: 2 filter passes */
filter: drop-shadow(1px 3px 3px rgba(0,0,0,0.4))
        drop-shadow(3px 6px 8px rgba(0,0,0,0.2));
```

### 2. Cache King Position
Store `this.kingPos[color]` and update it only when a king moves. Eliminates ~2,200 wasted board iterations per move.

### 3. Simplify Square Gradients
Replace 3 stacked gradients with a single `background-color` or at most 1 gradient. Use CSS custom properties for light/dark colors.

### 4. Reduce Clock Tick to 1000ms
Change `setInterval(..., 100)` to `setInterval(..., 1000)`. Use `Date.now()` for precise time-of-flag detection.

### 5. Avoid Redundant isInCheck() Calls
Pass the `inCheck` result from `finishTurn()` into `updateBoard()` instead of recomputing it. Reuse the `getPositionKey()` result between `finishTurn()` and `checkForDraw()`.

### 6. Skip updateCapturedPieces() When No Capture Occurred
Only rebuild the captured piece tray when `this.capturedPieces` actually changed.

### 7. Dirty-Square Tracking for updateBoard()
Only toggle classes on squares that were affected by the last move (typically 2-4 squares instead of 64).

### 8. Replace positionHistory.filter() with a Map
Use `Map<string, number>` to count position occurrences in O(1) instead of O(n) linear scan.

### 9. Reduce Engine Move Delay
Lower the `setTimeout` before `makeEngineMove()` from 500ms to 100-200ms. The artificial delay adds perceived lag on top of actual computation time.
