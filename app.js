(() => {
  "use strict";

  // =========================================================================
  // 1. CONSTANTS & MATHEMATICAL CARD ENGINE (F_3^4)
  // =========================================================================
  const STORAGE_KEY = "triad_solo_game_v1";

  const SHAPE_PATHS = {
    0: "M 50 14 L 86 52 L 86 148 L 50 186 L 14 148 L 14 52 Z", // Hexagon
    1: "M 50 14 A 32 86 0 1 0 50 186 A 32 86 0 1 0 50 14 Z", // Tall narrow Ellipse
    2: "M 16 58 C 16 33, 33 12, 56 12 C 73 12, 81 16, 82 30 C 80 45, 63 60, 63 78 C 63 100, 84 118, 84 142 C 84 167, 67 188, 44 188 C 27 188, 19 184, 18 170 C 20 155, 37 140, 37 122 C 37 100, 16 82, 16 58 Z", // Wave
  };

  const SYMBOL_X = {
    1: [115],
    2: [68, 162],
    3: [22, 115, 208],
  };

  const ATTR_LABELS = {
    number: ["1", "2", "3"],
    colorClassic: ["Coral", "Teal", "Amber"],
    colorCB: ["Orange", "Sky", "Orchid"],
    shape: ["Hex", "Ellipse", "Wave"],
    shading: ["Open", "Striped", "Solid"],
  };

  const DECK = Array.from({ length: 81 }, (_, id) => ({
    id,
    number: id % 3,
    color: Math.floor(id / 3) % 3,
    shape: Math.floor(id / 9) % 3,
    shading: Math.floor(id / 27) % 3,
  }));

  function isTriadCards(a, b, c) {
    return (
      (a.number + b.number + c.number) % 3 === 0 &&
      (a.color + b.color + c.color) % 3 === 0 &&
      (a.shape + b.shape + c.shape) % 3 === 0 &&
      (a.shading + b.shading + c.shading) % 3 === 0
    );
  }

  function completeTriadCard(a, b) {
    const number = (6 - a.number - b.number) % 3;
    const color = (6 - a.color - b.color) % 3;
    const shape = (6 - a.shape - b.shape) % 3;
    const shading = (6 - a.shading - b.shading) % 3;
    const id = number + color * 3 + shape * 9 + shading * 27;
    return DECK[id];
  }

  function findAllTriads(cards) {
    const triads = [];
    const n = cards.length;
    for (let i = 0; i < n - 2; i++) {
      for (let j = i + 1; j < n - 1; j++) {
        const needed = completeTriadCard(cards[i], cards[j]);
        for (let k = j + 1; k < n; k++) {
          if (cards[k].id === needed.id) {
            triads.push([i, j, k]);
            break;
          }
        }
      }
    }
    return triads;
  }

  function countTriadDifferences(a, b, c) {
    let diff = 0;
    if (a.number !== b.number) diff++;
    if (a.color !== b.color) diff++;
    if (a.shape !== b.shape) diff++;
    if (a.shading !== b.shading) diff++;
    return diff;
  }

  function getColorLabel(val) {
    return state.settings.colorblind
      ? ATTR_LABELS.colorCB[val]
      : ATTR_LABELS.colorClassic[val];
  }

  function describeTriadMismatch(a, b, c) {
    const checks = [
      { key: "number", name: "Count", fmt: (v) => ATTR_LABELS.number[v] },
      { key: "color", name: "Color", fmt: (v) => getColorLabel(v) },
      { key: "shape", name: "Shape", fmt: (v) => ATTR_LABELS.shape[v] },
      { key: "shading", name: "Fill", fmt: (v) => ATTR_LABELS.shading[v] },
    ];
    for (const ch of checks) {
      const vals = [a[ch.key], b[ch.key], c[ch.key]];
      if ((vals[0] + vals[1] + vals[2]) % 3 !== 0) {
        const counts = new Map();
        vals.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
        const parts = [...counts.entries()].map(([v, cnt]) => `${cnt}× ${ch.fmt(v)}`);
        return `${ch.name}: ${parts.join(", ")}`;
      }
    }
    return "Invalid combination";
  }

  function secureRandomFloat() {
    if (window.crypto && window.crypto.getRandomValues) {
      const arr = new Uint32Array(1);
      window.crypto.getRandomValues(arr);
      return arr[0] / 4294967296;
    }
    return Math.random();
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function shuffleCards(source, rng = secureRandomFloat) {
    const arr = source.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function getTodayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function formatDateShort(dateKey) {
    const [y, m, d] = dateKey.split("-");
    return `${m}/${d}/${y}`;
  }

  // =========================================================================
  // 2. AUDIO ENGINE (Synthesized Web Audio API)
  // =========================================================================
  const AudioEngine = {
    ctx: null,
    ensure() {
      if (!state.settings.sound) return null;
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
      }
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    },
    tone(freq, dur, type = "sine", vol = 0.08, delay = 0) {
      const ctx = this.ensure();
      if (!ctx) return;
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(vol, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    },
    select(count) {
      const pitches = [392, 466.16, 554.37];
      this.tone(pitches[Math.min(count - 1, 2)] || 440, 0.08, "triangle", 0.06);
    },
    deselect() {
      this.tone(290, 0.06, "sine", 0.04);
    },
    triadFound(streak = 1) {
      const semitones = Math.min(streak - 1, 7);
      const mult = Math.pow(2, semitones / 12);
      this.tone(523.25 * mult, 0.14, "triangle", 0.075, 0);
      this.tone(659.25 * mult, 0.16, "triangle", 0.075, 0.055);
      this.tone(783.99 * mult, 0.24, "sine", 0.085, 0.11);
    },
    noTriadOk() {
      this.tone(440, 0.12, "triangle", 0.07, 0);
      this.tone(659.25, 0.20, "sine", 0.08, 0.07);
    },
    error() {
      this.tone(185, 0.11, "sawtooth", 0.04, 0);
      this.tone(150, 0.16, "sawtooth", 0.04, 0.08);
    },
    win() {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, idx) => this.tone(f, 0.28, "triangle", 0.085, idx * 0.08));
    },
  };

  // =========================================================================
  // 3. PERSISTENT STORAGE
  // =========================================================================
  function createEmptyStatBucket() {
    return {
      gamesStarted: 0,
      gamesCompleted: 0,
      bestScore: null,
      bestTimeMs: null,
      fastestTriadMs: null,
      totalTriads: 0,
      bestStreak: 0,
      runs: [],
    };
  }

  function defaultStore() {
    return {
      settings: {
        theme: "dark",
        colorblind: false,
        sound: true,
      },
      soloMinCards: 9,
      builderSubMode: "sprint10",
      stats: {
        "solo-9": createEmptyStatBucket(),
        "solo-12": createEmptyStatBucket(),
        daily: createEmptyStatBucket(),
        builder: createEmptyStatBucket(),
        blitz: createEmptyStatBucket(),
      },
      dailyCompleted: {},
      dailyStreak: 0,
      lastDailyDate: null,
    };
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultStore();
      const parsed = JSON.parse(raw);
      const base = defaultStore();
      return {
        ...base,
        ...parsed,
        settings: { ...base.settings, ...(parsed.settings || {}) },
        stats: {
          "solo-9": { ...createEmptyStatBucket(), ...(parsed.stats?.["solo-9"] || {}) },
          "solo-12": { ...createEmptyStatBucket(), ...(parsed.stats?.["solo-12"] || {}) },
          daily: { ...createEmptyStatBucket(), ...(parsed.stats?.daily || {}) },
          builder: { ...createEmptyStatBucket(), ...(parsed.stats?.builder || {}) },
          blitz: { ...createEmptyStatBucket(), ...(parsed.stats?.blitz || {}) },
        },
        dailyCompleted: parsed.dailyCompleted || {},
      };
    } catch {
      return defaultStore();
    }
  }

  function saveStore() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        settings: state.settings,
        soloMinCards: state.soloMinCards,
        builderSubMode: state.builderSubMode,
        stats: state.stats,
        dailyCompleted: state.dailyCompleted,
        dailyStreak: state.dailyStreak,
        lastDailyDate: state.lastDailyDate,
      }));
    } catch {
      // Ignore storage quota errors cleanly
    }
  }

  // =========================================================================
  // 4. APPLICATION STATE
  // =========================================================================
  const initialStore = loadStore();

  const state = {
    mode: "solo", // 'solo' | 'daily' | 'builder' | 'blitz'
    soloMinCards: initialStore.soloMinCards,
    builderSubMode: initialStore.builderSubMode,
    settings: initialStore.settings,
    stats: initialStore.stats,
    dailyCompleted: initialStore.dailyCompleted,
    dailyStreak: initialStore.dailyStreak,
    lastDailyDate: initialStore.lastDailyDate,

    deck: [],
    board: [],
    selected: [],
    hintIndex: null,
    justDealtIds: new Set(),
    justDealtTimer: null,
    resolving: false,
    isPaused: false,
    isFinished: false,

    score: 0,
    streak: 0,
    bestRunStreak: 0,
    triadsFound: 0,
    mistakes: 0,
    hintsUsed: 0,
    noTriadCalls: 0,
    fastestTriadMs: null,
    foundHistory: [],

    activeStartPerf: null,
    accumulatedMs: 0,
    lastSplitMs: 0,
    blitzDurationMs: 60000,
    timerRaf: null,

    dailyKey: getTodayKey(),
    dailyTargets: [],
    dailyFoundKeys: new Set(),

    builderRound: 1,
    builderTotalRounds: 10,
    builderCardA: null,
    builderCardB: null,
    builderChoice: { number: null, color: null, shape: null, shading: null },
  };

  // =========================================================================
  // 5. DOM REFERENCES
  // =========================================================================
  const $ = (id) => document.getElementById(id);

  const els = {
    html: document.documentElement,
    metaTheme: $("meta-theme-color"),
    modeTabs: document.querySelectorAll(".mode-tab"),
    submodeStrip: $("submode-strip"),

    hudScoreLabel: $("hud-score-label"),
    hudScore: $("hud-score"),
    hudDelta: $("hud-delta"),
    hudTimeLabel: $("hud-time-label"),
    hudTime: $("hud-time"),
    hudBestTime: $("hud-best-time"),
    hudThirdLabel: $("hud-third-label"),
    hudThird: $("hud-third"),
    deckStack: $("deck-stack"),
    hudFourthLabel: $("hud-fourth-label"),
    hudFourth: $("hud-fourth"),
    hudComboBadge: $("hud-combo-badge"),

    feedbackPill: $("feedback-pill"),
    boardStage: $("board-stage"),
    cardGrid: $("card-grid"),
    pauseVeil: $("pause-veil"),

    builderStage: $("builder-stage"),
    builderCardA: $("builder-card-a"),
    builderCardB: $("builder-card-b"),
    builderPreview: $("builder-card-preview"),
    builderControls: $("builder-controls"),
    btnBuilderCheck: $("btn-builder-check"),

    historySection: $("history-section"),
    historyTitle: $("history-title"),
    historyList: $("history-list"),

    actionBar: $("action-bar"),
    btnNoTriad: $("btn-no-triad"),
    btnHint: $("btn-hint"),
    btnPause: $("btn-pause"),
    btnRestart: $("btn-restart"),
    btnResume: $("btn-resume"),

    btnSound: $("btn-sound"),
    btnColorblind: $("btn-colorblind"),
    btnTheme: $("btn-theme"),
    btnStats: $("btn-stats"),
    btnHelp: $("btn-help"),

    modalGameover: $("modal-gameover"),
    gameoverBadge: $("gameover-badge"),
    gameoverTitle: $("gameover-title"),
    gameoverSubtitle: $("gameover-subtitle"),
    recordBanners: $("record-banners"),
    gameoverSummary: $("gameover-summary"),
    leftoverBox: $("leftover-box"),
    leftoverLabel: $("leftover-label"),
    leftoverCards: $("leftover-cards"),
    btnCopyResult: $("btn-copy-result"),
    btnOpenStatsFromEnd: $("btn-open-stats-from-end"),
    btnPlayAgain: $("btn-play-again"),

    modalStats: $("modal-stats"),
    statsModeTabs: $("stats-mode-tabs"),
    statsKpiGrid: $("stats-kpi-grid"),
    leaderboardList: $("leaderboard-list"),
    btnResetStats: $("btn-reset-stats"),

    modalHelp: $("modal-help"),
    helpExampleGood: $("help-example-good"),
    helpExampleBad: $("help-example-bad"),

    confettiCanvas: $("confetti-canvas"),
  };

  // =========================================================================
  // 6. SVG CARD RENDERER
  // =========================================================================
  let svgUid = 0;

  function buildCardSvg(card) {
    const uid = ++svgUid;
    const patId = `tp-${card.id}-${uid}`;
    const pathD = SHAPE_PATHS[card.shape];
    const xs = SYMBOL_X[card.number + 1];

    const fillVal =
      card.shading === 0
        ? "none"
        : card.shading === 1
        ? `url(#${patId})`
        : "var(--sym-color)";

    let defs = "";
    if (card.shading === 1) {
      defs = `<defs><pattern id="${patId}" width="10" height="16" patternUnits="userSpaceOnUse"><rect width="10" height="6.5" fill="var(--sym-color)"/></pattern></defs>`;
    }

    const shapes = xs
      .map(
        (x) =>
          `<g transform="translate(${x}, 30) scale(0.70)"><path d="${pathD}" fill="${fillVal}" stroke="var(--sym-color)" stroke-width="6.8" stroke-linejoin="round" stroke-linecap="round"/></g>`
      )
      .join("");

    return `<svg class="card-art" viewBox="0 0 300 200" aria-hidden="true">${defs}${shapes}</svg>`;
  }

  function cardAriaLabel(card) {
    return `${ATTR_LABELS.number[card.number]} ${getColorLabel(card.color)} ${ATTR_LABELS.shading[card.shading]} ${ATTR_LABELS.shape[card.shape]}`;
  }

  function createCardElement(
    card,
    index = null,
    { interactive = true, dealDelay = null, isNew = false } = {}
  ) {
    const el = document.createElement(interactive ? "button" : "div");
    if (interactive) {
      el.type = "button";
      el.setAttribute("aria-label", cardAriaLabel(card));
      el.dataset.cardId = String(card.id);
    }
    el.className = `triad-card color-${card.color}`;
    el.innerHTML = buildCardSvg(card);

    if (interactive && index !== null) {
      el.dataset.index = String(index);
    }

    if (isNew) {
      el.classList.add("just-dealt");
      const badge = document.createElement("span");
      badge.className = "card-new-badge";
      badge.textContent = "New";
      el.appendChild(badge);
    }

    if (dealDelay !== null) {
      el.classList.add("dealing");
      el.style.setProperty("--deal-delay", `${dealDelay}ms`);
    }
    return el;
  }

  // =========================================================================
  // 7. TIME FORMATTING & TIMER ENGINE
  // =========================================================================
  function getActiveElapsedMs() {
    if (state.isPaused || state.isFinished || state.activeStartPerf === null) {
      return state.accumulatedMs;
    }
    return state.accumulatedMs + (performance.now() - state.activeStartPerf);
  }

  function formatTimeMs(ms, showTenths = false) {
    const safe = Math.max(0, ms);
    const totalSec = Math.floor(safe / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    const base = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    if (!showTenths) return base;
    const tenths = Math.floor((safe % 1000) / 100);
    return `${base}.${tenths}`;
  }

  function startTimer() {
    stopTimerLoop();
    state.accumulatedMs = 0;
    state.lastSplitMs = 0;
    state.activeStartPerf = performance.now();
    tickTimerLoop();
  }

  function pauseTimer() {
    if (state.isPaused || state.isFinished) return;
    state.accumulatedMs = getActiveElapsedMs();
    state.activeStartPerf = null;
    state.isPaused = true;
    stopTimerLoop();
  }

  function resumeTimer() {
    if (!state.isPaused || state.isFinished) return;
    state.isPaused = false;
    state.activeStartPerf = performance.now();
    tickTimerLoop();
  }

  function stopTimer() {
    state.accumulatedMs = getActiveElapsedMs();
    state.activeStartPerf = null;
    stopTimerLoop();
  }

  function stopTimerLoop() {
    if (state.timerRaf !== null) {
      cancelAnimationFrame(state.timerRaf);
      state.timerRaf = null;
    }
  }

  function tickTimerLoop() {
    if (state.isPaused || state.isFinished) return;
    const elapsed = getActiveElapsedMs();

    if (state.mode === "blitz") {
      const rem = Math.max(0, state.blitzDurationMs - elapsed);
      els.hudTime.textContent = formatTimeMs(rem);
      if (rem <= 0) {
        finishGame();
        return;
      }
    } else {
      els.hudTime.textContent = formatTimeMs(elapsed);
    }

    state.timerRaf = requestAnimationFrame(tickTimerLoop);
  }

  // =========================================================================
  // 8. FEEDBACK & SCORE POPUPS
  // =========================================================================
  let feedbackTimer = null;
  let deltaTimer = null;

  function showFeedback(text, kind = "info", durationMs = 2600) {
    clearTimeout(feedbackTimer);
    els.feedbackPill.textContent = text;
    els.feedbackPill.className = `feedback-pill visible ${kind}`;
    if (durationMs > 0) {
      feedbackTimer = setTimeout(() => {
        els.feedbackPill.classList.remove("visible");
      }, durationMs);
    }
  }

  function clearFeedback() {
    clearTimeout(feedbackTimer);
    els.feedbackPill.classList.remove("visible");
  }

  function showScoreDelta(delta) {
    if (!delta) return;
    clearTimeout(deltaTimer);
    els.hudDelta.textContent = delta > 0 ? `+${delta}` : String(delta);
    els.hudDelta.className = `hud-delta show ${delta < 0 ? "neg" : ""}`;
    deltaTimer = setTimeout(() => {
      els.hudDelta.classList.remove("show");
    }, 1500);
  }

  function addPoints(delta) {
    const prev = state.score;
    state.score = Math.max(0, state.score + delta);
    showScoreDelta(state.score - prev);
  }

  // =========================================================================
  // 9. GAME MODE INITIALIZATION & RENDERING
  // =========================================================================
  function getCurrentStatKey() {
    if (state.mode === "solo") return state.soloMinCards === 12 ? "solo-12" : "solo-9";
    return state.mode;
  }

  function startNewGame(mode = state.mode) {
    state.mode = mode;
    state.selected = [];
    state.hintIndex = null;
    clearJustDealt();
    state.resolving = false;
    state.isPaused = false;
    state.isFinished = false;

    state.score = 0;
    state.streak = 0;
    state.bestRunStreak = 0;
    state.triadsFound = 0;
    state.mistakes = 0;
    state.hintsUsed = 0;
    state.noTriadCalls = 0;
    state.fastestTriadMs = null;
    state.foundHistory = [];

    els.pauseVeil.hidden = true;
    els.modalGameover.hidden = true;
    els.btnPause.querySelector("span").textContent = "Pause";
    clearFeedback();

    els.modeTabs.forEach((tab) => {
      const isAct = tab.dataset.mode === mode;
      tab.classList.toggle("active", isAct);
      tab.setAttribute("aria-selected", String(isAct));
    });

    renderSubmodeBar();

    if (mode === "solo") {
      els.boardStage.hidden = false;
      els.builderStage.hidden = true;
      els.historySection.hidden = true;
      els.actionBar.hidden = false;
      els.btnNoTriad.hidden = false;
      els.btnHint.hidden = false;
      els.btnPause.hidden = false;

      state.deck = shuffleCards(DECK);
      state.board = state.deck.splice(0, state.soloMinCards);
      trackGameStart();
      renderBoard(new Set(state.board.map((_, idx) => idx)), 45);
      startTimer();
    } else if (mode === "daily") {
      els.boardStage.hidden = false;
      els.builderStage.hidden = true;
      els.historySection.hidden = false;
      els.actionBar.hidden = false;
      els.btnNoTriad.hidden = true;
      els.btnHint.hidden = false;
      els.btnPause.hidden = false;

      setupDailyBoard();
    } else if (mode === "builder") {
      els.boardStage.hidden = true;
      els.builderStage.hidden = false;
      els.historySection.hidden = true;
      els.actionBar.hidden = false;
      els.btnNoTriad.hidden = true;
      els.btnHint.hidden = true;
      els.btnPause.hidden = false;

      state.builderRound = 1;
      state.builderTotalRounds = state.builderSubMode === "sprint10" ? 10 : Infinity;
      trackGameStart();
      nextBuilderRound();
      startTimer();
    } else if (mode === "blitz") {
      els.boardStage.hidden = false;
      els.builderStage.hidden = true;
      els.historySection.hidden = true;
      els.actionBar.hidden = false;
      els.btnNoTriad.hidden = false;
      els.btnHint.hidden = true;
      els.btnPause.hidden = false;

      state.deck = shuffleCards(DECK);
      state.board = state.deck.splice(0, 12);
      trackGameStart();
      renderBoard(new Set(state.board.map((_, idx) => idx)), 40);
      startTimer();
    }

    renderHistory();
    updateHud();
  }

  function trackGameStart() {
    const key = getCurrentStatKey();
    if (key === "builder" && state.builderSubMode !== "sprint10") return;
    state.stats[key].gamesStarted++;
    saveStore();
  }

  function renderSubmodeBar() {
    els.submodeStrip.innerHTML = "";
    if (state.mode === "solo") {
      [9, 12].forEach((n) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `sub-pill ${state.soloMinCards === n ? "active" : ""}`;
        btn.textContent = `Min ${n} Cards`;
        btn.addEventListener("click", () => {
          if (state.soloMinCards === n) return;
          state.soloMinCards = n;
          saveStore();
          startNewGame("solo");
        });
        els.submodeStrip.appendChild(btn);
      });
    } else if (state.mode === "daily") {
      const badge = document.createElement("span");
      badge.className = "sub-info-badge";
      badge.textContent = `${formatDateShort(state.dailyKey)} · ${state.dailyStreak}d Streak`;
      els.submodeStrip.appendChild(badge);
      if (state.dailyCompleted[state.dailyKey]) {
        const resBtn = document.createElement("button");
        resBtn.type = "button";
        resBtn.className = "sub-pill active";
        resBtn.textContent = "View Result";
        resBtn.addEventListener("click", () => {
          const c = state.dailyCompleted[state.dailyKey];
          openGameOverModal(c.timeMs, []);
        });
        els.submodeStrip.appendChild(resBtn);
      }
    } else if (state.mode === "builder") {
      [
        { id: "sprint10", label: "10 Rounds" },
        { id: "endless", label: "Endless" },
      ].forEach((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `sub-pill ${state.builderSubMode === opt.id ? "active" : ""}`;
        btn.textContent = opt.label;
        btn.addEventListener("click", () => {
          if (state.builderSubMode === opt.id) return;
          state.builderSubMode = opt.id;
          saveStore();
          startNewGame("builder");
        });
        els.submodeStrip.appendChild(btn);
      });
    }
  }

  function computeDesktopCols(count) {
    if (count <= 9) return 3;
    if (count <= 12) return 4;
    if (count <= 15) return 5;
    if (count <= 18) return 6;
    return 7;
  }

  function getActiveCols(count) {
    if (window.innerWidth <= 640) return 3;
    return computeDesktopCols(count);
  }

  function clearJustDealt() {
    clearTimeout(state.justDealtTimer);
    state.justDealtTimer = null;
    state.justDealtIds.clear();
    els.cardGrid.querySelectorAll(".triad-card.just-dealt").forEach((el) => {
      el.classList.remove("just-dealt");
      el.querySelector(".card-new-badge")?.remove();
    });
  }

  function markJustDealt(cards) {
    clearTimeout(state.justDealtTimer);
    state.justDealtIds = new Set(cards.map((c) => c.id));
    state.justDealtTimer = setTimeout(() => {
      clearJustDealt();
    }, 2800);
  }

  function captureCardRects() {
    const rects = new Map();
    Array.from(els.cardGrid.children).forEach((el) => {
      const id = el.dataset.cardId;
      if (id !== undefined) {
        rects.set(Number(id), el.getBoundingClientRect());
      }
    });
    return rects;
  }

  function playFlipTransitions(oldRects, skipIds = new Set()) {
    if (!oldRects || oldRects.size === 0) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const animating = [];
    Array.from(els.cardGrid.children).forEach((el) => {
      const cardId = Number(el.dataset.cardId);
      if (skipIds.has(cardId)) return;
      const oldRect = oldRects.get(cardId);
      if (!oldRect) return;

      const newRect = el.getBoundingClientRect();
      const dx = oldRect.left - newRect.left;
      const dy = oldRect.top - newRect.top;
      const sx = oldRect.width / Math.max(1, newRect.width);
      const sy = oldRect.height / Math.max(1, newRect.height);

      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01) return;

      el.style.transition = "none";
      el.style.transformOrigin = "top left";
      el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
      el.style.zIndex = "2";
      animating.push(el);
    });

    if (animating.length === 0) return;
    els.cardGrid.getBoundingClientRect();

    requestAnimationFrame(() => {
      animating.forEach((el) => {
        el.style.transition = "transform 620ms cubic-bezier(0.22, 1, 0.36, 1)";
        el.style.transform = "";
      });
    });

    setTimeout(() => {
      animating.forEach((el) => {
        el.style.transition = "";
        el.style.transformOrigin = "";
        el.style.zIndex = "";
      });
    }, 660);
  }

  function solveHungarian(cost) {
    const n = cost.length;
    if (n === 0) return [];
    const u = new Array(n + 1).fill(0);
    const v = new Array(n + 1).fill(0);
    const p = new Array(n + 1).fill(0);
    const way = new Array(n + 1).fill(0);

    for (let i = 1; i <= n; i++) {
      p[0] = i;
      let j0 = 0;
      const minv = new Array(n + 1).fill(Infinity);
      const used = new Array(n + 1).fill(false);
      do {
        used[j0] = true;
        const i0 = p[j0];
        let delta = Infinity;
        let j1 = 0;
        for (let j = 1; j <= n; j++) {
          if (!used[j]) {
            const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
            if (cur < minv[j]) {
              minv[j] = cur;
              way[j] = j0;
            }
            if (minv[j] < delta) {
              delta = minv[j];
              j1 = j;
            }
          }
        }
        for (let j = 0; j <= n; j++) {
          if (used[j]) {
            u[p[j]] += delta;
            v[j] -= delta;
          } else {
            minv[j] -= delta;
          }
        }
        j0 = j1;
      } while (p[j0] !== 0);

      do {
        const j1 = way[j0];
        p[j0] = p[j1];
        j0 = j1;
      } while (j0 !== 0);
    }

    const assign = new Array(n);
    for (let j = 1; j <= n; j++) {
      assign[p[j] - 1] = j - 1;
    }
    return assign;
  }

  function compactBoardIntelligently(oldBoard, removedIndices, oldCols, newCols) {
    const removedSet = new Set(removedIndices);
    const survivors = [];
    for (let idx = 0; idx < oldBoard.length; idx++) {
      if (!removedSet.has(idx)) {
        survivors.push({
          card: oldBoard[idx],
          oldR: Math.floor(idx / oldCols),
          oldC: idx % oldCols,
        });
      }
    }

    const m = survivors.length;
    if (m === 0) return [];

    if (newCols < oldCols) {
      const oldRows = Math.ceil(oldBoard.length / oldCols);
      const rows = Array.from({ length: oldRows }, () => []);
      survivors.forEach((s) => rows[s.oldR].push(s));

      const surplus = [];
      for (let r = 0; r < oldRows; r++) {
        while (rows[r].length > newCols) {
          surplus.push(rows[r].pop());
        }
      }

      const gridOut = new Array(m).fill(null);
      const emptySlots = [];
      for (let r = 0; r < oldRows; r++) {
        for (let c = 0; c < newCols; c++) {
          const targetIdx = r * newCols + c;
          if (targetIdx >= m) continue;
          if (c < rows[r].length) {
            gridOut[targetIdx] = rows[r][c].card;
          } else {
            emptySlots.push({ idx: targetIdx, r, c });
          }
        }
      }

      if (surplus.length > 0 && emptySlots.length === surplus.length) {
        const k = surplus.length;
        const cost = Array.from({ length: k }, (_, i) =>
          Array.from({ length: k }, (_, j) => {
            const dx = emptySlots[j].c - surplus[i].oldC;
            const dy = emptySlots[j].r - surplus[i].oldR;
            return dx * dx + dy * dy * 1.15;
          })
        );
        const match = solveHungarian(cost);
        for (let i = 0; i < k; i++) {
          gridOut[emptySlots[match[i]].idx] = surplus[i].card;
        }
      }
      return gridOut;
    }

    const cost = Array.from({ length: m }, (_, i) =>
      Array.from({ length: m }, (_, j) => {
        const targetR = Math.floor(j / newCols);
        const targetC = j % newCols;
        const dx = targetC - survivors[i].oldC;
        const dy = targetR - survivors[i].oldR;
        return dx * dx + dy * dy * 1.15;
      })
    );
    const assign = solveHungarian(cost);
    const out = new Array(m);
    for (let i = 0; i < m; i++) {
      out[assign[i]] = survivors[i].card;
    }
    return out;
  }

  function insertExpandedCards(oldBoard, newCards, oldCols, newCols) {
    if (newCols > oldCols && newCards.length === 3 && oldBoard.length % oldCols === 0) {
      const rows = oldBoard.length / oldCols;
      if (rows === 3) {
        const next = [];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < oldCols; c++) {
            next.push(oldBoard[r * oldCols + c]);
          }
          next.push(newCards[r]);
        }
        return next;
      }
    }
    return oldBoard.concat(newCards);
  }

  function renderBoard(dealIndices = new Set(), dealStaggerMs = 140) {
    const count = state.board.length;
    els.cardGrid.dataset.cols = String(computeDesktopCols(count));
    els.cardGrid.innerHTML = "";

    let dealCounter = 0;
    state.board.forEach((card, idx) => {
      const isDeal = dealIndices.has(idx);
      const isNew = state.justDealtIds.has(card.id);
      const cardEl = createCardElement(card, idx, {
        interactive: true,
        dealDelay: isDeal ? dealCounter++ * dealStaggerMs : null,
        isNew,
      });
      if (state.selected.includes(idx)) cardEl.classList.add("selected");
      if (state.hintIndex === idx) cardEl.classList.add("hinted");
      cardEl.addEventListener("click", () => onBoardCardClick(idx));
      els.cardGrid.appendChild(cardEl);
    });
  }

  function updateHud() {
    els.hudScoreLabel.textContent = "Score";
    els.hudScore.textContent = String(state.score);

    const bucket = state.stats[getCurrentStatKey()];

    if (state.mode === "blitz") {
      els.hudTimeLabel.textContent = "Time Left";
      els.hudBestTime.textContent =
        bucket.bestScore !== null ? `Best: ${bucket.bestScore}` : "";
      els.hudThirdLabel.textContent = "Triads";
      els.hudThird.textContent = String(state.triadsFound);
      els.deckStack.style.display = "none";

      const mult = getBlitzMultiplier();
      els.hudFourthLabel.textContent = "Multi";
      els.hudFourth.textContent = `${mult.toFixed(1).replace(".0", "")}×`;
      els.hudComboBadge.textContent = state.streak > 0 ? `🔥 ${state.streak}` : "";
    } else if (state.mode === "daily") {
      els.hudTimeLabel.textContent = "Time";
      els.hudBestTime.textContent =
        bucket.bestTimeMs !== null ? `Best: ${formatTimeMs(bucket.bestTimeMs)}` : "";
      els.hudThirdLabel.textContent = "Found";
      els.hudThird.textContent = `${state.dailyFoundKeys.size}/${state.dailyTargets.length}`;
      els.deckStack.style.display = "none";

      els.hudFourthLabel.textContent = "Mistakes";
      els.hudFourth.textContent = String(state.mistakes);
      els.hudComboBadge.textContent = state.dailyStreak > 0 ? `${state.dailyStreak}d` : "";
    } else if (state.mode === "builder") {
      els.hudTimeLabel.textContent = "Time";
      els.hudBestTime.textContent =
        state.builderSubMode === "sprint10" && bucket.bestTimeMs !== null
          ? `Best: ${formatTimeMs(bucket.bestTimeMs)}`
          : "";
      els.hudThirdLabel.textContent = "Round";
      els.hudThird.textContent =
        state.builderSubMode === "sprint10"
          ? `${Math.min(state.builderRound, state.builderTotalRounds)}/${state.builderTotalRounds}`
          : String(state.builderRound);
      els.deckStack.style.display = "none";

      els.hudFourthLabel.textContent = "Streak";
      els.hudFourth.textContent = String(state.streak);
      els.hudComboBadge.textContent = state.streak >= 3 ? "🔥" : "";
    } else {
      els.hudTimeLabel.textContent = "Time";
      els.hudBestTime.textContent =
        bucket.bestTimeMs !== null ? `Best: ${formatTimeMs(bucket.bestTimeMs)}` : "";
      els.hudThirdLabel.textContent = "Deck";
      els.hudThird.textContent = String(state.deck.length);
      els.deckStack.style.display = "inline-block";
      const level =
        state.deck.length === 0 ? 0 : state.deck.length <= 24 ? 1 : state.deck.length <= 48 ? 2 : 3;
      els.deckStack.dataset.level = String(level);

      els.hudFourthLabel.textContent = "Streak";
      els.hudFourth.textContent = String(state.streak);
      els.hudComboBadge.textContent = state.streak >= 3 ? `+${Math.min(60, state.streak * 10)}` : "";
    }
  }

  function renderHistory() {
    if (state.mode !== "daily") return;
    els.historyTitle.textContent = `Found (${state.dailyFoundKeys.size}/${state.dailyTargets.length})`;

    els.historyList.innerHTML = "";
    if (state.foundHistory.length === 0) {
      els.historyList.hidden = true;
      return;
    }
    els.historyList.hidden = false;

    for (let i = state.foundHistory.length - 1; i >= 0; i--) {
      const item = state.foundHistory[i];
      const wrap = document.createElement("div");
      wrap.className = "history-trio";

      const row = document.createElement("div");
      row.className = "history-trio-cards";
      item.cards.forEach((c) => row.appendChild(createCardElement(c, null, { interactive: false })));

      const meta = document.createElement("div");
      meta.className = "history-trio-meta";
      const diffSpan = document.createElement("span");
      if (item.diff === 4) {
        diffSpan.className = "rainbow";
        diffSpan.textContent = "All 4 diff ✨";
      } else {
        diffSpan.textContent = `${item.diff} diff`;
      }
      const timeSpan = document.createElement("span");
      timeSpan.className = "tabular";
      timeSpan.textContent = `${(item.ms / 1000).toFixed(1)}s`;

      meta.appendChild(diffSpan);
      meta.appendChild(timeSpan);
      wrap.appendChild(row);
      wrap.appendChild(meta);
      els.historyList.appendChild(wrap);
    }
  }

  // =========================================================================
  // 10. BOARD INTERACTION & DIFFICULTY-AWARE SCORING
  // =========================================================================
  function getBlitzMultiplier() {
    return Math.min(3.0, 1 + Math.floor(state.streak / 2) * 0.5);
  }

  function computeSmartTriadScore(availableCount, boardLen, roundSec, streak, diffCount, useStreak = true) {
    const k = Math.max(1, availableCount);
    const boardMult = 1 + Math.max(0, boardLen - 9) * 0.04;
    const scarcity = Math.pow(1 / k, 0.45);
    const tau = 22 / Math.pow(k, 0.55);

    const basePts = Math.round(90 * scarcity * boardMult);
    const speedPts = Math.round(170 * scarcity * boardMult * Math.exp(-roundSec / tau));
    const streakBonus = useStreak
      ? Math.round(Math.min(60, Math.max(0, streak - 1) * 10) * Math.max(0.45, scarcity))
      : 0;
    const rainbowBonus = diffCount === 4 ? 25 : 0;

    return Math.max(15, basePts + speedPts + streakBonus + rainbowBonus);
  }

  function onBoardCardClick(idx) {
    if (state.resolving || state.isPaused || state.isFinished) return;
    if (idx < 0 || idx >= state.board.length) return;

    const existingPos = state.selected.indexOf(idx);
    const cardEl = els.cardGrid.children[idx];

    if (existingPos !== -1) {
      state.selected.splice(existingPos, 1);
      if (cardEl) cardEl.classList.remove("selected");
      AudioEngine.deselect();
      return;
    }

    if (state.selected.length >= 3) return;
    state.selected.push(idx);
    if (cardEl) cardEl.classList.add("selected");
    AudioEngine.select(state.selected.length);

    if (state.selected.length === 3) {
      evaluateBoardSelection();
    }
  }

  function evaluateBoardSelection() {
    const indices = state.selected.slice();
    const cards = indices.map((i) => state.board[i]);

    if (!isTriadCards(cards[0], cards[1], cards[2])) {
      state.resolving = true;
      state.streak = 0;
      state.mistakes++;
      addPoints(-25);
      AudioEngine.error();

      const reason = describeTriadMismatch(cards[0], cards[1], cards[2]);
      showFeedback(`Not a Triad — ${reason} (−25 pts)`, "bad", 3000);

      indices.forEach((i) => {
        const el = els.cardGrid.children[i];
        if (el) el.classList.add("shake");
      });

      setTimeout(() => {
        indices.forEach((i) => {
          const el = els.cardGrid.children[i];
          if (el) el.classList.remove("selected", "shake");
        });
        state.selected = [];
        state.resolving = false;
        updateHud();
      }, 380);
      return;
    }

    // Daily duplicate check
    if (state.mode === "daily") {
      const canonicalKey = cards.map((c) => c.id).sort((a, b) => a - b).join("-");
      if (state.dailyFoundKeys.has(canonicalKey)) {
        state.resolving = true;
        AudioEngine.deselect();
        showFeedback("You already found this Triad today!", "info", 2400);
        indices.forEach((i) => els.cardGrid.children[i]?.classList.add("shake"));
        setTimeout(() => {
          indices.forEach((i) => els.cardGrid.children[i]?.classList.remove("selected", "shake"));
          state.selected = [];
          state.resolving = false;
        }, 320);
        return;
      }
      state.dailyFoundKeys.add(canonicalKey);
    }

    const availableCount =
      state.mode === "daily"
        ? Math.max(1, state.dailyTargets.length - (state.dailyFoundKeys.size - 1))
        : Math.max(1, findAllTriads(state.board).length);

    // Valid new Triad!
    state.resolving = true;
    state.hintIndex = null;
    clearJustDealt();

    const nowActive = getActiveElapsedMs();
    const roundMs = Math.max(100, nowActive - state.lastSplitMs);
    const roundSec = roundMs / 1000;
    state.lastSplitMs = nowActive;

    if (state.fastestTriadMs === null || roundMs < state.fastestTriadMs) {
      state.fastestTriadMs = roundMs;
    }

    state.streak++;
    if (state.streak > state.bestRunStreak) state.bestRunStreak = state.streak;
    state.triadsFound++;

    const diffCount = countTriadDifferences(cards[0], cards[1], cards[2]);
    let earned = 0;

    if (state.mode === "blitz") {
      const mult = getBlitzMultiplier();
      const scarcity = Math.pow(1 / availableCount, 0.25);
      earned = Math.max(25, Math.round((100 * scarcity + (diffCount === 4 ? 25 : 0)) * mult));
    } else {
      earned = computeSmartTriadScore(
        availableCount,
        state.board.length,
        roundSec,
        state.streak,
        diffCount,
        state.mode !== "daily"
      );
    }

    addPoints(earned);
    AudioEngine.triadFound(state.streak);

    state.foundHistory.push({
      cards,
      diff: diffCount,
      points: earned,
      ms: roundMs,
    });

    const msgTag = diffCount === 4 ? "Rainbow Triad! " : "";
    const countTag =
      state.mode === "daily"
        ? `(${state.dailyFoundKeys.size}/${state.dailyTargets.length})`
        : availableCount === 1
        ? "(only Triad!)"
        : `(${availableCount} possible)`;
    showFeedback(
      `${msgTag}Triad ${countTag} in ${roundSec.toFixed(1)}s · +${earned} pts`,
      "good",
      2700
    );

    // DAILY MODE: Cards remain on the table — pulse green cleanly in place without disappearing!
    if (state.mode === "daily") {
      indices.forEach((i) => {
        const el = els.cardGrid.children[i];
        if (el) {
          el.classList.remove("selected", "hinted");
          el.classList.add("daily-pulse");
        }
      });
      els.cardGrid.querySelectorAll(".triad-card.hinted").forEach((el) => el.classList.remove("hinted"));

      renderHistory();
      updateHud();

      setTimeout(() => {
        indices.forEach((i) => {
          els.cardGrid.children[i]?.classList.remove("daily-pulse");
        });
        state.selected = [];
        state.resolving = false;
        if (state.dailyFoundKeys.size >= state.dailyTargets.length) {
          finishGame();
        }
      }, 420);
      return;
    }

    // CLASSIC & BLITZ: Matched cards animate out before replacement / compaction
    indices.forEach((i) => {
      const el = els.cardGrid.children[i];
      if (el) {
        el.classList.remove("selected", "hinted");
        el.classList.add("matched");
      }
    });

    setTimeout(() => {
      state.selected = [];
      state.resolving = false;

      if (state.mode === "blitz") {
        const dealSet = new Set();
        const dealtCards = [];
        if (state.deck.length < 3) {
          const onBoardIds = new Set(state.board.map((c) => c.id));
          state.deck = shuffleCards(DECK.filter((c) => !onBoardIds.has(c.id)));
        }
        indices.forEach((idx) => {
          const nextCard = state.deck.pop();
          state.board[idx] = nextCard;
          dealSet.add(idx);
          dealtCards.push(nextCard);
        });
        markJustDealt(dealtCards);
        renderBoard(dealSet, 120);
        renderHistory();
        updateHud();
        return;
      }

      const minBoard = state.soloMinCards;
      const oldLen = state.board.length;

      if (oldLen > minBoard) {
        const oldRects = captureCardRects();
        const oldCols = getActiveCols(oldLen);
        const newCols = getActiveCols(oldLen - 3);
        state.board = compactBoardIntelligently(state.board, indices, oldCols, newCols);
        renderBoard();
        playFlipTransitions(oldRects);
      } else if (state.deck.length > 0) {
        const sortedAsc = indices.slice().sort((a, b) => a - b);
        const dealSet = new Set();
        const dealtCards = [];
        const toRemove = [];
        sortedAsc.forEach((idx) => {
          if (state.deck.length > 0) {
            const nextCard = state.deck.pop();
            state.board[idx] = nextCard;
            dealSet.add(idx);
            dealtCards.push(nextCard);
          } else {
            toRemove.push(idx);
          }
        });
        if (toRemove.length > 0) {
          const oldRects = captureCardRects();
          const oldCols = getActiveCols(oldLen);
          const newCols = getActiveCols(oldLen - toRemove.length);
          state.board = compactBoardIntelligently(state.board, toRemove, oldCols, newCols);
          renderBoard();
          playFlipTransitions(oldRects);
        } else {
          markJustDealt(dealtCards);
          renderBoard(dealSet, 145);
        }
      } else {
        const oldRects = captureCardRects();
        const oldCols = getActiveCols(oldLen);
        const newCols = getActiveCols(oldLen - 3);
        state.board = compactBoardIntelligently(state.board, indices, oldCols, newCols);
        renderBoard();
        playFlipTransitions(oldRects);
      }

      renderHistory();
      updateHud();

      if (state.board.length === 0 && state.deck.length === 0) {
        finishGame();
      }
    }, 340);
  }

  function handleNoTriadCall() {
    if (state.resolving || state.isPaused || state.isFinished) return;
    if (state.mode !== "solo" && state.mode !== "blitz") return;

    const triads = findAllTriads(state.board);
    if (triads.length > 0) {
      state.streak = 0;
      state.mistakes++;
      addPoints(-50);
      AudioEngine.error();
      showFeedback("There is still at least one Triad on the board! (−50 pts)", "bad", 2800);
      els.btnNoTriad.classList.add("shake-btn");
      setTimeout(() => els.btnNoTriad.classList.remove("shake-btn"), 380);
      updateHud();
      return;
    }

    clearJustDealt();
    const nowActive = getActiveElapsedMs();
    const roundSec = Math.max(0.1, (nowActive - state.lastSplitMs) / 1000);
    state.lastSplitMs = nowActive;
    state.noTriadCalls++;
    state.streak++;
    if (state.streak > state.bestRunStreak) state.bestRunStreak = state.streak;

    const sizeMult = 1 + Math.max(0, state.board.length - 9) * 0.08;
    const speedBonus = Math.max(10, Math.round(115 * sizeMult * Math.exp(-roundSec / 18)));
    const earned =
      state.mode === "blitz"
        ? Math.round(150 * getBlitzMultiplier())
        : Math.round(120 * sizeMult) + speedBonus + Math.min(60, (state.streak - 1) * 10);

    addPoints(earned);

    if (state.mode === "blitz") {
      AudioEngine.noTriadOk();
      if (state.deck.length < 3) {
        const onBoardIds = new Set(state.board.map((c) => c.id));
        state.deck = shuffleCards(DECK.filter((c) => !onBoardIds.has(c.id)));
      }
      if (state.board.length >= 18) {
        state.board = state.deck.splice(0, 12);
        markJustDealt(state.board);
        renderBoard(new Set(state.board.map((_, i) => i)), 45);
      } else {
        const oldRects = captureCardRects();
        const oldCols = getActiveCols(state.board.length);
        const newCards = [state.deck.pop(), state.deck.pop(), state.deck.pop()];
        const newCols = getActiveCols(state.board.length + 3);
        state.board = insertExpandedCards(state.board, newCards, oldCols, newCols);
        const newIds = new Set(newCards.map((c) => c.id));
        const dealSet = new Set(
          state.board.map((c, idx) => (newIds.has(c.id) ? idx : -1)).filter((i) => i >= 0)
        );
        markJustDealt(newCards);
        renderBoard(dealSet, 145);
        playFlipTransitions(oldRects, newIds);
      }
      state.selected = [];
      updateHud();
      showFeedback(`No Triad confirmed! +3 cards dealt (+${earned} pts)`, "good", 2400);
      return;
    }

    if (state.deck.length > 0) {
      AudioEngine.noTriadOk();
      const oldRects = captureCardRects();
      const oldCols = getActiveCols(state.board.length);
      const drawCount = Math.min(3, state.deck.length);
      const newCards = [];
      for (let i = 0; i < drawCount; i++) {
        newCards.push(state.deck.pop());
      }
      const newCols = getActiveCols(state.board.length + drawCount);
      state.board = insertExpandedCards(state.board, newCards, oldCols, newCols);

      const newIds = new Set(newCards.map((c) => c.id));
      const dealSet = new Set(
        state.board.map((c, idx) => (newIds.has(c.id) ? idx : -1)).filter((i) => i >= 0)
      );

      state.selected = [];
      state.hintIndex = null;
      markJustDealt(newCards);
      renderBoard(dealSet, 145);
      playFlipTransitions(oldRects, newIds);
      updateHud();
      showFeedback(`Correct — no Triad! 3 new cards dealt (+${earned} pts)`, "good", 2700);
    } else {
      updateHud();
      finishGame();
    }
  }

  function handleHint() {
    if (state.resolving || state.isPaused || state.isFinished) return;
    if (state.mode !== "solo" && state.mode !== "daily") return;

    const triads = findAllTriads(state.board);
    state.hintsUsed++;
    addPoints(-30);

    if (state.mode === "daily") {
      const remaining = triads.filter((triple) => {
        const key = triple.map((i) => state.board[i].id).sort((a, b) => a - b).join("-");
        return !state.dailyFoundKeys.has(key);
      });
      if (remaining.length > 0) {
        const chosen = remaining[0];
        const pick = chosen.find((i) => !state.selected.includes(i)) ?? chosen[0];
        state.hintIndex = pick;
        renderBoard();
        showFeedback("Hint: The highlighted card belongs to an unfound Triad (−30 pts)", "info", 2800);
      }
      updateHud();
      return;
    }

    if (triads.length === 0) {
      AudioEngine.noTriadOk();
      showFeedback("Hint: No Triad on the table! Tap “No Triad!” (−30 pts)", "info", 3200);
    } else {
      const chosen = triads[0];
      const pick = chosen.find((i) => !state.selected.includes(i)) ?? chosen[0];
      state.hintIndex = pick;
      AudioEngine.select(1);
      renderBoard();
      showFeedback("Hint: The highlighted card is part of a Triad (−30 pts)", "info", 2800);
    }
    updateHud();
  }

  // =========================================================================
  // 11. DAILY PUZZLE MODE
  // =========================================================================
  function setupDailyBoard() {
    state.dailyKey = getTodayKey();
    const rng = mulberry32(hashString(`TRIAD-DAILY-${state.dailyKey}`));

    let chosenBoard = null;
    let chosenTriads = [];
    for (let attempt = 0; attempt < 400; attempt++) {
      const candidate = shuffleCards(DECK, rng).slice(0, 12);
      const triads = findAllTriads(candidate);
      if (triads.length === 6) {
        chosenBoard = candidate;
        chosenTriads = triads;
        break;
      }
      if (triads.length > chosenTriads.length && triads.length >= 1) {
        chosenBoard = candidate;
        chosenTriads = triads;
      }
    }

    state.board = chosenBoard;
    state.dailyTargets = chosenTriads.map((triple) =>
      triple.map((i) => state.board[i].id).sort((a, b) => a - b).join("-")
    );
    state.dailyFoundKeys = new Set();

    const prevDaily = state.dailyCompleted[state.dailyKey];
    if (prevDaily) {
      state.score = prevDaily.score;
      state.mistakes = prevDaily.mistakes;
      state.triadsFound = state.dailyTargets.length;
      state.accumulatedMs = prevDaily.timeMs;
      state.isFinished = true;
      chosenTriads.forEach((triple, idx) => {
        const cards = triple.map((i) => state.board[i]);
        const key = cards.map((c) => c.id).sort((a, b) => a - b).join("-");
        state.dailyFoundKeys.add(key);
        state.foundHistory.push({
          cards,
          diff: countTriadDifferences(cards[0], cards[1], cards[2]),
          points: 0,
          ms: (idx + 1) * 1000,
        });
      });
      renderBoard();
      els.hudTime.textContent = formatTimeMs(prevDaily.timeMs);
      showFeedback(`Today's Daily Puzzle already solved (${formatTimeMs(prevDaily.timeMs)})`, "good", 4000);
    } else {
      trackGameStart();
      renderBoard(new Set(state.board.map((_, i) => i)), 35);
      startTimer();
      showFeedback(`Find all ${state.dailyTargets.length} Triads on today's board!`, "info", 3200);
    }
  }

  // =========================================================================
  // 12. "3RD CARD" BUILDER MODE
  // =========================================================================
  function nextBuilderRound() {
    const pair = shuffleCards(DECK).slice(0, 2);
    state.builderCardA = pair[0];
    state.builderCardB = pair[1];
    state.builderChoice = { number: null, color: null, shape: null, shading: null };
    state.resolving = false;

    els.builderCardA.innerHTML = "";
    els.builderCardA.appendChild(createCardElement(state.builderCardA, null, { interactive: false, dealDelay: 0 }));
    els.builderCardB.innerHTML = "";
    els.builderCardB.appendChild(createCardElement(state.builderCardB, null, { interactive: false, dealDelay: 60 }));

    renderBuilderControls();
    renderBuilderPreview();
    updateHud();
  }

  function renderBuilderControls() {
    els.builderControls.querySelectorAll(".attr-group").forEach((group) => {
      const attr = group.dataset.attr;
      const selectedVal = state.builderChoice[attr];
      group.querySelectorAll(".attr-pill").forEach((btn) => {
        const val = Number(btn.dataset.val);
        btn.classList.toggle("active", selectedVal === val);
      });
    });

    els.builderControls.querySelector(".color-name-0").textContent = getColorLabel(0);
    els.builderControls.querySelector(".color-name-1").textContent = getColorLabel(1);
    els.builderControls.querySelector(".color-name-2").textContent = getColorLabel(2);
  }

  function renderBuilderPreview() {
    const ch = state.builderChoice;
    const allChosen =
      ch.number !== null && ch.color !== null && ch.shape !== null && ch.shading !== null;

    els.btnBuilderCheck.disabled = !allChosen;
    els.builderPreview.innerHTML = "";

    if (!allChosen) {
      const chosenCount = ["number", "color", "shape", "shading"].filter((k) => ch[k] !== null).length;
      const placeholder = document.createElement("div");
      placeholder.className = "builder-preview-empty";
      placeholder.textContent = chosenCount === 0 ? "?" : `${chosenCount}/4`;
      els.builderPreview.appendChild(placeholder);
      return;
    }

    const previewId = ch.number + ch.color * 3 + ch.shape * 9 + ch.shading * 27;
    const cardEl = createCardElement(DECK[previewId], null, { interactive: false });
    els.builderPreview.appendChild(cardEl);
  }

  function onBuilderPillClick(attr, val) {
    if (state.resolving || state.isPaused || state.isFinished) return;
    state.builderChoice[attr] = val;
    AudioEngine.select(
      ["number", "color", "shape", "shading"].filter((k) => state.builderChoice[k] !== null).length
    );
    renderBuilderControls();
    renderBuilderPreview();
  }

  function checkBuilderAnswer() {
    if (state.resolving || state.isPaused || state.isFinished) return;
    const ch = state.builderChoice;
    if (ch.number === null || ch.color === null || ch.shape === null || ch.shading === null) return;

    const chosenId = ch.number + ch.color * 3 + ch.shape * 9 + ch.shading * 27;
    const target = completeTriadCard(state.builderCardA, state.builderCardB);

    if (chosenId === target.id) {
      state.resolving = true;
      const nowActive = getActiveElapsedMs();
      const roundMs = Math.max(100, nowActive - state.lastSplitMs);
      const roundSec = roundMs / 1000;
      state.lastSplitMs = nowActive;

      if (state.fastestTriadMs === null || roundMs < state.fastestTriadMs) {
        state.fastestTriadMs = roundMs;
      }

      state.streak++;
      if (state.streak > state.bestRunStreak) state.bestRunStreak = state.streak;
      state.triadsFound++;

      const speedBonus = Math.max(10, Math.round(120 * Math.exp(-roundSec / 9)));
      const earned = 100 + speedBonus + Math.min(60, (state.streak - 1) * 10);
      addPoints(earned);
      AudioEngine.triadFound(state.streak);

      els.builderPreview.querySelector(".triad-card")?.classList.add("daily-pulse");
      showFeedback(`Exact match! +${earned} pts (${roundSec.toFixed(1)}s)`, "good", 1600);
      updateHud();

      setTimeout(() => {
        if (state.builderSubMode === "sprint10" && state.builderRound >= state.builderTotalRounds) {
          finishGame();
        } else {
          state.builderRound++;
          nextBuilderRound();
        }
      }, 460);
    } else {
      state.streak = 0;
      state.mistakes++;
      addPoints(-20);
      AudioEngine.error();

      const hint = buildConstructorMismatchHint(state.builderCardA, state.builderCardB, DECK[chosenId], target);
      showFeedback(hint, "bad", 3400);
      els.builderPreview.querySelector(".triad-card")?.classList.add("shake");
      setTimeout(() => {
        els.builderPreview.querySelector(".triad-card")?.classList.remove("shake");
      }, 360);
      updateHud();
    }
  }

  function buildConstructorMismatchHint(a, b, chosen, target) {
    const checks = [
      { key: "number", name: "Count", fmt: (v) => ATTR_LABELS.number[v] },
      { key: "color", name: "Color", fmt: (v) => getColorLabel(v) },
      { key: "shape", name: "Shape", fmt: (v) => ATTR_LABELS.shape[v] },
      { key: "shading", name: "Fill", fmt: (v) => ATTR_LABELS.shading[v] },
    ];
    for (const ch of checks) {
      if (chosen[ch.key] !== target[ch.key]) {
        if (a[ch.key] === b[ch.key]) {
          return `${ch.name} mismatch: both are ${ch.fmt(a[ch.key])} → pick ${ch.fmt(target[ch.key])}!`;
        }
        return `${ch.name} mismatch: ${ch.fmt(a[ch.key])} & ${ch.fmt(b[ch.key])} differ → pick ${ch.fmt(target[ch.key])}!`;
      }
    }
    return "Not quite — check all 4 attributes!";
  }

  // =========================================================================
  // 13. GAME FINISH, RECORDS & CONFETTI
  // =========================================================================
  function finishGame() {
    if (state.isFinished) return;
    state.isFinished = true;
    stopTimer();
    AudioEngine.win();

    const totalMs = state.mode === "blitz" ? state.blitzDurationMs : getActiveElapsedMs();
    const statKey = getCurrentStatKey();
    const bucket = state.stats[statKey];

    const newRecords = [];
    const shouldRecord = !(state.mode === "builder" && state.builderSubMode !== "sprint10");

    if (shouldRecord) {
      bucket.gamesCompleted++;
      bucket.totalTriads += state.triadsFound;
      if (state.bestRunStreak > bucket.bestStreak) bucket.bestStreak = state.bestRunStreak;

      if (bucket.bestScore === null || state.score > bucket.bestScore) {
        bucket.bestScore = state.score;
        newRecords.push("New Highscore!");
      }

      if (state.mode !== "blitz" && (bucket.bestTimeMs === null || totalMs < bucket.bestTimeMs)) {
        bucket.bestTimeMs = totalMs;
        newRecords.push("New Best Time!");
      }

      if (
        state.fastestTriadMs !== null &&
        (bucket.fastestTriadMs === null || state.fastestTriadMs < bucket.fastestTriadMs)
      ) {
        bucket.fastestTriadMs = state.fastestTriadMs;
      }

      bucket.runs.push({
        date: new Date().toISOString(),
        score: state.score,
        timeMs: Math.round(totalMs),
        triads: state.triadsFound,
        mistakes: state.mistakes,
      });

      bucket.runs.sort((a, b) => {
        if (state.mode === "blitz") return b.score - a.score || b.triads - a.triads;
        return b.score - a.score || a.timeMs - b.timeMs;
      });
      bucket.runs = bucket.runs.slice(0, 8);
    }

    if (state.mode === "daily" && !state.dailyCompleted[state.dailyKey]) {
      state.dailyCompleted[state.dailyKey] = {
        score: state.score,
        timeMs: Math.round(totalMs),
        mistakes: state.mistakes,
        triadsCount: state.dailyTargets.length,
      };
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
      if (state.lastDailyDate === yKey) {
        state.dailyStreak += 1;
      } else if (state.lastDailyDate !== state.dailyKey) {
        state.dailyStreak = 1;
      }
      state.lastDailyDate = state.dailyKey;
    }

    saveStore();
    renderSubmodeBar();
    updateHud();

    if (newRecords.length > 0 || state.mode === "daily" || state.mode === "solo") {
      launchConfetti();
    }

    openGameOverModal(totalMs, newRecords);
  }

  function openGameOverModal(totalMs, newRecords) {
    els.recordBanners.innerHTML = "";
    newRecords.forEach((txt) => {
      const pill = document.createElement("div");
      pill.className = "record-banner";
      pill.textContent = `🏆 ${txt}`;
      els.recordBanners.appendChild(pill);
    });

    if (state.mode === "solo") {
      els.gameoverBadge.textContent = "Deck Cleared";
      els.gameoverTitle.textContent = "All 81 Cards Played!";
      els.gameoverSubtitle.textContent =
        state.board.length === 0
          ? "Every single card on the table matched cleanly!"
          : `${state.board.length} leftover cards remain with no possible Triad.`;
      els.btnCopyResult.hidden = true;
    } else if (state.mode === "daily") {
      els.gameoverBadge.textContent = "Daily Solved";
      els.gameoverTitle.textContent = `All ${state.dailyTargets.length} Triads Found!`;
      els.gameoverSubtitle.textContent = `${formatDateShort(state.dailyKey)} · ${state.dailyStreak} day streak`;
      els.btnCopyResult.hidden = false;
    } else if (state.mode === "builder") {
      els.gameoverBadge.textContent = "Sprint Complete";
      els.gameoverTitle.textContent = "10/10 Cards Built!";
      els.gameoverSubtitle.textContent = "Sharp eye for all 4 attributes.";
      els.btnCopyResult.hidden = true;
    } else {
      els.gameoverBadge.textContent = "Time's Up";
      els.gameoverTitle.textContent = "60-Second Blitz Complete!";
      els.gameoverSubtitle.textContent = `You spotted ${state.triadsFound} Triads under time pressure.`;
      els.btnCopyResult.hidden = true;
    }

    const cells = [
      { label: "Score", val: String(state.score) },
      { label: "Total Time", val: formatTimeMs(totalMs, true) },
      { label: "Triads Found", val: String(state.triadsFound) },
      {
        label: "Fastest Triad",
        val: state.fastestTriadMs !== null ? `${(state.fastestTriadMs / 1000).toFixed(1)}s` : "–",
      },
      { label: "Mistakes", val: String(state.mistakes) },
      { label: "Best Streak", val: String(state.bestRunStreak) },
    ];

    els.gameoverSummary.innerHTML = cells
      .map(
        (c) =>
          `<div class="summary-cell"><div class="summary-cell-label">${c.label}</div><div class="summary-cell-val tabular">${c.val}</div></div>`
      )
      .join("");

    if (state.mode === "solo" && state.board.length > 0) {
      els.leftoverBox.hidden = false;
      els.leftoverLabel.textContent = `Remaining ${state.board.length} cards (verified no Triad):`;
      els.leftoverCards.innerHTML = "";
      state.board.forEach((c) => {
        els.leftoverCards.appendChild(createCardElement(c, null, { interactive: false }));
      });
    } else {
      els.leftoverBox.hidden = true;
    }

    els.modalGameover.hidden = false;
  }

  // =========================================================================
  // 14. STATS & HELP MODALS
  // =========================================================================
  let currentStatsTab = "solo-9";

  function openStatsModal(initialTab = getCurrentStatKey()) {
    currentStatsTab = initialTab;
    renderStatsModal();
    els.modalStats.hidden = false;
  }

  function renderStatsModal() {
    els.statsModeTabs.querySelectorAll(".stats-tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.statMode === currentStatsTab);
    });

    const b = state.stats[currentStatsTab] || createEmptyStatBucket();
    const kpis = [
      { label: "Highscore", val: b.bestScore !== null ? String(b.bestScore) : "–" },
      {
        label: currentStatsTab === "blitz" ? "Most Triads" : "Best Time",
        val:
          currentStatsTab === "blitz"
            ? String(b.runs[0]?.triads ?? "–")
            : b.bestTimeMs !== null
            ? formatTimeMs(b.bestTimeMs, true)
            : "–",
      },
      { label: "Completed", val: `${b.gamesCompleted} / ${b.gamesStarted}` },
      {
        label: "Fastest Triad",
        val: b.fastestTriadMs !== null ? `${(b.fastestTriadMs / 1000).toFixed(1)}s` : "–",
      },
    ];

    els.statsKpiGrid.innerHTML = kpis
      .map(
        (k) =>
          `<div class="summary-cell"><div class="summary-cell-label">${k.label}</div><div class="summary-cell-val tabular">${k.val}</div></div>`
      )
      .join("");

    els.leaderboardList.innerHTML = "";
    if (!b.runs || b.runs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "history-empty";
      empty.textContent = "No completed runs in this mode yet.";
      els.leaderboardList.appendChild(empty);
      return;
    }

    b.runs.forEach((run, i) => {
      const row = document.createElement("div");
      row.className = "lb-row";
      const d = new Date(run.date);
      const dateStr = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
      row.innerHTML = `
        <span class="lb-rank tabular">#${i + 1}</span>
        <span class="lb-main tabular">${run.score} pts · ${formatTimeMs(run.timeMs, true)}</span>
        <span class="lb-meta tabular">${run.triads ?? run.sets ?? 0} Triads · ${dateStr}</span>
      `;
      els.leaderboardList.appendChild(row);
    });
  }

  function populateHelpExamples() {
    // Valid: 1 Open Teal Hex, 2 Striped Coral Waves, 3 Solid Amber Circles
    const good = [
      DECK[0 + 1 * 3 + 0 * 9 + 0 * 27],
      DECK[1 + 0 * 3 + 2 * 9 + 1 * 27],
      DECK[2 + 2 * 3 + 1 * 9 + 2 * 27],
    ];
    els.helpExampleGood.innerHTML = "";
    good.forEach((c) => els.helpExampleGood.appendChild(createCardElement(c, null, { interactive: false })));

    // Invalid: 1 Solid Coral Circle, 2 Solid Coral Circles, 3 Solid Amber Circles
    const bad = [
      DECK[0 + 0 * 3 + 1 * 9 + 2 * 27],
      DECK[1 + 0 * 3 + 1 * 9 + 2 * 27],
      DECK[2 + 2 * 3 + 1 * 9 + 2 * 27],
    ];
    els.helpExampleBad.innerHTML = "";
    bad.forEach((c) => els.helpExampleBad.appendChild(createCardElement(c, null, { interactive: false })));
  }

  // =========================================================================
  // 15. THEME & COLORBLIND SETTINGS
  // =========================================================================
  function applySettings() {
    els.html.dataset.theme = state.settings.theme;
    els.html.dataset.palette = state.settings.colorblind ? "cb" : "classic";
    els.metaTheme.setAttribute("content", state.settings.theme === "dark" ? "#111318" : "#F6F4EF");

    els.btnSound.classList.toggle("is-muted", !state.settings.sound);
    els.btnColorblind.classList.toggle("is-active", Boolean(state.settings.colorblind));
    els.btnColorblind.setAttribute("aria-pressed", String(Boolean(state.settings.colorblind)));

    if (state.mode === "builder") {
      renderBuilderControls();
    }
  }

  function togglePause() {
    if (state.isFinished) return;
    if (state.isPaused) {
      resumeTimer();
      els.pauseVeil.hidden = true;
      els.btnPause.querySelector("span").textContent = "Pause";
    } else {
      pauseTimer();
      els.pauseVeil.hidden = false;
      els.btnPause.querySelector("span").textContent = "Resume";
    }
  }

  // =========================================================================
  // 16. LIGHTWEIGHT CONFETTI
  // =========================================================================
  function launchConfetti() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = els.confettiCanvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const palette = state.settings.colorblind
      ? ["#FB923C", "#38BDF8", "#E879F9", "#FACC15"]
      : ["#FB7185", "#2DD4BF", "#FBBF24", "#60A5FA"];

    const pieces = Array.from({ length: 72 }, () => ({
      x: window.innerWidth * (0.2 + Math.random() * 0.6),
      y: window.innerHeight * 0.25 + (Math.random() - 0.5) * 60,
      vx: (Math.random() - 0.5) * 11,
      vy: -Math.random() * 10 - 3,
      w: 7 + Math.random() * 5,
      h: 4 + Math.random() * 4,
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.22,
      color: palette[Math.floor(Math.random() * palette.length)],
      life: 1,
    }));

    let frame = 0;
    function step() {
      frame++;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      let alive = 0;
      for (const p of pieces) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.28;
        p.vx *= 0.99;
        p.rot += p.vrot;
        if (frame > 75) p.life -= 0.02;
        if (p.life <= 0 || p.y > window.innerHeight + 30) continue;
        alive++;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (alive > 0 && frame < 170) {
        requestAnimationFrame(step);
      } else {
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    }
    requestAnimationFrame(step);
  }

  // =========================================================================
  // 17. EVENT LISTENERS
  // =========================================================================
  els.modeTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      if (tab.dataset.mode !== state.mode) {
        startNewGame(tab.dataset.mode);
      }
    });
  });

  els.btnNoTriad.addEventListener("click", handleNoTriadCall);
  els.btnHint.addEventListener("click", handleHint);
  els.btnPause.addEventListener("click", togglePause);
  els.btnResume.addEventListener("click", togglePause);
  els.btnRestart.addEventListener("click", () => startNewGame(state.mode));

  els.builderControls.querySelectorAll(".attr-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      const attr = pill.closest(".attr-group").dataset.attr;
      onBuilderPillClick(attr, Number(pill.dataset.val));
    });
  });

  els.btnBuilderCheck.addEventListener("click", checkBuilderAnswer);

  els.btnSound.addEventListener("click", () => {
    state.settings.sound = !state.settings.sound;
    applySettings();
    saveStore();
    if (state.settings.sound) AudioEngine.select(2);
  });

  els.btnColorblind.addEventListener("click", () => {
    state.settings.colorblind = !state.settings.colorblind;
    applySettings();
    saveStore();
    showFeedback(
      state.settings.colorblind ? "Colorblind palette enabled" : "Classic palette enabled",
      "info",
      1800
    );
  });

  els.btnTheme.addEventListener("click", () => {
    state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
    applySettings();
    saveStore();
  });

  els.btnStats.addEventListener("click", () => openStatsModal());
  els.btnHelp.addEventListener("click", () => (els.modalHelp.hidden = false));

  document.querySelectorAll("[data-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = $(btn.dataset.close);
      if (target) target.hidden = true;
    });
  });

  [els.modalGameover, els.modalStats, els.modalHelp].forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) backdrop.hidden = true;
    });
  });

  els.btnPlayAgain.addEventListener("click", () => startNewGame(state.mode));
  els.btnOpenStatsFromEnd.addEventListener("click", () => {
    els.modalGameover.hidden = true;
    openStatsModal();
  });

  els.btnCopyResult.addEventListener("click", async () => {
    const comp = state.dailyCompleted[state.dailyKey];
    const timeStr = comp ? formatTimeMs(comp.timeMs) : els.hudTime.textContent;
    const text = `TRIAD Daily (${formatDateShort(state.dailyKey)})\n${state.dailyTargets.length}/${state.dailyTargets.length} Triads in ${timeStr} • ${state.score} pts • ${state.dailyStreak}d Streak`;
    try {
      await navigator.clipboard.writeText(text);
      els.btnCopyResult.textContent = "Copied ✓";
      setTimeout(() => (els.btnCopyResult.textContent = "Copy Result"), 1800);
    } catch {
      showFeedback(text, "info", 4000);
    }
  });

  els.statsModeTabs.querySelectorAll(".stats-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      currentStatsTab = tab.dataset.statMode;
      renderStatsModal();
    });
  });

  els.btnResetStats.addEventListener("click", () => {
    if (!confirm("Reset all saved personal bests and statistics?")) return;
    state.stats = defaultStore().stats;
    state.dailyCompleted = {};
    state.dailyStreak = 0;
    state.lastDailyDate = null;
    saveStore();
    renderStatsModal();
    updateHud();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      els.modalGameover.hidden = true;
      els.modalStats.hidden = true;
      els.modalHelp.hidden = true;
    }
  });

  // =========================================================================
  // 18. BOOT
  // =========================================================================
  applySettings();
  populateHelpExamples();
  startNewGame("solo");
})();
