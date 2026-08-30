#version 330 core
out vec4 fragColor;
/**
 * @file VoronoiPrismShatterKaleido.frag
 * @brief VORONOI PRISM SHATTER KALEIDO: Dynamic Voronoi crystal cell shatter matrix
 * with tilting diamond facets, chromatic refraction dispersion, 8-fold kaleidoscopic
 * symmetry, and explosive fragment displacement shockwaves.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous Voronoi crystal cell motion & facet rotation
 *   audioKick    -> explodes crystal cell shockwaves & flashes diamond edge facets
 *   audioCentroid-> modulates Voronoi cell density & dispersion sharpness
 *   audioSubBass -> expands crystal cell breathing displacement
 *   audioChromaHue-> rotates the prismatic diamond rainbow palette
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
uniform float cellDensityP;
uniform float shatterP;
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

// 2D Voronoi evaluation returning (minDist, cellID, borderDist)
vec4 voronoi(vec2 p, float t) {
    vec2 n = floor(p);
    vec2 f = fract(p);

    vec2 mg, mr;
    float md = 8.0;
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = sin(n + g + vec2(t * 0.4, t * 0.5)) * 0.4 + 0.5;
            vec2 r = g + o - f;
            float d = dot(r, r);

            if (d < md) {
                md = d;
                mr = r;
                mg = g;
            }
        }
    }

    // Border distance calculation
    float mdb = 8.0;
    for (int j = -2; j <= 2; j++) {
        for (int i = -2; i <= 2; i++) {
            vec2 g = mg + vec2(float(i), float(j));
            vec2 o = sin(n + g + vec2(t * 0.4, t * 0.5)) * 0.4 + 0.5;
            vec2 r = g + o - f;

            if (dot(mr - r, mr - r) > 0.00001) {
                mdb = min(mdb, dot(0.5 * (mr + r), normalize(r - mr)));
            }
        }
    }

    return vec4(sqrt(md), n + mg, mdb);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float cDens = (cellDensityP > 0.01) ? cellDensityP : 1.0;
    float shtr = (shatterP > 0.01) ? shatterP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.192 * spd + audioAdvance * 0.192 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // 8-Fold radial kaleidoscope symmetry
    float a = atan(uv.y, uv.x);
    float r = length(uv);
    float seg = 3.14159265 / 4.0;
    a = mod(a + seg * 0.5, seg) - seg * 0.5;
    a = abs(a);
    vec2 pFold = vec2(cos(a), sin(a)) * r;

    // Voronoi cell coordinates
    vec2 pVor = pFold * (6.0 * cDens);

    // Shatter displacement shockwave on kicks, plus a slow sub-bass swell that
    // pushes the cells outward along the same radial axis -- the crystal
    // breathes apart on drones between the sharp kick bursts.
    vec2 shatterOffset = (pFold / max(0.1, r)) * ((audioKick * 0.4 + 0.35 * audioSubBass) * shtr);
    pVor += shatterOffset;

    vec4 vInfo = voronoi(pVor, t);
    float dCenter = vInfo.x;
    vec2 cellID = vInfo.yz;
    float dBorder = vInfo.w;

    // Diamond crystal facet normal tilt
    vec3 facetNormal = normalize(vec3(cos(cellID.x * 12.3 + t), sin(cellID.y * 14.5 - t), 1.2));

    // Chromatic dispersion refraction on cell facet
    float dLambda = 0.015 * (1.0 + audioCentroid);
    vec2 uvR = fract(pFold * 0.4 + facetNormal.xy * (0.08 - dLambda) + 0.5);
    vec2 uvG = fract(pFold * 0.4 + facetNormal.xy * 0.08 + 0.5);
    vec2 uvB = fract(pFold * 0.4 + facetNormal.xy * (0.08 + dLambda) + 0.5);

    vec3 texR = img(uvR);
    vec3 texG = img(uvG);
    vec3 texB = img(uvB);
    vec3 texPrism = vec3(texR.r, texG.g, texB.b);

    // Glowing Voronoi facet borders
    float borderGlow = exp(-dBorder * (30.0 + 15.0 * audioCentroid)) * glw;
    float facetSpark = pow(max(0.0, dot(facetNormal, normalize(vec3(1.0, 1.0, 2.0)))), 24.0);

    // Palette mixing per cell ID
    vec3 palCol = imgPalette(sin(dot(cellID, vec2(12.9898, 78.233))) * 0.5 + 0.5);
    vec3 cellCol = mix(texPrism, palCol, 0.45);

    // Add glowing border struts & diamond sparks
    vec3 borderTint = vec3(1.4, 1.1, 1.8) * borderGlow * (1.0 + 3.0 * audioKick);
    cellCol += borderTint + vec3(1.5, 1.5, 1.8) * facetSpark * (1.0 + 2.0 * audioKick);

    cellCol = pow(cellCol, vec3(0.88));
    fragColor = vec4(clamp(cellCol, 0.0, 1.0), 1.0);
}
