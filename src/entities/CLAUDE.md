# src/entities: things drawn in the world

- **A `Character`'s origin is its feet**, so collision and y-sorting (`zIndex = y`) use it directly. It renders from a
  composed doll sheet (`src/sprites/CLAUDE.md`); one-shot poses (`play`) take over until done.
- **`Mob` is an AI state machine driven through the `MobWorld` interface** the scene passes in (`strike`, `shoot`, `ray`),
  so it never reaches into the rules. Its design rules keep fights fair and learnable-but-not-gameable (`Mob.ts` constants
  explain each): a hero cannot juggle a mob (poise after a stagger, a committed windup cannot be interrupted); a melee
  blow cannot be dodged by stepping back and forth (it starts from a reach longer than the sword's, windup length varies,
  aim locks once committed, and the blow is a real lunge); a mob that loses the hero mends so chipping and healing
  doesn't work; a kind with a `ray` (the Mummy) is a caster with a melee fallback whose beam any hit interrupts.
  **Aggro needs line of sight** (`MobWorld.sees`, `Collision.hasLineOfSight`): walls do not pull rooms; a mob also hears a
  hero at `HEARING` of its sight, and a chaser keeps `MEMORY` seconds after losing sight, and gives up the moment the hero is past its sight range. Host-only, so no co-op change.
  **Giants** (`MobKind.scale`) draw bigger and the rules follow: collision box, reach, hit circle, bars.
- **Hit-pause** (`systems/hitPause.ts`): per actor, never a world freeze. A surviving mob freezes and flashes 100-150ms on
  a blow, then staggers; the hero who landed a sword blow or arrow holds 50-70ms (`Player.hitstop`: no walking, pose held),
  110ms on a kill (a boss 200ms), and a struck hero holds 80ms. A killed mob holds the same kill pause and its death
  effect plays when the hold ends (`Mob.hit`'s `onDeathHold`). Cooldowns, i-frames and damage keep running through a pause,
  so balance is untouched. Knockback starts on the hit tick (about 30px, decaying, through the pause too). Host/solo only;
  a guest sees mobs stop because snapshots stop moving them (a friend's own hero walks on its own screen, so it feels the
  host's pause on its hero only as a held snapshot). Nothing on the wire. i-frames (`INVULN_TIME`) and blink: same module.
- **Windup cue** (`Mob.drawTell`, `WindupCue.ts`, maths in `systems/tellLook.ts`): a basic melee windup is 0.5 s (spread -20%/+20%, so at least 0.4 s, heavier kinds more; paid in `recover`), it starts at `REACH` (44 px), and the cue is in the world's own pixel-art language, **never a vector overlay** (no lane, ring, glow or hitbox shape, and no kind colour: one danger palette for every foe, warm red-orange, near-white at the lock, nothing green). The body coils (leans back, sinks and spreads, warms toward red, shivers once locked), a stepped-alpha pixel contact shadow widens and darkens, a short row of ground marks (little pixels) points the way the blow goes and appears one by one, and the aim lock (COMMITTED, when the blow can no longer be turned or interrupted) is the "now" frame: marks flash near-white, a few sparks fly. A shot or ray shows its direction as a longer row with a bright mark running outward. Plus one rising tone (`tell`, within 240 px). It starts subtle and intensifies; timing is untouched. All drawn from the existing `windup` state and timer on every page (a guest included, no protocol field; a guest's marks point at the nearest hero). A foe's sprites are built once and reused (11 per mob, hidden outside a windup, nothing allocated per frame). `MobKind.telegraph.ground: false` drops the marks; the legacy `telegraph.color` is accepted by the schema and unread. A shooter's windup that starts off-screen is also pulsed at the screen edge in the same danger colour (`Mob.shooterTell`, `hud/ThreatPulses.ts`, `src/hud/CLAUDE.md`). Every attacking kind needs a windup (`tools/content/campaigns.test.ts`, `NO_TELL` allowance, empty).
- **On a co-op guest a `Mob` is only a view of the host's state** (`setRemote`): it plays windup and hurt poses and draws
  a beam from the `channel` state itself, but never decides anything. The host alone damages.
- **Ambient life** (`ambient.ts`: footprints, falling leaves) is passive, driven by body movement and map metadata
  (`surface`, object `tag`, canopy sheet name), with no hooks into collision. Keep any new effect pooled and capped.
- **Places and light** (`Hearth.ts`, `LightGlow.ts`, `DarknessLayer.ts`; `docs/effects.md`): smoke, bubbles, drips and the
  underground's fog of war come from map data and run near the screen. Visual only, so no co-op change.
- **Show, don't tell** (`systems/cueRules.ts`, `Visuals`; core engine, cosmetic, co-op via `fx` events, `src/net/CLAUDE.md`): no popup text for state or combat. A blow's weight is the spark tier (`hitTier`: graze under 12% of the foe's health, heavy from 30% or a kill) on top of hit-pause and kick; a refusal is one `deny` cue (red puff, the actor's head-shake, a thud; where the reason is not on screen, ONE passive `dialog.note` line); pay is `gainMotes` (coins fly to the hero, `moteArc`); a level is `levelRing` (ring, body glow, chime, small badge). Low HP, hunger and thirst tint the local hero (`BodyCues`, `Character.setStrain`). Numbers exist only behind Controls > "Damage numbers" (`core/damageNumbers.ts`, off by default, solo and host only). New state goes through a cue, never `floatText`.
- Effects (`effects.ts`, `ParticleEffect.ts`) are transient visuals owned by an `Effects` list; add a particle effect
  with the `add-particle-effect` skill. Dynamic in-world text is `BitmapText` with the `FloatText` font.
