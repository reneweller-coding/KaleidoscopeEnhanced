#version 330 core
out vec4 fragColor;
/**
 * @file TalbotCarpetRevival.frag
 * @brief TRANSITION TALBOT CARPET REVIVAL: a grating's near field scrambles the
 * outgoing scene into an interference carpet, and the incoming scene comes back
 * out of it at the revival distance.
 *
 * The carpet is the real thing, not a stripe pattern.  A periodic field
 * propagating a distance z picks up a phase -pi * (z/zT) * n^2 on its n-th
 * diffraction order, and the intensity is what those orders add up to.  Summing
 * five orders with exactly that quadratic phase gives the Talbot carpet with
 * everything that makes it recognisable: sharp fringes at the start, the
 * half-period shift at half the Talbot distance, the doubled frequency at a
 * quarter of it, and the fractal branching in between.  A linear phase would
 * only slide the fringes sideways -- the n-SQUARED is the whole effect.
 *
 * A second grating at a third of the period is summed in, which is what puts
 * the finer branches inside the coarse ones.
 *
 * Audio Reactivity:
 *   audioCentroid -> the grating period (slow, colour of the structure)
 *   audioSwell    -> how far the carpet displaces the picture (slow)
 *   audioHigh     -> the fringes' brightness (light)
 *   audioKick     -> the light on the brightest fringes (light)
 *
 * Per-activation variety: periodP, angleP, hueP.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float periodP;
uniform float angleP;
uniform float hueP;

const float PI = 3.14159265358979;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
mat2 rot2D(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// The near field of a grating after a fraction zz of one Talbot distance.
// Five orders, each carrying the quadratic propagation phase.
float carpet(float x, float zz)
{
    float re = 0.0, im = 0.0;
    for (int n = -2; n <= 2; ++n)
    {
        float fn = float(n);
        // A square grating's orders fall off as 1/n; the zeroth carries the mean.
        float c = (n == 0) ? 0.5 : (0.6366 / abs(fn)) * (mod(abs(fn), 2.0) > 0.5 ? 1.0 : 0.0);
        if (c <= 0.0) continue;
        float ph = 6.2831853 * fn * x - PI * zz * fn * fn;
        re += c * cos(ph);
        im += c * sin(ph);
    }
    return re * re + im * im;
}

void main()
{
    float per = (periodP > 0.0) ? periodP : 1.0;
    float ang = clamp(angleP, 0.0, 1.0);
    float hue = (hueP > 0.0) ? hueP : 0.0;

    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p  = (uv - 0.5) * vec2(aspect, 1.0);

    float d   = clamp(1.0 - interpolation, 0.0, 1.0);
    float arc = sin(d * PI);

    // The grating runs across a fixed direction for this activation.
    float theta = mix(-1.2, 1.2, ang);
    vec2  g = rot2D(theta) * p;

    // Period: the centroid opens and closes it slowly, so the structure
    // changes scale with the music without any of it jumping.
    float period = 0.055 * per * (0.8 + 0.5 * clamp(audioCentroid, 0.0, 1.0));
    float x = g.x / max(period, 1e-3);

    // One full Talbot distance across the turn: sharp at the start, the carpet
    // in between, sharp again at the revival.
    float zz = d * 2.0;
    float c1 = carpet(x,       zz);
    float c2 = carpet(x * 3.0, zz);            // the finer grating's branches
    float car = (c1 * 0.72 + c2 * 0.28);
    car = clamp(car * 0.75, 0.0, 2.0);

    // The carpet displaces the picture along the grating direction: where the
    // field piles up, the light that formed the picture went somewhere else.
    float push = (car - 0.55) * 0.030 * arc * (0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    vec2  off = (rot2D(-theta) * vec2(push, 0.0)) / vec2(aspect, 1.0);

    vec3 a = texture(tex0, clamp(uv + off, 0.0, 1.0)).rgb;
    vec3 b = texture(tex1, clamp(uv - off, 0.0, 1.0)).rgb;
    vec3 col = mix(a, b, d);

    // The fringes themselves: bright where the orders add, dark where they cancel.
    float fr = clamp(car - 0.5, -0.5, 1.4);
    col *= 1.0 + fr * 0.55 * arc;
    col += vec3(0.72, 0.80, 1.0) * clamp(fr, 0.0, 1.4) * arc
         * (0.03 + 0.10 * clamp(audioHigh * 2.0, 0.0, 1.0) + 0.06 * clamp(audioKick, 0.0, 1.0));

    if (hue > 0.001) col = hueRot(col, hue * arc * 0.35);

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
