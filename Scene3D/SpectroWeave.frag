#version 330 core
out vec4 fragColor;
// SpectroWeave.frag — each strand carries its band's own colour, so the
// spectrum is legible as hue across the bundle while the loud bands are also
// the fat, bright ones.  Two independent cues for the same fact is what makes
// a data image readable rather than merely pretty.

in vec3  vWorld;
in vec3  vNormal;
in vec3  vView;
in float vEnergy;
in float vBand;      // 0..1 = strand band, -1 = dust mote
in float vDist;
in vec2  vQuad;      // dust mote's quad coordinate

/**
 * @file SpectroWeave.frag
 * @brief Shades a bundle of glowing tube strands, one per frequency band, so
 * the audio spectrum reads as a woven cable of light the camera flies past.
 *
 * Each strand's hue comes from its band (vBand, bass deep red through violet)
 * combined with audioChromaHue; its brightness and bloom scale with the
 * band's live energy (vEnergy), further pulsed by audioBeat, audioSubBass
 * and audioKick (over a floor, so a band that is silent this instant is still
 * visible geometry). audioHigh sharpens the specular highlight, audioAmbient
 * adds a flat fill, and audioValence controls how saturated the rotating
 * photo-arc palette (audioAdvance-driven, luminance-normalised) looks.
 * Distance fog (vDist) sinks the far end of the bundle toward the water-dark
 * background so depth reads correctly, without erasing it.
 *
 * vBand = -1 marks the second primitive family: the dust motes that hang far
 * behind the cable and keep the corners of the frame from being empty. They
 * take their hue from the same photo-arc palette, are lifted by audioAmbient
 * and pulsed by audioBeat/audioSubBass like everything else, and run their
 * own fade rather than the bundle's distance haze.
 */

uniform sampler2D tex0;
uniform float interpolation;
uniform float time;

uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioHigh;
uniform float audioSubBass;
uniform float audioChromaHue;
uniform float audioAmbient;

uniform float glowP;
uniform float thickP;
uniform sampler2D tex1;
uniform float audioAdvance;
uniform float audioValence;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
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
    pc = mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
    // LUMINANCE-NORMALISED.  Strand tint, dust and all: every lit thing in this
    // scene is this palette times a shading term, so an activation whose
    // sampling arc lands on a dark corner of the slideshow photo takes the
    // whole cable down with it.  Hue and saturation stay the photo's; only the
    // LEVEL is pinned.  The lift is capped, and a big lift is walked back
    // toward the colour's own grey -- multiplying a dark, strongly tinted pixel
    // up is exactly how a photo palette turns into a candy wash.
    float pl = max(dot(pc, vec3(0.2126, 0.7152, 0.0722)), 0.05);
    float k  = clamp(0.34 / pl, 0.25, 3.5);
    pc = clamp(pc * k, 0.0, 1.3);
    return mix(pc, vec3(dot(pc, vec3(0.2126, 0.7152, 0.0722))),
               clamp((k - 1.4) * 0.35, 0.0, 0.5));
}

vec3 hue2rgb(float h)
{
    return imgPalette(h) * 1.35;   // photo-arc palette (house standard), was HSV rainbow
}

void main()
{
    if (vBand < -0.5)
    {
        // ---- DUST ------------------------------------------------------
        // A soft round mote.  This pass is drawn OPAQUE and depth-tested
        // (geom="indirect"), so a nearly black fragment still writes depth and
        // would punch a hole in whatever is behind it -- hence the discard on
        // the faded rim rather than drawing it black.
        vec2  d = vQuad * 2.0 - 1.0;
        float a = exp(-dot(d, d) * 2.6);
        if (a < 0.10) discard;

        // Lifted ~1.4x (0.090/0.160 -> 0.126/0.224): the dust is the only thing
        // in the frame that does not depend on the spectrum, so it is what has
        // to hold the picture up through a quiet bar.
        vec3 dcol = hue2rgb(fract(0.55 + 0.25 * vEnergy)) * (0.126 + 0.224 * vEnergy)
                  * (0.75 + 0.5 * audioAmbient) * a;
        dcol *= 1.0 + 0.22 * audioBeat + 0.16 * audioSubBass;
        fragColor = vec4(min(dcol, vec3(1.0)), interpolation);
        return;
    }

    vec3 n = normalize(vNormal);
    vec3 V = normalize(vView);
    if (dot(n, V) < 0.0) n = -n;

    vec3 L = normalize(vec3(0.42, 0.66, -0.62));

    // Hue by band: bass deep red, treble through to violet.
    float hue = fract(0.00 + 0.72 * vBand + 0.06 * sin(audioChromaHue));
    vec3 tint = hue2rgb(hue);

    float diff = max(dot(n, L), 0.0);
    // 0.10 + 0.45*diff spanned only 0.10..0.55 -- barely three quarters of a
    // brightness bucket across a whole tube, so a strand had no lit side and no
    // dark side and the weave read as flat.  0.06 + 0.85*diff puts a real
    // terminator on every thread.
    vec3 col = tint * (0.06 + 0.85 * diff);

    // A tube's core-and-halo: brightest where it faces the eye.
    float face = clamp(dot(n, V), 0.0, 1.0);
    float core = pow(face, 1.8);

    // A floor under the emissive term.  A band that is silent this instant
    // still has to be VISIBLE geometry -- without the floor the far half of the
    // bundle went to the haze colour and the scene measured luma 0.040.  The
    // swell with loudness is untouched, so a loud band is still the fat, bright
    // one.
    float e = clamp(0.16 + vEnergy * 1.35, 0.0, 1.45);
    col += tint * e * (1.4 + 2.6 * glowP) * (0.35 + 0.9 * core);
    col += vec3(1.0) * pow(core, 7.0) * e * 0.65;

    vec3 H = normalize(L + V);
    col += vec3(1.0, 0.97, 0.9) * pow(max(dot(n, H), 0.0), 60.0)
         * (0.4 + 1.8 * audioHigh);

    col += tint * 0.10 * audioAmbient;

    // Haze down the bundle so the far end recedes instead of piling up.  At
    // 0.9 the far half of the cable was 90 % fog colour -- depth cue turned
    // into an eraser, on top of strands that were sub-pixel out there anyway.
    // 0.60 still recedes and still leaves something to see.
    float haze = clamp(vDist / 150.0, 0.0, 1.0);
    col = mix(col, vec3(0.02, 0.025, 0.05), pow(haze, 1.5) * 0.60);

    col *= 1.0 + 0.22 * audioBeat + 0.16 * audioSubBass + 0.15 * audioKick;
    col = col / (1.0 + col * 0.24);
    fragColor = vec4(col, interpolation);
}
