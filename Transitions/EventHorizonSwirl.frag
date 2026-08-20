#version 330 core
out vec4 fragColor;
/**
 * @file EventHorizonSwirl.frag
 * @brief TRANSITION EVENT HORIZON SWIRL: Kerr black hole ergosphere frame-dragging transition.
 * Spacetime frame-dragging twists the outgoing scene into a relativistic
 * spiral vortex around a rotating event horizon, drawing the new scene out.
 *   interpolation -> controls frame-dragging angular momentum & horizon size
 *   audioKick     -> flashes ergosphere frame-dragging boundary
 *   audioBass     -> undulates Kerr black hole spin parameter (a/M)
 *
 * Per-activation variety:
 *   spinP  float Kerr black hole spin parameter    (0.5..2.2)
 *   dragP  float frame dragging spiral distortion  (0.5..2.0)
 *   speedP float animation speed multiplier        (0.5..2.0)
 *   hueP   float ergosphere emission hue offset    (0..6.28)
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

uniform float spinP;
uniform float dragP;
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
    float spn = (spinP  > 0.0) ? spinP  : 1.0;
    float drg = (dragP  > 0.0) ? dragP  : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    float r = length(p);

    // Frame-dragging swirl angle: omega_drag ~ a / (r^3 + a^2 * r + 2M*a^2).
    // audioBass undulates the Kerr spin parameter a/M.  The whole angle is
    // already multiplied by midTransition, so it is exactly zero at both fade
    // endpoints — and warpUV is additionally blended in by midTransition there.
    float spinAM = spn * drg * (1.0 + audioBass * 0.7);
    float dragAngle = (0.35 / max(pow(r, 1.5), 0.04)) * midTransition * spinAM * 3.14159265;
    vec2 pSwirled = rot2D(dragAngle + t * 0.5) * p;

    vec2 warpUV = (pSwirled * resolution.y + 0.5 * resolution) / resolution;

    vec4 c1 = texture(tex1, fract(mix(uv, warpUV, midTransition)));
    vec4 c0 = texture(tex0, fract(mix(warpUV, uv, 1.0 - midTransition)));

    vec4 col = mix(c1, c0, tProg);

    // Ergosphere boundary glow
    float rErgo = 0.35 * midTransition;
    float ergoGlow = exp(-abs(r - rErgo) * 25.0) * midTransition;
    col.rgb += ergoGlow * vec3(1.0, 0.6, 0.1) * (1.5 + audioKick * 3.0);

    // Center horizon shadow
    float shadow = smoothstep(rErgo * 0.4, rErgo * 0.9, r);
    col.rgb *= mix(1.0, shadow, midTransition);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}
