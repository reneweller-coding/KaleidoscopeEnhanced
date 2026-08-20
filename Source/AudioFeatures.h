/**
 * @file AudioFeatures.h
 * @brief Plain-old-data snapshot of every real-time audio-analysis feature, shared between AudioAnalyzer and the render-side shaders.
 */
#pragma once

/**
 * @brief Snapshot of all real-time audio-analysis results, produced by AudioAnalyzer and consumed by RenderPipeline / EffectShader.
 *
 * All float fields normalised to [0, 1] (unless the field's comment says
 * otherwise). Access is protected by AudioAnalyzer's QMutex — always obtain a
 * copy via AudioAnalyzer::getFeatures() rather than reaching into a live
 * instance. Most fields are filled once per ~10 ms capture block by
 * AudioAnalyzer::processBlock(); a smaller group explicitly marked
 * "host-filled" below is instead written once per render frame by
 * RenderPipeline::paint() from information AudioAnalyzer alone cannot know
 * (wall-clock day/night cycle, integrated motion phases, history-ring
 * bookkeeping for the SSM/spectrogram/melody textures, etc).
 *
 * 6-Band frequency decomposition (IIR one-pole filter cascade):
 *   subBass   20 –   60 Hz   physical rumble, sub-bass drones
 *   bass      60 –  150 Hz   kick body, drone fundamentals
 *   lowMid   150 –  500 Hz   harmonic warmth, pad body
 *   mid      500 – 2000 Hz   melody, vocals, texture
 *   upperMid 2k  –   6k Hz   metallic edge, industrial scrape
 *   high      6k – 20k  Hz   air, shimmer, hiss
 */
struct AudioFeatures
{
    // ---- 6-Band energies (dB-normalised, smoothed) ----
    float subBassLevel  = 0.f;   ///< 20-60 Hz   - physical weight / darkness
    float bassLevel     = 0.f;   ///< 60-150 Hz  - drone body / beat energy
    float lowMidLevel   = 0.f;   ///< 150-500 Hz - harmonic warmth
    float midLevel      = 0.f;   ///< 500-2k Hz  - texture / melody
    float upperMidLevel = 0.f;   ///< 2k-6k Hz   - metallic / industrial
    float highLevel     = 0.f;   ///< 6k+ Hz     - air / shimmer

    // ---- Overall amplitude ----
    float overallLevel  = 0.f;   ///< Weighted mix of all 6 bands (bass-heavy weighting).

    // ---- Fine-grained spectrum (for the analyzer effects) ----
    /** @brief Number of log-spaced bands in #spectrum. */
    static const int kSpectrumBands = 32;
    /**
     * @brief 32 log-spaced magnitude bands (~40 Hz .. 16 kHz) for the analyzer effects.
     *
     * Self-normalised 0..1 and lightly smoothed, so a shader can draw a proper
     * many-bar spectrum analyzer instead of only the 6 coarse bands above.
     * Uploaded as `audioSpectrum[32]`.
     */
    float spectrum[kSpectrumBands] = {};

    // ---- Time-domain waveform (for oscilloscope-style effects) ----
    /** @brief Number of points in #wave. */
    static const int kWavePoints = 64;
    /**
     * @brief Time-domain waveform for oscilloscope-style effects.
     *
     * 64 points of the last ~43 ms of the MONO signal (band-limited by the
     * downsample averaging), normalised to roughly -1..1 with a decaying-peak
     * reference so quiet passages still draw a visible wave.  Uploaded as
     * `audioWave[64]` — the missing MilkDrop ingredient.
     */
    float wave[kWavePoints] = {};

    /**
     * @brief Relative band levels (MilkDrop bass/bass_att idiom).
     *
     * Instant / slow-average ratio per register, ~1.0 = as loud as usual,
     * clamped 0..2.5.  Uploaded as audioBassRel / audioMidRel / audioTrebRel.
     */
    float bassRel = 1.f;   ///< Bass register instant/slow-average ratio.
    float midRel  = 1.f;   ///< Mid register instant/slow-average ratio.
    float trebRel = 1.f;   ///< Treble register instant/slow-average ratio.

    /**
     * @brief Day/night cycle phase (host wall-clock, NOT audio-derived).
     *
     * A slow 0..1 sawtooth (~4.7 min period) a handful of outdoor 3D scenes
     * use for sun elevation / sky colour; also exposed to the formula layer.
     * Always continuous through the wrap (consumers derive sin/cos of it).
     */
    float dayPhase = 0.f;

