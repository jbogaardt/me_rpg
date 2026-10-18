import { contextKey, keyMeaning } from '../../core/contextKey';
import { directionToward } from '../../core/direction';
import type { Character } from '../../entities/Character';
import type { Chest } from '../../entities/Chest';
import type { Crop } from '../../entities/Crop';
import type { Command, Player } from '../../entities/Player';
import type { QuestSite } from '../../entities/QuestSite';
import type { Dialog } from '../../hud/Dialog';
import { DRINK_KEY, HarvestButtons, type HarvestSpot } from '../../hud/HarvestButtons';
import { InteractMarks } from '../../hud/InteractMarks';
import { MAX_MARKS, nearestInReach, newThing, pickMarks, type MarkKind, type Thing } from '../../hud/interactThings';
import type { ShopCounter } from '../../hud/ShopCounter';
import { CELL } from '../../map/types';
import { enabled } from '../../systems/capabilities';
import { CHEST_LOOTS, collect } from '../../systems/chests';
import { harvest, waterWith } from '../../systems/crops';
import { lecternIn, lecternPages } from '../../systems/lectern';
import { drinkableNear, thirsty } from '../../systems/needs';
import { petSound } from '../../systems/pets';
import { progressOf, recordSite, siteNote, siteOpen } from '../../systems/quests';
import { BARREL_REACH } from '../../systems/barrels';
import { SHOPS } from '../../systems/shops';
import { signLines, signNear } from '../../systems/signs';
import { TRAINER, trainerTalk, type Skill } from '../../systems/skills';
import type { ZoneState } from '../ZoneState';
import type { Arena } from './Arena';
import { CHEST_REACH, CROP_REACH, KEEPER_REACH, PICKUP_REACH, SIGN_REACH, SITE_REACH } from './constants';
import type { Ground } from './Ground';
import type { Barrels } from './Barrels';
import type { DmTasks } from './DmTasks';
import type { PackSync } from './PackSync';
import { canDrink, foeNear, type Simulation } from './Simulation';
import type { StoryUi } from './StoryUi';
import type { Training } from './Training';

const NPC_LINES = [
  'Greetings, traveler. Something is wrong with the Vale: the clocks stopped, and the dead walk.',
  'Follow the road south to Lanternrest. Warden Maren keeps its lamp lit, and she has been waiting for a stranger like you.',
];

/** A foe this close (px) makes the action key a sword: no talk starts, and holding it swings on. */
const FIGHT_RANGE = CELL * 10;
/** A guest's held button repeats an `act` press this often, well inside the host's buffer window (inputBuffer.ts). */
const GUEST_REPEAT_S = 0.05;

/**
 * What the keys do at this keyboard, and the buttons beside them. SPLIT keys (the default, `core/contextKey.ts`): the attack
 * key only swings (`swing`), the interact key only reads, talks, opens, picks up, harvests and drinks (`chain(false)`, then `useAt`
 * on the real world); both advance an open dialog. CONTEXTUAL (a setting): the one key does what it used to (`chain(true)`:
 * a foe near makes it a sword, else talk, open, pick up, otherwise attack). Solo and the host act on the real world (`act`
 * for the contextual key, `swingAt` and `useAt` for the split ones, also for a friend's press, `hostedPress`); a guest only
 * reads and talks locally and sends its press to the host with its intent (`guestPress`).
 */
export class Interactions {
  private harvestButtons = new HarvestButtons();
  private marks = new InteractMarks(); // the glints in the world and the touch button's glyph
  private things: Thing[] = []; // what the hero could use now (a reused pool: nothing allocated per frame)
  private picked: Thing[] = Array.from({ length: MAX_MARKS }, newThing);
  private guestDrinking = false; // guest: asked the host to let it drink (see `drinking`)

