"""Builds public/audio/sfx/<kind>-<n>.ogg from the CC0 / CC-BY-SA sources (data-driven: each variant is a list of layers).
Run:  python3 -I build_sfx.py OUTDIR   (writes manifest_sfx.json beside this script). Re-runnable; seeded."""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from alib import SR, lufs, peak, peak_db, centroid
import dsp
from srcs import Used, licence_of

OUT = sys.argv[1]
R = 'c:80-CC0-RPG-SFX/'; B = 'c:25-CC0-bang-sfx/'; WM = 'c:100-CC0-wood-metal-SFX/'; BF = 'c:75-cc0-breaking-falling-hit-sfx/'
S1 = 'c:100-CC0-SFX/'; S2 = 'c:100-cc0-sfx-2/'; C1 = 'c:80-CC0-creature-SFX/'; C2 = 'c:80-CC0-creature-sfx-2/'
KR = 'c:kenney_rpgaudio/Audio/'; KJ = 'c:kenney_musicjingles/Audio/'; OW = 'c:Micro Pack - Organic Wooshes/'; CE = 'c:bb - Novice Cello (Nov 2021)/'
SW = 'w:missiles/sword/'; SH = 'w:missiles/shield_metal/'

def L(spec, st=0.0, g=0.0, at=0.0, lp=None, hp=None, cut=None, fo=0.02):
    return dict(spec=spec, st=st, g=g, at=at, lp=lp, hp=hp, cut=cut, fo=fo)

def render(layers, used):
    parts = []
    for l in layers:
        a = used.get(l['spec'])
        a = dsp.trim(a, -45, 2, 30)
        if l['cut']: a = dsp.cut(a, *l['cut'])
        if l['st']: a = dsp.semitones(a, l['st'])
        if l['hp']: a = dsp.hp(a, l['hp'])
        if l['lp']: a = dsp.lp(a, l['lp'])
        a = dsp.fade(a, 0.002, l['fo'])
        parts.append((a, l['g'], l['at']))
    return dsp.mix(*parts)

# kind: (target LUFS, peak ceiling dBFS, max seconds, tail fade s, [variants...])
K = {}
K['sword'] = (-22, -6, 0.5, 0.12, [
    [L(OW + 'Slash.wav', g=-4), L(SW + f'swordhit_{n}.wav', at=0.07), L(KR + 'metalLatch.ogg', g=-14, at=0.07, lp=3000)] for n in ('11', '12b', '15a', '17a')])
K['axe'] = (-21, -5, 0.5, 0.12, [
    [L(OW + 'Swish 4.wav', g=-5), L(a, at=0.08), L(SH + b, g=-9, at=0.08, st=-3, lp=5000)] for a, b in
    ((KR + 'chop.ogg', 'shieldimpmetal_22.wav'), (WM + 'wood_hit_03.ogg', 'shieldimpmetal_25.wav'), (S1 + 'hit_03.ogg', 'shieldimpmetal_26.wav'), (S2 + 'sfx100v2_wood_hit_02.ogg', 'shieldimpmetal_212.wav'))])
K['spear'] = (-23, -6, 0.45, 0.1, [
    [L(OW + f'Swish {n}.wav', g=-3, cut=(0, 0.3)), L(a, at=0.1, lp=4500), L(OW + 'Thunk 1.wav', g=-8, at=0.1)] for n, a in
    ((1, BF + 'bfh1_hit_02.ogg'), (2, BF + 'bfh1_hit_07.ogg'), (4, BF + 'bfh1_hit_03.ogg'), (6, BF + 'bfh1_wood_hit_01.ogg'))])
K['dagger'] = (-24, -7, 0.4, 0.08, [
    [L(KR + 'knifeSlice.ogg', cut=(0.0, 0.3)), L(BF + 'bfh1_hit_05.ogg', at=0.1, g=-6)],
    [L(KR + 'knifeSlice2.ogg', cut=(0.0, 0.3)), L(S1 + 'hit_01.ogg', at=0.08, g=-8)],
    [L(OW + 'Slash.wav', st=3), L(BF + 'bfh1_hit_09.ogg', at=0.05, g=-6)]])
