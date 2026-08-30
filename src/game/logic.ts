import { Board, WinResult, Player } from "./types";

export const WIN_LINES: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6],            // diagonals
];

export function emptyBoard(): Board {
  return Array(9).fill(0) as Board;
}

export function checkWin(board: Board): WinResult {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    const v = board[a];
    if (v !== 0 && v === board[b] && v === board[c]) {
      return { winner: v as Player, line };
    }
  }
  if (board.every((c) => c !== 0)) return { winner: null, line: null };
  return { winner: null, line: null };
}

export function availableMoves(board: Board): number[] {
  const moves: number[] = [];
  for (let i = 0; i < 9; i++) if (board[i] === 0) moves.push(i);
  return moves;
}
