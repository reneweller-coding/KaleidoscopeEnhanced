#version 330 core
out vec4 fragColor;
/**
 * @file MobiusInversionKaleidoscope.frag
 * @brief An Escher "Circle Limit"-style infinite kaleidoscope: NOT an angular mirror fold and NOT
 * escape-time iteration, but repeated CIRCLE INVERSION through a symmetric ring of n circles (the
 * classic Apollonian-gasket / Kleinian-group construction) -- a point that falls inside any circle
 * is inverted back out through it, over and over, so the picture appears infinitely nested into
 * ever-smaller tangent circles right up to their boundary. Iteration count (how many inversions a
 * pixel needed to escape) modulates brightness, giving the fractal lattice of nested circles its
 * own visible structure independent of the photo underneath.
 *   audioPhase  -> the ring of circles slowly rotates (integrated, jump-free)
 *   audioSwell  -> circle radius breathes, changing how deep the nesting reads
 *   audioBeat/audioKick -> brief flash on the boundary lattice
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioValence;
uniform float audioCentroid;
uniform float audioBeat;
uniform float audioKick;
uniform float audioOnset;
uniform float audioPhase;
uniform float audioAdvance;
uniform float audioChromaHue;
uniform float audioSwell;
uniform float audioLevel;

// Per-activation variety (re-rolled each activation; 0 = default):
uniform int   circlesP;   // ring circle count (0 -> 5; 3..7)
uniform float ringP;      // ring radius (0 -> 0.62; 0.45..0.8)
uniform float overlapP;   // circle radius as a fraction of the tangent radius (0 -> 1.08; 1.0..1.25 -- >1 = overlapping, cascades further)
uniform float glowP;
uniform float hueP;

const int N_ITER = 16;

vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    int   circlesV = (circlesP < 3) ? 5 : circlesP;
    float ringV    = (ringP    <= 0.01) ? 0.62  : ringP;
    float overlapV = (overlapP <= 0.5)  ? 1.08  : overlapP;
    float glowV    = (glowP    <= 0.01) ? 1.0   : glowP;

    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float ringR = ringV * (1.0 + 0.12 * audioSwell);
    float tangentR = ringR * sin(3.14159265 / float(circlesV));
    float circR = tangentR * overlapV;
    float ringRot = audioPhase * 0.25 + time * 0.01;

    float itersUsed = 0.0;
    for (int it = 0; it < N_ITER; ++it)
    {
        bool hit = false;
        for (int k = 0; k < 7; ++k)
        {
            if (k >= circlesV) break;
            float ang = ringRot + float(k) * 6.2831853 / float(circlesV);
            vec2  c   = ringR * vec2(cos(ang), sin(ang));
            vec2  d   = p - c;
            float len2 = dot(d, d);
            float r2  = circR * circR;
            if (len2 < r2 && len2 > 1e-8)
            {
                p = c + d * (r2 / len2);
                hit = true;
                itersUsed += 1.0;
            }
        }
        if (!hit) break;
    }

    float depth = itersUsed / float(N_ITER);

    // Sample the (now deeply nested/inverted) coordinate as image UV, folded
    // once more so the picture itself reads symmetric across the ring.
    vec2 sampleUV = fract(p * 0.5 + 0.5);
    vec3 pic = img(sampleUV);

    // Lattice structure from the inversion boundary itself (independent of
    // the photo): brighter where a pixel needed many inversions to escape,
    // i.e. right at the tangent points between circles.
    vec3 lattice = imgPalette(0.15 + depth * 0.6) * (0.3 + 1.4 * depth * depth);

    vec3 col = mix(pic * (0.5 + 0.5 * (1.0 - depth)), lattice, 0.55 + 0.3 * depth);
    col += lattice * pow(depth, 3.0) * (0.4 + 0.5 * audioBeat + 0.3 * audioKick) * glowV;

    if (hueP > 0.001) col = hueRot(col, hueP);

    col *= glowV * (1.05 + 0.3 * audioCentroid);
    col *= 1.0 + 0.35 * audioLevel;
    col += col * audioOnset * 0.12;

    vec3 _catTone = clamp(col, 0.0, 1.0) * 0.95;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
