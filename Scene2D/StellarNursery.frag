#version 330 core
out vec4 fragColor;
/**
 * @file StellarNursery.frag
 * @brief STELLAR NURSERY: pillars of creation -- three towering columns of
 * cold dust rising from the bottom of the frame into a glowing cavity, in
 * the narrow-band palette of the famous photographs (teal oxygen, gold
 * sulphur and hydrogen).  The tops of the pillars are lit and eroded by the
 * young stars above: bright rims, fingers of gas streaming off them, tiny
 * evaporating globules at the tips; a few protostars inside the pillars
 * blow thin bipolar jets.  The gas drifts and the jets' knots travel at
 * their own slow pace; the music is the light.
 *
 *   sceneTime/sceneAdvance -> gas drift, jet knots, streamers (continuous)
 *   audioSwell    -> the cavity glow and the rims (slow)
 *   audioKick     -> the protostars and jets flare (light only)
 *   audioChromaHue-> photo tint of the gas
 *
 * Per-activation variety:
 *   starP float density of the stars (0.5..1.5)
 *   jetP float brightness of the jets (0.5..2.0)
 *   hueP float palette offset (0..6.28)
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
uniform float audioLevel;
uniform float audioKick;
uniform float audioValence;
uniform float audioChromaHue;

uniform float starP;
uniform float jetP;
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
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 1.9; a *= 0.5; }
    return v;
}

// Signed distance-ish to pillar k (negative inside), and how far up it is.
float pillar(vec2 p, int k, out float up)
{
    float fk = float(k);
    float x0  = (k == 0) ? -0.55 : ((k == 1) ? -0.05 : 0.45);
    float top = (k == 0) ? 0.34 : ((k == 1) ? 0.1 : -0.12);
    float w0  = (k == 0) ? 0.14 : ((k == 1) ? 0.1 : 0.085);
    float lean = (k == 0) ? 0.22 : ((k == 1) ? 0.12 : -0.08);
    float y = p.y;
    up = clamp((y + 0.5) / (top + 0.5), 0.0, 1.2);
    float cx = x0 + lean * (y + 0.5) + 0.07 * (fbm(vec2(y * 2.5, fk * 7.0)) - 0.5);
    // Lumpy, irregular column; it frays and tapers into an uneven head
    // instead of ending in a cap.
    float lump = 0.6 + 0.8 * fbm(vec2(y * 4.0, fk * 3.0 + 1.0));
    float w = w0 * (1.2 - 0.35 * up) * lump;
    w *= smoothstep(top + 0.02, top - 0.06, y);
    float body = abs(p.x - cx) - w;
    // The head: a broad, lumpy knob with fingers (smooth-unioned).
    float cxTop = x0 + lean * (top + 0.5) + 0.07 * (fbm(vec2(top * 2.5, fk * 7.0)) - 0.5);
    vec2 hd = vec2(p.x - cxTop, (y - top + 0.02) * 1.15);
    float ha = atan(hd.y, hd.x);
    vec2 hdir = vec2(cos(ha), sin(ha));
    float hr = w0 * (0.95 + 0.9 * (0.7 * noise2(hdir * 2.0 + fk * 4.0) + 0.3 * noise2(hdir * 5.0 + fk) - 0.45));
    float head = length(hd) - hr;
    float k2 = 0.05;
    float hh = clamp(0.5 + 0.5 * (head - body) / k2, 0.0, 1.0);
    body = mix(head, body, hh) - k2 * hh * (1.0 - hh);
    // Nothing above the head: the edge noise must not spin threads into the sky.
    return max(body + 0.03 * (fbm(p * 12.0 + fk) - 0.5), y - top - w0 * 1.6);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float sp = (starP > 0.01) ? starP : 1.0;
    float jp = (jetP > 0.01) ? jetP : 1.0;
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.5;

    // The cavity: teal oxygen glow with golden sulphur/hydrogen veils.
    vec2 gq = p * 1.8 + vec2(T * 0.003, -T * 0.002);
    float g1 = fbm(gq + 0.5 * vec2(fbm(gq * 1.3 + 2.0), fbm(gq * 1.3 + 6.0)));
    float g2 = fbm(gq * 0.7 + 9.0);
    vec3 teal = mix(vec3(0.08, 0.32, 0.36), vec3(0.3, 0.72, 0.7), g1);
    vec3 gold = vec3(0.95, 0.72, 0.35);
    vec3 col = mix(teal, gold * (0.5 + 0.6 * g1), smoothstep(0.45, 0.75, g2) * 0.7);
    col = mix(col, imgPalette(0.45 + hue * 0.159) * 0.9, 0.12);
    col *= (0.5 + 0.9 * smoothstep(-0.5, 0.6, p.y)) * (0.8 + 0.35 * swell);

    // Stars in front of the gas.
    {
        vec2 g = p * 40.0;
        vec2 gi = floor(g), gf = fract(g);
        vec2 c = 0.2 + 0.6 * vec2(hash21(gi + 1.3), hash21(gi + 4.1));
        float h = hash21(gi);
        float dens = 0.06 * sp;
        float on = step(1.0 - dens, h);
        float b = (h - (1.0 - dens)) / max(dens, 1e-3);
        col += mix(vec3(1.0, 0.8, 0.7), vec3(0.8, 0.9, 1.0), hash21(gi + 7.0)) * on * (smoothstep(0.1, 0.0, length(gf - c)) * (0.5 + 1.5 * b));
    }

    // The pillars: dark, textured dust; bright rims toward the light above;
    // fingers of gas streaming up off the heads.
    vec3 dustC = vec3(0.3, 0.19, 0.12);
    vec3 rimC = mix(vec3(1.0, 0.78, 0.45), imgPalette(0.1 + hue * 0.159), 0.18);
    for (int k = 0; k < 3; ++k) {
        float up;
        float d = pillar(p, k, up);
        // Streamers above the head: evaporating gas flowing toward the light.
        float sx = p.x + 0.02 * sin(p.y * 20.0 + float(k));
        float stream = exp(-max(d, 0.0) * 22.0) * smoothstep(0.45, 0.8, fbm(vec2(sx * 22.0, p.y * 3.0 - T * 0.03 + float(k))));
        col += rimC * stream * 0.35 * smoothstep(0.6, 1.0, up) * (0.8 + 0.4 * swell);
        if (d < 0.0) {
            float depth = -d;
            float tex = fbm(p * 7.0 + float(k) * 3.0);
            float b0 = fbm(p * 9.0 + float(k)), b1 = fbm(p * 9.0 + float(k) - vec2(0.0, 0.08));
            float lit = clamp((b0 - b1) * 8.0 + 0.1, 0.0, 1.0);
            vec3 c = dustC * (0.25 + 0.6 * tex) * (0.35 + 0.65 * up);
            c += rimC * lit * 0.35 * up * exp(-depth * 10.0);
            // Rims: bright where the pillar faces the light (upper parts).
            float rim = exp(-depth * 60.0) * (0.3 + 0.9 * up);
            col = mix(col, c, smoothstep(0.0, 0.015, depth));
            col += rimC * rim * 0.9 * (0.75 + 0.5 * swell);
        }
    }

    // Protostars with bipolar jets and travelling knots.
    for (int k = 0; k < 3; ++k) {
        float fk = float(k);
        vec2 sc = vec2(-0.5 + 0.48 * fk, 0.18 - 0.14 * fk) + vec2(0.03 * hash11(fk), 0.0);
        vec2 ax = normalize(vec2(0.9, 0.35 - 0.3 * fk));
        vec2 d = p - sc;
        float along = dot(d, ax), across = dot(d, vec2(-ax.y, ax.x));
        float aa = abs(along);
        float w = 0.002 + 0.01 * aa;
        float beam = exp(-across * across / (w * w)) * exp(-aa * 8.0) * smoothstep(0.005, 0.02, aa);
        float knots = 0.0;
        for (int n = 0; n < 3; ++n) {
            float pos = fract(T * 0.02 + float(n) / 3.0 + fk * 0.37) * 0.35;
            knots += exp(-pow((aa - pos) / 0.006, 2.0)) * (1.0 - pos / 0.35);
        }
        vec3 jetC = vec3(1.0, 0.5, 0.45);
        col += jetC * beam * (0.4 + 2.0 * knots) * jp * (0.7 + 0.8 * kick);
        col += vec3(1.0, 0.85, 0.7) * exp(-dot(d, d) * 4000.0) * (0.8 + 1.2 * kick);
    }

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
