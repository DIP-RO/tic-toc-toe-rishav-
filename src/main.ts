import "./style.css";
import { Game3D } from "./game/Game3D";
import { chooseMove } from "./game/ai";
import { checkWin, emptyBoard } from "./game/logic";
import { SoundEngine } from "./game/sound";
import { loadSettings, saveSettings, loadStats, saveStats } from "./game/storage";
import {
  addXp, checkNewAchievements, xpForLevel, xpForOutcome, Achievement,
} from "./game/gamification";
import {
  Board, Player, Settings, Stats, THEMES, COLOR_OPTIONS, Theme,
} from "./game/types";

class App {
  private game: Game3D;
  private sound = new SoundEngine();
  private settings: Settings;
  private stats: Stats;
  private board: Board = emptyBoard();
  private current: Player = 1;
  private moves = 0;
  private startTime = 0;
  private gameOver = false;
  private aiThinking = false;
  private scores = { x: 0, o: 0 };

  constructor() {
    this.settings = loadSettings();
    this.stats = loadStats();
    this.sound.setEnabled(this.settings.sound);
    this.sound.setMusicVolume(this.settings.musicVolume);
    this.sound.setMusicEnabled(this.settings.music);

    const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
    const theme = this.currentTheme();
    this.game = new Game3D(canvas, theme, (i) => this.handleCellClick(i));
    this.game.applySettings(this.settings, theme);
    this.game.start();

    this.bindUI();
    this.renderCustomizeOptions();
    this.applySettingsToUI();
    this.bindStartScreen();
    this.refreshHud();
    this.refreshStats();
    this.startTime = performance.now();

    // Test hook for driving the game in dev; stripped from production builds
    if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = this;
  }

  // ===== Start screen =====
  private selectedStartMode: "pvc" | "pvp" = "pvc";

