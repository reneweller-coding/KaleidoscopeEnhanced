#version 330 core
out vec4 fragColor;
/**
 * @file LeafVeinPerfusion.frag
 * @brief TRANSITION LEAF VEIN PERFUSION: dye enters at the petiole and runs
 * through a leaf's venation.  The incoming scene appears only where the network
 * has already carried it.
 *
 * The order is the point.  Dye does not arrive by distance from the stalk, it
 * arrives by distance ALONG THE VEINS -- so a spot at the leaf's tip fills
 * before a spot the same distance away that has to be reached the long way
 * round a secondary.  Every pixel here works out which vein serves it and how
 * far along the network that is, and one advancing front crosses those path
 * lengths.
 *
 * The thicknesses follow Murray's law: a vein's radius goes with the cube root
 * of the flow it carries, so the midrib is thick, the secondaries thinner by a
 * fixed ratio, and the tertiaries thinner again.  Drawing them all the same
 * width is what makes a drawn network look like a drawn network.
 *
 * Audio Reactivity:
 *   audioSwell   -> the pressure at the petiole: how far the front has run (slow)
 *   audioHigh    -> the sheen on a filled vein (light)
 *   audioSwell   -> how far the dye bleeds into the blade (slow)
 *   audioKick    -> the light in the filled network (light)
 *
 * Per-activation variety: veinsP, bleedP, hueP.
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

uniform float veinsP;
uniform float bleedP;
uniform float hueP;

const float PI = 3.14159265358979;

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

// Distance to a segment, and how far along the segment the closest point lies.
float segDist(vec2 p, vec2 a, vec2 b, out float t)
{
    vec2 ab = b - a;
    t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    return length(p - (a + ab * t));
}

void main()
{
    float nSec  = 4.0 + floor(clamp(veinsP, 0.0, 1.0) * 5.0);   // rolled ONCE
    float bleed = (bleedP > 0.0) ? bleedP : 1.0;
    float hue   = (hueP   > 0.0) ? hueP   : 0.0;

    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p  = (uv - 0.5) * vec2(aspect, 1.0);

    float d   = clamp(1.0 - interpolation, 0.0, 1.0);
    float arc = sin(d * PI);

    // The petiole is at the left, the midrib runs to the tip.
    vec2 base = vec2(-aspect * 0.5 - 0.05, -0.06);
    vec2 tip  = vec2(aspect * 0.5 + 0.05,  0.06);

    // Murray's law: radius goes with the cube root of the flow, so each order
    // is thinner than its parent by a fixed ratio.
    // Thick enough to READ as a network: at a third of this the venation was
    // there in the maths and invisible on screen, which makes the whole
    // transition a soft dissolve with a story nobody can see.
    float wMain = 0.055, wSec = wMain * 0.63, wTer = wSec * 0.63;

    float t;
    float dMain = segDist(p, base, tip, t);
    float pathMain = t;                       // 0 at the petiole, 1 at the tip
    float best = dMain / wMain;               // distance in units of that vein's width
    float path = pathMain;
    float order = 0.0;

    for (int i = 0; i < 9; ++i)
    {
        if (float(i) >= nSec) break;
        float fi = float(i);
        float u = (fi + 0.5) / nSec;                       // where it leaves the midrib
        vec2 a = mix(base, tip, u);
        float side = (mod(fi, 2.0) < 0.5) ? 1.0 : -1.0;
        float lean = 0.55 + 0.30 * hash11(fi * 3.3);
        // Secondaries sweep forward, the way a pinnate leaf's do.
        vec2 b = a + vec2(0.30 + 0.16 * hash11(fi * 5.1), side * (0.34 + 0.16 * hash11(fi * 7.9)))
                   * vec2(1.0, lean);
        float ts;
        float ds = segDist(p, a, b, ts) / wSec;
        if (ds < best) { best = ds; path = u + ts * 0.55; order = 1.0; }

        // Tertiaries between the secondaries, hanging off this one.
        for (int k = 0; k < 3; ++k)
        {
            float fk = float(k);
            float v = (fk + 0.5) / 3.0;
            vec2 a2 = mix(a, b, v);
            float sd = (mod(fk + fi, 2.0) < 0.5) ? 1.0 : -1.0;
            vec2 b2 = a2 + vec2(0.10 + 0.06 * hash11(fi * 2.1 + fk),
                                sd * (0.11 + 0.05 * hash11(fi * 9.3 + fk)));
            float tt;
            float dt = segDist(p, a2, b2, tt) / wTer;
            if (dt < best) { best = dt; path = u + v * 0.55 + tt * 0.22; order = 2.0; }
        }
    }

    // One front crossing the PATH LENGTHS, not the distances.  Only a SLOW
    // envelope may touch where the front is: a fast one scales a position, and
    // a scaled position runs backwards the moment the envelope drops.
    float speed = 0.90 + 0.30 * clamp(audioSwell, 0.0, 1.0);
    float front = d * (1.25 * speed) - 0.06;
    float filled = smoothstep(front + 0.10, front - 0.10, path);

    // The vein itself, and the dye bleeding out of it into the blade.
    float vein = smoothstep(1.30, 0.70, best);
    float spread = (1.6 + 2.6 * clamp(audioSwell, 0.0, 1.0)) * bleed * d * d;
    // The bass is audible in the light the filled network gives off, not in
    // where that network has got to.
    float pressure = 0.75 + 0.5 * clamp(audioBass, 0.0, 1.0);
    float lamina = smoothstep(1.0 + spread * 9.0, 0.9, best);

    float wet = clamp(max(vein, lamina * 0.92) * filled, 0.0, 1.0);
    // By the end the whole blade has taken the dye.
    wet = mix(wet, 1.0, smoothstep(0.84, 1.0, d));

    vec3 col = mix(texture(tex0, uv).rgb, texture(tex1, uv).rgb, wet);

    // A filled vein is glossy, and it is darker than the blade around it.
    vec3 sheen = mix(vec3(0.75, 0.95, 0.80), vec3(0.95, 0.85, 0.70), fract(hue * 0.159));
    // A dye-filled vein is DARKER than the blade, and that contrast is what
    // draws the network.
    col *= 1.0 - vein * filled * 0.62 * arc * (1.0 - 0.35 * order);
    // An empty vein is visible too, just faintly: the leaf has its skeleton
    // before the dye arrives.
    col *= 1.0 - vein * (1.0 - filled) * 0.20 * arc;
    col += sheen * vein * filled * arc * pressure
         * (0.06 + 0.22 * clamp(audioHigh * 2.0, 0.0, 1.0) + 0.10 * clamp(audioKick, 0.0, 1.0));
    // The advancing front is a little brighter than what it leaves behind.
    float edge = exp(-pow((path - front) / 0.06, 2.0)) * vein;
    col += sheen * edge * arc * 0.22;

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
