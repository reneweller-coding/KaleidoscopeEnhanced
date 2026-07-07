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
uniform float audioCentroid;
uniform float audioValence;

const float PI   = 3.141592;
const float ORBS = 20.0;

// "Variant 01" constants from the original.
const float ZOOM       = 0.07;
const float CONTRAST   = 0.13;
const float ORB_SIZE   = 6.46;
const float RADIUS     = 11.0;
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

vec4 orb(vec2 uv, float s, vec2 p, vec3 color, float c)
{
    return pow(vec4(s / length(uv + p) * color, 1.0), vec4(c));
}

void main()
{
    vec2  fragCoord = gl_FragCoord.xy;
    float tt = time + audioAdvance * 2.0;    // jump-free (host-integrated) clock

    vec2 uv = (2.0 * fragCoord - resolution) / resolution.y;
    vec4 fragColor = vec4(0.0);
    uv *= ZOOM;
    uv /= max(dot(uv, uv), 1e-6);             // Mobius inversion (guarded)
    uv  = uv * rotate(tt / 10.0 + audioPhase * 0.05);

    for (float i = 0.0; i < ORBS; i += 1.0)
    {
        uv.x += cos(uv.y / Y_DIVIDE - tt);
        uv.y += COS_MUL * cos(uv.x * X_MUL) - sin(uv.x / X_DIVIDE - tt);
        float t = i * PI / ORBS * 2.0;
        float x = RADIUS * tan(t);
        float y = RADIUS * cos(t + tt / 10.0);
        vec2  position = vec2(x, y);
        vec3  color = cos(0.02 * uv.x + 0.02 * uv.y * vec3(-2.0, 0.0, -1.0) * PI * 2.0 / 3.0
                          + PI * (i / COLORSHIFT)) * 0.5 + 0.5;
        fragColor += 0.65 - orb(uv, ORB_SIZE, position, 1.0 - color, CONTRAST);
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
