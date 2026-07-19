// MobiusOrbs.frag
// -----------------------------------------------------------------------
// Adapted from an untitled Shadertoy Möbius-inversion orb field (pasted by the
// user; exact page/author not given).  A ring of glowing orbs seen through a
// Möbius (1/r^2) inversion, swirling into a hypnotic kaleidoscopic knot.
//
// Adapted to our engine: GLSL 1.20 (gl_FragCoord/resolution/time), jump-free
// audio motion (host-integrated audioAdvance added to time, never time*audio),
// beat/onset brightness, mood grade, and IMAGE-DRIVEN colour: a drifting crop
// of the source picture (imgPal) rotates the palette's hue (hueRot) so the orb
// colours come from the ever-changing image.  Only "Variant 01" of the
// original's three #define presets is used (the other two were commented out
// in the source and would just swap the numeric constants below).
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
uniform float audioBass;
uniform float audioCentroid;
uniform float audioValence;

// Per-activation variety (re-rolled by the engine each time the effect comes
// on): the original's three #define "variants" differed mainly in these very
// numbers, so rolling them turns one shader into a whole family of looks.
// All default to the "Variant 01" values when 0 / absent from the config.
uniform float zoomP;      // 0 -> 0.07   (0.27 = original "Variant 02" look)
uniform float orbSizeP;   // 0 -> 6.46
uniform float radiusP;    // 0 -> 11.0
uniform float stretchP;   // 0 -> 1.2    max extra ellipse aspect (length variance)
uniform float shapeP;     // 0 -> 0.6    circle -> superellipse shape variance

const float PI   = 3.141592;
const float ORBS = 20.0;

const float CONTRAST   = 0.13;
const float COLORSHIFT = 10.32;
const float COS_MUL    = 2.38;
const float X_MUL      = 0.28;
const float Y_DIVIDE   = 4.99;
const float X_DIVIDE   = 6.27;

vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }

vec3 imgPal(float x)
{
    vec2 cc = vec2(0.5) + 0.32 * vec2(cos(time * 0.045 + audioPhase * 0.12),
                                      sin(time * 0.033 + audioPhase * 0.09));
    return img(fract(cc + 0.24 * vec2(cos(x), sin(x * 1.31))));
}

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

mat2 rotate(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

// One glowing blob.  No longer a plain circle: each orb is an ELLIPSE with its
// own orientation (golden-angle spread over the index) whose aspect drifts
// slowly and stretches with the bass (loudness -> size/elongation, per the
// crossmodal-correspondence research), and a per-orb SHAPE that blends from
// round toward a soft superellipse (squarish) - so the field is a mixture of
// long streaks, plump ovals and rounded lozenges instead of uniform circles.
vec4 orb(vec2 uv, float s, vec2 p, vec3 color, float c, float i,
         float stretchAmt, float shapeAmt)
{
    vec2 d = uv + p;

    // Per-orb orientation, drifting on jump-free clocks only.
    float oa = i * 2.399963 + time * 0.03 + audioPhase * 0.05;
    d = rotate(oa) * d;

    // Length variance: per-orb aspect, breathing slowly, pumped by the bass.
    float asp = 1.0 + stretchAmt * (0.5 + 0.5 * sin(i * 1.7 + time * 0.11))
                    * (1.0 + 0.30 * audioBass);
    d.x /= asp;

    // Shape variance: exponent 2 = circle, higher = soft superellipse.
    float k = 2.0 + shapeAmt * (0.5 + 0.5 * sin(i * 2.3 - time * 0.07)) * 2.0;
    float dist = pow(pow(abs(d.x), k) + pow(abs(d.y), k), 1.0 / k);

    return pow(vec4(s / max(dist, 1e-4) * color, 1.0), vec4(c));
}

void main()
{
    vec2  fragCoord = gl_FragCoord.xy;
    float tt = time + audioAdvance * 2.0;    // jump-free (host-integrated) clock

    // Per-activation parameters (0 / absent -> "Variant 01" defaults).
    float zoomV    = (zoomP    <= 0.001) ? 0.07 : zoomP;
    float orbSize  = (orbSizeP <= 0.001) ? 6.46 : orbSizeP;
    float radiusV  = (radiusP  <= 0.001) ? 11.0 : radiusP;
    float stretchV = (stretchP <= 0.001) ? 1.2  : stretchP;
    float shapeV   = (shapeP   <= 0.001) ? 0.6  : shapeP;

    vec2 uv = (2.0 * fragCoord - resolution) / resolution.y;
    vec4 fragColor = vec4(0.0);
    uv *= zoomV;
    uv /= max(dot(uv, uv), 1e-6);             // Mobius inversion (guarded)
    uv  = uv * rotate(tt / 10.0 + audioPhase * 0.05);

    for (float i = 0.0; i < ORBS; i += 1.0)
    {
        uv.x += cos(uv.y / Y_DIVIDE - tt);
        uv.y += COS_MUL * cos(uv.x * X_MUL) - sin(uv.x / X_DIVIDE - tt);
        float t = i * PI / ORBS * 2.0;
        float x = radiusV * tan(t);
        float y = radiusV * cos(t + tt / 10.0);
        vec2  position = vec2(x, y);
        vec3  color = cos(0.02 * uv.x + 0.02 * uv.y * vec3(-2.0, 0.0, -1.0) * PI * 2.0 / 3.0
                          + PI * (i / COLORSHIFT)) * 0.5 + 0.5;
        fragColor += 0.65 - orb(uv, orbSize, position, 1.0 - color, CONTRAST,
                                i, stretchV, shapeV);
    }

    vec3 col = max(fragColor.rgb, 0.0);
    col *= 1.0 + 0.5 * audioBeat + 0.3 * audioOnset;

    // Mood grade.
    col *= mix(vec3(0.75, 0.85, 1.20), vec3(1.25, 1.05, 0.75), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.6 * audioValence);

    // Image-driven colour: a drifting crop of the picture rotates the hue.
    float himg = dot(imgPal(dot(col, vec3(0.333)) * 6.0
                 + length(fragCoord / resolution - 0.5) * 4.0), vec3(0.333));
    col = hueRot(col, (himg - 0.5) * 3.0 + time * 0.05);

    col *= 0.9 + 0.5 * audioLevel;

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
