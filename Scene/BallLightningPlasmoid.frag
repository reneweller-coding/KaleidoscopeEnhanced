#version 330 core
out vec4 fragColor;
// BallLightningPlasmoid.frag
// -----------------------------------------------------------------------
// BALL LIGHTNING PLASMOID: Volumetric autonomous ball lightning plasmoid
// with magnetically self-confined toroidal plasma core. Helical discharge
// filaments, atmospheric dielectric air breakdown arcs, high-frequency
// ionization glow, and audio-reactive electrical detonation bursts.
//   audioAdvance -> rotates toroidal plasma core vortex currents
//   audioKick    -> fires explosive high-voltage electrical discharge arcs
//   audioBass    -> pulses plasmoid confinement radius & magnetic pinch
//   audioCentroid-> shifts ionization color temperature (electric cyan/violet)
//
// Per-activation variety:
//   plasmoidP float plasmoid core radius & glow density  (0.5..2.2)
//   arcP      float electrical discharge branching scale (0.5..2.0)
//   speedP    float plasma vortex circulation velocity   (0.5..2.0)
//   hueP      float plasma discharge hue offset          (0..6.28)
// -----------------------------------------------------------------------

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

uniform float plasmoidP;
uniform float arcP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// 2D Noise helper
float hash21(vec2 p) {
    p = fract(p * vec2(623.34, 915.21));
    p += dot(p, p + 61.32);
    return fract(p.x * p.y);
}

float noise2D(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash21(i + vec2(0.0, 0.0)), hash21(i + vec2(1.0, 0.0)), u.x),
        mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
        u.y
    );
}

void main() {
    float pls = (plasmoidP > 0.0) ? plasmoidP : 1.0;
    float arc = (arcP      > 0.0) ? arcP      : 1.0;
    float spd = (speedP    > 0.0) ? speedP    : 1.0;
    float hue = (hueP      > 0.0) ? hueP      : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.45 * spd + audioAdvance * 0.22;

    float r = length(uv);
    float angle = atan(uv.y, uv.x);

    // Toroidal plasma core radius
    float plasmoidRadius = (0.32 + 0.08 * sin(t * 1.5) + 0.12 * audioBass) * pls;
    float coreDist = abs(r - plasmoidRadius);

    // Helical internal magnetic vortex filaments
    float helix = sin(angle * 8.0 + r * 15.0 - t * 6.0);
    float corePlasma = exp(-coreDist * 18.0) * (1.0 + helix * 0.5);

    // Dielectric air breakdown discharge arcs branching outward
    vec2 arcCoord = uv * 14.0 * arc + vec2(t * 3.0, -t * 2.0);
    float arcNoise = noise2D(arcCoord) + 0.5 * noise2D(arcCoord * 2.0);
    float dischargeArc = exp(-abs(sin(angle * 12.0 + arcNoise * 4.0 - t * 4.0)) * 25.0) * smoothstep(plasmoidRadius, 0.8, r);
    float arcFlash = dischargeArc * (audioKick * 4.0 + audioHigh * 2.0);

    // Atmospheric ionization halo glow
    float halo = exp(-r * 3.5) * (0.8 + 0.4 * audioSwell);

    // Photo texture mapping onto turbulent plasma envelope
    vec2 photoUV = st + vec2(sin(angle * 4.0 + t), cos(angle * 4.0 - t)) * 0.04 * (1.0 + audioKick * 0.8);
    vec3 photo = img(fract(photoUV));

    // Ball lightning electric palette (electric cyan, neon violet-blue, blinding white-yellow)
    vec3 plasmaCyan   = vec3(0.1, 0.9, 1.0);
    vec3 plasmaViolet = vec3(0.6, 0.2, 1.0);
    vec3 coreWhite    = vec3(1.0, 0.98, 0.9);

    vec3 plasmoidColor = mix(plasmaCyan, plasmaViolet, helix * 0.5 + 0.5);

    // Combine visualizer
    vec3 col = photo * (0.75 + 0.25 * audioLevel);
    col += halo * plasmaViolet * 0.6;
    col += corePlasma * plasmoidColor * 1.5;
    col += arcFlash * coreWhite * 2.5;
    col += exp(-r * 20.0) * coreWhite * (1.0 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    // Vignette
    float vig = smoothstep(1.35, 0.35, r);
    col *= vig;

    fragColor = vec4(col, 1.0);
}
