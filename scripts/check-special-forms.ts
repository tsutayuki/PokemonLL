import { AEGIS_CHARGE_MOVE } from "../src/lib/pogo/battleTraits.ts";
import type { PvpMove } from "../src/lib/pogo/combat.ts";
import { simulateBattle, type FighterInput } from "../src/lib/pogo/simulate.ts";

function move(partial: Partial<PvpMove> & Pick<PvpMove, "id" | "name" | "type" | "kind">): PvpMove {
  return {
    en: partial.name,
    power: 0,
    energy: 0,
    energyGain: 0,
    turns: 1,
    ...partial,
  };
}

const fast = move({ id: "THUNDER_SHOCK", name: "でんきショック", type: "electric", kind: "fast", power: 4, energyGain: 9, turns: 2 });
const aura = move({
  id: "AURA_WHEEL_ELECTRIC",
  name: "オーラぐるま",
  type: "electric",
  kind: "charged",
  power: 100,
  energy: 45,
  buffs: [1, 0],
  buffTarget: "self",
});
const fangs = move({
  id: "PSYCHIC_FANGS",
  name: "サイコファング",
  type: "psychic",
  kind: "charged",
  power: 40,
  energy: 35,
  buffs: [0, -1],
  buffTarget: "opponent",
});
const shadow = move({ id: "SHADOW_BALL", name: "シャドーボール", type: "ghost", kind: "charged", power: 90, energy: 50 });
const psycho = move({ id: "PSYCHO_CUT", name: "サイコカッター", type: "psychic", kind: "fast", power: 4, energyGain: 9, turns: 2 });
const dive = move({ id: "DIVE", name: "ダイビング", type: "water", kind: "charged", power: 50, energy: 40 });
const peck = move({ id: "PECK", name: "つつく", type: "flying", kind: "fast", power: 6, energyGain: 8, turns: 2 });

function base(over: Partial<FighterInput> & Pick<FighterInput, "label" | "fast" | "charged">): FighterInput {
  return {
    attack: 100,
    defense: 100,
    hp: 100,
    types: ["normal"],
    shadow: false,
    shields: 0,
    timing: "asap",
    applyChanceBuffs: true,
    ...over,
  };
}

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

const water = base({
  label: "water",
  attack: 90,
  defense: 120,
  hp: 200,
  types: ["water"],
  fast: move({ id: "SPLASH", name: "はねる", type: "water", kind: "fast", power: 0, energyGain: 12, turns: 2 }),
  charged: [move({ id: "AQUA", name: "なみのり", type: "water", kind: "charged", power: 10, energy: 90 })],
});

const morpeko = base({
  label: "morpeko",
  speciesId: 877,
  form: "Full_belly",
  attack: 120,
  defense: 80,
  hp: 120,
  types: ["electric", "dark"],
  fast,
  charged: [aura],
  startEnergy: 100,
});

const onlyAura = simulateBattle(morpeko, water);
const auraEvents = onlyAura.timeline.filter((event) => event.actor === "a" && event.kind === "charged");
assert(auraEvents.length >= 2, "aura throws");
assert(auraEvents[0]?.moveType === "electric", `first aura ${auraEvents[0]?.moveType}`);
assert(auraEvents[1]?.moveType === "dark", `second aura ${auraEvents[1]?.moveType}`);
assert((auraEvents[0]?.damage ?? 0) > (auraEvents[1]?.damage ?? 0), "electric hits water harder than dark");

const fangsFirst = simulateBattle(
  { ...morpeko, charged: [fangs, aura], chargedQueue: ["PSYCHIC_FANGS", "AURA_WHEEL_ELECTRIC"] },
  water,
);
const mixed = fangsFirst.timeline.filter((event) => event.actor === "a" && event.kind === "charged");
assert(mixed[1]?.moveType === "dark", "fangs then aura is the even, dark wheel");

const aegis = base({
  label: "aegis",
  speciesId: 681,
  form: "Shield",
  attack: 80,
  defense: 200,
  hp: 140,
  types: ["steel", "ghost"],
  fast: psycho,
  charged: [shadow],
  startEnergy: 0,
  aegislash: { bladeAttack: 180, bladeDefense: 70, bladeFast: psycho },
});
const foe = base({
  label: "foe",
  attack: 110,
  defense: 100,
  hp: 160,
  types: ["normal"],
  fast: psycho,
  charged: [shadow],
  shields: 0,
});
const aegisBattle = simulateBattle(aegis, foe);
const aegisFast = aegisBattle.timeline.find((event) => event.actor === "a" && event.kind === "fast" && event.damage > 0);
assert(aegisFast?.moveName === "チャージ", `shield form fast is チャージ, got ${aegisFast?.moveName}`);
assert(aegisFast?.damage === 1, "charge damage is 1");
const formRow = aegisBattle.timeline.find((event) => event.actor === "a" && event.moveName === "フォルムチェンジ");
const ball = aegisBattle.timeline.find((event) => event.actor === "a" && event.moveName === "シャドーボール");
assert(formRow && ball && formRow.turn === ball.turn && formRow.line === 0 && ball.line === 1, "form change sits above the special");
const shieldedAegis = simulateBattle({ ...aegis, shields: 1, startEnergy: 50 }, { ...foe, startEnergy: 50 });
const shieldTurn =
  shieldedAegis.timeline.find((event) => event.actor === "a" && event.moveName === "フォルムチェンジ")?.turn ?? 0;