  constructor(
    private arena: Arena,
    private ui: { dialog: Dialog; shop: ShopCounter },
    private sim: Simulation,
    private pack: PackSync,
    private training: Training,
    private tasks: DmTasks,
    private barrels: Barrels,
    private ground: Ground,
    private storyUi: StoryUi,
    /** A guest sends an action press to the host: `act` (attack, or the contextual key) or `use` (interact, split keys). */
    private guestPress: (intent: 'act' | 'use') => void,
    /** What the Dungeon Master wrote on the sign at a cell of a zone (a live world's log), if they did. */
    private signWritten: (zone: string, col: number, row: number) => readonly string[] | undefined = () => undefined,
  ) {
    this.harvestButtons.onPick = (key) => this.harvestPressed(key);
  }

  /** A party member talked to a person of the world (their entity id): the DM's saga may be waiting for it. */
  onTalk: (entity: string) => void = () => {};

  /** The kinds of quest site whose note has been shown (once each). */
  private siteTold = new Set<string>();

  /** Is a foe within `FIGHT_RANGE` of the local hero? Then the contextual key only attacks (and holding it keeps swinging). */
  fighting(): boolean {
    const { player } = this.arena;
    return this.arena.mobs.some((m) => m.alive && Math.hypot(player.x - m.body.x, player.y - m.body.y) < FIGHT_RANGE);
  }

  /**
   * Holding the action button (the host's or solo hero): in a fight it refreshes the sword's input buffer every tick, so
   * the swings chain at the weapon's own rate (systems/inputBuffer.ts). Away from a foe it does nothing, so a held key
   * never repeats a talk, an open or a pickup. A dialog or menu forgets what was pending.
   */
  holdAttack(held: boolean | undefined, reading: boolean) {
    const p = this.arena.local;
    if (!held) this.holdBlocked = false;
    if (reading || p.dm || p.down !== null) {
      this.holdBlocked = !!held; // a press that began in a menu or dialog never turns into swings when it closes
      return p.attackBuffer.clear();
    }
    if (held && !this.holdBlocked && this.holds() && !this.ui.dialog.active) p.attackBuffer.press(p.zone);
  }

  /** The attack key held by a dialog line (it advanced one) must not swing when the box closes: blocked until released. */
  private holdBlocked = false;

  /** Does holding the attack key keep swinging here? Always with split keys; only in a fight with the contextual key. */
  private holds(): boolean {
    return !contextKey.on || this.fighting();
  }

  /**
   * A guest holding the action button in a fight: true each `GUEST_REPEAT_S` (the caller sends an `act` press then, so
   * the host's buffer stays fresh and its swings chain). The guest does not know the cooldown; the host decides.
   */
  guestHold(held: boolean | undefined, dt: number): boolean {
    if (!held || this.holdBlocked || !this.holds() || this.ui.dialog.active) {
      this.holdTimer = 0;
      return false;
    }
    this.holdTimer -= dt;
    if (this.holdTimer > 0) return false;
    this.holdTimer = GUEST_REPEAT_S;
    return true;
  }

  private holdTimer = 0;

  /** A guest's per-frame upkeep: its own idea of drinking, and a held action button repeating `press` in a fight. */
  trackGuest(cmd: Command, reading: boolean, dt: number, press: () => void) {
    this.trackGuestDrink(cmd);
    if (this.guestHold(cmd.held && !cmd.act && !reading, dt)) press();
  }

  /**
   * The local player's presses (the scene calls this unless a menu or shop is up). Either key advances an open dialog.
   * Split keys: attack swings, interact uses. Contextual: the one key decides by what is near (`chain`).
   */
  handleAction(cmd: Pick<Command, 'act' | 'use'>) {
    if (!cmd.act && !cmd.use) return;
    if (this.ui.dialog.active) {
      this.holdBlocked = true; // the key that turned the page is not a swing
      return this.ui.dialog.advance();
    }
    if (contextKey.on) {
      if (cmd.act) this.chain(true);
      return;
    }
    if (cmd.act && keyMeaning(false, 'attack', { foe: false, thing: false }) === 'swing') this.swing();
    if (cmd.use) this.chain(false);
  }

  /** Split keys, the attack key: swing, cast or shoot, nothing else (the host decides which; a guest asks it). */
  private swing() {
    if (this.arena.local.dm) return;
    if (this.arena.role === 'client') this.guestPress('act');
    else this.swingAt(this.arena.local);
  }

