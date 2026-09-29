#version 330 core
out vec4 fragColor;
/**
 * @file KlimtGoldMosaic.frag
 * @brief KLIMT GOLD MOSAIC: a golden-period panel.  A field of beaten gold
 * leaf carries tendrils that coil into spirals, scattered eyes of
 * concentric rings and little black-and-white squares; down the middle a
 * gown of glass tesserae is set from the photo, sprinkled with ornamental
 * discs.  A slow light moves across the panel and the gold answers it --
 * the leaf flares where the light passes, each spiral glows with its own
 * band, and the treble strikes glints off the flakes.  Nothing moves but
 * the light.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> glow of the spirals and eyes (their bands)
 *   audioSwell        -> the passing light's strength (slow)
 *   audioHigh         -> glints on the gold flakes (light)
 *   sceneTime         -> the light moving across the panel (continuous)
 *
 * Per-activation variety: gownP (width of the gown), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioSwell;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float gownP;
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
vec2  hash22(vec2 p) { return vec2(hash21(p), hash21(p + 17.3)); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 3.7; a *= 0.5; } return v; }

// Distance to an Archimedean spiral r = b * theta about c (a few turns).
float spiralD(vec2 q, vec2 c, float b, float turns)
{
    vec2 d = q - c;
    float r = length(d);
    float a = atan(d.y, d.x);
    if (a < 0.0) a += 6.2831853;
    float k = floor((r / b - a) / 6.2831853 + 0.5);
    k = clamp(k, 0.0, turns);
    float rs = b * (a + k * 6.2831853);
    return abs(r - rs);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float gownW = mix(0.22, 0.36, clamp(gownP, 0.0, 1.0));

    // The light: a soft band that travels slowly across the panel.
    float lx = sin(sceneTime * 0.09) * aspect * 0.55;
    float light = exp(-pow((p.x - lx + p.y * 0.4) * 2.2, 2.0)) * (0.55 + 0.6 * swell);

    // Gold leaf: flakes (irregular cells) each at its own tilt, so each
    // catches the passing light a little differently.
    vec2 fq = p * 38.0;
    vec2 fi = floor(fq), ff = fract(fq);
    float tilt = hash21(fi);
    float crack = smoothstep(0.0, 0.06, min(min(ff.x, 1.0 - ff.x), min(ff.y, 1.0 - ff.y)));
    vec3 goldBase = mix(vec3(0.72, 0.52, 0.2), vec3(0.95, 0.78, 0.38), 0.3 + 0.5 * tilt);
    goldBase = mix(goldBase, imgPalette(hue * 0.159 + 0.08) * 1.2, 0.12);
    goldBase *= 0.75 + 0.35 * fbm(p * 6.0);
    float spec = pow(clamp(1.0 - abs(tilt - 0.5 - (p.x - lx) * 0.3), 0.0, 1.0), 8.0);
    vec3 col = goldBase * (0.55 + 0.9 * light) * (0.85 + 0.15 * crack) + vec3(1.0, 0.9, 0.6) * spec * light * 0.6;
    // Glints.
    float gl = step(0.985, hash21(fi + floor(sceneTime * 0.0) + 3.0)) * spec;
    col += vec3(1.0, 0.95, 0.8) * gl * (0.2 + 1.2 * hi);

    // Spirals: black-outlined gold coils (the Tree of Life's tendrils).
    for (int i = 0; i < 7; ++i)
    {
        float fi2 = float(i);
        vec2 c = vec2((hash11(fi2 * 3.1 + 1.0) - 0.5) * aspect * 0.95, (hash11(fi2 * 7.7 + 2.0) - 0.5) * 0.9);
        if (abs(c.x) < gownW * 0.6) c.x += sign(c.x + 0.001) * gownW * 0.8;
        float b = 0.008 + 0.008 * hash11(fi2 * 5.5);
        float d = spiralD(p, c, b, 3.0 + floor(hash11(fi2) * 3.0));
        float within = smoothstep(b * 6.2831853 * 5.0, b * 6.2831853 * 3.0, length(p - c));
        int band = int(mod(fi2 * 5.0 + 3.0, 32.0));
        float e = clamp(audioSpectrum[band] * 1.5, 0.0, 1.0);
        float line = smoothstep(0.004, 0.0015, d) * within;
        float outline = smoothstep(0.007, 0.004, d) * within;
        col = mix(col, vec3(0.05, 0.03, 0.02), outline * 0.85);
        col = mix(col, vec3(1.0, 0.82, 0.4) * (0.8 + 0.8 * e + light), line);
    }

    // Eyes: concentric rings in black, gold and a colour from the photo.
    vec2 eg = p * 5.0 + 0.5;
    vec2 ei = floor(eg), ef = fract(eg) - 0.5;
    vec2 ej = (hash22(ei + 4.0) - 0.5) * 0.4;
    float ed = length((ef - ej) * vec2(1.0, 1.5));
    float eyeOn = step(0.6, hash21(ei + 9.0)) * step(gownW, abs(p.x));
    float er = 0.13 + 0.05 * hash21(ei);
    float eRings = step(ed, er) * (0.5 + 0.5 * sin(ed / er * 18.0));
    int eb = int(mod(hash21(ei + 2.0) * 32.0, 32.0));
    float ee = clamp(audioSpectrum[eb] * 1.5, 0.0, 1.0);
    vec3 eyeC = mix(vec3(0.05), imgPalette(hue * 0.159 + hash21(ei + 6.0) * 0.5) * 1.2, eRings);
    eyeC = mix(eyeC, vec3(1.0, 0.8, 0.35), smoothstep(0.35, 0.2, ed / er) * (0.5 + 0.5 * ee));
    col = mix(col, eyeC, eyeOn * step(ed, er));

    // Small black-and-white squares scattered on the gold.
    vec2 sg = p * 14.0;
    vec2 si = floor(sg), sf = fract(sg);
    float sq = step(0.85, hash21(si + 12.0)) * step(gownW, abs(p.x));
    float inSq = step(0.25, sf.x) * step(sf.x, 0.75) * step(0.25, sf.y) * step(sf.y, 0.75);
    float chk = mod(floor(sf.x * 4.0) + floor(sf.y * 4.0), 2.0);
    col = mix(col, mix(vec3(0.06), vec3(0.9, 0.88, 0.82), chk), sq * inSq);

    // The gown down the middle: tesserae from the photo with gold grout,
    // flaring out toward the bottom, sprinkled with ornamental discs.
    float gw = gownW * (0.75 + 0.5 * (0.5 - p.y));
    float gm = smoothstep(gw + 0.01, gw - 0.01, abs(p.x + 0.02 * sin(p.y * 6.0)));
    if (gm > 0.0)
    {
        vec2 tq = p * vec2(60.0, 60.0);
        vec2 ti = floor(tq), tf = fract(tq);
        vec3 tess = img(clamp((ti + 0.5) / vec2(60.0 * aspect, 60.0) + 0.5, 0.0, 1.0));
        float gg = dot(tess, vec3(0.333));
        tess = mix(vec3(gg), tess, 1.35) * (0.8 + 0.3 * hash21(ti));
        float grout = smoothstep(0.0, 0.12, min(min(tf.x, 1.0 - tf.x), min(tf.y, 1.0 - tf.y)));
        vec3 gown = mix(goldBase * 0.8, tess * (0.9 + 0.5 * light), grout);
        // Ornamental discs on the gown.
        vec2 dg = p * 9.0;
        vec2 di = floor(dg), df = fract(dg) - 0.5;
        float dd = length(df - (hash22(di) - 0.5) * 0.3);
        float disc = step(dd, 0.18) * step(0.5, hash21(di + 3.0));
        vec3 discC = mix(vec3(1.0, 0.8, 0.35), vec3(0.05), step(0.5, fract(dd * 16.0)));
        gown = mix(gown, discC * (0.8 + light), disc);
        col = mix(col, gown, gm);
        col = mix(col, vec3(0.08, 0.05, 0.02), exp(-abs(abs(p.x) - gw) * 300.0) * 0.8);
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
