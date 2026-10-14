import type { ContentManager } from '../../content/ContentManager';
import { WorldError, type LogEntry, type StoryOption, type World } from '../../content/world';
import { WORLD_CHUNK, type WorldMsg } from '../../net/protocol';
import type { Session } from '../../net/session';
import { zoneName } from '../../systems/places';
import type { Arena } from './Arena';
import type { Zones } from './Zones';

/** Seconds between the host's sends of a stretch of the log to its friends, when nothing new was added. */
const WORLD_RESEND = 0.4;

/** What the Story tab shows (hud/StoryTab.ts). */
export interface StoryView {
  /** The arc's title. */
  title: string;
  /** The areas the story has reached, in order. */
  placed: string[];
  /** How many areas the whole story runs through. */
  total: number;
  /** The next steps the Dungeon Master may choose (empty when the story is complete). */
  options: StoryOption[];
  complete: boolean;
  /** Why the last choice did not work, if it did not. */
  note: string;
}

/**
 * A live world (content/world.ts) in play: the Dungeon Master's choices grow it, and every page grows its own copy from
 * the same log. Solo the player chooses (they are their own Dungeon Master: how a story is tried out); online only the
 * host does, and sends its friends the log a few entries at a time, round and round (`WorldMsg`), so a friend who joined
 * late or lost a packet catches up. Each new entry: the World checks it, the content is reloaded (`ContentManager.reload`)
 * and the ports it binds open in the zones already loaded (`Zones.rewire`).
 */
export class Story {
  private sendTimer = 0;
  private cursor = 0;
  private seq = 0;
  private fresh = false; // a new entry the friends have not been sent yet
  private cached: { length: number; options: StoryOption[] } | null = null;
  private note = '';
  /** A friend's world disagreed with the host's log: it cannot follow (a different build or packs). */
  private astray = false;
  /** Mark a port that opened, in a zone (the scene draws it locally: every page opens its own). */
  onOpened: (zone: string, x: number, y: number) => void = () => {};
  /** The story reached a new land (its name): every page says so. */
  onGrew: (land: string) => void = () => {};

  constructor(
    private arena: Arena,
    private zones: Zones,
    private content: ContentManager,
    private session: Session,
    readonly world: World | null,
  ) {}

  get live(): boolean {
    return this.world !== null;
  }

  /** Can this page choose where the story goes? Solo (its own Dungeon Master) or the online host; a guest never. */
  get canChoose(): boolean {
    return this.live && this.arena.role !== 'client';
  }

  view(): StoryView | null {
    const { world } = this;
    const arc = world?.arc;
    if (!world || !arc) return null;
    return {
      title: arc.title,
      placed: world.storyRegions.map((id) => zoneName(world.cat.regions[id]?.biome.map ?? id)),
      total: arc.regions,
      options: this.options(),
      complete: world.complete,
      note: this.astray ? 'This page’s world no longer matches the host’s.' : this.note,
    };
  }

  /** The next steps (worked out once per change of the log: the solver looks ahead, which is not free). */
  private options(): StoryOption[] {
    const { world } = this;
    if (!world || !this.canChoose) return [];
    if (this.cached?.length !== world.log.length) this.cached = { length: world.log.length, options: world.options() };
    return this.cached.options;
  }

  /** The Dungeon Master chose the next step of the story. */
  choose(cue: string) {
    if (!this.world || !this.canChoose) return;
    try {
      this.add(this.world.choose(cue));
      this.note = '';
    } catch (err) {
      this.note = err instanceof Error ? err.message : String(err);
    }
  }

  /** Each frame: a friend takes what the host sent; the host sends. */
  update(dt: number) {
    if (!this.world) return;
    if (this.arena.role === 'client') for (const msg of this.session.takeWorld()) this.receive(msg);
    else if (this.arena.role === 'host') this.send(dt);
  }

  /** Apply an entry to this page's world, then bring the game up to it. */
  private add(e: LogEntry) {
    const { world } = this;
    if (!world) return;
    world.apply(e);
    this.content.reload(world.files());
    for (const o of this.zones.rewire()) this.onOpened(o.zone, o.x, o.y);
    this.fresh = true;
    if (e.t === 'step') this.onGrew(zoneName(world.cat.regions[e.region]?.biome.map ?? e.region));
  }

  /** A friend: take the entries of a stretch that follow on from what this page has, checking the ones it already has. */
  private receive(msg: WorldMsg) {
    const world = this.world!;
    if (this.astray || msg.from > world.log.length) return; // a later stretch: the round will come back to ours
    msg.entries.forEach((entry, i) => {
      const at = msg.from + i;
      if (this.astray) return;
      if (at < world.log.length) {
        if (JSON.stringify(world.log[at]) !== JSON.stringify(entry)) this.astray = true;
        return;
      }
      try {
        this.add(entry as LogEntry);
      } catch (err) {
        if (!(err instanceof WorldError)) throw err;
        this.astray = true;
        console.warn('The host’s world log does not fit this page’s world:', err.message);
      }
    });
  }

  /** The host: a stretch of the log to every friend, the newest entries first when there are new ones. */
  private send(dt: number) {
    const log = this.world!.log;
    this.sendTimer += dt;
    if (!log.length || !this.arena.remotes.size || (!this.fresh && this.sendTimer < WORLD_RESEND)) return;
    this.sendTimer = 0;
    let from: number;
    if (this.fresh) {
      from = Math.max(0, log.length - WORLD_CHUNK);
      this.fresh = false;
    } else {
      from = this.cursor < log.length ? this.cursor : 0;
      this.cursor = from + WORLD_CHUNK >= log.length ? 0 : from + WORLD_CHUNK;
    }
    const msg: WorldMsg = {
      k: 'world',
      n: ++this.seq,
      total: log.length,
      from,
      entries: log.slice(from, from + WORLD_CHUNK),
    };
    for (const slot of this.arena.remotes.keys()) this.session.sendTo(slot, msg);
  }
}
