"""Builds music (menu intro+loop, five battle tracks), the win/lose stingers and writes manifest_music.json.
Run: python3 -I build_music.py OUTDIR   (OUTDIR/music/*.ogg and OUTDIR/sfx/win-1.ogg, lose-1.ogg). Stems: Marcelo Fernandez, CC-BY 4.0 (Wyrmsun)."""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from alib import SR, load, lufs, peak, peak_db
import dsp
from srcs import licence_of, fs_path
OUT = sys.argv[1]
BR = '80k'
def stem(name, start=0.0, end=None):
    spec = 'm:' + name + '.ogg'; licence_of(spec)
    a = load(fs_path(spec), mono=False)
    # trim trailing near-silence, keep the natural decay down to -60 dB
    env = np.abs(a).max(axis=1); idx = np.where(env > 10 ** (-60 / 20))[0]
    a = a[: idx[-1] + 1]
    return a[int(start * SR): None if end is None else int(end * SR)], spec
def join(parts, xf=1.6):
    """Cross-fade stems into one piece (equal power), the next one starting `xf` seconds before the last one ends."""
    out = parts[0][0].copy()
    for p, _ in parts[1:]:
        n = int(xf * SR); t = np.linspace(0, np.pi / 2, n)[:, None]
        out[-n:] = out[-n:] * np.cos(t) + p[:n] * np.sin(t)
        out = np.concatenate([out, p[n:]])
    return out
def finish(a, target=-17.0, loop=True, fade_out=0.0):
    if loop: a = dsp.loop_xfade(a, 1.6)
    g = target - lufs(a.mean(axis=1) if a.ndim == 2 else a)  # approx; verified below with the stereo meter
    a = a * dsp.db(g)
    if peak(a) > dsp.db(-1.0): a = a * (dsp.db(-1.0) / peak(a))
    return a
def stereo_lufs(a):
    import pyloudnorm as pyln
    return pyln.Meter(SR).integrated_loudness(a)
TRACKS = {
    'menu-intro': ([('MenuTheme_Intro', 0, 26.0)], False),
    'menu-loop': ([('MenuTheme_C', 0, None)], True),
    'march': ([('GermanicTheme_A2',), ('GermanicTheme_B1',), ('GermanicTheme_B2',)], True),
    'glory': ([('GermanicTheme2_B1',), ('GermanicTheme2_B2',)], True),
    'siege': ([('GermanicTheme3_A1',), ('GermanicTheme3_B1',), ('GermanicTheme3_B2',), ('GermanicTheme3_A3',), ('GermanicTheme3_B2',)], True),
    'stone': ([('DwarfTheme_A2',), ('DwarfTheme_B1',)], True),
    'deep': ([('DwarfTheme2_B1',), ('DwarfTheme2_R1',)], True),
}
manifest = {}; rows = []
for name, (parts, loop) in TRACKS.items():
    ps = [stem(*p) for p in parts]
    a = join(ps) if len(ps) > 1 else ps[0][0]
    if name == 'menu-intro':
        a = dsp.fade(a.T[0], 0, 0) if False else a
        n = int(2.0 * SR); a = a.copy(); a[-n:] *= np.cos(np.linspace(0, np.pi / 2, n))[:, None] ** 2  # the loop comes in over its tail
    a = finish(a, -17.0, loop)
    for _ in range(3):  # measure on stereo, trim the gain error
        a = a * dsp.db(-17.0 - stereo_lufs(a)); 
        if peak(a) > dsp.db(-1.0): a = a * (dsp.db(-1.0) / peak(a))
    path = os.path.join(OUT, 'music', name + '.ogg'); dsp.write_ogg(a, path, sr=SR, ch=2, br=BR)
    manifest['music/' + name + '.ogg'] = {'sources': [dict(spec=s, **licence_of(s)) for s in dict.fromkeys(s for _, s in ps)],
        'processing': f'stems cross-faded (1.6 s equal power){", seam cross-faded for looping" if loop else ""}, normalised to -17 LUFS integrated (peak <= -1 dBFS), stereo Ogg Vorbis {BR}'}
    rows.append((name, len(a) / SR, stereo_lufs(a), peak_db(a), os.path.getsize(path)))
# stingers (stereo)
def sting(name, parts, target):
    ps = [stem(*p) for p in parts]; a = join(ps, 0.6) if len(ps) > 1 else ps[0][0]
    return a, ps
win, ps = sting('win', [('GermanicWin_Intro', 0, None), ('GermanicWin_A', 0, 5.0)], -16)
n = int(2.0 * SR); win[-n:] *= np.cos(np.linspace(0, np.pi / 2, n))[:, None] ** 2
lose, ps2 = sting('lose', [('GermanicLose_A', 0, 13.0)], -17)
lose[-n:] *= np.cos(np.linspace(0, np.pi / 2, n))[:, None] ** 2
for name, a, p, t in (('win-1', win, ps, -16.0), ('lose-1', lose, ps2, -17.0)):
    for _ in range(3):
        a = a * dsp.db(t - stereo_lufs(a))
        if peak(a) > dsp.db(-1.0): a = a * (dsp.db(-1.0) / peak(a))
    path = os.path.join(OUT, 'sfx', name + '.ogg'); dsp.write_ogg(a, path, sr=SR, ch=2, br='96k')
    manifest['sfx/' + name + '.ogg'] = {'sources': [dict(spec=s, **licence_of(s)) for s in dict.fromkeys(s for _, s in p)],
        'processing': f'excerpt, cross-faded, 2 s fade-out, normalised to {t} LUFS, stereo Ogg Vorbis 96k'}
    rows.append((name, len(a) / SR, stereo_lufs(a), peak_db(a), os.path.getsize(path)))
json.dump(manifest, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'manifest_music.json'), 'w'), indent=1)
for r in rows: print('%-12s %6.1fs lufs %6.1f peak %5.1f %8dB' % r)
print('total', sum(r[4] for r in rows))
