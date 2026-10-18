import { cellFeet } from '../../map/doors';
import {
  applyHeroSave,
  clearSave,
  heroToSave,
  loadSave,
  SAVE_VERSION,
  writeSave,
  type SaveData,
} from '../../systems/save';
import type { Arena } from './Arena';
import type { Scenario } from './Scenario';
import type { Zones } from './Zones';

/** Seconds between autosaves (a zone change also saves). */
const EVERY = 10;

/**
 * The solo game's save, in the browser (systems/save.ts has the format and the rules): what to gather from the running
 * scene, when to write it, and how to put a save back. Core engine. Only a solo game of a fixed or random world saves:
 * a live world's story is grown by its Dungeon Master and a co-op guest's hero belongs to the host, so those start fresh.
 * What a save does not hold (mobs, crops, ground items, the day's weather, a scenario's choices made) starts afresh.
 */
export class Persistence {
  private timer = EVERY;
  private lastZone = '';
  /** Off while a save is being put back, and after a new game was chosen (the page is about to reload). */
  private paused = true;

  constructor(
    private arena: Arena,
    private zones: Zones,
    private scenario: Scenario,
    /** The world's tag (`CampaignChoice.tag`); empty when this world is not saved. */
    private world: string,
  ) {
    // A tab that is closed or put away may never get another frame: save as it goes.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.save();
    });
    window.addEventListener('pagehide', () => this.save());
  }

  get enabled(): boolean {
    return this.world !== '' && this.arena.role === 'solo' && !this.arena.local.dm;
  }

  /** The state of the game now, as a save. */
  gather(): SaveData {
    const { arena } = this;
    const opened: Record<string, number[]> = {};
    for (const [name, m] of arena.memory) if (m.opened.length) opened[name] = m.opened;
    for (const [name, z] of arena.zones) {
      const list = z.remember().opened;
      if (list.length) opened[name] = list;
    }
    return {
      v: SAVE_VERSION,
      world: this.world,
      savedAt: Date.now(),
      hero: heroToSave(arena.hero),
      node: this.scenario.current,
      zone: arena.local.zone,
      x: arena.player.x,
      y: arena.player.y,
      opened,
    };
  }

  /** Save now (a no-op unless this game is saved). */
  save() {
    if (!this.paused && this.enabled) writeSave(this.gather());
  }

  /** Forget this world's save and stop writing, so the page can start over (the caller reloads). */
  forget() {
    this.paused = true;
    clearSave(this.world);
  }

  /** Is there a save to continue from? */
  get saved(): boolean {
    return this.world !== '' && loadSave(this.world) !== null;
  }

  /** Called every frame: saves every few seconds and whenever the local player has changed zones. */
  update(dt: number) {
    if (this.paused) return;
    this.timer -= dt;
    const zone = this.arena.local.zone;
    if (this.timer > 0 && zone === this.lastZone) return;
    this.timer = EVERY;
    this.lastZone = zone;
    this.save();
  }

  /**
   * Put the world's save back, if there is one: the hero, the chests opened, the scenario node and where the hero
   * stood. Saving starts after it either way. A save that cannot be put back (a zone the world no longer has) leaves
   * the hero at the start with what they carried.
   */
  async restore(): Promise<boolean> {
    const { arena, zones } = this;
    const save = this.enabled ? loadSave(this.world) : null;
    try {
      if (!save) return false;
      applyHeroSave(arena.hero, save.hero);
      arena.refreshLook();
      for (const [name, opened] of Object.entries(save.opened)) {
        const z = arena.zones.get(name);
        if (z) opened.forEach((i) => z.chests[i]?.setOpen(true));
        else arena.memory.set(name, { opened, crops: [], ground: [] });
      }
      try {
        if (save.node !== this.scenario.current) await this.scenario.load(save.node);
        if (save.zone !== arena.local.zone) {
          await zones.ensure(save.zone);
          const dest = arena.zones.get(save.zone);
          if (dest) zones.travel(arena.local, dest, dest.data.spawn);
        }
        arena.player.position.set(save.x, save.y);
      } catch (err) {
        console.warn('Could not return to the saved place; starting at the beginning', err);
        arena.player.position.set(...cellFeet(arena.home.data.spawn));
      }
      return true;
    } finally {
      this.paused = false;
      this.lastZone = arena.local.zone;
    }
  }
}
