#version 330 core
out vec4 fragColor;
/**
 * @file CenoteLightShaft.frag
 * @brief CENOTE LIGHT SHAFT: below the surface of a flooded sinkhole,
 * looking up at the opening.  One shaft of sunlight comes through the
 * hole and stands in the water as a solid cone, thick with drifting
 * round motes; tree roots hang down through it, the cavern wall is the
 * photo, and the halocline lies across the middle as a shimmering layer.
 * The sun crosses the opening over the scene arc, so the shaft sweeps.
 * Camera fixed, looking up and forward.
 *
 * Audio Reactivity:
 *   sceneProgress -> the sun crosses the opening (the arc)
 *   sceneAdvance  -> motes drift, the halocline shimmers (continuous)
 *   audioSwell    -> how bright the shaft is (slow)
 *   audioHigh     -> mote sparkle (light)
 *   audioKick     -> a fish darts through the shaft (light and its own smooth path)
 *
 * Per-activation variety: rootsP, moteP, hueP.
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
uniform float audioSwell;
uniform float audioHigh;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float rootsP;
uniform float moteP;
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
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = p * 2.02 + 7.3; a *= 0.5; } return v; }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float roots = 4.0 + floor(clamp(rootsP, 0.0, 1.0) * 6.0);           // once per activation
    float motes = 0.4 + 0.9 * clamp(moteP, 0.0, 1.0);
    float sunAmt = 0.5 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.4 + sceneTime * 0.08;
    float prog = clamp(sceneProgress, 0.0, 1.0);

    // The opening: an ellipse high in frame; the sun crosses it over the arc.
    vec2 hole = vec2(0.02, 0.44);
    float sunX = mix(-0.16, 0.16, prog);
    vec2 sun = hole + vec2(sunX, -0.01);

    // The cavern: the photo as wet limestone, blue-green and dim, darker
    // toward the edges of frame.
    vec3 wall = img(uv * 1.25 + vec2(0.05, 0.0)) * mix(vec3(0.22, 0.35, 0.38), imgPalette(hue * 0.159 + 0.5), 0.35);
    wall *= 0.5 + 0.55 * fbm(p * 7.0);
    // Vertical flute marks down the rock.
    wall *= 0.8 + 0.35 * smoothstep(0.2, 0.5, abs(fract(p.x * 9.0 + fbm(p * 3.0) * 2.0) - 0.5));
    vec3 col = wall * 0.5;
    // Water body: everything gets bluer and dimmer with depth below the hole.
    float depth = clamp((hole.y - p.y) * 1.1, 0.0, 1.4);
    col = mix(col, mix(vec3(0.03, 0.12, 0.16), imgPalette(hue * 0.159 + 0.55) * 0.15, 0.35), clamp(depth * 0.55, 0.0, 0.8));

    // The opening itself: bright sky and jungle rim seen from below.
    vec2 hq = (p - hole) / vec2(0.3, 0.13);
    float inHole = smoothstep(1.0, 0.9, length(hq));
    vec3 skyCol = mix(vec3(1.0, 0.98, 0.85), imgPalette(hue * 0.159 + 0.15), 0.25);
    col = mix(col, skyCol * (1.1 + 0.8 * sunAmt), inHole * 0.92);
    // The jungle rim: dark fringe just inside the opening.
    float rim = smoothstep(1.18, 1.0, length(hq)) * (1.0 - inHole);
    col = mix(col, mix(vec3(0.06, 0.12, 0.05), imgPalette(hue * 0.159 + 0.3) * 0.2, 0.4), rim);

    // The shaft: a cone from the sun down into the water, widening.
    vec2 rel = p - sun;
    float down = clamp(-rel.y, 0.0, 1.4);
    float halfW = 0.045 + 0.30 * down;
    float across = abs(rel.x + rel.y * 0.12) / max(halfW, 1e-3);
    float shaft = smoothstep(1.0, 0.15, across) * smoothstep(0.0, 0.06, down) * exp(-down * 0.9);
    // The shaft's own texture: slow bands of brighter water drifting down.
    float bands = 0.65 + 0.5 * fbm(vec2(across * 2.0, down * 3.5 - clock * 0.5));
    vec3 shaftCol = mix(vec3(0.85, 0.95, 0.8), imgPalette(hue * 0.159 + 0.2), 0.25);
    col += shaftCol * shaft * bands * sunAmt * 0.85;
    // A brighter core.
    col += shaftCol * smoothstep(0.45, 0.0, across) * smoothstep(0.0, 0.1, down) * exp(-down * 1.3) * sunAmt * 0.6;

    // Roots: hanging strands from the rim, lit where they cross the shaft.
    for (int i = 0; i < 10; ++i)
    {
        float fi = float(i);
        if (fi >= roots) break;
        float rx = hole.x + (hash11(fi * 3.7) - 0.5) * 0.5;
        float len = 0.35 + 0.5 * hash11(fi * 5.3);
        // The strand: a slow sway, thicker at the top.
        float sway = 0.03 * sin(clock * 0.35 + fi * 1.7);
        float yy = clamp(hole.y - p.y, 0.0, len);
        float xAt = rx + sway * (yy / max(len, 1e-3)) * (yy / max(len, 1e-3)) * 3.0;
        float w = mix(0.006, 0.0015, yy / max(len, 1e-3));
        float strand = smoothstep(w, w * 0.4, abs(p.x - xAt)) * step(p.y, hole.y) * step(hole.y - len, p.y);
        vec3 rootCol = mix(vec3(0.2, 0.14, 0.1), imgPalette(hue * 0.159 + 0.08) * 0.3, 0.35);
        // Where a root stands in the shaft it lights up.
        float lit = shaft * 1.6;
        col = mix(col, rootCol * (0.5 + 1.4 * lit) * (0.4 + 0.8 * sunAmt), strand);
        // Fine hairs off the strand.
        float hair = smoothstep(w * 3.0, 0.0, abs(p.x - xAt)) * step(0.55, hash21(vec2(fi, floor(p.y * 90.0))));
        col = mix(col, rootCol * (0.6 + 1.2 * lit), hair * 0.35 * step(p.y, hole.y) * step(hole.y - len, p.y));
    }

    // Motes: round particles hanging in the water, brilliant inside the shaft.
    for (int layer = 0; layer < 2; ++layer)
    {
        float fl = float(layer);
        float scale = 26.0 + fl * 18.0;
        vec2 g = (p + vec2(sin(clock * 0.2 + fl) * 0.03, -clock * (0.012 + 0.01 * fl))) * scale + fl * 23.0;
        vec2 c = floor(g); vec2 f = fract(g) - 0.5;
        vec2 j = vec2(hash21(c + 1.3), hash21(c + 5.9)) - 0.5;
        float mote = smoothstep(0.19, 0.05, length(f - j * 0.7)) * step(1.0 - 0.13 * motes, hash21(c + fl * 3.1));
        col += vec3(1.0, 0.97, 0.85) * mote * (0.06 + 2.4 * shaft) * (0.5 + 0.8 * hi);
    }
    // The halocline: a shimmering layer where fresh water meets salt.
    float halo = exp(-abs(p.y + 0.12 + 0.02 * fbm(vec2(p.x * 5.0, clock * 0.3))) * 22.0);
    col = mix(col, col * vec3(1.15, 1.05, 0.95) + vec3(0.05, 0.07, 0.06), halo * 0.7);
    col += shaftCol * halo * shaft * 0.5;
    // A fish crossing the shaft: its own smooth path, lit by the kick.
    float fph = fract(clock * 0.11);
    vec2 fish = vec2(mix(-0.5, 0.5, fph) * aspect, -0.05 + 0.12 * sin(fph * 6.2831853));
    vec2 fq = p - fish;
    float fishD = length(fq * vec2(1.0, 2.6));
    float fishS = smoothstep(0.035, 0.012, fishD);
    float tail = smoothstep(0.02, 0.0, abs(fq.y * 2.0) - 0.006) * smoothstep(0.06, 0.03, abs(fq.x + 0.04));
    col = mix(col, mix(vec3(0.5, 0.55, 0.5), shaftCol, 0.4) * (0.3 + 1.5 * shaft + 0.6 * audioKick), max(fishS, tail * 0.7));
    col *= 0.85 + 0.3 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
