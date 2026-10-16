import { enabled } from '../../systems/capabilities';
import { GuideArrow } from '../../entities/GuideArrow';
import type { Character } from '../../entities/Character';
import type { QuestSite } from '../../entities/QuestSite';
import type { AreaBanner } from '../../hud/AreaBanner';
import type { Dialog } from '../../hud/Dialog';
import type { MapOverlay } from '../../hud/MapOverlay';
import type { Menu } from '../../hud/Menu';
import { CELL } from '../../map/types';
import { briefing } from '../../systems/dmBrief';
import { RELIC_KIND } from '../../systems/dmQuests';
import { taskText, type TaskView } from '../../systems/dmTasks';
import { MOB_KINDS } from '../../systems/combat';
import { SEARCH_RADIUS, doorToward, guideFor, searchMiddle, type Guide } from '../../systems/guide';
import { ITEMS } from '../../systems/items';
import { zoneName } from '../../systems/places';
import {
  CHAPTERS,
  GIVERS,
  QUESTS,
  SITE_KINDS,
  currentQuest,
  giverMark,
  mobKey,
  questStatus,
  siteOpen,
  startsChapter,
} from '../../systems/quests';
import type { ZoneState } from '../ZoneState';
import type { Arena } from './Arena';
import type { Zones } from './Zones';

/**
 * What the local player is told and shown about their quests: the "!" and "?" over givers, the area banner, the story's
 * narration, chapter cards and the telling of the DM's quests, the quest arrow and the map's search area, and the relic
 * of a "find" quest. Local presentation only: it reads the local hero's quest log and the task every screen already has, so
 * nothing here goes over the wire (the host decides; a guest reads the same state).
 */
export class StoryUi {
  /** The quest arrow, over the world and under the door transition (the scene adds it to its root). */
  readonly arrow = new GuideArrow();
  private announced = ''; // the zone the banner last named
  /** What the story last looked like for the local hero, to notice when it moves: a task done in the field, a chapter begun, the end. */
  private story = { stage: -1, ready: false, chapter: -1 };
  private fieldNote: string[] | null = null; // narration waiting for the dialog to be free
  private titleCard: { title: string; sub: string } | null = null; // a chapter banner waiting its turn
  private taskSig = ''; // the DM's quest the local player was last told about
  private taskNote = ''; // and the instructions the DM last wrote for it
  private taskBrief: string[] | null = null; // the telling of it, waiting for the dialog to be free
  private visited = new Set<string>(); // zones the local player has been in (the banner says "new area" the first time)
  private marked = new WeakMap<Character, string>(); // the tag last put over each quest giver

  constructor(
    private arena: Arena,
    private ui: { dialog: Dialog; menu: Menu },
    private zones: Zones,
    private banner: AreaBanner,
    private overlay: MapOverlay,
    /** Is the DM holding a foe? Then nothing pops up. */
    private possessing: () => boolean,
  ) {}

  /** Every frame, for the zone the local player is in: markers, the banner, the telling, the arrow and the map's guide. */
  update(z: ZoneState, dt: number) {
    this.updateQuests(z, dt);
    this.announceArea();
    this.tellStory();
    this.tellTask();
    this.pointTheWay(z, dt);
  }

  /** The quest markers for the local player: "!" over the giver with a task to hand out, "?" when one can be handed in; sites show only while wanted. */
  private updateQuests(z: ZoneState, dt: number) {
    const hero = this.arena.hero;
    const story = this.arena.role === 'solo'; // online the party has only the Dungeon Master's quests
    for (const g of z.givers) {
      const mark = story ? giverMark(hero, g.giver) : ''; // "!" or "?" over whoever the current quest is about
      const text = mark ? `${mark} ${GIVERS[g.giver]?.tag ?? ''}` : (GIVERS[g.giver]?.tag ?? '');
      if (this.marked.get(g.body) === text) continue;
      this.marked.set(g.body, text);
      g.body.setTag(text, mark ? 0xffd34d : 0xffffff);
    }
    for (const s of z.sites) {
      s.setOpen((story && siteOpen(hero, s.kind, z.name, s.index)) || this.questWants(z.name, s));
      s.update(dt);
    }
    for (const g of z.givers) g.body.animate(dt * 1000, false);
  }

