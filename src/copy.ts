import type { BeachEvent } from "./sim";

export const FIRST_TOUCH = "Sand between your toes. The inbox can wait.";

const LINES = [
  "The group chat can wait its turn.",
  "This counts as a vacation. Tell your calendar.",
  "Your out of office is the ocean.",
  "A grain of sand just clocked in.",
  "Toes deployed. Mission: idle.",
  "You are horizontally employed.",
  "Vitamin sea, self-prescribed.",
  "Footprints are sand taking notes.",
  "Somewhere a meeting is happening. You are here.",
  "The crab has clocked you in.",
  "Soft, warm, and in no particular hurry.",
  "Vacation brain has entered the chat.",
  "The shore logged your visit.",
  "Fresh air, delivered digitally. Ironic.",
  "Leave the chair. Stay for the tide.",
  "Your step count is on holiday.",
];

const MOOD_LINES: Partial<Record<string, string>> = {
  sandy: "Vacation brain: sandy.",
  melted: "You have melted. This is correct.",
  gone: "You are officially elsewhere.",
};

let lastLine = "";

export function pickQuip(): string {
  const start = Math.floor(Math.random() * LINES.length);
  for (let offset = 0; offset < LINES.length; offset += 1) {
    const line = LINES[(start + offset) % LINES.length] ?? LINES[0];
    if (line !== lastLine) {
      lastLine = line;
      return line;
    }
  }
  return LINES[0] ?? FIRST_TOUCH;
}

export function milestoneQuip(before: number, after: number): string | null {
  if (before < 60 && after >= 60) return "One minute ashore. Heroic.";
  if (before < 180 && after >= 180) return "Three minutes. Your shoulders dropped.";
  if (before < 600 && after >= 600) return "Ten minutes. You live here now.";
  return null;
}

export function moodQuip(mood: string): string | null {
  return MOOD_LINES[mood] ?? null;
}

export function streakQuip(streak: number): string | null {
  if (streak === 10) return "Ten wiggles. The toes are in session.";
  if (streak === 25) return "Twenty-five. A personal tide.";
  if (streak === 50) return "Fifty. The sand knows your name.";
  return null;
}

export function discoveryQuip(event: BeachEvent): string | null {
  switch (event.kind) {
    case "touch":
      return null;
    case "shell":
      return "A shell. The beach tipped you.";
    case "uncover":
      return "Something was under there.";
    case "treasure":
      return "Buried treasure. A bottle, and the tide for a note.";
    case "rebury":
      return "Tucked back under the sand.";
    case "castle":
      return "A tiny castle. Ambitious for something knee high.";
    case "erased":
      return event.by === "wave"
        ? "The wave reviewed your castle and left notes."
        : "The castle has returned to the beach.";
    case "crab":
      return "The crab has filed a complaint.";
    case "surge":
      return "The sea rinsed your toes.";
    case "bury":
      return "Feet successfully buried. Retirement speedrun.";
    case "unbury":
      return "The sand let go. Toes report for duty.";
    case "gull":
      return event.first ? "A gull has opinions." : null;
    default: {
      const leftover: never = event;
      return leftover;
    }
  }
}
