#version 330 core
out vec4 fragColor;
/**
 * @file StereoSearchlights.frag
 * @brief STEREO SEARCHLIGHTS: a night city skyline of the photo, with
 * searchlights sweeping the sky.  The beams point where the sound is: the
 * stereo balance steers them (smoothly -- the balance is filtered and the
 * beam follows it with a slow lag built from the scene clock), the left
 * and right channel levels set the two banks' brightness, and the swell
 * lights the low cloud they play on.  Camera fixed on the skyline.
 *
 * Audio Reactivity:
 *   audioStereo       -> beam direction (slow: a lagged follow)
 *   audioStereoL / R  -> left / right bank brightness (light)
 *   audioSwell        -> cloud lit from below (slow)
 *   audioKick         -> beam flare (light)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: beamsP, hazeP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioStereo;
uniform float audioStereoL;
uniform float audioStereoR;
uniform float audioSwell;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float beamsP;
uniform float hazeP;
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
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 5.0; a *= 0.5; }
    return v;
}

// Light along a beam from origin o in direction angle a (from vertical),
// with half-width w: a soft wedge.
float beam(vec2 p, vec2 o, float a, float w)
{
    vec2 d = p - o;
    float along = dot(d, vec2(sin(a), cos(a)));
    float across = dot(d, vec2(cos(a), -sin(a)));
    if (along < 0.0) return 0.0;
    float width = w * (0.3 + along * 1.2);
    return smoothstep(width, width * 0.2, abs(across)) * exp(-along * 0.45);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float nBeams = floor(2.0 + 2.0 * clamp(beamsP, 0.0, 1.0));          // per bank, once per activation
    float haze = 0.7 + 0.6 * clamp(hazeP, 0.0, 1.0);
    // Direction: the balance (-1..1) steered smoothly -- we blend it with
    // a slow sweep on the scene clock so the beams are always moving
    // gently and the balance only biases where they point.
    float bal = clamp(audioStereo, -1.0, 1.0);
    float sweep = sin(sceneAdvance * 0.25 + sceneTime * 0.05);
    float dir = clamp(0.55 * bal + 0.35 * sweep, -1.0, 1.0);            // -1 left .. 1 right
    float lL = clamp(audioStereoL * 1.5, 0.0, 1.0);
    float lR = clamp(audioStereoR * 1.5, 0.0, 1.0);
    float cloudLit = 0.3 + 0.9 * clamp(audioSwell, 0.0, 1.0);

    // Night sky with low cloud, the photo faint as the cloud texture.
    float cl = fbm(vec2(p.x * 1.2 - sceneAdvance * 0.03, p.y * 2.5) + 3.0);
    vec3 sky = mix(vec3(0.02, 0.03, 0.08), imgPalette(hue * 0.159 + 0.6) * 0.15, 0.5);
    vec3 cloud = mix(vec3(0.12, 0.13, 0.2), img(vec2(p.x / aspect + 0.5, p.y + 0.5)) * 0.4, 0.4);
    float cover = smoothstep(0.45, 0.7, cl) * smoothstep(-0.1, 0.3, p.y);
    vec3 col = mix(sky, cloud * cloudLit, cover);
    // Stars: round, few.
    vec2 su = p * 80.0; vec2 sc = floor(su); vec2 sf = fract(su) - 0.5;
    vec2 so = vec2(hash21(sc + 1.3), hash21(sc + 5.9)) - 0.5;
    col += vec3(0.8, 0.85, 1.0) * smoothstep(0.15, 0.03, length(sf - so * 0.6)) * step(0.985, hash21(sc)) * (1.0 - cover) * 0.6;

    // Skyline: the photo as lit windows in dark towers.
    float sk = -0.25 + 0.2 * fbm(vec2(p.x * 4.0, 7.0)) + 0.1 * step(0.5, hash11(floor(p.x * 12.0)));
    float city = step(p.y, sk);
    vec2 wuv = vec2(p.x * 25.0, p.y * 50.0);
    float window = step(0.6, hash21(floor(wuv))) * smoothstep(0.35, 0.25, abs(fract(wuv.x) - 0.5)) * smoothstep(0.35, 0.25, abs(fract(wuv.y) - 0.5));
    vec3 towers = vec3(0.03, 0.03, 0.05) + img(vec2(fract(p.x * 0.5 + 0.5), (p.y + 0.5) * 0.5)) * window * 0.8 * imgPalette(hue * 0.159 + 0.1) * 2.0;

    // Searchlights: two banks at the skyline, left and right; each beam
    // in a bank fans a little; all point along `dir` with the bank offset.
    float beams = 0.0;
    for (int i = 0; i < 4; ++i)
    {
        if (float(i) >= nBeams) break;
        float fi = float(i);
        float fan = (fi - (nBeams - 1.0) * 0.5) * 0.12;
        // Both banks lean toward the centre and cross over the city; the
        // balance pushes the crossing point left or right.
        float aL =  0.42 + 0.45 * dir + fan + 0.05 * sin(sceneAdvance * 0.4 + fi);
        float aR = -0.42 + 0.45 * dir + fan + 0.05 * sin(sceneAdvance * 0.37 + fi + 2.0);
        beams += beam(p, vec2(-aspect * 0.35 + fi * 0.06, sk - 0.05), aL, 0.06) * (0.5 + 1.0 * lL);
        beams += beam(p, vec2( aspect * 0.35 - fi * 0.06, sk - 0.05), aR, 0.06) * (0.5 + 1.0 * lR);
    }
    beams = min(beams * haze, 1.4) * (1.0 + 0.4 * audioKick);
    vec3 beamCol = mix(vec3(0.85, 0.9, 1.0), imgPalette(hue * 0.159 + 0.5), 0.25);
    // Beams light the cloud where they hit it.
    col += beamCol * beams * (0.9 + 1.2 * cover * cloudLit);
    col = mix(col, towers, city);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
