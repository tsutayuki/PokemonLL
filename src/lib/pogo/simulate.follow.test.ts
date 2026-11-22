import { describe, expect, it } from "vitest";
import type { PvpMove } from "./combat";
import { buildLeadScript } from "./followPlan";
import { shieldsSpent, simulateBattle, type FighterInput } from "./simulate";

function move(partial: Partial<PvpMove> & Pick<PvpMove, "id" | "kind">): PvpMove {
  return {
    name: partial.id,
    en: partial.id,
    type: "normal",
    power: partial.kind === "fast" ? 2 : 40,
    energy: partial.kind === "fast" ? 0 : 35,
    energyGain: partial.kind === "fast" ? 10 : 0,
    turns: partial.kind === "fast" ? 1 : 1,
    ...partial,
  };
}

function fighter(partial: Partial<FighterInput> = {}): FighterInput {
  return {
    label: "a",
    attack: 120,
    defense: 100,
    hp: 80,
    types: ["normal"],
    shadow: false,
    fast: move({ id: "fast", kind: "fast" }),
    charged: [move({ id: "charge", kind: "charged", energy: 50, power: 60 })],
    shields: 0,
    timing: "asap",
    applyChanceBuffs: false,
    ...partial,
  };
}

describe("後追い", () => {
  it("通常の1対1は後追い情報を持たない", () => {
    const result = simulateBattle(fighter({ attack: 180, hp: 40 }), fighter({ label: "b", attack: 80, hp: 20, defense: 40 }));
    expect(result.follow).toBeNull();
    expect(result.winner).toBe("a");
  });

  it("指定行動の次ターンに交代し、そのターンは引き先が技を出さない", () => {
    const lead = fighter({ hp: 50, attack: 90 });
    const backFast = move({ id: "back-fast", kind: "fast", power: 8, energyGain: 5 });
    const result = simulateBattle(
      {
        ...lead,
        timelinePlan: [{ kind: "fast", moveId: "fast" }],
        follow: {
          switchTurn: 2,
          next: {
            label: "back",
            attack: 140,
            defense: 100,
            hp: 90,
            types: ["normal"],
            shadow: false,
            fast: backFast,
            charged: [],
            timing: "asap",
            applyChanceBuffs: false,
          },
        },
      },
      fighter({ label: "b", attack: 70, hp: 200, defense: 80 }),
    );
    const switched = result.timeline.find((event) => event.moveName === "交代");
    expect(switched?.turn).toBe(2);
    expect(result.timeline.some((event) => event.turn === 2 && event.actor === "a" && event.kind === "fast")).toBe(false);
    expect(result.follow?.switched).toBe(true);
    expect(result.follow?.backEntered).toBe(true);
  });

  it("交代ターンの新しい相手技は初手を見て決め、引き先が受ける", () => {
    const nuke = move({ id: "nuke", kind: "charged", energy: 35, power: 90 });
    const result = simulateBattle(
      {
        ...fighter({ hp: 50, defense: 80, attack: 100, charged: [] }),
        timelinePlan: [{ kind: "fast", moveId: "fast" }],
        follow: {
          switchTurn: 2,
          next: {
            label: "back",
            attack: 100,
            defense: 250,
            hp: 200,
            types: ["normal"],
            shadow: false,
            fast: move({ id: "back-fast", kind: "fast" }),
            charged: [],
            timing: "asap",
            applyChanceBuffs: false,
          },
        },
      },
      fighter({
        label: "b",
        attack: 200,
        hp: 200,
        defense: 100,
        fast: move({ id: "opp-fast", kind: "fast", turns: 1, energyGain: 40, power: 3 }),
        charged: [nuke],
        timing: "asap",
      }),
    );
    const firstThrow = result.timeline.find((event) => event.actor === "b" && event.kind === "charged");
    expect(firstThrow?.moveId).toBe("nuke");
    expect(firstThrow?.turn).toBe(2);
    expect(result.follow?.leadHp).toBeGreaterThan(0);
    expect(result.follow?.backHp).toBeLessThan(200);
  });

  it("初手が先に倒れると次ターンに引き先が出る", () => {
    const result = simulateBattle(
      {
        ...fighter({ hp: 5, defense: 40, attack: 10, charged: [] }),
        follow: {
          switchTurn: 30,
          next: {
            label: "back",
            attack: 200,
            defense: 120,
            hp: 100,
            types: ["normal"],
            shadow: false,
            fast: move({ id: "back-fast", kind: "fast", power: 12 }),
            charged: [move({ id: "back-charge", kind: "charged", energy: 20, power: 80 })],
            timing: "asap",
            applyChanceBuffs: false,
          },
        },
      },
      fighter({ label: "b", attack: 180, hp: 70, defense: 60, charged: [] }),
    );
    expect(result.follow?.backEntered).toBe(true);
    expect(result.follow?.leadHp).toBe(0);
    expect(result.winner).toBe("a");
  });

  it("交代前に相手が倒れたら初手のHPで勝ちにする", () => {
    const result = simulateBattle(
      {
        ...fighter({ attack: 220, hp: 100, defense: 120, charged: [] }),
        timelinePlan: [{ kind: "fast", moveId: "fast" }, { kind: "fast", moveId: "fast" }],
        follow: {
          switchTurn: 8,
          next: {
            label: "back",
            attack: 10,
            defense: 10,
            hp: 10,
            types: ["normal"],
            shadow: false,
            fast: move({ id: "back-fast", kind: "fast", power: 1, energyGain: 0 }),
            charged: [],
            timing: "asap",
            applyChanceBuffs: false,
          },
        },
      },
      fighter({ label: "b", attack: 10, hp: 8, defense: 30, charged: [] }),
    );
    expect(result.winner).toBe("a");
    expect(result.follow?.earlyWin).toBe(true);
    expect(result.follow?.active).toBe("lead");
    expect(result.follow?.switched).toBe(false);
    expect(result.rating).toBeGreaterThan(100);
  });

  it("受けたスペシャルの通し番号は引き先へ引き継ぐ", () => {
    const result = simulateBattle(
      {
        ...fighter({ hp: 80, defense: 100, shields: 1, shieldThrows: [1] }),
        timelinePlan: [{ kind: "fast", moveId: "fast" }],
        follow: {
          switchTurn: 2,
          next: {
            label: "back",
            attack: 100,
            defense: 100,
            hp: 80,
            types: ["normal"],
            shadow: false,
            fast: move({ id: "back-fast", kind: "fast", turns: 1 }),
            charged: [],
            timing: "asap",
            applyChanceBuffs: false,
          },
        },
      },
      {
        ...fighter({
          label: "b",
          attack: 140,
          hp: 180,
          fast: move({ id: "opp-fast", kind: "fast", turns: 1, energyGain: 50 }),
          charged: [move({ id: "throw", kind: "charged", energy: 35, power: 50 })],
          timing: "asap",
        }),
        startEnergy: 70,
      },
    );
    const shielded = result.timeline.filter((event) => event.actor === "b" && event.kind === "charged" && event.shielded);
    expect(shielded.length).toBe(1);
    expect(shielded[0]?.turn).toBeGreaterThanOrEqual(2);
  });

  it("初手と相手が同時に倒れたら引き先のHPで自分の勝ちにする", () => {
    const result = simulateBattle(
      {
        ...fighter({ hp: 1, defense: 1, attack: 200, charged: [] }),
        timelinePlan: [{ kind: "fast", moveId: "fast" }],
        follow: {
          switchTurn: 20,
          next: {
            label: "back",
            attack: 100,
            defense: 100,
            hp: 120,
            types: ["normal"],
            shadow: false,
            fast: move({ id: "back-fast", kind: "fast" }),
            charged: [],
            timing: "asap",
            applyChanceBuffs: false,
            startHp: 90,
          },
        },
      },
      fighter({ label: "b", hp: 1, defense: 1, attack: 200, charged: [] }),
    );
    expect(result.winner).toBe("a");
    expect(result.follow?.backEntered).toBe(false);
    expect(result.rating).toBe(100 + Math.round((100 * 90) / 120));
  });

  it("引き先の初期HPと初期ゲージを使う", () => {
    const result = simulateBattle(
      {
        ...fighter({ hp: 40, defense: 80, charged: [] }),
        timelinePlan: [{ kind: "fast", moveId: "fast" }],
        follow: {
          switchTurn: 2,
          next: {
            label: "back",
            attack: 100,
            defense: 300,
            hp: 100,
            types: ["normal"],
            shadow: false,
            fast: move({ id: "back-fast", kind: "fast", power: 1 }),
            charged: [],
            timing: "asap",
            applyChanceBuffs: false,
            startHp: 55,
            startEnergy: 17,
          },
        },
      },
      fighter({ label: "b", attack: 1, hp: 300, defense: 300, charged: [], fast: move({ id: "opp-fast", kind: "fast", power: 1, turns: 5 }) }),
    );
    const switched = result.timeline.find((event) => event.moveName === "交代");
    expect(switched?.hpA).toBe(55);
    expect(result.follow?.backEnergy).toBeGreaterThanOrEqual(17);
  });

  it("スペシャルで打ち切ったノーマルの次のターンに交代する", () => {
    const fast = move({ id: "fast", kind: "fast", turns: 2, energyGain: 9, power: 3 });
    const result = simulateBattle(
      {
        ...fighter({ hp: 200, defense: 200, attack: 100, charged: [], fast }),
        timelinePlan: Array.from({ length: 5 }, () => ({ kind: "fast" as const, moveId: "fast" })),
        follow: {
          switchTurn: 11,
          next: {
            label: "back",
            attack: 100,
            defense: 100,
            hp: 100,
            types: ["normal"],
            shadow: false,
            fast: move({ id: "back-fast", kind: "fast", turns: 1, energyGain: 4, power: 1 }),
            charged: [],
            timing: "asap",
            applyChanceBuffs: false,
          },
        },
      },
      fighter({
        label: "b",
        hp: 300,
        defense: 200,
        attack: 100,
        fast: move({ id: "ember", kind: "fast", turns: 2, energyGain: 9, power: 1 }),
        charged: [move({ id: "ball", kind: "charged", energy: 35, power: 40 })],
        timing: "asap",
      }),
    );
    const byTurn = (turn: number, actor: "a" | "b") => result.timeline.filter((event) => event.turn === turn && event.actor === actor);
    const fourth = byTurn(7, "a").find((event) => event.kind === "fast");
    expect(fourth?.actionId).toBe(byTurn(8, "a").find((event) => event.kind === "fast")?.actionId);
    expect(byTurn(9, "a").find((event) => event.kind === "fast")?.actionId).not.toBe(fourth?.actionId);
    expect(byTurn(10, "a").some((event) => event.kind === "fast")).toBe(false);
    expect(result.timeline.find((event) => event.moveName === "交代")?.turn).toBe(10);
    expect(byTurn(9, "b").some((event) => event.kind === "charged")).toBe(true);
  });

  it("打ち切り済みの1ターンは交代をさらに早めない", () => {
    const fast = move({ id: "fast", kind: "fast", turns: 2, energyGain: 9, power: 3 });
    const back = {
      label: "back",
      attack: 100,
      defense: 100,
      hp: 100,
      types: ["normal"],
      shadow: false,
      fast: move({ id: "back-fast", kind: "fast", turns: 1, energyGain: 4, power: 1 }),
      charged: [],
      timing: "asap" as const,
      applyChanceBuffs: false,
    };
    const result = simulateBattle(
      {
        ...fighter({ hp: 200, defense: 200, attack: 100, charged: [], fast }),
        timelinePlan: [
          { kind: "fast", moveId: "fast", turns: 2 },
          { kind: "fast", moveId: "fast", turns: 2 },
          { kind: "fast", moveId: "fast", turns: 2 },
          { kind: "fast", moveId: "fast", turns: 2 },
          { kind: "fast", moveId: "fast", turns: 1 },
        ],
        follow: { switchTurn: 10, next: back },
      },
      fighter({
        label: "b",
        hp: 300,
        defense: 200,
        attack: 100,
        fast: move({ id: "ember", kind: "fast", turns: 2, energyGain: 9, power: 1 }),
        charged: [move({ id: "ball", kind: "charged", energy: 35, power: 40 })],
        timing: "asap",
      }),
    );
    expect(result.timeline.find((event) => event.moveName === "交代")?.turn).toBe(10);
  });
});

