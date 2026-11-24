# TRIAD — Solo Pattern Card Game

A clean, responsive visual pattern card game built with vanilla HTML, CSS, and JavaScript. Designed for both desktop and mobile browsers and ready to host directly on **GitHub Pages**.

## Game Modes

- **Classic (81-card deck):** Shuffled 81-card deck with fair random dealing. Keeps **at least 9 cards** on the table (or optionally 12) and always refills back to 9 while cards remain in the deck.
- **No Triad!:** Call when no valid Triad exists on the table to earn bonus points and deal 3 more random cards until the deck runs out.
- **Smart Speed Scoring:** Faster matches award more points, weighted by how many valid Triads were actually present on the board. Completed games save your **Best Time** and **Highscore** locally.
- **Daily Puzzle:** Deterministic daily 12-card board with 6 hidden Triads, shared across all players on the same date.
- **3rd Card Builder:** Given two cards, build the unique matching third card by selecting Count, Color, Shape, and Fill (10-Round Sprint or Endless practice).
- **Blitz (60s):** Fast 60-second sprint with streak multipliers.

## Deploy to GitHub Pages

```bash
git init
git add .
git commit -m "Add TRIAD card game"
git branch -M main
git remote add origin https://github.com/<YOUR-USERNAME>/<YOUR-REPO>.git
git push -u origin main
```

Then enable **Settings → Pages → Deploy from a branch (`main` / `/ (root)`)** in your repository on GitHub.
