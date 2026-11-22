import { describe, expect, it } from "vitest";
import type { PvpMove } from "./combat";
import { buildLeadScript } from "./followPlan";
import { simulateBattle, type FighterInput, type FollowPokemon, type SimResult } from "./simulate";

function move(partial: Partial<PvpMove> & Pick<PvpMove, "id" | "kind">): PvpMove {
  return {
    name: partial.id,
    en: partial.id,
    type: "normal",
    power: 1,
    energy: partial.kind === "fast" ? 0 : 10,
    energyGain: partial.kind === "fast" ? 0 : 0,
    turns: 1,
    ...partial,
  };
}

function side(turns: number, energy: number, timing: "cct" | "asap"): FighterInput {
  return {
    label: "a",
    attack: 100,
    defense: 200,
    hp: 500,
    types: ["normal"],
    shadow: false,
    fast: move({ id: `f${turns}`, kind: "fast", turns }),
    charged: [move({ id: "charge", kind: "charged", energy: 10 })],
    shields: 0,
    timing,
    applyChanceBuffs: false,
    startEnergy: energy,
  };
}

function backOf(turns: number, timing: "cct" | "asap", energy = 0): FollowPokemon {
  return {
    label: "back",
    attack: 100,
    defense: 200,
    hp: 500,
    types: ["normal"],
    shadow: false,
    fast: move({ id: `f${turns}`, kind: "fast", turns }),
    charged: timing === "cct" ? [move({ id: "charge", kind: "charged", energy: 10 })] : [],
    timing,
    applyChanceBuffs: false,
    startEnergy: energy,
  };
}

/** スペシャルの前に入ったノーマルアタックの本数。複数ターン技は1本に数える。 */
function farmsBeforeCharge(result: SimResult, mon?: "lead" | "back") {
  const events = result.timeline.filter(
    (event) => event.actor === "a" && (mon == null || event.mon == null || event.mon === mon),
  );
  const chargeAt = events.findIndex((event) => event.kind === "charged");
  if (chargeAt < 0) return -1;
  return new Set(events.slice(0, chargeAt).filter((event) => event.kind === "fast").map((event) => event.actionId)).size;
}

function matrix(run: (mine: number, opp: number) => number) {
  const rows: number[][] = [];
  for (let mine = 1; mine <= 5; mine += 1) {
    const row: number[] = [];
    for (let opp = 1; opp <= 5; opp += 1) row.push(run(mine, opp));
    rows.push(row);
  }
  return rows;
}

