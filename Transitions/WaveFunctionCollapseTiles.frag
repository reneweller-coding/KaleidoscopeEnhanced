#version 330 core
out vec4 fragColor;
/**
 * @file WaveFunctionCollapseTiles.frag
 * @brief TRANSITION WAVE FUNCTION COLLAPSE TILES: the frame is a grid of tiles
 * held in superposition -- every candidate at once, which reads as a blur --
 * and the certainty spreads outward from a few seeds until every tile has
 * settled on the incoming scene.
 *
 * Two things make this the algorithm rather than a checkerboard fade.  First,
 * a tile in superposition is the AVERAGE of its candidates, not a faded
 * version of the answer: it looks like several pictures at once, and it gets
 * sharper as candidates are eliminated.  Second, collapse PROPAGATES -- a tile
 * settles because its neighbours have, so certainty grows outward from seeds as
 * a front, and tiles far from every seed stay uncertain the longest.
 *
 * The candidates a tile is choosing between agree with its neighbours', because
 * the offset they are drawn from varies smoothly across the grid.  Independent
 * random candidates would make the uncertain region noise instead of a picture
 * that has not decided yet.
 *
 * Audio Reactivity:
 *   audioFlux  -> the collapse rate: how fast certainty spreads (slow)
 *   audioBass  -> the tile size (slow)
 *   audioHigh  -> the light on a tile as it settles (light)
 *   audioKick  -> the light across the uncertain field (light)
 *
 * Per-activation variety: tilesP, seedsP, hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float tilesP;
uniform float seedsP;
uniform float hueP;

const float PI = 3.14159265358979;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main()
{
    float tiles = 10.0 + floor(clamp(tilesP, 0.0, 1.0) * 14.0);   // rolled ONCE
    float seeds = 2.0 + floor(clamp(seedsP, 0.0, 1.0) * 3.0);     // rolled ONCE
    float hue   = (hueP > 0.0) ? hueP : 0.0;

    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;

    float d   = clamp(1.0 - interpolation, 0.0, 1.0);
    float arc = sin(d * PI);

    float nx = tiles * (0.9 + 0.25 * clamp(audioBass, 0.0, 1.0));
    float ny = max(3.0, floor(nx / aspect));
    vec2  grid = vec2(floor(nx), ny);
    vec2  g = uv * grid;
    vec2  gi = floor(g);
    vec2  gf = fract(g);
    vec2  tileUv = (gi + 0.5) / grid;

    // Certainty spreads from a handful of seeds: a tile settles because its
    // neighbours did, so what matters is the distance to the nearest seed.
    float near = 1e9;
    for (int i = 0; i < 5; ++i)
    {
        if (float(i) >= seeds) break;
        float fi = float(i);
        vec2 sd = vec2(hash21(vec2(fi, 1.7)), hash21(vec2(fi, 9.3)));
        near = min(near, length((tileUv - sd) * vec2(aspect, 1.0)));
    }
    float rate = 0.85 + 0.55 * clamp(audioFlux * 2.0, 0.0, 1.0);
    // Each tile also has its own small hesitation, so the front is ragged.
    float when = near / (1.35 * rate) + hash21(gi + 21.1) * 0.10;
    float settled = smoothstep(when, when + 0.16, d);

    // In superposition the tile is the AVERAGE of its candidates.  The offsets
    // vary smoothly across the grid, so neighbouring tiles are choosing between
    // compatible pictures rather than unrelated ones.
    vec3 sup = vec3(0.0);
    float wsum = 0.0;
    for (int k = 0; k < 5; ++k)
    {
        float fk = float(k);
        float a = 6.2831853 * fk / 5.0;
        vec2 dir = vec2(cos(a), sin(a));
        float amp = 0.10 * (0.4 + 0.9 * noise2(gi * 0.35 + fk * 3.1));
        vec2 cand = clamp(uv + dir * amp * (1.0 - settled), 0.0, 1.0);
        float w = 1.0 / (1.0 + fk);
        sup += textureLod(tex1, cand, 0.0).rgb * w;
        wsum += w;
    }
    sup /= wsum;

    vec3 definite = textureLod(tex1, uv, 0.0).rgb;
    vec3 tile = mix(sup, definite, settled);

    // Before anything has reached a tile it is still showing the old picture.
    float touched = smoothstep(0.0, 0.20, d) * smoothstep(when - 0.22, when, d);
    vec3 col = mix(texture(tex0, uv).rgb, tile, clamp(touched, 0.0, 1.0));
    col = mix(col, definite, smoothstep(0.90, 1.0, d));

    // The moment a tile settles it flashes, and the grid shows while it works.
    float snap = exp(-pow((d - when) / 0.05, 2.0));
    vec3 glow = mix(vec3(0.86, 0.92, 1.0), vec3(1.0, 0.94, 0.84), fract(hue * 0.159));
    col += glow * snap * arc * (0.06 + 0.26 * clamp(audioHigh * 2.0, 0.0, 1.0));
    float edge = smoothstep(0.05, 0.0, min(min(gf.x, 1.0 - gf.x), min(gf.y, 1.0 - gf.y)));
    col *= 1.0 - edge * 0.22 * arc * (1.0 - settled);
    col += glow * edge * arc * 0.05 * clamp(audioKick, 0.0, 1.0);

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
