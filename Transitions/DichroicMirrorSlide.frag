#version 330 core
out vec4 fragColor;
/**
 * @file DichroicMirrorSlide.frag
 * @brief TRANSITION DICHROIC MIRROR SLIDE: Dichroic glass beam-splitter transition.
 * Angled optical dichroic mirror planes slide across the screen, transmitting
 * complementary wavelengths and reflecting the outgoing scene into the incoming one.
 *   interpolation -> slides dichroic mirror boundary across the diagonal
 *   audioKick     -> flashes dichroic spectral transmission spikes
 *   audioBass     -> undulates optical thin-film interference thickness
 *
 * Per-activation variety:
 *   dichroP float dichroic spectral split intensity (0.5..2.2)
 *   slideP  float slide angle tilt                  (0.5..2.0)
 *   speedP  float animation speed multiplier        (0.5..2.0)
 *   hueP    float dichroic coating hue offset       (0..6.28)
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

uniform float dichroP;
uniform float slideP;
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
    float dch = (dichroP > 0.0) ? dichroP : 1.0;
    float sld = (slideP  > 0.0) ? slideP  : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Diagonal mirror plane coordinate
    vec2 mirrorDir = normalize(vec2(1.0, 0.8 * sld));
    float proj = dot(p, mirrorDir);

    float slidePos = mix(-1.2, 1.2, tProg);
    float distToMirror = proj - slidePos;

    // Thin-film interference color on glass edge: lambda = 2 n d cos(theta)
    vec3 dichroicReflect = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + distToMirror * 15.0 * dch + audioPhase);

    // Glass refraction displacement
    float refrOffset = exp(-abs(distToMirror) * 10.0) * sign(distToMirror) * 0.03 * midTransition;
    vec2 warpUV = uv + mirrorDir * refrOffset;

    vec4 c1 = texture(tex1, fract(warpUV));
    vec4 c0 = texture(tex0, fract(warpUV));

    float wipeMask = smoothstep(-0.02, 0.02, distToMirror);
    vec4 col = mix(c0, c1, wipeMask);

    // Glass edge flare
    float glassEdge = exp(-abs(distToMirror) * 20.0) * midTransition;
    col.rgb += glassEdge * dichroicReflect * (1.5 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue * midTransition);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue * midTransition);

    fragColor = col;
}
