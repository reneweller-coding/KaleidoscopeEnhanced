#version 330 core
out vec4 fragColor;
/**
 * @file FxPlasmaFilamentPinch.frag
 * @brief FX PLASMA FILAMENT PINCH: Magnetohydrodynamic Z-pinch plasma transition.
 * Axial electric currents generate azimuthal magnetic fields, compressing
 * plasma into ultra-dense filaments that develop sausage and kink instabilities
 * before bursting into the incoming scene.
 *   interpolation -> sweeps magnetic Bennett pinch compression & burst
 *   audioKick     -> triggers full-pinch thermonuclear radiation flash
 *   audioBass     -> drives radial Lorentz force compression amplitude
 *
 * Per-activation variety:
 *   pinchP float Z-pinch compression ratio & filament thickness (0.5..2.2)
 *   kinkP  float m=1 kink instability helical twist             (0.5..2.0)
 *   speedP float animation speed multiplier                     (0.5..2.0)
 *   hueP   float plasma emission hue offset                     (0..6.28)
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

uniform float pinchP;
uniform float kinkP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float pnc = (pinchP > 0.0) ? pinchP : 1.0;
    float knk = (kinkP  > 0.0) ? kinkP  : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.5 * spd + audioAdvance * 0.25;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Multiple parallel Z-pinch filaments with m=1 kink helical oscillation
    float filamentX = sin(p.y * 12.0 * knk + t * 4.0) * 0.06 * midTransition;
    float distToFilament = abs(p.x - filamentX);

    // Magnetic compression factor
    float pinchRadius = 0.15 / (1.0 + midTransition * 4.0 * pnc);
    float pinchCore = exp(-distToFilament * distToFilament / (pinchRadius * pinchRadius));

    // Lorentz force radial pull displacement
    float pinchDispX = -sign(p.x - filamentX) * pinchCore * 0.05 * midTransition * (1.0 + audioBass * 0.8);
    vec2 warpUV = uv + vec2(pinchDispX, 0.0);

    vec4 c1 = texture(tex1, fract(warpUV));
    vec4 c0 = texture(tex0, fract(warpUV));

    vec4 col = mix(c1, c0, tProg);

    // Glowing high-temperature plasma core
    vec3 plasmaColor = mix(vec3(0.95, 0.3, 0.1), vec3(0.3, 0.85, 1.0), pinchCore);
    col.rgb += pinchCore * plasmaColor * midTransition * (1.6 + audioKick * 3.5);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
