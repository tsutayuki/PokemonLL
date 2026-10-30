export type TimelineStep =
  | { kind: "fast"; moveId: string; /** 同じ側の割り込みで短くした長さ。未指定は技本来のターン数。 */ turns?: number }
  | { kind: "charged"; moveId: string }
  | { kind: "wait" };

export type TimelineSpan = {
  stepIndex: number;
  step: TimelineStep;
  startTurn: number;
  turns: number;
  /** スペシャルで、本来より短く終わった。 */
  cut: boolean;
};

export function stepDuration(step: TimelineStep, fastTurns: number) {
  if (step.kind === "fast") return Math.max(1, step.turns ?? fastTurns);
  return 1;
}

type Play = {
  index: number;
  stepIndex: number;
  step: TimelineStep | null;
  left: number;
  startTurn: number;
  occupied: number;
  cut: boolean;
};

export type AlignedSide = {
  spans: TimelineSpan[];
  /** ゲージが足りないスペシャルの手順番号。 */
  short: number[];
};

export type AlignedPlans = {
  turns: number;
  chargeTurns: number[];
  a: AlignedSide;
  b: AlignedSide;
};

function freshPlay(): Play {
  return { index: 0, stepIndex: -1, step: null, left: 0, startTurn: 0, occupied: 0, cut: false };
}

function beginStep(play: Play, steps: TimelineStep[], fastTurns: number, turn: number) {
  if (play.left > 0 || play.index >= steps.length) return;
  const step = steps[play.index];
  play.step = step;
  play.stepIndex = play.index;
  play.index += 1;
  play.startTurn = turn;
  play.occupied = 0;
  play.cut = false;
  play.left = stepDuration(step, fastTurns);
}

/**
 * 両側の手順を、同じターン列に置く。
 * そのターンにスペシャルアタックがあると、進行中のノーマルアタックはそこで終わり、残りのターンは行にならない。
 */
export function alignPlans(
  stepsA: TimelineStep[],
  fastA: number,
  stepsB: TimelineStep[],
  fastB: number,
  energy?: {
    gainA: number;
    gainB: number;
    costA: (moveId: string) => number;
    costB: (moveId: string) => number;
  },
): AlignedPlans {
  const playA = freshPlay();
  const playB = freshPlay();
  const spansA: TimelineSpan[] = [];
  const spansB: TimelineSpan[] = [];
  const shortA: number[] = [];
  const shortB: number[] = [];
  const chargeTurns: number[] = [];
  let energyA = 0;
  let energyB = 0;
  let turn = 1;
  const limit = Math.max(stepsA.length, stepsB.length, 1) * 8 + 4;

  const finish = (play: Play, spans: TimelineSpan[]) => {
    if (!play.step || play.occupied <= 0) return;
    spans.push({
      stepIndex: play.stepIndex,
      step: play.step,
      startTurn: play.startTurn,
      turns: play.occupied,
      cut: play.cut,
    });
    play.step = null;
    play.occupied = 0;
  };

  for (let guard = 0; guard < limit; guard += 1) {
    beginStep(playA, stepsA, fastA, turn);
    beginStep(playB, stepsB, fastB, turn);
    if (!playA.step && !playB.step) break;
    const charge = playA.step?.kind === "charged" || playB.step?.kind === "charged";
    if (charge) chargeTurns.push(turn);
    for (const play of [playA, playB]) {
      if (!play.step || play.left <= 0) continue;
      play.occupied += 1;
      play.left -= 1;
      if (play.step.kind === "fast" && charge && play.left > 0) {
        play.left = 0;
        play.cut = true;
      }
    }
    if (energy) {
      if (playA.step?.kind === "fast" && playA.left === 0) energyA = Math.min(100, energyA + Math.max(0, energy.gainA));
      if (playB.step?.kind === "fast" && playB.left === 0) energyB = Math.min(100, energyB + Math.max(0, energy.gainB));
      if (playA.step?.kind === "charged" && playA.left === 0) {
        const cost = energy.costA(playA.step.moveId);
        if (energyA < cost) shortA.push(playA.stepIndex);
        else energyA -= cost;
      }
      if (playB.step?.kind === "charged" && playB.left === 0) {
        const cost = energy.costB(playB.step.moveId);
        if (energyB < cost) shortB.push(playB.stepIndex);
        else energyB -= cost;
      }
    }
    if (playA.left === 0) finish(playA, spansA);
    if (playB.left === 0) finish(playB, spansB);
    turn += 1;
  }

  return { turns: Math.max(1, turn - 1), chargeTurns, a: { spans: spansA, short: shortA }, b: { spans: spansB, short: shortB } };
}

