// VoronoiPulse.frag
// -----------------------------------------------------------------------
// The source image SHATTERED into a kaleidoscopic stained-glass mosaic.  The
// picture is first folded into n-fold mirror symmetry (like the kaleidoscope),
// then broken into drifting Voronoi shards; each shard acts as a little glass
// LENS that bulges the image, and the seams between shards glow and flare on
// the beat like backlit leading.  So the *image* is the star (not a faint
// tint), and it carries the same radiating symmetry as the star shaders.
//   audioCentroid -> symmetry fold count (brighter = more mirrors)
//   audioPitch    -> shard density (higher pitch = more, smaller shards)
//   audioBeat     -> seam flare + shard "pop" / lens bulge (slew-limited)
//   audioFlux     -> shard drift; audioPhase -> smooth rotation of the mosaic
//   audioValence  -> seam colour (cool blue .. warm orange)
//   audioLevel    -> overall brightness
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioBeat;
uniform float audioLevel;
uniform float audioCentroid;
uniform float audioFlux;
uniform float audioPitch;
uniform float audioValence;
uniform float audioPhase;

const float PI = 3.14159265358979;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }

vec2 hash22(vec2 p)
{
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
}

// n-fold kaleidoscopic fold of a centred coordinate (mirror wedges).
vec2 kaleido(vec2 p, float sides)
{
    float a   = atan(p.y, p.x);
    float r   = length(p);
    float seg = PI / sides;
    a = mod(a + PI, 2.0 * seg) - seg;   // into one wedge
    a = abs(a);                          // mirror the wedge
    return vec2(cos(a), sin(a)) * r;
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p  = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;

    // Whole mosaic rotates slowly (jump-free) and gives a small beat "breath".
    p = rot(audioPhase * 0.25 + time * 0.02) * p;
    p *= 1.0 - 0.05 * audioBeat;

    // Kaleidoscopic symmetry: 3..8 mirror wedges, stepping with brightness.
    float sides = floor(3.0 + 5.0 * audioCentroid);
    vec2  fp    = kaleido(p, sides);

    // Voronoi shards on the folded plane; pitch sets density.
    float scale = 3.0 + 7.0 * audioPitch;
    vec2  g  = fp * scale;
    vec2  gi = floor(g);
    vec2  gf = fract(g);

    float d1 = 8.0, d2 = 8.0;
    vec2  rel = vec2(0.0);
    for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++)
    {
        vec2  o   = vec2(float(x), float(y));
        vec2  rnd = hash22(gi + o);
        vec2  c   = o + 0.5 + 0.4 * sin(time * (0.3 + 0.7 * audioFlux)
                                        + 6.2831 * rnd + audioPhase);
        vec2  diff = c - gf;
        float dd   = length(diff);
        if (dd < d1) { d2 = d1; d1 = dd; rel = diff; }
        else if (dd < d2) { d2 = dd; }
    }

    float seam = 1.0 - smoothstep(0.0, 0.06, d2 - d1);   // 1 on the seam

    // The picture, folded kaleidoscopically, refracted by each shard's lens:
    // pull the image toward the shard centre so every cell bulges like glass.
    vec2 baseUV = fp * 0.6 + 0.5;
    vec2 iuv    = baseUV + rel * (0.20 + 0.30 * audioBeat);
    vec3 pic    = img(fract(iuv));

    vec3 col = pic * (0.5 + 0.9 * audioLevel) * (1.0 + 0.4 * audioBeat);

    // Backlit seams: warm/cool by valence, flaring hard on the beat.
    vec3 seamCol = mix(vec3(0.25, 0.55, 1.0), vec3(1.0, 0.55, 0.2), audioValence);
    col = mix(col, seamCol * (0.6 + 2.2 * audioBeat + 0.4 * audioCentroid),
              seam * (0.45 + 0.55 * audioBeat));

    // Jewel vignette.
    col *= 1.0 - 0.30 * dot(p, p);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
