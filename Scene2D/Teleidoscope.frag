#version 330 core
out vec4 fragColor;
/**
 * @file Teleidoscope.frag
 * @brief TELEIDOSCOPE: the three-mirror kaleidoscope with a lens at the
 * end -- the world (the photo) reflected in an equilateral-triangle mirror
 * tube, so the plane tiles with mirrored triangles.  The mirrors slide on
 * the swell (the triangle grows and shrinks, slowly), the object cell turns
 * steadily on the scene clock, and the lens ball at the end bulges the
 * image.  The kick lights the mirror seams.  Camera still.
 *
 * Audio Reactivity:
 *   sceneAdvance -> rotation of the object cell (continuous)
 *   audioSwell   -> mirror spacing (slow)
 *   audioKick    -> seam highlights (light)
 *   audioHigh    -> glass sparkle (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: sizeP, lensP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float sizeP;
uniform float lensP;
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

// Fold the plane into the equilateral triangle of side `s` (the p3m1
// reflection group): reflect across the three mirror lines repeatedly.
// Returns the folded point and the distance to the nearest mirror.
vec2 foldTri(vec2 p, float s, out float seam)
{
    float h = s * 0.8660254;
    // Lattice of triangles: reduce to the fundamental rhombus first.
    vec2 e1 = vec2(s, 0.0), e2 = vec2(s * 0.5, h);
    // Coordinates in the rhombic lattice.
    float b = p.y / h;
    float a = (p.x - b * s * 0.5) / s;
    vec2 cell = floor(vec2(a, b));
    vec2 f = fract(vec2(a, b));
    // Upper or lower triangle of the rhombus; mirror the upper into the lower.
    bool upper = (f.x + f.y) > 1.0;
    if (upper) f = 1.0 - f;
    // Position within the lower triangle, in plane coordinates.
    vec2 q = f.x * e1 + f.y * e2;
    // Fold the triangle with its own three mirrors (its medians' halves)
    // so every point maps into one sixth: reflect until inside the kite.
    vec2 c = (e1 + e2) / 3.0;                 // centroid
    vec2 d = q - c;
    for (int i = 0; i < 3; ++i)
    {
        float ang = float(i) * 2.0943951;
        vec2 n = vec2(cos(ang), sin(ang));
        float t = dot(d, n);
        if (t < 0.0) d -= 2.0 * t * n;
    }
    // Seam: distance to the triangle edges (mirror lines).
    float d0 = f.y * h;
    float d1 = f.x * h;
    float d2 = (1.0 - f.x - f.y) * h;
    seam = min(d0, min(d1, d2));
    return c + d;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float baseS = 0.45 + 0.35 * clamp(sizeP, 0.0, 1.0);
    float lens = 0.2 + 0.6 * clamp(lensP, 0.0, 1.0);
    // The lens ball at the end: a bulge toward the edges (barrel).
    float r = length(p);
    vec2 pl = p * (1.0 + lens * r * r * 0.6);
    // Mirror spacing slides on the swell (slow); the object cell turns.
    float s = baseS * (0.85 + 0.3 * clamp(audioSwell, 0.0, 1.0));
    float seam;
    vec2 q = foldTri(pl, s, seam);
    float rot = sceneAdvance * 0.15 + sceneTime * 0.03;
    vec2 obj = q / s;                              // 0..1-ish in the cell
    float c2 = cos(rot), s2 = sin(rot);
    vec2 ouv = mat2(c2, -s2, s2, c2) * (obj - 0.5) * 0.8 + 0.5 + vec2(sceneAdvance * 0.01, 0.0);
    vec3 col = img(fract(ouv)) * 1.6 + 0.06;
    // Tint per reflection depth is what a real teleidoscope does with its
    // slightly absorbing mirrors: darken with distance from the centre.
    col *= 0.7 + 0.3 * exp(-r * 1.2);
    col = mix(col, col * imgPalette(hue * 0.159 + 0.5) * 1.6, 0.25) + imgPalette(hue * 0.159 + 0.5) * 0.12;
    // Seams: the mirror edges as thin bright lines, lit on the kick.
    float sm = smoothstep(0.006, 0.0, seam);
    col += imgPalette(hue * 0.159 + 0.9) * sm * (0.15 + 0.7 * audioKick);
    // Glass sparkle: round glints on the lens, brighter with the treble.
    vec2 gu = p * 40.0; vec2 cell = floor(gu); vec2 f = fract(gu) - 0.5;
    vec2 off = vec2(fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453), fract(sin(dot(cell, vec2(269.5, 183.3))) * 43758.5453)) - 0.5;
    float glint = smoothstep(0.12, 0.02, length(f - off * 0.6)) * step(0.985, fract(sin(dot(cell, vec2(419.2, 371.9))) * 43758.5453));
    col += vec3(1.0) * glint * (0.1 + 0.6 * clamp(audioHigh * 2.0, 0.0, 1.0));
    // The tube rim: a dark vignette circle.
    col *= 1.0 - smoothstep(0.62, 0.72, r) * 0.85;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