K['bow'] = (-24, -7, 0.4, 0.1, [
    [L(CE + f'{n} - Pluck {k}.wav', st=s, cut=(0, 0.25), hp=180, fo=0.15), L(OW + 'Swish 4.wav', g=-8, at=0.0, cut=(0, 0.2))] for n, k, s in
    (('A3', 1, 7), ('A3', 2, 5), ('D3', 1, 9), ('D3', 2, 6))])
K['arrowhit'] = (-27, -9, 0.2, 0.06, [
    [L(a, lp=6000, cut=(0, 0.16), st=s), L(OW + 'Thunk 2.wav', g=-10, at=0.0, cut=(0, 0.12))] for a, s in
    ((WM + 'wood_hit_06.ogg', 2), (WM + 'wood_hit_01.ogg', 0), (BF + 'bfh1_wood_hit_01.ogg', 3), (WM + 'wood_hit_04.ogg', 1))])
K['ballista'] = (-20, -4, 0.7, 0.2, [
    [L(CE + f'{n} - Pluck {k}.wav', st=s, cut=(0, 0.5), hp=70, fo=0.25), L(WM + f'wood_slam_0{w}.ogg', at=0.01, g=-4), L(OW + 'Combo 1.wav', g=-6, at=0.05, cut=(0, 0.4))] for n, k, s, w in
    (('D3', 2, -7, 1), ('A3', 1, -10, 2), ('G2', 1, 0, 3))])
K['gun'] = (-18, -4, 0.6, 0.25, [[L(B + f'shot_0{n}.ogg', cut=(0, 0.6), hp=120)] for n in (1, 2, 3)] + [[L(S1 + 'shot_01.ogg', cut=(0, 0.6), hp=120)]])
K['cannon'] = (-16, -3, 1.1, 0.35, [[L(B + f'cannon_0{n}.ogg', cut=(0, 1.1), hp=50)] for n in (1, 3, 4, 5)])
K['catapult'] = (-19, -4, 0.9, 0.2, [
    [L('w:neutral/onager_shooting.wav', st=s, hp=60), L(KR + 'creak3.ogg', g=-6, at=0.0, cut=(0, 0.3))] for s in (-1.5, 0, 1.5)])
K['flame'] = (-22, -6, 0.9, 0.3, [[L(R + f'spell_fire_0{n}.ogg', cut=(0, 0.9), hp=200)] for n in (6, 7, 3)])
K['blast'] = (-16, -2, 1.3, 0.5, [
    [L(S1 + 'explosion.ogg', st=-2, hp=40), L(B + 'bang_03.ogg', g=-3, cut=(0, 1.0), lp=1500)],
    [L(B + 'bang_06.ogg', cut=(0, 1.2), hp=40), L(BF + 'bfh1_rock_falling_01.ogg', g=-9, at=0.15)],
    [L(B + 'bang_09.ogg', cut=(0, 1.1), hp=40), L(S2 + 'sfx100v2_thunder_01.ogg', g=-8, cut=(0, 1.2), lp=500)],
    [L(S1 + 'explosion.ogg', st=-5, hp=30), L(B + 'bang_01.ogg', g=-4, cut=(0, 1.0), lp=2500), L(R + 'stones_04.ogg', g=-10, at=0.2)]])
K['bat'] = (-25, -8, 0.45, 0.12, [
    [L((C1 if n in ('03',) else C2) + f'bug_{n}.ogg', st=s, cut=(0, 0.35)), L(OW + 'Swish 5.wav', g=-8, cut=(0, 0.3), at=0.05)] for n, s in (('03', 3), ('07', 2), ('10', 4), ('12', 3))])
