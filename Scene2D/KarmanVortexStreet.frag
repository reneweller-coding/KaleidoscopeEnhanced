#version 330 core
out vec4 fragColor;
/**
 * @file KarmanVortexStreet.frag
 * @brief KARMAN VORTEX STREET: a flight down the wake behind a cylinder in
 * a stream -- the alternating vortices of a von Karman street, seen as a
 * tunnel of swirling dye.  The vortices are objects on the scene clock: they
 * shed in turn, drift downstream, grow and fade; an onset brightens the
 * one shedding now (light).  The dye is the photo advected by the vortex
 * field (a sum of Lamb-Oseen vortices), so the picture swirls without a
 * simulation.  The camera flies steadily along the wake.
 *
 * Audio Reactivity:
 *   sceneAdvance -> flight and vortex shedding (continuous)
 *   audioOnset   -> the newest vortex brightens (light)
 *   audioSwell   -> vortex strength (slow)
 *   audioLevel   -> dye brightness
 *   audioKick    -> the cylinder's wake glows (light)
 *
 * Per-activation variety: spacingP (vortex spacing), swirlP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioOnset;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioChromaHue;
uniform float audioValence;

uniform float spacingP;
uniform float swirlP;
uniform float hueP;

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
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float spacing = 1.6 + 1.2 * clamp(spacingP, 0.0, 1.0);
    float swirl = (0.6 + 0.8 * clamp(swirlP, 0.0, 1.0)) * (0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    float travel = sceneAdvance * 1.5 + sceneTime * 0.3;

    // Tunnel mapping: depth along the wake, angle around it.
    float r = length(p);
    float a = atan(p.y, p.x);
    float depth = 1.0 / max(r, 0.02);
    float z = depth + travel;                          // distance downstream (grows away)

    // The wake plane: vortices alternate sides (y = +-h) at spacing s along z,
    // and drift downstream with the flow; each vortex is a Lamb-Oseen
    // whirl that advects the dye coordinates.  Work in the wall's unrolled
    // coordinates (angle -> lateral y, z -> downstream).
    vec2 w = vec2(a * 0.6, z);                          // (lateral, downstream)
    vec2 adv = w;
    float newest = 0.0;
    for (int k = -2; k <= 3; ++k)
    {
        float idx = floor(z / spacing) + float(k);
        float side = (mod(idx, 2.0) < 0.5) ? 1.0 : -1.0;
        // The vortex sheds at the cylinder (z = travel) and drifts: its z is
        // fixed in the wake frame; it grows and fades with age.
        vec2 c = vec2(side * 0.55, idx * spacing + spacing * 0.5);
        float age = clamp((z - c.y) / (spacing * 6.0), 0.0, 1.0);   // 0 fresh .. 1 old (further downstream from the cylinder is OLDER)
        vec2 d = w - c;
        float rr = length(d);
        float core = 0.35 + 0.8 * age;
        float gamma = swirl * side * (1.0 - age * 0.7);
        // Lamb-Oseen tangential velocity, applied as a rotation of the dye.
        float ang = gamma * (1.0 - exp(-rr * rr / (core * core))) / max(rr, 0.05) * 0.6;
        vec2 rot = vec2(cos(ang) * d.x - sin(ang) * d.y, sin(ang) * d.x + cos(ang) * d.y);
        adv += (rot - d) * exp(-rr * 0.4);
        // The newest vortex (smallest positive age) brightens on the onset.
        newest += exp(-rr * rr * 2.0) * (1.0 - age) * (1.0 - age);
    }
    // Dye: the photo in the advected coordinates.
    vec2 uv = fract(vec2(adv.x * 0.5 + 0.5, adv.y * 0.08));
    vec3 dye = img(uv) * imgPalette(hue * 0.159 + 0.55) * 1.8;
    // Vortex cores glow: where the advection was strong.
    float shear = length(adv - w);
    vec3 col = dye * (0.5 + 0.6 * audioLevel) + imgPalette(hue * 0.159 + 0.1) * shear * 0.8;
    col += imgPalette(hue * 0.159 + 0.9) * newest * clamp(audioOnset, 0.0, 1.0) * 0.8;
    // The cylinder far ahead: a dark disc with a kick-lit rim; fog by depth.
    float fog = 1.0 - exp(-depth * 0.08);
    col = mix(col, imgPalette(hue * 0.159 + 0.6) * 0.06, clamp(fog, 0.0, 0.92));
    col *= smoothstep(0.02, 0.07, r);
    col += imgPalette(hue * 0.159 + 0.05) * exp(-abs(r - 0.055) * 60.0) * (0.3 + 1.2 * audioKick);

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
