"""Sintesis musik latar & efek suara untuk iklan Cari Kecamatan (bebas hak cipta, dibuat dari nol).

Pemakaian: python3 scripts/make_audio.py public/audio
Musik 120 BPM (1 ketukan = 0,5 dtk = 15 frame @30 fps) agar pergantian adegan jatuh di ketukan.
"""
import sys, os, wave
import numpy as np

SR = 44100
OUT = sys.argv[1] if len(sys.argv) > 1 else 'public/audio'
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(20261101)
BEAT = 0.5
DUR = 35.0  # 27,5 dtk: hentakan akhir; sisanya ekor lembut untuk layar akhir

def t_arr(sec): return np.arange(int(sec * SR)) / SR
def midi(n): return 440.0 * 2 ** ((n - 69) / 12)
def save(name, x, stereo=None):
    if stereo is None: stereo = np.stack([x, x], axis=1) if x.ndim == 1 else x
    peak = np.max(np.abs(stereo)) or 1
    if peak > 0.98: stereo = stereo / peak * 0.98
    data = (stereo * 32767).astype('<i2')
    with wave.open(os.path.join(OUT, name), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(data.tobytes())

def soft_saw(f, t, harm=10, tilt=1.6):
    y = np.zeros_like(t)
    for k in range(1, harm + 1):
        if f * k > 9000: break
        y += np.sin(2 * np.pi * f * k * t) / k ** tilt
    return y

def onepole_lp(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR); y = np.empty_like(x); acc = 0.0
    for i in range(len(x)):  # cukup cepat untuk potongan pendek
        acc = (1 - a) * x[i] + a * acc; y[i] = acc
    return y

def reverb(x, sec=1.6, mix=0.25, pre=0.02):
    n = int(sec * SR); ir = rng.standard_normal(n) * np.exp(-np.linspace(0, 7, n))
    ir[: int(pre * SR)] = 0; ir /= np.sqrt(np.sum(ir ** 2))
    L = len(x) + n; N = 1 << (L - 1).bit_length()
    wet = np.fft.irfft(np.fft.rfft(x, N) * np.fft.rfft(ir, N), N)[: len(x)]
    return (1 - mix) * x + mix * wet * 0.6

def place(buf, sig, at, gain=1.0):
    i = int(at * SR); j = min(len(buf), i + len(sig))
    if i < len(buf): buf[i:j] += sig[: j - i] * gain

# ------------------------------------------------------------------ musik
N = int(DUR * SR); t = t_arr(DUR)
pad = np.zeros(N); pluck = np.zeros(N); bass = np.zeros(N); drums = np.zeros(N); fx = np.zeros(N)

# Akor (MIDI): D maj9, Bm7, Gmaj7(add9), A6sus → D
CH = {
    'D':  [50, 57, 61, 64, 66],
    'Bm': [47, 54, 57, 62, 66],
    'G':  [43, 50, 54, 57, 62],
    'A':  [45, 52, 57, 61, 64],
}
PROG = [(0, 'D'), (4, 'Bm'), (8, 'G'), (12, 'A'), (16, 'D'), (20, 'Bm'), (24, 'G'), (27.5, 'D')]
ends = [p[0] for p in PROG[1:]] + [DUR]

for (start, name), end in zip(PROG, ends):
    seg = t_arr(end - start + 1.2)  # ekor menumpuk ke akor berikut
    env = np.minimum(1, seg / 0.45) * np.clip((end - start + 1.2 - seg) / 1.2, 0, 1)
    if name == 'D' and start == 27.5:
        env = np.minimum(1, seg / 0.02) * (0.35 + 0.65 * np.exp(-seg / 1.2)) * np.clip((end - start + 1.2 - seg) / 1.2, 0, 1)
    for n in CH[name]:
        f = midi(n + 12)
        v = (soft_saw(f * 0.997, seg, 8) + soft_saw(f * 1.003, seg, 8)) * 0.5
        place(pad, v * env, start, 0.05)
    # bass: akar per ketukan (mulai saat logo, 7 dtk)
    root = midi(CH[name][0] - 12 if CH[name][0] > 45 else CH[name][0])
    b = start
    while b < end - 1e-6:
        if b >= 7.0:
            bt = t_arr(BEAT); be = np.exp(-bt / 0.32) * np.minimum(1, bt / 0.005)
            place(bass, (np.sin(2 * np.pi * root * bt) + 0.25 * np.sin(4 * np.pi * root * bt)) * be, b, 0.22)
        b += BEAT

# arpeggio pluck seperdelapan ketukan, mulai 3 dtk (masalah) — makin ramai setelah 7 dtk
step = BEAT / 2; k = 0; s = 3.0
while s < 27.5 - 1e-6:
    name = [p[1] for p in PROG if p[0] <= s][-1]
    notes = CH[name][1:] + [CH[name][1] + 12]
    n = notes[k % len(notes)] + 12
    pt = t_arr(0.6); pe = np.exp(-pt / 0.18) * np.minimum(1, pt / 0.003)
    sig = (soft_saw(midi(n), pt, 6, 2.2)) * pe
    place(pluck, sig, s, 0.05 if s < 7 else 0.07)
    k += 1; s += step

# ekor layar akhir: arpeggio pelan seperempat ketukan, 28,5–33,5 dtk
s = 28.5; k = 0
while s < 33.5:
    notes = CH['D'][1:] + [CH['D'][1] + 12]
    pt = t_arr(1.0); pe = np.exp(-pt / 0.35) * np.minimum(1, pt / 0.004)
    place(pluck, soft_saw(midi(notes[k % len(notes)] + 12), pt, 6, 2.2) * pe, s, 0.035)
    k += 1; s += BEAT

# drum (mulai 7 dtk), jeda tipis 25–25,5 dtk sebelum chip
def kick():
    kt = t_arr(0.35); f = 45 + 75 * np.exp(-kt / 0.04)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-kt / 0.18)
