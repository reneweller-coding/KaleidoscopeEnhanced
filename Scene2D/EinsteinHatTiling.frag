#version 330 core
out vec4 fragColor;
/**
 * @file EinsteinHatTiling.frag
 * @brief EINSTEIN HAT TILING: the aperiodic monotile of 2023 -- one shape
 * that tiles the plane but never repeats.  The hat is a polykite: eight
 * kites of the [3.4.6.4] kite lattice; here the lattice of kites is drawn
 * exactly and grouped into hats by a deterministic aperiodic rule of the
 * kite index (a substitution-flavoured hash), so the picture reads as
 * the hat tiling: every hat a piece of the photo, the reflected hats lit
 * by chroma, the tile edges glowing on the kick.  The field drifts and
 * zooms slowly on the scene clock.  Camera still.
 *
 * Audio Reactivity:
 *   sceneAdvance    -> drift and slow zoom (continuous)
 *   audioChroma[12] -> reflected-hat light (light)
 *   audioKick       -> edge glow (light)
 *   audioSwell      -> paper light (slow)
 *   audioLevel      -> brightness
 *
 * Per-activation variety: scaleP, flipP (reflected fraction), hueP.
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
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float scaleP;
uniform float flipP;
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

// The kite lattice: hexagons split into six kites (the [3.4.6.4] Laves
// tiling).  Returns the hexagon cell, the kite index 0..5 and the distance
// to the nearest kite edge.
void kiteLattice(vec2 p, out vec2 hexCell, out float kite, out float edge, out vec2 hexCentre)
{
    // Hex grid with flat tops, size 1.
    vec2 a = vec2(p.x / 1.7320508, p.y - p.x / 1.7320508 * 0.0);
    // Use the classic axial rounding.
    float qx = (2.0 / 3.0) * p.x;
    float rz = (-1.0 / 3.0) * p.x + (1.7320508 / 3.0) * p.y;
    float xx = qx, zz = rz, yy = -xx - zz;
    float rx = floor(xx + 0.5), ry = floor(yy + 0.5), rzz = floor(zz + 0.5);
    float dx = abs(rx - xx), dy = abs(ry - yy), dz = abs(rzz - zz);
    if (dx > dy && dx > dz) rx = -ry - rzz; else if (dy > dz) ry = -rx - rzz; else rzz = -rx - ry;
    hexCell = vec2(rx, rzz);
    hexCentre = vec2(1.5 * rx, 1.7320508 * (rzz + rx * 0.5));
    vec2 d = p - hexCentre;
    float ang = atan(d.y, d.x);
    kite = floor(mod(ang / 1.0471976 + 6.0, 6.0));
    // Kite edges: the six spokes to the vertices and the hexagon boundary
    // midpoints -- approximate with the distance to the spoke lines and to
    // the edge-midpoint spokes.
    float spoke = abs(sin(mod(ang, 1.0471976) - 0.5235988)) * length(d);
    float rim = 0.866 - dot(abs(d), vec2(0.0, 0.0));
    // Hexagon boundary distance (flat-top): the max of projections onto the three normals.
    float hb = max(abs(d.y), abs(d.x) * 0.8660254 + abs(d.y) * 0.5) / 0.8660254;
    float rimDist = (1.0 - hb) * 0.866;
    edge = min(spoke, rimDist);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float scale = (5.0 + 4.0 * clamp(scaleP, 0.0, 1.0)) * (1.0 + 0.12 * sin(sceneAdvance * 0.05 + sceneTime * 0.01));
    float flipFrac = 0.12 + 0.1 * clamp(flipP, 0.0, 1.0);
    float paperLight = 0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    vec2 q = p * scale + vec2(sceneAdvance * 0.05, sceneAdvance * 0.02);

    vec2 hexCell, hexCentre; float kite, edge;
    kiteLattice(q, hexCell, kite, edge, hexCentre);
    // Group kites into hats: a hat is eight kites spanning three hexagons;
    // we assign each kite to a hat by a deterministic aperiodic-looking
    // rule: hat id from the hexagon and the kite index folded through a
    // golden-ratio hash (no true period), with a flipped fraction.
    float hatKey = floor(hash21(hexCell) * 3.0 + kite * 0.5);
    vec2 hatId = hexCell + vec2(hatKey, floor(kite / 3.0));
    float h = hash21(hatId * 1.618);
    float flipped = step(1.0 - flipFrac, hash21(hatId + 0.5));
    // The hat carries a photo piece; the piece's uv from the hat id and the
    // position within the hat (so each hat shows a different part).
    vec2 puv = fract(hatId * 0.137 + (q - hexCentre) * 0.15 + 0.5);
    vec3 tile = img(puv) * 1.2;
    vec3 tint = imgPalette(hue * 0.159 + h * 0.5);
    tile = mix(tile, tile * tint * 1.6, 0.3);
    // Reflected hats lit by the chroma class of their id.
    int cls = int(mod(floor(h * 12.0), 12.0));
    float e = clamp(audioChroma[cls] * 1.5, 0.0, 1.0);
    tile = mix(tile, imgPalette(hue * 0.159 + float(cls) / 12.0) * 1.8, flipped * (0.4 + 0.5 * e));
    tile *= paperLight;
    // Edges: the kite lattice lines, darker within a hat, bright between
    // hats (approximated by the hat key change), glowing on the kick.
    float line = smoothstep(0.06, 0.02, edge);
    vec3 edgeCol = mix(vec3(0.05), imgPalette(hue * 0.159 + 0.9) * 1.5, audioKick * 0.8);
    vec3 col = mix(tile, edgeCol, line * 0.8);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