    // ---- Beat / onset detection ----
    bool  isBeat        = false; ///< True for one update cycle on each detected kick.
    float beatStrength  = 0.f;   ///< 0..1 onset magnitude vs. background.
    /**
     * @brief Smooth 0..1 decay after a beat (use in shaders for a sustained pop).
     *
     * Also boosted by full-spectrum onsets, so it pulses on snares/claps/melodic
     * hits, not only kicks.
     */
    float beatDecay     = 0.f;

    /**
     * @brief Full-spectrum onset detector (spectral-flux peak picking).
     *
     * Decaying 0..1 that fires on ANY percussive/melodic onset — makes the
     * rhythm reaction work for genres without a strong kick drum.
     */
    float onsetStrength = 0.f;

    /**
     * @brief Decaying accent on the bar's "1" (≈ every 4th detected beat).
     *
     * For bigger, musically-placed accents / scene changes.
     */
    float downbeat = 0.f;

    /**
     * @brief One-shot flag, true for a single update cycle when a new track begins.
     *
     * Fires on a sustained near-silence followed by the first onset/energy.
     * The host uses it to trigger a clean, fresh scene transition.
     */
    bool  trackChange = false;

    /**
     * @brief Music-mode classifier: 0 = clearly beat-driven, 1 = pure ambient/drone.
     *
     * Transitions slowly (~10 s) so visuals blend smoothly.
     */
    float ambientFactor = 0.f;

    /**
     * @brief Rate of spectral change, frame-to-frame (timbral feature, ambient-mode core).
     *
     * High when a new drone layer enters / existing layer fades. Near zero for
     * a perfectly static held drone. Primary motion driver in ambient mode.
     */
    float spectralFlux     = 0.f;

    /**
     * @brief Tonal brightness 0..1 on a log frequency axis.
     *
     * 0 = dark sub-bass rumble (Lustmord, Thomas Köner deep drones).
     * 1 = bright high-frequency shimmer (airy ambient pads).
     * Drives colour-temperature mapping in shaders.
     */
    float spectralCentroid = 0.5f;

    // ---- Beat-triggered discrete changes ----
    int   beatSidesHint = 6;    ///< Target kaleidoscope symmetry (changes on beats).
    float smoothedSides = 6.f;  ///< Host-smoothed symmetry → steps gradually, no snap.
    float audioFlip     = 1.f;  ///< Rotation direction ±1 (flips on strong beats).

    // ---- Derived motion helpers ----
    // NOTE: there used to be a speedScale here too (a multiplier meant for
    // speed/speedTunnel uniforms), removed 2026-08-20 as dead AND hazardous:
    // those uniforms are multiplied by the absolute 'time' uniform inside
    // the shaders, so scaling them per-frame remaps the whole accumulated
    // phase on every audio change -- the "wild flicker" bug EffectShader::
    // applyAudioFeatures()'s comment already documents. The safe, correct
    // way to make motion audio-reactive is the pre-integrated, continuous
    // audioPhase/audioAdvance uniforms computed once per frame in
    // RenderPipeline::paint() -- see [[audio-reactive-phase-constraint]].
    float powerScale  = 1.f;   ///< Multiplier for a scene's own "power" (superellipse/distortion exponent) uniform -- safe to scale live since it's a plain per-frame shape parameter, not time-integrated. Applied via EffectShader::applyAudioFeatures()'s Uniform::setGLValueScaled().

    // ---- Timbral texture features (from paper: spectrum + temporal groups) ----

    /**
     * @brief Signal noisiness from raw samples (zero-crossing rate).
     *
     * 0 = pure tone / sine drone (Thomas Köner, Lustmord).
     * 1 = broadband noise / textural wall (harsh noise, industrial).
     * Maps to grain/roughness in shaders; high ZCR = more visual texture.
     */
    float zeroCrossingRate = 0.f;

    /**
     * @brief How noise-like vs. tonal the spectrum is (spectral flatness measure).
     *
     * 0 = single dominant frequency band (held drone, pure pad).
     * 1 = energy evenly spread across all bands (white noise).
     * Useful to morph between sharp, structured geometry (tonal) and diffuse,
     * organic forms (noise).
     */
    float spectralFlatness = 0.f;

    /**
     * @brief Onset sharpness, 0..1 (log attack time).
     *
     * 0 = very slow onset (swelling pad, evolving drone).
     * 1 = instant attack (kick, snare, metallic transient).
     * Drives cut / dissolve sharpness: percussive → hard cut, slow → cross-fade.
     */
    float logAttackTime = 0.f;

