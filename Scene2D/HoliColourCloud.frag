#version 330 core
out vec4 fragColor;
/**
 * @file HoliColourCloud.frag
 * @brief HOLI COLOUR CLOUD: clouds of coloured powder thrown into low sun,
 * billowing in slow motion and lit from behind so their edges burn and
 * their cores glow.  Several plumes in different colours roll into each
 * other and mix where they meet; fine grains glitter in the back light.
 * The plumes keep their own slow billow; the music lights them: each plume
 * glows with its band, and the kick sends a warm surge through the back
 * light.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> glow of each plume (its band)
 *   audioKick         -> a surge of the back light (light only)
 *   audioSwell        -> how dense and wide the plumes are (slow)
 *   audioHigh         -> the glitter of the grains (light)
 *   sceneTime         -> the slow billow (continuous)
 *
 * Per-activation variety: plumesP (number of plumes), hueP.
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
uniform float audioKick;
uniform float audioSwell;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float plumesP;
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

vec3 hueRot(vec3 c, float a)
{
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

vec3 hsv(float h, float s, float v)
{
    vec3 k = clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
    return v * mix(vec3(1.0), k, s);
}

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 6; ++i) { v += a * noise2(p); p = p * 2.03 + 3.7; a *= 0.5; } return v; }

// Holi powder is saturated pigment: the photo arc, pushed to pure colour
// and turned per plume (colour identity, V8b).
vec3 pigment(float i, float hue)
{
    // Holi pigments are pure colours: hues spread by the golden angle,
    // the set turned by the activation's hue.
    return hsv(hue * 0.159 + i * 0.381966, 0.9, 1.0);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 2.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    int nPl = 3 + int(clamp(plumesP, 0.0, 1.0) * 2.99);
    float t = sceneTime * 0.05;

    // Back light: a low warm sun behind the clouds.
    vec2 sun = vec2(0.15 * aspect, 0.12);
    vec3 sunC = mix(vec3(1.0, 0.85, 0.6), imgPalette(hue * 0.159 + 0.08), 0.2);
    // A clear evening sky behind: pale blue above, warm toward the sun.
    vec3 skyHi = vec3(0.55, 0.72, 0.95);
    vec3 skyLo = vec3(1.0, 0.82, 0.62);
    vec3 col = mix(skyLo, skyHi, smoothstep(-0.4, 0.5, p.y)) * 0.9;
    float sd = length(p - sun);
    col += sunC * exp(-sd * 3.0) * (0.6 + 0.3 * kick);

    // Plumes: domain-warped density blobs, each centred somewhere and
    // billowing outward; composited back to front with self-shadowing
    // approximated by density toward the sun.
    float accA = 0.0;
    vec3 accC = vec3(0.0);
    for (int k = 0; k < 5; ++k)
    {
        if (k >= nPl) break;
        float fk = float(k);
        // Plumes spread across the frame so they meet at their edges, not in one heap.
        vec2 c = vec2(((fk + 0.5) / float(nPl) - 0.5) * aspect * 0.95 + (hash11(fk * 1.7) - 0.5) * 0.15, (hash11(fk * 4.3) - 0.5) * 0.5);
        c += 0.05 * vec2(sin(t * 2.0 + fk), cos(t * 1.7 + fk * 2.0));
        vec2 q = (p - c) / (0.45 + 0.2 * swell);
        vec2 warp = vec2(fbm(q * 1.5 + vec2(t, fk * 7.0)), fbm(q * 1.5 + vec2(fk * 3.0, -t)));
        float dens = fbm(q * 2.0 + warp * 1.6 + vec2(0.0, -t * 1.5));
        float shape = smoothstep(1.3, 0.2, length(q + (warp - 0.5) * 0.6));
        float d = clamp((dens - 0.35) * 2.2, 0.0, 1.0) * shape;
        // Density toward the sun: thicker = darker core, thin = bright edge.
        vec2 qs = q + normalize(sun - c) * 0.08;
        float dsun = clamp((fbm(qs * 2.0 + warp * 1.6 + vec2(0.0, -t * 1.5)) - 0.35) * 2.2, 0.0, 1.0) * shape;
        float edge = smoothstep(0.6, 0.0, dsun) * d;
        int band = int(mod(fk * 6.0 + 2.0, 32.0));
        float e = clamp(audioSpectrum[band] * 1.5, 0.0, 1.0);
        vec3 pig = pigment(fk, hue);
        vec3 lit = pig * (1.1 + 0.5 * e) + pig * edge * (1.1 + 0.6 * kick) * sunC + sunC * edge * 0.12;
        float a = clamp(d * 1.5, 0.0, 1.0) * (0.8 + 0.2 * swell);
        // Front plume over what is behind (no averaging into mud).
        accC = mix(accC, lit, a);
        accA = accA + a * (1.0 - accA);
    }
    col = mix(col, accC, clamp(accA, 0.0, 1.0));

    // Glitter: fine grains catching the back light, round.
    vec2 g = p * 160.0 + vec2(0.0, -sceneTime * 4.0);
    vec2 gc = floor(g), gf = fract(g) - 0.5;
    vec2 gj = vec2(hash21(gc), hash21(gc + 5.0)) - 0.5;
    float gr = smoothstep(0.18, 0.05, length(gf - gj * 0.6)) * step(0.975, hash21(gc + 9.0));
    col += sunC * gr * accA * (0.2 + 1.2 * hi);

    // Daylight scene: brighter than the night scenes around it.
    col *= 1.3 * (0.9 + 0.2 * audioLevel);
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