  /** The big area name in the top middle, when the local player arrives somewhere (once the door transition is over). */
  private announceArea() {
    const name = this.arena.zone.name;
    if (name === this.announced || this.zones.transition.busy) return;
    this.announced = name;
    if (this.possessing()) return; // no pop-ups while a foe is held
    const fresh = !this.visited.has(name);
    this.visited.add(name);
    this.banner.show(zoneName(name), fresh && !this.arena.zone.data.indoor ? 'New area discovered' : '');
  }

  /**
   * Tell the story at the right moments (from the local hero's quest log, so it is the same for solo, host and guest): the
   * narration when a task is finished out in the world, a title card when a chapter begins, and the end of part one. Each
   * waits until no dialog or menu is open, so it never talks over a conversation.
   */
  private tellStory() {
    const { dialog, menu } = this.ui;
    const hero = this.arena.hero;
    const log = hero.quests;
    const q = currentQuest(log);
    const ready = questStatus(hero) === 'ready';
    const s = this.story;
    if (s.stage === -1) {
      // The first look (or a guest's first word from the host): remember where things stand, announce nothing.
      this.story = { stage: log.stage, ready, chapter: q && log.taken ? q.chapter : -1 };
      return;
    }
    if (q && q.fieldNote.length && s.stage === log.stage && !s.ready && ready) this.fieldNote = q.fieldNote;
    if (q && log.taken && startsChapter(q) && s.chapter !== q.chapter) {
      s.chapter = q.chapter;
      this.titleCard = { title: CHAPTERS[q.chapter]?.title ?? '', sub: `Chapter ${q.chapter + 1}` };
    }
    if (s.stage < QUESTS.length && log.stage === QUESTS.length) {
      this.titleCard = { title: 'To be continued...', sub: 'End of part one' };
    }
    s.stage = log.stage;
    s.ready = ready;

    if (dialog.active || menu.open || this.zones.transition.busy) return;
    if (this.fieldNote) {
      dialog.note(this.fieldNote); // not asked for: passive text
      this.fieldNote = null;
    } else if (this.titleCard) {
      this.banner.show(this.titleCard.title, this.titleCard.sub);
      this.titleCard = null;
    }
  }

  /**
   * The Dungeon Master gave the party a quest (or wrote new instructions for it): tell it as a conversation, in pages, the
   * way a person who gives a quest would. Built here from the quest every screen already has, so nothing more is sent.
   */
  private tellTask() {
    const { dialog, menu } = this.ui;
    const t = this.arena.task;
    const active = !!t && t.state === 'active' && !this.arena.local.dm;
    const sig = active ? `${t.kind}|${t.zone}|${t.what}|${t.x},${t.y}|${t.title}` : '';
    const note = active ? (t.note ?? '') : '';
    if (sig !== this.taskSig) {
      this.taskSig = sig;
      this.taskNote = note;
      this.taskBrief = active ? this.briefOf(t) : null;
    } else if (note !== this.taskNote) {
      this.taskNote = note;
      if (note) this.taskBrief = [note];
    }
    if (!this.taskBrief || dialog.active || menu.open || this.zones.transition.busy) return;
    dialog.note(this.taskBrief); // the DM gave it unasked: passive text
    this.taskBrief = null;
  }

  /** The pages that tell a DM quest: the DM's own words when they wrote some, else the usual telling. */
  briefOf(t: TaskView): string[] {
    if (t.note) return [t.note];
    return briefing(t, {
      foe: (key) => MOB_KINDS[key]?.name ?? key,
      site: (kind) => SITE_KINDS[kind]?.name ?? kind,
      item: (id) => (ITEMS[id] ? `the ${ITEMS[id].name}` : id),
      area: (zone) => zoneName(zone),
    });
  }

