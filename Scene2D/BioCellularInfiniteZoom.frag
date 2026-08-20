#version 330 core
out vec4 fragColor;
/**
 * @file BioCellularInfiniteZoom.frag
 * @brief BIO CELLULAR INFINITE ZOOM: Continuous multi-scale infinite zoom dive
 * transitioning from cosmic spiral galaxies down to biological cellular organelles,
 * crystal lattices, and subatomic quantum foam in an endless self-similar loop.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous scale plunge across cosmic/biological scales
 *   audioKick    -> flashes cellular nucleus mitosis & quantum foam shockwave
 *   audioCentroid-> modulates organelle membrane ripple frequency
 *   audioSubBass -> drives deep cellular respiration breathing
 *   audioChromaHue-> steers the bio-luminescent scale transition palette
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
uniform float scaleP;
uniform float membraneP;
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

// Procedural cellular Voronoi / membrane noise
vec3 cellularNoise(vec2 p, float t) {
    vec2 ip = floor(p);
    vec2 fp = fract(p);
    float minDist = 1e4;
    vec2 minPt = vec2(0.0);

    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 randPt = sin(ip + neighbor + vec2(t * 0.3, t * 0.4)) * 0.4 + 0.5;
            vec2 diff = neighbor + randPt - fp;
            float d = dot(diff, diff);
            if (d < minDist) {
                minDist = d;
                minPt = neighbor + randPt;
            }
        }
    }
    return vec3(sqrt(minDist), minPt);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float memb = (membraneP > 0.01) ? membraneP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.32 * spd;

    // Logarithmic scale factor across 3 repeating major visual scales:
    // Scale 0: Cosmic Galaxy / Nebula
    // Scale 1: Biological Cell / Organelle
    // Scale 2: Quantum Foam / Crystal Lattice
    float logScale = mod(t * 0.5, 3.0);
    float scaleFrac = fract(logScale);
    int currentScale = int(floor(logScale));

    vec3 colAcc = vec3(0.0);
    float weightAcc = 0.0;

    for (int s = 0; s < 3; s++) {
        float sf = float(s);
        float relScale = mod(sf - logScale + 3.0, 3.0);
        float zoomFactor = exp(relScale * 2.2);

        // Blending weight between scales
        float w = smoothstep(0.0, 0.5, relScale) * smoothstep(3.0, 2.0, relScale);
        if (w <= 0.001) continue;

        vec2 pScale = uv * zoomFactor;

        // Swirling rotation per scale
        float rotA = t * 0.2 * (s % 2 == 0 ? 1.0 : -1.0) + length(pScale) * 0.1;
        float cs = cos(rotA), sn = sin(rotA);
        pScale = mat2(cs, -sn, sn, cs) * pScale;

        // Cellular membranes & organelle structure
        // Brightness drives the organelle lattice frequency (finer ripple),
        // sub-bass pushes the glowing membrane shell outward so the cells
        // visibly inflate and relax -- both are pure shape terms, so neither
        // can remap the accumulated swirl phase.
        vec3 cellInfo = cellularNoise(pScale * (1.5 + 0.6 * audioCentroid), t + sf);
        float dMemb = cellInfo.x;
        float membGlow = exp(-abs(dMemb - 0.45 * (1.0 + 0.3 * audioSubBass)) * 12.0 * memb) * glw;

        // Sample texture on cellular coordinate
        vec2 sampleUV = fract(pScale * 0.2 + cellInfo.yz * 0.1 + 0.5);
        vec3 texCol = img(sampleUV);
        vec3 palCol = imgPalette(sf * 0.33 + dMemb * 0.3);

        vec3 scaleCol = mix(texCol, palCol, 0.5);

        // Add glowing membrane walls & nucleus
        float nucleusGlow = exp(-length(pScale) * 3.5) * (1.0 + 2.0 * audioKick);
        scaleCol += vec3(1.2, 1.4, 1.8) * membGlow * (0.8 + 1.5 * audioKick);
        scaleCol += imgPalette(0.85) * nucleusGlow;

        colAcc += scaleCol * w;
        weightAcc += w;
    }

    vec3 finalCol = colAcc / max(0.001, weightAcc);

    // Respiration pulse
    finalCol *= (0.85 + 0.15 * sin(audioSwell * 3.0));
    finalCol = pow(finalCol, vec3(0.88));

    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
