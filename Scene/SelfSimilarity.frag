// SelfSimilarity.frag
// -----------------------------------------------------------------------
// The SONG'S STRUCTURE as the image: the host maintains a self-similarity
// matrix (SSM recurrence plot) over ~90 s of feature history (chroma +
// spectral shape, "texSSM" unit 10) — the classic MIR structure view.
// A returning chorus paints bright DIAGONAL STRIPES, a new section cuts a
// dark CHECKERBOARD edge, a repeating loop becomes a fine grid.  Rendered
// here as a living ornament:
//   * the ring is unwrapped with ssmHead so "now" always sits at the top-
//     right corner and history flows away along the diagonal;
//   * bright similarity cells are stained with a drifting crop of the
//     IMAGE, dark cells stay near-black — the picture lives INSIDE the
//     song's structure;
//   * an optional kaleido fold turns the matrix into a radial mandala
//     whose spokes ARE the piece's repetitions;
//   * the main diagonal ("now vs now") carries a beat-pulsing light.
// Before ~90 s of history the unfilled region reads as calm darkness and
// the picture grows with the song — intentional dramaturgy, not a bug.
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D texSSM;      // 256x256 similarity bytes (ring in both axes)
uniform float interpolation;

uniform float ssmHead;         // ring head as 0..1 texture coordinate
uniform float ssmFill;         // 0..1 how much history exists yet
uniform float audioBeat;
uniform float audioOnset;
uniform float audioPhase;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioDrop;
uniform float audioLevel;

// Per-activation variety:
uniform int   sidesP;          // kaleido fold (0/1 off; 2..8)
uniform float zoomP;           // matrix zoom (0 -> 1.0; 0.7..1.6)

const float PI = 3.14159265358979;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }
vec3 imgPal(float x)
{
    vec2 cc = vec2(0.5) + 0.30 * vec2(cos(time * 0.041 + audioPhase * 0.10),
                                      sin(time * 0.029 + audioPhase * 0.08));
    return img(fract(cc + 0.22 * vec2(cos(x), sin(x * 1.37))));
}
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
vec2 kaleido(vec2 p, float sides)
{
    float a   = atan(p.y, p.x);
    float r   = length(p);
    float seg = PI / sides;
    a = mod(a + PI, 2.0 * seg) - seg;
    a = abs(a);
    return vec2(cos(a), sin(a)) * r;
}

// Sample the matrix in HISTORY coordinates: h = 0 is the oldest stored
// moment, h = 1 is now.  The ring texture repeats, so head-unwrapping is a
// simple add (wrap mode GL_REPEAT does the mod).
float ssm(vec2 h)
{
    return texture2D(texSSM, h + vec2(ssmHead)).r;
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;
    float zoomV = (zoomP <= 0.01) ? 1.0 : zoomP;

    // Matrix coordinates: either the flat scrolling plot or a kaleido fold.
    vec2 h;
    if (sidesP >= 2)
    {
        vec2 cp = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
        cp = rot(time * 0.012 + audioPhase * 0.04) * cp;
        h = kaleido(cp, float(sidesP)) * 0.75 * zoomV;
    }
    else
    {
        h = (uv - 0.5) * zoomV + 0.5;
    }

    // s: similarity of moment h.x with moment h.y.
    float s = ssm(h);

    // Multi-scale accent: a coarser sample adds the big section blocks on
    // top of the fine repetition stripes.
    float sBig = ssm(floor(h * 32.0) / 32.0 + 1.0 / 64.0);
    float v = s * 0.75 + sBig * 0.45;

    // Diagonal "now" beam: cells comparing a moment with itself.
    float dDiag = abs(fract(h.x - h.y + 0.5) - 0.5);   // 0 on the diagonal
    float diag  = exp(-dDiag * 70.0) * (0.35 + 0.8 * audioBeat);

    // Stain the structure with the image; keep dissimilar cells near-black.
    vec3 stain = imgPal(v * 4.0 + h.x * 2.0) * 1.5;
    stain = hueRot(stain, audioChromaHue * 0.6);
    vec3 col = stain * pow(v, 1.35) * (0.85 + 0.5 * audioSwell);

    // Bright stripe cores glow, but stay below burn-out so uniformly
    // self-similar passages (loops) keep their fine grid readable.
    col += vec3(0.9, 0.95, 1.0) * pow(v, 4.0) * 0.30;

    // The now-beam and a soft vignette of the raw image below everything.
    col += hueRot(vec3(1.0, 0.75, 0.35), audioChromaHue) * diag;
    col += img(uv) * 0.10;

    col *= 1.0 + 0.15 * audioOnset + 0.9 * audioDrop;
    col *= 0.9 + 0.3 * audioLevel;

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
