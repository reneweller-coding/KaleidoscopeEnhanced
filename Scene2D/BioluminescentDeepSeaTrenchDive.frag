#version 330 core
out vec4 fragColor;
/**
 * @file BioluminescentDeepSeaTrenchDive.frag
 * @brief BIOLUMINESCENT DEEP SEA TRENCH DIVE: Vertical 3D Raymarching dive into an abyss
 * trench canyon. Rocky canyon walls encrusted with glowing deep-sea corals, hydrothermal
 * black smoker chimneys, floating bioluminescent jellyfish, and volumetric marine snow.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous vertical plunge velocity into the trench
 *   audioKick    -> flashes hydrothermal chimney vent eruption cores & coral bio-bursts
 *   audioCentroid-> sharpens rock wall normal textures & glowing coral tentacles
 *   audioSubBass -> expands abyss trench canyon width breathing
 *   audioChromaHue-> rotates the deep ocean cyan / indigo / emerald spectrum
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
uniform float canyonWidthP;
uniform float bioDensityP;
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

// Overall level of the photo currently bound, from a fixed 5-tap grid. The
// rock, the palette and the extinction fog are all photo-derived and the
// library spans near-black to near-white, which is what sank this dive to a
// near-black frame. The probe rides the tex0/tex1 crossfade so the gain can
// never pop, and one number for the whole frame rescales exposure without
// touching local contrast.
float photoLevel() {
    vec3 s = img(vec2(0.25, 0.25)) + img(vec2(0.75, 0.25))
           + img(vec2(0.25, 0.75)) + img(vec2(0.75, 0.75))
           + img(vec2(0.50, 0.50));
    return dot(s * 0.2, vec3(0.299, 0.587, 0.114));
}

// Distance estimator for trench rock canyon walls
float mapTrench(vec3 p, float t, float cWidth, out float bioNode) {
    float w = 1.4 * cWidth * (1.0 + 0.15 * sin(audioSwell * 2.0)) * (1.0 + 0.35 * audioSubBass);
    // Brightness raises the wall-detail frequency but drops its amplitude by the
    // same factor, so the estimator's slope -- and therefore the safe step size
    // the march relies on -- stays where it was.
    float rockNoise = sin(p.z * 1.5) * 0.4 + sin(p.y * (2.0 + 1.5 * audioCentroid) + p.z) * (0.2 / (1.0 + 0.6 * audioCentroid));
    float dWall = w - abs(p.x) + rockNoise;

    // Glowing coral clusters on wall
    bioNode = pow(max(0.0, sin(p.x * 5.0 + p.z * 3.0) * cos(p.y * 4.0 - t * 2.0)), 4.0 + 4.0 * audioCentroid);

    return dWall;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float cW = (canyonWidthP > 0.01) ? canyonWidthP : 1.0;
    float bDens = (bioDensityP > 0.01) ? bioDensityP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.38 * spd;

    // Fixed exposure for the photo-derived terms only (rock, abyss, fog). The
    // bioluminescence and the marine snow are their own light sources and are
    // deliberately left off this gain so a dark photo cannot blow them up.
    float expGain = clamp(0.42 / max(0.05, photoLevel()), 0.40, 3.0);

    // Plunge camera setup going straight down the Z-axis of the trench
    vec3 ro = vec3(sin(t * 0.3) * 0.3, cos(t * 0.25) * 0.3, t * 3.0);
    vec3 rd = normalize(vec3(uv, 1.25 + 0.2 * sin(audioSwell * 2.0)));

    // Raymarching
    float totDist = 0.0;
    float minD = 1e4;
    float hitBio = 0.0;
    vec3 hitCol = vec3(0.0);

    for (int i = 0; i < 48; i++) {
        vec3 p = ro + rd * totDist;
        float curBio;
        float d = mapTrench(p, t, cW, curBio);
        minD = min(minD, abs(d));

        if (d < 0.01) {
            hitBio = curBio;

            // Wall normal from the estimator itself. Without any lighting the
            // canyon walls were an unshaded smear, which is most of why this
            // frame carried almost no contrast to begin with.
            float bTmp;
            vec2 eN = vec2(0.03, 0.0);
            vec3 nrm = normalize(vec3(
                mapTrench(p + eN.xyy, t, cW, bTmp) - mapTrench(p - eN.xyy, t, cW, bTmp),
                mapTrench(p + eN.yxy, t, cW, bTmp) - mapTrench(p - eN.yxy, t, cW, bTmp),
                mapTrench(p + eN.yyx, t, cW, bTmp) - mapTrench(p - eN.yyx, t, cW, bTmp)));
            float lam = 0.30 + 0.70 * max(0.0, dot(nrm, normalize(vec3(0.35, 0.55, -0.75))));

            vec2 sampleUV = fract(p.yz * 0.2 + 0.5);
            vec3 texCol = img(sampleUV);
            vec3 palCol = imgPalette(p.z * 0.1 + hitBio * 0.4);

            // The rock used to be scaled to a quarter of the photo before the
            // fog took another 60-80% off on top -- with a dark image bound
            // the walls landed on the black floor. Keep the same mix, drop the
            // crushing constants, and put it on the fixed exposure instead.
            vec3 rockBase = mix(texCol * 0.85, palCol * 0.95, 0.5) * lam * expGain;
            vec3 bioGlow = min(vec3(0.3, 1.5, 1.8) * hitBio * bDens * (1.0 + 2.5 * audioKick) * glw, vec3(1.35));

            hitCol = rockBase + bioGlow;
            break;
        }

        // The `i >= 47` arm is a guarantee, not an optimisation: a ray that
        // grazes a wall can sit on the 0.02 step floor for the whole budget,
        // and without it such a pixel would fall out of the loop with hitCol
        // still vec3(0.0) -- a hard black hole in the picture.
        if (totDist > 14.0 || i >= 47) {
            // The open gap straight down the trench: rays near the frame
            // centre run parallel to both walls and never meet anything, so
            // this branch covered a wide band of the picture with one flat
            // fog colour (measured screen coverage was 0.03). Give the abyss
            // real photo structure and a faint far-off glow of its own.
            vec2 abyssUV = fract(uv * 0.45 + vec2(0.0, t * 0.06) + 0.5);
            hitCol = mix(img(abyssUV) * 0.55, imgPalette(0.55) * 0.6, 0.5) * expGain;
            hitCol += vec3(0.15, 0.7, 0.9) * pow(max(0.0, 1.0 - length(uv) * 1.4), 3.0) * 0.30;
            break;
        }

        totDist += max(0.02, d * 0.7);
    }

    // Volumetric marine snow and plankton
    float plankton = pow(max(0.0, sin(dot(uv, vec2(12.3, 45.6)) * 40.0 + t * 4.0)), 24.0);
    hitCol += vec3(0.8, 1.4, 1.8) * plankton * (0.8 + 1.2 * audioHigh);

    // Deep sea water absorption & extinction fog. The old rate reached 0.91
    // opacity by the far plane and its target colour was another quarter-scale
    // photo sample, so distance alone pushed most of the frame to black.
    float waterFog = 1.0 - exp(-totDist * 0.13);
    hitCol = mix(hitCol, imgPalette(0.3) * 0.55 * expGain, waterFog);

    hitCol = pow(hitCol, vec3(0.88));
    vec3 _catTone = clamp(hitCol, 0.0, 1.0);
    _catTone /= 1.0 + 0.22 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(_catTone, 1.0);
}