K['gryphon'] = (-22, -6, 0.6, 0.15, [
    [L(f'w:neutral/crow/crow{n}.wav', st=s, hp=300, cut=(0, 0.5)), L(OW + 'Swish 3.wav', g=-6, at=0.05, lp=3500)] for n, s in ((1, 5), (8, 4), (9, 6), (4, 7))])
K['charge'] = (-21, -5, 0.8, 0.2, [
    [L(f'w:neutral/horse/horse_attack{n}.wav', cut=(0.0, 0.6), st=s), L(C2 + 'stomp_01.ogg', g=-5, at=0.05)] for n, s in ((1, -1), (2, 0), (3, -2))])
K['spit'] = (-24, -7, 0.55, 0.12, [[L(C1 + 'spit_01.ogg'), L(C1 + 'slime_02.ogg', g=-8, at=0.1)] if False else [L(C1 + f'spit_0{n}.ogg'), L(C2 + 'slime_02.ogg', g=-9, at=0.12)] for n in (1, 2, 3)])
K['hitwood'] = (-21, -5, 0.55, 0.15, [
    [L(BF + f'bfh1_wood_breaking_0{n}.ogg'), L(WM + 'wood_hit_05.ogg', g=-4, lp=2000)] for n in (1, 2, 3, 4)])
K['hitstone'] = (-20, -4, 0.6, 0.15, [
    [L(a, hp=60), L(BF + 'bfh1_hit_02.ogg', g=-9, lp=800)] for a in
    (BF + 'bfh1_rock_hit_01.ogg', BF + 'bfh1_rock_breaking_03.ogg', R + 'item_stone_03.ogg', S2 + 'sfx100v2_stones_02.ogg')])
K['deathgoblin'] = (-22, -7, 0.65, 0.15, [
    [L(a, st=s, cut=(0, 0.55)), L(KR + 'cloth1.ogg', g=-14, at=0.2, cut=(0, 0.3))] for a, s in
    ((C1 + 'hurt_01.ogg', 5), (C1 + 'hurt_02.ogg', 4), (C2 + 'die_04.ogg', 3), (R + 'creature_hurt_02.ogg', 4))])
K['deathdwarf'] = (-21, -6, 0.7, 0.15, [
    [L(a, st=s, cut=(0, 0.6)), L(WM + 'metal_hit_02.ogg', g=-12, at=0.15, lp=4000)] for a, s in
    ((C2 + 'die_03.ogg', -2), (C2 + 'die_01.ogg', -3), (C2 + 'grunt_06.ogg', 0), (C2 + 'grunt_08.ogg', 3))])
K['deathhuman'] = (-21, -6, 0.75, 0.15, [
    [L(C2 + f'human_0{n}.ogg', st=s, cut=(0, 0.65)), L(KR + 'dropLeather.ogg', g=-11, at=0.25)] for n, s in ((3, -1), (7, 0), (1, -2), (5, 0))])
K['deathbeast'] = (-20, -6, 1.0, 0.25, [
    [L(f'w:neutral/horse/horse_death{n}.wav', st=s, cut=(0, 1.0))] for n, s in ((1, -2), (2, -3), (4, -2))] + [[L('w:neutral/yale/yaledead.wav', cut=(0, 1.0))]])
K['deathflyer'] = (-24, -8, 0.6, 0.15, [
    [L('w:neutral/bird/deadbird.wav', st=2), L(OW + 'Swish 5.wav', g=-10, at=0.1)],
    [L('w:neutral/crow/crow4.wav', st=5), L(OW + 'Swish 5.wav', g=-10, at=0.1)],
    [L('w:neutral/bird/deadbird2.wav', st=-2), L(OW + 'Swish 6.wav', g=-10, at=0.08)],
    [L(C2 + 'bug_05.ogg', st=4), L(OW + 'Swish 6.wav', g=-10, at=0.08)]])