  /** An interact or contextual press that reaches the world: the host acts at once, a guest asks (`use` or `act`). */
  private pressWorld(contextual: boolean) {
    if (this.arena.role === 'client') this.guestPress(contextual ? 'act' : 'use');
    else if (contextual) this.act(this.arena.local);
    else this.useOnly(this.arena.local);
  }

  /**
   * What a press does by what is near: read or talk to what the hero stands beside, else the world (`pressWorld`). With
   * `contextual` (the single key) a foe within `FIGHT_RANGE` or nothing near makes it a swing (`keyMeaning`); the interact
   * key (not contextual) never swings.
   */
  private chain(contextual: boolean) {
    const { dialog } = this.ui;
    const { arena } = this;
    const near = (body: { x: number; y: number }, reach = CELL * 1.5) =>
      Math.hypot(this.arena.player.x - body.x, this.arena.player.y - body.y) < reach;
    const stand = lecternIn(arena.zone.name);
    const lectern = stand && near({ x: stand.x, y: stand.y - CELL / 2 }, CELL * 1.5);
    const sign = signNear(arena.zone.data.signs, this.arena.player.x, this.arena.player.y, SIGN_REACH);
    const keeper = arena.keepers.find((k) => near(k.body, KEEPER_REACH));
    const npc = arena.npc;
    const giver = arena.givers.find((g) => near(g.body, KEEPER_REACH));
    const site = arena.sites.find((s) => s.visible && near(s, SITE_REACH));
    const pet = arena.pets.find((p) => near(p));
    const folk = arena.zone.folk.find((f) => near(f.body));
    const npcNear = !!npc?.visible && near(npc);
    const thing = !!(lectern || sign || keeper || giver || site || pet || folk || npcNear);
    // With a foe about, the single key only swings: nobody starts a talk (or freezes the world to read) in a fight.
    const what = keyMeaning(contextual, contextual ? 'attack' : 'interact', {
      foe: this.fighting() && !arena.local.dm,
      thing,
    });
    if (what === 'swing') {
      this.pressWorld(true); // the contextual key's weapon swing (a guest's host re-checks what is near)
    } else if (arena.local.dm && !lectern && !sign) {
      // The Dungeon Master reads the world (signs, the lectern) but takes no part in it: no shops, quests or swings.
    } else if (lectern) {
      dialog.say(lecternPages());
    } else if (sign) {
      // Read like talking to an NPC: close enough is enough, and the hero turns to face the board.
      this.arena.player.face(
        directionToward((sign.col + 0.5) * CELL - this.arena.player.x, (sign.row + 0.5) * CELL - this.arena.player.y),
      );
      dialog.say(signLines(sign.ways, arena.zone.data, this.signWritten(arena.zone.name, sign.col, sign.row)));
    } else if (keeper) {
      this.talkToKeeper(keeper);
    } else if (giver) {
      giver.body.face(directionToward(this.arena.player.x - giver.body.x, this.arena.player.y - giver.body.y));
      if (giver.giver === TRAINER) this.talkToTrainer();
      else this.pack.talkToGiver(giver.giver);
    } else if (site) {
      // Touching a site the quest wants: read what it says, and let the action count it (the host decides, for a guest).
      if (!this.siteTold.has(site.kind)) {
        this.siteTold.add(site.kind); // once per kind, as passive text: not a popup for every one picked up
        dialog.note(siteNote(site.kind, progressOf(this.arena.hero)));
      }
      this.pressWorld(contextual);
    } else if (pet) {
      pet.attend(this.arena.player.x, this.arena.player.y);
      dialog.say([petSound(pet.kind, pet.talks++)]);
    } else if (folk) {
      arena.zone.attend(folk, this.arena.player.x, this.arena.player.y); // stops, faces the hero, later goes home
      dialog.say(folk.lines, undefined, { pauses: true });
      // The host settles it for a friend: their press reaches `act`, which counts the talk as it does for the host's own.
      if (arena.role === 'client') this.guestPress(contextual ? 'act' : 'use');
      else this.onTalk(folk.entity);
    } else if (npc && npcNear) {
      npc.face(directionToward(this.arena.player.x - npc.x, this.arena.player.y - npc.y));
      dialog.say(NPC_LINES, undefined, { pauses: true });
    } else {
      this.pressWorld(contextual);
    }
  }

