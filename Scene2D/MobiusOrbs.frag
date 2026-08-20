#version 330 core
out vec4 fragColor;
/**
 * @file MobiusOrbs.frag
 * @brief Adapted from an untitled Shadertoy Möbius-inversion orb field (pasted by the
 * user; exact page/author not given).  A ring of glowing orbs seen through a
 * Möbius (1/r^2) inversion, swirling into a hypnotic kaleidoscopic knot.
 *
 * Adapted to our engine: GLSL 1.20 (gl_FragCoord/resolution/time), jump-free
 * audio motion (host-integrated audioAdvance added to time, never time*audio),
 * beat/onset brightness, mood grade, and IMAGE-DRIVEN colour: a drifting crop
 * of the source picture (imgPal) rotates the palette's hue (hueRot) so the orb
 * colours come from the ever-changing image.  Only "Variant 01" of the
 * original's three `#define` presets is used (the other two were commented out
 * in the source and would just swap the numeric constants below).
 */

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

uniform float audioChromaHue;
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

vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }

vec3 imgPal(float x)
{
    vec2 cc = vec2(0.5) + 0.32 * vec2(cos(time * 0.045 + audioPhase * 0.12),
                                      sin(time * 0.033 + audioPhase * 0.09));
    return img(fract(cc + 0.24 * vec2(cos(x), sin(x * 1.31))));
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
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
float orbDist(vec2 uv, vec2 p, float i, float stretchAmt, float shapeAmt)
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
    return pow(pow(abs(d.x), k) + pow(abs(d.y), k), 1.0 / k);
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
    // NOTE: accumulate in a LOCAL (acc), not in a shadowing "vec4 fragColor"
    // -- a local of that name hides the out variable, the real output is
    // never written and the scene renders solid black (found by the metric
    // scan; core-migration artefact).
    vec4 acc = vec4(0.0);
    uv *= zoomV;
    // CAPPED Mobius inversion.  A bare 1/r^2 inversion sends the screen centre
    // to infinity: every orb then sits at an effectively infinite distance and
    // the whole central disc collapsed to one hot singularity while the rest of
    // the picture sat outside the orb field entirely (measured occ 0.01).
    // Flooring dot(uv,uv) at rMin^2 caps |uv| at 1/rMin and -- because the cap
    // engages exactly where |uv| == rMin -- does it continuously, so the centre
    // becomes a smooth plateau of orbs instead of a blown-out point.  rMin
    // tracks zoomV so a rolled zoom keeps the same proportions.
    float rMin = 0.28 * zoomV;
    uv /= max(dot(uv, uv), rMin * rMin);
    uv  = uv * rotate(tt / 10.0 + audioPhase * 0.05);

    for (float i = 0.0; i < ORBS; i += 1.0)
    {
        uv.x += cos(uv.y / Y_DIVIDE - tt);
        uv.y += COS_MUL * cos(uv.x * X_MUL) - sin(uv.x / X_DIVIDE - tt);
        float t = i * PI / ORBS * 2.0;
        // tan() runs away near t = pi/2 and 3pi/2: two of the twenty orbs were
        // being flung ~3e7 units off screen, contributing a flat constant and
        // leaving that side of the ring empty.  Clamping keeps the projective
        // sweep of the ring but holds every orb inside the picture.
        float x = radiusV * clamp(tan(t), -4.0, 4.0);
        float y = radiusV * cos(t + tt / 10.0);
        vec2  position = vec2(x, y);
        vec3  color = imgPalette(0.0032 * (uv.x + uv.y) + 0.5 * i / COLORSHIFT);
        // Normalise the palette to a fixed LEVEL and keep only its chroma, so the
        // orb field's exposure no longer rides on whichever slide happens to be up.
        vec3  oc = color / max(dot(color, vec3(0.3333)), 0.15) * 0.55;

        // Accumulate the orbs' glow DIRECTLY.
        // The old form was `acc += 0.65 - pow(orbSize/dist * colour, 0.13)`, a
        // difference of two near-equal numbers: an exponent of 0.13 crushes the
        // three decades that orbSize/dist actually spans (0.1 .. 60 here) into the
        // range 0.62 .. 0.77, i.e. the "glow" was essentially the SAME VALUE at
        // every pixel by construction. Subtracting a 0.65 bias from it left a
        // residual that hovered around zero and whose sign flipped on nothing more
        // than orb distance, so `max(-acc, 0.0)` clipped almost the entire frame to
        // black (measured luma 0.002, occ 0.01) and what survived had no range.
        // A plain inverse-distance falloff with a softening gap gives real bright
        // cores and real dark gaps, and is independent of the photo's exposure.
        float dist = orbDist(uv, position, i, stretchV, shapeV);
        float g = orbSize / (dist + 0.45);
        acc.rgb += oc * pow(g, 1.8);
    }

    // Exponential tone-map: responds logarithmically, so the exposure stays sane
    // across the wide range of glow sums the rolled parameters produce, and it can
    // never exceed 1.0 no matter how hot the field gets.
    vec3 col = 1.0 - exp(-max(acc.rgb, 0.0) * 0.070);
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

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