describe("評価が同じときの最適", () => {
  it("指定した枚数のシールドを使った方を、残りゲージより先に残す", () => {
    const left = fighter({
      attack: 100,
      defense: 500,
      hp: 10000,
      fast: move({ id: "fast", kind: "fast", turns: 1, power: 0, energyGain: 50 }),
      charged: [move({ id: "nuke", kind: "charged", power: 200, energy: 50 })],
    });
    const right = fighter({
      label: "b",
      attack: 10,
      defense: 40,
      hp: 20,
      shields: 1,
      fast: move({ id: "bfast", kind: "fast", turns: 1, power: 0, energyGain: 20 }),
      charged: [move({ id: "bcharge", kind: "charged", power: 0, energy: 40 })],
    });
    const used = simulateBattle(left, { ...right, shieldThrows: [0] });
    const missed = simulateBattle(left, { ...right, shieldThrows: [1] });
    expect(used.rating).toBe(missed.rating);
    expect(missed.energyB).toBeGreaterThan(used.energyB);
    const result = simulateBattle(left, right);
    expect(shieldsSpent(result.timeline, "b")).toBe(1);
  });

  it("シールドの使用が同じなら、相性込みのDPEが高い技を多く撃つ方を選ぶ", () => {
    const result = simulateBattle(
      fighter({
        attack: 200,
        defense: 100,
        hp: 100,
        types: ["fighting"],
        fast: move({ id: "fast", kind: "fast", turns: 1, power: 0, energyGain: 20 }),
        charged: [
          move({ id: "ghost", kind: "charged", type: "ghost", power: 80, energy: 40 }),
          move({ id: "fight", kind: "charged", type: "fighting", power: 80, energy: 40 }),
        ],
      }),
      fighter({
        label: "b",
        types: ["normal"],
        attack: 10,
        defense: 40,
        hp: 30,
        fast: move({ id: "bfast", kind: "fast", turns: 1, power: 0, energyGain: 5 }),
        charged: [move({ id: "bcharge", kind: "charged", power: 10, energy: 100 })],
      }),
    );
    const thrown = result.timeline.filter((event) => event.actor === "a" && event.kind === "charged");
    expect(thrown.length).toBeGreaterThan(0);
    expect(thrown.every((event) => event.moveId === "fight")).toBe(true);
  });

  it("評価が違えば、DPEが高くても評価の低い技は選ばない", () => {
    const right = fighter({
      label: "b",
      types: ["normal"],
      attack: 200,
      defense: 100,
      hp: 500,
      fast: move({ id: "bfast", kind: "fast", turns: 1, power: 10, energyGain: 5 }),
      charged: [move({ id: "bcharge", kind: "charged", power: 10, energy: 100 })],
    });
    const chip = move({ id: "chip", kind: "charged", type: "fighting", power: 104, energy: 10 });
    const nuke = move({ id: "nuke", kind: "charged", type: "normal", power: 800, energy: 50 });
    const left = {
      attack: 100,
      defense: 50,
      hp: 40,
      types: ["fighting"],
      fast: move({ id: "fast", kind: "fast", turns: 1, power: 0, energyGain: 50 }),
    };
    const chipOnly = simulateBattle(fighter({ ...left, charged: [chip] }), right);
    const nukeOnly = simulateBattle(fighter({ ...left, charged: [nuke] }), right);
    expect(nukeOnly.rating).toBeGreaterThan(chipOnly.rating);
    const result = simulateBattle(fighter({ ...left, charged: [chip, nuke] }), right);
    expect(result.timeline.some((event) => event.actor === "a" && event.moveId === "nuke")).toBe(true);
  });
});