K['build'] = (-22, -5, 0.9, 0.2, [
    [L(WM + f'hammer_0{a}.ogg'), L(WM + f'hammer_0{b}.ogg', at=0.27, g=-2), L('w:misc/construction/con_wood_10.wav', at=0.55, g=-3)] for a, b in ((2, 3), (3, 4), (4, 2))] +
    [[L(WM + 'wood_hammer_01.ogg'), L('w:misc/construction/con_stone_11.wav', at=0.25, g=-3), L(WM + 'wood_hammer_02.ogg', at=0.5)],
     [L(WM + 'hammer_01.ogg', cut=(0, 0.3)), L(WM + 'tools_03.ogg', at=0.3, g=-4, cut=(0, 0.4)), L('w:misc/construction/con_wood_13.wav', at=0.6)]])
K['razedSmall'] = (-19, -3, 1.3, 0.35, [
    [L(WM + a), L(BF + b, at=0.1, g=-5)] for a, b in
    (('wood_breaking_01.ogg', 'bfh1_wood_falling_01.ogg'), ('wood_breaking_02.ogg', 'bfh1_wood_falling_02.ogg'), ('wood_falling_05.ogg', 'bfh1_wood_breaking_03.ogg'), ('wood_falling_01.ogg', 'bfh1_wood_breaking_01.ogg'))])
K['razedLarge'] = (-17, -3, 1.9, 0.5, [
    [L(BF + a, hp=50), L(R + b, at=0.1, g=-4), L(B + 'bang_03.ogg', g=-9, lp=250, cut=(0, 1.0))] for a, b in
    (('bfh1_rock_falling_01.ogg', 'stones_03.ogg'), ('bfh1_rock_breaking_01.ogg', 'stones_02.ogg'), ('bfh1_rock_falling_03.ogg', 'stones_01.ogg'), ('bfh1_rock_breaking_02.ogg', 'stones_03.ogg'))])
K['fall'] = (-14, -1, 3.5, 1.0, [
    [L(a, g=0, hp=35), L(BF + 'bfh1_rock_falling_01.ogg', at=0.3, g=-3), L(R + 'stones_03.ogg', at=0.6, g=-4), L(WM + 'wood_breaking_01.ogg', at=0.5, g=-6),
     L(S1 + 'gong_02.ogg', st=-7, at=0.9, g=-8), L(S2 + 'sfx100v2_thunder_01.ogg', at=0.2, g=-6, lp=700)] for a in (B + 'bang_03.ogg', B + 'bang_06.ogg', B + 'cannon_02.ogg')])
K['upgrade'] = (-22, -6, 1.3, 0.4, [
    [L(WM + f'metal_hit_0{n}.ogg'), L(S1 + 'bell_02.ogg', st=s, at=0.12, g=-5), L(R + f'spell_0{k}.ogg', at=0.1, g=-10, lp=6000)] for n, s, k in ((2, 5, 1), (4, 7, 2), (1, 3, 1))])
K['castle'] = (-18, -3, 3.4, 0.7, [
    [L('m:GermanicWin_Intro.ogg', cut=(0.0, 3.2), fo=0.6)],
    [L(S1 + 'bell_01.ogg', st=-2), L(S1 + 'gong_01.ogg', g=-4), L(KJ + 'Hit jingles/jingles_HIT05.ogg', g=-5, at=0.08), L(KJ + 'Steel jingles/jingles_STEEL01.ogg', g=-8, at=0.25)]])
K['bunker'] = (-24, -7, 0.8, 0.15, [
    [L(R + f'chain_0{n}.ogg', cut=(0, 0.6)), L(KR + 'metalLatch.ogg', at=0.3, g=-4), L(S1 + 'door_close_03.ogg', g=-8, at=0.02, lp=3000)] for n in (1, 2, 3)])
K['alarm'] = (-17, -3, 3.0, 0.8, [
    [L(S1 + 'bell_01.ogg', st=-5, at=t, g=-1.5 * i) for i, t in enumerate((0, 0.55, 1.1, 1.65))] + [L(S1 + 'gong_02.ogg', st=-4, at=0, g=-6)],
    [L(S1 + 'bell_03.ogg', st=-6, at=t, g=-1.5 * i, lp=6000) for i, t in enumerate((0, 0.6, 1.2, 1.8))] + [L(S1 + 'gong_01.ogg', st=-6, at=0, g=-7)]])
