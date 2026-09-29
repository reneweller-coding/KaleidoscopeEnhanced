#version 330 core
out vec4 fragColor;
/**
 * @file BlackSandBeachWaves.frag
 * @brief BLACK SAND BEACH WAVES: an Icelandic black sand beach seen straight
 * down from high above -- the dark ocean rolling in from the top, line
 * after line of white breakers crossing it, each one leaving behind a
 * lace of foam that stretches and tears into a fine white net as it
 * drifts, and at the bottom the black volcanic sand, wet and shining
 * where the last film of each wave slides up and drains back.  The
 * camera hangs still; the waves roll in continuously.
 *
 * Audio Reactivity:
 *   audioSwell  -> the whiteness of the surf (slow)
 *   audioHigh   -> the glitter on the wet sand (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the waves rolling in, the foam drifting
 *
 * Per-activation variety: surfP (how wide the surf zone), hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float surfP;
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

float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

// Foam lace: the thin walls between Worley cells (F2 - F1 small).
float lace(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    float f1 = 9.0, f2 = 9.0;
    for (int y = -1; y <= 1; ++y)
    for (int x = -1; x <= 1; ++x) {
        vec2 o = vec2(x, y);
        vec2 c = o + 0.15 + 0.7 * hash22(i + o);
        float d = length(f - c);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    return f2 - f1;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float surf = 0.6 + 0.5 * clamp(surfP, 0.0, 1.0);

    // The shoreline curves gently across the lower part of the frame.
    float shore = -0.22 + 0.05 * sin(p.x * 2.2 + 0.7) + 0.02 * sin(p.x * 5.3);
    // The swash: each wave's film slides up the sand and drains back.
    float swash = shore - 0.07 * (0.5 + 0.5 * sin(T * 0.45 + p.x * 1.5)) - 0.02 * fbm(vec2(p.x * 6.0, T * 0.1));
    float off = p.y - shore;                                  // distance offshore (up the frame)

    // Black sand: dry above the swash line... wet and glossy below the water.
    vec3 sandDry = vec3(0.07, 0.07, 0.075) * (0.8 + 0.4 * noise2(p * 400.0));
    vec3 sandWet = vec3(0.03, 0.035, 0.045) + vec3(0.12, 0.14, 0.17) * fbm(p * 3.0 + 1.0) * 0.6;
    float wetLine = swash - 0.08;
    vec3 col = mix(sandDry, sandWet, smoothstep(wetLine - 0.02, wetLine + 0.02, p.y));
    // Glitter of wet grains.
    {
        vec2 g = p * 160.0, gi = floor(g), gf = fract(g);
        vec2 gc = 0.25 + 0.5 * hash22(gi);
        float tw = 0.5 + 0.5 * sin(T * 2.0 + hash21(gi + 7.0) * 40.0);
        float wet = smoothstep(wetLine, wetLine + 0.03, p.y) * step(p.y, swash);
        col += vec3(0.9, 0.95, 1.0) * smoothstep(0.12, 0.0, length(gf - gc)) * step(0.9, hash21(gi + 5.0)) * tw * wet * (0.15 + 0.7 * hi);
    }

    if (p.y > swash) {
        // Water: shallow over the sand, darker further out.
        float depth = smoothstep(0.0, 0.5, off);
        vec3 water = mix(vec3(0.1, 0.2, 0.2), vec3(0.03, 0.08, 0.1), depth);
        water = mix(water, water * imgPalette(0.5 + hueP * 0.159) * 1.6, 0.08);
        // The thin film at the swash's edge shows the sand through it.
        float film = smoothstep(swash, swash + 0.05, p.y);
        col = mix(col * 0.8 + vec3(0.05, 0.07, 0.08), water, film);

        // Breakers: lines rolling in toward the shore, bending along it.
        float L = 0.16 * surf;
        float bend = 0.03 * fbm(vec2(p.x * 3.0, 2.0));
        float ph = (off + bend) / L + T * 0.12;
        float wi = floor(ph);
        float f = fract(ph);                                    // 0 at the crest, rising behind it
        // Waves break only within the surf zone.
        float zone = smoothstep(0.5 * surf + 0.12, 0.05, off) * smoothstep(-0.05, 0.03, off);
        // Each breaker breaks only along parts of its length.
        float breaking = smoothstep(0.35, 0.6, noise2(vec2(p.x * 2.5 + wi * 5.1, wi * 1.7)));
        float cw = 0.12 + 0.15 * fbm(vec2(p.x * 9.0, wi * 3.0 + T * 0.05));
        float crest = smoothstep(cw, cw * 0.3, f) * breaking * (0.75 + 0.25 * fbm(vec2(p.x * 30.0, p.y * 40.0)));
        // Foam behind each crest: a lace that thins as it drifts back out.
        vec2 lq = vec2(p.x * 14.0, (p.y + 0.05 * sin(p.x * 4.0 + wi)) * 26.0) + vec2(wi * 7.3, -T * 0.3);
        vec2 wq = lq + 1.2 * vec2(fbm(lq * 0.25), fbm(lq * 0.25 + 5.0));
        float lw = min(lace(wq), lace(wq * 2.3 + 3.0) * 1.4);
        float thin = mix(0.3, 0.03, clamp(f * 1.4, 0.0, 1.0));
        // The lace survives in drifting patches that shrink as the foam ages.
        float patchy = smoothstep(0.35, 0.6, fbm(vec2(p.x * 5.0, p.y * 7.0) + vec2(wi * 3.3, -T * 0.05)) + 0.45 * (0.5 - f) + 0.3 * breaking - 0.15);
        float foam = smoothstep(thin, thin * 0.3, lw) * smoothstep(0.9, 0.1, f) * patchy;
        foam = max(foam, smoothstep(0.3, 0.0, f) * breaking * smoothstep(0.4, 0.7, fbm(lq * 0.5)) * 0.8);
        // Dense white water close to the shore.
        float white = smoothstep(0.08, 0.0, off - 0.02) * (0.5 + 0.5 * fbm(vec2(p.x * 8.0, T * 0.2)));
        float wf = clamp(crest + foam * 0.85 + white, 0.0, 1.0) * zone;
        wf = max(wf, smoothstep(0.03, 0.0, abs(p.y - swash - 0.005)) * 0.7);     // the frothy lip of the swash
        col = mix(col, vec3(0.93, 0.95, 0.97) * (0.85 + 0.25 * swell), wf);
        // Outer sea: long swell lines darkening and brightening.
        col *= 0.92 + 0.08 * sin(off * 40.0 + T * 0.8);
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