  /**
   * The training wizard tells the player what they know and what is next; when a trial follows, it begins once the last line
   * is dismissed (solo and the host send the player there; a guest asks the host).
   */
  private talkToTrainer() {
    const { lines, trial } = trainerTalk(this.arena.hero);
    this.ui.dialog.say(lines, trial ? () => this.beginTrial(trial) : undefined, { pauses: true });
  }

  private beginTrial(skill: Skill) {
    const { arena } = this;
    if (arena.role === 'client') {
      this.pack.askTrial(TRAINER);
      return;
    }
    const refused = this.training.start(arena.local, skill);
    if (refused) this.ui.dialog.say([refused]);
  }

  /** A shopkeeper greets the player, then the counter opens (for a guest the host settles each trade). */
  private talkToKeeper({ shop: id, body }: { shop: string; body: Character }) {
    const shop = SHOPS[id];
    if (!shop) return;
    body.face(directionToward(this.arena.player.x - body.x, this.arena.player.y - body.y));
    this.ui.dialog.say(shop.greeting, () => this.ui.shop.show(shop, this.arena.hero));
  }

  /** The contextual key at the world (host and solo, also a friend's `act` from an old or contextual page): use what is near, otherwise attack. */
  act(p: Player) {
    if (p.dm) return; // the Dungeon Master opens, picks and strikes nothing
    if (!this.useAt(p)) this.sim.attack(p);
  }

  /** Split keys, the attack key (host and solo, and a friend's `act` from a split page): swing, cast or shoot. Never opens or picks up. */
  swingAt(p: Player) {
    if (p.dm) return;
    if (p.drinking) this.sim.stopDrinking(p); // one cannot drink and swing: the swing wins
    this.sim.attack(p);
  }

  /** Split keys, the interact key (host and solo, and a friend's `use`): everything `act` does that is not a swing. */
  useOnly(p: Player) {
    if (p.dm) return;
    this.useAt(p);
  }

  /** A friend's presses this tick (host): the intent each carries decides what the host runs (`Command.split`, `Command.use`). */
  hostedPress(p: Player, cmd: Command) {
    if (p.down !== null) return;
    this.arena.inZone(this.arena.zoneOf(p), () => {
      if (cmd.act) {
        if (cmd.split) this.swingAt(p);
        else this.act(p);
      }
      if (cmd.use) this.useOnly(p);
    });
  }

  /**
   * Use what `p` stands beside, in this order: set down a carried barrel, open a chest within reach, pick or water a crop,
   * touch a quest site, pick up a barrel, drink, talk to a person, pick up an item from the ground. True if something was
   * done (so a contextual press does not also swing).
   */
  private useAt(p: Player): boolean {
    if (this.barrels.setDown(p)) return true; // carrying a barrel: the key sets it down
    const chest = this.arena.chests.find(
      (c) => !c.opened && Math.hypot(p.body.x - c.x, p.body.y - (c.y - CELL / 2)) < CHEST_REACH,
    );
    if (chest) {
      this.openChest(p, chest);
      return true;
    }
    const farming = enabled('farming', this.arena.zone.name); // without it, crop plots are scenery
    const crop = farming && this.arena.crops.find((c) => c.ripe && this.inReach(p, c));
    if (crop) {
      this.pickCrop(p, crop);
      return true;
    }
    const dry =
      farming &&
      this.arena.crops.find((c) => c.thirsty && Math.hypot(p.body.x - c.x, p.body.y - (c.y - CELL / 2)) < CROP_REACH);
    if (dry) {
      this.waterCrop(p, dry);
      return true;
    }
    const site = this.arena.sites.find((s) => this.siteWanted(p, s));
    if (site) {
      this.touchSite(p, site);
      return true;
    }
    if (this.barrels.pickUp(p)) return true;
    if (this.sim.pondAction(p)) return true; // by a pond: drinks (or stops drinking)
    const folk = this.arena.zone.folk.find((f) => Math.hypot(p.body.x - f.body.x, p.body.y - f.body.y) < CELL * 1.5);
    if (folk) {
      this.arena.zone.attend(folk, p.body.x, p.body.y);
      this.onTalk(folk.entity);
      return true; // a friend talking to a person: no swing
    }
    const loose = this.ground.nearest(p);
    if (!loose) return false;
    this.ground.pickUp(p, loose);
    return true;
  }