  private bindStartScreen() {
    const screen = document.getElementById("start-screen")!;
    const robotBtn = document.getElementById("opp-robot")!;
    const humanBtn = document.getElementById("opp-human")!;
    const diffWrap = document.getElementById("start-difficulty")!;
    const playBtn = document.getElementById("start-play")!;
    const customizeBtn = document.getElementById("start-customize")!;

    // Pre-select from saved settings
    this.selectedStartMode = this.settings.mode;
    this.updateOppSelection();
    diffWrap.classList.toggle("disabled", this.selectedStartMode === "pvp");

    const selectOpp = (mode: "pvc" | "pvp") => {
      this.sound.unlock();
      this.sound.click();
      this.selectedStartMode = mode;
      this.updateOppSelection();
      diffWrap.classList.toggle("disabled", mode === "pvp");
    };
    robotBtn.addEventListener("click", () => selectOpp("pvc"));
    humanBtn.addEventListener("click", () => selectOpp("pvp"));

    // Difficulty on start screen
    document.getElementById("start-diff-seg")!.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("button") as HTMLElement | null;
      if (!btn) return;
      this.sound.click();
      this.setSegActive("start-diff-seg", btn);
      this.settings.difficulty = btn.dataset.diff as any;
      saveSettings(this.settings);
      // keep in-game diff seg in sync
      this.selectSeg("diff-seg", "diff", this.settings.difficulty);
    });
    this.selectSeg("start-diff-seg", "diff", this.settings.difficulty);

    playBtn.addEventListener("click", () => {
      this.sound.unlock();
      this.sound.click();
      this.settings.mode = this.selectedStartMode;
      saveSettings(this.settings);
      // sync in-game mode seg
      this.selectSeg("mode-seg", "mode", this.settings.mode);
      document.getElementById("difficulty-group")!.style.display = this.settings.mode === "pvc" ? "" : "none";
      screen.hidden = true;
      this.newGame();
    });

    customizeBtn.addEventListener("click", () => {
      this.sound.click();
      document.getElementById("customize-panel")!.hidden = false;
      this.refreshStats();
    });
  }

  private updateOppSelection() {
    document.getElementById("opp-robot")!.classList.toggle("selected", this.selectedStartMode === "pvc");
    document.getElementById("opp-human")!.classList.toggle("selected", this.selectedStartMode === "pvp");
  }

  private currentTheme(): Theme {
    return THEMES.find((t) => t.id === this.settings.themeId) ?? THEMES[0];
  }

  // ===== Game flow =====
  private handleCellClick(index: number) {
    this.sound.unlock();
    if (this.gameOver || this.aiThinking) return;
    if (this.board[index] !== 0) { this.sound.invalid(); return; }

    // In PvC, human is always X (player 1). Ignore clicks during O's turn.
    if (this.settings.mode === "pvc" && this.current !== 1) return;

    this.playMove(index, this.current);
  }

  private playMove(index: number, player: Player) {
    this.board[index] = player;
    this.moves++;
    this.game.placePiece(index, player);
    this.sound.place();

    const result = checkWin(this.board);
    if (result.winner !== null || (result.line === null && this.board.every((c) => c !== 0))) {
      this.endGame(result);
      return;
    }

    this.current = this.current === 1 ? 2 : 1;
    this.refreshHud();

    if (this.settings.mode === "pvc" && this.current === 2 && !this.gameOver) {
      this.aiThinking = true;
      const delay = 420 + Math.random() * 380;
      setTimeout(() => {
        if (this.gameOver) { this.aiThinking = false; return; }
        const move = chooseMove(this.board.slice() as Board, 2, this.settings.difficulty);
        this.aiThinking = false;
        if (move >= 0) this.playMove(move, 2);
      }, delay);
    }
  }

  private endGame(result: { winner: Player | null; line: number[] | null }) {
    this.gameOver = true;
    const timeSec = Math.round((performance.now() - this.startTime) / 1000);
    const humanWon = result.winner === 1;
    const isDraw = result.winner === null;

    if (result.winner && result.line) {
      const color = result.winner === 1 ? this.settings.xColor : this.settings.oColor;
      this.game.highlightWinLine(result.line, color);
    }

    // Update scores
    if (humanWon) this.scores.x++;
    else if (result.winner === 2) this.scores.o++;

    // Stats + XP
    const xp = xpForOutcome(humanWon, isDraw, this.settings.difficulty, this.moves);
    let leveledUp = false;
    let gainedLevels = 0;

    if (this.settings.mode === "pvc") {
      if (humanWon) {
        this.stats.wins++;
        this.stats.streak++;
        this.stats.bestStreak = Math.max(this.stats.bestStreak, this.stats.streak);
        this.sound.win();
        this.game.spawnConfetti(this.settings.xColor);
      } else if (isDraw) {
        this.stats.draws++;
        this.stats.streak = 0;
        this.sound.draw();
      } else {
        this.stats.losses++;
        this.stats.streak = 0;
        this.sound.lose();
      }
      const r = addXp(this.stats, xp);
      this.stats = r.stats;
      leveledUp = r.leveledUp;
      gainedLevels = r.gainedLevels;

      // Achievements
      const ctx = { moves: this.moves, timeSec, difficulty: this.settings.difficulty, firstMoveWin: humanWon };
      const newAch: Achievement[] = checkNewAchievements(this.stats, ctx);
      for (const a of newAch) {
        this.showToast(a.icon, a.title, a.desc);
        this.sound.achievement();
      }
      if (leveledUp) {
        this.sound.levelup();
        this.showToast("⭐", `Level ${this.stats.level}!`, gainedLevels > 1 ? `Up ${gainedLevels} levels` : "Keep going!");
      }
      saveStats(this.stats);
    } else {
      // PvP: play win sound for whoever won, draw sound for draw
      if (result.winner !== null) this.sound.win();
      else this.sound.draw();
      if (result.winner) this.game.spawnConfetti(result.winner === 1 ? this.settings.xColor : this.settings.oColor);
    }

    this.refreshHud();
    this.refreshStats();
    this.showOverlay(result, xp, timeSec, leveledUp);
  }

  private newGame() {
    this.board = emptyBoard();
    this.current = 1;
    this.moves = 0;
    this.startTime = performance.now();
    this.gameOver = false;
    this.aiThinking = false;
    this.game.clearPieces();
    this.hideOverlay();
    this.refreshHud();
  }

  // ===== UI =====
  private bindUI() {
    document.getElementById("btn-new")!.addEventListener("click", () => { this.sound.click(); this.newGame(); });
    document.getElementById("overlay-continue")!.addEventListener("click", () => { this.sound.click(); this.newGame(); });

    const panel = document.getElementById("customize-panel")!;
    document.getElementById("btn-customize")!.addEventListener("click", () => {
      this.sound.click();
      panel.hidden = false;
      this.refreshStats();
    });
    document.getElementById("customize-close")!.addEventListener("click", () => { this.sound.click(); panel.hidden = true; });

    const soundBtn = document.getElementById("btn-sound")!;
    soundBtn.addEventListener("click", () => {
      this.settings.sound = !this.settings.sound;
      this.sound.setEnabled(this.settings.sound);
      saveSettings(this.settings);
      this.updateSoundIcon();
      if (this.settings.sound) { this.sound.unlock(); this.sound.click(); }
    });

    // Music toggle button
    const musicBtn = document.getElementById("btn-music")!;
    musicBtn.addEventListener("click", () => {
      this.settings.music = !this.settings.music;
      this.sound.setMusicEnabled(this.settings.music);
      saveSettings(this.settings);
      this.updateMusicIcon();
      if (this.settings.music) { this.sound.unlock(); }
    });

    // Music on/off in customize panel
    document.getElementById("music-seg")!.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("button") as HTMLElement | null;
      if (!btn) return;
      this.sound.click();
      this.setSegActive("music-seg", btn);
      this.settings.music = btn.dataset.music === "on";
      this.sound.setMusicEnabled(this.settings.music);
      saveSettings(this.settings);
      this.updateMusicIcon();
      if (this.settings.music) this.sound.unlock();
    });

    // Music volume slider
    const volSlider = document.getElementById("music-volume") as HTMLInputElement;
    volSlider.addEventListener("input", () => {
      this.settings.musicVolume = Number(volSlider.value) / 100;
      this.sound.setMusicVolume(this.settings.musicVolume);
      saveSettings(this.settings);
    });

    // Mode segmented
    document.getElementById("mode-seg")!.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("button") as HTMLElement | null;
      if (!btn) return;
      this.sound.click();
      this.setSegActive("mode-seg", btn);
      this.settings.mode = btn.dataset.mode as any;
      document.getElementById("difficulty-group")!.style.display = this.settings.mode === "pvc" ? "" : "none";
      saveSettings(this.settings);
      this.newGame();
    });

    document.getElementById("diff-seg")!.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("button") as HTMLElement | null;
      if (!btn) return;
      this.sound.click();
      this.setSegActive("diff-seg", btn);
      this.settings.difficulty = btn.dataset.diff as any;
      saveSettings(this.settings);
    });

    document.getElementById("piece-seg")!.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("button") as HTMLElement | null;
      if (!btn) return;
      this.sound.click();
      this.setSegActive("piece-seg", btn);
      this.settings.pieceStyle = btn.dataset.piece as any;
      this.applyVisualSettings();
      saveSettings(this.settings);
    });

    document.getElementById("anim-seg")!.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("button") as HTMLElement | null;
      if (!btn) return;
      this.sound.click();
      this.setSegActive("anim-seg", btn);
      this.settings.boardAnim = btn.dataset.anim as any;
      this.applyVisualSettings();
      saveSettings(this.settings);
    });

    const nameInput = document.getElementById("name-input") as HTMLInputElement;
    nameInput.addEventListener("input", () => {
      this.settings.playerName = nameInput.value.trim() || "You";
      saveSettings(this.settings);
      this.refreshHud();
    });

    document.getElementById("btn-reset-stats")!.addEventListener("click", () => {
      this.sound.click();
      this.stats = { wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0, level: 1, xp: 0, achievements: [] };
      saveStats(this.stats);
      this.refreshStats();
      this.refreshHud();
    });

    // Prevent gesture zoom / context menu on canvas
    document.getElementById("game-canvas")!.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private setSegActive(segId: string, active: HTMLElement) {
    document.querySelectorAll(`#${segId} button`).forEach((b) => b.classList.remove("active"));
    active.classList.add("active");
  }

  private renderCustomizeOptions() {
    // Themes
    const themeGrid = document.getElementById("theme-grid")!;
    themeGrid.innerHTML = "";
    for (const t of THEMES) {
      const sw = document.createElement("div");
      sw.className = "theme-swatch";
      sw.style.background = `linear-gradient(135deg, #${t.bg.toString(16).padStart(6, "0")}, #${t.bg2.toString(16).padStart(6, "0")})`;
      sw.style.boxShadow = `inset 0 0 0 3px #${t.grid.toString(16).padStart(6, "0")}`;
      sw.title = t.name;
      if (t.id === this.settings.themeId) sw.classList.add("active");
      sw.addEventListener("click", () => {
        this.sound.click();
        themeGrid.querySelectorAll(".theme-swatch").forEach((s) => s.classList.remove("active"));
        sw.classList.add("active");
        this.settings.themeId = t.id;
        this.applyVisualSettings();
        saveSettings(this.settings);
      });
      themeGrid.appendChild(sw);
    }

    // Color rows
    this.buildColorRow("board-colors", "boardColor");
    this.buildColorRow("x-colors", "xColor");
    this.buildColorRow("o-colors", "oColor");
  }

  private buildColorRow(containerId: string, key: keyof Settings) {
    const container = document.getElementById(containerId)!;
    container.innerHTML = "";
    for (const c of COLOR_OPTIONS) {
      const dot = document.createElement("div");
      dot.className = "color-dot";
      const hex = `#${c.toString(16).padStart(6, "0")}`;
      dot.style.background = hex;
      dot.style.color = hex;
      if ((this.settings[key] as unknown as number) === c) dot.classList.add("active");
      dot.addEventListener("click", () => {
        this.sound.click();
        container.querySelectorAll(".color-dot").forEach((d) => d.classList.remove("active"));
        dot.classList.add("active");
        (this.settings[key] as unknown as number) = c;
        this.applyVisualSettings();
        saveSettings(this.settings);
      });
      container.appendChild(dot);
    }
  }

  private applyVisualSettings() {
    const theme = this.currentTheme();
    this.game.applySettings(this.settings, theme);
    // Update CSS accent vars for X/O colors
    document.documentElement.style.setProperty("--x-color", `#${this.settings.xColor.toString(16).padStart(6, "0")}`);
    document.documentElement.style.setProperty("--o-color", `#${this.settings.oColor.toString(16).padStart(6, "0")}`);
    this.refreshHud();
  }

  private applySettingsToUI() {
    // Segmented controls
    this.selectSeg("mode-seg", `mode`, this.settings.mode);
    this.selectSeg("diff-seg", `diff`, this.settings.difficulty);
    this.selectSeg("piece-seg", `piece`, this.settings.pieceStyle);
    this.selectSeg("anim-seg", `anim`, this.settings.boardAnim);
    document.getElementById("difficulty-group")!.style.display = this.settings.mode === "pvc" ? "" : "none";
    (document.getElementById("name-input") as HTMLInputElement).value = this.settings.playerName === "You" ? "" : this.settings.playerName;
    this.updateSoundIcon();
    this.updateMusicIcon();
    this.selectSeg("music-seg", "music", this.settings.music ? "on" : "off");
    (document.getElementById("music-volume") as HTMLInputElement).value = String(Math.round(this.settings.musicVolume * 100));
    this.applyVisualSettings();
  }

  private selectSeg(segId: string, dataKey: string, value: string) {
    const buttons = document.querySelectorAll(`#${segId} button`);
    buttons.forEach((b) => {
      b.classList.toggle("active", (b as HTMLElement).dataset[dataKey] === value);
    });
  }

  private updateSoundIcon() {
    document.getElementById("sound-on")!.hidden = !this.settings.sound;
    document.getElementById("sound-off")!.hidden = this.settings.sound;
  }

  private updateMusicIcon() {
    document.getElementById("music-on")!.hidden = !this.settings.music;
    document.getElementById("music-off")!.hidden = this.settings.music;
  }

  private refreshHud() {
    const isPvP = this.settings.mode === "pvp";
    document.getElementById("player-x-name")!.textContent = this.settings.playerName || "You";
    document.getElementById("player-o-name")!.textContent = isPvP ? "Player 2" : "CPU";
    document.getElementById("player-x-score")!.textContent = String(this.scores.x);
    document.getElementById("player-o-score")!.textContent = String(this.scores.o);

    const turnSym = document.getElementById("turn-symbol")!;
    turnSym.textContent = this.current === 1 ? "X" : "O";
    turnSym.classList.toggle("o", this.current === 2);

    document.getElementById("player-x-card")!.classList.toggle("active", !this.gameOver && this.current === 1);
    document.getElementById("player-o-card")!.classList.toggle("active", !this.gameOver && this.current === 2);

    // Streak
    const streakBadge = document.getElementById("streak-badge")!;
    const streakText = document.getElementById("streak-text")!;
    if (!isPvP && this.stats.streak >= 2) {
      streakBadge.hidden = false;
      streakText.textContent = `🔥 Streak ${this.stats.streak}`;
    } else {
      streakBadge.hidden = true;
    }

    // XP bar
    document.getElementById("level-pill")!.textContent = `Lv ${this.stats.level}`;
    const need = xpForLevel(this.stats.level);
    document.getElementById("xp-text")!.textContent = `${this.stats.xp} / ${need} XP`;
    document.getElementById("xp-fill")!.style.width = `${(this.stats.xp / need) * 100}%`;
  }

  private refreshStats() {
    document.getElementById("st-wins")!.textContent = String(this.stats.wins);
    document.getElementById("st-losses")!.textContent = String(this.stats.losses);
    document.getElementById("st-draws")!.textContent = String(this.stats.draws);
    document.getElementById("st-best")!.textContent = String(this.stats.bestStreak);
  }

  private showOverlay(result: { winner: Player | null; line: number[] | null }, xp: number, timeSec: number, leveledUp: boolean) {
    const overlay = document.getElementById("overlay")!;
    const emoji = document.getElementById("overlay-emoji")!;
    const title = document.getElementById("overlay-title")!;
    const sub = document.getElementById("overlay-subtitle")!;
    const isPvP = this.settings.mode === "pvp";

    if (result.winner === null) {
      emoji.textContent = "🤝";
      title.textContent = "Draw!";
      sub.textContent = isPvP ? "Evenly matched" : `+${xp} XP earned`;
    } else if (result.winner === 1) {
      emoji.textContent = "🎉";
      title.textContent = isPvP ? "Player X Wins!" : `${this.settings.playerName} Wins!`;
      sub.textContent = isPvP ? "GG!" : leveledUp ? `+${xp} XP • Level Up!` : `+${xp} XP earned`;
    } else {
      emoji.textContent = isPvP ? "🎉" : "😔";
      title.textContent = isPvP ? "Player O Wins!" : "CPU Wins";
      sub.textContent = isPvP ? "GG!" : `+${xp} XP earned`;
    }
    document.getElementById("ov-moves")!.textContent = String(this.moves);
    document.getElementById("ov-time")!.textContent = `${timeSec}s`;
    document.getElementById("ov-xp")!.textContent = `+${xp}`;
    overlay.hidden = false;
  }

  private hideOverlay() { document.getElementById("overlay")!.hidden = true; }

  private showToast(icon: string, title: string, desc: string) {
    const toast = document.getElementById("toast")!;
    document.getElementById("toast-title")!.textContent = title;
    document.getElementById("toast-desc")!.textContent = desc;
    toast.querySelector(".toast-icon")!.textContent = icon;
    toast.hidden = false;
    toast.classList.remove("out");
    clearTimeout((toast as any)._t);
    (toast as any)._t = setTimeout(() => {
      toast.classList.add("out");
      setTimeout(() => { toast.hidden = true; }, 320);
    }, 3000);
  }
}

new App();
