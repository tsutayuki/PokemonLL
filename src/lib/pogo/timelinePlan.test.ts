import { describe, expect, it } from "vitest";
import { splitSwitchPlan } from "./followPlan";
import { alignPlans, extendPlanFromTimeline, fillLaggingSide, insertAtTurn, stampSegmentFastTurns, type TimelineStep } from "./timelinePlan";

const thunder = (turns?: number): TimelineStep => ({ kind: "fast", moveId: "THUNDER_SHOCK", ...(turns ? { turns } : {}) });

describe("チャージターンへのノーマル挿入", () => {
  it("手順のターン数は技のままにし、スペシャルのターンだけ表示を切る", () => {
    const lead: TimelineStep[] = [thunder(2), thunder(2), thunder(2), thunder(2), { kind: "switch" }, { kind: "fast", moveId: "DRAGON_BREATH", turns: 1 }];
    const foe: TimelineStep[] = [
      { kind: "fast", moveId: "EMBER", turns: 2 },
      { kind: "fast", moveId: "EMBER", turns: 2 },
      { kind: "fast", moveId: "EMBER", turns: 2 },
      { kind: "fast", moveId: "EMBER", turns: 2 },
      { kind: "charged", moveId: "WEATHER_BALL" },
    ];
    const placed = insertAtTurn(lead, 2, foe, 2, "a", 9, { kind: "fast", moveId: "THUNDER_SHOCK" });
    const stamped = stampSegmentFastTurns(placed.stepsA, 2, 1);
    const fourth = stamped[3];
    const inserted = stamped[4];
    expect(fourth).toMatchObject({ moveId: "THUNDER_SHOCK", turns: 2 });
    expect(inserted).toMatchObject({ moveId: "THUNDER_SHOCK", turns: 2 });
    expect(stamped[5]?.kind).toBe("switch");

    const view = alignPlans(stamped, 2, placed.stepsB, 2);
    const spans = view.a.spans.filter((span) => span.startTurn >= 7 && span.startTurn <= 10);
    expect(spans.map((span) => [span.startTurn, span.turns, span.step.kind === "fast" || span.step.kind === "charged" ? span.step.moveId : span.step.kind])).toEqual([
      [7, 2, "THUNDER_SHOCK"],
      [9, 1, "THUNDER_SHOCK"],
      [10, 1, "switch"],
    ]);
  });
});

describe("ノーマルアタックの途中への挿入", () => {
  it("どのターンをタップしても、あわは3ターンのまま増える", () => {
    const bubble = (): TimelineStep => ({ kind: "fast", moveId: "BUBBLE" });
    const steps = [bubble(), bubble(), bubble(), bubble(), bubble(), bubble()];
    for (const turn of [13, 14, 15, 16]) {
      const placed = insertAtTurn(steps, 3, [], 3, "a", turn, bubble());
      const fasts = placed.stepsA.filter((step) => step.kind === "fast");
      expect(fasts).toHaveLength(7);
      expect(fasts.every((step) => step.kind === "fast" && step.turns == null)).toBe(true);
      const view = alignPlans(placed.stepsA, 3, [], 3);
      expect(view.a.spans.every((span) => span.turns === 3 && span.step.kind === "fast")).toBe(true);
    }
  });
});

