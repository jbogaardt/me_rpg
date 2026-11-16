"""Writes public/audio/CREDITS.md from the build manifests (every output file: sources, authors, licences, changes)."""
import json, re, sys, collections
D = '/tmp/claude-0/-home-user-me-rpg/cc2cf524-b3ce-5c45-8929-e0397ffa0fcf/scratchpad/sound/'
sfx = json.load(open(D + 'manifest_sfx.json')); mus = json.load(open(D + 'manifest_music.json')); amb = json.load(open(D + 'manifest_amb.json'))
def short(spec):
    k, p = spec.split(':', 1)
    p = re.sub(r'^(kenney_\w+)/Audio/', r'\1/', p)
    return ('Wyrmsun ' if k == 'w' else 'Wyrmsun music ' if k == 'm' else '') + p.replace('.ogg', '').replace('.wav', '').replace('.mp3', '')
def lic(srcs):
    ls = {s['licence'] for s in srcs}
    if 'CC-BY-SA-3.0' in ls: return 'CC-BY-SA 3.0 (derivative of Wildfire Games sounds; share-alike)'
    if 'CC-BY-4.0' in ls: return 'CC-BY 4.0'
    if ls == {'PD'}: return 'public domain'
    return 'CC0' + (' (with public-domain bird sounds)' if 'PD' in ls else '')
kinds = collections.OrderedDict()
for f, m in sfx.items():
    kind, n = re.match(r'(\w+)-(\d+)\.ogg', f).groups()
    kinds.setdefault(kind, []).append((int(n), m))
for f, m in mus.items():
    if f.startswith('sfx/'):
        kind, n = re.match(r'sfx/(\w+)-(\d+)\.ogg', f).groups(); kinds.setdefault(kind, []).append((int(n), m))
GROUPS = [('Weapons', 'sword axe spear dagger bow ballista gun cannon catapult flame bat gryphon charge spit'),
 ('Where it lands', 'arrowhit hitwood hitstone blast'), ('The fallen', 'deathgoblin deathdwarf deathhuman deathbeast deathflyer'),
 ('Buildings and the world', 'build razedSmall razedLarge fall upgrade castle bunker'), ('Alerts and stingers', 'alarm warn clock clockLast coin win lose'),
 ('Interface', 'click tick refuse confirm')]
out = []
out.append('# Sound credits\n')
out.append('Every file in `sfx/`, `ambience/`, `music/` and `voice/` was made (trimmed, pitched, EQ\'d, layered, loudness-normalised and encoded to Ogg Vorbis) by the repeatable build scripts of the sound revamp from the sources below; each source\'s licence was read from a file in its own repository (the CC0 collection\'s `LICENSE` and the packs\' readmes; Wyrmsun\'s `sounds/credits.txt` and `music/credits.txt`). Only CC0, public-domain, CC-BY and CC-BY-SA sources are used; the GPL-only sounds of Wyrmsun (its bows, spears, axes, unit voices, birds and the like) were left out.')
out.append('\n**Share-alike:** files marked CC-BY-SA 3.0 contain Wildfire Games (0 A.D.) sounds and are CC-BY-SA 3.0 as derivatives (credit Wildfire Games, http://www.wildfiregames.com/, indicate the changes above, keep the same licence for these files). **Attribution:** music and stingers are by Marcelo Fernandez (http://www.marcelofernandezmusic.com), CC-BY 4.0, from the Wyrmsun game (https://github.com/Andrettin/Wyrmsun), changed as described.\n')
out.append('## Where the sources come from\n')
out.append('- **CC0 collection** (https://github.com/lavenderdotpet/CC0-Public-Domain-Sounds, all CC0 1.0): the "80 CC0 RPG SFX", "100 CC0 SFX", "100 CC0 SFX 2", "100 CC0 Wood and Metal SFX", "25 CC0 Bang SFX", "75 CC0 Breaking/Falling/Hit SFX", "80 CC0 Creature SFX" (1 and 2), "30 CC0 SFX Loops" packs (author not named in the collection; they match the rubberduck packs on OpenGameArt, **to confirm** against the OpenGameArt pages, which could not be reached), Kenney\'s RPG Audio and Music Jingles (kenney.nl, CC0 per their License.txt), Benjamin Burnes / Abstraction\'s "Novice Cello", "Fans and Drones" and Micro Pack "Organic Wooshes" (CC0 per their readmes), and "Maximiliano-Stradex-Ambient" (author named only by the folder, **to confirm**).')
out.append('- **Wyrmsun** (https://github.com/Andrettin/Wyrmsun): sword and shield impacts, construction, horse, onager and the music by the credits files; the crow and bird-death sounds are US Fish and Wildlife Service public domain.\n')
for title, names in GROUPS:
    out.append(f'## {title}\n')
    out.append('| Game sound (`sfx/<kind>-<n>.ogg`) | Made from | Licence | Changes |\n| --- | --- | --- | --- |')
    for k in names.split():
        v = sorted(kinds[k], key=lambda x: x[0]); n = len(v)
        srcs = {}
        for _, m in v:
            for s in m['sources']: srcs[s['spec']] = s
        listing = '; '.join(short(s) for s in srcs)
        auth = sorted({s['author'] for s in srcs.values()})
        proc = v[0][1]['processing'].split(', normalised')[0] if k not in ('win', 'lose') else v[0][1]['processing']
        out.append(f'| `{k}-1..{n}` | {listing}. By: {"; ".join(auth)} | {lic(list(srcs.values()))} | {proc}; normalised to the category\'s loudness |')
    out.append('')
