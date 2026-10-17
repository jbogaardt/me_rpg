// Plays a Dungeon Master's director cues (systems/cues.ts) on this page: an animation on an actor, a sound, a shake of the
// camera. The caption (`hud/Dialog.ts`) hands each cue over the moment its reading reaches it. Every page does this for
// itself from the tagged words it was told, so a cue is local and cosmetic: it never changes a rule, a mob's state or
// anything the host owns (a guest's `Mob` is only a view anyway), and it needs nothing on the wire. Core engine, co-op.

import { floatText } from '../../entities/effects';
import type { Character } from '../../entities/Character';
import { playSfx } from '../../hud/sfx';
import type { AnimName } from '../../sprites/doll';
import type { AnimAction, Cue } from '../../systems/cues';
import type { Arena } from './Arena';

/** The pose each action plays. `dodge` has none: it floats a word over the actor instead. */
const POSE: Record<Exclude<AnimAction, 'dodge'>, AnimName> = {
  slash: 'slash',
  lunge: 'slash',
  cast: 'cast',
  shoot: 'shoot',
  hurt: 'hurt',
  stagger: 'hurt',
};
const DODGE_COLOR = 0xcfd6dd;

export class CueDirector {
  constructor(private arena: Arena) {}

  /** Carry out one cue, where the local player is. */
  play(cue: Cue) {
    if (cue.kind === 'sfx') playSfx(cue.name);
    else if (cue.kind === 'camera') this.arena.view.camera.shake(cue.shake, cue.duration);
    else this.act(cue);
  }

  private act(cue: Extract<Cue, { kind: 'anim' }>) {
    for (const body of this.actors(cue.actor)) {
      if (cue.dir) body.face(cue.dir);
      if (cue.action === 'dodge') {
        this.arena.view.effects.add(floatText(body.x, body.y - 30, 'Dodged!', DODGE_COLOR));
      } else body.play(POSE[cue.action]);
    }
  }

  /** The bodies an actor names in the zone the local player is in (none when that one is elsewhere: nothing is shown). */
  private actors(actor: Extract<Cue, { kind: 'anim' }>['actor']): Character[] {
    const { arena } = this;
    const players = arena.players();
    if (actor === 'dm') return players.filter((p) => p.dm).map((p) => p.body);
    if (actor === 'party') return players.filter((p) => !p.dm).map((p) => p.body);
    if (actor === 'foe') {
      const here = arena.local.body;
      const foe = arena.mobs
        .filter((m) => m.alive)
        .sort(
          (a, b) => Math.hypot(a.body.x - here.x, a.body.y - here.y) - Math.hypot(b.body.x - here.x, b.body.y - here.y),
        )[0];
      return foe ? [foe.body] : [];
    }
    const player = arena.playerNumbered(Number(actor.slice(1)));
    return player ? [player.body] : [];
  }
}
