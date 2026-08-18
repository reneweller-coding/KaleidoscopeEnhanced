#version 330 core
out vec4 fragColor;
// FxWormholeSpaceFold.frag
// -----------------------------------------------------------------------
// FX WORMHOLE SPACE FOLD: Traversable Morris-Thorne wormhole transition.
// The camera plunges through a traversable Lorentzian wormhole throat that
// smoothly folds the geometry of Universe 1 (tex1) into Universe 2 (tex0).
//   interpolation -> navigates camera through the wormhole throat tunnel
//   audioKick     -> flashes exotic matter throat stabilization rings
//   audioBass     -> undulates wormhole throat diameter & metric curvature
//
// Per-activation variety:
//   throatP float wormhole throat radius scale   (0.5..2.2)
//   curveP  float spacetime curvature distortion (0.5..2.0)
//   speedP  float traversal velocity multiplier  (0.5..2.0)
//   hueP    float throat chromatic hue offset    (0..6.28)
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

uniform float throatP;
uniform float curveP;
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
    float thr = (throatP > 0.0) ? throatP : 1.0;
    float crv = (curveP  > 0.0) ? curveP  : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    float r = length(p);
    float angle = atan(p.y, p.x);

    // Morris-Thorne throat coordinate: l = -infty (Universe 1) to +infty (Universe 2)
    float l = mix(-2.5, 2.5, tProg);
    float throatRadius = (0.28 + 0.1 * audioBass) * thr;

    // Radius function: r(l) = sqrt(r_0^2 + l^2)
    float metricR = sqrt(throatRadius * throatRadius + l * l);

    // Spacetime curvature deflection
    float deflection = (throatRadius / max(r, 0.05)) * midTransition * crv;
    vec2 pWarp = rot2D(deflection * 1.5 + t * 0.4) * (p * (1.0 + deflection * 0.8));
    vec2 warpUV = (pWarp * resolution.y + 0.5 * resolution) / resolution;

    vec4 c1 = texture(tex1, fract(warpUV));
    vec4 c0 = texture(tex0, fract(warpUV));

    // Dual universe boundary wipe
    float throatWipe = smoothstep(-0.2, 0.2, l + (r - 0.4));
    vec4 col = mix(c1, c0, throatWipe);

    // Exotic matter throat glowing ring
    float throatGlow = exp(-abs(r - throatRadius) * 20.0) * midTransition;
    col.rgb += throatGlow * vec3(0.4, 0.95, 1.0) * (1.5 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
