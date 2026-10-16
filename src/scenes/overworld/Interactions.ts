import { directionToward } from '../../core/direction';
import type { Character } from '../../entities/Character';
import type { Chest } from '../../entities/Chest';
import type { Crop } from '../../entities/Crop';
import type { Command, Player } from '../../entities/Player';
import type { QuestSite } from '../../entities/QuestSite';
import type { Dialog } from '../../hud/Dialog';
import { DRINK_KEY, HarvestButtons, type HarvestSpot } from '../../hud/HarvestButtons';
import type { ShopCounter } from '../../hud/ShopCounter';
import { CELL } from '../../map/types';
import { enabled } from '../../systems/capabilities';
import { CHEST_LOOTS, collect } from '../../systems/chests';
import { harvest, waterWith } from '../../systems/crops';
import { lecternIn, lecternPages } from '../../systems/lectern';
import { drinkableNear, thirsty } from '../../systems/needs';
import { petSound } from '../../systems/pets';
import { progressOf, recordSite, siteNote, siteOpen } from '../../systems/quests';
import { SHOPS } from '../../systems/shops';
import { signLines, signNear } from '../../systems/signs';
import { TRAINER, trainerTalk, type Skill } from '../../systems/skills';
import type { ZoneState } from '../ZoneState';
import type { Arena } from './Arena';
import { CHEST_REACH, CROP_REACH, KEEPER_REACH, SIGN_REACH, SITE_REACH } from './constants';
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

/**
 * What the action key does at this keyboard, and the buttons beside it: advance a dialog, read a sign or the lectern,
 * talk (keepers, quest givers, the trainer, pets, folk), open a chest, water or pick a crop, touch a quest site, set down or
 * pick up a barrel or an item, drink, otherwise attack. Solo and the host act on the real world (`act`, also for a friend's
 * press); a guest only reads and talks locally and sends its press to the host (`guestPress`).
 */
