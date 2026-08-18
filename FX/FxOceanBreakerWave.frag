#version 330 core
out vec4 fragColor;
// CombineOceanBreakerWave.frag
// -----------------------------------------------------------------------
// COMBINE OCEAN BREAKER WAVE: Ocean breaker wave rolling & foam wash transition.
// A powerful ocean swell rolls across the frame, cresting into a curling breaker
// wave that crashes with turbulent sea foam and washes into the incoming scene.
//   interpolation -> sweeps the rolling breaker wave front across the viewport
//   audioKick     -> flashes churning sea foam spray on wave break
//   audioBass     -> drives ocean swell wave amplitude & curl steepness
//
// Per-activation variety:
//   waveP  float ocean swell wavelength & scale (0.5..2.2)
//   foamP  float crest sea foam spray density   (0.5..2.0)
//   speedP float wave propagation velocity       (0.5..2.0)
//   hueP   float ocean water hue offset          (0..6.28)
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

uniform float waveP;
uniform float foamP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float wav = (waveP  > 0.0) ? waveP  : 1.0;
    float fom = (foamP  > 0.0) ? foamP  : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.45 * spd + audioAdvance * 0.22;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Wave rolling from left to right with trochoidal crest steepness
    float waveFront = mix(-1.2, 1.2, tProg);
    float distToWave = p.x - waveFront + sin(p.y * 8.0 * wav + t * 2.0) * 0.08;

    // Trochoidal wave profile
    float waveHeight = cos(distToWave * 20.0);
    float crestFoam = smoothstep(0.7, 1.0, waveHeight) * exp(-abs(distToWave) * 12.0) * fom;

    // Water refraction displacement
    vec2 waterDisp = vec2(sin(distToWave * 15.0), cos(p.y * 12.0 + t)) * 0.04 * midTransition * (1.0 + audioBass * 0.7);

    vec4 c1 = texture(tex1, fract(uv + waterDisp));
    vec4 c0 = texture(tex0, fract(uv - waterDisp));

    float wipeMask = smoothstep(-0.04, 0.04, distToWave);
    vec4 col = mix(c0, c1, wipeMask);

    // Sea foam whitecaps
    vec3 foamWhite = vec3(0.9, 0.98, 1.0);
    col.rgb += crestFoam * foamWhite * midTransition * (1.5 + audioKick * 3.5);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
