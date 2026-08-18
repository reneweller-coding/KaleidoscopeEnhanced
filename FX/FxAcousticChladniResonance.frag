#version 330 core
out vec4 fragColor;
// FxAcousticChladniResonance.frag
// -----------------------------------------------------------------------
// FX ACOUSTIC CHLADNI RESONANCE: 2D vibrating plate Chladni resonance transition.
// Acoustic standing wave eigenmodes vibrate the image plane, collecting sand
// grains along nodal zero-vibration lines that morph and cross-fade between scenes.
//   interpolation -> sweeps acoustic resonance frequency & Chladni mode transitions
//   audioKick     -> flashes acoustic antinodal acceleration peaks
//   audioBass     -> drives vibrating plate amplitude & mode numbers (n, m)
//
// Per-activation variety:
//   modeP  float Chladni eigenmode harmonic multiplier (0.5..2.2)
//   nodalP float nodal line sand line sharpness        (0.5..2.0)
//   speedP float animation speed multiplier            (0.5..2.0)
//   hueP   float acoustic glow hue offset              (0..6.28)
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

uniform float modeP;
uniform float nodalP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float mod = (modeP  > 0.0) ? modeP  : 1.0;
    float ndl = (nodalP > 0.0) ? nodalP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Chladni plate eigenmodes (n, m) morphing with transition
    float n = (3.0 + tProg * 3.0) * mod;
    float m = (5.0 + tProg * 2.0) * mod;

    vec2 q = p * 3.14159265;
    float chladni1 = sin(n * q.x) * sin(m * q.y) - sin(m * q.x) * sin(n * q.y);
    float chladni2 = cos(n * q.x) * cos(m * q.y) - cos(m * q.x) * cos(n * q.y);

    float chladni = mix(chladni1, chladni2, sin(t * 2.0) * 0.5 + 0.5);

    // Nodal line proximity (where vibration = 0)
    float distToNode = abs(chladni);
    float nodalLine = exp(-distToNode * 15.0 * ndl);

    // Plate vibration displacement
    vec2 vibDisp = vec2(sin(chladni * 5.0), cos(chladni * 5.0)) * 0.025 * midTransition * (1.0 + audioBass * 0.7);

    vec4 c1 = texture(tex1, fract(uv + vibDisp));
    vec4 c0 = texture(tex0, fract(uv - vibDisp));

    float blend = clamp(tProg + chladni * 0.25 * midTransition, 0.0, 1.0);
    vec4 col = mix(c1, c0, blend);

    // Glowing resonant nodal lines
    col.rgb += nodalLine * vec3(1.0, 0.85, 0.35) * midTransition * (1.3 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
