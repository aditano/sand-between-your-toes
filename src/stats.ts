import {
  emptyCollection,
  noteCollect,
  type BeachLoot,
  type CollectionCounts,
} from "./collectibles";
import { BEST_KEY, SCORE_BEST_KEY, STREAK_WINDOW_MS } from "./constants";
import { FIRST_TOUCH, milestoneQuip, moodQuip, pickQuip, streakQuip } from "./copy";

export type Mood = "inbox" | "thawing" | "sandy" | "salty" | "melted" | "gone";

export type StatsView = {
  wiggles: number;
  streak: number;
  best: number;
  score: number;
  scoreBest: number;
  mood: Mood;
  vacation: number;
  ashore: string;
  collection: CollectionCounts;
  recent: string[];
};

export function moodFor(value: number): Mood {
  if (value >= 90) return "gone";
  if (value >= 74) return "melted";
  if (value >= 54) return "salty";
  if (value >= 32) return "sandy";
  if (value >= 12) return "thawing";
  return "inbox";
}

export function formatAshore(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remain = total % 60;
  return `${minutes}:${remain.toString().padStart(2, "0")}`;
}

function readNum(key: string): number {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeNum(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(Math.floor(value)));
  } catch {
    // Private mode can refuse storage. The tide does not mind.
  }
}

export class Session {
  wiggles = 0;
  streak = 0;
  best = readNum(BEST_KEY);
  score = 0;
  scoreBest = readNum(SCORE_BEST_KEY);
  vacation = 8;
  ashoreSeconds = 0;
  collection = emptyCollection();
  recent: string[] = [];

  private lastTouch = 0;
  private lastQuipAt = -10;
  private readonly seenMoods = new Set<Mood>(["inbox"]);
  private readonly onQuip: (text: string) => void;

  constructor(onQuip: (text: string) => void) {
    this.onQuip = onQuip;
  }

  tick(dt: number, visible: boolean): void {
    const before = this.ashoreSeconds;
    if (visible) this.ashoreSeconds += dt;
    this.vacation = 5 + (this.vacation - 5) * Math.exp(-dt * 0.04);
    const line = milestoneQuip(before, this.ashoreSeconds);
    if (line) this.announce(line, false);
    this.noteMood();
  }

  press(now: number, speak: boolean): void {
    this.hit(now, true, speak);
  }

  stroke(now: number): void {
    this.hit(now, false, false);
  }

  hold(now: number): void {
    if (this.streak > 0) this.lastTouch = now;
  }

  collect(loot: BeachLoot, points: number): void {
    noteCollect(this.collection, loot);
    this.addScore(points);
    this.pushRecent(loot.label);
  }

  bonus(points: number, label: string): void {
    this.addScore(points);
    this.pushRecent(label);
  }

  announce(text: string, force: boolean): void {
    if (!force && this.ashoreSeconds - this.lastQuipAt < 1.15) return;
    this.lastQuipAt = this.ashoreSeconds;
    this.onQuip(text);
  }

  view(): StatsView {
    return {
      wiggles: this.wiggles,
      streak: this.streak,
      best: this.best,
      score: this.score,
      scoreBest: this.scoreBest,
      mood: moodFor(this.vacation),
      vacation: this.vacation,
      ashore: formatAshore(this.ashoreSeconds),
      collection: this.collection,
      recent: this.recent.slice(),
    };
  }

  private addScore(points: number): void {
    this.score += points;
    if (this.score > this.scoreBest) {
      this.scoreBest = this.score;
      writeNum(SCORE_BEST_KEY, this.scoreBest);
    }
  }

  private pushRecent(label: string): void {
    this.recent.unshift(label);
    if (this.recent.length > 6) this.recent.length = 6;
  }

  private noteMood(): void {
    const mood = moodFor(this.vacation);
    if (this.seenMoods.has(mood)) return;
    this.seenMoods.add(mood);
    const line = moodQuip(mood);
    if (line) this.announce(line, true);
  }

  private hit(now: number, fromPress: boolean, speak: boolean): void {
    const first = this.wiggles === 0;
    if (now - this.lastTouch > STREAK_WINDOW_MS) this.streak = 0;
    this.streak += 1;
    this.wiggles += 1;
    this.lastTouch = now;
    const bump = fromPress ? 3.4 : 1.15;
    this.vacation = Math.min(100, this.vacation + bump * (1 - this.vacation / 140));

    let line: string | null = null;
    if (first) line = FIRST_TOUCH;
    const previousBest = this.best;
    if (this.streak > this.best) {
      const broke = previousBest >= 8 && this.streak === previousBest + 1;
      this.best = this.streak;
      writeNum(BEST_KEY, this.best);
      if (!line && (this.streak === 8 || this.streak % 15 === 0 || broke)) {
        line = "New wiggle record. The beach clapped, quietly.";
      }
    }
    if (!line) line = streakQuip(this.streak);
    if (!line && (speak || this.streak % 12 === 0) && this.wiggles % 5 === 0) line = pickQuip();
    if (line) this.announce(line, first);
    this.noteMood();
  }
}
