/**
 * @file AudioConditioner.cpp
 * @brief Implements AudioConditioner — see AudioConditioner.h. Verbatim port of
 *        the audio-conditioning block that used to live inline in
 *        RenderPipeline::paint(); only the storage (now member variables) and
 *        the external inputs (now Context fields) changed, never the maths
 *        or the order of operations.
 */
#include "AudioConditioner.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <algorithm>

// Local copies of two tiny helpers also used elsewhere in RenderPipeline.cpp
// (both file-scope `static` there too) -- duplicated rather than shared so
// this class stays fully decoupled from RenderPipeline/Qt, matching the same
// call this codebase already made for GpuSims/PresentPass/SceneScheduler.
static float slewToward( float cur, float target, float rate, float dt )
{
	float maxStep = rate * dt;
	if( target > cur )
		return ( target - cur < maxStep ) ? target : cur + maxStep;
	else
		return ( cur - target < maxStep ) ? target : cur - maxStep;
}
static float clampParam( float v, float lo, float hi )
{
	return v < lo ? lo : ( v > hi ? hi : v );
}

AudioFeatures AudioConditioner::update( const AudioFeatures &audio, float rawDt, const Context &ctx )
{
    AudioFeatures audioFx = audio;

    float dt = rawDt;
    if (dt < 0.f)  dt = 0.f;
    if (dt > 0.1f) dt = 0.1f;   // ignore long stalls (first frame, load hitches)

    // VISUAL spectrum smoothing (anti-jitter): the analyzer's spectrum is
    // tuned for DETECTION and still flutters frame-to-frame — driving
    // GEOMETRY with it makes towers/surfaces tremble nervously (the
    // "zittern" feedback).  Meter ballistics fix it: near-instant attack
    // keeps the punch, a slow release lets bars fall gracefully.
    for (int i = 0; i < AudioFeatures::kSpectrumBands; ++i)
    {
        float v = audio.spectrum[i];
        if (v >= m_specVis[i])
            m_specVis[i] += (v - m_specVis[i]) * std::min(1.f, dt * 22.f);
        else
            m_specVis[i] += (v - m_specVis[i]) * std::min(1.f, dt * 3.2f);
        audioFx.spectrum[i] = m_specVis[i];
    }

    // Global reactivity strength.  All audio-driven MOTION is scaled by this
    // single knob — raise it for a wilder show, lower it for calm.  (Motion is
    // integrated into phases, so larger values stay smooth and never flicker.)
    const float kReactivity = ctx.reactivity;   // live-tunable (hotkeys)

    // MASTER GATE: when the audio is not music (speech / video / silence) this
    // fades to 0, so all the audio-driven motion, pulses and mood shifts below
    // smoothly collapse to neutral and the visuals run in their calm,
    // timer-driven "non-audio" mode.  Music returning fades it back to 1.
    // Music gate: clear speech (~0.3 musicPresence) collapses to 0 reaction,
    // while real music (>=~0.6) gets FULL reaction.  Tuned to give genuine
    // music plenty of headroom (so beats/cones stay strong) yet still cut pure
    // speech.  smoothstep over [0.32 .. 0.60].
    float gateRaw = (audio.musicPresence - 0.32f) / 0.28f;
    gateRaw = (gateRaw < 0.f) ? 0.f : (gateRaw > 1.f ? 1.f : gateRaw);
    gateRaw = gateRaw * gateRaw * (3.f - 2.f * gateRaw);   // smoothstep
    // The gate multiplies EVERY audio signal below, so even slow wobbles of
    // the music/speech classifier around its threshold used to pump the whole
    // show up and down.  Slew it so global reactivity fades over >~0.8 s.
    m_gateSmooth = slewToward(m_gateSmooth, gateRaw, 1.2f, dt);
    const float gate = m_gateSmooth;

    // Continuous beat phase (PLL).  The analyzer's beatPhase RESYNCS (snaps)
    // on every detected beat — early/late detections jumped the phase, and
    // several shaders animate with sin(2*pi*beatPhase) (lava bob, oil zoom,
    // cube pulse, the rotation's beat-breath), so each resync was a visible
    // jerk.  Run our own phase at the estimated tempo and PULL it gently
    // toward the analyzer's phase (wrap-aware): continuous by construction,
    // and in silence (gate 0) it glides to a halt instead of pulsing on.
    {
        float bpm  = 40.f + 160.f * audio.estimatedBPM;
        float rate = (audio.estimatedBPM > 0.004f) ? (bpm / 60.f) : 0.f;
        float err  = audio.beatPhase - m_beatPhasePLL;
        err -= floorf(err + 0.5f);                        // wrap to [-0.5, 0.5)
        float corr = 2.0f * dt; if (corr > 0.3f) corr = 0.3f;
        m_beatPhasePLL += (dt * rate + err * corr) * gate;
        m_beatPhasePLL -= floorf(m_beatPhasePLL);         // keep in [0, 1)
    }

    // Bar tracking: the bar position advances on each PLL wrap and re-syncs
    // to the analyzer's accent-detected downbeat.  downbeatTick marks the
    // exact frame a downbeat lands, so scene changes can be quantised onto
    // the musical "1"; barPhase (0..1 over 4 beats) goes to the shaders for
    // slow, in-tempo per-bar movement.
    if (m_beatPhasePLL < m_prevPllPhase - 0.5f)            // phase wrapped
        m_barBeatHost = (m_barBeatHost + 1) & 3;
    m_prevPllPhase = m_beatPhasePLL;
    m_downbeatTick = (audio.downbeat > 0.9f && m_prevRawDownbeat <= 0.9f);
    if (m_downbeatTick)
        m_barBeatHost = 0;
    m_prevRawDownbeat = audio.downbeat;

    // Swell: a slow loudness-build envelope (fast average minus slow average)
    // — rises while the music builds, falls in fade-outs.  THE ambient-motion
    // signal: level is too fast and arousal too sluggish to show a drone
    // swelling.  Drives bloom/brightness breathing + a gentle forward surge.
    {
        float aF = 1.f - expf(-dt / 1.5f);
        float aS = 1.f - expf(-dt / 8.0f);
        m_swellFast += aF * (audio.overallLevel - m_swellFast);
        m_swellSlow += aS * (audio.overallLevel - m_swellSlow);
    }
    float swell = (m_swellFast - m_swellSlow) * 4.f;
    swell = (swell < 0.f) ? 0.f : (swell > 1.f ? 1.f : swell);

    // SONG-END dramaturgy: a fade-out is the 6 s loudness average sinking
    // well below the 20 s one while music is still (barely) present.  The
    // envelope rises slowly (never fires on a mere break) and releases
    // fast when the level comes back.
    {
        float a6  = 1.f - expf(-dt / 6.f);
        float a20 = 1.f - expf(-dt / 20.f);
        m_fadeSlow6  += a6  * (audio.overallLevel - m_fadeSlow6);
        m_fadeSlow20 += a20 * (audio.overallLevel - m_fadeSlow20);
        float ev = 0.f;
        if( m_fadeSlow20 > 0.08f && audio.musicPresence > 0.25f )
            ev = clampParam( (m_fadeSlow20 * 0.70f - m_fadeSlow6)
                             / (m_fadeSlow20 * 0.45f + 1e-4f), 0.f, 1.f );
        float rate = ( ev > m_fadeOutEnv ) ? 0.35f : 1.8f;
        m_fadeOutEnv = slewToward( m_fadeOutEnv, ev, rate, dt );
    }
    audioFx.fadeOut = m_fadeOutEnv;

    // MELODY ring: dominantPitch sampled every 80 ms (~7.7 s window).
    m_melodyAccum += dt;
    if( m_melodyAccum >= 0.08f )
    {
        m_melodyAccum = fmodf( m_melodyAccum, 0.08f );
        m_melody[m_melodyHead] = audio.dominantPitch;
        m_melodyHead = ( m_melodyHead + 1 ) % 96;
    }
    for( int i = 0; i < 96; ++i ) audioFx.melody[i] = m_melody[i];
    audioFx.melodyHead = float(m_melodyHead) / 96.f;

    // Ease rotation direction between +1/-1 so reversals never snap.  Even
    // an instant flip would now only change the *rate*, not the phase, but
    // easing keeps the velocity change graceful too.
    float dirTarget = (audio.audioFlip >= 0.f) ? 1.f : -1.f;
    float dirStep   = dt * 1.5f;
    if (dirStep > 1.f) dirStep = 1.f;
    m_audioDir += (dirTarget - m_audioDir) * dirStep;

    // Ease the kaleidoscope symmetry toward its (beat-chosen) target so it steps
    // gradually through integers instead of snapping (rounded on upload).
    float sidesStep = dt * 3.0f;
    if (sidesStep > 1.f) sidesStep = 1.f;
    m_smoothedSides += (float(audio.beatSidesHint) - m_smoothedSides) * sidesStep;
    audioFx.smoothedSides = m_smoothedSides;

    // "motion" weights INSTANTANEOUS loudness over the slow arousal mood, so the
    // speed visibly rises and falls WITH the music rather than holding a constant
    // fast spin.  (Earlier this was arousal-dominated → a steady ~0.8 rad/s spin
    // that looked fast but unreactive.)
    float motion = 0.25f * audio.arousal + 0.75f * audio.overallLevel;

    // A gentle in-tempo "breathing" from the continuous (PLL) beat phase.
    float beatBreath = 0.5f - 0.5f * cosf(m_beatPhasePLL * 6.2831853f);

    // Rotation angular velocity (rad/s).  The rotation SPEED must change only
    // gradually with the music's overall energy — never jerk on individual
    // beats (the rhythmic accent lives in the corner spotlights now).  So the
    // audio term is a SLOWLY slewed energy envelope (no per-beat spikes) with a
    // small gain, plus a tiny steady drift and a gentle in-tempo breathing.
    float rotEnergyTarget = 0.50f * motion + 0.35f * audio.spectralFlux;
    m_rotEnergy = slewToward(m_rotEnergy, rotEnergyTarget, 0.7f, dt);  // ~1.4 s to change
    float rotRate = m_audioDir * kReactivity * gate
                  * ( 0.06f * motion                       // tiny steady drift
                    + 1.20f * m_rotEnergy                  // smooth, clearly-varying audio speed
                    + 0.10f * motion * beatBreath );       // gentle in-tempo breathing
    m_audioRotPhase += dt * rotRate;

    // Tunnel forward advance: also transient-dominated (flux / harmonic change),
    // with only a whisper of steady loudness, so busy passages surge briefly.
    float advRate = kReactivity * gate
                  * ( 0.015f + 0.08f * audio.spectralFlux + 0.02f * motion
                             + 0.10f * audio.harmonicChange
                             + 0.03f * swell );   // ambient builds surge gently
    m_audioAdvance += dt * advRate;

    // Peak-hold + exponential-release envelopes for the transient pulses.
    // The analyzer's raw pulses decay at audio-block rate (gone in ~60 ms):
    // the rise-limited smoothing below could never reach the peak before the
    // target collapsed, which flattened every beat to a barely-visible blip.
    // Holding the peak and releasing exponentially gives the slew a stable
    // target — beats now rise to their FULL strength and breathe out.
    m_beatEnv     = fmaxf(m_beatEnv     * expf(-dt / 0.30f), audio.beatDecay);
    m_onsetEnv    = fmaxf(m_onsetEnv    * expf(-dt / 0.22f), audio.onsetStrength);
    m_downbeatEnv = fmaxf(m_downbeatEnv * expf(-dt / 0.45f), audio.downbeat);
    // Instrument-separated onsets: same peak-hold treatment, with releases
    // matched to the instrument (kick booms, hats snap).
    m_kickEnv  = fmaxf(m_kickEnv  * expf(-dt / 0.24f), audio.onsetKick);
    m_snareEnv = fmaxf(m_snareEnv * expf(-dt / 0.20f), audio.onsetSnare);
    m_hatEnv   = fmaxf(m_hatEnv   * expf(-dt / 0.14f), audio.onsetHat);

    // Tempo-locked pulse: when the rhythm is confidently periodic, blend a
    // pulse derived from the CONTINUOUS beat phase into the beat target — the
    // visible pulse then sits exactly on the tempo grid and keeps pulsing
    // through the occasional missed kick (detection gaps no longer stutter
    // the rhythm).  Its rise (~1/4 beat) is inherently slower than the slew
    // limit, so photosensitivity safety is unaffected.
    float conf = (audio.rhythmStrength - 0.40f) / 0.40f;
    conf = (conf < 0.f) ? 0.f : (conf > 1.f ? 1.f : conf);
    // Latency compensation: lead the DISPLAY phase by s_latencyLead seconds
    // (loopback capture + analysis + render + scanout lag behind the heard
    // audio) so the tempo pulse and all phase-driven movement land ON the
    // beat the listener hears, not slightly after it.
    float bpmLead   = 40.f + 160.f * audio.estimatedBPM;
    float rateLead  = (audio.estimatedBPM > 0.004f) ? (bpmLead / 60.f) : 0.f;
    float phaseLead = m_beatPhasePLL + ctx.latencyLead * rateLead;
    phaseLead -= floorf(phaseLead);
    float tri  = 1.f - 2.f * fminf(phaseLead, 1.f - phaseLead);
    float phasePulse = tri * tri * tri;          // narrow pulse peaked ON the grid
    float beatTarget = fmaxf(m_beatEnv, 0.8f * conf * phasePulse);

    // Slew-limit the visible values (photosensitive-safety: a rise to full
    // takes >= ~150 ms, never a single frame).  The envelopes' exponential
    // release is slower than the fall slew, so the decay stays smooth.
    m_audioBeatSmooth  = slewToward(m_audioBeatSmooth,  beatTarget,    6.0f, dt);
    m_onsetSmooth      = slewToward(m_onsetSmooth,      m_onsetEnv,    7.0f, dt);
    m_downbeatSmooth   = slewToward(m_downbeatSmooth,   m_downbeatEnv, 5.0f, dt);
    m_kickSmooth       = slewToward(m_kickSmooth,       m_kickEnv,     7.0f, dt);
    m_snareSmooth      = slewToward(m_snareSmooth,      m_snareEnv,    7.0f, dt);
    m_hatSmooth        = slewToward(m_hatSmooth,        m_hatEnv,      8.0f, dt);
    m_audioLevelSmooth = slewToward(m_audioLevelSmooth, audio.overallLevel, 3.0f, dt);
    m_audioFluxSmooth  = slewToward(m_audioFluxSmooth,  audio.spectralFlux, 3.0f, dt);

    // Colour-chase phase: advance a quarter-turn on each fresh onset (music-
    // gated), so the corner cones light up in sequence (a chase / Lauflicht).
    float onsetGated = audio.onsetStrength * gate;
    if( onsetGated > 0.30f && m_prevChaseOnset <= 0.15f )
        m_chasePhase = fmodf( m_chasePhase + 0.25f, 1.0f );
    m_prevChaseOnset = onsetGated;

    audioFx.audioRotPhase = m_audioRotPhase;
    audioFx.audioAdvance  = m_audioAdvance;
    audioFx.beatDecay     = m_audioBeatSmooth     * gate;
    audioFx.onsetStrength = m_onsetSmooth         * gate;
    audioFx.downbeat      = m_downbeatSmooth      * gate;
    audioFx.onsetKick     = m_kickSmooth          * gate;
    audioFx.onsetSnare    = m_snareSmooth         * gate;
    audioFx.onsetHat      = m_hatSmooth           * gate;
    audioFx.beatPhase     = phaseLead;            // continuous (PLL + latency lead)
    audioFx.swell         = swell * gate;
    // Bar phase with the same lead, kept continuous across the beat wrap
    // by leading the raw bar position (not the wrapped phase).
    {
        float barPos = float(m_barBeatHost) + m_beatPhasePLL + ctx.latencyLead * rateLead;
        audioFx.barPhase = (barPos - floorf(barPos * 0.25f) * 4.f) * 0.25f;
    }
    audioFx.overallLevel  = m_audioLevelSmooth    * gate;
    audioFx.spectralFlux  = m_audioFluxSmooth     * gate;
    audioFx.stereoWidth   = audio.stereoWidth     * gate;
    audioFx.buildUp       = audio.buildUp         * gate;
    // Day/night cycle: a slow wall-clock sawtooth, independent of the
    // music gate (the sky keeps turning even through silence/speech).
    audioFx.dayPhase      = fmodf( ctx.globalTime / 280.f, 1.f );
    // Self-similarity ring bookkeeping for the SelfSimilarity effect.
    audioFx.ssmHead       = ctx.ssmHead;
    audioFx.ssmFill       = ctx.ssmFill;
    // Scrolling-spectrogram ring bookkeeping (kontinuierlicher Kopf mit
    // Sub-Zeilen-Anteil - Details in GpuSims::spectroHeadNorm).
    audioFx.spectroHead   = ctx.spectroHead;
    audioFx.spectroFill   = ctx.spectroFill;
    // The DJ-stop slam-back rides the same "hit" channel as a drop
    // (camera punch + shake + the shaders' audioDrop uniform).
    audioFx.dropPulse     = std::max( audio.dropPulse, audio.breakSlam ) * gate;

    // Dev-Haken KALEIDO_FORCE_DROP=<sek>: injiziert einmalig einen
    // synthetischen Drop (Zaehler + Puls) zur angegebenen globalen Zeit -
    // macht die ganze Drop-Kette (Schnitt/Shatter, Rewind-Race, Streaks)
    // deterministisch probbar, ohne den Detektor treffen zu muessen.
    if( m_forceDropAt < -1.f )
    {
        const char *fd = getenv( "KALEIDO_FORCE_DROP" );
        m_forceDropAt = fd ? (float)atof( fd ) : -1.f;
    }
    if( m_forceDropAt >= 0.f && ctx.globalTime >= m_forceDropAt )
    {
        ++m_fakeDrops;
        m_fakePulse   = 1.f;
        m_forceDropAt = -1.f;
        fprintf( stderr, "FORCED DROP (t=%.1fs)\n", ctx.globalTime );
    }
    m_fakePulse *= expf( -dt / 0.5f );
    audioFx.dropPulse = std::max( audioFx.dropPulse, m_fakePulse );

    // ---- Virtual camera (global "Regie" layer, applied in the present
    // pass): micro drift keeps every effect subtly "filmed"; the downbeat
    // punches in and releases; the bar rolls the frame gently; a build-up
    // slowly tightens the shot; kicks add a tiny shake and a DROP hits
    // hard.  All terms are either slew-limited envelopes or fixed-
    // frequency oscillations — no phase remapping, no flicker.
    {
        // Downbeat-Punch UND Kick-Shake gedaempft (User-Feedback: die
        // Beat-Reaktion, insbesondere das Pulsieren, war zu praesent) -
        // der Drop-Hit (1.1*dropPulse weiter unten, 0.010*dropPulse im
        // Shake) bleibt bewusst kraeftig, das ist der dramaturgische
        // Moment; nur das PRO-BEAT-Dauerpumpen wird leiser.
        if( m_downbeatTick )
            m_camPunch = std::max( m_camPunch, 0.13f + 0.16f * m_downbeatSmooth );
        m_camPunch *= expf( -dt / 0.35f );
        float punch = m_camPunch + 1.1f * audioFx.dropPulse;
        float zoom  = 1.f + 0.045f * audioFx.buildUp * audioFx.buildUp
                          + 0.055f * punch;
        float sway  = 0.010f * sinf( 6.2831853f * audioFx.barPhase )
                    * audio.rhythmStrength * gate;
        float shakeAmp = 0.0022f * m_kickSmooth * gate
                       + 0.010f  * audioFx.dropPulse;
        // Gate-Weave: das feine 24-fps-Zittern einer Filmkopie im
        // Projektor - diskrete, winzige Versaetze pro "Filmbild"
        // (kein Audio-Faktor auf absoluter Zeit, nur Wandzeit-Hash).
        float film = floorf( ctx.globalTime * 24.f );
        float wvx  = ( sinf( film * 12.9898f ) * 43758.5453f );
        wvx = ( wvx - floorf( wvx ) - 0.5f ) * 0.0012f;
        float wvy  = ( sinf( film * 78.2330f ) * 12543.8530f );
        wvy = ( wvy - floorf( wvy ) - 0.5f ) * 0.0012f;
        float ox = 0.0030f * sinf( ctx.globalTime * 0.23f ) + wvx
                 + shakeAmp * sinf( ctx.globalTime * 39.7f );
        float oy = 0.0030f * cosf( ctx.globalTime * 0.17f ) + wvy
                 + shakeAmp * cosf( ctx.globalTime * 31.3f );
        // The zoom must always pay for the offset + rotation so no edge
        // ever samples outside the frame.  Die 2.5D-Parallaxe verschiebt
        // nahe Strukturen bis 1.8x staerker als den Frame selbst - der
        // Deckungs-Faktor waechst mit (Vorframe-Wert des Slews reicht).
        float need = ( fabsf(ox) + fabsf(oy) ) * ( 1.f + 1.8f * ctx.trailDepth3D )
                   + 0.62f * fabsf(sway);
        zoom = std::max( zoom, 1.f + 2.4f * need );
        m_camZoom = zoom; m_camRot = sway;
        m_camOffX = ox;   m_camOffY = oy;
    }

    // ---- Zeit-Regie: Drop-Rewind, Break-Scrub, Zeitecho, Atem-anhalten --
    {
        // Drop-Rewind-Race: auf ~40% der Drops springt die Anzeige 1.6 s
        // in die Vergangenheit und holt in ~0.5 s sichtbar auf - der
        // Tape-Catch-up landet genau im Drop-Hit.
        const int dropCountNow = audio.dropCount + m_fakeDrops;
        if( m_lastDropSeen < 0 )
            m_lastDropSeen = dropCountNow;
        if( dropCountNow > m_lastDropSeen )
        {
            m_lastDropSeen = dropCountNow;
            if( gate > 0.5f && ( rand() % 100 ) < 40 )
            {
                m_rewindBack = 1.6f;
                m_rewindRace = true;
            }
        }
        // DJ-Stop: solange die Musik den Atem anhaelt, scrubbt das Bild
        // rueckwaerts (max ~2.8 s Ring-Tiefe); der Slam-back schnappt es
        // mit hoher Rate zurueck auf live.
        if( audio.breakHold > 0.5f && !m_rewindRace )
            m_rewindBack = std::min( m_rewindBack + 1.5f * dt, 2.8f );
        else if( m_rewindBack > 0.f )
        {
            float rate = m_rewindRace ? 3.2f : 6.0f;
            m_rewindBack -= rate * dt;
            if( m_rewindBack <= 0.f ) { m_rewindBack = 0.f; m_rewindRace = false; }
        }
        // Sichtbarkeit schnell, aber nicht hart schalten (12/s Slew);
        // das ENDE des Race bleibt ein knackiger Schnitt zurueck auf live.
        float rmTarget = ( m_rewindBack > 0.02f ) ? 1.f : 0.f;
        m_rewindMixSm = slewToward( m_rewindMixSm, rmTarget, 12.f, dt );

        // Atem-anhalten: erst die obere Haelfte des Build-ups zaehlt -
        // ein normaler Groove soll das Bild nicht staendig entsaettigen.
        float bTarget = std::max( 0.f, std::min( 1.f,
                            ( audio.buildUp - 0.5f ) * 2.2f ) ) * gate;
        m_breathSm = slewToward( m_breathSm, bTarget, 2.5f, dt );

        // CinemaScope-Letterbox: die Balken KRIECHEN im Build-up herein
        // (0.8/s - man merkt erst spaet, dass das Bild enger wird) und
        // reissen auf den Drop schlagartig auf (12/s).
        {
            float lbRate = ( audioFx.dropPulse > 0.4f ) ? 12.f
                         : ( bTarget > m_letterSm ? 0.8f : 2.0f );
            m_letterSm = slewToward( m_letterSm, bTarget, lbRate, dt );
        }

        // Bass-Schockwelle: auf jeden kraeftigen Kick startet ein
        // Verzerrungsring im Zentrum (klein), auf einen Drop ein grosser.
        // Reine Verschiebung, keine Helligkeit - photosensitiv unkritisch.
        {
            bool kickEdge = ( m_kickSmooth > 0.55f && m_prevShockKick <= 0.55f );
            bool dropEdge = ( audioFx.dropPulse > 0.85f && m_prevShockDrop <= 0.85f );
            m_prevShockKick = m_kickSmooth;
            m_prevShockDrop = audioFx.dropPulse;
            if( dropEdge )
                { m_shockR = 0.f; m_shockAmp = 0.030f; }
            else if( kickEdge && gate > 0.5f )
                { m_shockR = 0.f; m_shockAmp = std::max( m_shockAmp, 0.011f ); }
            m_shockR   += dt * 1.7f;
            m_shockAmp *= expf( -dt / 0.30f );
        }

        // Dev-Haken KALEIDO_REGIE_TEST: festes 12-s-Muster (3 s Echo,
        // 3 s Breath, 2 s Rewind-Scrub, Rest live) fuer deterministische
        // Frame-Proben der Zeit-Regie ohne echte Drops/Build-ups.
        static int s_regieTest = -1;
        if( s_regieTest < 0 )
            s_regieTest = getenv( "KALEIDO_REGIE_TEST" ) ? 1 : 0;
        if( s_regieTest )
        {
            float ph = fmodf( ctx.globalTime, 12.f );
            m_echoOverride = ( ph < 3.f ) ? 0.40f : 0.f;
            m_breathSm   = ( ph >= 3.f && ph < 6.f ) ? 1.f : 0.f;
            m_letterSm   = m_breathSm;             // Balken folgen dem Breath
            if( ph >= 6.0f && ph < 6.4f && m_shockR > 1.f )
                { m_shockR = 0.f; m_shockAmp = 0.03f; }   // 1 Welle pro Zyklus
            if( ph >= 7.f && ph < 9.f )
                { m_rewindBack = 1.5f; m_rewindMixSm = 1.f; }
            else if( ph >= 9.f && ph < 9.5f )
                { m_rewindBack = 0.f; m_rewindMixSm = 0.f; }
        }
    }
    // Mood signals collapse to neutral (0.5 / 0) as music fades out.
    audioFx.valence         = 0.5f + (audio.valence         - 0.5f) * gate;
    audioFx.arousal         = 0.5f + (audio.arousal         - 0.5f) * gate;
    audioFx.spectralCentroid= 0.5f + (audio.spectralCentroid- 0.5f) * gate;
    // Key colour: slew the chroma hue AROUND the colour circle (shortest
    // way, max ~20 deg/s) so key changes glide instead of jumping the
    // global palette from one frame to the next.
    {
        float d = audio.chromaHue - m_chromaHueSlew;
        d -= floorf(d + 0.5f);                        // wrap to [-0.5, 0.5)
        float maxStep = 0.055f * dt;
        if (d >  maxStep) d =  maxStep;
        if (d < -maxStep) d = -maxStep;
        m_chromaHueSlew += d;
        m_chromaHueSlew -= floorf(m_chromaHueSlew);   // keep in [0, 1)
    }
    audioFx.chromaHue       = m_chromaHueSlew * gate;
    audioFx.harmonicChange  = audio.harmonicChange * gate;
    audioFx.roughness       = audio.roughness      * gate;
    audioFx.sharpness       = audio.sharpness      * gate;
    audioFx.deltaPitch      = audio.deltaPitch     * gate;

    return audioFx;
}