const incomingShielded = shieldedAegis.timeline.find(
  (event) => event.actor === "b" && event.kind === "charged" && event.turn === shieldTurn,
);
assert(incomingShielded?.damage === 1 && incomingShielded.shielded, "the shield returns Aegislash to shield form");
const returned = shieldedAegis.timeline.some(
  (event) =>
    event.actor === "a" &&
    event.kind === "fast" &&
    event.moveName === "チャージ" &&
    event.damage === 1 &&
    event.turn > shieldTurn,
);
assert(returned, "shielding an incoming special returns the fast move to チャージ");

const mimikyu = base({
  label: "mimikyu",
  speciesId: 778,
  form: "Disguised",
  attack: 100,
  defense: 140,
  hp: 130,
  types: ["ghost", "fairy"],
  fast: psycho,
  charged: [shadow],
});
const breaker = base({
  label: "breaker",
  attack: 160,
  defense: 90,
  hp: 140,
  types: ["ghost"],
  fast: psycho,
  charged: [shadow],
  startEnergy: 100,
});
const mimi = simulateBattle(mimikyu, breaker);
const incoming = mimi.timeline.filter((event) => event.actor === "b" && event.kind === "charged");
assert(incoming[0]?.damage === 1, `disguise blocks to 1, got ${incoming[0]?.damage}`);
assert(incoming[0]?.disguise, "the special is marked as disguise");
assert(incoming[1] && incoming[1].damage > 1 && !incoming[1].disguise, "second special is not blocked");
assert(!mimi.timeline.some((event) => event.moveName === "ばけのかわ"), "disguise stays on the special row");

const cram = base({
  label: "cram",
  speciesId: 845,
  form: "Normal",
  attack: 130,
  defense: 100,
  hp: 150,
  types: ["flying", "water"],
  fast: peck,
  charged: [dive],
  startEnergy: 40,
});
const victim = base({
  label: "victim",
  attack: 100,
  defense: 100,
  hp: 200,
  types: ["fire"],
  fast: psycho,
  charged: [shadow],
  startEnergy: 0,
});
const gulp = simulateBattle(cram, victim);
assert(gulp.timeline.some((event) => event.moveName === "うのミサイル装填" && event.spriteId === 846), "loads arrokuda above half");
const missile = gulp.timeline.find((event) => event.moveName === "うのミサイル");
assert(missile?.damage === 30, `15% of 200 is 30, got ${missile?.damage}`);
assert(missile?.line === 0, "missile shares the special's row");
const sameTurn = simulateBattle(cram, { ...victim, attack: 100, startEnergy: 100 });
const loaded = sameTurn.timeline.find((event) => event.moveName === "うのミサイル装填");
const spit = sameTurn.timeline.find((event) => event.moveName === "うのミサイル");
assert(loaded && spit && loaded.turn === spit.turn && loaded.line !== spit.line, "load and missile share the turn on different lines");

const low = simulateBattle({ ...cram, startHp: 70, hp: 150 }, { ...victim, charged: [], startEnergy: 0 });
assert(low.timeline.some((event) => event.moveName === "うのミサイル装填" && event.spriteId === 25), "below half loads pikachu");

const core = base({
  label: "minior",
  speciesId: 774,
  form: "Red",
  attack: 140,
  defense: 80,
  hp: 100,
  types: ["rock", "flying"],
  fast: move({ id: "ROLLOUT", name: "ころがる", type: "rock", kind: "fast", power: 7, energyGain: 13, turns: 3 }),
  charged: [move({ id: "POWER_GEM", name: "パワージェム", type: "rock", kind: "charged", power: 80, energy: 50 })],
  miniorMeteor: { attack: 90, defense: 160 },
});
const hammer = base({
  label: "hammer",
  attack: 150,
  defense: 100,
  hp: 180,
  types: ["water"],
  fast: move({ id: "WATER_GUN", name: "みずでっぽう", type: "water", kind: "fast", power: 20, energyGain: 3, turns: 1 }),
  charged: [],
});
const minior = simulateBattle(core, hammer);
const early = minior.timeline.find((event) => event.actor === "b" && event.kind === "fast");
const lateForm = minior.timeline.find((event) => event.moveName === "フォルムチェンジ");
assert(lateForm?.chargeLine, "minior form change is underlined");
assert((early?.damage ?? 99) < 40, `meteor defense keeps early damage modest, got ${early?.damage}`);