    /**
     * @brief Beat tempo, normalised to [0..1] over range 40..200 BPM.
     *
     * 0 = very slow (40 BPM, dirge), 0.5 = 120 BPM, 1 = 200 BPM.
     * 0 when no beat is detected (pure ambient / drone).
     */
    float estimatedBPM = 0.f;

    /**
     * @brief How strongly a single musical key is implied (Krumhansl-Kessler best-vs-mean correlation).
     *
     * 0 = ambiguous/atonal/noise, 1 = one clear key.
     * Clear tonality reads as pleasant → contributes to valence.
     */
    float keyClarity = 0.f;

    /**
     * @brief Zwicker-style high-frequency weighting of loudness.
     *
     * 0 = dull / dark (sub-bass drone), 1 = sharp / bright-harsh (cymbals, noise).
     * Bright, incisive sound reads as energetic → contributes to arousal.
     */
    float sharpness = 0.f;

    /**
     * @brief Harmonic Change Detection Function (Harte 2006).
     *
     * The rate of movement of the 6-D tonal centroid. Spikes on chord/key
     * changes, near zero on a sustained harmony. A natural trigger for visual
     * change.
     */
    float harmonicChange = 0.f;

    /**
     * @brief Sensory dissonance (Plomp-Levelt / Sethares) from beating between nearby spectral partials.
     *
     * 0 = consonant / smooth (pure chords, sine drone).
     * 1 = rough / dissonant (clusters, distortion, noise). Lowers valence.
     */
    float roughness = 0.f;

    // ---- Rhythm / dynamics ----

    /**
     * @brief How steady/periodic the beat is (inter-beat consistency × recency).
     *
     * ~1 for a driving, regular beat; ~0 for arrhythmic audio, speech, or
     * silence. Key ingredient of the music/speech classifier.
     */
    float rhythmStrength = 0.f;

    /**
     * @brief Continuous 0..1 position within the current beat, derived from the estimated tempo (wraps every beat).
     *
     * Lets shaders pulse *in time* even between transients, not only decay
     * after each onset.
     */
    float beatPhase = 0.f;

    /**
     * @brief Variance of spectral flux over ~1 s — a "restlessness" measure (paper's top music/speech discriminator).
     *
     * Low = static texture, high = busy, changing sound.
     */
    float fluxVariance = 0.f;

    // ---- Stereo & melodic motion ----

    /**
     * @brief Side/mid energy ratio.
     *
     * 0 = mono / dead-centre, 1 = very wide stereo image. Drives left/right
     * asymmetry & spatial spread in visuals.
     */
    float stereoWidth = 0.f;

    /**
     * @brief Stereo-separated spectrum: per-channel low/mid/high band energies (AGC-normalised 0..1).
     *
     * Lets a shader draw the left channel's spectrum on one side and the
     * right on the other, so the stereo image becomes visible. (Mono audio
     * mirrors L=R.)
     */
    float stereoLowL  = 0.f, stereoMidL = 0.f, stereoHighL = 0.f;   ///< Left-channel  low/mid/high band energies.
    float stereoLowR  = 0.f, stereoMidR = 0.f, stereoHighR = 0.f;   ///< Right-channel low/mid/high band energies.

    /**
     * @brief Rate of change of the dominant pitch (melodic activity).
     *
     * ~0 for a held note / drone, higher for fast melodic movement.
     */
    float deltaPitch = 0.f;

    // ---- Music vs. speech / silence ----

    /**
     * @brief 1 = clearly music, 0 = speech / video dialogue / silence.
     *
     * Smoothed with hysteresis. Used as a MASTER GATE on audio reactivity:
     * when it falls (e.g. a talking video in the background) the visuals fade
     * back to their calm, timer-driven non-reactive behaviour; when music
     * returns they smoothly become reactive again.
     */
    float musicPresence = 1.f;

    /**
     * @brief Thayer's model arousal proxy (derived, 0..1).
     *
     * arousal ≈ energy × rhythm × brightness/sharpness (fast/bright = high).
     */
    float arousal = 0.5f;
    /**
     * @brief Thayer's model valence proxy (derived, 0..1).
     *
     * valence ≈ mode × key clarity × tonality × brightness (pleasant = high).
     */
    float valence = 0.5f;

    // ---- FFT-derived features ----

    /**
     * @brief Frequency (normalised 0..Nyquist → 0..1) below which 85% of the spectral energy lies.
     *
     * Low  → energy concentrated in bass (dark drone, sub-bass).
     * High → energy extends into highs (cymbals, bright pads, harsh noise).
     */
    float spectralRolloff = 0.5f;

