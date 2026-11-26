//---------------------------------------------------------------------------
//                              PictureGuard
//---------------------------------------------------------------------------
//  Copyright (C): 2026 reneweller, MIT License (see LICENSE)
//---------------------------------------------------------------------------
/*! @file
 *
 *  @brief
 *  The guard for a dark or frozen picture (docs/PLAN_2026-11-26.md, W1): while music plays and the picture stays
 *  black or stands still, first a new photo, then an early scene change on the phrase.
 *
 *  The input is a tiny picture: the mip level of the frame whose long side is at most 16 texels (15 x 8 at 1080p),
 *  read back without a stall every 6th frame (PresentPass::guardSample()) -- the scene as rendered, before the
 *  exposure, the grade and the blackout.  Two questions are asked of it:
 *
 *  - **Dark**: the mean luminance (Rec. 601 weights on the stored values, as Tools/screen.py measures) is below
 *    Config::darkMean AND no texel is above Config::darkPeak.  The catalogue's darkest scenes by design (BlackHole,
 *    OrbitalShells, VectorscopeBloom: frame means 0.006-0.024 after the exposure, which lifts a dark scene by up to
 *    1.8) stay above it; a scene that shows practically nothing does not.  The peak keeps a small bright object on
 *    black from counting as black.
 *  - **Frozen**: no texel channel has moved by more than Config::stillStep away from the sample the stillness began
 *    with.  Measured against that anchor, not against the last sample: a slow drift adds up and ends the stillness,
 *    a picture that stands keeps the anchor for good.  The mips are 8 bit, so a standing picture reads exactly 0.
 *
 *  A condition must hold for Config::darkSecs or Config::frozenSecs of ARMED time (the caller decides what arms the
 *  guard: music playing, no fade, no blackout, no DJ stop, no freeze, no pin ...; while it is not armed the clocks
 *  pause).  Then the first stage asks for a new photo -- a dark photo is the common cause -- and the clocks start
 *  over (a photo already fading in is waited for instead, Config::busySecs at most: a picture that stays dark or
 *  still while a photo fades in does not depend on the photo); if the condition holds for Config::stage2Secs again,
 *  the second stage asks the scheduler for an early scene change.  A new scene starts everything over
 *  (sceneChanged()).
 *
 *  Kept Qt- and GL-free so `Kaleidoscope.exe -q` checks it with made-up samples.
 *
 *  @author René Weller
 */

#pragma once

#include <cmath>
#include <vector>

/** @class PictureGuard
 *
 * Detection and the two stages for one pipeline; RenderPipeline feeds it and carries out what it asks for.
 **/
class PictureGuard
{
public:
    /** What the guard asks for. */
    enum class ActionE
    {
        NONE = 0, ///< nothing
        PHOTO,    ///< the first stage: cross-fade to the next photo now
        SCENE     ///< the second stage: end the scene early, on the phrase
    };
    /** Why. */
    enum class CauseE
    {
        NONE = 0, ///< nothing found
        DARK,     ///< the picture is practically black
        FROZEN    ///< the picture stands still
    };
    /** The thresholds (docs/engine-internals-69-guard.md: where each number comes from). */
    struct Config
    {
        float darkMean = 0.0045f; ///< mean luminance below this ...
        float darkPeak = 0.030f;  ///< ... and no texel above this: dark
        float stillStep = 0.012f; ///< no texel channel further than this (3/255) from the anchor: still
        float darkSecs = 20.f;    ///< armed seconds dark before the first stage
        float frozenSecs = 20.f;  ///< armed seconds still before the first stage
        float stage2Secs = 15.f;  ///< armed seconds dark or still after the photo before the second stage
        float retrySecs = 45.f;   ///< a scene change asked for and not come: asked again after this
        float recoverSecs = 30.f; ///< after the photo, this long fine: the photo was the cause, back to stage 0
        float busySecs = 8.f;     ///< a photo fading in this long without curing it: the photo is not the cause
    };

