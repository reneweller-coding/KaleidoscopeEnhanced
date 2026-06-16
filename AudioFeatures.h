#pragma once

/**
 * AudioFeatures
 * ---------------------------------------------------------------------------
 * Plain-old-data struct shared between AudioAnalyzer (producer) and
 * FilterShader / EffectShader (consumers).
 *
 * All float fields normalised to [0, 1].
 * Access protected by AudioAnalyzer's QMutex.
 *
 * 6-Band frequency decomposition (IIR one-pole filter cascade):
 *   subBass   20 –   60 Hz   physical rumble, sub-bass drones
 *   bass      60 –  150 Hz   kick body, drone fundamentals
 *   lowMid   150 –  500 Hz   harmonic warmth, pad body
 *   mid      500 – 2000 Hz   melody, vocals, texture
 *   upperMid 2k  –   6k Hz   metallic edge, industrial scrape
 *   high      6k – 20k  Hz   air, shimmer, hiss
 * ---------------------------------------------------------------------------
 */
struct AudioFeatures
{
    // ---- 6-Band energies (dB-normalised, smoothed) ----
    float subBassLevel  = 0.f;   // 20-60 Hz   – physical weight / darkness
    float bassLevel     = 0.f;   // 60-150 Hz  – drone body / beat energy
    float lowMidLevel   = 0.f;   // 150-500 Hz – harmonic warmth
    float midLevel      = 0.f;   // 500-2k Hz  – texture / melody
    float upperMidLevel = 0.f;   // 2k-6k Hz   – metallic / industrial
    float highLevel     = 0.f;   // 6k+ Hz     – air / shimmer

    // ---- Overall amplitude ----
    float overallLevel  = 0.f;   // weighted mix of all bands

    // ---- Beat detection ----
    bool  isBeat        = false; // true for one update cycle on each onset
    float beatStrength  = 0.f;   // 0..1 onset magnitude vs. background
    float beatDecay     = 0.f;   // smooth 0..1 decay after beat (use in shaders)

    // ---- Music-mode classifier ----
    // 0 = clearly beat-driven,  1 = pure ambient/drone.
    // Transitions slowly (~10 s) so visuals blend smoothly.
    float ambientFactor = 0.f;

    // ---- Timbral features (ambient-mode core) ----
    // spectralFlux: rate of spectral change, frame-to-frame.
    //   High when a new drone layer enters / existing layer fades.
    //   Near zero for a perfectly static held drone.
    //   Primary motion driver in ambient mode.
    float spectralFlux     = 0.f;

    // spectralCentroid: tonal brightness 0..1 on a log frequency axis.
    //   0 = dark sub-bass rumble (Lustmord, Thomas Köner deep drones)
    //   1 = bright high-frequency shimmer (airy ambient pads)
    //   Drives colour-temperature mapping in shaders.
    float spectralCentroid = 0.5f;

    // ---- Beat-triggered discrete changes ----
    int   beatSidesHint = 6;    // new kaleidoscope symmetry on each beat
    float audioFlip     = 1.f;  // rotation direction ±1 (flips on strong beats)

    // ---- Derived motion helpers ----
    float speedScale  = 1.f;   // multiplier for speed / speedTunnel uniforms
    float powerScale  = 1.f;   // multiplier for power (distortion) uniform

    // ---- Timbral texture features (from paper: spectrum + temporal groups) ----

    // zeroCrossingRate: signal noisiness from raw samples.
    //   0 = pure tone / sine drone (Thomas Köner, Lustmord)
    //   1 = broadband noise / textural wall (harsh noise, industrial)
    //   Maps to grain/roughness in shaders; high ZCR = more visual texture.
    float zeroCrossingRate = 0.f;

    // spectralFlatness: how noise-like vs. tonal the spectrum is.
    //   0 = single dominant frequency band (held drone, pure pad)
    //   1 = energy evenly spread across all bands (white noise)
    //   Useful to morph between sharp, structured geometry (tonal) and
    //   diffuse, organic forms (noise).
    float spectralFlatness = 0.f;

    // logAttackTime: onset sharpness, 0..1.
    //   0 = very slow onset (swelling pad, evolving drone)
    //   1 = instant attack (kick, snare, metallic transient)
    //   Drives cut / dissolve sharpness: percussive → hard cut, slow → cross-fade.
    float logAttackTime = 0.f;

    // estimatedBPM: beat tempo, normalised to [0..1] over range 40..200 BPM.
    //   0 = very slow (40 BPM, dirge), 0.5 = 120 BPM, 1 = 200 BPM.
    //   0 when no beat is detected (pure ambient / drone).
    float estimatedBPM = 0.f;

    // keyClarity: how strongly a single musical key is implied (Krumhansl-Kessler
    //   best-vs-mean correlation).  0 = ambiguous/atonal/noise, 1 = one clear key.
    //   Clear tonality reads as pleasant → contributes to valence.
    float keyClarity = 0.f;

    // sharpness: Zwicker-style high-frequency weighting of loudness.
    //   0 = dull / dark (sub-bass drone), 1 = sharp / bright-harsh (cymbals, noise).
    //   Bright, incisive sound reads as energetic → contributes to arousal.
    float sharpness = 0.f;