const meteorForm = simulateBattle(
  {
    ...core,
    form: "Meteor",
    attack: 90,
    defense: 160,
    miniorMeteor: null,
    miniorCore: { attack: 140, defense: 80 },
  },
  hammer,
);
const meteorEarly = meteorForm.timeline.find((event) => event.actor === "b" && event.kind === "fast");
const meteorFormRow = meteorForm.timeline.find((event) => event.actor === "a" && event.moveName === "フォルムチェンジ");
assert(meteorFormRow?.chargeLine, "selecting meteor form still changes to core below half");
assert((meteorEarly?.damage ?? 99) < 40, `selected meteor form keeps meteor defense, got ${meteorEarly?.damage}`);

const shellBreak = simulateBattle(
  {
    ...core,
    hp: 100,
    startHp: 60,
    startEnergy: 80,
    attack: 90,
    charged: [shadow],
  },
  { ...hammer, attack: 160, charged: [shadow], startEnergy: 50 },
);
const shellRow = shellBreak.timeline.find((event) => event.actor === "a" && event.moveName === "フォルムチェンジ");
assert(shellRow, "core returns after the shell breaks");
assert(
  !shellBreak.timeline.some((event) => event.actor === "a" && event.kind === "charged" && event.turn === shellRow.turn),
  "an unresolved special is cancelled when the shell breaks first",
);
assert((shellRow.energyA ?? 0) >= 80, `cancelled special does not spend energy, got ${shellRow.energyA}`);

const reset = simulateBattle(
  {
    ...morpeko,
    chargedQueue: ["AURA_WHEEL_ELECTRIC", "AURA_WHEEL_ELECTRIC"],
    switchPlan: {
      turn: 2,
      next: {
        label: "morpeko",
        attack: 120,
        defense: 80,
        hp: 120,
        types: ["electric", "dark"],
        shadow: false,
        fast,
        charged: [aura],
        speciesId: 877,
        form: "Full_belly",
      },
    },
  },
  water,
);
const auras = reset.timeline.filter((event) => event.actor === "a" && event.moveName === "オーラぐるま");
assert(auras[0]?.moveType === "electric" && auras[0].turn < 2, "the wheel before switching is electric");
assert(auras.find((event) => event.turn > 2)?.moveType === "electric", "switching resets the aura count");

const fangsHit = simulateBattle(
  { ...mimikyu, hp: 200 },
  { ...breaker, fast: psycho, charged: [fangs], startEnergy: 35 },
);
const plainHit = simulateBattle(
  { ...mimikyu, hp: 200 },
  { ...breaker, fast: psycho, charged: [shadow], startEnergy: 50 },
);
const fangsFast = fangsHit.timeline.find((event) => event.actor === "b" && event.kind === "fast" && event.damage > 1);
const plainFast = plainHit.timeline.find((event) => event.actor === "b" && event.kind === "fast" && event.damage > 1);
assert((fangsFast?.damage ?? 0) > (plainFast?.damage ?? 99), "disguise defense drop stacks with the move's own drop");

const lick = move({ id: "LICK", name: "したづき", type: "ghost", kind: "fast", power: 5, energyGain: 6, turns: 1 });
const licked = { ...breaker, types: ["ghost"], fast: lick, charged: [fangs], startEnergy: 35 };
const comeBack = {
  label: "mimikyu",
  attack: 100,
  defense: 140,
  hp: 200,
  types: ["ghost", "fairy"] as string[],
  shadow: false,
  fast: psycho,
  charged: [shadow],
  speciesId: 778,
  form: "Disguised",
};
const reentered = simulateBattle({ ...mimikyu, hp: 200, switchPlan: { turn: 3, next: comeBack } }, licked);
const stayed = simulateBattle({ ...mimikyu, hp: 200 }, licked);
const cleared = simulateBattle(
  { ...mimikyu, hp: 200, switchPlan: { turn: 3, next: { ...comeBack, speciesId: 0, form: "" } } },
  licked,
);
const fastDamage = (battle: ReturnType<typeof simulateBattle>, turn: number) =>
  battle.timeline.find((event) => event.turn === turn && event.actor === "b" && event.kind === "fast")?.damage ?? 0;
const back = fastDamage(reentered, 3);
assert(
  fastDamage(stayed, 3) > back && back > fastDamage(cleared, 3),
  `re-entry keeps a single defense drop (${fastDamage(stayed, 3)} > ${back} > ${fastDamage(cleared, 3)})`,
);
assert(
  reentered.timeline.filter((event) => event.disguise).length === 1,
  "disguise stays used after switching back",
);

console.log("special forms ok", {
  aura: auraEvents.slice(0, 2).map((event) => `${event.moveType}:${event.damage}`),
  disguise: incoming.slice(0, 2).map((event) => event.damage),
  missile: missile?.damage,
  miniorTurn: lateForm?.turn,
  chargeMove: AEGIS_CHARGE_MOVE.energyGain,
});
