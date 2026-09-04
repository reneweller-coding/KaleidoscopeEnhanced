#version 330 core
out vec4 fragColor;
/**
 * @file BatikWaxCracks.frag
 * @brief BATIK WAX CRACKS: cloth under wax, dyed.  A drawn motif of dots
 * and vines is reserved in wax; the wax then crazes into a network of
 * fine cracks, and the dye seeps into every crack, so the cloth ends up
 * with the pattern plus a web of thin dark veins.  Over the scene arc the
 * crack net grows and the dye deepens; the bass is how far the dye
 * spreads, the chroma classes pick the dye bath.  Camera fixed on the cloth.
 *
 * Audio Reactivity:
 *   sceneProgress   -> the crazing spreads and the dye takes (the arc)
 *   audioBass       -> how deep the dye runs into the cracks (slow)
 *   audioChroma[12] -> the dye colours (light)
 *   audioHigh       -> the wax sheen (light)
 *   audioKick       -> the cloth is lifted: a light ripple (light only)
 *
 * Per-activation variety: motifP, crackP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float sceneProgress;
uniform float audioAdvance;
uniform float audioChroma[12];
uniform float audioBass;
uniform float audioHigh;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float motifP;
uniform float crackP;
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

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash22(vec2 p)
{
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
}
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = p * 2.02 + 5.3; a *= 0.5; } return v; }

// Voronoi seam: the distance to the nearest cell boundary.
float seamAt(vec2 x, out float id)
{
    vec2 n = floor(x), f = fract(x);
    float d1 = 8.0, d2 = 8.0; id = 0.0;
    for (int j = -1; j <= 1; ++j)
    for (int i = -1; i <= 1; ++i)
    {
        vec2 g = vec2(float(i), float(j));
        vec2 h = hash22(n + g);
        vec2 r = g + h - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; id = h.x; }
        else if (d < d2) { d2 = d; }
    }
    return sqrt(d2) - sqrt(d1);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float motif = 3.0 + floor(clamp(motifP, 0.0, 1.0) * 4.0);           // motif repeats
    float crackScale = 14.0 + 14.0 * clamp(crackP, 0.0, 1.0);
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.4 + sceneTime * 0.08;

    // The cloth: the photo as woven cotton, warm and slightly uneven.  The
    // kick lifts it: a light ripple only, the weave never moves.
    vec2 cuv = uv;
    vec3 cloth = img(cuv) * mix(vec3(0.9, 0.85, 0.74), imgPalette(hue * 0.159 + 0.15), 0.25);
    float weave = (0.5 + 0.5 * sin(uv.x * resolution.x * 0.7)) * (0.5 + 0.5 * sin(uv.y * resolution.y * 0.7));
    cloth *= 0.82 + 0.3 * weave;
    cloth *= 0.88 + 0.22 * fbm(p * 26.0);
    vec3 col = cloth;

    // The motif: a grid of medallions with dot rosettes and vine arcs, all
    // reserved in wax (so they stay the cloth's own colour).
    vec2 mgrid = p * motif;
    vec2 mi = floor(mgrid);
    vec2 mf = fract(mgrid) - 0.5;
    float rm = length(mf);
    float am = atan(mf.y, mf.x);
    float wax = 0.0;
    // The medallion ring.
    wax = max(wax, smoothstep(0.03, 0.0, abs(rm - 0.33)));
    wax = max(wax, smoothstep(0.02, 0.0, abs(rm - 0.24)));
    // A rosette of dots around the centre.
    for (int k = 0; k < 8; ++k)
    {
        float a2 = float(k) * 0.7853982 + hash21(mi) * 3.14;
        wax = max(wax, smoothstep(0.04, 0.02, length(mf - vec2(cos(a2), sin(a2)) * 0.14)));
    }
    wax = max(wax, smoothstep(0.07, 0.045, rm));
    // Vine arcs between the medallions.
    float vine = smoothstep(0.025, 0.0, abs(abs(mf.x) - abs(mf.y)) - 0.42);
    wax = max(wax, vine * 0.8);
    // Fine hand-drawn unevenness on every wax line.
    wax *= 0.75 + 0.4 * fbm(p * 30.0);

    // The dye: the class picks the bath, and the cloth takes it wherever
    // the wax is not.  Over the arc it deepens.
    int cls = int(mod(floor(mi.x + mi.y * 2.0), 12.0));
    float e = clamp(audioChroma[cls] * 1.6, 0.0, 1.0);
    vec3 dye = mix(vec3(0.12, 0.16, 0.42), imgPalette(hue * 0.159 + float(cls) / 12.0) * 0.8, 0.45 + 0.3 * e);
    float take = smoothstep(0.0, 0.45, prog) * (0.7 + 0.5 * e);
    col = mix(col, dye * (0.55 + 0.5 * e) * (0.8 + 0.4 * weave), (1.0 - wax) * take * 0.9);

    // The crazing: cracks spread over the arc from a few starting points,
    // and the dye runs into them.  A crack exists once the front reaches it.
    float id;
    float seam = seamAt(p * crackScale, id);
    float edgeNoise = (fbm(p * 40.0) - 0.5) * 0.02;
    // The front: several origins, so the net grows from more than one place.
    float nearest = 9.0;
    for (int k = 0; k < 3; ++k)
    {
        vec2 o = vec2(hash21(vec2(float(k), 1.0)) - 0.5, hash21(vec2(float(k), 7.0)) - 0.5) * vec2(aspect, 1.0) * 1.4;
        nearest = min(nearest, length(p - o));
    }
    float front = smoothstep(0.1, 0.85, prog) * 1.6;
    float grown = smoothstep(front + 0.12, front - 0.12, nearest);
    float crack = smoothstep(0.035, 0.004, seam + edgeNoise) * grown;
    // The dye in the crack: deeper with the bass, and it bleeds sideways.
    float bleed = smoothstep(0.09, 0.02, seam + edgeNoise) * grown * (0.35 + 0.6 * bass);
    vec3 crackDye = dye * 0.5;
    col = mix(col, crackDye, bleed * 0.45);
    col = mix(col, crackDye * 0.5, crack * 0.85);

    // The wax that is still on the cloth: a slight sheen, and it is paler.
    col = mix(col, col * 1.12 + vec3(0.05, 0.045, 0.035), wax * (1.0 - smoothstep(0.75, 1.0, prog)) * 0.6);
    col += vec3(1.0, 0.97, 0.9) * wax * hi * 0.25 * (1.0 - smoothstep(0.75, 1.0, prog));
    // The cloth lifted by the kick: a broad light ripple, no motion.
    float ripple = 0.5 + 0.5 * sin(p.x * 5.0 + p.y * 3.0 + clock * 1.2);
    col *= 1.0 + 0.12 * ripple * audioKick;
    // The frame the cloth is pinned to.
    float pin = smoothstep(0.02, 0.0, abs(max(abs(p.x) - aspect * 0.47, abs(p.y) - 0.45)));
    col = mix(col, vec3(0.25, 0.2, 0.14), pin);
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
