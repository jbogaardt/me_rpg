// Which gates the hero's story keeps shut (Pixi-free, tested; core engine, capability `changes`). A quest step may name the
// gates it opens (`Quest.opens`, quests.json `opens`): they open when the hero hands that step in. A gate no step names
// is never shut by the story. Solo only: online the chain counts for nobody (`docs/dungeon-master.md`), so a map's gates
// stand open from the start there and a story that needs the way (a saga's dungeon) is never walled off.

import type { QuestLog } from './combat';
import { QUESTS, type Quest } from './quests';

/** Does some quest step the hero has not yet handed in open this gate? */
export function gateShut(log: QuestLog, zone: string, gate: string, quests: readonly Quest[] = QUESTS): boolean {
  const at = quests.findIndex((q) => q.opens?.some((o) => o.zone === zone && o.gate === gate));
  return at >= 0 && log.stage <= at;
}

/** What the player is told when this gate opens (the step's own words), or null. */
export function gateNote(zone: string, gate: string, quests: readonly Quest[] = QUESTS): string | null {
  for (const q of quests) for (const o of q.opens ?? []) if (o.zone === zone && o.gate === gate) return o.note ?? null;
  return null;
}
