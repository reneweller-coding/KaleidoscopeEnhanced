#version 330 core
out vec4 fragColor;
/**
 * @file PageTurnFolio.frag
 * @brief TRANSITION PAGE TURN FOLIO: the outgoing scene is a sheet of paper
 * that lifts along a slanted line and curls onto a cylinder, uncovering the
 * incoming scene where the sheet used to lie.
 *
 * The curl is solved, not painted.  For every pixel inside the roll band the
 * shader asks which point of the sheet, wrapped around a cylinder of radius R,
 * projects there: the horizontal offset from the axis IS the sine of the wrap
 * angle, so one asin() gives the angle, the angle gives the arc length, and the
 * arc length gives the point on the sheet to sample.  The same angle gives the
 * surface normal, which is what shades the roll -- a painted gradient would not
 * put the highlight in the right place as the roll tightens.
 *
 * Paper is thin, so a little of what lies behind the sheet bleeds through the
 * curl.  That show-through is what makes it read as paper rather than as a
 * rolling tube.  The roll tightens as the turn proceeds, the way a sheet lifted
 * further wraps on a smaller radius.
 *
 * Audio Reactivity:
 *   audioSwell -> the paper's stiffness, i.e. the radius of the roll (slow)
 *   audioHigh  -> the sheen along the free edge (light)
 *   audioKick  -> the light on the roll's crest (light)
 *   audioMid   -> the warmth of the paper stock (colour)
 *
 * Per-activation variety: tiltP, stiffP, hueP.
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

uniform float tiltP;
uniform float stiffP;
uniform float hueP;

const float PI = 3.14159265358979;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
mat2 rot2D(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float tlt   = clamp(tiltP,  0.0, 1.0);
    float stiff = (stiffP > 0.0) ? stiffP : 1.0;
    float hue   = (hueP   > 0.0) ? hueP   : 0.0;

    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p  = (uv - 0.5) * vec2(aspect, 1.0);

    float d   = clamp(1.0 - interpolation, 0.0, 1.0);   // 0 = old sheet, 1 = new scene
    float arc = sin(d * PI);                            // exactly 0 at both ends

    // The sheet's own frame: the fold line runs along q.y, the turn along q.x.
    float tilt = mix(-0.38, 0.38, tlt);
    mat2  toQ  = rot2D(-tilt), toP = rot2D(tilt);
    vec2  q    = toQ * p;
    float halfW = 0.5 * (aspect * abs(cos(tilt)) + abs(sin(tilt))) + 0.03;

    // Radius: stiff paper wraps wide, and the roll tightens as more sheet is
    // taken up.  audioSwell is the only audio allowed near geometry here, and
    // it is slow, so the roll breathes instead of stuttering.
    float radius = mix(0.46, 0.13, d) * stiff * (0.85 + 0.30 * clamp(audioSwell, 0.0, 1.0));
    // The fold sweeps far enough past both edges that the roll is off-screen at
    // both ends of the transition -- that is what makes the endpoints exact.
    float cx = mix(halfW + 0.05, -halfW - 2.0 * 0.46 * stiff - 0.20, d);
    float sheetLen = max(0.0, halfW - cx);              // material already lifted

    vec3 paper = mix(vec3(0.94, 0.92, 0.87), vec3(0.97, 0.94, 0.83),
                     clamp(audioMid * 2.0, 0.0, 1.0));

    vec3 col;
    float w = (q.x - cx - radius) / max(radius, 1e-4);   // -1 .. 1 across the roll

    if (q.x < cx)
    {
        // Still flat on the table: the outgoing scene, untouched.
        col = texture(tex0, uv).rgb;
    }
    else if (w <= 1.0)
    {
        // Inside the roll band.  The horizontal offset is the sine of the wrap
        // angle; the angle gives both the arc length and the surface normal.
        float phi = asin(clamp(w, -1.0, 1.0));           // -PI/2 .. PI/2
        float s   = radius * (phi + PI * 0.5);           // arc length from the fold

        if (s > sheetLen)
        {
            // Past the free edge: the sheet does not reach here any more.
            vec3 under = texture(tex1, uv).rgb;
            col = under * (1.0 - 0.45 * arc);
        }
        else
        {
            // Sample the sheet at the page position that wrapped to here.
            vec2 pageQ  = vec2(cx + s, q.y);
            vec2 pageUv = (toP * pageQ) / vec2(aspect, 1.0) + 0.5;
            vec3 sheet  = texture(tex0, clamp(pageUv, 0.0, 1.0)).rgb;

            // Shading from the cylinder's own normal, light from the upper left.
            vec2  n   = vec2(sin(phi), cos(phi));
            vec2  lig = normalize(vec2(-0.5, 1.0));
            float lam = clamp(dot(n, lig), 0.0, 1.0);
            float shade = 0.34 + 0.66 * lam;
            float spec  = exp(-pow((dot(n, lig) - 0.96) / 0.10, 2.0));

            // Thin paper: a little of what lies behind bleeds through, most of
            // it where the sheet is turned edge-on to the light.
            vec3  behind = texture(tex1, clamp(uv, 0.0, 1.0)).rgb;
            float through = 0.22 * pow(clamp(abs(w), 0.0, 1.0), 1.5);
            vec3  face = mix(sheet, mix(behind, paper, 0.45), through);

            col = face * shade;
            col += paper * spec * (0.08 + 0.24 * clamp(audioKick, 0.0, 1.0));
            // The free edge catches the light as a thin bright line.
            float edge = smoothstep(0.030, 0.0, sheetLen - s);
            col += paper * edge * (0.12 + 0.34 * clamp(audioHigh * 2.0, 0.0, 1.0));
            // Paper tooth, so the roll is not a plastic tube.
            col *= 0.94 + 0.12 * hash21(floor(pageUv * resolution.y * 0.5));
        }
    }
    else
    {
        // Uncovered: the incoming scene, with the roll's shadow falling on it.
        vec3 under = texture(tex1, uv).rgb;
        float dist = (q.x - cx - 2.0 * radius);
        float sh   = 0.55 * exp(-dist * 7.0) * arc;
        col = under * (1.0 - sh);
    }

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue * arc * 0.5);
    if (hue > 0.001)           col = hueRot(col, hue * arc * 0.5);

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
