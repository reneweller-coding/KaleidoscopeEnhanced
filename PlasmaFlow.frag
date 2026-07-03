// PlasmaFlow.frag
// -----------------------------------------------------------------------
// The source image MARBLED and refracted by a flowing plasma field, folded
// into mirror symmetry so it reads like liquid stained glass.  The plasma is
// no longer the picture (it used to be a full-screen sine field with the image
// as a 40% tint) - instead the plasma is a FLOW that warps the actual picture,
// and its iridescence tints the folded image.  So the *image* is the star.
//   audioArousal -> plasma scale / busyness
//   audioValence -> mirror fold count + iridescence saturation
//   audioPhase   -> smooth flow (jump-free); audioLevel -> warp strength
//   audioPitch/Centroid -> hue drift; audioBeat/Flux -> sheen & brightness
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
uniform float audioArousal;
uniform float audioValence;
uniform float audioPhase;

const float PI = 3.14159265358979;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }

vec3 hsv2rgb(vec3 c)
{
    vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
    return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
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

    p = rot(audioPhase * 0.2 + time * 0.02) * p;

    // Mirror symmetry (2..8 fold), so the marbled picture radiates.
    float sides = floor(2.0 + 6.0 * audioValence);
    vec2  fp    = kaleido(p, sides);

    float t     = time * 0.2 + audioPhase * 0.5;
    float scale = 4.0 + 6.0 * audioArousal;
    vec2  q     = fp * scale;

    // Plasma value.
    float v = sin(q.x + t);
    v += sin(q.y * 1.3 + t * 1.1);
    v += sin((q.x + q.y) * 0.7 + t * 0.8);
    float cx = q.x + 2.0 * sin(t * 0.3);
    float cy = q.y + 2.0 * cos(t * 0.4);
    v += sin(sqrt(cx * cx + cy * cy) * 1.2 + t * 1.5);
    v *= 0.25;   // ~[-1, 1]

    // Plasma FLOW warps the folded picture (marbling).
    vec2 flow = vec2(sin(q.y * 1.3 + t * 1.1), cos(q.x + t));
    vec2 iuv  = fp * 0.6 + 0.5 + flow * v * (0.06 + 0.10 * audioLevel);
    vec3 pic  = img(fract(iuv));

    // Iridescent plasma sheen tints the picture.
    float hue   = fract(0.5 + 0.5 * v + 0.15 * audioPitch + 0.10 * audioCentroid);
    vec3  sheen = hsv2rgb(vec3(hue, 0.45 + 0.55 * audioValence, 1.0));

    vec3 col = pic * (0.6 + 0.7 * audioLevel);
    col = mix(col, col * sheen * 1.7, 0.5);           // marble the image
    col += sheen * (0.10 + 0.20 * audioBeat);         // beat sheen
    col *= (1.0 + 0.2 * audioFlux);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
