import { Stats, Difficulty } from "./types";

export interface Achievement {
  id: string;
  title: string;
  desc: string;
  icon: string;
  check: (s: Stats, ctx: AchContext) => boolean;
}

export interface AchContext {
  moves: number;
  timeSec: number;
  difficulty: Difficulty;
  firstMoveWin: boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_win", title: "First Victory", desc: "Win your first game", icon: "🎉", check: (s) => s.wins >= 1 },
  { id: "win5", title: "Getting Warm", desc: "Win 5 games", icon: "🔥", check: (s) => s.wins >= 5 },
  { id: "win25", title: "Champion", desc: "Win 25 games", icon: "👑", check: (s) => s.wins >= 25 },
  { id: "streak3", title: "On Fire", desc: "Win 3 in a row", icon: "⚡", check: (s) => s.bestStreak >= 3 },
  { id: "streak5", title: "Unstoppable", desc: "Win 5 in a row", icon: "🚀", check: (s) => s.bestStreak >= 5 },
  { id: "beat_hard", title: "Tactician", desc: "Beat Hard CPU", icon: "🧠", check: (_s, c) => c.difficulty === "hard" && c.firstMoveWin },
  { id: "beat_imp", title: "The Impossible", desc: "Win vs Impossible CPU", icon: "💎", check: (_s, c) => c.difficulty === "impossible" && c.firstMoveWin },
  { id: "speed", title: "Speedster", desc: "Win in under 20s", icon: "⏱️", check: (_s, c) => c.firstMoveWin && c.timeSec < 20 },
  { id: "level5", title: "Rising Star", desc: "Reach level 5", icon: "⭐", check: (s) => s.level >= 5 },
  { id: "level10", title: "Legend", desc: "Reach level 10", icon: "🌟", check: (s) => s.level >= 10 },
];

export function xpForLevel(level: number): number {
  return Math.round(100 * Math.pow(1.18, level - 1));
}

export function addXp(stats: Stats, amount: number): { stats: Stats; leveledUp: boolean; gainedLevels: number } {
  let xp = stats.xp + amount;
  let level = stats.level;
  let leveledUp = false;
  let gainedLevels = 0;
  while (xp >= xpForLevel(level)) {
    xp -= xpForLevel(level);
    level++;
    leveledUp = true;
    gainedLevels++;
  }
  return { stats: { ...stats, xp, level }, leveledUp, gainedLevels };
}

export function checkNewAchievements(stats: Stats, ctx: AchContext): Achievement[] {
  if (!stats.achievements) stats.achievements = [];
  const newly: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (!stats.achievements.includes(a.id) && a.check(stats, ctx)) {
      stats.achievements.push(a.id);
      newly.push(a);
    }
  }
  return newly;
}

export function xpForOutcome(won: boolean, draw: boolean, difficulty: Difficulty, moves: number): number {
  if (draw) return 15;
  if (!won) return 5;
  const diffBonus: Record<Difficulty, number> = { easy: 30, medium: 50, hard: 80, impossible: 120 };
  const moveBonus = Math.max(0, 20 - moves) * 2; // faster = more
  return diffBonus[difficulty] + moveBonus;
}