    PictureGuard() = default;

    /**  Replaces the thresholds.
     *
     * @param c  The new ones. (in)
     **/
    void setConfig( const Config &c ) { m_cfg = c; }
    /**  The thresholds.
     *
     * @return
     *   The thresholds in use.
     **/
    const Config &config() const { return m_cfg; }

    /** Whether the first stage can change the photo. */
    enum class PhotoE
    {
        NONE = 0, ///< no photos to change (a live picture, a single photo): the scene change comes at once
        READY,    ///< the next photo is loaded and none is fading in
        BUSY      ///< a photo is fading in or loading: the first stage waits for it (Config::busySecs at most)
    };

    /**  One sample of the picture.
     *
     * @param rgb     The texels, rgb interleaved, 0..1. (in)
     * @param texels  Their number. (in)
     * @param dt      Seconds since the previous sample. (in)
     * @param armed   Whether the guard may count this time (music plays, nothing intended is on). (in)
     * @param photo   Whether a new photo can be asked for now. (in)
     *
     * @return
     *   What to do now; NONE almost always.
     **/
    ActionE sample( const float *rgb, int texels, float dt, bool armed, PhotoE photo )
    {
        if ( !rgb || texels <= 0 )
            return ActionE::NONE;
        float sum = 0.f, peak = 0.f, step = 0.f;
        for ( int i = 0; i < texels; ++i )
        {
            const float l = 0.299f * rgb[3 * i] + 0.587f * rgb[3 * i + 1] + 0.114f * rgb[3 * i + 2];
            sum += l;
            peak = l > peak ? l : peak;
        }
        m_mean = sum / static_cast<float>( texels );
        m_peak = peak;
        if ( static_cast<int>( m_anchor.size() ) != 3 * texels )
        {
            m_anchor.assign( rgb, rgb + 3 * texels );
            m_still = 0.f;
        }
        for ( int i = 0; i < 3 * texels; ++i )
        {
            const float d = std::fabs( rgb[i] - m_anchor[i] );
            step = d > step ? d : step;
        }
        m_step = step;
        if ( !armed )
            return ActionE::NONE; // the clocks pause; the anchor stays where the stillness began
        if ( dt < 0.f )
            dt = 0.f;
        const bool dark = m_mean < m_cfg.darkMean && m_peak < m_cfg.darkPeak;
        m_dark = dark ? m_dark + dt : 0.f;
        if ( step > m_cfg.stillStep )
        {
            m_anchor.assign( rgb, rgb + 3 * texels );
            m_still = 0.f;
        }
        else
            m_still += dt;
        m_sinceAction += dt;
        m_good = ( !dark && m_still < 0.5f * m_cfg.frozenSecs ) ? m_good + dt : 0.f;
        // A photo fading in while the picture stays dark, or still: its seconds in the current dark or still streak.
        const float busy = photo == PhotoE::BUSY ? dt : 0.f;
        m_busyDark = m_dark > 0.f ? m_busyDark + busy : 0.f;
        m_busyStill = m_still > 0.f ? m_busyStill + busy : 0.f;

        const CauseE now = m_dark > 0.f && m_dark >= m_still ? CauseE::DARK
                           : m_still > 0.f                   ? CauseE::FROZEN
                                                             : CauseE::NONE;
        switch ( m_stage )
        {
            case 0:
                // A photo already on its way may be the cure: the first stage waits for it (the clocks run on) --
                // unless it has been fading in for busySecs and the picture is still dark or still: then the photo
                // is not the cause (a scene that shows the photo lightens and moves the moment one fades in), and
                // the second stage comes at once.  The photos of a preset fade 20-80 s and stand 10-40 s: waiting
                // for every fade to end made the first stage a minute late (the app test, 27.11.2026).
                if ( m_dark >= m_cfg.darkSecs || m_still >= m_cfg.frozenSecs )
                {
                    const CauseE why = m_dark >= m_cfg.darkSecs ? CauseE::DARK : CauseE::FROZEN;
                    if ( photo == PhotoE::READY )
                        return act( why, ActionE::PHOTO );
                    if ( photo == PhotoE::NONE
                         || ( why == CauseE::DARK ? m_busyDark : m_busyStill ) >= m_cfg.busySecs )
                        return act( why, ActionE::SCENE );
                }
                break;
            case 1:
                if ( m_dark >= m_cfg.stage2Secs || m_still >= m_cfg.stage2Secs )
                    return act( m_dark >= m_cfg.stage2Secs ? CauseE::DARK : CauseE::FROZEN, ActionE::SCENE );
                if ( m_good >= m_cfg.recoverSecs )
                    m_stage = 0; // the photo was it
                break;
            default:
                if ( m_sinceAction >= m_cfg.retrySecs && now != CauseE::NONE
                     && ( m_dark >= m_cfg.stage2Secs || m_still >= m_cfg.stage2Secs ) )
                    return act( now, ActionE::SCENE ); // the change did not come (a long phrase wait, a lab)
                break;
        }
        return ActionE::NONE;
    }

