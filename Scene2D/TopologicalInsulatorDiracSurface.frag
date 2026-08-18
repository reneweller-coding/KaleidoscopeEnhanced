#version 330 core
out vec4 fragColor;
// TopologicalInsulatorDiracSurface.frag
// -----------------------------------------------------------------------
// TOPOLOGICAL INSULATOR DIRAC SURFACE: 3D topological insulator crystal
// with insulating bulk and protected conducting 2D Dirac surface states.
// Spin-momentum locking ($k \times \sigma$), suppressed backscattering,
// helical current loops, and continuous photo texture reflections.
//   audioAdvance -> rotates spin-momentum locked Dirac surface currents
//   audioKick    -> flashes protected topological edge state transitions
//   audioBass    -> pulses bulk bandgap and surface Dirac cone height
//   audioCentroid-> shifts electronic spin polarization vector colors
//
// Per-activation variety:
//   surfaceP float crystal facet lattice density         (0.5..2.2)
//   spinP    float spin-momentum locking helical pitch    (0.5..2.0)
//   speedP   float surface current drift velocity         (0.5..2.0)
//   hueP     float topological state hue offset           (0..6.28)
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

uniform float surfaceP;
uniform float spinP;
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

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

void main() {
    float srf = (surfaceP > 0.0) ? surfaceP : 1.0;
    float spn = (spinP    > 0.0) ? spinP    : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.35 * spd + audioAdvance * 0.18;

    // Crystal facet surface projection
    vec2 p = uv * 5.5 * srf;
    p = rot2D(t * 0.2) * p;

    // Spin-momentum locking: spin sigma is orthogonal to momentum k
    float r = length(p);
    float angle = atan(p.y, p.x);
    float helicalCurrent = sin(angle * 6.0 + r * 4.0 * spn - t * 4.0);

    // Dirac surface cone state: E(k) = v_F * |k|
    float diracCone = exp(-abs(r - 1.8) * 4.0) * (1.0 + 0.3 * audioBass);

    // Suppressed backscattering topological protection lines
    float edgeStates = sin(p.x * 3.0 + p.y * 3.0 + helicalCurrent * 2.0);
    float edgeLines = smoothstep(0.6, 0.95, abs(edgeStates));

    // Photo texture mapping onto topological crystal facet
    vec2 photoUV = st + vec2(cos(angle), sin(angle)) * 0.03 * (1.0 + audioKick * 0.8);
    vec3 photo = img(fract(photoUV));

    // Helical spin palette (quantum bismuth selenide teal, gold, crimson)
    vec3 spinUp   = vec3(0.0, 0.85, 0.95);
    vec3 spinDown = vec3(0.95, 0.2, 0.4);
    vec3 bulkGold = vec3(1.0, 0.9, 0.4);

    vec3 spinColor = mix(spinUp, spinDown, helicalCurrent * 0.5 + 0.5);

    // Combine visualizer
    vec3 col = mix(photo * 0.85, spinColor, 0.45 + 0.2 * audioSwell);
    col += edgeLines * bulkGold * (1.0 + audioHigh * 1.5);
    col += diracCone * vec3(0.2, 0.9, 1.0) * (1.2 + audioKick * 2.5);

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    // Vignette
    float vig = smoothstep(1.35, 0.35, length(uv));
    col *= vig;

    // Catalogue review: soft-knee exposure — hot audio compresses
    // instead of clipping the whole frame to white.
    vec3 _catTone = (col) * 0.75;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