describe("後追いのシールド枚数", () => {
  it("相手のスペシャルが1発なら、2枚指定でも1枚で止める", () => {
    const result = simulateBattle(
      {
        ...fighter({
          attack: 200,
          hp: 80,
          startEnergy: 50,
          fast: move({ id: "fast", kind: "fast", turns: 1, power: 1, energyGain: 0 }),
          charged: [move({ id: "only", kind: "charged", power: 80, energy: 40 })],
          timelinePlan: [{ kind: "charged", moveId: "only" }],
        }),
        follow: {
          switchTurn: 3,
          next: {
            label: "back",
            attack: 100,
            defense: 100,
            hp: 80,
            types: ["normal"],
            shadow: false,
            fast: move({ id: "back-fast", kind: "fast", power: 1, energyGain: 0 }),
            charged: [],
            timing: "asap",
            applyChanceBuffs: false,
          },
        },
      },
      fighter({ label: "b", hp: 100, defense: 80, shields: 2, charged: [] }),
    );
    expect(shieldsSpent(result.timeline, "b")).toBe(1);
  });

  it("2発届くなら、使わない方が評価が高くても2枚使う", () => {
    const poke = move({ id: "poke", kind: "charged", power: 1, energy: 20 });
    const inputA: FighterInput = {
      ...fighter({
        attack: 180,
        defense: 200,
        hp: 100,
        startHp: 12,
        startEnergy: 40,
        fast: move({ id: "fast", kind: "fast", turns: 1, power: 8, energyGain: 0 }),
        charged: [poke],
        timelinePlan: [
          { kind: "fast", moveId: "fast" },
          { kind: "charged", moveId: "poke" },
          { kind: "charged", moveId: "poke" },
        ],
      }),
      follow: {
        switchTurn: 20,
        next: {
          label: "back",
          attack: 100,
          defense: 100,
          hp: 100,
          types: ["normal"],
          shadow: false,
          fast: move({ id: "back-fast", kind: "fast", power: 0, energyGain: 0 }),
          charged: [],
          timing: "asap",
          applyChanceBuffs: false,
        },
      },
    };
    const inputB = fighter({
      label: "b",
      attack: 1,
      defense: 100,
      hp: 300,
      speciesId: 845,
      shields: 2,
      startEnergy: 45,
      fast: move({ id: "bfast", kind: "fast", turns: 1, power: 1, energyGain: 0 }),
      charged: [move({ id: "DIVE", kind: "charged", power: 1, energy: 45 })],
    });
    const chased = simulateBattle(inputA, inputB);
    const bare = { ...inputA, follow: null };
    const normalOpen = simulateBattle(bare, { ...inputB, shieldThrows: [2, 3] });
    const normalShield = simulateBattle(bare, { ...inputB, shieldThrows: [0, 1] });
    const normal = simulateBattle(bare, inputB);
    expect(normalShield.rating).toBeGreaterThan(normalOpen.rating);
    expect(shieldsSpent(normal.timeline, "b")).toBe(0);
    expect(shieldsSpent(chased.timeline, "b")).toBe(2);
  });
});

