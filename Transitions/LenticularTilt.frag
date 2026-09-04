#version 330 core
out vec4 fragColor;
/**
 * @file LenticularTilt.frag
 * @brief TRANSITION LENTICULAR TILT: two interlaced pictures under a lens
 * array.  The viewing angle swings, and the pictures trade places -- with the
 * banding ghost across the changeover that gives every lenticular print away.
 *
 * Nothing moves.  A lenticular sheet holds both pictures side by side under
 * each lenticule, and which one reaches the eye depends only on the ANGLE the
 * sheet is seen from: the lens maps that angle onto a position within its own
 * strip.  So the transition here is a swing of one angle, and the two strips
 * are static -- which is exactly why a lenticular does not read as a wipe.
 *
 * Because a real lens has a focal spread, the changeover is not clean: for a
 * range of angles both strips are partly visible and the picture shows the
 * characteristic interlace banding.  That band is the effect, not an artefact
 * to be smoothed away.
 *
 * Audio Reactivity:
 *   audioMid   -> the swing rate (slow)
 *   audioHigh  -> the gloss along each lenticule (light)
 *   audioSwell -> the lens's focal spread: how wide the ghost band is (slow)
 *   audioKick  -> the light across the sheet (light)
 *
 * Per-activation variety: pitchP, spreadP, hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float pitchP;
uniform float spreadP;
uniform float hueP;

const float PI = 3.14159265358979;

void main()
{
    float pitch  = 60.0 + floor(clamp(pitchP, 0.0, 1.0) * 90.0);   // lenticules across
    float spread = (spreadP > 0.0) ? spreadP : 1.0;
    float hue    = (hueP    > 0.0) ? hueP    : 0.0;

    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;

    float d   = clamp(1.0 - interpolation, 0.0, 1.0);
    float arc = sin(d * PI);

    // Position within this lenticule, 0..1.
    float s = fract(uv.x * pitch);

    // The viewing angle swings across the whole turn.  The lens maps the angle
    // onto a position in the strip, so the boundary between the two interlaced
    // pictures travels across each lenticule.
    float swing = d * (1.0 + 0.18 * (clamp(audioMid * 2.0, 0.0, 1.0) - 0.5));
    float cut = clamp(swing * 1.30 - 0.15, -0.2, 1.2);

    // A real lens is not perfect: for a range of angles both strips reach the
    // eye and the picture bands.  That band IS the lenticular look.
    float soft = (0.06 + 0.16 * clamp(audioSwell, 0.0, 1.0)) * spread;
    float pick = smoothstep(cut - soft, cut + soft, s);

    // The two interlaced strips: each holds a whole picture, sampled where its
    // own strip sits, so neither is squeezed.
    vec3 a = texture(tex0, uv).rgb;
    vec3 b = texture(tex1, uv).rgb;
    vec3 col = mix(b, a, pick);

    // Away from the changeover the sheet is simply one picture or the other,
    // and at the two ends of the turn there is no banding at all.
    col = mix(mix(a, b, d), col, arc);

    // The lenticule itself: a cylinder, so it has a bright line down its crown
    // and darkens at the seams between lenses.
    float crown = exp(-pow((s - 0.5) / 0.18, 2.0));
    float seam  = smoothstep(0.055, 0.0, min(s, 1.0 - s));
    vec3 gloss = mix(vec3(1.0, 0.98, 0.94), vec3(0.94, 0.97, 1.0), fract(hue * 0.159));
    col *= 1.0 - seam * 0.35 * arc;
    col += gloss * crown * arc
         * (0.04 + 0.16 * clamp(audioHigh * 2.0, 0.0, 1.0) + 0.08 * clamp(audioKick, 0.0, 1.0));

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