def hat(l=0.05):
    ht = t_arr(l); nz = rng.standard_normal(len(ht)); nz = np.diff(np.concatenate([[0], nz]))
    return nz * np.exp(-ht / (l / 4))
def clap():
    ct = t_arr(0.25); nz = rng.standard_normal(len(ct)); nz = np.diff(np.concatenate([[0], nz]))
    return nz * np.exp(-ct / 0.06) * 0.6
b = 7.0
while b < 27.5 - 1e-6:
    beat_i = int(round((b - 7.0) / BEAT))
    place(drums, kick(), b, 0.55)
    place(drums, hat(), b + BEAT / 2, 0.06)
    if beat_i % 2 == 1 and b >= 15.0: place(drums, clap(), b, 0.10)
    b += BEAT
place(drums, kick(), 27.5, 0.7)

# riser sebelum logo (5,5–7 dtk) & dampak saat logo muncul
rt = t_arr(1.5); nz = rng.standard_normal(len(rt))
riser = np.diff(np.concatenate([[0], nz])) * (rt / 1.5) ** 2.2
place(fx, riser, 5.5, 0.12)
it = t_arr(2.2)
impact = np.sin(2 * np.pi * 50 * it) * np.exp(-it / 0.7) * 0.9
for f, g in [(1760, .25), (2637, .18), (3520, .12)]:
    impact += np.sin(2 * np.pi * f * it) * np.exp(-it / 0.9) * g * 0.35
place(fx, impact, 7.0, 0.35)

music = pad + pluck + bass + drums + fx
music = reverb(music, 1.8, 0.22)
# fade akhir 28,8–30 dtk
fade = np.ones(N); i0 = int(32.0 * SR); fade[i0:] = np.linspace(1, 0, N - i0) ** 1.5
music *= fade
music /= np.max(np.abs(music)); music *= 0.8
# stereo lebar tipis: pluck sedikit ke kanan
left = music - 0.15 * reverb(pluck, 1.2, 1.0) * fade; right = music + 0.15 * reverb(pluck, 1.2, 1.0) * fade
save('music.wav', None, np.stack([left, right], axis=1) * 0.85)

# ------------------------------------------------------------------ efek suara
def key(seed):
    r = np.random.default_rng(seed); kt = t_arr(0.06)
    nz = r.standard_normal(len(kt)); nz = np.diff(np.concatenate([[0], nz]))
    body = np.sin(2 * np.pi * r.uniform(1800, 2600) * kt) * 0.4
    return (nz * 0.6 + body) * np.exp(-kt / 0.012) * 0.5
for i in range(3): save(f'key{i + 1}.wav', key(100 + i))

pt = t_arr(0.18); f = 520 + 600 * np.exp(-pt / 0.03)
save('pop.wav', np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-pt / 0.05) * 0.6)

tt = t_arr(0.35); tick = np.zeros(len(tt))
for d, fr in [(0, 2093), (0.07, 3136)]:
    seg = t_arr(0.2); place(tick, np.sin(2 * np.pi * fr * seg) * np.exp(-seg / 0.05) * 0.45, d)
save('tick.wav', tick)

wt = t_arr(0.6); nz = rng.standard_normal(len(wt))
sweep = np.sin(np.pi * wt / 0.6) ** 2
whoosh = onepole_lp(nz, 900) * sweep * 1.4
save('whoosh.wav', whoosh)

ct = t_arr(1.6); chime = np.zeros(len(ct))
for d, n in [(0, 74), (0.08, 78), (0.16, 81), (0.24, 86)]:
    seg = t_arr(1.3); place(chime, (np.sin(2 * np.pi * midi(n) * seg) + 0.3 * np.sin(4 * np.pi * midi(n) * seg)) * np.exp(-seg / 0.5) * 0.25, d)
save('chime.wav', reverb(chime, 1.4, 0.35))

lt = t_arr(0.15); f = 900 + 900 * np.exp(-lt / 0.02)
save('plip.wav', np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-lt / 0.04) * 0.4)

kt = t_arr(0.08); nz = rng.standard_normal(len(kt))
save('click.wav', (np.diff(np.concatenate([[0], nz])) * 0.5 + np.sin(2 * np.pi * 1200 * kt)) * np.exp(-kt / 0.01) * 0.5)
print('audio selesai:', sorted(os.listdir(OUT)))