describe("後追いの同点", () => {
  it("DPEは引き先の技だけで比べ、初手の技は数えない", () => {
    const leadNuke = move({ id: "lead-nuke", kind: "charged", type: "ghost", power: 200, energy: 10 });
    const plain = move({ id: "plain", kind: "charged", type: "normal", power: 80, energy: 40 });
    const stab = move({ id: "stab", kind: "charged", type: "fighting", power: 80, energy: 40 });
    const result = simulateBattle(
      {
        ...fighter({
          attack: 1,
          defense: 500,
          hp: 500,
          types: ["ghost"],
          fast: move({ id: "fast", kind: "fast", turns: 1, power: 0, energyGain: 10 }),
          charged: [leadNuke],
          timelinePlan: [
            { kind: "fast", moveId: "fast" },
            { kind: "charged", moveId: "lead-nuke" },
          ],
        }),
        follow: {
          switchTurn: 3,
          next: {
            label: "back",
            attack: 400,
            defense: 100,
            hp: 100,
            types: ["fighting"],
            shadow: false,
            fast: move({ id: "back-fast", kind: "fast", turns: 1, power: 0, energyGain: 40 }),
            charged: [plain, stab],
            timing: "asap",
            applyChanceBuffs: false,
          },
        },
      },
      fighter({
        label: "b",
        types: ["normal"],
        attack: 1,
        defense: 100,
        hp: 30,
        fast: move({ id: "bfast", kind: "fast", turns: 1, power: 0, energyGain: 0 }),
        charged: [],
      }),
    );
    const backThrows = result.timeline.filter((event) => event.actor === "a" && event.mon === "back" && event.kind === "charged");
    expect(backThrows.map((event) => event.moveId)).toEqual(["stab"]);
    expect(result.timeline.some((event) => event.mon === "lead" && event.moveId === "lead-nuke")).toBe(true);
  });
});