describe("後追いの空白補完", () => {
  const wing = (): TimelineStep => ({ kind: "fast", moveId: "WING_ATTACK", turns: 2 });
  const shock = (): TimelineStep => ({ kind: "fast", moveId: "THUNDER_SHOCK", turns: 2 });
  const mud = (): TimelineStep => ({ kind: "fast", moveId: "MUD_SHOT", turns: 2 });

  it("相手が長い空白は、引き先の通常技で下を埋める", () => {
    const filled = fillLaggingSide(
      [wing(), { kind: "switch" }, shock()],
      2,
      "WING_ATTACK",
      8,
      [{ id: "BLAST_BURN", energy: 50 }],
      [mud(), mud(), mud(), mud(), mud()],
      2,
      "MUD_SHOT",
      9,
      [],
      { followFast: { id: "THUNDER_SHOCK", turns: 2 } },
    );
    expect(filled.stepsA.filter((step) => step.kind === "switch")).toHaveLength(1);
    expect(filled.stepsA.filter((step) => step.kind === "fast" && step.moveId === "WING_ATTACK")).toHaveLength(1);
    expect(filled.stepsA.filter((step) => step.kind === "charged")).toHaveLength(0);
    expect(filled.stepsA.slice(-3)).toEqual([shock(), shock(), shock()]);
    expect(filled.stepsB).toHaveLength(5);
  });

  it("自分側が長い空白は、相手の通常技で埋める", () => {
    const filled = fillLaggingSide(
      [wing(), wing(), wing(), { kind: "switch" }, shock()],
      2,
      "WING_ATTACK",
      8,
      [],
      [mud()],
      2,
      "MUD_SHOT",
      9,
      [{ id: "AQUA_TAIL", energy: 35 }],
      { followFast: { id: "THUNDER_SHOCK", turns: 2 } },
    );
    expect(filled.stepsA.filter((step) => step.kind === "fast" && step.moveId === "THUNDER_SHOCK")).toHaveLength(1);
    expect(filled.stepsB.filter((step) => step.kind === "charged")).toHaveLength(0);
    expect(filled.stepsB.map((step) => (step.kind === "fast" ? step.moveId : step.kind))).toEqual([
      "MUD_SHOT",
      "MUD_SHOT",
      "MUD_SHOT",
      "MUD_SHOT",
    ]);
    expect(filled.stepsA.filter((step) => step.kind === "switch")).toHaveLength(1);
  });
});

describe("後追いの交代", () => {
  const sand = (): TimelineStep => ({ kind: "fast", moveId: "SAND_ATTACK", turns: 4 });

  it("相手にあわを足しても、指定した交代は一つで砂かけの間に増えない", () => {
    let stepsA: TimelineStep[] = [sand(), sand(), { kind: "switch" }, sand(), sand()];
    let stepsB: TimelineStep[] = [{ kind: "fast", moveId: "MUD_SHOT", turns: 2 }];
    for (const turn of [1, 4, 7, 10]) {
      const placed = insertAtTurn(stepsA, 4, stepsB, 3, "b", turn, { kind: "fast", moveId: "BUBBLE" });
      stepsA = placed.stepsA;
      stepsB = placed.stepsB;
    }
    expect(stepsB.filter((step) => step.kind === "fast" && step.moveId === "BUBBLE")).toHaveLength(4);
    expect(stepsA.filter((step) => step.kind === "switch")).toHaveLength(1);
    expect(stepsA.map((step) => (step.kind === "fast" || step.kind === "charged" ? step.moveId : step.kind))).toEqual([
      "SAND_ATTACK",
      "SAND_ATTACK",
      "switch",
      "SAND_ATTACK",
      "SAND_ATTACK",
    ]);
  });

  it("開き直しても交代の記録を手順へ足さない", () => {
    const plan: TimelineStep[] = [sand(), sand(), { kind: "switch" }, sand()];
    const events = [
      { turn: 1, actor: "a" as const, kind: "fast", moveId: "SAND_ATTACK", actionId: 1, scripted: true },
      { turn: 5, actor: "a" as const, kind: "fast", moveId: "SAND_ATTACK", actionId: 2, scripted: true },
      { turn: 9, actor: "a" as const, kind: "note", moveId: "", actionId: 3, scripted: false, moveName: "交代" },
      { turn: 10, actor: "a" as const, kind: "fast", moveId: "SAND_ATTACK", actionId: 4, scripted: true },
      { turn: 14, actor: "a" as const, kind: "fast", moveId: "SAND_ATTACK", actionId: 5, scripted: false },
    ];
    const once = extendPlanFromTimeline(plan, events, "a");
    expect(once.filter((step) => step.kind === "switch")).toHaveLength(1);
    expect(once.map((step) => (step.kind === "fast" || step.kind === "charged" ? step.moveId : step.kind))).toEqual([
      "SAND_ATTACK",
      "SAND_ATTACK",
      "switch",
      "SAND_ATTACK",
      "SAND_ATTACK",
    ]);
    const resimulated = events.map((event) => (event.actionId === 5 ? { ...event, scripted: true } : event));
    expect(extendPlanFromTimeline(once, resimulated, "a")).toEqual(once);
    const split = splitSwitchPlan([sand(), { kind: "switch" }, sand(), { kind: "switch" }, sand()]);
    expect(split.lead).toEqual([sand()]);
    expect(split.back).toEqual([sand(), sand()]);
  });
});
