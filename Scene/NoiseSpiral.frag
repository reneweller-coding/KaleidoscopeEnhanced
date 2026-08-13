#version 330 core
out vec4 fragColor;
// NoiseSpiral.frag
// -----------------------------------------------------------------------
// "Playing with this idea: https://www.shadertoy.com/view/w3VGzc" (as noted in
// the original's own comment; exact page/author of the shader pasted by the
// user is otherwise unspecified).  A raymarched tunnel whose walls are folded
// (domain-mirrored) and twisted along the travel axis, then eaten away by
// layered turbulent noise, giving a glowing, spiralling, organic tunnel with
// a bright vanishing point.
//
// Adapted to our engine: GLSL 1.20 (gl_FragCoord/resolution/time); the
// original's comma-operator for-loop golf de-golfed into ordinary nested
// loops/statements; tanh (GLSL 1.30+, not guaranteed in our 1.20 compatibility
// target) hand-rolled via a clamped exp() so it can't overflow to Inf/NaN;
// jump-free audio motion (host-integrated audioAdvance added to time, never
// time*audio); beat/onset brightness (applied before the tanh compression, so
// it's actually visible instead of saturating); mood grade; and IMAGE-DRIVEN
// colour: a drifting crop of the source picture (imgPal) rotates the
// palette's hue (hueRot) so the tunnel colours come from the ever-changing
// image.
// -----------------------------------------------------------------------

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioAdvance;
uniform float audioPhase;

// Per-activation variety (re-rolled each activation; 0 = default):
uniform float twistP;   // tunnel twist per depth unit (0 -> 0.2; 0.1 = calm, 0.35 = corkscrew)
uniform float turbP;    // turbulence amplitude        (0 -> 0.3; 0.15 = smooth, 0.45 = wild)
uniform float audioBeat;
uniform float audioOnset;
uniform float audioLevel;
uniform float audioCentroid;
uniform float audioValence;

vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }

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

// tanh(), component-wise, hand-rolled (not guaranteed built-in before GLSL
// 1.30): clamp the exponent so exp() can't overflow -> Inf/Inf -> NaN.
vec4 tanh4(vec4 x)
{
    vec4 e2x = exp(clamp(2.0 * x, -40.0, 40.0));
    return (e2x - 1.0) / (e2x + 1.0);
}

void main()
{
    float tt = time + audioAdvance * 2.5;   // jump-free (host-integrated) clock

    vec2 u = (gl_FragCoord.xy - resolution * 0.5) / resolution.y;

    float d = 0.0, s = 0.0, n;
    vec3  p;
    vec4  o = vec4(0.0);

    // Per-activation tunnel character (constant during the scene):
    float twist = (twistP <= 0.001) ? 0.2 : twistP;
    float turb  = (turbP  <= 0.001) ? 0.3 : turbP;

    for (float i = 0.0; i < 100.0; i += 1.0)
    {
        // March to the current distance, fold the domain (mirrored walls) and
        // twist along the travel axis -> a spiralling, kaleidoscopic tunnel.
        p = vec3(u * d, d + tt + tt);
        p = 2.0 - abs(abs(p) - 2.0);
        p.xy = p.xy * mat2(cos(p.z * twist + audioPhase * 0.05 + vec4(0.0, 33.0, 11.0, 0.0)));
        s = sin(p.y + p.x);

        // Layered turbulence eats into the base distance estimate.
        for (n = 1.0; n < 32.0; n += n)
            s -= abs(dot(cos(0.3 * tt + p * n), vec3(turb))) / n;

        s  = 0.005 + abs(s) * 0.7;
        d += s;
        o += (1.0 + cos(d + vec4(6.0, 2.0, 4.0, 1.0))) / s;
    }

    // Beat/onset brighten BEFORE the compressive tone-map (afterwards, values
    // are already saturating toward 1 and a multiply would barely show).
    o *= 1.0 + 0.4 * audioBeat + 0.25 * audioOnset;
    o  = tanh4(o * o / 3e7);

    vec3 col = max(o.rgb, 0.0);

    // Mood grade.
    col *= mix(vec3(0.75, 0.85, 1.20), vec3(1.25, 1.05, 0.75), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.6 * audioValence);

    // Image-driven colour: a drifting crop of the picture rotates the hue.
    float himg = dot(imgPal(dot(col, vec3(0.333)) * 6.0
                 + length(gl_FragCoord.xy / resolution - 0.5) * 4.0), vec3(0.333));
    col = hueRot(col, (himg - 0.5) * 3.0 + time * 0.05);

    col *= 0.9 + 0.5 * audioLevel;

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
