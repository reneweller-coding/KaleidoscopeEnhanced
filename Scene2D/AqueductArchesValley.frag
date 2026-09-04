#version 330 core
out vec4 fragColor;
/**
 * @file AqueductArchesValley.frag
 * @brief AQUEDUCT ARCHES VALLEY: a Roman aqueduct striding across a
 * valley in two tiers of arches.  Water runs in the channel along the top
 * on the scene clock, each arch is lit by one chroma class from beneath,
 * and swifts cross the openings as round silhouettes.  The photo is the
 * valley behind and the stone of the piers.  Camera fixed on the far slope.
 *
 * Audio Reactivity:
 *   audioChroma[12] -> the light under each arch (light)
 *   sceneAdvance    -> the water in the channel, the birds (continuous)
 *   audioSwell      -> the daylight in the valley (slow)
 *   audioHigh       -> water glitter (light)
 *   audioKick       -> a swift changes course (light -- its own smooth curve)
 *
 * Per-activation variety: archesP, tiersP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioChroma[12];
uniform float audioSwell;
uniform float audioHigh;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float archesP;
uniform float tiersP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 4.7; a *= 0.5; } return v; }

// Is this point inside the masonry of one tier?  A tier is a slab with a
// row of round-headed arches cut out of it.
float tierMask(vec2 p, float top, float bot, float arches, float aspect, out float archId, out float archLocal)
{
    archId = 0.0; archLocal = 0.0;
    if (p.y > top || p.y < bot) return 0.0;
    float pitch = aspect * 2.0 / arches;
    float i = floor((p.x + aspect) / pitch);
    float f = fract((p.x + aspect) / pitch) - 0.5;
    archId = i;
    // The opening: a rectangle with a semicircular head.
    float halfW = pitch * 0.33;
    float springY = bot + (top - bot) * 0.42;               // where the arch head starts
    vec2 q = vec2(f * pitch, p.y);
    float inCol = step(abs(q.x), halfW) * step(bot, q.y) * step(q.y, springY);
    float head = step(length(vec2(q.x, q.y - springY)), halfW) * step(springY, q.y);
    float opening = max(inCol, head);
    archLocal = clamp((q.y - bot) / max(top - bot, 1e-3), 0.0, 1.0);
    return 1.0 - opening;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float arches = 6.0 + floor(clamp(archesP, 0.0, 1.0) * 5.0);         // once per activation
    float twoTier = step(0.4, clamp(tiersP, 0.0, 1.0));
    float day = 0.6 + 0.55 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.45 + sceneTime * 0.09;

    // The valley: the photo as hills and sky, hazy toward the far side.
    vec3 sky = img(vec2(uv.x, 0.62 + uv.y * 0.38)) * mix(vec3(0.8, 0.85, 1.0), imgPalette(hue * 0.159 + 0.6), 0.3);
    vec3 land = img(vec2(uv.x * 1.2, uv.y * 0.5)) * mix(vec3(0.55, 0.6, 0.4), imgPalette(hue * 0.159 + 0.35), 0.3);
    float hillLine = -0.1 + 0.09 * fbm(vec2(p.x * 1.6, 0.0)) - 0.04 * p.x;
    vec3 col = mix(land * (0.55 + 0.5 * day), sky * day, smoothstep(hillLine - 0.02, hillLine + 0.02, p.y));
    // A second, nearer ridge with trees.
    float ridge = -0.3 + 0.06 * fbm(vec2(p.x * 3.0 + 5.0, 0.0));
    vec3 near = land * vec3(0.55, 0.7, 0.45) * (0.4 + 0.4 * day);
    near *= 0.8 + 0.35 * fbm(p * 14.0);
    col = mix(near, col, smoothstep(ridge - 0.01, ridge + 0.01, p.y));

    // The aqueduct: an upper tier with the channel, and (sometimes) a
    // lower tier of taller arches under it.
    float topY = 0.3, midY = 0.02, botY = -0.34;
    float aId, aLocal;
    float upper = tierMask(p, topY, midY, arches, aspect, aId, aLocal);
    float bId, bLocal;
    float lower = twoTier * tierMask(p, midY, botY, max(arches * 0.5, 3.0), aspect, bId, bLocal);
    float stone = clamp(upper + lower, 0.0, 1.0);
    if (stone > 0.5)
    {
        float id = (upper > 0.5) ? aId : bId;
        // Ashlar blocks: the photo as stone, with courses and joints.
        vec2 su = vec2(p.x * 3.0, p.y * 3.0);
        vec3 st = (img(clamp(vec2(fract(su.x * 0.4), fract(su.y * 0.4)), 0.0, 1.0)) * 0.45 + 0.5)
                * mix(vec3(0.85, 0.78, 0.64), imgPalette(hue * 0.159 + 0.12), 0.2);
        float course = smoothstep(0.02, 0.06, abs(fract(p.y * 26.0) - 0.5));
        float joint = smoothstep(0.02, 0.06, abs(fract(p.x * 14.0 + floor(p.y * 26.0) * 0.5) - 0.5));
        st *= 0.7 + 0.35 * course * joint;
        st *= 0.8 + 0.35 * fbm(p * 30.0);
        // Weathering: darker low on the piers.
        st *= 0.75 + 0.35 * smoothstep(-0.3, 0.2, p.y);
        col = mix(col, st * day * 1.15, stone);
        // The light under each arch: one chroma class per opening.
        int cls = int(mod(id * 2.0 + 1.0, 12.0));
        float e = clamp(audioChroma[cls] * 1.6, 0.0, 1.0);
        vec3 lc = imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.5 + 0.15;
        // The glow lives on the stone right around the opening.
        float pitch = aspect * 2.0 / arches;
        float f = (fract((p.x + aspect) / pitch) - 0.5) * pitch;
        float near2 = exp(-abs(abs(f) - pitch * 0.33) * 22.0);
        col += lc * near2 * e * 0.6 * stone;
    }
    // The channel along the top: water running on the clock.
    float chan = step(topY, p.y) * step(p.y, topY + 0.055);
    if (chan > 0.5)
    {
        float flow = fract(p.x * 1.4 - clock * 0.5);
        vec3 water = mix(vec3(0.35, 0.6, 0.7), imgPalette(hue * 0.159 + 0.5), 0.35);
        water *= 0.6 + 0.5 * sin(p.x * 60.0 - clock * 6.0) * 0.5 + 0.4 * fbm(vec2(p.x * 20.0 - clock * 3.0, p.y * 20.0));
        col = mix(col, water * day * 1.2, chan);
        col += vec3(1.0) * smoothstep(0.85, 1.0, fbm(vec2(p.x * 45.0 - clock * 5.0, 3.0))) * hi * chan * 0.7;
        // The channel walls.
        col = mix(col, vec3(0.7, 0.65, 0.55) * day, smoothstep(0.006, 0.0, abs(p.y - topY - 0.055)) + smoothstep(0.004, 0.0, abs(p.y - topY)));
    }
    // Swifts: round-bodied silhouettes crossing the openings on smooth arcs.
    for (int i = 0; i < 7; ++i)
    {
        float fi = float(i);
        float sp = 0.05 + 0.04 * hash11(fi * 3.7);
        float ph = fract(clock * sp + hash11(fi * 5.3));
        // The path curves; the kick only makes the curve deeper, never a jump.
        float bend = (0.06 + 0.05 * audioKick) * sin(ph * 6.2831853 + fi);
        vec2 b = vec2((ph - 0.5) * aspect * 2.2 * ((hash11(fi * 7.1) > 0.5) ? 1.0 : -1.0),
                      0.1 + 0.22 * hash11(fi * 9.7) + bend);
        vec2 d = p - b;
        float bodyD = length(d * vec2(1.0, 2.2));
        float wing = smoothstep(0.02, 0.0, abs(abs(d.x) * 0.75 - d.y - 0.004)) * smoothstep(0.035, 0.0, abs(d.x) - 0.018);
        float bird = max(smoothstep(0.012, 0.006, bodyD), wing);
        col = mix(col, vec3(0.06, 0.06, 0.08), bird * 0.9);
    }
    // Haze in the valley, thicker low and far.
    col = mix(col, mix(vec3(0.7, 0.78, 0.9), imgPalette(hue * 0.159 + 0.6), 0.3) * day,
              smoothstep(0.1, -0.35, p.y) * 0.22);
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
