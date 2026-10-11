import type { Mood, StatsView } from "./stats";

export type Hud = {
  setHint: (text: string) => void;
  hideHint: () => void;
  showQuip: (text: string) => void;
  render: (view: StatsView) => void;
  setMuted: (muted: boolean) => void;
  setTheme: (hex: string) => void;
  onMute: (handler: () => void) => void;
};

const MOOD_LABEL: Record<Mood, string> = {
  inbox: "inbox",
  thawing: "thawing",
  sandy: "sandy",
  salty: "salty",
  melted: "melted",
  gone: "gone",
};

function must<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
}

export function bindHud(): Hud {
  const hint = must<HTMLElement>("#hint");
  const quip = must<HTMLElement>("#quip");
  const wiggles = must<HTMLElement>("#wiggles");
  const streak = must<HTMLElement>("#streak");
  const best = must<HTMLElement>("#best");
  const mood = must<HTMLElement>("#mood");
  const ashore = must<HTMLElement>("#ashore");
  const fill = must<HTMLElement>("#vacay-fill");
  const mute = must<HTMLButtonElement>("#mute");
  const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');

  let quipTimer = 0;
  let lastWiggles = "";
  let lastStreak = "";
  let lastBest = "";
  let lastMood = "";
  let lastAshore = "";
  let lastVacay = -1;

  function pulse(node: HTMLElement): void {
    node.classList.remove("pulse");
    void node.offsetWidth;
    node.classList.add("pulse");
  }

  return {
    setHint(text) {
      hint.textContent = text;
      hint.classList.remove("is-gone");
    },
    hideHint() {
      hint.classList.add("is-gone");
    },
    showQuip(text) {
      quip.textContent = text;
      quip.classList.add("is-on");
      window.clearTimeout(quipTimer);
      quipTimer = window.setTimeout(() => {
        quip.classList.remove("is-on");
      }, 3400);
    },
    render(view) {
      const wiggleText = String(view.wiggles);
      if (wiggleText !== lastWiggles) {
        if (lastWiggles !== "") pulse(wiggles);
        wiggles.textContent = wiggleText;
        lastWiggles = wiggleText;
      }
      const streakText = String(view.streak);
      if (streakText !== lastStreak) {
        if (lastStreak !== "") pulse(streak);
        streak.textContent = streakText;
        lastStreak = streakText;
      }
      const bestText = view.best > 0 ? `best ${view.best}` : "";
      if (bestText !== lastBest) {
        best.textContent = bestText;
        lastBest = bestText;
      }
      const moodText = MOOD_LABEL[view.mood];
      if (moodText !== lastMood) {
        mood.textContent = moodText;
        lastMood = moodText;
      }
      if (view.ashore !== lastAshore) {
        ashore.textContent = view.ashore;
        lastAshore = view.ashore;
      }
      const rounded = Math.round(view.vacation);
      if (rounded !== lastVacay) {
        fill.style.width = `${rounded}%`;
        lastVacay = rounded;
      }
    },
    setMuted(muted) {
      mute.setAttribute("aria-pressed", muted ? "true" : "false");
      mute.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
    },
    setTheme(hex) {
      if (theme) theme.content = hex;
      document.documentElement.style.setProperty("--theme", hex);
    },
    onMute(handler) {
      mute.addEventListener("click", handler);
    },
  };
}
