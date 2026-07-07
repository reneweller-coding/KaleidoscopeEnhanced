// BreathingFractal.frag
// -----------------------------------------------------------------------
// Adapted from an untitled Shadertoy fractal (pasted by the user; exact page/
// author not given): a "breathing" abs/fract kaleidoscope with a per-iteration
// rotation, producing a tight, glowing lattice of folded lines that pulses and
// spirals into deep, self-similar layers.
//
// Adapted to our engine: GLSL 1.20 (gl_FragCoord/resolution/time); the
// original's comma-operator loop body de-golfed into ordinary statements; its
// mouse-driven per-iteration detune (iMouse.x) replaced by the (smoothed)
// spectral centroid, since this engine has no mouse input; jump-free audio
// motion (host-integrated audioAdvance added to time, never time*audio);
// beat-driven breathing/brightness; mood grade; and IMAGE-DRIVEN colour: a
// drifting crop of the source picture (imgPal) rotates the palette's hue
// (hueRot) so the lattice colours come from the ever-changing image.
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

void main()
{
    vec2 v = resolution;
    vec2 p = (gl_FragCoord.xy - v * 0.5) * 0.4 / v.y;
    float tt = time + audioAdvance * 2.0;    // jump-free (host-integrated) clock

    // Breathing effect, a touch stronger on the beat.
    p += p * sin(dot(p, p) * 20.0 - tt) * (0.04 + 0.02 * audioBeat);

    vec4 c = vec4(0.0);
    for (float i = 0.5; i < 8.0; i += 1.0)
    {
        // Fractal fold + per-iteration rotation (mouse-detune -> centroid).
        mat2 rot = mat2(cos(0.01 * (tt + audioCentroid * 5.0) * i * i
                            + 0.78 * vec4(1.0, 7.0, 3.0, 1.0)));
        p  = abs(2.0 * fract(p - 0.5) - 1.0) * rot;
        c += exp(-abs(p.y) * 5.0) * (cos(vec4(2.0, 3.0, 1.0, 0.0) * i) * 0.5 + 0.5);
    }

    c.gb *= 0.5;   // palette: red-leaning grade

    // The 8-iteration accumulation is unbounded above (each pass can add up to
    // 1.0 per channel), so bright cores blew out to large flat-white patches.
    // A soft Reinhard-style compression keeps highlight detail instead.
    vec3 col = max(c.rgb, 0.0);
    col = col / (1.0 + col);
    col *= 1.0 + 0.5 * audioBeat + 0.3 * audioOnset;

    // Mood grade.
    col *= mix(vec3(0.75, 0.85, 1.20), vec3(1.25, 1.05, 0.75), audioCentroid);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(lum), col, 0.6 + 0.6 * audioValence);

    // Image-driven colour: a drifting crop of the picture rotates the hue.
    float himg = dot(imgPal(dot(col, vec3(0.333)) * 6.0
                 + length(gl_FragCoord.xy / resolution - 0.5) * 4.0), vec3(0.333));
    col = hueRot(col, (himg - 0.5) * 3.0 + time * 0.05);

    col *= 0.9 + 0.5 * audioLevel;

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