describe("後追いの初手の1発調整", () => {
  const buffMove = move({
    id: "buff",
    kind: "charged",
    power: 40,
    energy: 10,
    buffs: [2, 0],
    buffChance: 0.5,
    buffTarget: "self",
  });

  function leadBattle(throwTweaks: FighterInput["throwTweaks"]) {
    return simulateBattle(
      {
        ...fighter({
          attack: 100,
          defense: 100,
          hp: 200,
          startEnergy: 20,
          applyChanceBuffs: false,
          fast: move({ id: "fast", kind: "fast", turns: 1, power: 10, energyGain: 0 }),
          charged: [buffMove],
          throwTweaks,
          timelinePlan: [
            { kind: "charged", moveId: "buff" },
            { kind: "fast", moveId: "fast" },
            { kind: "charged", moveId: "buff" },
          ],
        }),
        follow: {
          switchTurn: 8,
          next: {
            label: "back",
            attack: 100,
            defense: 100,
            hp: 100,
            types: ["normal"],
            shadow: false,
            fast: move({ id: "back-fast", kind: "fast", power: 1, energyGain: 0 }),
            charged: [move({ id: "back-charge", kind: "charged", power: 40, energy: 50 })],
            timing: "asap",
            applyChanceBuffs: false,
          },
        },
      },
      fighter({ label: "b", attack: 1, defense: 100, hp: 500, charged: [] }),
    );
  }

  function leadCharges(result: ReturnType<typeof leadBattle>) {
    const seen = new Set<number>();
    return result.timeline.filter((event) => {
      if (event.mon !== "lead" || event.kind !== "charged" || seen.has(event.actionId)) return false;
      seen.add(event.actionId);
      return true;
    });
  }

  it("ダメージ割合は初手のその1発だけを変え、次の初手は変えない", () => {
    const plain = leadCharges(leadBattle(null));
    const half = leadCharges(leadBattle([{ buff: false, damagePercent: 50 }]));
    expect(plain).toHaveLength(2);
    expect(half[0]?.damage).toBe(Math.max(1, Math.round((plain[0]?.damage ?? 0) / 2)));
    expect(half[1]?.damage).toBe(plain[1]?.damage);
  });

  it("追加効果の指定は初手のその1発に乗り、指定しないときは確率技を発動しない", () => {
    const plain = leadBattle(null);
    const forced = leadBattle([{ buff: true, damagePercent: 100 }]);
    const fastDamage = (result: ReturnType<typeof leadBattle>) =>
      result.timeline.find((event) => event.mon === "lead" && event.kind === "fast")?.damage ?? 0;
    expect(fastDamage(forced)).toBeGreaterThan(fastDamage(plain));
  });
});