out.append('## Ambience (`ambience/<theme>.ogg`)\n')
out.append('| File | Made from | Licence | Changes |\n| --- | --- | --- | --- |')
for f, m in amb.items():
    out.append(f'| `{f}` | {"; ".join(short(s["spec"]) for s in m["sources"])} | {lic(m["sources"])} | {m["processing"]} |')
out.append('\nThe ember bed uses the "Maximiliano-Stradex-Ambient" drone (author **to confirm**); the greenwood and desert beds use public-domain crow calls from Wyrmsun.\n')
out.append('## Music (`music/<track>.ogg`)\n')
out.append('All by Marcelo Fernandez (http://www.marcelofernandezmusic.com), **CC-BY 4.0** (https://creativecommons.org/licenses/by/4.0/), from Wyrmsun\'s adaptive-music stems (`music/oaml/`); changes: stems trimmed, joined with 1.6 s cross-fades, the loop seam cross-faded, normalised to -17 LUFS, re-encoded to stereo Ogg Vorbis 80 kbps.\n')
out.append('| File | Stems |\n| --- | --- |')
for f, m in mus.items():
    if f.startswith('music/'): out.append(f'| `{f}` | {", ".join(s["spec"][2:-4] for s in m["sources"])} |')
out.append('\nThe victory (`sfx/win-1`) and defeat (`sfx/lose-1`) stingers are excerpts of Marcelo Fernandez\'s `GermanicWin_Intro`/`GermanicWin_A` and `GermanicLose_A` (CC-BY 4.0), faded out and normalised; the castle level-up fanfare `castle-1` is the opening of `GermanicWin_Intro`.\n')
out.append('## Unit voices\n')
out.append('- `voice/<race>-<unit>-<line>.ogg`: the units\' lines, made with ElevenLabs text-to-speech (the lines are in `src/voiceLines.ts`). Each race uses one ElevenLabs library voice (Goblins: Callum; Dwarves: Brian; Germanic: Harry). The files were converted from the original WAVs to mono Ogg Vorbis 64 kbps, trimmed of silence and normalised to -20 LUFS (peaks at most -3 dBFS); the lines themselves are unchanged. Generated speech is not CC0 or CC-BY: check ElevenLabs\' terms for the plan the files were made on (free plan usage, attribution and commercial use) before relying on them beyond this public page, and say here if the terms need a credit line.\n')
out.append('## Synthesized cues\n')
out.append('None: every cue is a recording or a layered recording (the Web Audio oscillator cues of the previous pass, `synth.ts`, were removed).\n')
open('/home/user/me_rpg/towercraft/public/audio/CREDITS.md', 'w').write('\n'.join(out))