    /**
     * @brief Standard deviation of the spectrum around the centroid, normalised by a reference value (~5 kHz).
     *
     * Low  → narrow spectrum (single sine wave, pure drone tone).
     * High → wide spectrum (rich harmonics, full-band noise).
     */
    float spectralSpread = 0.f;

    /**
     * @brief Krumhansl-Kessler key-profile correlation.
     *
     * 0 = most minor-like (ominous, dark, tense — perfect for dark ambient).
     * 1 = most major-like (bright, resolved, joyful).
     * Transitions slowly (~3 s) so it reflects musical atmosphere, not noise.
     */
    float musicalMode = 0.5f;

    /**
     * @brief Harmonic "colour" of the music — the circular mean of the 12-bin chroma vector mapped onto the colour wheel (0..1).
     *
     * A song's key/harmony therefore drives a consistent global hue shift →
     * "see the harmony as colour".
     */
    float chromaHue = 0.f;

    /**
     * @brief Full 12-bin chroma vector (pitch-class energies C..B, smoothed and L1-normalised).
     *
     * Uploaded as `audioChroma[12]` so a scene can show the harmony
     * STRUCTURALLY (which notes sound), not only as one mean hue.
     */
    float chroma[12] = {};

    /**
     * @brief Fundamental frequency estimated via Harmonic Product Spectrum, log-normalised over 60..1200 Hz → 0..1.
     *
     * 0 = low bass drone (~60 Hz), 1 = high treble tone (~1200 Hz).
     * 0 when no clear pitch is detected (noise, silence).
     */
    float dominantPitch = 0.f;

    /**
     * @brief Scalar passed to RenderPipeline for adaptive shader-switch / cross-fade timing.
     *
     * < 1.0 → longer times (ambient: e.g. 0.15 = 6.7× slower than default).
     * > 1.0 → shorter times (energetic beat music: e.g. 1.4 = 30% faster).
     * Derived from arousal and ambientFactor in AudioAnalyzer::processBlock().
     */
    float timingScale = 1.f;

    /**
     * @brief Section-change counter (Strophe -> Refrain -> Bridge).
     *
     * Increments once whenever the music moves into a new SECTION: the
     * short-term (~2.5 s) 32-band spectral SHAPE + band energy drift far
     * enough from the long-term (~18 s) average (a real-time simplification
     * of Foote-style self-similarity novelty — a chorus brings new
     * instrumentation/energy, so the fast average pulls away from the slow
     * one). A COUNTER (not a one-frame flag) so the 60 Hz host can never miss
     * a 100 Hz event: it compares against its last-seen value and forces an
     * early, SHORT cross-fade to the next shader. Rate-limited in the
     * analyzer (at least ~12 s between triggers).
     */
    int   sectionCount   = 0;
    float sectionNovelty = 0.f;   ///< The continuous novelty score behind #sectionCount (~0 steady .. ~1 big change).
    /**
     * @brief Song-structure memory: id of the CURRENT section.
     *
     * Index into the analyzer's fingerprint store, assigned at each section
     * trigger. A RETURNING section (chorus #2) gets the SAME id as its first
     * occurrence, so the host can replay the exact same shader + parameters.
     * -1 until the first section trigger.
     */
    int   sectionId      = -1;

    /**
     * @brief Instrument-separated onsets: full-spectrum onset split into three band groups of the 32-band flux.
     *
     * LOW = kick/bass drum (~40..180 Hz), MID = snare/claps/vocal hits,
     * HIGH = hi-hats/cymbals. Each has its own spike test against its own
     * running average + peak-hold reference. Decaying envelopes; the host
     * peak-holds + slew-limits them before upload (audioKick/Snare/Hat), so
     * shaders can pulse per INSTRUMENT: kick -> zoom, snare -> flash, hats ->
     * shimmer (crossmodal-correspondence mapping).
     */
    float onsetKick  = 0.f;   ///< Kick/bass-drum onset envelope (~40..180 Hz group).
    float onsetSnare = 0.f;   ///< Snare/claps/vocal-hit onset envelope (mid group).
    float onsetHat   = 0.f;   ///< Hi-hat/cymbal onset envelope (high group).

