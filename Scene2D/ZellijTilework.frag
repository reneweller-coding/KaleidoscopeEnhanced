#version 330 core
out vec4 fragColor;
/**
 * @file ZellijTilework.frag
 * @brief ZELLIJ TILEWORK: a wall of Moroccan zellij -- an eight-fold star
 * pattern of cut tiles, every tile a piece of the photo in its own glaze
 * colour.  The pattern is built from the {8/3} star lattice: stars, their
 * surrounding kites and the small squares between; the whole field
 * rotates very slowly on the scene clock and drifts, the tiles light by
 * chroma class (each colour a class), the grout darkens on the bass, the
 * kick glints the glaze.  Camera fixed on the wall.
 *
 * Audio Reactivity:
 *   sceneAdvance    -> slow rotation and drift (continuous)
 *   audioChroma[12] -> tile brightness by colour class (light)
 *   audioKick       -> glaze glint (light)
 *   audioSwell      -> courtyard light (slow)
 *   audioLevel      -> brightness
 *
 * Per-activation variety: scaleP, glazeP, hueP.
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
uniform float glazeP;
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

// Eight-fold star field: the distance to an eight-pointed star of radius R
// centred in each square cell, and the cell id.
float star8(vec2 q, float R)
{
    // Two squares rotated 45 degrees: the star is their union's boundary.
    vec2 a = abs(q);
    float sq1 = max(a.x, a.y);
    vec2 r = abs(vec2(q.x + q.y, q.x - q.y)) * 0.7071068;
    float sq2 = max(r.x, r.y);
    return min(sq1, sq2) - R;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float scale = 5.0 + 4.0 * clamp(scaleP, 0.0, 1.0);
    float gloss = 0.4 + 0.6 * clamp(glazeP, 0.0, 1.0);
    float light = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float rot = sceneAdvance * 0.02 + sceneTime * 0.004;
    vec2 q = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * p * scale + vec2(sceneAdvance * 0.03, 0.0);

    // The lattice: square cells; a star in each cell centre, kites around
    // it toward the corners, small squares at the corners.
    vec2 cell = floor(q);
    vec2 f = fract(q) - 0.5;
    float ds = star8(f, 0.32);
    float star = step(ds, 0.0);
    vec2 corner = abs(f) - 0.5;
    float small = step(max(abs(corner.x), abs(corner.y)) - 0.1, 0.0) ;
    float small2 = step(length(f) - 0.62, 0.0) * 0.0;
    float cornerSq = step(0.4, abs(f.x)) * step(0.4, abs(f.y));
    // Tile classes: star = class A, corner squares = class B, kites = class
    // by direction (four kinds).  Each tile carries a piece of the photo.
    float tileKind;
    if (star > 0.5) tileKind = 0.0;
    else if (cornerSq > 0.5) tileKind = 1.0;
    else tileKind = 2.0 + floor(mod(atan(f.y, f.x) / 1.5708 + 4.0, 4.0));
    int cls = int(mod(tileKind * 2.0 + cell.x + cell.y * 3.0, 12.0));
    float e = clamp(audioChroma[cls] * 1.5, 0.0, 1.0);
    // Glaze colours: the traditional set, tinted by the palette.
    vec3 glaze;
    if (tileKind < 0.5) glaze = vec3(0.1, 0.3, 0.55);
    else if (tileKind < 1.5) glaze = vec3(0.85, 0.75, 0.55);
    else if (tileKind < 2.5) glaze = vec3(0.15, 0.45, 0.35);
    else if (tileKind < 3.5) glaze = vec3(0.65, 0.2, 0.15);
    else if (tileKind < 4.5) glaze = vec3(0.9, 0.85, 0.6);
    else glaze = vec3(0.2, 0.2, 0.25);
    glaze = mix(glaze, imgPalette(hue * 0.159 + float(cls) / 12.0), 0.3);
    vec3 piece = img(fract((cell + 0.5) * 0.09 + f * 0.12));
    vec3 tile = mix(glaze, glaze * (0.6 + 0.8 * dot(piece, vec3(0.333))), 0.5) * (0.6 + 0.7 * e) * light;
    // Grout: the edges between tiles -- the star boundary, the corner
    // square boundary and the kite diagonals; darker with the bass.
    float edge = smoothstep(0.03, 0.01, abs(ds));
    edge = max(edge, smoothstep(0.03, 0.01, abs(max(abs(corner.x), abs(corner.y)) - 0.1)) * (1.0 - star));
    float diag = min(smoothstep(0.02, 0.005, abs(abs(f.x) - abs(f.y))), 1.0) * (1.0 - star) * (1.0 - cornerSq);
    edge = max(edge, diag);
    vec3 grout = vec3(0.55, 0.5, 0.42) * (0.7 - 0.3 * clamp(audioChroma[0] * 0.0, 0.0, 1.0)) * light;
    vec3 col = mix(tile, grout, edge * 0.9);
    // Glaze gloss: a highlight per tile on the kick, sparkling.
    float glint = pow(max(1.0 - length(f - vec2(-0.12, 0.12)) * 2.5, 0.0), 3.0) * (1.0 - edge);
    col += vec3(1.0, 0.97, 0.9) * glint * gloss * (0.15 + 0.7 * audioKick) * light;
    // Courtyard light falling from the top.
    col *= 0.8 + 0.3 * smoothstep(-0.5, 0.5, p.y);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
