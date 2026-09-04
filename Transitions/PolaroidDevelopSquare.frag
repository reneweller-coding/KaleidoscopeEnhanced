#version 330 core
out vec4 fragColor;
/**
 * @file PolaroidDevelopSquare.frag
 * @brief TRANSITION POLAROID DEVELOP SQUARE: the incoming scene arrives as an
 * integral print that clears from its edges inward and takes its dyes on in the
 * order the chemistry actually releases them.
 *
 * Two details carry the whole thing.  First the clearing runs from the border
 * inward, because the opacifier thins first where the sheet is thinnest -- a
 * uniform fade would look like an ordinary dissolve.  Second the dyes arrive
 * yellow, then magenta, then cyan, and a dye removes its own complementary
 * channel, so the picture passes through a warm, then a rosy stage before it
 * settles.  Ramping all three channels together would skip exactly the part
 * everybody recognises.
 *
 * The white border grows in at the start and runs off the frame at the end, so
 * the last frame is the incoming scene full bleed with nothing left over.
 *
 * Audio Reactivity:
 *   audioSwell   -> how soft the clearing front is (slow)
 *   audioValence -> how strong the early warm cast reads (colour)
 *   audioHigh    -> the gloss across the print's surface (light)
 *   audioKick    -> the light on the card (light)
 *
 * Per-activation variety: clearP, dyeP, hueP.
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

uniform float clearP;
uniform float dyeP;
uniform float hueP;

const float PI = 3.14159265358979;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main()
{
    float clr = (clearP > 0.0) ? clearP : 1.0;
    float dye = (dyeP   > 0.0) ? dyeP   : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p  = (uv - 0.5) * vec2(aspect, 1.0);

    float d = clamp(1.0 - interpolation, 0.0, 1.0);

    vec3 src0 = texture(tex0, uv).rgb;
    vec3 src1 = texture(tex1, uv).rgb;

    // The card: border in at the start, off the frame at the end, so nothing
    // of it survives into the last frame.
    float grow  = smoothstep(0.0, 0.14, d);
    float leave = 1.0 - smoothstep(0.80, 1.0, d);
    float bw    = 0.055 * grow * leave;                  // border width
    float tab   = bw * 2.6;                              // the wide bottom tab

    float halfW = aspect * 0.5, halfH = 0.5;
    // Distance INTO the image area, measured from its nearest edge.
    float dx = min(halfW - bw - abs(p.x), 0.0 + halfH - bw - p.y);
    float dyv = p.y + halfH - tab;
    float inset = min(dx, dyv);
    float area = smoothstep(-0.004, 0.004, inset);       // 1 inside the picture

    // Normalised depth into the picture, 0 at its edge, 1 deepest.
    float depth = clamp(inset / max(0.16 * clr, 0.04), 0.0, 1.0);

    // The opacifier clears from the border inward.
    float soft  = 0.10 + 0.16 * clamp(audioSwell, 0.0, 1.0);
    float front = (d * (1.0 + 2.0 * soft) - soft - 0.02) / 0.42;
    float cleared = smoothstep(front + soft, front - soft, depth);

    // The dyes, in the order they are released.  Each removes its own
    // complementary channel, so blue drops first, then green, then red.
    float pB = smoothstep(0.06, 0.40 * dye + 0.08, d);   // yellow dye
    float pG = smoothstep(0.14, 0.52 * dye + 0.12, d);   // magenta dye
    float pR = smoothstep(0.22, 0.64 * dye + 0.12, d);   // cyan dye

    // The opacifier is grey, not white: a near-white sheet across the whole
    // frame reads as a flash, which is exactly what this catalogue avoids.
    vec3 milk = vec3(0.44, 0.435, 0.43);
    vec3 dev  = vec3(mix(milk.r, src1.r, pR),
                     mix(milk.g, src1.g, pG),
                     mix(milk.b, src1.b, pB));
    // The early stage carries the warm cast the emulsion really has.
    float castAmt = (1.0 - pR) * (0.25 + 0.45 * clamp(audioValence, 0.0, 1.0));
    // hueP swings the early cast between the warm and the cold emulsion.
    vec3 castCol = mix(vec3(1.12, 1.02, 0.80), vec3(1.04, 0.98, 1.12), fract(hue * 0.159));
    dev = mix(dev, dev * castCol, castAmt);

    vec3 picture = mix(milk, dev, cleared);
    // Emulsion grain, strongest while the sheet is still milky.
    picture *= 0.95 + 0.10 * noise2(p * 420.0) * (1.0 - cleared * 0.7);

    // The card stock around the picture.
    vec3 card = vec3(0.74, 0.735, 0.72);
    card *= 0.97 + 0.05 * noise2(p * 120.0);
    card *= 1.0 + 0.10 * clamp(audioKick, 0.0, 1.0);

    vec3 print = mix(card, picture, area);
    // A gloss band across the whole print.
    float gloss = exp(-pow((p.x * 0.5 + p.y - 0.16) / 0.34, 2.0));
    print += vec3(1.0) * gloss * 0.05 * (0.4 + 1.2 * clamp(audioHigh * 2.0, 0.0, 1.0)) * grow * leave;

    // The card covers the outgoing scene, and at the end the picture is the
    // whole frame, so this lands exactly on the incoming scene.
    vec3 col = mix(src0, print, grow);
    col = mix(col, src1, smoothstep(0.94, 1.0, d));

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