  /** Is `s` a quest site `p` touches now (within reach, and open to them, or wanted by the DM's quest)? */
  private siteWanted(p: Player, s: QuestSite): boolean {
    return Math.hypot(p.body.x - s.x, p.body.y - s.y) < SITE_REACH && this.siteOpenTo(p, s);
  }

  private siteOpenTo(p: Player, s: QuestSite): boolean {
    return (
      (this.arena.role === 'solo' && siteOpen(p.hero, s.kind, this.arena.zone.name, s.index)) ||
      this.storyUi.questWants(this.arena.zone.name, s)
    );
  }

  /** A player touches a quest site that their quest wants: it counts once for them, and the world sees the sparkle. */
  private touchSite(p: Player, site: QuestSite) {
    if (this.storyUi.questWants(this.arena.zone.name, site) && this.tasks.touchSite(p, site.kind, site.index)) {
      this.sim.fx('levelUp', site.x, site.y - 6); // the DM's quest counts it for the whole party
      return;
    }
    const progress = recordSite(p.hero, site.kind, this.arena.zone.name, site.index);
    if (!progress) return;
    this.sim.fx('levelUp', site.x, site.y - 6);
    this.sim.questNote(p, progress);
  }

  /**
   * The Harvest button of every ripe plot the local player can reach, drawn by the plant, and a Drink button at the edge
   * of a pond the player stands beside while they are thirsty and it is not empty (none while a menu or door is up).
   */
  updateHarvestButtons(z: ZoneState, hidden: boolean) {
    const { arena } = this;
    if (hidden) return this.harvestButtons.clear();
    const { world } = arena.view;
    const scale = world.scale.x;
    const spots: HarvestSpot[] = z.crops.flatMap((c, key) =>
      c.ripe && enabled('farming', z.name) && this.inReach(arena.local, c)
        ? [{ key, x: world.x + c.x * scale, y: world.y + (c.y - CELL * 1.6) * scale }]
        : [],
    );
    const drinking = this.drinking();
    // An empty pond has nothing to give: no button (a guest knows the levels from the host's snapshot).
    const water =
      (drinking || canDrink(z, arena.local)) && drinkableNear(z.data, this.arena.player.x, this.arena.player.y);
    if (water) {
      const label = drinking ? 'Stop' : 'Drink';
      spots.push({ key: DRINK_KEY, label, x: world.x + water.x * scale, y: world.y + water.y * scale });
    }
    this.harvestButtons.update(spots);
  }

  private inReach(p: Player, crop: Crop) {
    return Math.hypot(p.body.x - crop.x, p.body.y - (crop.y - CELL / 2)) < CROP_REACH;
  }

  /** The player pressed a plot's Harvest button: pick it here, or, as a guest, ask the host (an action press picks the plot beside them). */
  private harvestPressed(key: number) {
    if (key === DRINK_KEY) return this.drinkPressed();
    const crop = this.arena.crops[key];
    if (!crop?.ripe || !this.inReach(this.arena.local, crop)) return;
    if (this.arena.role === 'client') this.guestPress(contextKey.on ? 'act' : 'use');
    else this.pickCrop(this.arena.local, crop);
  }

  /**
   * Is the local player drinking? Solo and the host know; a guest only knows it asked, and assumes it stopped once it
   * walks, is full, or asks to stop (the host stops it for the same reasons).
   */
  private drinking(): boolean {
    const { arena } = this;
    if (arena.role !== 'client') return arena.local.drinking !== null;
    if (!thirsty(this.arena.hero.needs)) this.guestDrinking = false;
    return this.guestDrinking;
  }