/** 表示上のターンへ、その側の技を入れる。ノーマルの途中なら、そこまでで切って後ろは捨てる。 */
export function insertAtTurn(
  stepsA: TimelineStep[],
  fastA: number,
  stepsB: TimelineStep[],
  fastB: number,
  side: "a" | "b",
  turn: number,
  step: TimelineStep,
) {
  const aligned = alignPlans(stepsA, fastA, stepsB, fastB);
  const steps = side === "a" ? stepsA : stepsB;
  const spans = side === "a" ? aligned.a.spans : aligned.b.spans;
  const covering = spans.find((span) => turn >= span.startTurn && turn < span.startTurn + span.turns);
  let next: TimelineStep[];
  if (!covering) next = [...steps, step];
  else if (turn === covering.startTurn) {
    next = steps.slice();
    next.splice(covering.stepIndex, 0, step);
  } else if (covering.step.kind === "fast") {
    const head: TimelineStep = { kind: "fast", moveId: covering.step.moveId, turns: turn - covering.startTurn };
    next = steps.slice();
    next.splice(covering.stepIndex, 1, head, step);
  } else {
    next = steps.slice();
    next.splice(covering.stepIndex + 1, 0, step);
  }
  return side === "a" ? { stepsA: next, stepsB } : { stepsA, stepsB: next };
}

export function expandPlan(steps: TimelineStep[], fastTurns: number): TimelineSpan[] {
  const spans: TimelineSpan[] = [];
  let turn = 1;
  steps.forEach((step, stepIndex) => {
    const turns = stepDuration(step, fastTurns);
    spans.push({ stepIndex, step, startTurn: turn, turns, cut: false });
    turn += turns;
  });
  return spans;
}

export function planTurns(steps: TimelineStep[], fastTurns: number) {
  return steps.reduce((sum, step) => sum + stepDuration(step, fastTurns), 0);
}

/** 1始まりのターンが、どの手順の何ターン目か。範囲外は null。 */
export function locateTurn(steps: TimelineStep[], fastTurns: number, turn: number) {
  let cursor = 1;
  for (let index = 0; index < steps.length; index += 1) {
    const turns = stepDuration(steps[index], fastTurns);
    if (turn < cursor + turns) {
      return { index, offset: turn - cursor, step: steps[index] };
    }
    cursor += turns;
  }
  return null;
}

/**
 * 指定ターンに挿入する位置。
 * ノーマルアタックの継続中（開始ターンより後）なら、その技の直後。
 * それ以外は、そのターンを占めている手順の前。範囲外は末尾。
 */
export function insertIndex(steps: TimelineStep[], fastTurns: number, turn: number) {
  let cursor = 1;
  for (let index = 0; index < steps.length; index += 1) {
    const turns = stepDuration(steps[index], fastTurns);
    const start = cursor;
    const end = cursor + turns - 1;
    if (turn <= end) {
      if (steps[index].kind === "fast" && turn > start) return index + 1;
      return index;
    }
    cursor = end + 1;
  }
  return steps.length;
}

export function insertStep(steps: TimelineStep[], fastTurns: number, turn: number, step: TimelineStep) {
  const next = steps.slice();
  next.splice(insertIndex(steps, fastTurns, turn), 0, step);
  return next;
}

export function deleteStep(steps: TimelineStep[], index: number) {
  return steps.filter((_, item) => item !== index);
}

/** `insertAt` は、抜いたあとの列での挿入位置。 */
export function moveStep(steps: TimelineStep[], from: number, insertAt: number) {
  if (from < 0 || from >= steps.length || insertAt === from) return steps;
  const next = steps.slice();
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(insertAt, next.length)), 0, item);
  return next;
}

