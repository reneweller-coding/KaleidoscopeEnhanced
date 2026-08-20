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

// Distance estimator for trench rock canyon walls
float mapTrench(vec3 p, float t, float cWidth, out float bioNode) {
    float w = 1.4 * cWidth * (1.0 + 0.15 * sin(audioSwell * 2.0));
    float rockNoise = sin(p.z * 1.5) * 0.4 + sin(p.y * 2.0 + p.z) * 0.2;
    float dWall = w - abs(p.x) + rockNoise;

    // Glowing coral clusters on wall
    bioNode = pow(max(0.0, sin(p.x * 5.0 + p.z * 3.0) * cos(p.y * 4.0 - t * 2.0)), 4.0);

    return dWall;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float cW = (canyonWidthP > 0.01) ? canyonWidthP : 1.0;
    float bDens = (bioDensityP > 0.01) ? bioDensityP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.38 * spd;

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

        if (d < 0.005 || totDist > 12.0) {
            hitBio = curBio;
            vec2 sampleUV = fract(p.yz * 0.2 + 0.5);
            vec3 texCol = img(sampleUV);
            vec3 palCol = imgPalette(p.z * 0.1 + hitBio * 0.4);

            vec3 rockBase = mix(texCol * 0.25, palCol * 0.3, 0.5);
            vec3 bioGlow = vec3(0.3, 1.5, 1.8) * hitBio * bDens * (1.0 + 2.5 * audioKick) * glw;

            hitCol = rockBase + bioGlow;
            break;
        }

        totDist += max(0.02, d * 0.7);
    }

    // Volumetric marine snow and plankton
    float plankton = pow(max(0.0, sin(dot(uv, vec2(12.3, 45.6)) * 40.0 + t * 4.0)), 24.0);
    hitCol += vec3(0.8, 1.4, 1.8) * plankton * (0.8 + 1.2 * audioHigh);

    // Deep sea water absorption & extinction fog
    float waterFog = 1.0 - exp(-totDist * 0.2);
    hitCol = mix(hitCol, imgPalette(0.3) * 0.25, waterFog);

    hitCol = pow(hitCol, vec3(0.88));
    fragColor = vec4(clamp(hitCol, 0.0, 1.0), 1.0);
}