K['warn'] = (-24, -6, 0.9, 0.2, [
    [L(WM + 'wood_hit_05.ogg', st=-3), L(WM + 'wood_hit_05.ogg', st=-4, at=0.3), L(C2 + 'stomp_01.ogg', g=-8, at=0.02)],
    [L(WM + 'wood_hit_07.ogg', st=-2), L(WM + 'wood_hit_07.ogg', st=-3, at=0.28), L(C2 + 'stomp_01.ogg', g=-8, at=0.02)]])
K['clock'] = (-24, -6, 1.8, 0.8, [[L(S1 + 'bell_02.ogg', st=-3, g=-3), L(S1 + 'bell_02.ogg', st=-3, at=0.6, g=-6)]])
K['clockLast'] = (-25, -7, 1.0, 0.1, [[L(S1 + 'wooden_02.ogg', cut=(0, 0.2), at=t, g=-1.5 * i) for i, t in enumerate((0, 0.3, 0.6))]])
K['coin'] = (-30, -12, 0.7, 0.2, [[L(R + f'item_coins_0{n}.ogg', cut=(0, 0.6))] for n in (1, 2, 3)])
K['click'] = (-27, -9, 0.1, 0.03, [[L(WM + f'wood_hit_0{n}.ogg', lp=3500, cut=(0, 0.09))] for n in (5, 7, 9)])
K['tick'] = (-31, -12, 0.07, 0.02, [[L(R + 'wood_02.ogg', cut=(0, 0.06), st=2)], [L(R + 'wood_01.ogg', cut=(0, 0.06), st=3)]])
K['refuse'] = (-24, -7, 0.3, 0.1, [[L(C2 + 'stomp_01.ogg', cut=(0, 0.25), lp=900)], [L(WM + 'wood_hit_02.ogg', st=-4, cut=(0, 0.25), lp=1200)]])
K['confirm'] = (-23, -6, 0.7, 0.25, [[L(KJ + f'Pizzicato jingles/jingles_PIZZI{n}.ogg', cut=(0, 0.6))] for n in ('00', '05', '04')])

# consistency checks before rendering
from srcs import fs_path
_missing = sorted({l['spec'] for v in K.values() for lay in v[4] for l in lay if not os.path.exists(fs_path(l['spec']))})
if _missing: sys.exit('MISSING sources: ' + '\n'.join(_missing))
manifest = {}; report = []
only = set(sys.argv[2:])
for kind, (tl, ceil, maxs, tail, variants) in K.items():
    if only and kind not in only: continue
    for i, layers in enumerate(variants, 1):
        used = Used()
        a = render(layers, used)
        a = dsp.trim(a, -50, 2, 10)[: int(maxs * SR)]
        a = dsp.fade(a, 0.002, tail)
        l = lufs(a)
        g = tl - l
        a = a * dsp.db(g)
        if peak(a) > dsp.db(ceil): a = a * (dsp.db(ceil) / peak(a))
        name = f'{kind}-{i}.ogg'
        dsp.write_ogg(a, os.path.join(OUT, name), q=3)
        manifest[name] = {'sources': [dict(spec=s, **licence_of(s)) for s in dict.fromkeys(used.items)],
                          'processing': f'layers trimmed, pitch/EQ per recipe, mixed, tail fade {tail}s, mono, normalised to {tl} LUFS (peak ceiling {ceil} dBFS), Ogg Vorbis q3'}
        report.append((name, len(a) / SR, peak_db(a), lufs(a), int(centroid(a)), os.path.getsize(os.path.join(OUT, name))))
json.dump(manifest, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'manifest_sfx.json' if not only else 'manifest_part.json'), 'w'), indent=1)
for r in report: print('%-18s %5.2fs peak %6.1f lufs %6.1f cent %5d %6dB' % r)
print('total', sum(r[5] for r in report), 'files', len(report))
