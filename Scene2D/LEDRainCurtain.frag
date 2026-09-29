#version 330 core
out vec4 fragColor;
/**
 * @file LEDRainCurtain.frag
 * @brief LED RAIN CURTAIN: a light installation seen head-on and filling the
 * frame -- a curtain of hundreds of hanging LED tubes in a hazy dark room,
 * rows of them one behind the other, and down every tube runs a falling
 * drop of light with a fading tail, like rain made of light.  Each column
 * belongs to one pitch class: when that note sounds, the drops in its
 * tubes burn bright in its colour; silent notes leave their tubes a faint
 * glimmer.  The haze glows around the tubes, and a black glossy floor
 * mirrors the curtain.  The drops fall at their own steady pace; the camera
 * is still.
 *
 * Audio Reactivity:
 *   audioChroma[12] -> the brightness of each pitch class's drops (light)
 *   audioSwell      -> the haze (slow)
 *   audioLevel      -> brightness
 *   sceneTime / sceneAdvance -> the falling drops (continuous)
 *
 * Per-activation variety: densityP (how close the tubes hang), hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioChroma[12];
uniform float audioSwell;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float densityP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

const float FLOORY = -0.42;
float gT, gPx, gDens;

// The colour of a pitch class: a wheel of hues, softened toward white.
vec3 classCol(int c)
{
    float h = float(c) / 12.0 + hueP * 0.3;
    vec3 k = 0.5 + 0.5 * cos(6.2831853 * (h + vec3(0.0, 0.33, 0.67)));
    return mix(k, vec3(1.0), 0.25);
}

// All tube layers at a point; far layers first, the near ones over them.
vec3 curtain(vec2 p)
{
    vec3 col = vec3(0.0);
    for (int L = 2; L >= 0; --L) {
        float fl = float(L);
        float sp = (0.07 - 0.018 * fl) * gDens;                  // column spacing: near wide, far dense
        float depthK = 1.0 - 0.3 * fl;                           // far layers dim into the haze
        float top = 0.5 + 0.02 * fl;
        float gx = p.x / sp + fl * 0.37;
        float ci = floor(gx + 0.5);
        for (int k = -1; k <= 1; ++k) {
            float id = ci + float(k);
            float hs = hash21(vec2(id, fl * 7.0 + 1.0));
            float cx = (id + 0.2 * (hs - 0.5) - fl * 0.37) * sp;
            float dx = p.x - cx;
            // Each tube hangs to its own length.
            float bottom = FLOORY + 0.015 + 0.1 * hash21(vec2(id, fl * 7.0 + 2.0)) * hash21(vec2(id, fl * 3.0 + 5.0)) + 0.02 * fl;
            if (p.y < bottom - 0.01 || p.y > top) continue;
            int cls = int(mod(id + fl * 5.0, 12.0));
            float e = clamp(audioChroma[cls] * 1.6, 0.0, 1.0);
            vec3 cc = classCol(cls);
            // The drops: two per tube, falling at the tube's own speed.
            float spd = 0.12 + 0.1 * hs;
            float len = top - bottom;
            float drop = 0.0;
            for (int d = 0; d < 2; ++d) {
                float ph = fract(hash11(id * 3.1 + fl + float(d) * 0.5) + float(d) * 0.5 + gT * spd / len);
                float hy = top - ph * (len + 0.25);
                float above = p.y - hy;                          // the tail trails above the head
                float tail = exp(-max(above, 0.0) / (0.06 + 0.1 * hs)) * step(-0.004, above);
                float head = exp(-above * above / 0.00008);
                drop += tail * 0.7 + head * 1.5;
            }
            float ends = smoothstep(bottom - 0.01, bottom + 0.01, p.y) * smoothstep(top, top - 0.05, p.y);
            float w = 0.0022 * depthK + gPx * 0.6;
            float core = exp(-dx * dx / (w * w));
            float halo = exp(-abs(dx) / (0.22 * sp)) * 0.3;
            float bright = (0.05 + drop * (0.12 + 1.6 * e)) * ends * depthK;
            col += cc * bright * (core + halo);
            // A white-hot core at the drop heads.
            col += vec3(1.0) * core * drop * e * 0.4 * ends * depthK;
        }
    }
    return col;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    gT = sceneTime + sceneAdvance * 0.4;
    gPx = 1.0 / resolution.y;
    gDens = 1.25 - 0.5 * clamp(densityP, 0.0, 1.0);

    // The room: black, the haze lit by the curtain as a whole.
    float energy = 0.0;
    for (int c = 0; c < 12; ++c) energy += audioChroma[c];
    energy = clamp(energy / 6.0, 0.0, 1.0);
    vec3 haze = mix(vec3(0.05, 0.06, 0.1), imgPalette(0.55 + hueP * 0.159) * 0.12, 0.3);
    float hz = (0.5 + 0.5 * noise2(p * 3.0 + vec2(0.0, gT * 0.03))) * (0.5 + 0.8 * swell) * (0.6 + 0.8 * energy);
    vec3 col = haze * hz * smoothstep(0.7, -0.2, abs(p.y - 0.05));

    if (p.y > FLOORY) {
        col += curtain(p);
    } else {
        // The glossy floor: the curtain mirrored, softened and dimmed.
        vec2 q = vec2(p.x + 0.004 * (noise2(p * vec2(40.0, 200.0)) - 0.5), 2.0 * FLOORY - p.y);
        float f = exp(-(FLOORY - p.y) * 6.0);
        col = col * 0.5 + curtain(q) * 0.35 * f;
        col += haze * 0.15 * f;
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
