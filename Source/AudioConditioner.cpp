/*****************************************************************************\
 *                              AudioConditioner
\*****************************************************************************/
/*! @file
 *
 *  @brief
 *  Implements AudioConditioner — see AudioConditioner.h. Verbatim port of the audio-conditioning block that used to
 *  live inline in RenderPipeline::paint(); only the storage (now member variables) and the external inputs (now
 *  Context fields) changed, never the maths or the order of operations.
 *
 *  @author René Weller
 */

#include "AudioConditioner.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <algorithm>
#include <new>

// Local copies of two tiny helpers also used elsewhere in RenderPipeline.cpp
// (both file-scope `static` there too) -- duplicated rather than shared so
// this class stays fully decoupled from RenderPipeline/Qt, matching the same
// call this codebase already made for GpuSims/PresentPass/SceneScheduler.
/**  Rate-limited step of @p cur toward @p target: moves by at most @p rate * @p dt per call and lands exactly on the
 * target when within reach.
 *
 * @param cur     Current value. (in)
 * @param target  Value to approach. (in)
 * @param rate    Maximum change per second (units of the value per second). (in)
 * @param dt      Elapsed time in seconds. (in)
 *
 * @return
 *   The new value, never overshooting @p target.
 **/
static float slewToward( float cur, float target, float rate, float dt )
{
    float max_step = rate * dt;
    if ( target > cur )
        return ( target - cur < max_step ) ? target : cur + max_step;
    else
        return ( cur - target < max_step ) ? target : cur - max_step;
}
/**  Clamps @p v into [@p lo, @p hi].
 *
 * @param v   Value to clamp. (in)
 * @param lo  Lower bound (inclusive). (in)
 * @param hi  Upper bound (inclusive). (in)
 *
 * @return
 *   @p v limited to the range.
 **/
static float clampParam( float v, float lo, float hi )
{
    return v < lo ? lo : ( v > hi ? hi : v );
}

const char *AudioConditioner::firstNonFinite( const AudioFeatures &f )
{
    const struct
    {
        const char *name;
        float       v;
    } vals[] = {
        { "audioRotPhase", f.audioRotPhase },
        { "audioAdvance", f.audioAdvance },
        { "harmAdvance", f.harmAdvance },
        { "beatPhase", f.beatPhase },
        { "barPhase", f.barPhase },
        { "phrasePos", f.phrasePos },
        { "chromaHue", f.chromaHue },
        { "overallLevel", f.overallLevel },
        { "swell", f.swell },
        { "spectralFlux", f.spectralFlux },
        { "beatDecay", f.beatDecay },
        { "onsetStrength", f.onsetStrength },
        { "dropPulse", f.dropPulse },
        { "harmonicChange", f.harmonicChange },
        { "bassLevel", f.bassLevel },
        { "midLevel", f.midLevel },
        { "highLevel", f.highLevel },
    };
    for ( const auto &v : vals )
        if ( !std::isfinite( v.v ) )
            return v.name;
    return nullptr;
}

void AudioConditioner::reset()
{
    // The members are many and all have their defaults in the class: a fresh object in this place is the reset.
    this->~AudioConditioner();
    new ( this ) AudioConditioner();
}

