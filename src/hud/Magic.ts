import type { Hero } from '../systems/combat';
import { activeSkills, knows, LOADOUT_SLOTS, SKILL_IDS, SKILLS, skillOfZone, type SkillId } from '../systems/skills';
import { arrows, directionWords } from '../systems/spells';
import { combosHtml } from './itemText';
import { esc } from './html';

/** What the scene lets the Magic tab do. */
export interface MagicHandlers {
  /** Make `wanted` the skills that are ready (the scene does it here, or asks the host in a co-op game). */
  equip(wanted: SkillId[]): boolean;
  /** The zone the player is in (a training ground puts the skill being tested in slot 2). */
  zone(): string;
}

/**
 * The Magic tab of the pause menu (`#menu-magic`): the two slots for the abilities learned from the training wizard, each
 * ability with what it does and the arrows to tap, buttons to ready or remove it, and the wand or tome's combos (which do
 * not use the slots). Rules are systems/skills.ts; this is only the page. All the markup is from the game's own text.
 */
export class Magic {
  private handlers: MagicHandlers | null = null;
  private hero: Hero | null = null;

  constructor(private root: HTMLElement) {
    root.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLElement>('[data-skill]');
      if (!button || !this.hero || !this.handlers) return;
      const id = button.dataset.skill as SkillId;
      const slot = Number(button.dataset.slot); // 1..LOADOUT_SLOTS to ready it there, 0 to remove it
      const slots: (SkillId | undefined)[] = Array.from({ length: LOADOUT_SLOTS }, (_, i) => this.hero!.loadout[i]);
      for (const [i, s] of slots.entries()) if (s === id) slots[i] = undefined;
      if (slot > 0) slots[slot - 1] = id;
      this.handlers.equip(slots.filter((s): s is SkillId => s !== undefined));
      this.show(this.hero);
    });
  }

  attach(handlers: MagicHandlers | null) {
    this.handlers = handlers;
  }

  show(hero: Hero) {
    this.hero = hero;
    const zone = this.handlers?.zone() ?? '';
    const trial = skillOfZone(zone);
    const active = activeSkills(hero, zone);
    const slots = Array.from({ length: LOADOUT_SLOTS }, (_, i) => {
      const id = active[i];
      const lent = trial !== undefined && id === trial.id;
      const body = id
        ? `<strong>${SKILLS[id].name}</strong> <span class="keys">${arrows(SKILLS[id].keys)}</span>${lent ? ' <small>(on loan for the trial)</small>' : ''}`
        : '<em>empty</em>';
      return `<div class="magic-slot${id ? '' : ' empty'}"><small>Slot ${i + 1}</small><br />${body}</div>`;
    }).join('');

    const cards = SKILL_IDS.map((id) => {
      const s = SKILLS[id];
      if (!knows(hero, id)) {
        return `<div class="magic-card locked"><strong>${s.name}</strong> <small>learn at level ${s.minLevel} from Orin the Trainer</small></div>`;
      }
      const slot = hero.loadout.indexOf(id) + 1;
      const btn = (n: number, text: string) =>
        `<button type="button" class="mp-btn panel thin wood" data-skill="${id}" data-slot="${n}">${text}</button>`;
      const buttons = [
        ...Array.from({ length: LOADOUT_SLOTS }, (_, i) =>
          slot === i + 1 ? '' : btn(i + 1, `Ready in slot ${i + 1}`),
        ),
        slot ? btn(0, 'Remove') : '',
      ].join('');
      return `<div class="magic-card${slot ? ' ready' : ''}">
        <div><strong>${s.name}</strong> <span class="keys">${arrows(s.keys)}</span> <small>${directionWords(s.keys)} · ${s.cost} MP${slot ? ` · ready in slot ${slot}` : ''}</small></div>
        <p>${s.about}</p><div class="magic-actions">${buttons}</div></div>`;
    }).join('');

    const weapon = hero.weapon.focus
      ? `<h3>${esc(hero.weapon.name)} <small>its combos do not use the slots</small></h3>${combosHtml(hero.weapon)}`
      : '';
    this.root.innerHTML = `
      <h2>Abilities <small>${LOADOUT_SLOTS} ready at a time</small></h2>
      <p class="magic-help">Tap an ability's arrows (the move keys, or flick the D-pad) to cast it with any weapon. Ready the ones you want here, and swap them whenever you like. New abilities come from Orin the Trainer, one every five levels.</p>
      <div class="magic-slots">${slots}</div>
      ${weapon}
      ${cards}`;
  }
}
