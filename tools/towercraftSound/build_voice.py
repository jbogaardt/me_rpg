"""Converts public/audio/voice/*.wav (ElevenLabs TTS, unchanged lines) to mono Ogg Vorbis 64 kbps, trimmed of silence and normalised to -20 LUFS (peak <= -3 dBFS).
Run: python3 -I build_voice.py SRC_DIR OUT_DIR"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from alib import SR, load, lufs, peak_db
import dsp
src, out = sys.argv[1:3]
before = []; after = []
for f in sorted(os.listdir(src)):
    if not f.endswith('.wav'): continue
    a = load(os.path.join(src, f)); before.append(lufs(a))
    a = dsp.fade(dsp.trim(a, -55, 20, 120), 0.005, 0.08)
    a = dsp.norm_lufs(a, -20.0, -3.0)
    dsp.write_ogg(a, os.path.join(out, f[:-4] + '.ogg'), br='64k'); after.append(lufs(a))
print('files', len(after), 'before LUFS min/med/max', min(before), np.median(before), max(before), 'after', min(after), np.median(after), max(after))
