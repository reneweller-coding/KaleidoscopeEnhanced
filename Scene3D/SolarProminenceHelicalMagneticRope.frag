#version 330 core
out vec4 fragColor;
/**
 * @file SolarProminenceHelicalMagneticRope.frag
 * @brief SOLAR PROMINENCE HELICAL MAGNETIC ROPE: Arching solar coronal magnetic flux rope supporting
 * dense chromospheric plasma. Torsional magnetic helicity, kink instabilities, coronal mass ejection
 * (CME) flare reconnection bursts, and extreme ultraviolet solar photo texturing.
 *   audioAdvance -> navigates solar prominence magnetic flux rope ascent & twist rotation
 *   audioKick    -> flashes solar flare magnetic reconnection & coronal mass ejection bursts
 *   audioSwell   -> widens magnetic flux rope diameter & chromospheric H-alpha emission glow,
 *                   and brightens the coronal streamer fans
 *   audioCentroid-> shifts extreme ultraviolet (He II 304A / Fe IX 171A) solar color spectra
 *
 * Four helical flux ropes stand on a photospheric limb spread across the frame,
 * with four wide, dim coronal streamer fans carrying the corona around them
 * (vVeil selects between the two shading models).
 *
 * Per-activation variety:
 *   ribbonWidthP float magnetic flux strand ribbon width (0.02..0.1)
 *   flareGlowP   float coronal flare apex luminance gain (0.8..2.5)
 */

in vec2 vUV;
in float vSide;
in float vRibbonID;
in vec3 vCol;
in float vFlarePulse;
in float vVeil;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;

uniform float flareGlowP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    float core = pow(1.0 - abs(vSide), 2.2);
    float edge = exp(-abs(abs(vSide) - 0.9) * 14.0);

    vec3 photo = img(vUV);
    vec3 col;

    if (vVeil > 0.5)
    {
        // ---- CORONAL STREAMER FAN ------------------------------------
        // Broad and faint, but never a flat wash: the photo sample and the
        // radial ray striations give the corona real structure, which is what
        // stops the negative space reading as dead black.
        float prof  = pow(1.0 - abs(vSide), 1.35);
        float striae = 0.52 + 0.48 * sin(vSide * 13.0 + vRibbonID * 2.7)
                            * sin(vUV.x * 5.0 - vRibbonID * 1.3);
        float faint  = smoothstep(1.0, 0.15, vUV.x);   // thins out far from the limb
        // Coronal density wave running outward along the fan: the streamers are
        // by far the largest thing on screen and NOTHING in them moved (their
        // only animation was a 0.08 rad/s wobble of the fan axis), which is what
        // pinned the whole scene under the static threshold. Constant coefficient
        // on `time`, so anti-flicker safe; 0.25 Hz, well inside the budget.
        float dens = 0.62 + 0.38 * sin(vUV.x * 7.0 - time * 1.6 + vRibbonID * 2.1);
        col  = vCol * (0.30 + 0.85 * photo) * prof * striae * (0.55 + 0.45 * faint) * dens;
        // The corona used to be dimmed TWICE -- 0.45 here and 0.45 again in the
        // shared additive dim below -- which left the fans at ~0.02 luma. That is
        // under the level at which a tile registers as content at all, so the
        // largest, brightest part of the scene scored as empty black (occ 0.08).
        col *= 1.35 * (0.85 + 0.35 * audioSwell);
        col += vCol * (audioKick * 0.05);
    }
    else
    {
        col  = vCol * (0.6 + 0.4 * photo) * core * 1.3;
        // Cap the flare: four apexes now flash instead of one, and an
        // uncapped burst would clip them all to flat white on a loud beat.
        col += vec3(1.0, 0.95, 0.8)
             * min(vFlarePulse * (flareGlowP > 0.01 ? flareGlowP : 1.4) * 2.2, 3.0);
        col += vCol * edge * 1.5;
        col *= (0.85 + 0.35 * audioSwell);
        col += vCol * (audioKick * 0.3);
    }

    // additive pass dim: ribbons render GL_ONE/GL_ONE without depth --
    // overlapping layers ADD, so each fragment must stay well below 1. The 16
    // rope strands genuinely do pile up on each other; the four streamer fans
    // barely overlap at all, so they do not need the same headroom.
    col *= (vVeil > 0.5) ? 0.80 : 0.45;

    // Ceiling just under the knee's clipping point (1.47 in -> 0.97 out).  The
    // streamer fans are the largest thing on screen now, and over a bright photo
    // their brightest striation could otherwise flatten to white.
    col = min(col, vec3(1.40));

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
