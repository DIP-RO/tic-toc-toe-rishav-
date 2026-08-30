# Tic Tac Toe 3D

A 3D animated, mobile-responsive Tic Tac Toe game built with TypeScript and Three.js.

**🎮 Play it live: [tic-toc-toe-three-sigma.vercel.app](https://tic-toc-toe-three-sigma.vercel.app)**

## Features

- **3D WebGL board** with animated pieces (drop-in bounce, idle rotation, float)
- **Mobile-first design** — feels like a native app (safe-area aware, no zoom, touch-optimized)
- **Two modes** — Play vs Robot AI or Real Opponent (2 players, 1 device)
- **4 AI difficulties** — Easy, Medium, Hard, Impossible (unbeatable minimax)
- **Gamification** — XP, levels, achievements, win streaks, stats tracking
- **Procedural audio** — sound effects + calm ambient music (no audio files, Web Audio API)
- **Full customization** — 8 themes, piece styles (solid/glass/neon/metal), colors, board animations
- **Persistent settings** — everything saved to localStorage

## Tech Stack

- TypeScript
- Three.js (3D rendering)
- Vite (build tooling)
- Web Audio API (procedural sound)

## Getting Started

```bash
npm install
npm run dev      # development
npm run build    # production build to dist/
npm run preview  # preview production build
```

## License

MIT
