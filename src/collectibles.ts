export type Rarity = "common" | "uncommon" | "rare" | "legendary";

export type ShellVariant = "cockle" | "spiral" | "scallop" | "conch" | "pearl";
export type CoinVariant = "copper" | "silver" | "gold";
export type CastleVariant = "tiny" | "fort";

export type CollectKind = "shell" | "coin" | "castle";

export type ShellDef = {
  kind: "shell";
  variant: ShellVariant;
  rarity: Rarity;
  points: number;
  label: string;
};

export type CoinDef = {
  kind: "coin";
  variant: CoinVariant;
  rarity: Rarity;
  points: number;
  label: string;
};

export type CastleDef = {
  kind: "castle";
  variant: CastleVariant;
  rarity: Rarity;
  points: number;
  label: string;
};

export type ItemDef = ShellDef | CoinDef | CastleDef;

export const SHELL_DEFS: Record<ShellVariant, ShellDef> = {
  cockle: { kind: "shell", variant: "cockle", rarity: "common", points: 5, label: "cockle" },
  spiral: { kind: "shell", variant: "spiral", rarity: "common", points: 8, label: "spiral" },
  scallop: { kind: "shell", variant: "scallop", rarity: "uncommon", points: 15, label: "scallop" },
  conch: { kind: "shell", variant: "conch", rarity: "uncommon", points: 25, label: "conch" },
  pearl: { kind: "shell", variant: "pearl", rarity: "rare", points: 50, label: "pearl shell" },
};

export const COIN_DEFS: Record<CoinVariant, CoinDef> = {
  copper: { kind: "coin", variant: "copper", rarity: "common", points: 20, label: "copper coin" },
  silver: { kind: "coin", variant: "silver", rarity: "uncommon", points: 40, label: "silver coin" },
  gold: { kind: "coin", variant: "gold", rarity: "rare", points: 80, label: "gold coin" },
};

export const CASTLE_DEFS: Record<CastleVariant, CastleDef> = {
  tiny: { kind: "castle", variant: "tiny", rarity: "uncommon", points: 30, label: "tiny castle" },
  fort: { kind: "castle", variant: "fort", rarity: "rare", points: 60, label: "sand fort" },
};

export type BeachLoot = {
  id: number;
  kind: CollectKind;
  variant: ShellVariant | CoinVariant | CastleVariant;
  rarity: Rarity;
  points: number;
  label: string;
  u: number;
  v: number;
  size: number;
  /** 0 fully visible, 1 fully buried. */
  buried: number;
  /** Soft spawn wash from the tide. */
  wash: number;
  /** Collect pop animation 1 -> 0. */
  spark: number;
  angle: number;
};

export type CollectionCounts = {
  shells: number;
  coins: number;
  castles: number;
  byLabel: Record<string, number>;
};

export function emptyCollection(): CollectionCounts {
  return { shells: 0, coins: 0, castles: 0, byLabel: {} };
}

export function noteCollect(counts: CollectionCounts, loot: BeachLoot): void {
  if (loot.kind === "shell") counts.shells += 1;
  else if (loot.kind === "coin") counts.coins += 1;
  else counts.castles += 1;
  counts.byLabel[loot.label] = (counts.byLabel[loot.label] ?? 0) + 1;
}

export function defFor(loot: Pick<BeachLoot, "kind" | "variant">): ItemDef {
  switch (loot.kind) {
    case "shell":
      return SHELL_DEFS[loot.variant as ShellVariant];
    case "coin":
      return COIN_DEFS[loot.variant as CoinVariant];
    case "castle":
      return CASTLE_DEFS[loot.variant as CastleVariant];
    default: {
      const leftover: never = loot.kind;
      return leftover;
    }
  }
}

function pickWeighted<T>(rng: () => number, entries: { item: T; weight: number }[]): T {
  let total = 0;
  for (const entry of entries) total += entry.weight;
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.item;
  }
  return entries[entries.length - 1]!.item;
}

export function rollShell(rng: () => number): ShellDef {
  return pickWeighted(rng, [
    { item: SHELL_DEFS.cockle, weight: 34 },
    { item: SHELL_DEFS.spiral, weight: 28 },
    { item: SHELL_DEFS.scallop, weight: 18 },
    { item: SHELL_DEFS.conch, weight: 14 },
    { item: SHELL_DEFS.pearl, weight: 6 },
  ]);
}

export function rollCoin(rng: () => number): CoinDef {
  return pickWeighted(rng, [
    { item: COIN_DEFS.copper, weight: 55 },
    { item: COIN_DEFS.silver, weight: 32 },
    { item: COIN_DEFS.gold, weight: 13 },
  ]);
}

export function rollCastle(rng: () => number): CastleDef {
  return pickWeighted(rng, [
    { item: CASTLE_DEFS.tiny, weight: 70 },
    { item: CASTLE_DEFS.fort, weight: 30 },
  ]);
}

export function rollLootDef(rng: () => number, bias: "shore" | "dune" | "any" = "any"): ItemDef {
  // Shore washes favor shells. Dunes hide more coins and buried castles.
  const shellW = bias === "shore" ? 62 : bias === "dune" ? 28 : 48;
  const coinW = bias === "shore" ? 22 : bias === "dune" ? 42 : 32;
  const castleW = bias === "shore" ? 16 : bias === "dune" ? 30 : 20;
  const kind = pickWeighted(rng, [
    { item: "shell" as const, weight: shellW },
    { item: "coin" as const, weight: coinW },
    { item: "castle" as const, weight: castleW },
  ]);
  switch (kind) {
    case "shell":
      return rollShell(rng);
    case "coin":
      return rollCoin(rng);
    case "castle":
      return rollCastle(rng);
    default: {
      const leftover: never = kind;
      return leftover;
    }
  }
}

let nextLootId = 1;

export function makeLoot(
  rng: () => number,
  opts: {
    def?: ItemDef;
    u?: number;
    v?: number;
    buried?: number;
    wash?: number;
    bias?: "shore" | "dune" | "any";
  } = {},
): BeachLoot {
  const def = opts.def ?? rollLootDef(rng, opts.bias ?? "any");
  const buried =
    opts.buried ??
    (def.kind === "shell" && rng() < 0.35
      ? rng() * 0.25
      : 0.45 + rng() * 0.5);
  return {
    id: nextLootId++,
    kind: def.kind,
    variant: def.variant,
    rarity: def.rarity,
    points: def.points,
    label: def.label,
    u: opts.u ?? 0.08 + rng() * 0.84,
    v: opts.v ?? 0.28 + rng() * 0.6,
    size:
      def.kind === "castle"
        ? 0.02 + rng() * 0.012
        : def.kind === "coin"
          ? 0.011 + rng() * 0.006
          : 0.012 + rng() * 0.016,
    buried,
    wash: opts.wash ?? 0,
    spark: 0,
    angle: rng() * Math.PI * 2,
  };
}

export const MAX_LOOT = 18;
export const TARGET_LOOT = 14;