  /** The player pressed Drink (or Stop) by a pond: start or stop here, or, as a guest, ask the host (who keeps the meters). */
  private drinkPressed() {
    const { arena } = this;
    const on = !this.drinking();
    if (on && !drinkableNear(arena.zone.data, this.arena.player.x, this.arena.player.y)) return;
    if (arena.role === 'client') {
      this.guestDrinking = on;
      this.pack.askDrink(on);
    } else if (on) this.sim.startDrinking(arena.local);
    else this.sim.stopDrinking(arena.local);
  }

  /** A player picks a ripe crop plot: the produce goes to their pack and the plot starts again as a sprout. */
  private pickCrop(p: Player, crop: Crop) {
    const { sim } = this;
    const got = harvest(p.hero, crop.kind);
    const [x, y] = [crop.x, crop.y - CELL];
    if (!got.ok) {
      sim.refuse(p, x, y + 6, 'packFull');
      return;
    }
    crop.pick();
    sim.fx('levelUp', x, y + 6);
    sim.fx('itemMote', x, y + 6, undefined, p.slot); // the produce's light flies to the hero; the toast names it
    this.ground.onPicked?.(p, got.text);
  }

  /** A player waters a dry plot with a Waterskin from their pack. */
  private waterCrop(p: Player, crop: Crop) {
    const { sim } = this;
    const [x, y] = [crop.x, crop.y - CELL];
    const result = waterWith(p.hero);
    if (!result.ok) {
      sim.refuse(p, x, y + 6, 'nothingToDo', result.text); // what is missing is not on screen: one passive line
      return;
    }
    crop.water();
    sim.fx('levelUp', x, y + 6);
  }

  private openChest(p: Player, chest: Chest) {
    const { sim, arena } = this;
    const loot = CHEST_LOOTS[chest.loot];
    if (!loot) return;
    const found = collect(p.hero, loot);
    const [x, y] = [chest.x, chest.y - CELL];
    if (found.refused) {
      sim.refuse(p, x, y + 6, 'packFull');
      return;
    }
    chest.setOpen(true);
    sim.fx('sparkle', x, y + 6);
    sim.fx('coinPop', x, y + 10);
    if (found.gear) sim.fx('lootBeam', x, y + 14); // a piece of gear: a column of light as it comes out
    if ('item' in loot)
      this.ground.onPicked?.(p, loot.item.name); // gear and goods: the pickup toast names it
    else if ('hp' in loot)
      sim.fx('heal', p.body.x, p.body.y - 10); // a restoring chest: the hero's own glow
    else sim.fx('gainMotes', x, y + 10, undefined, p.slot); // gold or XP flies to the hero
    if (found.gear) arena.refreshLook(p);
    if (found.levels) {
      sim.fx('levelRing', p.body.x, p.body.y - 4, undefined, p.slot);
      sim.fx('levelUp', p.body.x, p.body.y - 14);
    }
  }

  /**
   * A guest's own idea of whether it is drinking, kept in step with what the host will do with the same press: walking
   * stops the drink, an enemy near turns A into an attack, otherwise A by a pond starts or stops it.
   */
  trackGuestDrink(cmd: Command) {
    const { arena } = this;
    const drinkToggle = () => {
      if (this.guestDrinking || canDrink(arena.zone, arena.local)) this.guestDrinking = !this.guestDrinking;
    };
    if (cmd.dx || cmd.dy) this.guestDrinking = false;
    else if (contextKey.on) {
      if (cmd.act && foeNear(arena.zone, arena.local)) this.guestDrinking = false;
      else if (cmd.act) drinkToggle();
    } else if (cmd.act) {
      this.guestDrinking = false; // a swing ends the drink (the host: `swingAt`)
    } else if (cmd.use) {
      if (foeNear(arena.zone, arena.local)) this.guestDrinking = false;
      else drinkToggle();
    }
  }

