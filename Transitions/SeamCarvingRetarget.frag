#version 330 core
out vec4 fragColor;
/**
 * @file SeamCarvingRetarget.frag
 * @brief TRANSITION SEAM CARVING RETARGET: seams of lowest energy are taken out
 * of the outgoing scene and seams of the incoming one are pushed in, so the
 * frame is squeezed together unevenly -- quiet areas vanish first and edges
 * hold their ground.
 *
 * The point of seam carving is that it is CONTENT AWARE: it does not scale, it
 * removes the paths a picture can least afford to lose.  So the compression
 * here is driven by an energy profile measured from the picture itself -- the
 * gradient magnitude accumulated down each column -- and the displacement at a
 * point is how much low-energy width lies to its left.  A uniform squeeze would
 * be a scale, which is exactly the thing seam carving exists to avoid.
 *
 * The two pictures are carved in opposite directions: the outgoing one loses
 * seams and pulls together, the incoming one gains them and opens out, so at
 * the middle of the turn both are distorted and the join is invisible.
 *
 * Audio Reactivity:
 *   audioFlux -> the carving rate: how many seams go per moment (slow)
 *   audioMid  -> what counts as energy, edges against colour (colour)
 *   audioHigh -> the light along a seam as it closes (light)
 *   audioSwell -> how far the frame is retargeted (slow)
 *
 * Per-activation variety: energyP, amountP, hueP.
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

uniform float energyP;
uniform float amountP;
uniform float hueP;

const float PI = 3.14159265358979;

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// How much a column is worth keeping: the gradient it carries, sampled down its
// height.  A cheap stand-in for the full energy map, and it is the same
// quantity -- edges are expensive, flat areas are not.
float columnEnergy(sampler2D tx, float x, float colourWeight)
{
    float e = 0.0;
    for (int i = 0; i < 5; ++i)
    {
        float y = (float(i) + 0.5) / 5.0;
        vec3 a = textureLod(tx, clamp(vec2(x - 0.006, y), 0.0, 1.0), 0.0).rgb;
        vec3 b = textureLod(tx, clamp(vec2(x + 0.006, y), 0.0, 1.0), 0.0).rgb;
        e += abs(lum(b) - lum(a)) + colourWeight * length(b - a);
    }
    return e / 5.0;
}

void main()
{
    float ew  = clamp(energyP, 0.0, 1.0);
    float amt = (amountP > 0.0) ? amountP : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution;

    float d   = clamp(1.0 - interpolation, 0.0, 1.0);
    float arc = sin(d * PI);

    // What counts as energy: pure luminance edges, or colour changes too.
    float colourWeight = ew * (0.4 + 1.2 * clamp(audioMid * 2.0, 0.0, 1.0));

    // Walk from the left edge to this pixel, accumulating how much of what we
    // passed was cheap enough to carve away.
    const int N = 20;
    float cheapLeft0 = 0.0, cheapLeft1 = 0.0, totalCheap0 = 0.0, totalCheap1 = 0.0;
    for (int i = 0; i < N; ++i)
    {
        float x = (float(i) + 0.5) / float(N);
        float c0 = 1.0 / (1.0 + 26.0 * columnEnergy(tex0, x, colourWeight));
        float c1 = 1.0 / (1.0 + 26.0 * columnEnergy(tex1, x, colourWeight));
        totalCheap0 += c0;
        totalCheap1 += c1;
        if (x < uv.x) { cheapLeft0 += c0; cheapLeft1 += c1; }
    }
    cheapLeft0 /= max(totalCheap0, 1e-4);
    cheapLeft1 /= max(totalCheap1, 1e-4);

    // How far the frame is retargeted right now.
    float carve = arc * amt * (0.55 + 0.45 * clamp(audioSwell, 0.0, 1.0))
                * (0.85 + 0.4 * clamp(audioFlux * 2.0, 0.0, 1.0));
    carve = clamp(carve, 0.0, 1.0);

    // The outgoing picture loses seams and pulls together; the incoming one
    // gains them and opens out.  Both distortions are content aware.
    // A fifth of the way toward the cumulative profile: at half, the frame
    // collapsed into its own centre and read as a zoom, which is precisely what
    // seam carving is not.
    float u0 = uv.x + (cheapLeft0 - uv.x) * carve * 0.22;
    float u1 = uv.x - (cheapLeft1 - uv.x) * carve * 0.22;

    vec3 a = textureLod(tex0, clamp(vec2(u0, uv.y), 0.0, 1.0), 0.0).rgb;
    vec3 b = textureLod(tex1, clamp(vec2(u1, uv.y), 0.0, 1.0), 0.0).rgb;
    vec3 col = mix(a, b, smoothstep(0.30, 0.70, d));

    // A seam closing pinches the light along it.  The seams are where the
    // compression is steepest, which is where the cheap columns were.
    float pinch = clamp((cheapLeft0 - uv.x) * 6.0, -1.0, 1.0);
    float seam = exp(-pow(fract(uv.x * 34.0 + pinch * 3.0) - 0.5, 2.0) / 0.02) * carve;
    vec3 glow = mix(vec3(0.90, 0.94, 1.0), vec3(1.0, 0.95, 0.86), fract(hue * 0.159));
    col += glow * seam * (0.03 + 0.12 * clamp(audioHigh * 2.0, 0.0, 1.0));

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
