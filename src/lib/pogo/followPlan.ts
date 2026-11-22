import { planTurns, type TimelineStep } from "./timelinePlan";

export type FollowMove = { id: string; energy: number };

export function fastCountMax(fastTurns: number) {
  return Math.max(1, fastTurns) <= 1 ? 30 : 20;
}

/**
 * 交代までの初手手順を作る。
 * スペシャルは指定順。その直前に、足りないゲージ分のノーマルアタックを入れる。
 * 指定ノーマル回数に足りなければ、スペシャルのあとに足す。
 */
export function buildLeadScript(input: {
  fastId: string;
  fastTurns: number;
  fastGain: number;
  fastCount: number;
  startEnergy?: number;
  specials: FollowMove[];
}) {
  const gain = Math.max(0, Math.floor(input.fastGain));
  const requested = Math.max(0, Math.floor(input.fastCount));
  let energy = Math.max(0, Math.min(100, Math.floor(input.startEnergy ?? 0)));
  const steps: TimelineStep[] = [];
  let fastUsed = 0;
  const cap = 240;

  const addFast = () => {
    steps.push({ kind: "fast", moveId: input.fastId });
    energy = Math.min(100, energy + gain);
    fastUsed += 1;
  };

  for (const special of input.specials) {
    const cost = Math.max(0, Math.floor(special.energy));
    let guard = 0;
    while (energy < cost && fastUsed < cap && guard < cap) {
      if (gain <= 0 || (energy >= 100 && cost > energy)) break;
      const before = energy;
      addFast();
      guard += 1;
      if (energy <= before) break;
    }
    if (energy >= cost) {
      steps.push({ kind: "charged", moveId: special.id });
      energy = Math.max(0, energy - cost);
    }
  }
  while (fastUsed < requested && fastUsed < cap) addFast();

  const duration = planTurns(steps, Math.max(1, input.fastTurns));
  return {
    steps,
    switchTurn: duration + 1,
    fastUsed,
    addedFast: Math.max(0, fastUsed - requested),
  };
}

export function reconcileOrder(previous: string[], counts: { id: string; count: number }[]) {
  const wanted = new Map(counts.filter((item) => item.id).map((item) => [item.id, Math.max(0, item.count)]));
  const next: string[] = [];
  const used = new Map<string, number>();
  for (const id of previous) {
    const have = used.get(id) ?? 0;
    const need = wanted.get(id) ?? 0;
    if (have >= need) continue;
    next.push(id);
    used.set(id, have + 1);
  }
  for (const item of counts) {
    if (!item.id) continue;
    const have = used.get(item.id) ?? 0;
    for (let index = have; index < item.count; index += 1) next.push(item.id);
  }
  return next;
}

export function countsFromLead(steps: TimelineStep[]) {
  let fast = 0;
  const charged: string[] = [];
  for (const step of steps) {
    if (step.kind === "fast") fast += 1;
    if (step.kind === "charged") charged.push(step.moveId);
  }
  return { fast, charged };
}

export function splitSwitchPlan(steps: TimelineStep[]) {
  const boundary = steps.findIndex((step) => step.kind === "switch");
  if (boundary < 0) return { lead: steps, back: [] as TimelineStep[] };
  return {
    lead: steps.slice(0, boundary),
    back: steps.slice(boundary + 1).filter((step) => step.kind !== "switch"),
  };
}
