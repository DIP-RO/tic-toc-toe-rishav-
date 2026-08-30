import { Board, Difficulty, Player } from "./types";
import { availableMoves, checkWin, WIN_LINES } from "./logic";

// Minimax with alpha-beta. ai=2 (O), human=1 (X) by convention; works either way.
function minimax(board: Board, ai: Player, current: Player, depth: number, alpha: number, beta: number): number {
  const res = checkWin(board);
  if (res.winner === ai) return 10 - depth;
  if (res.winner !== null && res.winner !== ai) return depth - 10;
  if (res.line === null && availableMoves(board).length === 0) return 0; // draw

  const opp: Player = current === 1 ? 2 : 1;
  const moves = availableMoves(board);
  if (current === ai) {
    let best = -Infinity;
    for (const m of moves) {
      board[m] = current;
      const score = minimax(board, ai, opp, depth + 1, alpha, beta);
      board[m] = 0;
      best = Math.max(best, score);
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      board[m] = current;
      const score = minimax(board, ai, opp, depth + 1, alpha, beta);
      board[m] = 0;
      best = Math.min(best, score);
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function bestMove(board: Board, ai: Player): number {
  const opp: Player = ai === 1 ? 2 : 1;
  let best = -Infinity;
  let move = availableMoves(board)[0];
  for (const m of availableMoves(board)) {
    board[m] = ai;
    const score = minimax(board, ai, opp, 0, -Infinity, Infinity);
    board[m] = 0;
    if (score > best) { best = score; move = m; }
  }
  return move;
}

// Find a move that completes a line for `player`, else blocks opponent's winning line.
function findCritical(board: Board, player: Player): number | null {
  for (const line of WIN_LINES) {
    const vals = line.map((i) => board[i]);
    const playerCount = vals.filter((v) => v === player).length;
    const emptyIdx = line.find((i) => board[i] === 0);
    if (playerCount === 2 && emptyIdx !== undefined) return emptyIdx;
  }
  return null;
}

export function chooseMove(board: Board, ai: Player, difficulty: Difficulty): number {
  const moves = availableMoves(board);
  if (moves.length === 0) return -1;
  const opp: Player = ai === 1 ? 2 : 1;

  switch (difficulty) {
    case "easy":
      // 70% random, 30% take win if available
      if (Math.random() < 0.3) {
        const win = findCritical(board, ai);
        if (win !== null) return win;
      }
      return moves[Math.floor(Math.random() * moves.length)];

    case "medium": {
      // Always win if possible; 65% block; otherwise random with center preference
      const win = findCritical(board, ai);
      if (win !== null) return win;
      if (Math.random() < 0.65) {
        const block = findCritical(board, opp);
        if (block !== null) return block;
      }
      if (board[4] === 0 && Math.random() < 0.6) return 4;
      return moves[Math.floor(Math.random() * moves.length)];
    }

    case "hard": {
      // Win, block, center, then minimax with 25% randomness
      const win = findCritical(board, ai);
      if (win !== null) return win;
      const block = findCritical(board, opp);
      if (block !== null) return block;
      if (board[4] === 0) return 4;
      if (Math.random() < 0.25) return moves[Math.floor(Math.random() * moves.length)];
      return bestMove(board, ai);
    }

    case "impossible":
    default:
      return bestMove(board, ai);
  }
}
