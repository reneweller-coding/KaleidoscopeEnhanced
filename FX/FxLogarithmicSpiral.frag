#version 330 core
out vec4 fragColor;
// FxLogarithmicSpiral.frag
// -----------------------------------------------------------------------
// FX LOGARITHMIC SPIRAL: Equiangular logarithmic spiral vortex
// (r = a * exp(b * theta)). The outgoing scene winds inward along spiral
// streamlines while the incoming scene unwinds outwards from the center.
//   interpolation -> controls spiral vortex winding angle & depth
//   audioKick     -> flashes spiral arm streamline highlights
//   audioBass     -> undulates spiral pitch & radial breathing
//
// Per-activation variety:
//   spiralP float spiral winding tightness (0.5..2.2)
//   armsP   float spiral arm count         (0.5..2.0)
//   speedP  float animation speed          (0.5..2.0)
//   hueP    float spiral hue offset        (0..6.28)
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

uniform float spiralP;
uniform float armsP;
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
    float spr = (spiralP > 0.0) ? spiralP : 1.0;
    float arm = (armsP   > 0.0) ? armsP   : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    float r = length(p);
    float angle = atan(p.y, p.x);

    // Logarithmic spiral mapping: log(r) vs theta
    float logR = log(max(r, 0.001));
    float spiralAngle = angle * arm * 2.0 - logR * 3.0 * spr + tProg * 6.2831853;

    // Spiral swirl displacement
    float swirl = (1.0 - smoothstep(0.0, 0.8, r)) * midTransition * 3.14159265;
    vec2 pWarped = rot2D(swirl) * p;
    vec2 uvWarped = (pWarped * resolution.y + 0.5 * resolution) / resolution;

    // Spiral wave mask for staggered wiping
    float spiralWave = sin(spiralAngle + t * 2.0);
    float spiralMask = smoothstep(-0.4, 0.4, spiralWave);

    float blend = clamp(tProg * 1.5 - (1.0 - spiralMask) * 0.5, 0.0, 1.0);

    vec4 c1 = texture(tex1, fract(mix(uv, uvWarped, midTransition)));
    vec4 c0 = texture(tex0, fract(mix(uvWarped, uv, 1.0 - midTransition)));

    vec4 col = mix(c1, c0, blend);

    // Glowing spiral arm highlights
    float armGlow = exp(-abs(spiralWave) * 12.0) * midTransition;
    col.rgb += armGlow * vec3(1.0, 0.85, 0.3) * (1.2 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
