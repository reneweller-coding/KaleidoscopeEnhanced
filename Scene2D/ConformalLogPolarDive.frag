#version 330 core
out vec4 fragColor;
/**
 * @file ConformalLogPolarDive.frag
 * @brief CONFORMAL LOG POLAR DIVE: Complex exponential mapping w = exp(z) transforming
 * the Cartesian image plane into infinite swirling twin galactic spiral arms with
 * seamless multi-octave zoom blending and high-energy chromatic distortion.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous exponential spiral plunge trajectory
 *   audioKick    -> flashes spiral galaxy core & shoots centrifugal ripple waves
 *   audioCentroid-> modulates logarithmic spiral twist angle
 *   audioSubBass -> expands spiral arm width breathing
 *   audioChromaHue-> rotates the conformal galaxy rainbow palette
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

// Per-activation variety
uniform float speedP;
uniform float spiralP;
uniform float armsP;
uniform float glowP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t) {
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853 + hueP;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

// Overall level of the photo currently on the texture units, from a fixed
// 5-tap grid. The conformal map paints the photo straight onto the spiral, so
// a bright photo left the arm filaments and the core bloom no headroom at all.
// The probe rides the tex0/tex1 crossfade, so the gain it feeds can never pop,
// and being one number for the whole frame it rescales exposure without
// touching local contrast.
float photoLevel() {
    vec3 s = img(vec2(0.25, 0.25)) + img(vec2(0.75, 0.25))
           + img(vec2(0.25, 0.75)) + img(vec2(0.75, 0.75))
           + img(vec2(0.50, 0.50));
    return dot(s * 0.2, vec3(0.299, 0.587, 0.114));
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float sprl = (spiralP > 0.01) ? spiralP : 1.0;
    // Ganzzahlig gerundet: ein nicht-ganzzahliges nArms reisst die
    // Winkel-Kachelung am Branch-Cut auf (zweite Quelle derselben Naht).
    float nArms = floor(((armsP > 1.0) ? armsP : 2.0) + 0.5);
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.210 * spd + audioAdvance * 0.210 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    float r = max(1e-5, length(uv));
    float a = atan(uv.y, uv.x);

    // Conformal log-polar transformation: w = ln(r) + i * theta
    float lnR = log(r);

    // Spiral winding as an INTEGER per-activation constant. The old
    // continuously-varying winding made the atan branch cut jump by a
    // non-integer amount through the fract() below -- the user-reported
    // discontinuous line down the left half of the frame. An integer number
    // of wraps passes through fract() invisibly.
    float wind = max(1.0, floor(1.2 * sprl + 0.5));

    // Log-polar coordinates with continuous forward translation along lnR and rotation along a
    vec2 logPolar = vec2(
        lnR * 0.6 - t * 0.8 + a * wind * 0.159155,
        a / 6.2831853 + t * 0.1
    );

    // Multi-octave blending
    float phase = fract(logPolar.x);
    vec3 colAcc = vec3(0.0);
    float weightAcc = 0.0;

    for (int k = -1; k <= 1; k++) {
        float f = phase + float(k);
        float w = exp(-4.0 * (f - 0.5) * (f - 0.5));

        vec2 sampleCoord = vec2(f * 2.0, logPolar.y * nArms);
        vec3 sampleCol = img(fract(sampleCoord));
        vec3 palCol = imgPalette(f * 0.3 + a / 6.2831853);

        colAcc += mix(sampleCol, palCol, 0.45) * w;
        weightAcc += w;
    }

    // Hold the galactic disc back to a fixed dark base: spiral arms only read
    // against dark inter-arm space, and with a bright photo the octave-blended
    // base alone already sat near 1.0.
    vec3 finalCol = colAcc / max(0.001, weightAcc);
    float expGain = clamp(0.27 / max(0.05, photoLevel()), 0.27, 2.4);
    finalCol *= expGain;

    // Glowing logarithmic spiral arm filaments
    float armDist = abs(sin(lnR * 4.0 - a * wind * nArms + t * 4.0));
    // Sub-bass drops the smoothstep edge, widening the band of armDist that
    // counts as "inside an arm" -- the arms breathe fatter. The divisor trades
    // peak intensity for that extra area so the widened arms don't clip.
    float armEdge = 0.85 - 0.22 * audioSubBass;
    float armGlow = smoothstep(armEdge, 1.0, armDist) * glw * (1.0 + 2.5 * audioKick) / (1.0 + 0.35 * audioSubBass);
    // The tint constant exceeds 1.0 on two channels, so the TINTED vector
    // carries the cap -- bounding only armGlow still let vec3(1.3,1.1,1.8) * it
    // run past white on every kick.
    finalCol += min(vec3(1.3, 1.1, 1.8) * armGlow * 0.7, vec3(0.85));

    // Center singularity core bloom. imgPalette() is a photo sample, so it
    // rides the same exposure gain as the base and is capped as well -- a
    // kick used to multiply a near-white palette by 3.7 right at the core.
    float centerBloom = exp(-r * 8.0) * (1.2 + 2.5 * audioKick);
    finalCol += min(imgPalette(0.85) * expGain * centerBloom, vec3(0.90));

    finalCol = pow(finalCol, vec3(0.88));
    vec3 _catTone = clamp(finalCol, 0.0, 1.0);
    _catTone /= 1.0 + 0.28 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
