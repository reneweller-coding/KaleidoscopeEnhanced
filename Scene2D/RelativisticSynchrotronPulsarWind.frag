#version 330 core
out vec4 fragColor;
/**
 * @file RelativisticSynchrotronPulsarWind.frag
 * @brief RELATIVISTIC SYNCHROTRON PULSAR WIND: Pulsar wind nebula (Crab Nebula PWN). Magnetized
 * electron-positron relativistic plasma wind undergoes termination shock, forming equatorial
 * synchrotron torus rings, polar collimated plasma jets, and magnetic wisps.
 *   audioAdvance -> accelerates pulsar rotational frequency & relativistic wind outflow
 *   audioKick    -> flashes central pulsar lighthouse beam & magnetic reconnection flares
 *   audioBass    -> expands equatorial termination shock torus radius & synchrotron brightness
 *   audioSwell   -> enriches nebula magnetic filamentation density & optical polarization glow
 *   audioCentroid-> shifts non-thermal synchrotron continuum emission spectra
 *
 * Per-activation variety:
 *   torusRadiusP float equatorial termination shock radius       (0.3..0.9)
 *   jetCollimP   float polar relativistic jet collimation width  (0.08..0.35)
 *   wispCountP   float dynamic magnetic wisp ripple density      (4.0..14.0)
 *   synchGlowP   float synchrotron torus luminance gain          (0.8..2.5)
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

uniform float torusRadiusP;
uniform float jetCollimP;
uniform float wispCountP;
uniform float synchGlowP;

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

vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
    float t = time * 0.45 + audioAdvance * 0.4;

    // Tilted equatorial plane for synchrotron torus rings
    float tilt = 0.55;
    float cTilt = cos(tilt), sTilt = sin(tilt);
    vec2 pTorus = vec2(uv.x, uv.y / sTilt);
    float rTorus = length(pTorus);

    // Equatorial termination shock torus
    float rShock = (torusRadiusP > 0.01 ? torusRadiusP : 0.5) * (0.85 + 0.3 * audioBass);
    float torusRing = exp(-abs(rTorus - rShock) * 18.0);

    // Moving dynamic synchrotron wisps expanding outward from shock
    float wFreq = (wispCountP > 0.01 ? wispCountP : 8.0);
    float wisps = sin(rTorus * wFreq - t * 4.0 + audioPhase) * exp(-rTorus * 2.0);

    // Polar collimated relativistic plasma jets along Y-axis
    float jWidth = (jetCollimP > 0.01 ? jetCollimP : 0.16);
    float polarJet = exp(-abs(uv.x) * abs(uv.x) / (jWidth * jWidth)) * smoothstep(0.05, 0.8, abs(uv.y));

    // Central pulsar lighthouse beam rotation
    float pAngle = atan(uv.y, uv.x);
    float beam = pow(max(0.0, cos(pAngle - t * 8.0)), 12.0) * (1.0 + 3.5 * audioKick);

    // Central pulsar neutron star core
    float core = exp(-dot(uv, uv) * 55.0) * (1.0 + 2.0 * audioKick);

    // Synchrotron emission colors: electric blue / cyan with magnetic orange filaments
    vec3 synchBlue   = vec3(0.15, 0.8, 1.0);
    vec3 wispAmber   = vec3(1.0, 0.55, 0.15);
    vec3 pulsarWhite = vec3(1.0, 0.95, 0.9);

    vec3 colSynch = palTint(mix(synchBlue, wispAmber, clamp(wisps + 0.5, 0.0, 1.0)), rTorus * 0.3 + audioCentroid, 0.26);

    // Background photo sampling
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;

    vec3 col = bg;
    col += colSynch * torusRing * (synchGlowP > 0.01 ? synchGlowP : 1.3) * (0.85 + 0.35 * audioSwell) * 2.2;
    col += colSynch * abs(wisps) * 1.4;
    col += palTint(vec3(0.4, 0.9, 1.0), abs(uv.y) * 0.3, 0.22) * polarJet * 1.8;
    col += pulsarWhite * beam * 2.5;
    col += pulsarWhite * core * 3.0;
    col += colSynch * (audioKick * 0.35);

    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    col /= 1.0 + 0.60 * max(col.r, max(col.g, col.b));   // peak knee: tame local glare, keep midtones
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