    /** A new scene is on screen (or a fade runs): everything starts over. */
    void sceneChanged()
    {
        m_stage = 0;
        m_dark = m_still = m_sinceAction = m_good = m_busyDark = m_busyStill = 0.f;
        m_anchor.clear();
        m_cause = CauseE::NONE;
    }

    /**  The stage reached: 0 nothing done, 1 a photo asked for, 2 a scene change asked for.
     *
     * @return
     *   The stage.
     **/
    int stage() const { return m_stage; }
    /**  Why the last action was asked for.
     *
     * @return
     *   The cause; NONE before any action since the last sceneChanged().
     **/
    CauseE cause() const { return m_cause; }
    /**  Armed seconds the picture has been dark in a row (before the last action: reset there).
     *
     * @return
     *   Seconds.
     **/
    float darkFor() const { return m_dark; }
    /**  Armed seconds the picture has stood still.
     *
     * @return
     *   Seconds.
     **/
    float stillFor() const { return m_still; }
    /**  The last sample's mean luminance.
     *
     * @return
     *   0..1.
     **/
    float mean() const { return m_mean; }
    /**  The last sample's brightest texel's luminance.
     *
     * @return
     *   0..1.
     **/
    float peak() const { return m_peak; }
    /**  The last sample's largest channel distance from the stillness anchor.
     *
     * @return
     *   0..1.
     **/
    float step() const { return m_step; }

private:
    /**  Records an action and starts the clocks over.
     *
     * @param why  Its cause. (in)
     * @param a    The action. (in)
     *
     * @return
     *   @p a.
     **/
    ActionE act( CauseE why, ActionE a )
    {
        m_cause = why;
        m_stage = a == ActionE::PHOTO ? 1 : 2;
        m_dark = m_still = m_sinceAction = m_good = m_busyDark = m_busyStill = 0.f;
        return a;
    }

    Config             m_cfg;                  ///< config()
    std::vector<float> m_anchor;               ///< The sample the current stillness began with.
    int                m_stage = 0;            ///< stage()
    CauseE             m_cause = CauseE::NONE; ///< cause()
    float              m_dark = 0.f;           ///< darkFor()
    float              m_still = 0.f;          ///< stillFor()
    float              m_sinceAction = 0.f;    ///< Armed seconds since the last action.
    float              m_good = 0.f;           ///< Armed seconds neither dark nor still, in a row.
    float              m_busyDark = 0.f;       ///< Armed seconds of the dark streak with a photo fading in.
    float              m_busyStill = 0.f;      ///< Armed seconds of the stillness with a photo fading in.
    float              m_mean = 0.f;           ///< mean()
    float              m_peak = 0.f;           ///< peak()
    float              m_step = 0.f;           ///< step()
};
