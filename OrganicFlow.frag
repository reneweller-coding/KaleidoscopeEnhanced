// OrganicFlow.frag
// -----------------------------------------------------------------------
// The source image pushed through an organic, reaction-diffusion-like FLOW:
// a domain-warped fbm displaces and marbles the folded picture while glowing
// veins trace the cell boundaries, all mirror-symmetric so it reads like
// living stained glass.  The *image* is the star (was a 40% tint on procedural
// colour).
//   audioBass      -> vein scale / thickness
//   audioStereo    -> horizontal stretch (wide stereo = wider cells)
//   audioDeltaPitch-> extra churn on melodic movement
//   audioValence/Centroid -> vein palette & fold count
//   audioPhase     -> smooth flow (jump-free); audioBeat -> vein flash
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioBass;
uniform float audioLevel;
uniform float audioBeat;
uniform float audioFlux;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioStereo;
uniform float audioPhase;
uniform float audioDeltaPitch;

const float PI = 3.14159265358979;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }

float hash21(vec2 p)
{
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}
float vnoise(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p)
{
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return s;
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
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p  = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;

    p = rot(audioPhase * 0.15 + time * 0.02) * p;
    p.x *= 1.0 + audioStereo * 0.5;                  // stereo stretch

    float sides = floor(2.0 + 5.0 * audioCentroid);
    vec2  fp    = kaleido(p, sides);

    float t  = time * 0.08 + audioPhase * 0.2;
    vec2  q  = vec2(fbm(fp * 2.0 + vec2(0.0, t)), fbm(fp * 2.0 + vec2(5.2, t * 1.1)));
    vec2  rr = vec2(fbm(fp * 2.0 + 3.0 * q + vec2(1.7, 9.2) + t * 0.5),
                    fbm(fp * 2.0 + 3.0 * q + vec2(8.3, 2.8) - t * 0.5));
    float v  = fbm(fp * 2.5 + 4.0 * rr);

    // The flow field warps and marbles the folded picture.
    vec2 iuv = fp * 0.6 + 0.5 + (rr - 0.5) * (0.10 + 0.12 * audioLevel);
    vec3 pic = img(fract(iuv));

    // Glowing veins along the cell boundaries.
    float scale = 6.0 + 10.0 * audioBass + 4.0 * audioDeltaPitch;
    float band  = sin(v * scale + t * 2.0);
    float vein  = 1.0 - smoothstep(0.0, 0.18, abs(band));

    vec3 veinCol = mix(vec3(0.20, 0.80, 0.70), vec3(1.0, 0.60, 0.20), audioValence);

    vec3 col = pic * (0.5 + 0.8 * audioLevel);
    col = mix(col, veinCol * (0.8 + 1.6 * audioBeat), vein * 0.6);
    col += vein * audioBeat * 0.3 * veinCol;
    col *= (1.0 + 0.2 * audioFlux);
    col *= 1.0 - 0.25 * dot(p, p);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
