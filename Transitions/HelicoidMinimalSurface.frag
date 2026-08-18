#version 330 core
out vec4 fragColor;
/**
 * @file HelicoidMinimalSurface.frag
 * @brief TRANSITION HELICOID MINIMAL SURFACE: Ruled helicoid minimal surface screw transition.
 * A continuous helical ramp surface (z = c * theta) rotates and screws the outgoing
 * scene along its ruled geodesics, seamlessly unfurling into the incoming scene.
 *   interpolation -> sweeps helicoid rotation & helical screw pitch
 *   audioKick     -> flashes helicoid minimal surface ruling lines
 *   audioBass     -> undulates helical pitch & radial expansion
 *
 * Per-activation variety:
 *   pitchP float helical screw pitch & tightness  (0.5..2.2)
 *   screwP float rotation angular velocity ratio  (0.5..2.0)
 *   speedP float animation speed multiplier       (0.5..2.0)
 *   hueP   float minimal surface hue offset       (0..6.28)
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
uniform float screwP;
uniform float speedP;
uniform float hueP;

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
    float ptc = (pitchP > 0.0) ? pitchP : 1.0;
    float scr = (screwP > 0.0) ? screwP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    float r = length(p);
    float theta = atan(p.y, p.x);

    // Helicoid minimal surface coordinate: z = c * theta + rotation
    float helicoidZ = (theta + tProg * 6.2831853 * scr + t * 0.8) / 3.14159265 * ptc;
    float rampPhase = fract(helicoidZ);
    float rampDist = min(rampPhase, 1.0 - rampPhase);

    // Helical screw coordinate warp
    float warpAngle = (1.0 - smoothstep(0.0, 0.9, r)) * midTransition * 3.14159265;
    vec2 pWarp = rot2D(warpAngle) * p;
    vec2 warpUV = (pWarp * resolution.y + 0.5 * resolution) / resolution;

    vec4 c1 = texture(tex1, fract(mix(uv, warpUV, midTransition)));
    vec4 c0 = texture(tex0, fract(mix(warpUV, uv, 1.0 - midTransition)));

    float wipeMask = smoothstep(0.4, 0.6, rampPhase);
    vec4 col = mix(c1, c0, mix(tProg, wipeMask, midTransition * 0.7));

    // Glowing helicoid ruling lines
    float rulingGlow = exp(-rampDist * 20.0) * midTransition;
    col.rgb += rulingGlow * vec3(1.0, 0.85, 0.3) * (1.3 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}
