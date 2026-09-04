#version 330 core
out vec4 fragColor;
/**
 * @file LatentDenoiseArrival.frag
 * @brief TRANSITION LATENT DENOISE ARRIVAL: the incoming scene comes out of
 * noise the way a diffusion model samples it -- the noise level falls, coarse
 * structure settles first, detail last, and on the way there are shapes that
 * look right and are not.
 *
 * The order is what makes this recognisable.  A denoiser cannot recover fine
 * detail while the noise still swamps it, so what survives early is only the
 * low frequencies: big blocks of roughly the right colour in roughly the right
 * place.  Detail arrives at the end, quickly.  Fading the finished picture in
 * would show every frequency at once, which is what a cross-fade already does.
 *
 * The intermediate wrongness is deliberate too.  Early in the reverse process
 * the estimate is confidently wrong -- shapes that belong to no part of the
 * final picture -- so the coarse estimate here is warped by its own noise while
 * the level is high, and settles into place as the level falls.
 *
 * Audio Reactivity:
 *   audioSwell -> how fast the noise level falls (slow)
 *   audioHigh  -> the residual noise (light)
 *   audioMid   -> the colour of the noise (colour)
 *   audioKick  -> the light in the noise (light)
 *
 * Per-activation variety: stepsP, warpP, hueP.
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

uniform float stepsP;
uniform float warpP;
uniform float hueP;

const float PI = 3.14159265358979;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

// A band of the picture: a ring of samples at one radius keeps the frequencies
// below it and throws the ones above it away.
vec3 band(sampler2D tx, vec2 uv, float r, vec2 sc)
{
    if (r < 0.002) return textureLod(tx, clamp(uv, 0.0, 1.0), 0.0).rgb;
    vec3 s = textureLod(tx, clamp(uv, 0.0, 1.0), 0.0).rgb * 0.28;
    float w = 0.28;
    for (int i = 0; i < 8; ++i)
    {
        float a = 6.2831853 * float(i) / 8.0 + 0.4;
        s += textureLod(tx, clamp(uv + vec2(cos(a), sin(a)) * r * sc, 0.0, 1.0), 0.0).rgb * 0.09;
        w += 0.09;
    }
    return s / w;
}

void main()
{
    float steps = (stepsP > 0.0) ? stepsP : 1.0;
    float warp  = (warpP  > 0.0) ? warpP  : 1.0;
    float hue   = (hueP   > 0.0) ? hueP   : 0.0;

    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p  = (uv - 0.5) * vec2(aspect, 1.0);
    vec2  sc = vec2(1.0 / aspect, 1.0);

    float d   = clamp(1.0 - interpolation, 0.0, 1.0);
    float arc = sin(d * PI);

    // The noise level falls across the turn.
    float pace = steps * (0.85 + 0.4 * clamp(audioSwell, 0.0, 1.0));
    float sigma = clamp(1.0 - d * 1.55 * pace, 0.0, 1.0);

    // Early on the estimate is confidently wrong: the coarse picture is pushed
    // around by its own noise, and settles as the level falls.
    vec2 wv = vec2(noise2(p * 2.1 + 5.0), noise2(p * 2.1 + 19.0)) - 0.5;
    vec2 wuv = clamp(uv + wv * 0.16 * warp * sigma * sigma * sc, 0.0, 1.0);

    // Frequencies arrive in order: coarse, then middle, then everything.
    vec3 coarse = band(tex1, wuv, 0.075, sc);
    vec3 middle = band(tex1, uv,  0.022, sc);
    vec3 fine   = textureLod(tex1, uv, 0.0).rgb;

    vec3 target = mix(coarse, middle, smoothstep(0.80, 0.42, sigma));
    target = mix(target, fine, smoothstep(0.42, 0.08, sigma));

    // The noise itself, coloured a little the way a latent's is.
    float n1 = hash21(floor(uv * resolution.y * 0.75) + 3.7);
    float n2 = hash21(floor(uv * resolution.y * 0.75) + 91.3);
    float n3 = hash21(floor(uv * resolution.y * 0.75) + 47.1);
    vec3 grain = vec3(n1, n2, n3) - 0.5;
    // The noise carries the colour of what it is going to become: a latent is
    // not flat grey, and flat grey is what made this read as static.
    vec3 tint = mix(coarse * 1.15, vec3(0.55, 0.58, 0.66), 0.35);
    tint = mix(tint, tint.gbr, fract(hue * 0.159) * 0.4);
    tint = mix(tint, tint * vec3(1.06, 1.0, 0.94), clamp(audioMid * 2.0, 0.0, 1.0) * 0.35);
    vec3 noisy = tint + grain * (0.55 + 0.45 * clamp(audioHigh * 2.0, 0.0, 1.0));
    noisy += vec3(0.10) * clamp(audioKick, 0.0, 1.0) * arc;

    // The sample at this noise level.
    vec3 x = mix(target, noisy, sigma * sigma * 0.95);

    // The two ends are the untouched scenes.
    vec3 col = mix(texture(tex0, uv).rgb, x, smoothstep(0.0, 0.16, d));
    col = mix(col, fine, smoothstep(0.86, 1.0, d));

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
