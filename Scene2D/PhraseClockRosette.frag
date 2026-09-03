#version 330 core
out vec4 fragColor;
/**
 * @file PhraseClockRosette.frag
 * @brief PHRASE CLOCK ROSETTE: a 32-beat rosette that shows WHERE in the
 * 8-bar phrase the music is.  The host integrates beats from the tempo
 * since the last drop (audioPhrasePos, 0..1 over 32 beats): a hand sweeps
 * the rosette, the 32 petals fill behind it, and the build-up tightens the
 * whole flower toward its centre -- until the phrase boundary, where dance
 * music puts its drops, when it blooms open.  For the first time a scene
 * counts DOWN to the drop instead of only reacting to it.
 *
 * Audio Reactivity:
 *   audioPhrasePos   -> the hand and the filled petals
 *   audioPhraseLeft  -> tension toward the boundary (petals close in)
 *   audioBuildUp     -> the flower contracts and heats up
 *   audioDrop        -> bloom (petals spring open, a shockwave ring)
 *   audioBeatPhase   -> the innermost ring ticks every beat
 *   audioKick        -> petal tips flash
 *
 * Per-activation variety: petalP (petal length), spinP (rosette turn), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioPhrasePos;
uniform float audioPhraseLeft;
uniform float audioBuildUp;
uniform float audioDrop;
uniform float audioBeatPhase;
uniform float audioKick;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioValence;

uniform float petalP;
uniform float spinP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float pet  = (petalP > 0.05) ? petalP : 1.0;
    float spin = (spinP > 0.001) ? spinP : 0.1;
    float hue  = (hueP > 0.001) ? hueP : 0.0;

    // Tension: seconds to the boundary, mapped to 0 (far) .. 1 (imminent).
    float left = (audioPhraseLeft > 0.01) ? audioPhraseLeft : 15.0;
    float tension = clamp(1.0 - left / 15.0, 0.0, 1.0) * (0.4 + 0.6 * audioBuildUp);
    // The drop blooms the flower open and sends a ring outward.
    float bloom = audioDrop;

    float r = length(p);
    float a = atan(p.y, p.x) + sceneAdvance * spin;

    // 32 petals, one per beat of the phrase.  The hand is the phrase
    // position; petals behind it are filled, ahead of it are outlines.
    float petalAng = fract(a * 0.15915494 + 0.25);         // 0..1 around
    float beatIdx  = petalAng * 32.0;
    float filled   = step(beatIdx, audioPhrasePos * 32.0);
    float hand     = exp(-abs(petalAng - audioPhrasePos) * 60.0)
                   + exp(-abs(petalAng - audioPhrasePos + 1.0) * 60.0);

    // Petal shape in polar space: a lobe per beat.
    float lobe = 0.5 + 0.5 * cos(fract(beatIdx) * 6.2831853);
    float inner = 0.16;                                  // the drop is light, not scale (V7d)
    float outerBase = (0.42 + 0.22 * lobe) * pet;
    float outer = mix(outerBase, outerBase * 0.55, tension);
    float inPetal = smoothstep(inner - 0.01, inner + 0.01, r) * (1.0 - smoothstep(outer - 0.01, outer + 0.01, r));
    float edge = exp(-abs(r - outer) * 90.0) + exp(-abs(r - inner) * 90.0);

    // Bar rings: 8 faint rings mark the bars, the innermost ticks per beat.
    float barRing = 0.0;
    for (int b = 1; b <= 8; ++b)
        barRing += exp(-abs(r - inner - (outer - inner) * float(b) / 8.0) * 120.0) * 0.3;
    float tick = exp(-abs(r - inner * 0.8) * 80.0) * (0.5 + 0.5 * cos(audioBeatPhase * 6.2831853));

    // Colour: filled petals in the palette, heating with the tension.
    vec3 petalCol = imgPalette(hue * 0.159 + petalAng * 0.5);
    vec3 hot      = imgPalette(hue * 0.159 + 0.9) * 1.4;
    vec3 fillCol  = mix(petalCol, hot, tension * 0.8);
    vec3 col = fillCol * inPetal * (0.35 + 0.8 * filled) * (0.8 + 0.5 * audioLevel);
    col += imgPalette(hue * 0.159 + 0.6) * edge * 0.5;
    col += imgPalette(hue * 0.159 + 0.2) * (barRing + tick) * 0.6;
    col += hot * hand * inPetal * 1.2;

    // Kick: petal tips flash.
    col += hot * exp(-abs(r - outer) * 40.0) * audioKick * 0.6;

    // Drop shockwave ring racing outward.
    float wave = exp(-abs(r - (0.3 + 1.2 * (1.0 - bloom))) * 30.0) * bloom;
    col += hot * wave * 1.5;

    // Background: the photo, dim and desaturated, turning slowly.
    float ca = cos(sceneAdvance * 0.03), sa = sin(sceneAdvance * 0.03);
    vec2 bp = vec2(ca * p.x - sa * p.y, sa * p.x + ca * p.y) * 0.5 + 0.5;
    vec3 bg = img(clamp(bp, 0.0, 1.0));
    bg = mix(vec3(dot(bg, vec3(0.333))), bg, 0.4) * (0.10 + 0.10 * audioSwell);
    col += bg * (1.0 - inPetal * 0.8);

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