describe("倒し切れるスペシャルを撃たなかったターン", () => {
  it("次のターンで撃たなければ、その前のターンを記録する", () => {
    const result = simulateBattle(
      fighter({
        attack: 200,
        defense: 100,
        hp: 120,
        startEnergy: 50,
        fast: move({ id: "fast", kind: "fast", turns: 1, power: 0, energyGain: 0 }),
        charged: [move({ id: "nuke", kind: "charged", power: 160, energy: 40 })],
        timelinePlan: [
          { kind: "fast", moveId: "fast" },
          { kind: "fast", moveId: "fast" },
          { kind: "charged", moveId: "nuke" },
        ],
      }),
      fighter({
        label: "b",
        attack: 10,
        defense: 40,
        hp: 40,
        fast: move({ id: "bfast", kind: "fast", turns: 1, power: 0, energyGain: 0 }),
        charged: [move({ id: "bcharge", kind: "charged", power: 10, energy: 100 })],
      }),
    );
    expect(result.koMissA).toContain(1);
    expect(result.koMissA).not.toContain(2);
  });

  it("次のターンで倒し切る技を撃てば記録しない", () => {
    const result = simulateBattle(
      fighter({
        attack: 200,
        defense: 100,
        hp: 120,
        startEnergy: 50,
        fast: move({ id: "fast", kind: "fast", turns: 1, power: 0, energyGain: 0 }),
        charged: [move({ id: "nuke", kind: "charged", power: 160, energy: 40 })],
        timelinePlan: [
          { kind: "fast", moveId: "fast" },
          { kind: "charged", moveId: "nuke" },
        ],
      }),
      fighter({
        label: "b",
        attack: 10,
        defense: 40,
        hp: 40,
        fast: move({ id: "bfast", kind: "fast", turns: 1, power: 0, energyGain: 0 }),
        charged: [move({ id: "bcharge", kind: "charged", power: 10, energy: 100 })],
      }),
    );
    expect(result.koMissA).not.toContain(1);
  });
});