export type FillMove = { id: string; energy: number };

function coveredEnd(spans: TimelineSpan[]) {
  let end = 0;
  for (const span of spans) end = Math.max(end, span.startTurn + span.turns - 1);
  return end;
}

function energyAfter(spans: TimelineSpan[], gain: number, cost: (moveId: string) => number) {
  let energy = 0;
  for (const span of spans) {
    if (span.step.kind === "fast") energy = Math.min(100, energy + Math.max(0, gain));
    else if (span.step.kind === "charged") {
      const price = cost(span.step.moveId);
      if (energy >= price) energy -= price;
    }
  }
  return energy;
}

function nextFill(energy: number, charged: FillMove[], fastId: string, fastTurns: number, gap: number): TimelineStep | null {
  const main = charged[0];
  const affordable = charged.filter((move) => move.energy > 0 && energy >= move.energy);
  const chosen = main && main.energy > 0 && energy >= main.energy ? main : affordable[0];
  if (chosen) return { kind: "charged", moveId: chosen.id };
  if (gap >= Math.max(1, fastTurns)) return { kind: "fast", moveId: fastId };
  return null;
}

/**
 * 片方の手順だけ短いとき、もう片方の最後のターンまで技を足す。
 * ゲージが足りればスペシャル。足りなければノーマル。複数ターンのノーマルは、空きがその長さになってから置く。
 */
export function fillLaggingSide(
  stepsA: TimelineStep[],
  fastA: number,
  fastIdA: string,
  gainA: number,
  chargedA: FillMove[],
  stepsB: TimelineStep[],
  fastB: number,
  fastIdB: string,
  gainB: number,
  chargedB: FillMove[],
) {
  let nextA = stepsA.slice();
  let nextB = stepsB.slice();
  const costA = (moveId: string) => chargedA.find((move) => move.id === moveId)?.energy ?? Number.POSITIVE_INFINITY;
  const costB = (moveId: string) => chargedB.find((move) => move.id === moveId)?.energy ?? Number.POSITIVE_INFINITY;
  for (let guard = 0; guard < 240; guard += 1) {
    const aligned = alignPlans(nextA, fastA, nextB, fastB);
    const endA = coveredEnd(aligned.a.spans);
    const endB = coveredEnd(aligned.b.spans);
    if (endA === endB) break;
    const lagA = endA < endB;
    const gap = Math.abs(endB - endA);
    const step = lagA
      ? nextFill(energyAfter(aligned.a.spans, gainA, costA), chargedA, fastIdA, fastA, gap)
      : nextFill(energyAfter(aligned.b.spans, gainB, costB), chargedB, fastIdB, fastB, gap);
    if (!step) break;
    if (lagA) nextA = [...nextA, step];
    else nextB = [...nextB, step];
  }
  return { stepsA: nextA, stepsB: nextB };
}

export function planFromEvents(
  events: { turn: number; actor: "a" | "b"; kind: string; moveId: string; actionId: number }[],
  actor: "a" | "b",
): TimelineStep[] {
  const steps: TimelineStep[] = [];
  const seen = new Set<number>();
  const ordered = events.slice().sort((left, right) => left.turn - right.turn || 0);
  for (const event of ordered) {
    if (event.actor !== actor || seen.has(event.actionId)) continue;
    if (event.kind !== "fast" && event.kind !== "charged") continue;
    seen.add(event.actionId);
    if (event.kind === "charged") steps.push({ kind: "charged", moveId: event.moveId });
    else steps.push({ kind: "fast", moveId: event.moveId });
  }
  return steps;
}

/** いまの手順のうしろに、最適で続いた技を足す。手順が無いときは、対戦の技を全部手順にする。 */
export function extendPlanFromTimeline(
  plan: TimelineStep[] | null,
  events: { turn: number; actor: "a" | "b"; kind: string; moveId: string; actionId: number; scripted?: boolean }[],
  actor: "a" | "b",
) {
  if (!plan) return planFromEvents(events, actor);
  const tail = planFromEvents(
    events.filter((event) => event.scripted === false),
    actor,
  );
  return tail.length ? [...plan, ...tail] : plan;
}