  /**
   * Fill `things` with what the interact key would act on near the local hero (the same reaches `useAt` and `chain` use):
   * chests, people (keepers, quest givers, folk, pets, the guide), signs and the lectern, quest sites, ripe or dry plots,
   * loose barrels, items on the ground, a pond to drink, a barrel in hand. Returns how many.
   */
  private collectThings(): number {
    const { arena } = this;
    const me = arena.local;
    const { x, y } = me.body;
    let n = 0;
    const put = (tx: number, ty: number, kind: MarkKind, reach: number, dist: number, mark = true) => {
      const t = (this.things[n] ??= newThing());
      t.x = tx;
      t.y = ty;
      t.kind = kind;
      t.reach = reach;
      t.dist = dist;
      t.mark = mark;
      n++;
    };
    const person = (b: { x: number; y: number }, reach = CELL * 1.5) =>
      put(b.x, b.y - CELL * 1.6, 'talk', reach, Math.hypot(x - b.x, y - b.y));
    for (const c of arena.chests) {
      if (!c.opened) put(c.x, c.y - CELL * 1.3, 'chest', CHEST_REACH, Math.hypot(x - c.x, y - (c.y - CELL / 2)));
    }
    for (const k of arena.keepers) person(k.body, KEEPER_REACH);
    for (const g of arena.givers) person(g.body, KEEPER_REACH);
    for (const f of arena.zone.folk) person(f.body);
    for (const p of arena.pets) put(p.x, p.y - CELL, 'talk', CELL * 1.5, Math.hypot(x - p.x, y - p.y));
    if (arena.npc?.visible) person(arena.npc);
    const stand = lecternIn(arena.zone.name);
    if (stand)
      put(stand.x, stand.y - CELL * 1.2, 'talk', CELL * 1.5, Math.hypot(x - stand.x, y - (stand.y - CELL / 2)));
    const sign = signNear(arena.zone.data.signs, x, y, SIGN_REACH + CELL * 2);
    if (sign) {
      const [sx, sy] = [(sign.col + 0.5) * CELL, (sign.row + 0.5) * CELL];
      put(sx, sy - CELL, 'talk', SIGN_REACH, Math.hypot(x - sx, y - sy));
    }
    for (const s of arena.sites) {
      if (s.visible && this.siteOpenTo(me, s)) put(s.x, s.y - 14, 'hand', SITE_REACH, Math.hypot(x - s.x, y - s.y));
    }
    if (enabled('farming', arena.zone.name)) {
      for (const c of arena.crops) {
        if (c.ripe || c.thirsty)
          put(c.x, c.y - CELL, 'hand', CROP_REACH, Math.hypot(x - c.x, y - (c.y - CELL / 2)), false);
      }
    }
    if (enabled('carrying', arena.zone.name)) {
      const carrying = arena.barrels.some((b) => b.carrier === me.slot);
      if (carrying)
        put(x, y, 'hand', 1, 0, false); // the key sets it down
      else
        for (const b of arena.barrels)
          if (!b.carried) put(b.x, b.y - CELL, 'hand', BARREL_REACH, Math.hypot(x - b.x, y - b.y));
    }
    for (const g of arena.ground) put(g.x, g.y - 14, 'hand', PICKUP_REACH, Math.hypot(x - g.x, y - g.y));
    const water = this.drinking() || canDrink(arena.zone, me);
    if (water && drinkableNear(arena.zone.data, x, y)) put(x, y, 'hand', 1, 0, false);
    return n;
  }

  /**
   * Each frame, from the scene: glint over what the interact key could use and show or hide the touch interact button with
   * the glyph of the nearest thing in reach. `hidden` (a menu, a dialog, a door, the Dungeon Master's view) clears both. Split
   * keys only show the button (the contextual key has none).
   */
  updateMarks(hidden: boolean, seconds: number) {
    const { arena } = this;
    const { world } = arena.view;
    const out = { x: world.x, y: world.y, scale: world.scale.x };
    if (hidden || arena.local.dm || arena.local.down !== null)
      return this.marks.update(this.picked, 0, out, null, seconds);
    const count = this.collectThings();
    const shown = pickMarks(this.things, count, this.picked);
    this.marks.update(this.picked, shown, out, contextKey.on ? null : nearestInReach(this.things, count), seconds);
  }

  /** Forget the Harvest and Drink buttons (the scene is being left). */
  clear() {
    this.harvestButtons.clear();
    this.marks.update(this.picked, 0, { x: 0, y: 0, scale: 1 }, null, 0);
  }
}
