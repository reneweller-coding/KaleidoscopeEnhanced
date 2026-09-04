#version 330 core
out vec4 fragColor;
/**
 * @file KumikoLatticeShoji.frag
 * @brief KUMIKO LATTICE SHOJI: a shoji screen with a kumiko lattice, lit
 * from behind.  The frame is a grid of mortised bars; inside each opening
 * a hemp-leaf pattern is assembled from six thin slats meeting at the
 * centre.  The pieces are fitted one after another over the scene arc, so
 * the pattern builds; the paper behind carries the photo as the garden
 * outside, and its light moves with the swell.  The treble is the sheen
 * along a freshly fitted slat.  Camera fixed in front of the screen.
 *
 * Audio Reactivity:
 *   sceneProgress -> the lattice is assembled piece by piece (the arc)
 *   audioSwell    -> the daylight behind the paper (slow)
 *   audioHigh     -> the sheen on the wood (light)
 *   audioChroma[12] -> the tint of the light through each pane (light)
 *   audioKick     -> a shadow passes outside (light, local)
 *
 * Per-activation variety: cellsP, leafP, hueP.
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
uniform float audioSwell;
uniform float audioHigh;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float cellsP;
uniform float leafP;
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
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Distance to a slat: a line segment of half-width w, in cell coordinates.
float slat(vec2 q, vec2 a, vec2 b, float w)
{
    vec2 d = b - a;
    float t = clamp(dot(q - a, d) / max(dot(d, d), 1e-6), 0.0, 1.0);
    return length(q - (a + d * t)) - w;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float cells = 4.0 + floor(clamp(cellsP, 0.0, 1.0) * 4.0);           // openings across
    float leafN = 3.0 + floor(clamp(leafP, 0.0, 1.0) * 3.0);            // slats per half leaf
    float day = 0.65 + 0.55 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float prog = clamp(sceneProgress, 0.0, 1.0);
    float clock = sceneAdvance * 0.4 + sceneTime * 0.08;

    // The paper: the garden outside shows through as a soft glow, with the
    // paper's own fibres in it.
    vec3 garden = img(uv * 0.9 + 0.05);
    vec3 paper = mix(vec3(0.98, 0.95, 0.88), garden * 1.2, 0.3) * day * 1.15;
    paper *= 0.9 + 0.16 * noise2(p * 300.0);                             // fibre
    paper *= 0.88 + 0.2 * noise2(p * 26.0);                              // cloudiness
    // A shadow passing outside: the kick dims one side, locally.
    float shadowX = (fract(clock * 0.08) - 0.5) * aspect * 2.4;
    paper *= 1.0 - 0.3 * exp(-abs(p.x - shadowX) * 3.5) * audioKick;
    vec3 col = paper;

    // The cell lattice: the openings of the frame.
    float pitch = aspect * 0.9 / cells;
    vec2 g = (p + vec2(aspect * 0.45, 0.45)) / pitch;
    vec2 ci = floor(g);
    vec2 cf = fract(g) - 0.5;
    float rowsN = floor(0.9 / pitch);
    // Order of assembly: row-major, one cell per slice of the arc.
    float order = (ci.y * cells + ci.x) / max(cells * rowsN, 1.0);
    float slice = 1.0 / max(cells * rowsN, 1.0);
    float built = smoothstep(order, order + slice * 2.2, prog);
    float justBuilt = smoothstep(order + slice * 2.2, order + slice * 0.8, prog)
                    * smoothstep(order, order + slice * 0.6, prog);

    // The tint of the light through this pane: one chroma class.
    int cls = int(mod(ci.x * 3.0 + ci.y * 5.0, 12.0));
    float e = clamp(audioChroma[cls] * 1.6, 0.0, 1.0);
    col = mix(col, col * (imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.6 + 0.4), 0.18 + 0.25 * e);

    // The kumiko: the hemp-leaf figure, six slats from the centre out to
    // the corners and edge midpoints, plus the short cross pieces.
    float w = pitch * 0.03;
    float d = 1e9;
    for (int k = 0; k < 6; ++k)
    {
        float fk = float(k);
        if (fk >= leafN * 2.0) break;
        float a = fk / (leafN * 2.0) * 3.14159;
        vec2 dir = vec2(cos(a), sin(a));
        d = min(d, slat(cf, -dir * 0.5, dir * 0.5, w));
    }
    // The short pieces that close the leaf: chords between the long slats.
    for (int k = 0; k < 6; ++k)
    {
        float fk = float(k);
        if (fk >= leafN * 2.0) break;
        float a0 = fk / (leafN * 2.0) * 3.14159;
        float a1 = (fk + 1.0) / (leafN * 2.0) * 3.14159;
        vec2 p0 = vec2(cos(a0), sin(a0)) * 0.27;
        vec2 p1 = vec2(cos(a1), sin(a1)) * 0.27;
        d = min(d, slat(cf, p0, p1, w * 0.85));
        d = min(d, slat(cf, -p0, -p1, w * 0.85));
    }
    float lattice = smoothstep(0.004, -0.002, d) * built;
    // The frame bars around every opening: always there, the lattice fills in.
    float frame = smoothstep(pitch * 0.035, pitch * 0.02, min(0.5 - abs(cf.x), 0.5 - abs(cf.y)) * pitch);
    vec3 wood = mix(vec3(0.82, 0.72, 0.55), imgPalette(hue * 0.159 + 0.1), 0.2);
    wood *= 0.85 + 0.25 * noise2(cf * 40.0 + ci);                        // grain
    // The wood is lit from the front, so it is brighter than the paper only
    // at its edges; against the glowing paper it mostly reads as silhouette.
    vec3 barCol = wood * (0.35 + 0.3 * day) * 0.38;
    barCol += vec3(1.0, 0.97, 0.9) * smoothstep(0.002, -0.004, d) * (0.15 + 0.5 * hi) * 0.5;
    col = mix(col, barCol, clamp(lattice + frame, 0.0, 1.0));
    // A freshly fitted piece catches the light for a moment.
    col += wood * lattice * justBuilt * (0.3 + 0.7 * hi) * 0.5;
    // The outer frame of the screen and its stiles.
    float outer = smoothstep(0.012, 0.0, abs(max(abs(p.x) - aspect * 0.45, abs(p.y) - 0.45)));
    float stile = smoothstep(0.02, 0.012, abs(abs(p.x) - aspect * 0.45 + 0.02));
    col = mix(col, mix(vec3(0.35, 0.26, 0.16), imgPalette(hue * 0.159 + 0.06), 0.2) * (0.5 + 0.5 * day),
              clamp(outer + stile * 0.6, 0.0, 1.0));
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