describe("自分のスペシャル直後の交代", () => {
  it("そのターンの最後に交代が付き、次のターンは引き先が動く", () => {
    const result = simulateBattle(
      {
        ...fighter({
          hp: 120,
          defense: 200,
          attack: 100,
          fast: move({ id: "fast", kind: "fast", turns: 1, energyGain: 50, power: 1 }),
          charged: [move({ id: "charge", kind: "charged", energy: 50, power: 40 })],
        }),
        timelinePlan: [
          { kind: "fast", moveId: "fast" },
          { kind: "charged", moveId: "charge" },
        ],
        follow: {
          switchTurn: 3,
          next: {
            label: "back",
            attack: 100,
            defense: 200,
            hp: 90,
            types: ["normal"],
            shadow: false,
            fast: move({ id: "back-fast", kind: "fast", turns: 1, energyGain: 4, power: 1 }),
            charged: [],
            timing: "asap",
            applyChanceBuffs: false,
          },
        },
      },
      fighter({
        label: "b",
        hp: 200,
        defense: 200,
        attack: 80,
        fast: move({ id: "bfast", kind: "fast", turns: 1, energyGain: 30, power: 1 }),
        charged: [move({ id: "bcharge", kind: "charged", energy: 50, power: 30 })],
        timing: "asap",
      }),
    );
    const playerCharge = result.timeline.find((event) => event.actor === "a" && event.kind === "charged");
    const switched = result.timeline.find((event) => event.actor === "a" && event.moveName === "交代");
    expect(playerCharge?.turn).toBe(2);
    expect(switched?.turn).toBe(2);
    expect((switched?.line ?? 0) > (playerCharge?.line ?? 0)).toBe(true);
    expect(result.timeline.find((event) => event.turn === 3 && event.actor === "a" && event.kind === "fast")?.moveId).toBe("back-fast");
    expect(result.timeline.some((event) => event.turn === 3 && event.moveName === "交代")).toBe(false);
    expect(result.timeline.find((event) => event.actor === "b" && event.kind === "charged")?.turn).toBe(3);
  });
});

describe("相手初手交代", () => {
  it("1ターン目は交代として空き、次のターンから動く", () => {
    const result = simulateBattle(
      fighter({ attack: 100, hp: 100 }),
      {
        ...fighter({ label: "b", attack: 100, hp: 100 }),
        timelinePlan: [{ kind: "wait", show: "交代" }, { kind: "fast", moveId: "fast" }],
      },
    );
    expect(result.timeline.find((event) => event.actor === "b" && event.moveName === "交代")?.turn).toBe(1);
    expect(result.timeline.some((event) => event.turn === 1 && event.actor === "b" && event.kind === "fast")).toBe(false);
    expect(result.timeline.find((event) => event.actor === "b" && event.kind === "fast")?.turn).toBe(2);
  });

  it("表示指定のない待機は交代の行を出さない", () => {
    const result = simulateBattle(fighter({ hp: 100 }), {
      ...fighter({ label: "b", hp: 100 }),
      timelinePlan: [{ kind: "wait" }, { kind: "fast", moveId: "fast" }],
    });
    expect(result.timeline.some((event) => event.actor === "b" && event.moveName === "交代")).toBe(false);
    expect(result.timeline.find((event) => event.actor === "b" && event.kind === "fast")?.turn).toBe(2);
  });
});

describe("交代手順", () => {
  it("足りないゲージ分のノーマルアタックを内部で足す", () => {
    const script = buildLeadScript({
      fastId: "fast",
      fastTurns: 2,
      fastGain: 8,
      fastCount: 1,
      specials: [{ id: "special", energy: 16 }],
    });
    expect(script.fastUsed).toBe(2);
    expect(script.addedFast).toBe(1);
    expect(script.switchTurn).toBe(6);
  });
});
