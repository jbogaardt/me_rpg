"""Builds public/audio/ambience/<theme>.ogg: 30 s seamless loops (tail cross-faded into the head), mono, about -30 LUFS.
Run: python3 -I build_amb.py OUTDIR"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from alib import SR, lufs, peak, peak_db, centroid
import dsp
from srcs import Used, licence_of
OUT = sys.argv[1]; LEN = 33.0; rng = np.random.default_rng(7)
BBF = 'c:bb - Fans and Drones (Jul 2021)/'; S2 = 'c:100-cc0-sfx-2/'; C1 = 'c:80-CC0-creature-SFX/'; C2 = 'c:80-CC0-creature-sfx-2/'; R = 'c:80-CC0-RPG-SFX/'
def bed(u, spec, start, secs=LEN):
    a = u.get(spec); a = a[int(start * SR): int(start * SR) + int(secs * SR)]
    if len(a) < secs * SR: a = np.concatenate([a, a[: int(secs * SR) - len(a)]])  # (short sources are wrapped)
    return a
def lfo(n, hz, lo=0.55, hi=1.0, ph=0.0):
    t = np.arange(n) / SR; return lo + (hi - lo) * (0.5 + 0.5 * np.sin(2 * np.pi * hz * t + ph))
def sprinkle(base, u, specs, count, g, st=(0, 0), lp=None, hp=None, cut=None, margin=2.0):
    for _ in range(count):
        a = u.get(specs[rng.integers(len(specs))]); a = dsp.trim(a, -50, 2, 30)
        if cut: a = dsp.cut(a, *cut)
        s = rng.uniform(*st)
        if s: a = dsp.semitones(a, s)
        if lp: a = dsp.lp(a, lp)
        if hp: a = dsp.hp(a, hp)
        a = dsp.fade(a, 0.01, 0.1)
        at = int(rng.uniform(margin, LEN - margin - len(a) / SR) * SR)
        base[at: at + len(a)] += a * dsp.db(g + rng.uniform(-3, 2))
def green(u):
    n = int(LEN * SR)
    a = dsp.hp(dsp.lp(bed(u, BBF + 'Outside.wav', 4), 6500), 90) * 1.0 * lfo(n, 0.07, 0.6, 1.0)
    sprinkle(a, u, ['w:misc/foraging/leaves_%d.wav' % k for k in (11, 12, 14, 16, 18)], 9, -14, lp=7000)
    sprinkle(a, u, ['w:neutral/crow/crow%d.wav' % k for k in (1, 2, 3, 8, 9)], 4, -20, st=(-2, 2), lp=5000, hp=250)
    return a
def frost(u):
    n = int(LEN * SR)
    a = dsp.bp(bed(u, BBF + 'Large Fan.wav', 8), 120, 2200) * 1.6
    a = dsp.peaking(a, 650, 9, 2.5) * lfo(n, 0.06, 0.45, 1.0)
    b = dsp.bp(bed(u, BBF + 'Outside.wav', 22), 1200, 4500) * 0.5 * lfo(n, 0.09, 0.3, 1.0, ph=2.0)
    return a + b
def desert(u):
    n = int(LEN * SR)
    a = dsp.bp(bed(u, BBF + 'Outside.wav', 15), 700, 6500, 2) * 1.2 * lfo(n, 0.05, 0.5, 1.0)
    b = dsp.lp(bed(u, BBF + 'Large Fan.wav', 30), 500) * 0.8 * lfo(n, 0.04, 0.2, 1.0, ph=1.3)
    a = a + b
    sprinkle(a, u, ['w:neutral/crow/crow%d.wav' % k for k in (5, 6)], 2, -26, st=(-4, -2), lp=3500, hp=300)
    return a
def mire(u):
    n = int(LEN * SR)
    w = np.zeros(n)
    for i, k in enumerate(('01', '02', '03')):
        a = dsp.lp(u.get(S2 + f'sfx100v2_loop_water_{k}.ogg'), 5500)
        w += np.resize(a, n) * 0.5
    d = dsp.lp(bed(u, BBF + 'Air Vent.wav', 12), 300) * 1.2
    a = w + d
    sprinkle(a, u, [C1 + 'bug_0%d.ogg' % k for k in (1, 2, 3)] + [C2 + 'bug_%02d.ogg' % k for k in (6, 8, 10, 13)], 28, -17, st=(1, 4), lp=8000, hp=1500, margin=0.5)
    return a
def ember(u):
    n = int(LEN * SR)
    a = dsp.hp(bed(u, 'c:Maximiliano-Stradex-Ambient/Ambient_1.mp3', 20), 40) * 0.8
    a += dsp.lp(bed(u, BBF + 'Furnace Fan.wav', 10), 420) * 1.0
    sprinkle(a, u, [R + 'spell_fire_0%d.ogg' % k for k in (1, 2, 3, 4, 5)], 12, -8, hp=1200, cut=(0, 0.6))
    sprinkle(a, u, [S2 + 'sfx100v2_thunder_01.ogg'], 2, -12, lp=300, margin=4)
    return a
THEMES = {'greenwood': green, 'frostlands': frost, 'desert': desert, 'mire': mire, 'ember': ember}
manifest = {}; rows = []
for name, fn in THEMES.items():
    u = Used(); a = fn(u)
    a = dsp.loop_xfade(a, 3.0)
    a = dsp.norm_lufs(a, -30.0, -6.0)
    a = a - a.mean()
    path = os.path.join(OUT, 'ambience', name + '.ogg'); dsp.write_ogg(a, path, br='48k')
    manifest['ambience/' + name + '.ogg'] = {'sources': [dict(spec=s, **licence_of(s)) for s in dict.fromkeys(u.items)],
        'processing': 'filtered/looped beds with slow level drift, layered with randomly placed one-shots (seeded), 3 s tail-into-head loop cross-fade, normalised to -30 LUFS, mono Ogg Vorbis 48k'}
    rows.append((name, len(a) / SR, lufs(a), peak_db(a), int(centroid(a[:SR*10])), os.path.getsize(path)))
json.dump(manifest, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'manifest_amb.json'), 'w'), indent=1)
for r in rows: print('%-11s %5.1fs lufs %6.1f peak %5.1f cent %5d %7dB' % r)
