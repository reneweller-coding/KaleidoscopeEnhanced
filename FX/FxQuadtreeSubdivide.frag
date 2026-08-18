#version 330 core
out vec4 fragColor;
// CombineQuadtreeSubdivide.frag
// -----------------------------------------------------------------------
// COMBINE QUADTREE SUBDIVIDE: Hierarchical recursive quadtree partitioning
// dividing the viewport into multi-scale tiles. Smaller sub-quads flip and
// resolve with cybernetic neon boundary grids to reveal the incoming scene.
//   interpolation -> drives recursive quadtree depth & tile flip progress
//   audioKick     -> flashes quadtree partition grid lines
//   audioBass     -> undulates subdivision threshold
//
// Per-activation variety:
//   depthP float maximum quadtree recursion depth (0.5..2.2)
//   gridP  float partition grid line intensity   (0.5..2.0)
//   speedP float animation speed multiplier      (0.5..2.0)
//   hueP   float partition line hue offset       (0..6.28)
// -----------------------------------------------------------------------

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

uniform float depthP;
uniform float gridP;
uniform float speedP;
uniform float hueP;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float hash21(vec2 p) {
    p = fract(p * vec2(534.34, 835.21));
    p += dot(p, p + 62.32);
    return fract(p.x * p.y);
}

void main() {
    float dpt = (depthP > 0.0) ? depthP : 1.0;
    float grd = (gridP  > 0.0) ? gridP  : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    // Quadtree hierarchy: level 1 (2x2), level 2 (4x4), level 3 (8x8), level 4 (16x16)
    float gridBorder = 0.0;
    float tileSeed = 0.0;
    vec2 curUV = uv;

    float scale = 2.0;
    for (int lvl = 0; lvl < 4; ++lvl) {
        vec2 cell = floor(curUV * scale);
        vec2 f = fract(curUV * scale);

        tileSeed += hash21(cell + float(lvl) * 13.7) * (1.0 / float(lvl + 1));

        // Border detection
        float b = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
        gridBorder = max(gridBorder, exp(-b * 30.0));

        scale *= 2.0;
    }

    // Staggered tile flip
    float tileDelay = fract(tileSeed * 3.1415);
    float tileProg = clamp((tProg - tileDelay * 0.35) / 0.65, 0.0, 1.0);
    tileProg = smoothstep(0.0, 1.0, tileProg);

    // Tile flip 3D illusion
    float flipAngle = (1.0 - tileProg) * 3.14159265 * midTransition;
    vec2 tileUV = uv + vec2(sin(flipAngle), 0.0) * 0.02;

    vec4 c1 = texture(tex1, fract(tileUV));
    vec4 c0 = texture(tex0, fract(tileUV));

    vec4 col = mix(c1, c0, tileProg);

    // Neon grid border glow
    float borderGlow = gridBorder * midTransition * grd;
    col.rgb += borderGlow * vec3(0.1, 0.9, 1.0) * (1.2 + audioKick * 3.0);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