    /**
     * @brief Build-up tension, 0..1 (EDM dramaturgy).
     *
     * Rises when the music is BUILDING toward a climax — climbing onset
     * density, rising spectral centroid (filter sweeps), swelling level and
     * snare rolls all add evidence. Smoothed (~0.5 s rise, ~1.5 s fall).
     * Visuals use it as TENSION: shorter trails, slow camera punch-in,
     * tightening geometry. Uploaded as `audioBuildUp`.
     */
    float buildUp = 0.f;
    /**
     * @brief 1.0 at the moment of a detected DROP, then decays over ~1.5 s.
     *
     * Fires on a bass vacuum after a build-up followed by the bass slamming
     * back — the RELEASE that follows the tension. Uploaded as `audioDrop`.
     */
    float dropPulse = 0.f;
    /**
     * @brief Increments once per detected drop.
     *
     * A counter (not a one-frame flag) so the host can never miss one
     * between polls — same pattern as #sectionCount. The host reacts with an
     * immediate quantised scene cut + camera hit.
     */
    int   dropCount = 0;

    /**
     * @brief 1 while the music "holds its breath" (DJ-STOP dramaturgy).
     *
     * A sudden FULL-spectrum collapse in running beat music (the classic DJ
     * stop, 0.1..3 s). The host freezes the motion and dims slightly. (The
     * drop detector watches only the BASS during a build-up; this one wants
     * total silence without any build-up requirement.)
     */
    float breakHold = 0.f;
    /**
     * @brief 1.0 the moment the music slams back after a stop, then decays over ~1 s.
     *
     * The host releases the freeze with a camera hit (folded into the
     * audioDrop uniform for the shaders).
     */
    float breakSlam = 0.f;

    /**
     * @brief Slow loudness-swell envelope (host-filled).
     *
     * The difference between a fast (~1.5 s) and a slow (~8 s) loudness
     * average: rises when the music builds/swells, falls in fade-outs. The
     * one signal that captures AMBIENT dynamics — level is too fast, arousal
     * too slow. Drives bloom breathing / gentle brightness; uploaded as
     * `audioSwell`.
     */
    float swell = 0.f;

    /**
     * @brief Continuous 0..1 position within the BAR (4 beats), from the host's beat-phase PLL + downbeat sync (host-filled).
     *
     * For slow, in-tempo movement (per-bar sweeps) between the fast beat
     * pulse and minute-scale drift. Uploaded as `audioBarPhase`.
     */
    float barPhase = 0.f;

    /**
     * @brief 0..1 envelope that rises while the track is FADING OUT (host-filled, song-end dramaturgy).
     *
     * The 6 s loudness average sinking well below the 20 s one while music is
     * still present. The host answers with a cinematic outro: trails bloom
     * long, the picture dims gently — then the track-change detector starts
     * the next song on a fresh scene.
     */
    float fadeOut = 0.f;

    // ---- Melody history (host-filled ring, for MelodyScript) ----
    /** @brief Number of entries in #melody. */
    static const int kMelodyLen = 96;
    /**
     * @brief dominantPitch sampled every ~80 ms; 96 entries ≈ 7.7 s of melody (host-filled ring).
     *
     * 0 = no clear pitch. Uploaded as audioMelody[96].
     */
    float melody[kMelodyLen] = {};
    float melodyHead = 0.f;   ///< #melody ring head as a 0..1 position (newest just behind it); uploaded as audioMelodyHead.

    /**
     * @brief Self-similarity matrix bookkeeping (host-filled).
     *
     * The host keeps a ring of feature-vector history and a byte similarity
     * matrix ("texSSM", unit 10).
     */
    float ssmHead = 0.f;   ///< Ring head as a 0..1 texture coordinate (shaders unwrap the ring with it).
    float ssmFill = 0.f;   ///< How much of the window is populated yet (0..1).

    /**
     * @brief Scrolling spectrogram history bookkeeping (host-filled).
     *
     * A scrolling spectrogram ("texSpectro", unit 28): 32 log-spaced bands
     * across, ~20 s of history down, written as a ring in the T axis.
     */
    float spectroHead = 0.f;   ///< Ring head as a 0..1 texture coordinate (the newest row sits just BELOW it).
    float spectroFill = 0.f;   ///< How much of the window is populated.

    /**
     * @brief Host-integrated motion phases.
     *
     * NOT produced by AudioAnalyzer; filled in once per frame by
     * RenderPipeline::paint(). Audio-driven motion must never be expressed as a
     * factor multiplied by the absolute 'time' uniform: changing such a
     * factor (or flipping its sign) remaps the whole accumulated phase in a
     * single frame, which is exactly what caused the violent flicker. Instead
     * the host integrates the audio-driven *rate* over each frame's dt into
     * these continuous accumulators, which the shaders simply add to their
     * phase.
     */
    float audioRotPhase = 0.f;   ///< Accumulated rotation angle (radians).
    float audioAdvance  = 0.f;   ///< Accumulated tunnel forward offset (uv units).
};
