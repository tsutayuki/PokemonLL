import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PvpMove } from "./combat";
import { buildLeadScript } from "./followPlan";
import { buildCpMultiplierMap, findMaxLevelBuild, type PogoStatRecord } from "./research";
import { shieldsSpent, simulateBattle, type FighterInput } from "./simulate";

const stats = JSON.parse(readFileSync("public/data/pokemon_stats.json", "utf8")) as PogoStatRecord[];
const cp = buildCpMultiplierMap(JSON.parse(readFileSync("public/data/cp_multiplier.json", "utf8")));
const bundle = JSON.parse(readFileSync("public/data/pvp_bundle.json", "utf8")) as { moves: Record<string, PvpMove> };

function buildOf(id: number) {
  const record = stats.find((row) => row.pokemon_id === id && row.form === "Normal");
  if (!record) throw new Error(String(id));
  const build = findMaxLevelBuild(record, 0, 15, 15, cp.levels, cp.byLevel, 1500);
  if (!build) throw new Error("build");
  return build;
}

function battle(scriptCct: boolean, backMoves: PvpMove[], foeMoves: PvpMove[], follow = true) {
  const self = buildOf(901);
  const foe = buildOf(845);
  const scratch = bundle.moves.SCRATCH;
  const swift = bundle.moves.SWIFT;
  const peck = bundle.moves.PECK;
  const script = buildLeadScript({
    fastId: scratch.id,
    fastTurns: scratch.turns,
    fastGain: scratch.energyGain,
    fastCount: 19,
    specials: [
      { id: swift.id, energy: swift.energy },
      { id: swift.id, energy: swift.energy },
    ],
  });
  const inputA: FighterInput = {
    label: "ursaluna",
    attack: self.attack,
    defense: self.defense,
    hp: self.stamina,
    types: ["ground", "normal"],
    shadow: false,
    fast: scratch,
    charged: [swift],
    shields: 0,
    timing: "cct",
    applyChanceBuffs: false,
    timelinePlan: script.steps,
    scriptCct,
    follow: follow
      ? {
          switchTurn: script.switchTurn,
          next: {
            label: "back",
            attack: foe.attack,
            defense: foe.defense,
            hp: foe.stamina,
            types: ["flying", "water"],
            shadow: false,
            fast: peck,
            charged: backMoves,
            timing: "cct",
            applyChanceBuffs: false,
          },
        }
      : null,
  };
  const inputB: FighterInput = {
    label: "foe",
    attack: foe.attack,
    defense: foe.defense,
    hp: foe.stamina,
    types: ["flying", "water"],
    shadow: false,
    fast: peck,
    charged: foeMoves,
    shields: 2,
    timing: "cct",
    applyChanceBuffs: false,
  };
  return simulateBattle(inputA, inputB);
}

function swiftTurns(result: ReturnType<typeof battle>) {
  const seen = new Set<number>();
  return result.timeline.flatMap((event) => {
    if (event.actor !== "a" || event.moveId !== "SWIFT" || seen.has(event.actionId)) return [];
    seen.add(event.actionId);
    return [event.turn];
  });
}

describe("後追いCCTは相手のシールド判断を変えない", () => {
  it("相手がダイビングだけのときも、指定した2枚を使う", () => {
    const moves = [bundle.moves.DIVE];
    const plain = battle(false, [bundle.moves.SURF, bundle.moves.FLY], moves);
    const cct = battle(true, [bundle.moves.SURF, bundle.moves.FLY], moves);
    expect(shieldsSpent(plain.timeline, "b")).toBe(2);
    expect(shieldsSpent(cct.timeline, "b")).toBe(2);
    expect(swiftTurns(cct)).toEqual([10, 21]);
  });

  it("相手が2技でシールドする筋は、CCTを入れても2枚のまま", () => {
    const foeMoves = [bundle.moves.DIVE, bundle.moves.AERIAL_ACE];
    const plain = battle(false, [bundle.moves.DIVE], foeMoves);
    const cct = battle(true, [bundle.moves.DIVE], foeMoves);
    expect(shieldsSpent(plain.timeline, "b")).toBe(2);
    expect(shieldsSpent(cct.timeline, "b")).toBe(2);
    expect(swiftTurns(cct)).toEqual([10, 21]);
  });
});