describe("CCTの25通り", () => {
  const foe = (opp: number): FighterInput => ({ ...side(opp, 0, "asap"), label: "b", charged: [] });

  it("通常モードは1〜4ターンを保ったまま、相手の5ターンにも合わせる", () => {
    expect(matrix((mine, opp) => farmsBeforeCharge(simulateBattle(side(mine, 100, "cct"), foe(opp))))).toEqual([
      [0, 1, 2, 3, 4],
      [0, 0, 1, 1, 2],
      [0, 1, 0, 1, 3],
      [0, 0, 1, 0, 1],
      [0, 0, 0, 0, 0],
    ]);
  });

  it("後追いの引き先は、交代で1ターンずれたあとの最適のまま", () => {
    expect(
      matrix((mine, opp) =>
        farmsBeforeCharge(
          simulateBattle(
            {
              ...side(1, 0, "asap"),
              charged: [],
              timelinePlan: [],
              follow: { switchTurn: 1, next: backOf(mine, "cct", 100) },
            },
            foe(opp),
          ),
          "back",
        ),
      ),
    ).toEqual([
      [0, 0, 1, 2, 3],
      [0, 0, 2, -1, 4],
      [0, 0, 0, 1, 1],
      [0, 0, 1, 0, 2],
      [0, 0, 0, 0, 0],
    ]);
  });

  it("後追いの初手は、1〜4ターンでは通常と同じで、5ターンは余り本数まで前に出す", () => {
    expect(
      matrix((mine, opp) => {
        const script = buildLeadScript({
          fastId: `f${mine}`,
          fastTurns: mine,
          fastGain: 0,
          fastCount: 12,
          startEnergy: 100,
          specials: [{ id: "charge", energy: 10 }],
        });
        return farmsBeforeCharge(
          simulateBattle(
            {
              ...side(mine, 100, "cct"),
              timelinePlan: script.steps,
              scriptCct: true,
              follow: { switchTurn: script.switchTurn, next: backOf(1, "asap") },
            },
            foe(opp),
          ),
          "lead",
        );
      }),
    ).toEqual([
      [0, 1, 2, 3, 4],
      [0, 0, 1, 1, 2],
      [0, 1, 0, 1, 3],
      [0, 0, 1, 0, 1],
      [0, 1, 1, 3, 0],
    ]);
  });

  it("余りが2本なら、5ターン技に対して2本だけ前に出す", () => {
    const script = buildLeadScript({
      fastId: "f1",
      fastTurns: 1,
      fastGain: 0,
      fastCount: 2,
      startEnergy: 100,
      specials: [{ id: "charge", energy: 10 }],
    });
    const result = simulateBattle(
      {
        ...side(1, 100, "cct"),
        timelinePlan: script.steps,
        scriptCct: true,
        follow: { switchTurn: script.switchTurn, next: backOf(1, "asap") },
      },
      foe(5),
    );
    const lead = result.timeline.filter((event) => event.actor === "a" && event.mon === "lead" && event.kind === "fast");
    expect(new Set(lead.map((event) => event.actionId)).size).toBe(2);
    expect(farmsBeforeCharge(result, "lead")).toBe(2);
  });

  it("タイムラインを固定した初手は、最適でも前に出さない", () => {
    const script = buildLeadScript({
      fastId: "f1",
      fastTurns: 1,
      fastGain: 0,
      fastCount: 4,
      startEnergy: 100,
      specials: [{ id: "charge", energy: 10 }],
    });
    const result = simulateBattle(
      {
        ...side(1, 100, "cct"),
        timelinePlan: script.steps,
        follow: { switchTurn: script.switchTurn, next: backOf(1, "asap") },
      },
      foe(5),
    );
    expect(farmsBeforeCharge(result, "lead")).toBe(0);
  });
});

describe("後追い初手の実例", () => {
  it("ひっかく19回とスピードスター2回は、20ターン目にひっかくして21ターン目に撃つ", () => {
    const scratch = move({ id: "SCRATCH", kind: "fast", turns: 1, energyGain: 4, power: 1 });
    const swift = move({ id: "SWIFT", kind: "charged", energy: 35, power: 1 });
    const peck = move({ id: "PECK", kind: "fast", turns: 2, energyGain: 8, power: 1 });
    const dive = move({ id: "DIVE", kind: "charged", energy: 40, power: 1 });
    const script = buildLeadScript({
      fastId: scratch.id,
      fastTurns: 1,
      fastGain: 4,
      fastCount: 19,
      specials: [
        { id: swift.id, energy: 35 },
        { id: swift.id, energy: 35 },
      ],
    });
    const result = simulateBattle(
      {
        label: "ursaluna",
        attack: 100,
        defense: 200,
        hp: 300,
        types: ["normal"],
        shadow: false,
        fast: scratch,
        charged: [swift],
        shields: 0,
        timing: "cct",
        applyChanceBuffs: false,
        timelinePlan: script.steps,
        scriptCct: true,
        follow: { switchTurn: script.switchTurn, next: backOf(1, "asap") },
      },
      {
        label: "cramorant",
        attack: 100,
        defense: 200,
        hp: 300,
        types: ["water"],
        shadow: false,
        fast: peck,
        charged: [dive],
        shields: 0,
        timing: "asap",
        applyChanceBuffs: false,
      },
    );
    const leadFast = result.timeline.filter((event) => event.actor === "a" && event.mon === "lead" && event.kind === "fast");
    const leadCharge = result.timeline.filter((event) => event.actor === "a" && event.mon === "lead" && event.kind === "charged");
    expect(new Set(leadFast.map((event) => event.actionId)).size).toBe(19);
    expect(new Set(leadCharge.map((event) => event.actionId)).size).toBe(2);
    expect(leadCharge.map((event) => event.turn)).toEqual([10, 21]);
    expect(leadFast.some((event) => event.turn === 20 && event.cct)).toBe(true);
    expect(result.timeline.find((event) => event.actor === "b" && event.kind === "charged")?.turn).toBe(11);
  });
});