  /** The task the DM called, as the tracker line ('' when there is none). */
  taskLine(): string {
    return this.arena.task ? taskText(this.arena.task) : '';
  }

  /** The quest arrow: points from the hero at where the quest leads (a thing in this zone, or the door towards it). */
  private pointTheWay(z: ZoneState, dt: number) {
    const { player } = this.arena;
    const hide = this.zones.transition.busy || !player.visible || !enabled('guide', z.name) || this.arena.local.dm; // the DM has no quest
    const world = {
      zone: z.name,
      doors: z.data.doors,
      sites: z.sites.map((s) => ({ kind: s.kind, index: s.index, x: s.x, y: s.y })),
      mobs: z.mobs.flatMap((m) => {
        const key = m.alive ? mobKey(m.kind) : undefined;
        return key ? [{ key, x: m.body.x, y: m.body.y }] : [];
      }),
      givers: z.givers.map((g) => ({ id: g.giver, x: g.body.x, y: g.body.y })),
      places: z.data.places.map((p) => ({ name: p.name, x: (p.col + 0.5) * CELL, y: (p.row + 0.5) * CELL })),
    };
    // The story's quest arrow is solo only: online the Dungeon Master's quest is the only one the party has.
    const guide = hide || this.arena.role !== 'solo' ? null : guideFor(this.arena.hero, world, player);
    const { camera } = z;
    const at = (x: number, y: number) => ({ x: z.world.x + x * camera.zoom, y: z.world.y + y * camera.zoom });
    // A person or a door gets the arrow; something to be found is only an area on the map (M).
    const known = guide && guide.radius === undefined ? guide : null;
    // The DM's quest: a search area on the map (the party works out the rest), and an arrow only once the DM points the way.
    const task = this.arena.task;
    const open = !!task && task.state === 'active' && task.zone === z.name;
    const calling =
      open && task.hint && !this.arena.local.dm && !this.zones.transition.busy
        ? { x: task.x, y: task.y, label: 'The way' }
        : null;
    // A quest set in another land (a saga's next step): the arrow leads to the door that goes that way.
    const toward =
      task && task.state === 'active' && task.zone !== z.name && !this.arena.local.dm && !this.zones.transition.busy
        ? doorToward(z.data.doors, player, z.name, task.zone)
        : null;
    const target = calling ?? toward ?? known;
    this.arrow.update(dt, at(player.x, player.y - 20), target && at(target.x, target.y - 12), target?.label ?? '');
    const questGuide: Guide | null = open
      ? task.hint
        ? { x: task.x, y: task.y, label: task.title }
        : { ...searchMiddle(task.x, task.y), label: task.title, radius: SEARCH_RADIUS }
      : null;
    this.overlay.setGuide(questGuide ?? guide);
  }

  /** Does the DM's quest want this site (a plant or stone to gather that is not yet touched, or the hidden relic)? */
  questWants(zone: string, site: QuestSite): boolean {
    const t = this.arena.task;
    if (!t || t.state !== 'active' || t.zone !== zone) return false;
    if (t.kind === 'find') return site.kind === RELIC_KIND;
    return t.kind === 'gather' && site.kind === t.what && !(t.bits & (1 << site.index));
  }

  /** The relic of a "find" quest is a site that appears where the DM hid it (on every page) and goes when it is found. */
  syncRelic() {
    const t = this.arena.task;
    const want = t && t.state === 'active' && t.kind === 'find' ? t : null;
    for (const z of this.arena.zones.values()) {
      const have = z.sites.find((x) => x.kind === RELIC_KIND);
      if (want && z.name === want.zone && !have)
        z.addSite({ kind: RELIC_KIND, col: Math.floor(want.x / CELL), row: Math.floor(want.y / CELL) });
      else if (have && !(want && z.name === want.zone)) z.removeSite(have);
    }
  }
}
