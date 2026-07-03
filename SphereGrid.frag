// SphereGrid.frag
// -----------------------------------------------------------------------
// Adapted from an untitled @kishimisu raymarch (CC BY-NC-SA 4.0): a fly-through
// of an infinite lattice of spheres down a bright corridor.
//
// Adapted to our engine, and COLOURED BY THE IMAGE: instead of a fixed cosine
// palette, each depth takes its colour from a slowly-drifting crop of the source
// picture (imgPal), so the palette is the image itself and keeps changing (like
// the kaleidoscope folding different crops).  Audio-reactive & jump-free
// (forward travel via audioAdvance; beats brighten; centroid/valence grade).
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioAdvance;
uniform float audioPhase;
uniform float audioBeat;
uniform float audioOnset;
uniform float audioLevel;
uniform float audioCentroid;
uniform float audioValence;

vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }

// Colour from a slowly-drifting crop of the picture, indexed by a scalar so the
// palette varies with depth and the crop window moves over time + with the
// harmony (audioPhase) — the effect is coloured by the ever-changing image.
vec3 imgPal(float x)
{
    vec2 cc  = vec2(0.5) + 0.32 * vec2(cos(time * 0.045 + audioPhase * 0.12),
                                       sin(time * 0.033 + audioPhase * 0.09));
    vec2 iuv = cc + 0.24 * vec2(cos(x), sin(x * 1.31));
    return img(fract(iuv));
}

void main()
{
    vec2  n    = resolution;
    float s    = time * 0.34 - 1.0;
    float sAdv = s + audioAdvance * 2.0;                 // forward scroll (jump-free)

    float fov = mix(1.0, 2.0, sin(s + 3.14159) * 0.5 + 0.5);
    vec3  t   = normalize(vec3((2.0 * gl_FragCoord.xy - n) / n.y * fov, 1.0));
    vec3  r   = vec3(0.0), a;
    float d = 0.0, l = 1.0;
    for (int i = 0; i < 200; i++)
    {
        if (!(d < 150.0 && l > 0.001)) break;
        a = r + d * t;
        a.z += sAdv;
        d += l = length(mod(a + 2.0, 4.0) - 2.0) - step(1.0, abs(a.y)) + 0.001;
    }

    float fov2 = mix(1.0, 2.3, sin(s) * 0.5 + 0.5);
    vec3  base = cos(fov2 * vec3(1.02, 1.04, 1.06) * d + s) * 0.5 + 0.5;
    base *= 0.35 + 1.4 * imgPal(d * 0.15);               // image crop drives colour
    vec3  col = mix(base, vec3(1.0), clamp(d * 0.008, 0.0, 1.0));   // fog to white

    col *= 1.0 + 0.4 * audioBeat + 0.3 * audioOnset;
    col *= mix(vec3(0.75, 0.85, 1.20), vec3(1.25, 1.05, 0.75), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.6 * audioValence);

    gl_FragColor = vec4(col, 1.0);
}