    // harmonicChange: Harmonic Change Detection Function (Harte 2006) — the rate
    //   of movement of the 6-D tonal centroid.  Spikes on chord/key changes,
    //   near zero on a sustained harmony.  A natural trigger for visual change.
    float harmonicChange = 0.f;

    // roughness: sensory dissonance (Plomp-Levelt / Sethares) from beating between
    //   nearby spectral partials.  0 = consonant / smooth (pure chords, sine drone),
    //   1 = rough / dissonant (clusters, distortion, noise).  Lowers valence.
    float roughness = 0.f;

    // ---- Rhythm / dynamics ----

    // rhythmStrength: how steady/periodic the beat is (inter-beat consistency ×
    //   recency).  ~1 for a driving, regular beat; ~0 for arrhythmic audio,
    //   speech, or silence.  Key ingredient of the music/speech classifier.
    float rhythmStrength = 0.f;

    // beatPhase: continuous 0..1 position within the current beat, derived from
    //   the estimated tempo (wraps every beat).  Lets shaders pulse *in time*
    //   even between transients, not only decay after each onset.
    float beatPhase = 0.f;

    // fluxVariance: variance of spectral flux over ~1 s — a "restlessness"
    //   measure (paper's top music/speech discriminator).  Low = static texture,
    //   high = busy, changing sound.
    float fluxVariance = 0.f;

    // ---- Stereo & melodic motion ----

    // stereoWidth: side/mid energy ratio.  0 = mono / dead-centre, 1 = very wide
    //   stereo image.  Drives left/right asymmetry & spatial spread in visuals.
    float stereoWidth = 0.f;

    // deltaPitch: rate of change of the dominant pitch (melodic activity).
    //   ~0 for a held note / drone, higher for fast melodic movement.
    float deltaPitch = 0.f;

    // ---- Music vs. speech / silence ----

    // musicPresence: 1 = clearly music, 0 = speech / video dialogue / silence.
    //   Smoothed with hysteresis.  Used as a MASTER GATE on audio reactivity:
    //   when it falls (e.g. a talking video in the background) the visuals fade
    //   back to their calm, timer-driven non-reactive behaviour; when music
    //   returns they smoothly become reactive again.
    float musicPresence = 1.f;

    // Thayer's model proxies (derived, 0..1):
    //   arousal ≈ energy × rhythm × brightness/sharpness (fast/bright = high)
    //   valence ≈ mode × key clarity × tonality × brightness (pleasant = high)
    float arousal = 0.5f;
    float valence = 0.5f;

    // ---- FFT-derived features ----

    // spectralRolloff: frequency (normalised 0..Nyquist → 0..1) below which
    // 85% of the spectral energy lies.
    //   Low  → energy concentrated in bass (dark drone, sub-bass)
    //   High → energy extends into highs (cymbals, bright pads, harsh noise)
    float spectralRolloff = 0.5f;

    // spectralSpread: standard deviation of the spectrum around the centroid,
    // normalised by a reference value (~5 kHz).
    //   Low  → narrow spectrum (single sine wave, pure drone tone)
    //   High → wide spectrum (rich harmonics, full-band noise)
    float spectralSpread = 0.f;

    // musicalMode: Krumhansl-Kessler key-profile correlation.
    //   0 = most minor-like (ominous, dark, tense — perfect for dark ambient)
    //   1 = most major-like (bright, resolved, joyful)
    // Transitions slowly (~3 s) so it reflects musical atmosphere, not noise.
    float musicalMode = 0.5f;

    // dominantPitch: fundamental frequency estimated via Harmonic Product Spectrum,
    // log-normalised over 60..1200 Hz → 0..1.
    //   0 = low bass drone (~60 Hz)  1 = high treble tone (~1200 Hz)
    //   0 when no clear pitch is detected (noise, silence).
    float dominantPitch = 0.f;

    // ---- Dynamic timing scale ----
    // Scalar passed to filterShader for adaptive shader-switch / cross-fade timing.
    //   < 1.0 → longer times (ambient: e.g. 0.15 = 6.7× slower than default)
    //   > 1.0 → shorter times (energetic beat music: e.g. 1.4 = 30% faster)
    // Derived from arousal and ambientFactor in AudioAnalyzer::processBlock().
    float timingScale = 1.f;

    // ---- Host-integrated motion phases ----
    // NOT produced by AudioAnalyzer; filled in once per frame by
    // FilterShader::paint().  Audio-driven motion must never be expressed as a
    // factor multiplied by the absolute 'time' uniform: changing such a factor
    // (or flipping its sign) remaps the whole accumulated phase in a single
    // frame, which is exactly what caused the violent flicker.  Instead the
    // host integrates the audio-driven *rate* over each frame's dt into these
    // continuous accumulators, which the shaders simply add to their phase.
    float audioRotPhase = 0.f;   // accumulated rotation angle (radians)
    float audioAdvance  = 0.f;   // accumulated tunnel forward offset (uv units)
};