AudioFeatures AudioConditioner::update( const AudioFeatures &audio, float rawDt, const Context &ctx )
{
    AudioFeatures audio_fx = audio;

    float dt = rawDt;
    if ( dt < 0.f )
        dt = 0.f;
    if ( dt > 0.1f )
        dt = 0.1f; // ignore long stalls (first frame, load hitches)

    // VISUAL spectrum smoothing (anti-jitter): the analyzer's spectrum is
    // tuned for DETECTION and still flutters frame-to-frame — driving
    // GEOMETRY with it makes towers/surfaces tremble nervously (the
    // "zittern" feedback).  Meter ballistics fix it: near-instant attack
    // keeps the punch, a slow release lets bars fall gracefully.
    for ( int i = 0; i < AudioFeatures::SpectrumBands; ++i )
    {
        float v = audio.spectrum[i];
        if ( v >= m_specVis[i] )
            m_specVis[i] += ( v - m_specVis[i] ) * std::min( 1.f, dt * 22.f );
        else
            m_specVis[i] += ( v - m_specVis[i] ) * std::min( 1.f, dt * 3.2f );
        audio_fx.spectrum[i] = m_specVis[i];
    }

    // Global reactivity strength.  All audio-driven MOTION is scaled by this
    // single knob — raise it for a wilder show, lower it for calm.  (Motion is
    // integrated into phases, so larger values stay smooth and never flicker.)
    const float Reactivity = ctx.reactivity; // live-tunable (hotkeys)

    // MASTER GATE: when the audio is not music (speech / video / silence) this
    // fades to 0, so all the audio-driven motion, pulses and mood shifts below
    // smoothly collapse to neutral and the visuals run in their calm,
    // timer-driven "non-audio" mode.  Music returning fades it back to 1.
    // Music gate: clear speech (~0.3 musicPresence) collapses to 0 reaction,
    // while real music (>=~0.6) gets FULL reaction.  Tuned to give genuine
    // music plenty of headroom (so beats/cones stay strong) yet still cut pure
    // speech.  smoothstep over [0.32 .. 0.60].
    float gate_raw = ( audio.musicPresence - 0.32f ) / 0.28f;
    gate_raw = ( gate_raw < 0.f ) ? 0.f : ( gate_raw > 1.f ? 1.f : gate_raw );
    gate_raw = gate_raw * gate_raw * ( 3.f - 2.f * gate_raw ); // smoothstep
    // The gate multiplies EVERY audio signal below, so even slow wobbles of
    // the music/speech classifier around its threshold used to pump the whole
    // show up and down.  Slew it so global reactivity fades over >~0.8 s.
    m_gateSmooth = slewToward( m_gateSmooth, gate_raw, 1.2f, dt );
    const float gate = m_gateSmooth;

    // Continuous beat phase (PLL).  The analyzer's beatPhase RESYNCS (snaps)
    // on every detected beat — early/late detections jumped the phase, and
    // several shaders animate with sin(2*pi*beatPhase) (lava bob, oil zoom,
    // cube pulse, the rotation's beat-breath), so each resync was a visible
    // jerk.  Run our own phase at the estimated tempo and PULL it gently
    // toward the analyzer's phase (wrap-aware): continuous by construction,
    // and in silence (gate 0) it glides to a halt instead of pulsing on.
    {
        float bpm = 40.f + 160.f * audio.estimatedBPM;
        float rate = ( audio.estimatedBPM > 0.004f ) ? ( bpm / 60.f ) : 0.f;
        float err = audio.beatPhase - m_beatPhasePLL;
        err -= floorf( err + 0.5f ); // wrap to [-0.5, 0.5)
        float corr = 2.0f * dt;
        if ( corr > 0.3f )
            corr = 0.3f;
        m_beatPhasePLL += ( dt * rate + err * corr ) * gate;
        m_beatPhasePLL -= floorf( m_beatPhasePLL ); // keep in [0, 1)
    }

    // Bar tracking: the bar position advances on each PLL wrap and re-syncs
    // to the analyzer's accent-detected downbeat.  downbeatTick marks the
    // exact frame a downbeat lands, so scene changes can be quantised onto
    // the musical "1"; barPhase (0..1 over 4 beats) goes to the shaders for
    // slow, in-tempo per-bar movement.
    if ( m_beatPhasePLL < m_prevPllPhase - 0.5f ) // phase wrapped
        m_barBeatHost = ( m_barBeatHost + 1 ) & 3;
    m_prevPllPhase = m_beatPhasePLL;
    m_downbeatTick = ( audio.downbeat > 0.9f && m_prevRawDownbeat <= 0.9f );
    if ( m_downbeatTick )
        m_barBeatHost = 0;
    m_prevRawDownbeat = audio.downbeat;

    // ---- 8-bar PHRASE: where the next drop can land ----
    // Beats are INTEGRATED from the tempo since the last drop, not counted
    // from the host's bar bookkeeping.  Counting arrivals at beat one lost
    // about one bar in four (16 counted against 23 real in 44 s) whenever a
    // downbeat resync and a PLL wrap disagreed; integration cannot lose a
    // bar, it only drifts with the tempo error (0.5 % at 128 BPM is 0.16
    // beats per phrase), and every detected drop re-anchors it -- drops in
    // dance music land ON phrase boundaries, and the detector fires 0.3-1 s
    // ahead of the slam.  Section changes are NOT anchors: measured mid-phrase
    // as often as not (16.6, 34.3, 47.1, 91.0 s on phrases at 15, 30, 45).
    {
        const float bpm = 40.f + 160.f * audio.estimatedBPM;
        const bool  tempo_known = audio.estimatedBPM > 0.004f;
        if ( audio.dropCount != m_phraseDrop )
        {
            m_phraseBeats = 0.f;
            m_phraseDrop = audio.dropCount;
        }
        else if ( tempo_known )
            m_phraseBeats += dt * bpm / 60.f * gate;
        const float beats_in = fmodf( m_phraseBeats, 32.f );
        m_phrasePos = beats_in / 32.f;
        m_phraseSecsLeft = tempo_known ? ( 32.f - beats_in ) * 60.f / bpm : 0.f;
    }

    // Swell: a slow loudness-build envelope (fast average minus slow average)
    // — rises while the music builds, falls in fade-outs.  THE ambient-motion
    // signal: level is too fast and arousal too sluggish to show a drone
    // swelling.  Drives bloom/brightness breathing + a gentle forward surge.
    {
        float a_f = 1.f - expf( -dt / 1.5f );
        float a_s = 1.f - expf( -dt / 8.0f );
        m_swellFast += a_f * ( audio.overallLevel - m_swellFast );
        m_swellSlow += a_s * ( audio.overallLevel - m_swellSlow );
    }
    float swell = ( m_swellFast - m_swellSlow ) * 4.f;
    swell = ( swell < 0.f ) ? 0.f : ( swell > 1.f ? 1.f : swell );

    // SONG-END dramaturgy: a fade-out is the 6 s loudness average sinking
    // well below the 20 s one while music is still (barely) present.  The
    // envelope rises slowly (never fires on a mere break) and releases
    // fast when the level comes back.
    {
        float a6 = 1.f - expf( -dt / 6.f );
        float a20 = 1.f - expf( -dt / 20.f );
        m_fadeSlow6 += a6 * ( audio.overallLevel - m_fadeSlow6 );
        m_fadeSlow20 += a20 * ( audio.overallLevel - m_fadeSlow20 );
        float ev = 0.f;
        if ( m_fadeSlow20 > 0.08f && audio.musicPresence > 0.25f )
            ev = clampParam( ( m_fadeSlow20 * 0.70f - m_fadeSlow6 )
                                 / ( m_fadeSlow20 * 0.45f + 1e-4f ),
                             0.f, 1.f );
        float rate = ( ev > m_fadeOutEnv ) ? 0.35f : 1.8f;
        m_fadeOutEnv = slewToward( m_fadeOutEnv, ev, rate, dt );
    }
    audio_fx.fadeOut = m_fadeOutEnv;

    // MELODY ring: dominantPitch sampled every 80 ms (~7.7 s window).
    m_melodyAccum += dt;
    if ( m_melodyAccum >= 0.08f )
    {
        m_melodyAccum = fmodf( m_melodyAccum, 0.08f );
        // The TUNE, not the root: the melody's note (above the bass line), 0 while none sounds -- a step per note
        // and a pen-up between phrases, where the smoothed melodyPitch drew a glissando through the drums.
        m_melody[m_melodyHead] = audio.melodyNote;
        m_melodyHead = ( m_melodyHead + 1 ) % 96;
    }
    for ( int i = 0; i < 96; ++i )
        audio_fx.melody[i] = m_melody[i];
    audio_fx.melodyHead = static_cast<float>( m_melodyHead ) / 96.f;
    audio_fx.melodyPhase = clampParam( m_melodyAccum / 0.08f, 0.f, 1.f );

    // Ease rotation direction between +1/-1 so reversals never snap.  Even
    // an instant flip would now only change the *rate*, not the phase, but
    // easing keeps the velocity change graceful too.
    float dir_target = ( audio.audioFlip >= 0.f ) ? 1.f : -1.f;
    float dir_step = dt * 1.5f;
    if ( dir_step > 1.f )
        dir_step = 1.f;
    m_audioDir += ( dir_target - m_audioDir ) * dir_step;

    // Ease the kaleidoscope symmetry toward its (beat-chosen) target so it steps
    // gradually through integers instead of snapping (rounded on upload).
    float sides_step = dt * 3.0f;
    if ( sides_step > 1.f )
        sides_step = 1.f;
    m_smoothedSides += ( static_cast<float>( audio.beatSidesHint ) - m_smoothedSides ) * sides_step;
    audio_fx.smoothedSides = m_smoothedSides;

    // "motion" weights INSTANTANEOUS loudness over the slow arousal mood, so the
    // speed visibly rises and falls WITH the music rather than holding a constant
    // fast spin.  (Earlier this was arousal-dominated → a steady ~0.8 rad/s spin
    // that looked fast but unreactive.)  The loudness term is scaled by the
    // arousal, though: the level is AGC-normalised, so a drone read as loud as
    // a dance track and spun the picture at 60 % of its speed (0.24 against
    // 0.40 rad/s, 16.10.2026).  Within a track the level still drives it; a
    // calm track as a whole turns about 40 % slower, an energetic one ~5 %.
    float motion = 0.25f * audio.arousal + 0.75f * audio.overallLevel * ( 0.55f + 0.45f * audio.arousal );

    // A gentle in-tempo "breathing" from the continuous (PLL) beat phase.
    float beat_breath = 0.5f - 0.5f * cosf( m_beatPhasePLL * 6.2831853f );

    // Rotation angular velocity (rad/s).  The rotation SPEED must change only
    // gradually with the music's overall energy — never jerk on individual
    // beats (the rhythmic accent lives in the corner spotlights now).  So the
    // audio term is a SLOWLY slewed energy envelope (no per-beat spikes) with a
    // small gain, plus a tiny steady drift and a gentle in-tempo breathing.
    float rot_energy_target = 0.50f * motion + 0.35f * audio.spectralFlux;
    m_rotEnergy = slewToward( m_rotEnergy, rot_energy_target, 0.7f, dt ); // ~1.4 s to change
    float rot_rate = m_audioDir * Reactivity * gate
                     * ( 0.06f * motion                    // tiny steady drift
                         + 1.20f * m_rotEnergy             // smooth, clearly-varying audio speed
                         + 0.10f * motion * beat_breath ); // gentle in-tempo breathing
    m_audioRotPhase += dt * rot_rate;

    // Tunnel forward advance: also transient-dominated (flux), with only a
    // whisper of steady loudness, so busy passages surge briefly.  (The
    // harmonic change left it on 16.10.2026: since it measures chord changes
    // at all, it would have pushed the 3D labs' flight -- 1187 shaders ride
    // audioAdvance -- forward on every chord; harmAdvance below carries it.)
    float adv_rate = Reactivity * gate
                     * ( 0.015f + 0.08f * audio.spectralFlux + 0.02f * motion
                         + 0.03f * swell ); // ambient builds surge gently
    m_audioAdvance += dt * adv_rate;

    // Harmonic change: the analyzer's spike above its floor (0.3: a held
    // drone reads ~0.02, the noise of real music up to ~0.4), held at its
    // peak and released over ~1.2 s, rising over ~0.4 s: a chord change is a
    // soft swell of a second or two, never a flicker (a typical one peaks at
    // ~0.6; a melody moving over a held chord counts about half as much).
    // Integrated, it is the harmony's advance (~1 per typical chord change,
    // Tools/make_chord_wav.py) -- what a scene adds to a phase, which the
    // envelope itself must never be: a pulse added to a phase moves the
    // picture forward and snaps it back.
    {
        float h = ( audio.harmonicChange - 0.3f ) / 0.5f;
        h = h < 0.f ? 0.f : ( h > 1.f ? 1.f : h );
        m_harmEnv = fmaxf( m_harmEnv * expf( -dt / 1.2f ), h );
        m_harmSmooth = slewToward( m_harmSmooth, m_harmEnv, 2.5f, dt );
        m_harmAdvance += dt * m_harmSmooth * gate / HarmPerChord;
    }

    // Peak-hold + exponential-release envelopes for the transient pulses.
    // The analyzer's raw pulses decay at audio-block rate (gone in ~60 ms):
    // the rise-limited smoothing below could never reach the peak before the
    // target collapsed, which flattened every beat to a barely-visible blip.
    // Holding the peak and releasing exponentially gives the slew a stable
    // target — beats now rise to their FULL strength and breathe out.
    m_beatEnv = fmaxf( m_beatEnv * expf( -dt / 0.30f ), audio.beatDecay );
    m_onsetEnv = fmaxf( m_onsetEnv * expf( -dt / 0.22f ), audio.onsetStrength );
    m_downbeatEnv = fmaxf( m_downbeatEnv * expf( -dt / 0.45f ), audio.downbeat );
    // Instrument-separated onsets: same peak-hold treatment, with releases
    // matched to the instrument (kick booms, hats snap).
    m_kickEnv = fmaxf( m_kickEnv * expf( -dt / 0.24f ), audio.onsetKick );
    m_snareEnv = fmaxf( m_snareEnv * expf( -dt / 0.20f ), audio.onsetSnare );
    m_hatEnv = fmaxf( m_hatEnv * expf( -dt / 0.14f ), audio.onsetHat );

    // Tempo-locked pulse: when the rhythm is confidently periodic, blend a
    // pulse derived from the CONTINUOUS beat phase into the beat target — the
    // visible pulse then sits exactly on the tempo grid and keeps pulsing
    // through the occasional missed kick (detection gaps no longer stutter
    // the rhythm).  Its rise (~1/4 beat) is inherently slower than the slew
    // limit, so photosensitivity safety is unaffected.
    float conf = ( audio.rhythmStrength - 0.40f ) / 0.40f;
    conf = ( conf < 0.f ) ? 0.f : ( conf > 1.f ? 1.f : conf );
    // Latency compensation: lead the DISPLAY phase by M_LatencyLead seconds
    // (loopback capture + analysis + render + scanout lag behind the heard
    // audio) so the tempo pulse and all phase-driven movement land ON the
    // beat the listener hears, not slightly after it.
    float bpm_lead = 40.f + 160.f * audio.estimatedBPM;
    float rate_lead = ( audio.estimatedBPM > 0.004f ) ? ( bpm_lead / 60.f ) : 0.f;
    float phase_lead = m_beatPhasePLL + ctx.latencyLead * rate_lead;
    phase_lead -= floorf( phase_lead );
    float tri = 1.f - 2.f * fminf( phase_lead, 1.f - phase_lead );
    float phase_pulse = tri * tri * tri; // narrow pulse peaked ON the grid
    float beat_target = fmaxf( m_beatEnv, 0.8f * conf * phase_pulse );

    // Slew-limit the visible values (photosensitive-safety: a rise to full
    // takes >= ~150 ms, never a single frame).  The envelopes' exponential
    // release is slower than the fall slew, so the decay stays smooth.
    m_audioBeatSmooth = slewToward( m_audioBeatSmooth, beat_target, 6.0f, dt );
    m_onsetSmooth = slewToward( m_onsetSmooth, m_onsetEnv, 7.0f, dt );
    m_downbeatSmooth = slewToward( m_downbeatSmooth, m_downbeatEnv, 5.0f, dt );
    m_kickSmooth = slewToward( m_kickSmooth, m_kickEnv, 7.0f, dt );
    m_snareSmooth = slewToward( m_snareSmooth, m_snareEnv, 7.0f, dt );
    m_hatSmooth = slewToward( m_hatSmooth, m_hatEnv, 8.0f, dt );
    m_audioLevelSmooth = slewToward( m_audioLevelSmooth, audio.overallLevel, 3.0f, dt );
    m_audioFluxSmooth = slewToward( m_audioFluxSmooth, audio.spectralFlux, 3.0f, dt );
    // Spectral spread, the timbre's width: 268 shaders scale a warp or a whole
    // map with it (the 2D chain lab five of its global maps), so it may only
    // breathe -- the analyzer's own average is ~0.2 s, and the picture's scale
    // wobbled with every chord.  ~1.5 s here; the analysis keeps the fast one.
    if ( m_spreadSmooth < 0.f )
        m_spreadSmooth = audio.spectralSpread;
    m_spreadSmooth += ( audio.spectralSpread - m_spreadSmooth ) * ( 1.f - expf( -dt / 1.5f ) );
    audio_fx.spectralSpread = m_spreadSmooth;

    // Colour-chase phase: the target advances a quarter-turn on each fresh onset (music-gated), so the corner cones
    // light up in sequence (a chase / Lauflicht).  The lamps follow it, a quarter turn in about 200 ms and never
    // faster than 1.25 turns/s: stepped, as it was, the old corner fell and the new one rose in the same frame -- a
    // jump in the brightness of a large corner area.  Unwrapped until both are past a whole turn, so the wrap never
    // runs backwards; a run of onsets queues at most half a turn ahead.
    float onset_gated = audio.onsetStrength * gate;
    if ( onset_gated > 0.30f && m_prevChaseOnset <= 0.15f )
        m_chaseTarget = std::min( m_chaseTarget + 0.25f, m_chasePhase + 0.5f );
    m_prevChaseOnset = onset_gated;
    {
        const float cap = 1.25f * dt;
        m_chasePhase += std::clamp( ( m_chaseTarget - m_chasePhase ) * ( 1.f - expf( -dt / 0.07f ) ), -cap, cap );
        if ( m_chasePhase >= 1.f )
        {
            m_chasePhase -= 1.f;
            m_chaseTarget -= 1.f;
        }
    }

    audio_fx.audioRotPhase = m_audioRotPhase;
    audio_fx.audioAdvance = m_audioAdvance;
    audio_fx.beatDecay = m_audioBeatSmooth * gate;
    audio_fx.onsetStrength = m_onsetSmooth * gate;
    audio_fx.downbeat = m_downbeatSmooth * gate;
    // A drum hit is part of a beat.  Without a steady rhythm the instrument
    // onsets still fire -- the kick detector compares against its own running
    // average, so on an ambient piece every swell of the bass is a "kick", 13
    // to 34 % of the time (16.10.2026) -- and 1050 shaders flash their light
    // with audioKick.  There they count at 35 %; with a rhythm, in full.
    {
        float r = ( audio.rhythmStrength - 0.15f ) / 0.30f;
        r = r < 0.f ? 0.f : ( r > 1.f ? 1.f : r );
        m_drumGate = slewToward( m_drumGate, 0.35f + 0.65f * r * r * ( 3.f - 2.f * r ), 1.0f, dt );
    }
    audio_fx.onsetKick = m_kickSmooth * gate * m_drumGate;
    audio_fx.onsetSnare = m_snareSmooth * gate * m_drumGate;
    audio_fx.onsetHat = m_hatSmooth * gate * m_drumGate;
    audio_fx.beatPhase = phase_lead; // continuous (PLL + latency lead)
    audio_fx.swell = swell * gate;
    // Bar phase with the same lead, kept continuous across the beat wrap
    // by leading the raw bar position (not the wrapped phase).
    {
        float bar_pos = static_cast<float>( m_barBeatHost ) + m_beatPhasePLL + ctx.latencyLead * rate_lead;
        audio_fx.barPhase = ( bar_pos - floorf( bar_pos * 0.25f ) * 4.f ) * 0.25f;
        audio_fx.phrasePos = m_phrasePos;
        audio_fx.phraseSecsLeft = m_phraseSecsLeft;
    }
    audio_fx.overallLevel = m_audioLevelSmooth * gate;
    audio_fx.spectralFlux = m_audioFluxSmooth * gate;
    audio_fx.stereoWidth = audio.stereoWidth * gate;
    audio_fx.buildUp = audio.buildUp * gate;
    // Day/night cycle: a slow wall-clock sawtooth, independent of the
    // music gate (the sky keeps turning even through silence/speech).
    audio_fx.dayPhase = fmodf( ctx.globalTime / 280.f, 1.f );
    // Self-similarity ring bookkeeping for the SelfSimilarity effect.
    audio_fx.ssmHead = ctx.ssmHead;
    audio_fx.ssmFill = ctx.ssmFill;
    // Scrolling-spectrogram ring bookkeeping (a continuous head with the
    // sub-row fraction - details in GpuSims::spectroHeadNorm).
    audio_fx.spectroHead = ctx.spectroHead;
    audio_fx.spectroFill = ctx.spectroFill;
    // The DJ-stop slam-back rides the same "hit" channel as a drop
    // (camera punch + shake + the shaders' audioDrop uniform).
    audio_fx.dropPulse = std::max( audio.dropPulse, audio.breakSlam ) * gate;

    // Dev hook KALEIDO_FORCE_DROP=<sec>: injects one synthetic drop (counter
    // + pulse) at the given global time - makes the whole drop chain
    // (cut/shatter, rewind race, streaks) deterministically testable without
    // having to hit the detector.
    if ( m_forceDropAt < -1.f )
    {
        const char *fd = getenv( "KALEIDO_FORCE_DROP" );
        m_forceDropAt = fd ? static_cast<float>( atof( fd ) ) : -1.f;
    }
    if ( m_forceDropAt >= 0.f && ctx.globalTime >= m_forceDropAt )
    {
        ++m_fakeDrops;
        m_fakePulse = 1.f;
        m_forceDropAt = -1.f;
        fprintf( stderr, "FORCED DROP (t=%.1fs)\n", ctx.globalTime );
    }
    m_fakePulse *= expf( -dt / 0.5f );
    audio_fx.dropPulse = std::max( audio_fx.dropPulse, m_fakePulse );

    // ---- Virtual camera (global "Regie" layer, applied in the present
    // pass): micro drift keeps every effect subtly "filmed"; the downbeat
    // punches in and releases; the bar rolls the frame gently; a build-up
    // slowly tightens the shot; kicks add a tiny shake and a DROP hits
    // hard.  All terms are either slew-limited envelopes or fixed-
    // frequency oscillations — no phase remapping, no flicker.
    {
        // Downbeat punch AND kick shake damped (user feedback: the beat
        // reaction, the pulsing in particular, was too present) - the drop
        // hit (1.1*dropPulse further down, 0.010*dropPulse in the shake)
        // deliberately stays strong, that is the dramatic moment; only the
        // constant PER-BEAT pumping gets quieter.
        if ( m_downbeatTick )
            m_camPunch = std::max( m_camPunch, 0.13f + 0.16f * m_downbeatSmooth );
        m_camPunch *= expf( -dt / 0.35f );
        // The LAST beat-motion channel found in the hunt for "the models
        // still twitch": this virtual camera punches ~1.6% zoom on every
        // downbeat, plus kick shake and bar sway -- measured as a 3 px
        // beat-periodic edge hop on a loaded model's silhouette after every
        // in-scene coupling was gone. On abstract scenes the punch IS the
        // look; on a solid object it pumps the object. Damped, not zeroed:
        // drops still land.
        // calmMotion (settings, default on): the virtual camera does not move
        // at all -- no punch, no shake, no sway, no drift, no gate-weave.  A
        // whole-frame motion that is not the scene's own travel makes Rene
        // physically ill (gaming sickness); rule V7d applies to the host too.
        const float mesh_calm = ctx.calm ? 0.f : 1.f - 0.85f * ctx.meshUp;
        float       punch = ( m_camPunch + 1.1f * audio_fx.dropPulse ) * mesh_calm;
        float       zoom = 1.f + ( ctx.calm ? 0.f : 0.045f * audio_fx.buildUp * audio_fx.buildUp )
                           + 0.055f * punch;
        float       sway = 0.010f * sinf( 6.2831853f * audio_fx.barPhase )
                           * audio.rhythmStrength * gate * mesh_calm;
        float       shake_amp = ( 0.0022f * m_kickSmooth * gate
                                  + 0.010f * audio_fx.dropPulse )
                                * mesh_calm;
        // Gate weave: the fine 24 fps jitter of a film print in the projector
        // - discrete, tiny offsets per "film frame" (no audio factor on
        // absolute time, only a wall-time hash).
        float film = floorf( ctx.globalTime * 24.f );
        float wvx = ( sinf( film * 12.9898f ) * 43758.5453f );
        wvx = ( wvx - floorf( wvx ) - 0.5f ) * 0.0012f;
        float wvy = ( sinf( film * 78.2330f ) * 12543.8530f );
        wvy = ( wvy - floorf( wvy ) - 0.5f ) * 0.0012f;
        float ox = 0.0030f * sinf( ctx.globalTime * 0.23f ) + wvx
                   + shake_amp * sinf( ctx.globalTime * 39.7f );
        float oy = 0.0030f * cosf( ctx.globalTime * 0.17f ) + wvy
                   + shake_amp * cosf( ctx.globalTime * 31.3f );
        if ( ctx.calm )
        {
            ox = 0.f;
            oy = 0.f;
        }
        // The zoom must always pay for the offset + rotation so no edge
        // ever samples outside the frame.  The 2.5D parallax shifts near
        // structures up to 1.8x more than the frame itself - the coverage
        // factor grows with it (the slew's previous-frame value suffices).
        float need = ( fabsf( ox ) + fabsf( oy ) ) * ( 1.f + 1.8f * ctx.trailDepth3D )
                     + 0.62f * fabsf( sway );
        zoom = std::max( zoom, 1.f + 2.4f * need );
        m_camZoom = zoom;
        m_camRot = sway;
        m_camOffX = ox;
        m_camOffY = oy;
    }

    // ---- Zeit-Regie: Drop-Rewind, Break-Scrub, Zeitecho, Atem-anhalten --
    {
        // Drop rewind race: on ~40% of the drops the display jumps 1.6 s into
        // the past and visibly catches up in ~0.5 s - the tape catch-up lands
        // exactly on the drop hit.
        const int drop_count_now = audio.dropCount + m_fakeDrops;
        if ( m_lastDropSeen < 0 )
            m_lastDropSeen = drop_count_now;
        if ( drop_count_now > m_lastDropSeen )
        {
            m_lastDropSeen = drop_count_now;
            // calmMotion: the rewind race is a cut back in time -- off.
            if ( !ctx.calm && gate > 0.5f && ( rand() % 100 ) < 40 )
            {
                m_rewindBack = 1.6f;
                m_rewindRace = true;
            }
        }
        // DJ stop: while the music holds its breath, the picture scrubs
        // backwards (at most ~2.8 s of ring depth); the slam-back snaps it
        // back to live at a high rate.
        if ( !ctx.calm && audio.breakHold > 0.5f && !m_rewindRace )
            m_rewindBack = std::min( m_rewindBack + 1.5f * dt, 2.8f );
        else if ( m_rewindBack > 0.f )
        {
            float rate = m_rewindRace ? 3.2f : 6.0f;
            m_rewindBack -= rate * dt;
            if ( m_rewindBack <= 0.f )
            {
                m_rewindBack = 0.f;
                m_rewindRace = false;
            }
        }
        // Switch the visibility fast but not hard (12/s slew); the END of the
        // race stays a crisp cut back to live.
        float rm_target = ( m_rewindBack > 0.02f ) ? 1.f : 0.f;
        m_rewindMixSm = slewToward( m_rewindMixSm, rm_target, 12.f, dt );

        // Held breath: only the upper half of the build-up counts - a normal
        // groove should not keep desaturating the picture.
        float b_target = std::max( 0.f, std::min( 1.f,
                                                  ( audio.buildUp - 0.5f ) * 2.2f ) )
                         * gate;
        m_breathSm = slewToward( m_breathSm, b_target, 2.5f, dt );

        // CinemaScope letterbox: the bars CREEP in during the build-up
        // (0.8/s - one notices only late that the picture narrows) and tear
        // open abruptly on the drop (12/s).
        {
            // calmMotion: the bars never snap, they only creep (2/s).
            float lb_rate = ( audio_fx.dropPulse > 0.4f && !ctx.calm ) ? 12.f
                                                                       : ( b_target > m_letterSm ? 0.8f : 2.0f );
            m_letterSm = slewToward( m_letterSm, b_target, lb_rate, dt );
        }

        // Bass shockwave: every strong kick starts a distortion ring in the
        // centre (small), a drop a big one.  Pure displacement, no brightness
        // - harmless for photosensitivity.
        {
            bool kick_edge = ( m_kickSmooth > 0.55f && m_prevShockKick <= 0.55f );
            bool drop_edge = ( audio_fx.dropPulse > 0.85f && m_prevShockDrop <= 0.85f );
            m_prevShockKick = m_kickSmooth;
            m_prevShockDrop = audio_fx.dropPulse;
            // calmMotion: no displacement wave through the picture, on any hit.
            if ( ctx.calm )
            { /* shockAmp decays to nothing below */
            }
            else if ( drop_edge )
            {
                m_shockR = 0.f;
                m_shockAmp = 0.030f;
            }
            else if ( kick_edge && gate > 0.5f )
            {
                m_shockR = 0.f;
                m_shockAmp = std::max( m_shockAmp, 0.011f );
            }
            m_shockR += dt * 1.7f;
            m_shockAmp *= expf( -dt / 0.30f );
        }

        // Dev hook KALEIDO_REGIE_TEST: a fixed 12 s pattern (3 s echo, 3 s
        // breath, 2 s rewind scrub, the rest live) for deterministic frame
        // probes of the time direction without real drops/build-ups.
        static int regie_test = -1;
        if ( regie_test < 0 )
            regie_test = getenv( "KALEIDO_REGIE_TEST" ) ? 1 : 0;
        if ( regie_test )
        {
            float ph = fmodf( ctx.globalTime, 12.f );
            m_echoOverride = ( ph < 3.f ) ? 0.40f : 0.f;
            m_breathSm = ( ph >= 3.f && ph < 6.f ) ? 1.f : 0.f;
            m_letterSm = m_breathSm; // the bars follow the breath
            if ( ph >= 6.0f && ph < 6.4f && m_shockR > 1.f )
            {
                m_shockR = 0.f;
                m_shockAmp = 0.03f;
            } // 1 Welle pro Zyklus
            if ( ph >= 7.f && ph < 9.f )
            {
                m_rewindBack = 1.5f;
                m_rewindMixSm = 1.f;
            }
            else if ( ph >= 9.f && ph < 9.5f )
            {
                m_rewindBack = 0.f;
                m_rewindMixSm = 0.f;
            }
        }
    }
    // Mood signals collapse to neutral (0.5 / 0) as music fades out.
    audio_fx.valence = 0.5f + ( audio.valence - 0.5f ) * gate;
    audio_fx.arousal = 0.5f + ( audio.arousal - 0.5f ) * gate;
    audio_fx.spectralCentroid = 0.5f + ( audio.spectralCentroid - 0.5f ) * gate;
    // Key colour: slew the chroma hue AROUND the colour circle (shortest
    // way, max ~20 deg/s) so key changes glide instead of jumping the
    // global palette from one frame to the next.
    //
    // The result is deliberately NOT wrapped back into [0, 1) and NOT
    // scaled by the gate.  About 800 shaders use audioChromaHue as an angle
    // in RADIANS (imgPalette's `ang = audioChromaHue + ...`, hueRot(c, h),
    // sin(h)), not in turns: a value that wraps from 0.999 to 0.0 turned
    // their palette by a whole radian (57 deg) in one frame, every time the
    // key hue crossed C -- and a key near C crosses back and forth.
    // Multiplying by the gate pulled the hue toward 0 whenever the music
    // thinned out, another colour sweep with no musical cause.  Unwrapped,
    // every consumer stays continuous: the radian users see a smooth angle,
    // the turn users (fract(h), cos(2*pi*h)) see the same colour as before.
    // The net winding of a key walk is small, so the value stays O(1..10).
    {
        float d = audio.chromaHue - m_chromaHueSlew;
        d -= floorf( d + 0.5f ); // shortest way, [-0.5, 0.5)
        float max_step = 0.055f * dt;
        if ( d > max_step )
            d = max_step;
        if ( d < -max_step )
            d = -max_step;
        m_chromaHueSlew += d;
    }
    audio_fx.chromaHue = m_chromaHueSlew;
    audio_fx.harmonicChange = m_harmSmooth * gate;
    audio_fx.harmAdvance = m_harmAdvance;
    audio_fx.roughness = audio.roughness * gate;
    audio_fx.sharpness = audio.sharpness * gate;
    audio_fx.deltaPitch = audio.deltaPitch * gate;

    return audio_fx;
}
