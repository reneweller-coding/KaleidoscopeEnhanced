// Fluid.frag
// -----------------------------------------------------------------------
// Displays the GPU fluid field (FluidSim.frag, bound as texFluid on unit 8):
// the source image as INK swirling through an incompressible curl-noise flow.
// The field can be folded into an n-segment kaleidoscopic mandala per
// activation, gets a gentle sharpen so the ink filaments stay crisp at
// screen resolution, and the usual audio grades: beats brighten, the swell
// looms, centroid/valence set the mood, the bar phase sweeps the hue.
// If the simulation is unavailable, texFluid reads 0 -> falls back to the
// plain (dimmed) image so the effect never shows black.
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D texFluid;   // dye state from FluidSim.frag
uniform float interpolation;

uniform float audioPhase;
uniform float audioBeat;
uniform float audioOnset;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioBarPhase;
uniform float audioCentroid;
uniform float audioValence;

// Per-activation variety (re-rolled each activation; 0 = default):
uniform int   sidesP;         // kaleido fold of the fluid (0/1 -> off; 2..8)
uniform float zoomP;          // field zoom (0 -> 1.0; 0.7..1.5)

const float PI = 3.14159265358979;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }

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

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution;

    float zoomV = (zoomP <= 0.01) ? 1.0 : zoomP;
    // The slow swell looms the whole field gently (loudness -> approach).
    zoomV /= (1.0 + 0.06 * audioSwell);

    // Field coordinate: plain (drifting) or kaleidoscopically folded.
    vec2 suv;
    if (sidesP >= 2)
    {
        vec2 cp = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
        cp = rot(time * 0.012 + audioPhase * 0.05) * cp;
        suv = kaleido(cp, float(sidesP)) * 0.8 * zoomV + 0.5;
    }
    else
    {
        suv = (uv - 0.5) * zoomV + 0.5
            + 0.01 * vec2(sin(audioPhase * 0.20), cos(audioPhase * 0.16));
    }

    vec3 dye = texture2D(texFluid, suv).rgb;

    // Gentle unsharp mask keeps the ink filaments crisp at screen res.
    vec2 px = 2.0 / resolution;
    vec3 blur = ( texture2D(texFluid, suv + vec2(px.x, 0.0)).rgb
                + texture2D(texFluid, suv - vec2(px.x, 0.0)).rgb
                + texture2D(texFluid, suv + vec2(0.0, px.y)).rgb
                + texture2D(texFluid, suv - vec2(0.0, px.y)).rgb ) * 0.25;
    dye += (dye - blur) * 1.2;

    // Fallback: if the sim is dark/unavailable, the image shows through dimly.
    vec3 base = img(uv) * 0.25;
    vec3 col  = max(dye * 1.35, base);

    col *= 1.0 + 0.35 * audioBeat + 0.20 * audioOnset;

    // Mood grade + per-bar hue sweep (continuous at the wrap).
    col *= mix(vec3(0.78, 0.88, 1.15), vec3(1.22, 1.02, 0.78), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.6 * audioValence);
    col = hueRot(col, 0.30 * sin(audioBarPhase * 2.0 * PI));

    col *= 0.95 + 0.40 * audioLevel;
    col *= 1.0 - 0.20 * dot(uv - 0.5, uv - 0.5) * 4.0;   // soft vignette

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
