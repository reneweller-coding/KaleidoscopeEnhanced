#version 330 core
out vec4 fragColor;
/**
 * @file DichroicPrismLaserField.frag
 * @brief DICHROIC PRISM LASER FIELD: Multi-angle floating dichroic glass prism plates
 * with polarized thin-film color splitting (Cyan/Yellow/Magenta), high-intensity
 * laser beam reflections, and luminous internal optical diffraction nodes.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous glass plate orbital rotation & laser tracking
 *   audioKick    -> flashes internal laser beam slicing bursts & plate transmissions
 *   audioCentroid-> sharpens polarized dichroic thin-film transmission bands
 *   audioSubBass -> expands prism plate breathing scale
 *   audioChromaHue-> steers the dichroic glass transmission spectrum
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
uniform float plateCountP;
uniform float polarizeP;
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

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float nPlates = (plateCountP > 1.0) ? plateCountP : 5.0;
    float pol = (polarizeP > 0.01) ? polarizeP : 1.2;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.32 * spd;

    vec3 colAcc = vec3(0.0);
    float totalWeight = 0.0;
    float laserAcc = 0.0;

    // Iterate across multiple tilted dichroic glass plates
    int numP = int(clamp(nPlates, 3.0, 6.0));
    for (int k = 0; k < 5; k++) {
        if (k >= numP) break;
        float kf = float(k);

        // Plate angle and rotation
        float plateAngle = t * 0.3 + kf * (6.2831853 / float(numP));
        float cs = cos(plateAngle), sn = sin(plateAngle);
        vec2 pPlate = mat2(cs, -sn, sn, cs) * uv;

        // Bounded rectangular glass plate SDF
        vec2 dBox = abs(pPlate) - vec2(0.7, 0.45 + 0.1 * sin(audioSwell * 2.0 + kf));
        float plateDist = max(dBox.x, dBox.y);

        // Dichroic thin-film transmission phase (wavelength-dependent interference)
        float filmPhase = (pPlate.x * 2.0 + pPlate.y * 1.5) * pol + t * 0.8 + kf * 0.7;
        vec3 dichroicColor = vec3(
            sin(filmPhase),
            sin(filmPhase + 2.094),
            sin(filmPhase + 4.188)
        ) * 0.5 + 0.5;

        // Laser beam slicing through plate
        float laserLine = abs(pPlate.y - 0.2 * sin(pPlate.x * 4.0 + t * 3.0));
        float laserGlow = exp(-laserLine * 25.0) * step(plateDist, 0.0);
        laserAcc += laserGlow * (1.0 + 3.0 * audioKick);

        // Glass plate edge bevel glow. The first pass capped the glow*kick
        // product to 1.0, but the 1.8-peak blue tint channel still turned
        // that "capped" value into 1.8 -- lower both the cap and the tint
        // constants so the final tinted term stays under 1.0.
        float edgeGlow = min(exp(-abs(plateDist) * (20.0 + 10.0 * audioCentroid)) * glw * (1.0 + 2.0 * audioKick), 0.5);

        // Sample texture mapped through the dichroic plate
        vec2 sampleUV = fract(pPlate * 0.4 + 0.5);
        vec3 texCol = img(sampleUV);
        vec3 palCol = imgPalette(kf * 0.2 + t * 0.05);

        vec3 plateCol = mix(texCol, palCol, 0.4) * dichroicColor;
        plateCol += vec3(0.9, 0.8, 1.2) * edgeGlow;

        float w = smoothstep(0.08, -0.05, plateDist);
        colAcc += plateCol * w;
        totalWeight += w;
    }

    vec3 finalCol = colAcc / max(0.001, totalWeight);

    // Add bright slicing laser beams. laserAcc sums UNWEIGHTED across up to
    // 5 overlapping rotated plates, each contributing up to ~4 on a strong
    // kick. The first pass capped the ACCUMULATOR to 1.4, but the 2.0-peak
    // tint channel still turned that into up to 2.8 per channel -- the
    // accumulator cap alone wasn't the fix, the tinted term needed its own
    // ceiling too. laserTint is also added across the whole frame wherever
    // ANY plate is lit (unlike plateCol it isn't weight-blended against the
    // background), which is why this read as an almost uniform pale wash
    // rather than isolated beams. Tighten the cap and lower the tint
    // constants.
    laserAcc = min(laserAcc, 0.6);
    vec3 laserTint = vec3(1.1, 1.0, 1.4) * laserAcc * glw;
    finalCol += laserTint;

    // Background optical dispersion
    vec3 bgCol = imgPalette(length(uv) * 0.4 + 0.3) * (0.2 + 0.15 * audioLevel);
    finalCol = mix(bgCol, finalCol, clamp(totalWeight, 0.0, 1.0));

    finalCol = pow(finalCol, vec3(0.88));
    vec3 _catTone = clamp(finalCol, 0.0, 1.0);
    _catTone /= 1.0 + 1.6 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
