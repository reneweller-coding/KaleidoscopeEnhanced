#version 330 core
out vec4 fragColor;
/**
 * @file FeedbackKaleidoscope.frag
 * @brief Analog VIDEO FEEDBACK, kaleidoscope edition: last frame's fully composited image
 * (`texPrevFrame`) is folded through an n-way mirror, slightly zoomed and rotated, decayed, and
 * blended back in -- like a camera pointed at its own monitor, but the monitor is a kaleidoscope.
 * Because the fold applies again to an already-folded previous frame every single frame, detail
 * recursively compounds into ever-finer symmetric structure that never repeats exactly, unlike the
 * static procedural folds elsewhere in the catalogue. A small continuous injection of the current
 * photo -- level-normalised against the photo's own mean, so a dark nebula and a bright portrait
 * drive the loop equally -- keeps it from decaying to black or drifting into meaningless mush.
 * Two things stop the loop turning into the grey wash a linear feedback always converges to: the
 * retained frame is weighted by its own brightness (bright trails persist, dim haze dies), and the
 * mirror's own geometry -- seams, petal ribs, rosette -- is re-drawn crisp on top every frame.
 *   audioKick    -> brief extra zoom punch (bounded, not a runaway multiplier) + seam flare
 *   audioBeat    -> rotation direction/speed swings
 *   audioSwell   -> injection strength breathes (louder passages feed in more fresh photo)
 *   audioAdvance -> petal ribs roll outward (integrated phase, never a factor on `time`)
 *   audioLevel   -> overall drive
 *   audioCentroid-> cool/warm tint of the accumulated feedback
 *   audioChromaHue -> slow hue drift of the accumulated feedback
 *   audioValence -> palette saturation (via imgPalette)
 * If texPrevFrame is unavailable (e.g. the very first frames after launch), it reads black, and
 * the scene starts from pure photo injection and grows into feedback within a few frames.
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D texPrevFrame;   // last frame's fully composited image
uniform float interpolation;

uniform float audioKick;
uniform float audioBeat;
uniform float audioPhase;
uniform float audioAdvance;
uniform float audioChromaHue;
uniform float audioValence;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioCentroid;

// Per-activation variety (re-rolled each activation; 0 = default):
uniform int   sidesP;      // fold segment count (0 -> 7; 5..11)
// PER-FRAME retention factor -- this compounds every single frame (60x/s),
// so it must sit very close to 1.0: at 0.985 content is down to ~1% after
// only 2s (0.985^120 =~ 0.16, and worse over a few more seconds), which
// read as near-black. 0.997 has a much longer, actually visible half-life
// (~0.997^600 =~ 0.17 after 10s) -- a real trailing/evolving feedback loop
// instead of one that decays before it's ever seen.  It is capped at 0.996
// below, because the per-frame contrast curve adds up to 1.04x on top of it and
// the product of the two must stay under 1.0 (see the note at that line).
uniform float decayP;      // feedback persistence (0 -> 0.997; 0.994..0.999)
uniform float injectP;     // fresh-photo injection strength (0 -> 0.05; 0.05..0.13)
uniform float hueP;

const float PI = 3.14159265358979;
const vec3  LW = vec3(0.2126, 0.7152, 0.0722);

vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }

// Mean colour of the current photo (the 1x1 mip; the slideshow textures are
// uploaded at 1024x1024 with glGenerateMipmap, see RenderPipeline.cpp).  The
// injection is divided by it, so the loop's brightness is a property of the
// FEEDBACK, not of whichever picture happens to be up -- the library runs from
// mean luma 0.14 (nebulae) to 0.74 (bright portraits).
vec3 imgDC() { return (interpolation * textureLod(tex0, vec2(0.5), 10.0)
                     + (1.0 - interpolation) * textureLod(tex1, vec2(0.5), 10.0)).rgb; }

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

// imgPalette at a fixed luminance, so the mandala's own lines keep their
// brightness on a dark photo.  A nearly-black sample is eased to neutral first:
// dividing (0.01,0.0,0.0) by its luma would make a hard saturated primary.
vec3 palNorm(float t)
{
    vec3  p  = imgPalette(t);
    float pl = max(dot(p, LW), 1e-4);
    vec3  pn = min(p / pl, vec3(2.5));
    return mix(vec3(1.0), pn, clamp(pl * 8.0, 0.25, 1.0)) * 0.55;
}

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// Mirror fold.  Also hands back the angle WITHIN the wedge and the wedge width,
// which the seam and petal terms below need in order to draw the mirror lines.
vec2 kaleido(vec2 p, float sides, out float wedgeA, out float segOut)
{
    float a   = atan(p.y, p.x);
    float r   = length(p);
    float seg = PI / sides;
    a = mod(a + PI, 2.0 * seg) - seg;
    a = abs(a);
    wedgeA = a; segOut = seg;
    return vec2(cos(a), sin(a)) * r;
}

void main()
{
    float sidesV = (sidesP < 5) ? 7.0 : float(sidesP);
    float decayV = (decayP <= 0.5) ? 0.997 : decayP;
    float injV   = (injectP <= 0.001) ? 0.05 : injectP;

    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 c  = (uv - 0.5) * vec2(aspect, 1.0);

    // Kaleidoscope fold applied to the SAMPLING coordinate every frame: since
    // this samples last frame's already-folded output, the fold recurses and
    // detail compounds -- this is the entire "feedback" trick.
    float wedgeA, seg;
    vec2  folded = kaleido(c, sidesV, wedgeA, seg);
    float rad    = length(c);

    // Small per-frame zoom + rotation (deliberately a near-constant, not
    // scaled by absolute time -- see Engine/Feedback.frag's warpZoom/warpRot
    // for the same idiom): sampling the previous frame through a slightly
    // magnified, rotated window each frame makes structure spiral outward
    // and turn over many frames without ever snapping.
    // Gentle -- a faster per-frame zoom compounds into sampling an
    // ever-smaller (and increasingly arbitrary, possibly dark) source
    // region within a couple of seconds, starving the loop of brightness
    // no matter how strong the fresh-photo injection below is.
    float zoom = 1.004 + 0.02 * audioKick;
    float rotHere = 0.045 * (audioBeat > 0.5 ? 1.0 : -1.0) * (0.5 + 0.5 * audioBeat);
    float cs = cos(rotHere), sn = sin(rotHere);
    folded = mat2(cs, -sn, sn, cs) * folded / max(zoom, 1e-3);

    vec2 puv = vec2(folded.x / aspect, folded.y) + 0.5;

    // Soft edge fade so content leaving the frame dissolves instead of
    // smearing into a hard border.
    vec2  e    = min(puv, 1.0 - puv);
    float edge = smoothstep(0.0, 0.02, min(e.x, e.y));

    vec3 prev = hueRot(texture(texPrevFrame, clamp(puv, 0.0, 1.0)).rgb,
                        0.22 * sin(time * 0.03 + audioChromaHue));

    // PER-FRAME CONTRAST CURVE -- the single most important line in this file.
    // A plain decayed feedback loop is a LOW-PASS FILTER: every frame the image
    // is re-sampled slightly rotated and zoomed, so after a handful of frames
    // the accumulated picture is the angular+radial BLUR of what was injected.
    // That is exactly what the scene measured: the folded photo goes in at
    // contrast 0.169 and the converged loop came out at 0.064, a featureless
    // mid-grey field (luma 0.410, occ 0.25). Weighting the retained frame by its
    // own brightness makes the loop non-linear: dim wash loses 62% per frame and
    // dies within a few frames, while bright filaments keep ~1.04x and survive
    // for dozens -- so the loop SHARPENS into trails instead of smearing into a
    // wash. The peak (0.38+0.66 = 1.04) is deliberately just under the inverse
    // of decay*(1-inject) for the strongest legal preset (0.996*0.94 = 0.936),
    // so the loop can never run away: 0.936*1.04 = 0.974 < 1.
    float prevL = dot(prev, LW);
    prev *= 0.38 + 0.66 * smoothstep(0.10, 0.60, prevL);

    // Fresh injection: a little of the current photo, folded the SAME way as
    // the feedback so new material enters already symmetric, not as a flat
    // patch breaking the mandala.
    // What is injected has to CARRY DETAIL. It used to be
    // imgPalette(0.5 + 0.5*length(folded)), which depends on nothing but the
    // radius -- a smooth radial ramp with no spatial structure at all, and a
    // smooth full-frame gradient is worth exactly nothing to a picture: it just
    // becomes the modal brightness. It is still mixed in, but at 0.15 instead of
    // 0.35 (at 0.35 it alone cut the injected contrast from 0.169 to 0.111) and
    // only as a colour bed. The photo itself is divided by its own mean and
    // pushed through a smoothstep, so only the picture's LIGHT parts feed the
    // loop and its shadows inject nothing -- that is what leaves black between
    // the petals.
    float dcL  = max(dot(imgDC(), LW), 0.05);
    float gain = clamp(0.36 / dcL, 0.6, 3.0);
    vec2  injUV = clamp(vec2(folded.x / aspect, folded.y) * 1.30 + 0.5, 0.0, 1.0);
    vec3  photo = img(injUV) * gain;
    photo *= 0.20 + 1.30 * smoothstep(0.06, 0.55, dot(photo, LW));
    vec3  fresh = mix(photo, palNorm(0.5 + 0.5 * length(folded)), 0.15);
    float injectHere = injV * (1.2 + 0.8 * audioSwell);

    // decay is capped at 0.996 (not 0.999): together with the contrast curve
    // above this is what keeps the loop's peak gain below 1.
    vec3 col = mix(prev * min(decayV, 0.996) * edge, fresh, injectHere);

    // ---- The mirror itself, drawn CRISP every frame ----
    // Everything above went through the loop and is therefore soft. These three
    // terms do not: they are re-drawn at full contrast each frame (and their
    // echoes are what the feedback then spirals outward), so the frame always
    // carries hard structure at a scale the 6x measurement downscale can see.
    //  * the mirror seams: the fold lines of the kaleidoscope, ~16 px wide at
    //    1080p because the width is a SCREEN distance (rad * angle), not an
    //    angle -- an angular width would vanish to sub-pixel near the centre.
    //  * petal ribs: concentric bands rolling outward, dimmed toward the seams
    //    so each wedge reads as a separate petal.
    //  * the rosette at the convergence point.
    float dSeam = rad * min(wedgeA, seg - wedgeA);
    float seamL = exp(-(dSeam * dSeam) / (0.0075 * 0.0075));
    float petal = 0.35 + 0.65 * pow(sin(clamp(wedgeA / seg, 0.0, 1.0) * PI), 2.0);
    float ribs  = pow(0.5 + 0.5 * cos(rad * 46.0 - (time * 0.8 + audioAdvance * 1.6)), 8.0);
    float rose  = exp(-(rad * rad) / (0.045 * 0.045));
    col += palNorm(0.20) * (seamL * 0.38 * (0.55 + 0.45 * audioKick) + rose * 0.42);
    col += palNorm(0.65) * (ribs * petal * 0.28);

    col *= 0.95 + 0.35 * audioLevel;
    col *= mix(vec3(0.85, 0.9, 1.15), vec3(1.15, 1.0, 0.8), audioCentroid);
    if (hueP > 0.001) col = hueRot(col, hueP);

    vec3 _catTone = clamp(col, 0.0, 1.0) * 1.0;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