export class Interactions {
  private harvestButtons = new HarvestButtons();
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
    /** A guest sends an action press to the host. */
    private guestPress: () => void,
  ) {
    this.harvestButtons.onPick = (key) => this.harvestPressed(key);
  }

  /** A friend spoke to the Dungeon Master in person: open the way to put a concern to them (set by the scene). */
  onTalkToDm: () => void = () => undefined;

  /** The local player's action button: advance the dialog, talk when next to the NPC or a shopkeeper, otherwise `attack`. */
  handleAction(pressed: boolean, attack: () => void) {
    if (!pressed) return;
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
    const dm = arena.local.dm ? undefined : [...arena.remotes.values()].find((p) => p.dm && near(p.body));
    if (dialog.active) {
      dialog.advance();
    } else if (arena.local.dm && !lectern && !sign) {
      // The Dungeon Master reads the world (signs, the lectern) but takes no part in it: no shops, quests or swings.
    } else if (dm) {
      // The Dungeon Master is talked to like anyone: a greeting, then the concerns go to their inbox.
      dm.body.face(directionToward(this.arena.player.x - dm.body.x, this.arena.player.y - dm.body.y));
      dialog.say(['Speak, traveller. What troubles you?'], () => this.onTalkToDm());
    } else if (lectern) {
      dialog.say(lecternPages());
    } else if (sign) {
      // Read like talking to an NPC: close enough is enough, and the hero turns to face the board.
      this.arena.player.face(
        directionToward((sign.col + 0.5) * CELL - this.arena.player.x, (sign.row + 0.5) * CELL - this.arena.player.y),
      );
      dialog.say(signLines(sign.ways));
    } else if (keeper) {
      this.talkToKeeper(keeper);
    } else if (giver) {
      giver.body.face(directionToward(this.arena.player.x - giver.body.x, this.arena.player.y - giver.body.y));
      if (giver.giver === TRAINER) this.talkToTrainer();
      else this.pack.talkToGiver(giver.giver);
    } else if (site) {
      // Touching a site the quest wants: read what it says, and let the action count it (the host decides, for a guest).
      dialog.say(siteNote(site.kind, progressOf(this.arena.hero)));
      attack();
    } else if (pet) {
      pet.attend(this.arena.player.x, this.arena.player.y);
      dialog.say([petSound(pet.kind, pet.talks++)]);
    } else if (folk) {
      folk.body.face(directionToward(this.arena.player.x - folk.body.x, this.arena.player.y - folk.body.y));
      dialog.say(folk.lines, undefined, { pauses: true });
    } else if (npc?.visible && near(npc)) {
      npc.face(directionToward(this.arena.player.x - npc.x, this.arena.player.y - npc.y));
      dialog.say(NPC_LINES, undefined, { pauses: true });
    } else {
      attack();
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

  /** A player's action button (host and solo): open a chest within reach, pick something up, otherwise attack. */
  act(p: Player) {
    if (p.dm) return; // the Dungeon Master opens, picks and strikes nothing
    if (this.barrels.setDown(p)) return; // carrying a barrel: A sets it down
    const chest = this.arena.chests.find(
      (c) => !c.opened && Math.hypot(p.body.x - c.x, p.body.y - (c.y - CELL / 2)) < CHEST_REACH,
    );
    if (chest) return this.openChest(p, chest);
    const farming = enabled('farming', this.arena.zone.name); // without it, crop plots are scenery
    const crop = farming && this.arena.crops.find((c) => c.ripe && this.inReach(p, c));
    if (crop) return this.pickCrop(p, crop);
    const dry =
      farming &&
      this.arena.crops.find((c) => c.thirsty && Math.hypot(p.body.x - c.x, p.body.y - (c.y - CELL / 2)) < CROP_REACH);
    if (dry) return this.waterCrop(p, dry);
    const site = this.arena.sites.find(
      (s) =>
        Math.hypot(p.body.x - s.x, p.body.y - s.y) < SITE_REACH &&
        (siteOpen(p.hero, s.kind, this.arena.zone.name, s.index) || this.storyUi.questWants(this.arena.zone.name, s)),
    );
    if (site) return this.touchSite(p, site);
    if (this.barrels.pickUp(p)) return;
    if (this.sim.pondAction(p)) return; // A by a pond drinks (or stops drinking) instead of swinging
    const loose = this.ground.nearest(p);
    if (loose) this.ground.pickUp(p, loose);
    else this.sim.attack(p);
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
    if (this.arena.role === 'client') this.guestPress();
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
      sim.text(x, y - 14, got.text, 0xff8a7a);
      return;
    }
    crop.pick();
    sim.fx('levelUp', x, y + 6);
    sim.text(x, y - 14, got.text, 0xa8e868);
  }

  /** A player waters a dry plot with a Waterskin from their pack. */
  private waterCrop(p: Player, crop: Crop) {
    const { sim } = this;
    const [x, y] = [crop.x, crop.y - CELL];
    const result = waterWith(p.hero);
    if (!result.ok) {
      sim.text(x, y - 14, result.text, 0xff8a7a);
      return;
    }
    crop.water();
    sim.fx('levelUp', x, y + 6);
    sim.text(x, y - 14, result.text, 0x8fc8ff);
  }

  private openChest(p: Player, chest: Chest) {
    const { sim, arena } = this;
    const loot = CHEST_LOOTS[chest.loot];
    if (!loot) return;
    const found = collect(p.hero, loot);
    const [x, y] = [chest.x, chest.y - CELL];
    if (found.refused) {
      sim.text(x, y - 14, found.text, 0xff8a7a);
      return;
    }
    chest.setOpen(true);
    sim.fx('levelUp', x, y + 6);
    sim.text(x, y - 14, found.text, 0xffd34d);
    if (found.gear) arena.refreshLook(p);
    if (found.levels) {
      sim.text(p.body.x, p.body.y - 62, 'LEVEL UP!', 0xffb13f);
      sim.fx('levelUp', p.body.x, p.body.y - 14);
    }
  }

  /**
   * A guest's own idea of whether it is drinking, kept in step with what the host will do with the same press: walking
   * stops the drink, an enemy near turns A into an attack, otherwise A by a pond starts or stops it.
   */
  trackGuestDrink(cmd: Command) {
    if (cmd.dx || cmd.dy) this.guestDrinking = false;
    else if (cmd.act && foeNear(this.arena.zone, this.arena.local)) this.guestDrinking = false;
    else if (cmd.act && (this.guestDrinking || canDrink(this.arena.zone, this.arena.local))) {
      this.guestDrinking = !this.guestDrinking;
    }
  }

  /** Forget the Harvest and Drink buttons (the scene is being left). */
  clear() {
    this.harvestButtons.clear();
  }
}
