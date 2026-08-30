export type Cell = 0 | 1 | 2; // 0 empty, 1 = X, 2 = O
export type Board = Cell[];
export type Player = 1 | 2;
export type Mode = "pvc" | "pvp";
export type Difficulty = "easy" | "medium" | "hard" | "impossible";
export type PieceStyle = "solid" | "glass" | "neon" | "metal";
export type BoardAnim = "float" | "spin" | "static";

export interface Theme {
  id: string;
  name: string;
  bg: number;       // scene background top
  bg2: number;      // scene background bottom
  grid: number;     // grid line color
  glow: number;     // ambient glow color
  fog: number;
}

export interface Settings {
  mode: Mode;
  difficulty: Difficulty;
  themeId: string;
  boardColor: number;
  xColor: number;
  oColor: number;
  pieceStyle: PieceStyle;
  boardAnim: BoardAnim;
  playerName: string;
  sound: boolean;
  music: boolean;
  musicVolume: number; // 0..1
}

export interface Stats {
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  bestStreak: number;
  level: number;
  xp: number;
  achievements: string[];
}

export interface WinResult {
  winner: Player | null; // null = draw
  line: number[] | null; // indices of winning cells
}

export const DEFAULT_SETTINGS: Settings = {
  mode: "pvc",
  difficulty: "medium",
  themeId: "nebula",
  boardColor: 0x7c5cff,
  xColor: 0xff4d6d,
  oColor: 0x4dd0ff,
  pieceStyle: "neon",
  boardAnim: "float",
  playerName: "You",
  sound: true,
  music: true,
  musicVolume: 0.35,
};

export const DEFAULT_STATS: Stats = {
  wins: 0,
  losses: 0,
  draws: 0,
  streak: 0,
  bestStreak: 0,
  level: 1,
  xp: 0,
  achievements: [],
};

export const THEMES: Theme[] = [
  { id: "nebula", name: "Nebula", bg: 0x07071a, bg2: 0x1a0a3a, grid: 0x7c5cff, glow: 0x6a4fff, fog: 0x0a0a22 },
  { id: "ocean", name: "Ocean", bg: 0x021526, bg2: 0x03346e, grid: 0x00e5ff, glow: 0x0099cc, fog: 0x021526 },
  { id: "sunset", name: "Sunset", bg: 0x1a0810, bg2: 0x4a1530, grid: 0xff7e00, glow: 0xff4d6d, fog: 0x1a0810 },
  { id: "forest", name: "Forest", bg: 0x04140a, bg2: 0x0d3318, grid: 0x4cff8f, glow: 0x2faf5f, fog: 0x04140a },
  { id: "candy", name: "Candy", bg: 0x2a0a2e, bg2: 0x5a1a5e, grid: 0xff6ec7, glow: 0xc060ff, fog: 0x2a0a2e },
  { id: "mono", name: "Mono", bg: 0x0a0a0a, bg2: 0x2a2a2a, grid: 0xffffff, glow: 0x888888, fog: 0x0a0a0a },
  { id: "gold", name: "Gold", bg: 0x1a1200, bg2: 0x3d2e00, grid: 0xffd700, glow: 0xffaa00, fog: 0x1a1200 },
  { id: "ice", name: "Ice", bg: 0x081420, bg2: 0x0e2a4a, grid: 0xa0e0ff, glow: 0x60a0ff, fog: 0x081420 },
];

export const COLOR_OPTIONS = [
  0xff4d6d, 0xff7e00, 0xffd700, 0x4cff8f,
  0x00e5ff, 0x4dd0ff, 0x7c5cff, 0xc060ff,
  0xff6ec7, 0xffffff, 0xff3333, 0x33ff88,
];
