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
 * photo (imgPalette) keeps the loop from decaying to black or drifting into meaningless mush.
 *   audioKick    -> brief extra zoom punch (bounded, not a runaway multiplier)
 *   audioBeat    -> rotation direction/speed swings
 *   audioSwell   -> injection strength breathes (louder passages feed in more fresh photo)
 *   audioChromaHue -> slow hue drift of the accumulated feedback
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
// instead of one that decays before it's ever seen.
uniform float decayP;      // feedback persistence (0 -> 0.997; 0.994..0.999)
uniform float injectP;     // fresh-photo injection strength (0 -> 0.05; 0.03..0.09)
uniform float hueP;

const float PI = 3.14159265358979;

vec3 img(vec2 uv) { return (interpolation * texture(tex0, uv)
                          + (1.0 - interpolation) * texture(tex1, uv)).rgb; }

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

vec2 kaleido(vec2 p, float sides)
{
    float a   = atan(p.y, p.x);
    float r   = length(p);
    float seg = PI / sides;
    a = mod(a + PI, 2.0 * seg) - seg;
    a = abs(a);
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
    vec2 folded = kaleido(c, sidesV);

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

    // Fresh injection: a little of the current photo, folded the SAME way as
    // the feedback so new material enters already symmetric, not as a flat
    // patch breaking the mandala.
    vec3 fresh = imgPalette(0.5 + 0.5 * length(folded)) * 1.6;
    float injectHere = injV * (0.7 + 0.5 * audioSwell);

    vec3 col = mix(prev * min(decayV, 0.999) * edge, fresh, injectHere);
    col *= 1.15 + 0.4 * audioLevel;
    col *= mix(vec3(0.85, 0.9, 1.15), vec3(1.15, 1.0, 0.8), audioCentroid);
    if (hueP > 0.001) col = hueRot(col, hueP);

    vec3 _catTone = clamp(col, 0.0, 1.0) * 1.0;
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
