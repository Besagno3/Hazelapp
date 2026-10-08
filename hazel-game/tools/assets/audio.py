"""
16-bit style audio: a tiny chiptune synth (pulse / triangle / noise voices,
ADSR envelopes, SNES-flavoured echo) that renders every SFX and a looping
music track for each screen, encoded to MP3 (mono, 32 kHz — the SNES rate).

Music is composed procedurally but deterministically: each track declares a
tempo, a chord progression and a style; the melody is a seeded walk over chord
tones with a repeated motif (A A' B A' phrasing), so re-running the build
produces byte-identical tunes.
"""
from __future__ import annotations

import random
from pathlib import Path

import lameenc
import numpy as np

SR = 32000

# ─── Voices ──────────────────────────────────────────────────────────────────

NOTE_IDX = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6,
            'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def midi(name: str) -> int:
    pitch, octave = name[:-1], int(name[-1])
    return 12 * (octave + 1) + NOTE_IDX[pitch]


def hz(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def env(n: int, a=0.005, d=0.05, s=0.6, r=0.05) -> np.ndarray:
    e = np.full(n, s, dtype=np.float64)
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    na = min(na, n)
    e[:na] = np.linspace(0, 1, na, endpoint=False) if na else e[:na]
    nd2 = min(nd, n - na)
    if nd2 > 0:
        e[na:na + nd2] = np.linspace(1, s, nd2, endpoint=False)
    nr = min(nr, n)
    if nr:
        e[n - nr:] *= np.linspace(1, 0, nr)
    return e


def pulse(freq, dur, duty=0.5, vib=0.0, slide=0.0) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = freq * (1 + slide * t / max(dur, 1e-6))
    if vib:
        f = f * (1 + vib * np.sin(2 * np.pi * 5.5 * t) * np.clip(t * 4, 0, 1))
    ph = np.cumsum(f) / SR
    return np.where((ph % 1.0) < duty, 1.0, -1.0)


def tri(freq, dur, slide=0.0) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = freq * (1 + slide * t / max(dur, 1e-6))
    ph = np.cumsum(f) / SR
    x = 4 * np.abs((ph % 1.0) - 0.5) - 1
    return np.round(x * 8) / 8  # 4-bit stepped triangle, NES/SNES grit


def noise(dur, pitch=1.0, seed=1) -> np.ndarray:
    n = int(dur * SR)
    rng = np.random.default_rng(seed)
    hold = max(1, int(8 / pitch))
    base = rng.choice([-1.0, 1.0], size=n // hold + 1)
    return np.repeat(base, hold)[:n]


def mixin(buf: np.ndarray, sig: np.ndarray, at: float, gain=1.0):
    i = int(at * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i] * gain


def echo(buf: np.ndarray, delay=0.16, fb=0.32, wet=0.28, wrap=False) -> np.ndarray:
    d = int(delay * SR)
    out = buf.copy()
    tail = np.zeros(len(buf) + d * 8)
    tail[: len(buf)] = buf
    acc = np.zeros_like(tail)
    for k in range(1, 8):
        g = wet * fb ** (k - 1)
        acc[d * k: d * k + len(buf)] += buf * g
    if wrap:  # fold the echo tail back to the start so loops are seamless
        spill = acc[len(buf):]
        acc = acc[: len(buf)].copy()
        acc[: len(spill)] += spill[: len(buf)]
        return out + acc
    return np.concatenate([out, np.zeros(d * 8)]) + acc


def lowpass(x: np.ndarray, alpha=0.35) -> np.ndarray:
    """One-pole smoothing — takes the fizz off raw square waves."""
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += alpha * (x[i] - acc)
        y[i] = acc
    return y


def encode(x: np.ndarray, path: Path, kbps=96, peak: float | None = 0.89, gain=0.75):
    """peak=None keeps relative loudness (fixed gain + clip) — used for SFX."""
    if peak is None:
        y = np.clip(x * gain, -1, 1)
    else:
        y = x / (np.max(np.abs(x)) or 1.0) * peak
    pcm = (y * 32767).astype(np.int16)
    enc = lameenc.Encoder()
    enc.set_bit_rate(kbps)
    enc.set_in_sample_rate(SR)
    enc.set_channels(1)
    enc.set_quality(2)
    data = enc.encode(pcm.tobytes()) + enc.flush()
    path.write_bytes(data)


# ─── SFX ─────────────────────────────────────────────────────────────────────


def _seq(notes, step, voice='pulse', duty=0.5, gain=0.5, length=None, a=0.002, d=0.04, s=0.7, r=0.04):
    total = length or step * len(notes) + 0.3
    buf = np.zeros(int(total * SR))
    for i, nm in enumerate(notes):
        if nm is None:
            continue
        dur = step * (1.6 if i == len(notes) - 1 else 1.0)
        f = hz(midi(nm))
        sig = pulse(f, dur, duty) if voice == 'pulse' else tri(f, dur)
        mixin(buf, sig * env(len(sig), a, d, s, r), i * step, gain)
    return buf


def sfx_bank() -> dict[str, np.ndarray]:
    out = {}
    # correct: bright rising arpeggio
    b = _seq(['C6', 'E6', 'G6', 'C7'], 0.055, duty=0.25, gain=0.45, length=0.5)
    b += _seq(['C5', 'E5', 'G5', 'C6'], 0.055, voice='tri', gain=0.35, length=0.5)
    out['correct'] = echo(b, 0.09, 0.3, 0.25)
    # wrong: descending buzzy "bwomp"
    n = int(0.42 * SR)
    b = np.zeros(n)
    s1 = pulse(hz(midi('E4')), 0.16, 0.5, slide=-0.08)
    s2 = pulse(hz(midi('A#3')), 0.26, 0.5, vib=0.03, slide=-0.12)
    mixin(b, s1 * env(len(s1), 0.002, 0.02, 0.8, 0.03), 0, 0.45)
    mixin(b, s2 * env(len(s2), 0.002, 0.05, 0.7, 0.1), 0.15, 0.45)
    out['wrong'] = lowpass(b, 0.4)
    # attack: noise swoosh + low punch
    sw = noise(0.2, 3.0, 3) * np.linspace(0.1, 1, int(0.2 * SR)) ** 2 * env(int(0.2 * SR), 0.001, 0.02, 0.9, 0.05)
    pu = tri(hz(midi('C3')), 0.14, slide=-0.6) * env(int(0.14 * SR), 0.001, 0.03, 0.6, 0.05)
    b = np.zeros(int(0.4 * SR))
    mixin(b, lowpass(sw, 0.5), 0, 0.5)
    mixin(b, pu, 0.16, 0.8)
    out['attack'] = b
    # hit: crunchy noise burst + dropping pulse
    n1 = noise(0.12, 1.2, 5) * env(int(0.12 * SR), 0.001, 0.03, 0.5, 0.06)
    p1 = pulse(hz(midi('G3')), 0.18, 0.125, slide=-0.5) * env(int(0.18 * SR), 0.001, 0.03, 0.5, 0.08)
    b = np.zeros(int(0.3 * SR))
    mixin(b, n1, 0, 0.6)
    mixin(b, p1, 0, 0.45)
    out['hit'] = b
    # gate: low rumble rising into a chime
    rum = noise(0.35, 0.25, 7) * env(int(0.35 * SR), 0.05, 0.1, 0.6, 0.15)
    b = np.zeros(int(0.9 * SR))
    mixin(b, lowpass(rum, 0.15), 0, 0.6)
    mixin(b, _seq(['G5', 'D6', 'G6'], 0.08, duty=0.25, gain=0.4, length=0.5), 0.3)
    out['gate'] = echo(b, 0.12, 0.3, 0.3)
    # chest: classic "item get" da-da-da-DAAA
    b = _seq(['A5', 'B5', 'C#6', 'E6'], 0.09, duty=0.25, gain=0.42, length=0.8, s=0.8)
    b += _seq(['A4', 'B4', 'C#5', 'A5'], 0.09, voice='tri', gain=0.4, length=0.8)
    out['chest'] = echo(b, 0.11, 0.3, 0.25)
    # levelup: fanfare arpeggio up two octaves
    notes = ['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7']
    b = _seq(notes, 0.06, duty=0.5, gain=0.35, length=1.2, s=0.75)
    b += _seq(['C4', None, 'G4', None, 'C5', None, 'C5'], 0.06, voice='tri', gain=0.45, length=1.2)
    mixin(b, _seq(['C6', 'G6', 'C7'], 0.001, duty=0.25, gain=0.25, length=0.8, s=0.5, r=0.4), 0.42)
    out['levelup'] = echo(b, 0.13, 0.35, 0.3)
    # victory: short fanfare jingle (~2.3s)
    step = 0.13
    mel = ['C5', 'C5', 'C5', 'C5', None, 'Ab4', None, 'Bb4', None, 'C5', None, 'Bb4', 'C5']
    durs = [1, 1, 1, 3, 0, 3, 0, 3, 0, 2, 0, 1, 6]
    b = np.zeros(int(2.6 * SR))
    t = 0.0
    for nm, du in zip(mel, durs):
        if nm:
            dur = du * step * 0.92
            sig = pulse(hz(midi(nm) + 12), dur, 0.5, vib=0.006)
            mixin(b, sig * env(len(sig), 0.003, 0.05, 0.75, 0.05), t, 0.33)
            sig2 = pulse(hz(midi(nm) + 5), dur, 0.25)
            mixin(b, sig2 * env(len(sig2), 0.003, 0.05, 0.6, 0.05), t, 0.18)
        t += du * step
    for nm, at, du in (('C3', 0, 0.5), ('Ab2', 0.52, 0.39), ('Bb2', 0.91, 0.39), ('C3', 1.3, 0.9)):
        sig = tri(hz(midi(nm)), du)
        mixin(b, sig * env(len(sig), 0.003, 0.05, 0.8, 0.05), at, 0.55)
    out['victory'] = echo(b, 0.15, 0.3, 0.25)
    # select: short UI blip
    b = _seq(['E6', 'B6'], 0.035, duty=0.25, gain=0.4, length=0.14)
    out['select'] = b

    # ── Battle: spells, defending, damage, companion ──
    # impact: an enemy takes damage — a meaty thud with a crunchy transient
    th = tri(hz(midi('A2')), 0.16, slide=-0.5) * env(int(0.16 * SR), 0.001, 0.04, 0.5, 0.07)
    cr = noise(0.07, 2.0, 11) * env(int(0.07 * SR), 0.001, 0.02, 0.4, 0.03)
    b = np.zeros(int(0.26 * SR))
    mixin(b, th, 0, 0.85)
    mixin(b, cr, 0, 0.5)
    out['impact'] = b
    # enemyAttack: a lower, growlier swoosh than the hero's (the enemy lunging)
    sw = noise(0.22, 1.4, 13) * np.linspace(0.15, 1, int(0.22 * SR)) ** 1.5 * env(int(0.22 * SR), 0.001, 0.02, 0.9, 0.06)
    gr = pulse(hz(midi('D3')), 0.2, 0.125, vib=0.08, slide=-0.3) * env(int(0.2 * SR), 0.01, 0.05, 0.6, 0.06)
    b = np.zeros(int(0.34 * SR))
    mixin(b, lowpass(sw, 0.3), 0, 0.5)
    mixin(b, lowpass(gr, 0.45), 0.04, 0.35)
    out['enemyAttack'] = b
    # spell: sparkling rising shimmer (a spell is cast)
    b = np.zeros(int(0.7 * SR))
    for i, nm in enumerate(['E5', 'G#5', 'B5', 'E6', 'G#6', 'B6', 'E7']):
        s1 = pulse(hz(midi(nm)), 0.1, 0.125, vib=0.02)
        mixin(b, s1 * env(len(s1), 0.002, 0.03, 0.5, 0.05), i * 0.035, 0.3)
    swell = tri(hz(midi('E4')), 0.4, slide=1.0) * env(int(0.4 * SR), 0.05, 0.1, 0.6, 0.15)
    mixin(b, swell, 0, 0.35)
    out['spell'] = echo(b, 0.07, 0.4, 0.35)
    # heal: soft, gentle major chime (Mend, potions, a healer enemy mending)
    b = _seq(['G5', 'C6', 'E6', 'G6'], 0.08, voice='tri', gain=0.5, length=0.8, a=0.01, s=0.6, r=0.2)
    b += _seq(['C6', 'E6', 'G6', 'C7'], 0.08, duty=0.125, gain=0.18, length=0.8, a=0.01, s=0.5, r=0.2)
    out['heal'] = echo(b, 0.12, 0.35, 0.3)
    # guard: raising a shield — a metallic "shing" (two detuned high pulses)
    b = np.zeros(int(0.5 * SR))
    for f, g in ((hz(midi('A6')), 0.3), (hz(midi('A6')) * 1.013, 0.3), (hz(midi('E7')), 0.15)):
        s1 = pulse(f, 0.35, 0.25, slide=0.02)
        mixin(b, s1 * env(len(s1), 0.001, 0.05, 0.35, 0.25), 0, g)
    tk = noise(0.03, 4.0, 17) * env(int(0.03 * SR), 0.001, 0.01, 0.3, 0.01)
    mixin(b, tk, 0, 0.4)
    out['guard'] = echo(b, 0.08, 0.3, 0.25)
    # block: an attack bounces off the shield — a hard "clang"
    b = np.zeros(int(0.4 * SR))
    for nm, g in (('C6', 0.3), ('F#6', 0.25), ('C7', 0.15)):
        s1 = pulse(hz(midi(nm)), 0.28, 0.5) * env(int(0.28 * SR), 0.001, 0.03, 0.25, 0.2)
        mixin(b, s1, 0, g)
    ns = noise(0.05, 3.0, 19) * env(int(0.05 * SR), 0.001, 0.01, 0.4, 0.03)
    mixin(b, ns, 0, 0.5)
    out['block'] = lowpass(b, 0.55)
    # shatter: an enemy's stony shield breaks — crunch + falling glassy shards
    b = np.zeros(int(0.7 * SR))
    mixin(b, noise(0.18, 2.5, 23) * env(int(0.18 * SR), 0.001, 0.05, 0.4, 0.1), 0, 0.55)
    for i, nm in enumerate(['B6', 'F6', 'D6', 'G#5', 'E5']):
        s1 = pulse(hz(midi(nm)), 0.06, 0.25)
        mixin(b, s1 * env(len(s1), 0.001, 0.02, 0.5, 0.03), 0.06 + i * 0.05, 0.25)
    out['shatter'] = echo(b, 0.06, 0.3, 0.2)
    # roar: Ember's attack — a rising, gravelly dragon roar into a fire whoosh
    rr = pulse(hz(midi('G2')), 0.35, 0.3, vib=0.12, slide=0.5) * env(int(0.35 * SR), 0.02, 0.08, 0.7, 0.1)
    fw = noise(0.3, 2.0, 29) * env(int(0.3 * SR), 0.05, 0.08, 0.7, 0.12)
    b = np.zeros(int(0.6 * SR))
    mixin(b, lowpass(rr, 0.35), 0, 0.55)
    mixin(b, lowpass(fw, 0.4), 0.18, 0.5)
    out['roar'] = b
    # pair: a Pair Attack — roar + rising power-up arpeggio + big double impact
    b = np.zeros(int(1.3 * SR))
    mixin(b, out['roar'], 0, 0.7)
    mixin(b, _seq(['C5', 'G5', 'C6', 'E6', 'G6', 'C7'], 0.045, duty=0.25, gain=0.3, length=0.5), 0.1)
    mixin(b, out['impact'], 0.45, 0.8)
    mixin(b, out['impact'], 0.58, 0.7)
    mixin(b, _seq(['C4', 'G4', 'C5'], 0.001, voice='tri', gain=0.3, length=0.6, s=0.6, r=0.4), 0.45)
    out['pair'] = echo(b, 0.12, 0.3, 0.25)
    # swap: a companion tags in — a quick "poof" + bright two-note hop
    b = np.zeros(int(0.45 * SR))
    mixin(b, lowpass(noise(0.12, 2.2, 31) * env(int(0.12 * SR), 0.005, 0.03, 0.5, 0.06), 0.45), 0, 0.4)
    mixin(b, _seq(['G5', 'D6'], 0.07, duty=0.25, gain=0.35, length=0.3), 0.06)
    out['swap'] = echo(b, 0.08, 0.25, 0.2)
    # charge: an enemy gathers power — a low rising, wobbling hum (a warning)
    n = 0.8
    hum = pulse(hz(midi('A2')), n, 0.3, vib=0.06, slide=1.0) * env(int(n * SR), 0.1, 0.1, 0.8, 0.12)
    rum = noise(n, 0.4, 37) * np.linspace(0.2, 1, int(n * SR)) * env(int(n * SR), 0.1, 0.1, 0.7, 0.12)
    b = np.zeros(int(0.95 * SR))
    mixin(b, lowpass(hum, 0.3), 0, 0.5)
    mixin(b, lowpass(rum, 0.2), 0, 0.3)
    out['charge'] = b
    # streak: answers in a row — a sparkly rising triple chime
    b = _seq(['E6', 'G#6', 'B6'], 0.06, duty=0.125, gain=0.35, length=0.45)
    b += _seq(['E5', 'G#5', 'B5'], 0.06, voice='tri', gain=0.3, length=0.45)
    out['streak'] = echo(b, 0.07, 0.35, 0.3)
    return out


# ─── Music ───────────────────────────────────────────────────────────────────

CHORD_Q = {'': (0, 4, 7), 'm': (0, 3, 7), '7': (0, 4, 7, 10), 'm7': (0, 3, 7, 10), 'dim': (0, 3, 6)}


def chord_notes(ch: str):
    root = ch[:2] if len(ch) > 1 and ch[1] in '#b' else ch[:1]
    q = ch[len(root):]
    r = NOTE_IDX[root]
    return r, [(r + i) % 12 for i in CHORD_Q[q]]


MAJOR = (0, 2, 4, 5, 7, 9, 11)
MINOR = (0, 2, 3, 5, 7, 8, 10)

TRACKS = {
    'title': dict(bpm=96, key='C', scale=MAJOR, chords='C G Am F C G F G', style='gentle', seed=11, oct=5),
    'overworld': dict(bpm=124, key='D', scale=MAJOR, chords='D A Bm G D A G A  G A D Bm G A D A', style='march',
                      seed=23, oct=5),
    'battle': dict(bpm=152, key='A', scale=MINOR, chords='Am F G E Am F G E  F G Am Am F G E E', style='drive',
                   seed=37, oct=5),
    'boss': dict(bpm=164, key='D', scale=MINOR, chords='Dm Bb C A Dm Bb C A  Gm Bb A A Gm Bb A A', style='heavy',
                 seed=41, oct=5),
    'spire': dict(bpm=84, key='E', scale=MINOR, chords='Em C Am B Em C Am B', style='mystic', seed=53, oct=5),
    'finalBoss': dict(bpm=172, key='C', scale=MINOR, chords='Cm Ab Bb G Cm Ab Bb G  Fm Ab G G Fm Db G G',
                      style='heavy', seed=61, oct=5),
    'victory': dict(bpm=126, key='C', scale=MAJOR, chords='C F G C Am F G C', style='march', seed=71, oct=5),
    # Overworld places (#75 Phase 1): a cosy town, an echoing cave, a still shrine.
    'town': dict(bpm=104, key='F', scale=MAJOR, chords='F C Dm Bb F C Bb C  Dm Bb F C Bb C F F', style='gentle',
                 seed=83, oct=5),
    'cave': dict(bpm=72, key='D', scale=MINOR, chords='Dm Bb Gm A Dm Bb C A', style='mystic', seed=89, oct=4),
    'shrine': dict(bpm=66, key='G', scale=MAJOR, chords='G Em C D G Em Am D', style='mystic', seed=97, oct=5),
}

RHYTHMS = {  # one-bar melody rhythms, in 8th notes (sum = 8)
    'gentle': [(2, 1, 1, 2, 2), (3, 1, 2, 2), (2, 2, 4)],
    'march': [(1, 1, 2, 1, 1, 2), (2, 1, 1, 2, 2), (1, 1, 1, 1, 4)],
    'drive': [(1, 1, 1, 1, 2, 2), (2, 1, 1, 1, 1, 2), (1, 1, 2, 1, 1, 2)],
    'heavy': [(1, 1, 1, 1, 1, 1, 2), (2, 1, 1, 2, 1, 1), (1, 1, 2, 2, 2)],
    'mystic': [(3, 1, 4), (2, 2, 2, 2), (4, 2, 2)],
}


def compose(spec):
    rnd = random.Random(spec['seed'])
    chords = spec['chords'].split()
    beat = 60 / spec['bpm']
    bar = beat * 4
    e8 = beat / 2
    key = NOTE_IDX[spec['key']]
    scale = [(key + s) % 12 for s in spec['scale']]
    base_oct = 12 * (spec['oct'] + 1)
    total = bar * len(chords)
    lead = np.zeros(int(total * SR) + SR)
    harm = np.zeros_like(lead)
    bass = np.zeros_like(lead)
    drums = np.zeros_like(lead)
    style = spec['style']

    # --- melody: motif per 4-bar phrase, varied on repeat
    motifs = [rnd.choice(RHYTHMS[style]) for _ in range(3)]
    prev = base_oct + key + 7
    phrase_notes = {}
    for bi, ch in enumerate(chords):
        root, tones = chord_notes(ch)
        pos_in_phrase = bi % 4
        rhythm = motifs[0] if pos_in_phrase in (0, 2) else motifs[1 if pos_in_phrase == 1 else 2]
        repeat_of = bi - 8 if bi >= 8 and (bi % 16) < 12 else None
        t = bi * bar
        seq = []
        for k, length in enumerate(rhythm):
            last = (bi == len(chords) - 1 or pos_in_phrase == 3) and k == len(rhythm) - 1
            if repeat_of is not None and (repeat_of, k) in phrase_notes and rnd.random() < 0.75:
                m = phrase_notes[(repeat_of, k)]
            else:
                strong = k == 0 or length >= 2
                pool = tones if strong or rnd.random() < 0.6 else scale
                cands = [base_oct - 12 + p + o for p in pool for o in (0, 12, 24)]
                cands = [c for c in cands if base_oct - 5 <= c <= base_oct + 16]
                cands.sort(key=lambda c: abs(c - prev) + rnd.random() * 3.5)
                m = cands[0] if abs(cands[0] - prev) > 0 or rnd.random() < 0.3 else cands[1]
                if last:
                    m = min((base_oct + root + o for o in (-12, 0, 12)), key=lambda c: abs(c - prev))
            phrase_notes[(bi, k)] = m
            prev = m
            seq.append((m, length))
        for m, length in seq:
            dur = length * e8 * 0.9
            duty = 0.25 if style in ('drive', 'heavy') else 0.5
            sig = pulse(hz(m), dur, duty, vib=0.005 if length >= 2 else 0)
            mixin(lead, sig * env(len(sig), 0.004, 0.06, 0.7, 0.04), t, 0.28)
            t += length * e8

        # --- harmony: arpeggio (driving) or sustained pad (gentle/mystic)
        ht = bi * bar
        if style in ('gentle', 'mystic'):
            for j, p in enumerate(tones[:3]):
                sig = pulse(hz(base_oct - 12 + p), bar * 0.95, 0.125)
                mixin(harm, sig * env(len(sig), 0.08, 0.2, 0.45, 0.2), ht + j * 0.01, 0.09)
            if style == 'mystic':
                for s16 in range(8):
                    p = tones[s16 % len(tones)] + (12 if s16 >= 4 else 0)
                    sig = pulse(hz(base_oct + p), e8 * 0.8, 0.25)
                    mixin(harm, sig * env(len(sig), 0.002, 0.05, 0.3, 0.05), ht + s16 * e8, 0.07)
        else:
            s16 = beat / 4
            for k in range(16):
                p = tones[k % len(tones)] + 12 * ((k // len(tones)) % 2)
                sig = pulse(hz(base_oct - 12 + p), s16 * 0.8, 0.125)
                mixin(harm, sig * env(len(sig), 0.001, 0.03, 0.4, 0.02), ht + k * s16, 0.085)

        # --- bass (stepped triangle)
        broot = 12 * 3 + root
        if style in ('gentle', 'mystic'):
            pat = [(0, 2), (7, 2)] if style == 'gentle' else [(0, 4)]
        elif style == 'march':
            pat = [(0, 1), (7, 1), (12, 1), (7, 1)]
        else:
            pat = [(0, 0.5)] * 8
        bt = ht
        for iv, beats in pat:
            dur = beats * beat * 0.9
            sig = tri(hz(broot + iv), dur)
            mixin(bass, sig * env(len(sig), 0.003, 0.05, 0.85, 0.03), bt, 0.55)
            bt += beats * beat

        # --- drums (noise kick/snare/hat)
        if style != 'mystic':
            for k in range(8):
                dt = ht + k * e8
                if style == 'gentle':
                    if k in (0, 4):
                        kick = tri(110, 0.1, slide=-0.7)
                        mixin(drums, kick * env(len(kick), 0.001, 0.03, 0.4, 0.04), dt, 0.45)
                    if k % 2 == 1:
                        h = noise(0.03, 4, k) * env(int(0.03 * SR), 0.001, 0.01, 0.3, 0.01)
                        mixin(drums, h, dt, 0.08)
                    continue
                if k in (0, 4) or (style in ('drive', 'heavy') and k in (3, 7) and rnd.random() < 0.5):
                    kick = tri(120, 0.11, slide=-0.75)
                    mixin(drums, kick * env(len(kick), 0.001, 0.03, 0.5, 0.05), dt, 0.6)
                if k in (2, 6):
                    sn = noise(0.12, 1.5, 100 + k) * env(int(0.12 * SR), 0.001, 0.04, 0.35, 0.05)
                    mixin(drums, sn, dt, 0.28)
                h = noise(0.03, 4, 200 + k) * env(int(0.03 * SR), 0.001, 0.01, 0.3, 0.01)
                mixin(drums, h, dt, 0.07 if k % 2 == 0 else 0.1)

    n = int(total * SR)
    melodic = lowpass(lead[:n] + harm[:n], 0.55)
    wet = echo(melodic, delay=beat * 0.75, fb=0.3, wet=0.22, wrap=True)
    return wet + lowpass(bass[:n], 0.6) + drums[:n]


# ─── Spooky Spire music (#74) ────────────────────────────────────────────────
# A separate composer for the Crystal Spire: slow minor progressions, a
# detuned organ drone, a music-box melody with long echo, a heartbeat bass,
# tritone bell tolls — plus one flavour per floor (ticking clocks, wind,
# glittering stars, clanking gears). Seeded, so rebuilds are byte-identical.

SPOOKY = {
    # the Spire's entrance / intro and Umbra's throne hall
    'spire': dict(bpm=66, key='D', chords='Dm Bb Gm A7 Dm Bb Edim A7', seed=81, flavour='bells'),
    'spireArchive': dict(bpm=72, key='E', chords='Em C Am B7 Em C F#dim B7', seed=83, flavour='clock'),
    'spireThicket': dict(bpm=62, key='G', chords='Gm Eb Cm D7 Gm Eb Adim D7', seed=87, flavour='wind'),
    'spireStars': dict(bpm=58, key='B', chords='Bm G Em F#7 Bm G C#dim F#7', seed=89, flavour='stars'),
    'spireEngine': dict(bpm=84, key='C', chords='Cm Ab Fm G7 Cm Ab Ddim G7', seed=91, flavour='gears'),
}


def compose_spooky(spec):
    rnd = random.Random(spec['seed'])
    chords = spec['chords'].split() * 2  # 16 bars
    beat = 60 / spec['bpm']
    bar = beat * 4
    total = bar * len(chords)
    n = int(total * SR)
    melody = np.zeros(n + SR)
    organ = np.zeros_like(melody)
    bass = np.zeros_like(melody)
    fx = np.zeros_like(melody)
    key = NOTE_IDX[spec['key']]
    scale = [(key + s) % 12 for s in (0, 2, 3, 5, 7, 8, 11)]  # harmonic minor
    prev = 72 + key
    motif = [rnd.choice((2, 1, 1, 2, 3, 1)) for _ in range(6)]
    flav = spec['flavour']
    for bi, ch in enumerate(chords):
        root, tones = chord_notes(ch)
        t0 = bi * bar
        # organ drone: two slightly detuned thin pulses, slow swell
        for j, p in enumerate(tones[:3]):
            for det in (0.0, 0.07):
                sig = pulse(hz(48 + p + det), bar * 0.98, 0.125)
                mixin(organ, sig * env(len(sig), 0.35, 0.3, 0.55, 0.3), t0 + j * 0.02, 0.05)
        # music-box melody: sparse, high, triangle — leaves space for the echo
        t = t0
        for length in motif if bi % 4 != 3 else (4, 4):
            if rnd.random() < 0.8:
                pool = tones if rnd.random() < 0.65 else scale
                cands = sorted((72 + p + o for p in pool for o in (-12, 0, 12) if 66 <= 72 + p + o <= 90),
                               key=lambda c: abs(c - prev) + rnd.random() * 4)
                m = cands[0]
                prev = m
                dur = length * beat / 2
                sig = tri(hz(m), dur * 0.9)
                mixin(melody, sig * env(len(sig), 0.002, 0.15, 0.25, 0.2), t, 0.34)
            t += length * beat / 2
            if t >= t0 + bar:
                break
        # heartbeat bass: lub-dub on beat 1
        for off, g in ((0, 0.7), (beat * 0.35, 0.45)):
            k = tri(hz(36 + root), 0.18, slide=-0.3)
            mixin(bass, k * env(len(k), 0.002, 0.05, 0.4, 0.08), t0 + off, g)
        sig = tri(hz(36 + root), bar * 0.9)
        mixin(bass, sig * env(len(sig), 0.1, 0.2, 0.35, 0.2), t0, 0.22)
        # tritone bell toll every other bar
        if bi % 2 == 1:
            for iv, g in ((0, 0.16), (6, 0.1)):
                sig = pulse(hz(84 + root + iv), beat * 2, 0.5)
                mixin(fx, sig * env(len(sig), 0.001, 0.4, 0.05, 0.6), t0 + beat * 2, g)
        # floor flavour
        if flav == 'clock':
            for b in range(8):
                tick = noise(0.02, 6, 300 + b) * env(int(0.02 * SR), 0.001, 0.005, 0.3, 0.01)
                mixin(fx, tick, t0 + b * beat / 2, 0.12 if b % 2 == 0 else 0.07)
        elif flav == 'wind' and bi % 2 == 0:
            w = lowpass(noise(bar * 1.6, 0.3, 400 + bi), 0.05)
            mixin(fx, w * env(len(w), 0.8, 0.3, 0.6, 0.8), t0, 0.5)
        elif flav == 'stars':
            for b in range(8):
                p = tones[b % len(tones)]
                sig = pulse(hz(96 + p), beat / 4, 0.25)
                mixin(fx, sig * env(len(sig), 0.001, 0.05, 0.2, 0.05), t0 + b * beat / 2, 0.05)
        elif flav == 'gears':
            for b in range(4):
                clank = noise(0.05, 1.2, 500 + b) * env(int(0.05 * SR), 0.001, 0.02, 0.3, 0.02)
                mixin(fx, lowpass(clank, 0.3), t0 + b * beat, 0.25)
                tick = noise(0.015, 6, 600 + b) * env(int(0.015 * SR), 0.001, 0.004, 0.3, 0.01)
                mixin(fx, tick, t0 + b * beat + beat / 2, 0.08)
        elif flav == 'bells' and bi % 4 == 0:
            sig = pulse(hz(60 + root), beat * 4, 0.5)
            mixin(fx, sig * env(len(sig), 0.001, 0.6, 0.05, 1.0), t0, 0.12)
    wet = echo(lowpass(melody[:n], 0.6), delay=beat * 0.75, fb=0.45, wet=0.35, wrap=True)
    pad = echo(lowpass(organ[:n], 0.3), delay=beat * 1.5, fb=0.3, wet=0.2, wrap=True)
    return wet + pad + lowpass(bass[:n], 0.5) + echo(fx[:n], delay=beat, fb=0.35, wet=0.3, wrap=True)


def build_music(public: Path, names: list[str]):
    """Write just these music tracks (e.g. new ones) — leaves every other file alone."""
    mdir = public / 'audio' / '16bit' / 'music'
    mdir.mkdir(parents=True, exist_ok=True)
    for name in names:
        encode(compose(TRACKS[name]), mdir / f'{name}.mp3', kbps=96, peak=0.8)


def build(public: Path):
    sdir = public / 'audio' / '16bit' / 'sfx'
    mdir = public / 'audio' / '16bit' / 'music'
    sdir.mkdir(parents=True, exist_ok=True)
    mdir.mkdir(parents=True, exist_ok=True)
    for name, sig in sfx_bank().items():
        encode(sig, sdir / f'{name}.mp3', kbps=96, peak=None)
    for name, spec in TRACKS.items():
        if name in SPOOKY:
            continue  # the Spire's tracks come from the spooky composer below
        encode(compose(spec), mdir / f'{name}.mp3', kbps=96, peak=0.8)
    for name, spec in SPOOKY.items():
        encode(compose_spooky(spec), mdir / f'{name}.mp3', kbps=96, peak=0.8)


# ─── Sea music (#75 item 14) ─────────────────────────────────────────────────
# One loop per sea area, with the sea itself in the mix:
#   sailing  — Dawnreach's waters, aboard Marlow's boat: a jaunty 6/8 shanty
#              (squeezebox lead, oom-pah-pah bass and chords, a shaker), waves
#              and the odd gull;
#   shallows — the Silver Shallows: calm and glittering, 6/8, a rolling
#              arpeggio like light on the water, an ocarina tune, a chime;
#   fogbank  — near the Great Fogbank: slow and misty, 4/4, a muffled
#              foghorn, a rocking buoy bell, the Shallows' tune heard again in
#              a minor key through the fog.
# Unlike `compose`, the melodies are written out by hand (note:eighths,
# bars split by '|'); the accompaniment is worked out from the chords. Song
# form A A' B A'' (the fogbank: A B, then a bar-for-bar rest), so a loop runs
# 40-60 s. Anything that rings past the end wraps round to the start, so the
# loop is seamless. Seeded: rebuilds are byte-identical.

SHANTY_A = ('D5:2 D5:1 F#5:2 A5:1 | A5:2 F#5:1 D5:3 | G5:2 G5:1 B5:2 G5:1 | E5:2 F#5:1 E5:3 | '
            'D5:2 D5:1 F#5:2 A5:1 | B5:2 A5:1 F#5:2 D5:1 | G5:2 B4:1 C#5:2 E5:1 | D5:3 r:2 A4:1')
SHANTY_A2 = ('D5:2 D5:1 F#5:2 A5:1 | D6:2 A5:1 F#5:3 | G5:2 B5:1 D6:2 B5:1 | A5:2 G5:1 E5:3 | '
             'F#5:2 B5:1 A5:2 F#5:1 | G5:2 E5:1 D5:2 B4:1 | C#5:2 E5:1 A5:2 G5:1 | F#5:3 D5:3')
SHANTY_B = ('B5:3 A5:2 F#5:1 | G5:3 D5:3 | F#5:3 E5:2 D5:1 | E5:5 r:1 | '
            'B5:3 C#6:2 D6:1 | D6:3 B5:2 G5:1 | E5:2 G5:1 B5:2 A5:1 | A5:3 C#5:2 E5:1')

SHALLOWS_A = ('E5:3 C#5:2 E5:1 | F#5:4 E5:2 | D5:3 F#5:2 A5:1 | B4:2 E5:1 G#5:3 | '
              'A5:3 G#5:2 E5:1 | E5:3 C#5:2 G#4:1 | F#5:2 E5:1 D5:2 C#5:1 | B4:6')
SHALLOWS_A2 = ('E5:3 C#5:2 E5:1 | F#5:4 A5:2 | D6:3 C#6:2 A5:1 | B5:3 G#5:3 | '
               'A5:3 F#5:2 C#5:1 | D5:2 G#5:1 A5:3 | G#5:2 F#5:1 E5:2 D5:1 | C#5:6')
SHALLOWS_B = ('A5:3 F#5:2 D5:1 | E5:3 C#5:3 | D5:2 F#5:1 B5:3 | G#5:6 | '
              'F#5:2 A5:1 D6:3 | C#6:2 B5:1 G#5:3 | F#5:2 A5:1 D5:2 F#5:1 | G#4:3 B4:3')

# The Shallows' opening, a fifth down in D minor and slowed, half lost in the fog.
FOGBANK_A = ('r:2 A4:3 F4:1 A4:2 | Bb4:6 A4:2 | G4:3 Bb4:1 D5:4 | C#5:8 | '
             'r:4 F5:2 E5:1 D5:1 | D5:6 r:2 | Eb5:4 G5:2 Bb4:2 | A4:8')
FOGBANK_B = ('r:2 D5:3 Bb4:1 G4:2 | A4:6 r:2 | F4:3 G4:1 Bb4:4 | A4:4 r:4 | '
             'r:8 | r:8 | r:8 | r:8')

SEA = {
    'sailing': dict(bpm=100, meter=6, key='D', scale=MAJOR, style='shanty', seed=113, parts=[
        dict(chords='D D G A D Bm G/A D', tune=SHANTY_A),
        dict(chords='D D G A Bm G A D', tune=SHANTY_A2),
        dict(chords='Bm G D A Bm G Em A', tune=SHANTY_B),
        dict(chords='D D G A D Bm G/A D', tune=SHANTY_A, duet=True),  # the crew joins in
    ]),
    'shallows': dict(bpm=66, meter=6, key='A', scale=MAJOR, style='roll', seed=127, parts=[
        dict(chords='A F#m D E A C#m D E', tune=SHALLOWS_A),
        dict(chords='A F#m D E F#m D E A', tune=SHALLOWS_A2),
        dict(chords='D A Bm E D C#m Bm E', tune=SHALLOWS_B),
        dict(chords='A F#m D E A C#m D E', tune=SHALLOWS_A, duet=True),
    ]),
    'fogbank': dict(bpm=60, meter=8, key='D', scale=MINOR, style='mist', seed=131, parts=[
        dict(chords='Dm Bb Gm A Dm Bb Eb A', tune=FOGBANK_A),
        dict(chords='Gm Dm Bb A Dm Bb Gm A', tune=FOGBANK_B),
    ]),
}


def _bars(text: str, meter: int):
    """'D5:2 F#5:1 | r:3 …' → one list of (midi or None, eighths) per bar; every bar must fill the meter."""
    bars = []
    for chunk in text.split('|'):
        notes = [(None if nm == 'r' else midi(nm), int(n)) for nm, n in (tok.split(':') for tok in chunk.split())]
        held = sum(n for _, n in notes)
        assert held == meter, f'bar {len(bars) + 1} of "{text[:24]}…" holds {held} eighths, not {meter}'
        bars.append(notes)
    return bars


def _osc(freq, dur, shape='tri', duty=0.5, vib=0.0, slide=0.0) -> np.ndarray:
    """A pulse or 4-bit triangle with a vibrato that eases in, as a held note's would."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = freq * (1 + slide * t / max(dur, 1e-6))
    if vib:
        f = f * (1 + vib * np.sin(2 * np.pi * 5.0 * t) * np.clip(t * 3 - 0.4, 0, 1))
    ph = (np.cumsum(f) / SR) % 1.0
    if shape == 'tri':
        return np.round((4 * np.abs(ph - 0.5) - 1) * 8) / 8
    return np.where(ph < duty, 1.0, -1.0)


def _third_below(m: int, scale) -> int:
    """The scale note a third under m — the crew's (or the second ocarina's) line."""
    steps = [m - k for k in range(1, 6) if (m - k) % 12 in scale]
    return steps[1] if len(steps) > 1 else m - 3


def _wave(dur, seed, muffle=0.12) -> np.ndarray:
    """A wave washing in and drawing back: filtered noise, a slow swell, a long hiss out."""
    n = int(dur * SR)
    x = lowpass(noise(dur, 3.0, seed), muffle)
    return x * np.interp(np.arange(n) / n, [0, 0.35, 0.5, 1], [0, 1, 0.65, 0])


def _gull(seed) -> np.ndarray:
    """'Kee-ow, kee-ow' — a quick rise, a long fall, twice."""
    rnd = random.Random(seed)
    out = []
    for _ in range(2):
        f0 = 1250 * (1 + rnd.random() * 0.15)
        up = _osc(f0, 0.05, 'pulse', 0.25, slide=0.4)
        down = _osc(f0 * 1.4, 0.2, 'pulse', 0.25, slide=-0.45)
        cry = np.concatenate([up, down])
        out += [cry * env(len(cry), 0.01, 0.05, 0.7, 0.08), np.zeros(int(0.07 * SR))]
    return lowpass(np.concatenate(out), 0.35)


def _bell(m: float, dur=2.2) -> np.ndarray:
    """A struck bell: the note plus an inharmonic partial, dying away."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    tone = _osc(hz(m), dur, 'pulse', 0.5) * np.exp(-t * 2.2) + 0.4 * _osc(hz(m) * 2.76, dur, 'tri') * np.exp(-t * 4.5)
    return tone * env(n, 0.001, 0.01, 1.0, 0.05)


def _foghorn(m: int) -> np.ndarray:
    """A soft, low diaphone 'hooo…' that sags at the end."""
    main = _osc(hz(m), 2.2, 'pulse', 0.5) + 0.6 * _osc(hz(m + 7), 2.2, 'pulse', 0.5)
    sag = _osc(hz(m), 0.5, 'pulse', 0.5, slide=-0.12) + 0.6 * _osc(hz(m + 7), 0.5, 'pulse', 0.5, slide=-0.12)
    horn = np.concatenate([main, sag])
    return lowpass(horn * env(len(horn), 0.35, 0.3, 0.8, 0.45), 0.05)


def _fold(buf: np.ndarray, n: int) -> np.ndarray:
    """Wrap whatever rings past the loop's end back onto its start."""
    out = buf[:n].copy()
    spill = buf[n:]
    out[: len(spill)] += spill[:n]
    return out


def compose_sea(spec):
    rnd = random.Random(spec['seed'])
    meter, style = spec['meter'], spec['style']
    e8 = 60 / spec['bpm'] / (3 if meter == 6 else 2)
    bar = e8 * meter
    key = NOTE_IDX[spec['key']]
    scale = [(key + s) % 12 for s in spec['scale']]
    bars = []  # (chords for the bar's halves, notes, duet?)
    for part in spec['parts']:
        tune = _bars(part['tune'], meter)
        chords = part['chords'].split()
        assert len(chords) == len(tune), f'{len(chords)} chords for {len(tune)} bars'
        for ch, notes in zip(chords, tune):
            halves = ch.split('/')
            bars.append((halves if len(halves) == 2 else halves * 2, notes, part.get('duet', False)))
    n = int(bar * len(bars) * SR)
    pad = n + 6 * SR  # room for tails; folded back to the start at the end
    lead, harm, bass, drums, sea = (np.zeros(pad) for _ in range(5))

    for bi, (halves, notes, duet) in enumerate(bars):
        t0 = bi * bar
        # --- the tune (and in a duet, a second voice a third below)
        t = t0
        for m, length in notes:
            if m is not None:
                dur = length * e8 * (0.82 if style == 'shanty' and length == 1 else 0.94)
                vib = 0.006 if length >= 3 else 0.0
                if style == 'shanty':  # squeezebox: two reeds, a hair apart
                    sig = _osc(hz(m), dur, 'pulse', 0.5, vib) + 0.6 * _osc(hz(m) * 1.004, dur, 'pulse', 0.25, vib)
                    e = env(len(sig), 0.01, 0.08, 0.75, 0.05)
                    mixin(lead, sig * e, t, 0.19)
                    if duet:
                        h = _osc(hz(_third_below(m, scale)), dur, 'pulse', 0.5)
                        mixin(lead, h * env(len(h), 0.01, 0.08, 0.7, 0.05), t, 0.1)
                elif style == 'roll':  # ocarina: a triangle with a little breath of pulse
                    sig = _osc(hz(m), dur, 'tri', vib=vib) + 0.18 * _osc(hz(m), dur, 'pulse', 0.5, vib)
                    mixin(lead, sig * env(len(sig), 0.03, 0.1, 0.8, 0.12), t, 0.3)
                    if duet:
                        h = _osc(hz(_third_below(m, scale)), dur, 'tri', vib=vib)
                        mixin(lead, h * env(len(h), 0.03, 0.1, 0.75, 0.12), t, 0.18)
                else:  # mist: a music box heard through fog
                    sig = _osc(hz(m), dur, 'tri', vib=0.004)
                    mixin(lead, sig * env(len(sig), 0.02, 0.35, 0.45, 0.4), t, 0.4)
            t += length * e8

        # --- accompaniment, one half-bar (one chord) at a time
        half = meter // 2
        for hi, ch in enumerate(halves):
            root, tones = chord_notes(ch)
            ivs = [(p - root) % 12 for p in tones]
            ht = t0 + hi * half * e8
            if style == 'shanty':
                # oom (bass) pah pah (chord) — root on the first half, fifth on the second
                b = 36 + root + (0 if hi == 0 or halves[0] != halves[1] else 7)
                sig = _osc(hz(b), 2 * e8 * 0.9)
                mixin(bass, sig * env(len(sig), 0.003, 0.05, 0.8, 0.04), ht, 0.45)
                for k in (1, 2):
                    for p in tones[:3]:
                        c = _osc(hz(60 + (p - 60) % 12), e8 * 0.55, 'pulse', 0.25)
                        mixin(harm, c * env(len(c), 0.002, 0.03, 0.5, 0.03), ht + k * e8, 0.055)
                # a soft kick on the beat, a tap on the second, a shaker in between
                if hi == 0:
                    kick = _osc(110, 0.1, slide=-0.7)
                    mixin(drums, kick * env(len(kick), 0.001, 0.03, 0.4, 0.04), ht, 0.45)
                else:
                    tap = noise(0.06, 2.0, 700 + bi) * env(int(0.06 * SR), 0.001, 0.02, 0.3, 0.03)
                    mixin(drums, tap, ht, 0.16)
                for k in range(3):
                    sh = noise(0.035, 5, 720 + bi * 6 + hi * 3 + k) * env(int(0.035 * SR), 0.004, 0.01, 0.3, 0.015)
                    mixin(drums, sh, ht + k * e8, 0.07 if k == 0 else 0.045)
            elif style == 'roll':
                # light on the water: root, fifth, octave, tenth … rolling up and back
                r = 48 + root
                if r < 52:
                    r += 12
                third = next((i for i in ivs if i in (3, 4)), 4)
                pattern = [0, 7, 12] if hi == 0 else [12 + third, 12, 7]
                for k, iv in enumerate(pattern):
                    sig = _osc(hz(r + iv), e8 * 0.9, 'pulse', 0.125)
                    mixin(harm, sig * env(len(sig), 0.004, 0.08, 0.35, 0.08), ht + k * e8, 0.09)
                b = 36 + root + (0 if hi == 0 else 7)
                if b < 40:
                    b += 12
                sig = _osc(hz(b), half * e8 * 0.95)
                mixin(bass, sig * env(len(sig), 0.02, 0.15, 0.6, 0.15), ht, 0.42 if hi == 0 else 0.3)
            else:  # mist: a slow, detuned pad and a low drone, one chord per bar
                if hi == 1:
                    continue
                for j, p in enumerate(tones[:3]):
                    for det in (0.0, 0.09):
                        sig = _osc(hz(60 + (p - 60) % 12 + det), bar * 1.15, 'pulse', 0.125)
                        mixin(harm, sig * env(len(sig), 1.2, 0.4, 0.6, 1.0), ht + j * 0.03, 0.028)
                sig = _osc(hz(36 + root), bar * 1.05)
                mixin(bass, sig * env(len(sig), 0.4, 0.3, 0.5, 0.6), ht, 0.3)

        # --- the sea itself
        if bi % 2 == 0:  # a wave every other bar, never quite the same
            w = _wave(bar * (1.6 + rnd.random() * 0.4), 800 + bi, 0.05 if style == 'mist' else 0.12)
            mixin(sea, w, t0 + rnd.random() * e8 * 2, {'shanty': 0.13, 'roll': 0.11}.get(style, 0.16))
        if style == 'shanty' and bi % 8 == 5:
            mixin(sea, _gull(900 + bi), t0 + e8 * rnd.choice((1, 2, 4)), 0.05)
        if style == 'roll':
            if bi % 4 == 0:  # a chime at each phrase, high and far off
                mixin(sea, _bell(72 + key + (12 if bi % 8 == 4 else 0), 1.8), t0, 0.06)
            if bi % 16 == 10:
                mixin(sea, _gull(950 + bi), t0 + e8 * 2, 0.03)
        if style == 'mist':
            if bi % 4 == 0:
                mixin(sea, _foghorn(36 + key), t0 + bar / 2, 0.22)
            if bi % 2 == 1:  # the buoy rocks: ding … ding-ding
                bt = t0 + e8 * (1 + rnd.random())
                mixin(sea, _bell(81), bt, 0.07)
                if rnd.random() < 0.5:
                    mixin(sea, _bell(81), bt + e8 * 1.5, 0.05)

    # a dotted-quarter echo; the fog's is long and wet, half drowning its tune
    wet_fb, wet_mix = (0.5, 0.42) if style == 'mist' else (0.3, 0.2)
    melodic = lowpass(_fold(lead, n) + _fold(harm, n), 0.4 if style == 'mist' else 0.6)
    wet = echo(melodic, delay=e8 * 3, fb=wet_fb, wet=wet_mix, wrap=True)
    return wet + lowpass(_fold(bass, n), 0.6) + _fold(drums, n) + echo(_fold(sea, n), delay=e8 * 2, fb=0.25, wet=0.2, wrap=True)


def build_sea_music(public: Path):
    """Write the sea tracks only — leaves every other file alone."""
    mdir = public / 'audio' / '16bit' / 'music'
    mdir.mkdir(parents=True, exist_ok=True)
    for name, spec in SEA.items():
        encode(compose_sea(spec), mdir / f'{name}.mp3', kbps=96, peak=0.8)
