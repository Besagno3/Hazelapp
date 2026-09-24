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
