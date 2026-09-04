#version 330 core
out vec4 fragColor;
/**
 * @file MartensiticTwinBands.frag
 * @brief TRANSITION MARTENSITIC TWIN BANDS: a shear transformation runs through
 * the frame.  Lens-shaped twin bands nucleate on two habit planes, widen, and
 * each one carries the incoming scene sheared by the transformation strain.
 *
 * A martensitic transformation is diffusionless: the lattice SHEARS into its
 * new shape rather than rearranging atom by atom.  Two things follow, and both
 * are what make this read as metal rather than as a wipe.  First every band
 * shears by the SAME fixed amount -- the transformation strain is a property of
 * the lattice, not of the band -- so a band widens but never shears further
 * once it has formed.  Second the bands lie on two habit planes and cross,
 * because that is how the twins accommodate each other's strain.
 *
 * How many bands there are is rolled ONCE per activation.  Re-rolling a count
 * per frame is what makes a pattern flicker instead of transform.
 *
 * Audio Reactivity:
 *   audioKick    -> the light on a band that has just nucleated (light)
 *   audioSwell   -> the widening rate (slow)
 *   audioHigh    -> the glint along a twin boundary (light)
 *   audioMid     -> the metal's temper colour (colour)
 *
 * Per-activation variety: bandsP, shearP, hueP.
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

uniform float bandsP;
uniform float shearP;
uniform float hueP;

const float PI = 3.14159265358979;

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
mat2 rot2D(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

void main()
{
    float bandsN = 5.0 + floor(clamp(bandsP, 0.0, 1.0) * 6.0);   // rolled ONCE per activation
    float shear  = (shearP > 0.0) ? shearP : 1.0;
    float hue    = (hueP   > 0.0) ? hueP   : 0.0;

    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p  = (uv - 0.5) * vec2(aspect, 1.0);

    float d   = clamp(1.0 - interpolation, 0.0, 1.0);
    float arc = sin(d * PI);

    // Two habit planes, crossing the way real twins do.
    float grow = 0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float cover = 0.0;       // how much of this pixel has transformed
    float edge  = 0.0;       // how close it is to a twin boundary
    float fresh = 0.0;       // how newly this band nucleated
    vec2  shiftSum = vec2(0.0);

    for (int j = 0; j < 2; ++j)
    {
        float aj = (j == 0) ? 0.62 : -0.74;
        vec2  q = rot2D(aj) * p;
        float sp = 1.35 / bandsN;                       // band spacing
        float idx = floor(q.y / sp);
        for (int k = -1; k <= 1; ++k)
        {
            float id = idx + float(k);
            float seed = hash11(id * 7.31 + float(j) * 53.7);
            // Each band has its own nucleation moment, fixed for the activation.
            float t0 = seed * 0.62;
            float g = smoothstep(t0, t0 + 0.42 / grow, d);
            if (g <= 0.0) continue;
            // A lens: widest in the middle, tapering to its tips.
            float centre = (id + 0.5) * sp;
            float halfW = sp * 0.52 * g;
            float along = clamp(q.x / 1.3, -1.0, 1.0);
            float lens = halfW * sqrt(max(0.0, 1.0 - along * along * 0.55));
            float dist = abs(q.y - centre);
            float inBand = smoothstep(lens, lens * 0.82, dist);
            cover = max(cover, inBand);
            edge  = max(edge, exp(-pow((dist - lens) / (sp * 0.09), 2.0)) * g);
            fresh = max(fresh, inBand * (1.0 - smoothstep(t0, t0 + 0.16, d)));
            // The transformation strain is FIXED: a band that has formed does
            // not go on shearing, it only gets wider.
            vec2 dir = rot2D(-aj) * vec2(1.0, 0.0);
            shiftSum += dir * inBand * 0.028 * shear * (j == 0 ? 1.0 : -1.0);
        }
    }
    cover = clamp(cover, 0.0, 1.0);
    // By the end the bands have consumed the parent phase completely.
    cover = mix(cover, 1.0, smoothstep(0.82, 1.0, d));

    vec2 sheared = clamp(uv + shiftSum / vec2(aspect, 1.0), 0.0, 1.0);
    vec3 parent = texture(tex0, uv).rgb;
    vec3 twin   = texture(tex1, sheared).rgb;

    // Temper colour: the transformed phase reflects a little differently.
    vec3 temper = mix(vec3(1.02, 0.99, 0.95), vec3(0.95, 0.98, 1.05),
                      clamp(audioMid * 2.0, 0.0, 1.0));
    temper = mix(temper, temper.gbr, fract(hue * 0.159) * 0.5);

    vec3 col = mix(parent, twin * temper, cover);
    // The twin boundaries glint.
    col += vec3(0.90, 0.92, 1.0) * edge * arc
         * (0.06 + 0.20 * clamp(audioHigh * 2.0, 0.0, 1.0));
    // A band that has just snapped into place carries the light of the event.
    col += vec3(1.0, 0.96, 0.88) * fresh * arc * 0.35 * clamp(audioKick, 0.0, 1.0);

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
