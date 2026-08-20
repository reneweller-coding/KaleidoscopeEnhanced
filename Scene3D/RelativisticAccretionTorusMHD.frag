#version 330 core
out vec4 fragColor;
/**
 * @file RelativisticAccretionTorusMHD.frag
 * @brief RELATIVISTIC ACCRETION TORUS MHD: Thick geometrically-inflated accretion torus
 * (Polish Donut) around a Kerr black hole, with the wide spiral-corrugated accretion flow
 * that feeds it flaring out of the tube's inner wall to the frame edges. Relativistic Doppler
 * beaming boost, turbulent magnetohydrodynamic spiral ripples, a radial temperature gradient,
 * event horizon shadow illumination, and photo texturing.
 *   audioAdvance -> drives Keplerian accretion orbital rotation velocity
 *   audioKick    -> flares three drifting magnetic reconnection hot spots on the torus
 *   audioSwell   -> thickens radiation-pressure-supported torus funnel & cross-section
 *   audioCentroid-> shifts synchrotron / bremsstrahlung emission spectra
 *
 * Per-activation variety:
 *   dopplerBoostP float relativistic Doppler beaming intensity (0.6..2.2)
 *   flareGlowP    float magnetic flare hot-spot luminance     (0.8..2.5)
 */

in vec2 vUV;
in vec3 vNormal;
in vec3 vCol;
in float vDoppler;

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioSwell;

uniform float dopplerBoostP;
uniform float flareGlowP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

void main()
{
    vec3 lightDir = normalize(vec3(0.0, 0.7, 0.7));
    float diff = max(0.0, dot(vNormal, lightDir));
    
    // Relativistic beaming amplification -- clamped: the raw exponential
    // reached ~4x on the approaching limb and, together with the flat
    // flare floor below, pushed the whole torus past the knee into white.
    float boost = clamp(exp(vDoppler * 2.5 * (dopplerBoostP > 0.01 ? dopplerBoostP : 1.2)), 0.4, 2.2);

    vec3 photo = img(vUV);

    vec3 col = vCol * (0.6 + 0.4 * photo) * (0.4 + 0.6 * diff) * boost;

    // Magnetic reconnection flares. These used to be a FLAT full-surface term:
    // every kick lifted the whole structure's brightness in a single frame, so
    // the scene's largest frame-to-frame luma step was ~129x its median one
    // (the JUMP flag) even though nothing about the picture had moved. Real
    // reconnection is local, so the flare now lives in three slowly drifting
    // hot spots -- same audio wiring, a fraction of the global step.
    float hs = 0.0;
    for (int i = 0; i < 3; ++i)
    {
        float fi = float(i);
        vec2 c = vec2(fract(0.31 * fi + time * 0.037),
                      0.5 + 0.30 * sin(time * 0.11 + fi * 2.1));
        vec2 d = vUV - c;
        d.x -= round(d.x);                       // u wraps around the torus
        d *= vec2(5.5, 3.0);
        hs += exp(-dot(d, d));
    }
    col += vec3(1.0, 0.95, 0.85) * (0.12 + 1.8 * audioKick)
         * (flareGlowP > 0.01 ? flareGlowP : 1.3) * 0.4 * min(hs, 1.6);
    col *= (0.85 + 0.35 * audioSwell);
    col += vCol * (audioKick * 0.3);

    // Base shading still saturated past the knee on the full tube -- dim at source.
    col *= 0.60;

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
