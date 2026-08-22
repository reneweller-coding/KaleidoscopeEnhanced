#version 330 core
out vec4 fragColor;
/**
 * @file CosmicRayTransitionRadiation.frag
 * @brief COSMIC RAY TRANSITION RADIATION: Ultra-relativistic charged particles traversing periodic
 * multilayer foil stacks (mylar/polypropylene radiator). Sudden dielectric boundary crossings emit
 * highly collimated forward X-ray transition radiation cones with photo-derived interference fringes.
 *   audioAdvance -> accelerates relativistic particle beam traversing radiator stack
 *   audioKick    -> flashes boundary crossing X-ray photon emission bursts
 *   audioSwell   -> widens foil stack cross-section & forward X-ray cone brightness
 *   audioCentroid-> shifts X-ray transition radiation spectral interference peaks
 *   audioHigh    -> modulates high-frequency formation zone interference ripples
 *
 * Per-activation variety:
 *   foilDensityP float multilayer radiator foil stack density    (4.0..14.0)
 *   coneAngleP   float transition radiation cone opening angle   (0.3..1.2)
 *   xrayGlowP    float X-ray emission peak luminance gain        (0.8..2.5)
 *   gammaLorentzP float particle Lorentz factor gamma parameter   (0.6..2.2)
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
uniform float audioChromaHue;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;

uniform float foilDensityP;
uniform float coneAngleP;
uniform float xrayGlowP;
uniform float gammaLorentzP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
    float t = time * 0.45 + audioAdvance * 0.4;

    // Multilayer radiator foil interfaces along Y-axis
    float fDens = (foilDensityP > 0.01 ? foilDensityP : 8.0);
    float foilY = fract(uv.y * fDens) - 0.5;
    float foilId = floor(uv.y * fDens);

    float gamma = (gammaLorentzP > 0.01 ? gammaLorentzP : 1.3);
    float glowK = (xrayGlowP > 0.01 ? xrayGlowP : 1.3);

    // THREE relativistic particles drifting across the foil stack.  The old
    // build drew ONE fixed track and ONE fixed cone: on screen that was a
    // static white phi-glyph, and nothing about it read as radiation.
    vec3 colAcc = vec3(0.0);
    float trackAcc = 0.0;
    for (int k = 0; k < 3; ++k) {
        float fk = float(k);
        // Each particle wanders horizontally on its own slow path.
        float px = sin(t * (0.31 + 0.09 * fk) + fk * 2.4) * 0.62;
        float pTrack = exp(-abs(uv.x - px) * 60.0);
        trackAcc += pTrack;

        // The particle's head sweeps downward through the foils, one pass
        // per couple of seconds; a radiation cone RING EXPANDS from every
        // boundary it has just crossed.
        float headPhase = fract(t * 0.30 + fk * 0.37);
        float headY = 0.75 - 1.5 * headPhase;
        float ringAge = fract(headPhase * fDens);
        float ringY = (floor(headPhase * fDens) + 0.5) / fDens * -1.5 + 0.75;
        float rr = length(vec2(uv.x - px, uv.y - ringY));
        float ringR = ringAge * (0.55 + 0.25 / gamma);
        float coneRing = exp(-abs(rr - ringR) * 26.0) * (1.0 - ringAge * 0.8);

        // Formation-zone fringes ride ON the expanding ring.
        float fringes = 0.5 + 0.5 * sin(rr * 34.0 - audioPhase * 2.0);
        fringes = mix(0.7, fringes, clamp(0.6 + 0.8 * audioHigh, 0.0, 1.3));

        vec3 cCone = imgPalette(fract(0.13 + fk * 0.29 + ringAge * 0.2));
        colAcc += cCone * coneRing * fringes * 1.7;
        // Bright head spark where the particle currently is.
        float head = exp(-length(vec2((uv.x - px) * 2.2, uv.y - headY)) * 26.0);
        colAcc += vec3(0.95, 0.97, 1.0) * head * (1.1 + 2.2 * audioKick);
    }

    float boundaryCross = exp(-abs(foilY) * 35.0);
    vec3 colFoil = imgPalette(fract(foilId * 0.11 + 0.45)) * 1.5;

    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.30;

    vec3 col = bg;
    col += colFoil * boundaryCross * (0.55 + 0.35 * audioSwell);
    col += colAcc * glowK;
    col += vec3(0.9, 0.93, 1.0) * trackAcc * 0.5 * (1.0 + 1.2 * audioKick);

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
