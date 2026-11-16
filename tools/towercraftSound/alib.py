"""Shared helpers for the sound build: decode, measure, process. Run with python3 -I from another dir or import via sys.path."""
import subprocess, numpy as np, pyloudnorm as pyln, os, sys
SR = 44100
def load(path, sr=SR, mono=True):
    cmd = ['ffmpeg','-v','error','-i',path,'-f','f32le','-acodec','pcm_f32le','-ar',str(sr),'-ac','1' if mono else '2','-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    a = np.frombuffer(raw, dtype='<f4').astype(np.float64)
    return a if mono else a.reshape(-1,2)
def peak(a): return float(np.max(np.abs(a))) if len(a) else 0.0
def peak_db(a): p=peak(a); return 20*np.log10(p) if p>0 else -120.0
def lufs(a, sr=SR):
    if len(a) < int(0.4*sr):
        a = np.concatenate([a, np.zeros(int(0.4*sr)-len(a)+1)])
    m = pyln.Meter(sr)
    try: return float(m.integrated_loudness(a))
    except Exception: return -99.0
def rms_db(a):
    r=np.sqrt(np.mean(a**2)) if len(a) else 0
    return 20*np.log10(r) if r>0 else -120
def centroid(a, sr=SR):
    if len(a)<64: return 0
    s=np.abs(np.fft.rfft(a*np.hanning(len(a))))
    f=np.fft.rfftfreq(len(a),1/sr)
    return float((s*f).sum()/max(s.sum(),1e-12))
def attack_ms(a, sr=SR):
    p=peak(a)
    if p==0: return 0
    return float(np.argmax(np.abs(a)>=0.9*p)*1000/sr)
def head_silence_ms(a, sr=SR, thr=-50):
    t=10**(thr/20)
    i=np.argmax(np.abs(a)>t)
    return float(i*1000/sr)
def tail_ms(a, sr=SR, thr=-45):
    t=10**(thr/20); idx=np.where(np.abs(a)>t)[0]
    return float((len(a)-1-idx[-1])*1000/sr) if len(idx) else 0
def dur(a, sr=SR): return len(a)/sr
