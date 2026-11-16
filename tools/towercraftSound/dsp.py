"""Small DSP toolkit for the Towercraft sound build (numpy/scipy, mono float arrays at 44.1 kHz)."""
import numpy as np, subprocess, os, json
from scipy import signal
from alib import SR, load, peak, peak_db, lufs

def db(x): return 10 ** (x / 20)

def trim(a, thr=-48, head=4, tail=20):
    """Cut leading/trailing silence below thr dBFS (keeps `head` ms before the first sound and `tail` ms after the last)."""
    t = db(thr); idx = np.where(np.abs(a) > t)[0]
    if not len(idx): return a
    i0 = max(0, idx[0] - int(head * SR / 1000)); i1 = min(len(a), idx[-1] + int(tail * SR / 1000))
    return a[i0:i1]

def cut(a, start=0.0, end=None):
    i0 = int(start * SR); i1 = len(a) if end is None else int(end * SR)
    return a[i0:i1]

def fade(a, fin=0.003, fout=0.03):
    a = a.copy(); n = len(a)
    ni = min(n, int(fin * SR)); no = min(n, int(fout * SR))
    if ni: a[:ni] *= np.linspace(0, 1, ni)
    if no: a[n - no:] *= np.cos(np.linspace(0, np.pi / 2, no)) ** 2
    return a

def pitch(a, ratio):
    """Tape-style speed/pitch change by `ratio` (>1 higher and shorter)."""
    if abs(ratio - 1) < 1e-4: return a
    from fractions import Fraction
    f = Fraction(ratio).limit_denominator(200)
    return signal.resample_poly(a, f.denominator, f.numerator)

def semitones(a, st): return pitch(a, 2 ** (st / 12))

def sos(a, kind, hz, order=2):
    s = signal.butter(order, hz, btype=kind, fs=SR, output='sos')
    return signal.sosfilt(s, a)

def lp(a, hz, order=2): return sos(a, 'low', hz, order)
def hp(a, hz, order=2): return sos(a, 'high', hz, order)
def bp(a, lo, hi, order=2): return signal.sosfilt(signal.butter(order, [lo, hi], btype='band', fs=SR, output='sos'), a)

def peaking(a, hz, gain_db, q=1.0):
    """RBJ peaking EQ."""
    A = 10 ** (gain_db / 40); w0 = 2 * np.pi * hz / SR; al = np.sin(w0) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w0), 1 - al * A]; ax = [1 + al / A, -2 * np.cos(w0), 1 - al / A]
    return signal.lfilter(np.array(b) / ax[0], np.array(ax) / ax[0], a)

def shelf(a, hz, gain_db, high=True):
    A = 10 ** (gain_db / 40); w0 = 2 * np.pi * hz / SR; cs = np.cos(w0); al = np.sin(w0) / 2 * np.sqrt(2)
    sq = 2 * np.sqrt(A) * al
    if high:
        b = [A * ((A + 1) + (A - 1) * cs + sq), -2 * A * ((A - 1) + (A + 1) * cs), A * ((A + 1) + (A - 1) * cs - sq)]
        ax = [(A + 1) - (A - 1) * cs + sq, 2 * ((A - 1) - (A + 1) * cs), (A + 1) - (A - 1) * cs - sq]
    else:
        b = [A * ((A + 1) - (A - 1) * cs + sq), 2 * A * ((A - 1) - (A + 1) * cs), A * ((A + 1) - (A - 1) * cs - sq)]
        ax = [(A + 1) + (A - 1) * cs + sq, -2 * ((A - 1) + (A + 1) * cs), (A + 1) + (A - 1) * cs - sq]
    return signal.lfilter(np.array(b) / ax[0], np.array(ax) / ax[0], a)

def gain(a, g_db): return a * db(g_db)

def mix(*layers, pad=0.0):
    """layers: (array, gain_db, offset_s). Returns the sum (longest layer sets the length)."""
    n = max(int(o * SR) + len(x) for x, _, o in layers) + int(pad * SR)
    out = np.zeros(n)
    for x, g, o in layers:
        i = int(o * SR); out[i:i + len(x)] += x * db(g)
    return out

def reverb(a, rt=0.8, wet=0.25, pre=0.01, seed=1, damp=4500):
    """A cheap synthetic room: exponentially decaying filtered noise as the impulse response."""
    rng = np.random.default_rng(seed)
    n = int(rt * SR); t = np.arange(n) / SR
    ir = rng.standard_normal(n) * np.exp(-6.9 * t / rt)
    ir = lp(ir, damp, 1); ir[: int(pre * SR)] = 0
    ir /= np.sqrt(np.sum(ir ** 2))
    wetsig = signal.fftconvolve(a, ir)[: len(a) + n]
    out = np.zeros(len(a) + n); out[: len(a)] = a * (1 - wet * 0.5)
    out += wetsig * wet * 1.0
    return out

def softclip(a, drive=1.0): return np.tanh(a * drive) / np.tanh(drive)

def norm_peak(a, target_db=-3.0):
    p = peak(a); return a * (db(target_db) / p) if p > 0 else a

def norm_lufs(a, target=-18.0, ceiling_db=-1.0):
    l = lufs(a)
    if l < -90: return a
    g = target - l
    out = a * db(g)
    if peak(out) > db(ceiling_db): out = out * (db(ceiling_db) / peak(out))
    return out

def loop_xfade(a, fade_s=1.5):
    """Make a seamless loop: the last `fade_s` seconds are cross-faded into the first (equal power), the tail is cut off."""
    n = int(fade_s * SR)
    head, tail = a[:n].copy(), a[-n:].copy()
    t = np.linspace(0, np.pi / 2, n)
    if a.ndim == 2: t = t[:, None]
    blend = head * np.sin(t) + tail * np.cos(t)
    return np.concatenate([blend, a[n:-n]]) if a.ndim == 1 else np.concatenate([blend, a[n:-n]], axis=0)

def write_ogg(a, path, q=3, sr=SR, ch=1, br=None):
    """Encode float array (mono shape (n,), stereo (n,2)) to Ogg Vorbis via ffmpeg."""
    a = np.clip(a, -1, 1).astype('<f4')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    cmd = ['ffmpeg', '-y', '-v', 'error', '-f', 'f32le', '-ar', str(sr), '-ac', str(ch), '-i', '-', '-c:a', 'libvorbis']
    cmd += ['-b:a', br] if br else ['-q:a', str(q)]
    cmd += [path]
    subprocess.run(cmd, input=a.tobytes(), check=True)
