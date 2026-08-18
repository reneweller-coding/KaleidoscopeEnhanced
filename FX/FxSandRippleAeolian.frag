#version 330 core
out vec4 fragColor;
// CombineSandRippleAeolian.frag
// -----------------------------------------------------------------------
// COMBINE SAND RIPPLE AEOLIAN: Desert sand ripple saltation & wind shear transition.
// Aeolian wind gusts blow golden sand ripples across the desert dunes,
// carrying fine grain saltation waves that wipe between the scenes.
//   interpolation -> sweeps sandstorm wind front across the frame
//   audioKick     -> flashes golden mineral glints in the blowing sand
//   audioBass     -> undulates sand dune ripple frequency & wave height
//
// Per-activation variety:
//   rippleP float sand ripple spatial frequency (0.5..2.2)
//   windP   float wind shear velocity multiplier (0.5..2.0)
//   speedP  float animation speed multiplier    (0.5..2.0)
//   hueP    float desert sand mineral hue offset (0..6.28)
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

uniform float rippleP;
uniform float windP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float rpl = (rippleP > 0.0) ? rippleP : 1.0;
    float wnd = (windP   > 0.0) ? windP   : 1.0;
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Diagonal wind direction
    vec2 windDir = normalize(vec2(1.0, 0.4));
    float windCoord = dot(p, windDir);

    // Sand ripple saltation waveform
    float ripple = sin(windCoord * 45.0 * rpl - t * 6.0 * wnd);
    float rippleShape = pow(sin(windCoord * 45.0 * rpl * 0.5 - t * 3.0 * wnd) * 0.5 + 0.5, 2.0);

    // Wind sweep front moving across
    float sweepFront = mix(-1.2, 1.2, tProg);
    float distToFront = windCoord - sweepFront;

    // Sand grain displacement
    vec2 sandDisp = windDir * ripple * 0.03 * midTransition * (1.0 + audioBass * 0.6);

    vec4 c1 = texture(tex1, fract(uv + sandDisp));
    vec4 c0 = texture(tex0, fract(uv - sandDisp));

    float wipeMask = smoothstep(-0.05, 0.05, distToFront);
    vec4 col = mix(c0, c1, wipeMask);

    // Golden sand mineral glints
    float glint = exp(-abs(distToFront) * 15.0) * rippleShape * midTransition;
    col.rgb += glint * vec3(1.0, 0.85, 0.4) * (1.5 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
