#version 330 core
out vec4 fragColor;
/**
 * @file NeonPoolNight.frag
 * @brief NEON POOL NIGHT: a swimming pool at night seen straight from above,
 * the water lit from inside by underwater lamps in turquoise and magenta.
 * Caustic nets dance over the tiled floor and the lane lines; the wall
 * lamps throw their colour in soft pools; the waterline of the coping
 * glows; a lone inflatable ring drifts slowly across and its shadow slides
 * over the floor.  The pool deck around it is dark, wet, with the neon
 * reflected in puddles.  The swell is the light; the bass sets the water
 * rolling -- the caustics move harder, nothing else does.
 *
 * Audio Reactivity:
 *   audioBass   -> the swell of the water: caustic strength (light)
 *   audioSwell  -> the lamps' brightness (slow)
 *   audioSpectrum[32] -> each wall lamp with its band (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> ripples, the drifting ring (continuous)
 *
 * Per-activation variety: lampsP (lamp colours), hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioBass;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioValence;
uniform float audioChromaHue;

uniform float lampsP;
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
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Caustic net: bright thin filaments where two drifting layers of
// ridged noise overlap, the look of sunlight focused by ripples.
float caustic(vec2 p, float t)
{
    float a = 1.0 - abs(2.0 * noise2(p + vec2(t * 0.4, t * 0.25)) - 1.0);
    float b = 1.0 - abs(2.0 * noise2(p * 1.3 + vec2(-t * 0.3, t * 0.35) + 7.0) - 1.0);
    return pow(a, 8.0) + pow(b, 8.0) + 0.6 * pow(a * b, 3.0);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    float hue = (hueP > 0.001) ? hueP : 0.0;

    vec3 cyan = vec3(0.1, 0.9, 1.0);
    vec3 mag  = mix(vec3(1.0, 0.2, 0.8), imgPalette(0.9 + hue * 0.159), 0.2);
    if (lampsP > 0.5) mag = mix(vec3(0.5, 0.3, 1.0), imgPalette(0.7 + hue * 0.159), 0.2);

    // The pool: a rounded rectangle, slightly rotated; the deck around it.
    float rot = 0.12;
    vec2 q = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * p;
    vec2 half_ = vec2(0.62, 0.34);
    vec2 dq = abs(q) - half_ + 0.04;
    float box = length(max(dq, 0.0)) + min(max(dq.x, dq.y), 0.0) - 0.04;

    vec3 col;
    if (box < 0.0) {
        // Refraction: the floor seen through rippling water.
        vec2 rip = vec2(noise2(q * 8.0 + vec2(T * 0.3, 0.0)), noise2(q * 8.0 + vec2(0.0, T * 0.27) + 5.0)) - 0.5;
        vec2 fq = q + rip * 0.01 * (1.0 + bass);
        // Tiles and lane lines.
        vec2 tq = fq * 40.0;
        vec2 tf = abs(fract(tq) - 0.5);
        float grout = smoothstep(0.46, 0.5, max(tf.x, tf.y));
        vec3 floorC = mix(vec3(0.3, 0.55, 0.7), vec3(0.18, 0.35, 0.5), grout);
        float lane = step(abs(fract(fq.y / 0.17 + 0.5) - 0.5) * 0.17, 0.012) * step(abs(fq.x), half_.x - 0.1);
        floorC = mix(floorC, vec3(0.05, 0.1, 0.35), lane);
        // Light: lamps set into the long walls, each with its band.
        vec3 light = vec3(0.0);
        for (int k = 0; k < 8; ++k) {
            float fk = float(k);
            float side = (k < 4) ? 1.0 : -1.0;
            float lx = (mod(fk, 4.0) - 1.5) * 0.3;
            vec2 lp = vec2(lx, side * (half_.y - 0.02));
            float d = length(q - lp);
            float e = clamp(audioSpectrum[int(mod(fk * 4.0 + 1.0, 32.0))] * 1.5, 0.0, 1.0);
            vec3 lc = (mod(fk, 2.0) < 0.5) ? cyan : mag;
            light += lc * exp(-d * 5.0) * (0.35 + 0.3 * swell + 0.45 * e);
            light += lc * exp(-d * 70.0) * 2.0;                  // the lamp itself
        }
        light += vec3(0.05, 0.2, 0.35) * 0.4;                     // ambient underwater glow
        float c = caustic(fq * 14.0, T * 0.5 * (1.0 + 0.6 * bass));
        vec3 w = floorC * light * (0.45 + 1.1 * c * (0.6 + 0.8 * bass));
        // Depth tint: deeper toward one end.
        w *= mix(vec3(1.0), vec3(0.4, 0.7, 1.0), smoothstep(-0.5, 0.6, q.x) * 0.5);
        // The inflatable ring drifting across, and its shadow on the floor.
        vec2 rc = vec2(0.45 * sin(T * 0.013 + 1.0), 0.18 * sin(T * 0.017));
        float rr = length(q - rc);
        float shadow = smoothstep(0.02, 0.0, abs(length(q - rc - vec2(0.03, -0.03)) - 0.06) - 0.02);
        w *= 1.0 - 0.45 * shadow;
        float ring = smoothstep(0.004, 0.0, abs(rr - 0.06) - 0.022);
        vec3 ringC = mix(vec3(1.0, 0.4, 0.3), vec3(1.0), step(0.5, fract(atan(q.y - rc.y, q.x - rc.x) / 6.2831853 * 6.0)));
        float rl = 0.6 + 0.4 * dot(normalize(q - rc + 1e-4), vec2(-0.6, 0.8)) * sign(rr - 0.06);
        w = mix(w, ringC * rl * (0.5 + 0.3 * swell) + light * 0.1, ring);
        // Surface glints.
        // Surface glints: round, jittered points that wink on and off.
        vec2 gg = q * 45.0, gi = floor(gg), gf = fract(gg);
        vec2 gc = 0.25 + 0.5 * vec2(hash21(gi + 1.0), hash21(gi + 2.0));
        float wink = pow(0.5 + 0.5 * sin(T * 3.0 + hash21(gi) * 40.0), 6.0);
        w += vec3(1.0) * smoothstep(0.12, 0.0, length(gf - gc)) * step(0.8, hash21(gi + 5.0)) * wink * 0.5;
        col = w;
        // The water glows at the wall.
        col += mix(cyan, mag, 0.5 + 0.5 * sin(q.x * 4.0)) * exp(box * 60.0) * 0.35;
    } else {
        // Deck: dark wet stone, neon reflected in puddles.
        vec2 sq = q * 12.0;
        vec2 sf = abs(fract(sq) - 0.5);
        float slab = smoothstep(0.47, 0.5, max(sf.x, sf.y));
        vec3 deck = vec3(0.04, 0.04, 0.05) * (0.8 + 0.4 * noise2(q * 30.0)) * (1.0 - 0.5 * slab);
        float puddle = smoothstep(0.55, 0.7, noise2(q * 6.0 + 3.0));
        vec3 glow = mix(cyan, mag, 0.5 + 0.5 * sin(q.x * 3.0)) * exp(-box * 10.0);
        deck += glow * (0.15 + 0.5 * puddle) * (0.7 + 0.5 * swell);
        // Coping: a bright stone lip.
        deck = mix(deck, vec3(0.5, 0.55, 0.6) * (0.3 + 0.5 * exp(-box * 30.0)) * (0.6 + 0.4 * cyan), smoothstep(0.012, 0.0, box - 0.012));
        col = deck;
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
