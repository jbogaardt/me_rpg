import type { ContentManager } from '../../content/ContentManager';
import { meets, requirementText, type Choice, type ScenarioNode } from '../../content/schema';
import type { ChoiceOffer, Choices } from '../../hud/Choices';
import { SKILLS, type Skill } from '../../systems/skills';
import type { Arena } from './Arena';
import type { Zones } from './Zones';

/**
 * Scenario nodes (public/content/scenarios.json) at runtime: which node the local player is in, loading one
 * (`load`, the engine's `loadScenario`) and offering its choices. Solo only for now: online, every zone goes back to its
 * biome's own node so all players agree on who stands where (the host does not send a node yet), and no choices show.
 */
export class Scenario {
  /** The node the game is in: the start node, then whichever was loaded last. */
  current: string;
  private busy = false; // a node is loading (its zone may still be fetched)

  constructor(
    private arena: Arena,
    private zones: Zones,
    private content: ContentManager,
    private choices: Choices,
    private say: (lines: string[]) => void,
  ) {
    this.current = content.startNode.node_id;
    choices.onPick = (choice) => void this.pick(choice);
  }

  get node(): ScenarioNode {
    return this.content.getScenario(this.current);
  }

  /**
   * Load a scenario node: its biome's zone (loaded if need be) gets the node's entities in place of whoever was there,
   * and the local player is taken there (through the iris, so the old view is cleared away) to the node's spawn, or the
   * map's. Its choices then show. Refused online for now.
   */
  async load(nodeId: string): Promise<void> {
    const { arena, zones } = this;
    if (arena.role !== 'solo') throw new Error('Scenarios can only be loaded in a solo game for now');
    const node = this.content.getScenario(nodeId);
    const zoneName = this.content.getBiomeInfo(node.biome_type).map;
    this.busy = true;
    try {
      await zones.ensure(zoneName);
      const dest = arena.zones.get(zoneName);
      if (!dest) throw new Error(`Zone "${zoneName}" did not load`);
      const to = node.spawn ? { col: node.spawn.x, row: node.spawn.y } : dest.data.spawn;
      zones.travel(arena.local, dest, to); // takes the picture of the old view first, then swaps
      zones.assign(zoneName, nodeId);
      this.current = nodeId;
    } finally {
      this.busy = false;
    }
  }

  /**
   * Take a saved node as the current one without going there (a reload puts the hero at home, not in the node's zone):
   * its zone, loaded if need be, shows the node's folk and foes from now on. Throws if the world has no such node.
   */
  async adopt(nodeId: string): Promise<void> {
    const { arena, zones } = this;
    if (arena.role !== 'solo') throw new Error('Scenarios can only be loaded in a solo game for now');
    const zoneName = this.content.getBiomeInfo(this.content.getScenario(nodeId).biome_type).map;
    await zones.ensure(zoneName);
    zones.assign(zoneName, nodeId);
    this.current = nodeId;
  }

  private async pick(choice: Choice) {
    if (this.busy || this.arena.role !== 'solo') return;
    if (!meets(this.arena.hero, choice.requires)) {
      const o = this.offer(choice);
      this.say([choice.hint ?? 'The way is shut.', `Needs ${o.needs}.`]);
      return;
    }
    try {
      await this.load(choice.next);
    } catch (err) {
      console.error(err);
      this.say([`The way to "${choice.next}" will not open.`]);
    }
  }

  /** Each frame: the choices of the current node while the local player is in its zone and nothing else is up. */
  update(blocked: boolean) {
    const { arena } = this;
    if (arena.role !== 'solo') {
      if (this.zones.customised) this.zones.resetNodes();
      this.current = this.content.startNode.node_id;
      this.choices.show(null);
      return;
    }
    const node = this.node;
    const here = this.content.getBiomeInfo(node.biome_type).map === arena.local.zone;
    if (blocked || this.busy || !here) {
      this.choices.show(null);
      return;
    }
    this.choices.show(node.choices.map((c) => this.offer(c)));
  }

  private offer(choice: Choice): ChoiceOffer {
    const req = choice.requires;
    return {
      choice,
      needs: req ? requirementText(req, (id) => (SKILLS as Record<string, Skill | undefined>)[id]?.name ?? id) : null,
      hint: choice.hint,
      allowed: meets(this.arena.hero, req),
    };
  }
}
