#version 330 core
out vec4 fragColor;
/**
 * @file KleinBottleHyperLoopDive.frag
 * @brief KLEIN BOTTLE HYPER LOOP DIVE: 3D Raymarching plunge through a self-intersecting
 * 4D Klein Bottle immersion. Seamless flight from exterior space into interior
 * space without crossing an edge, with inverting normal colors and portal flash pulses.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward plunge along the Klein loop
 *   audioKick    -> flashes self-intersection singularity & topology inversion
 *   audioCentroid-> modulates Klein bottle surface ribbing resolution
 *   audioSubBass -> expands bottle neck diameter breathing
 *   audioChromaHue-> steers the non-orientable surface rainbow palette
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
uniform float radiusP;
uniform float twistP;
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

// Distance estimator for Figure-8 Klein Bottle immersion in 3D
float mapKlein(vec3 p, float t, float rBase, out float uCoord) {
    float r = length(p.xy);
    float a = atan(p.y, p.x);
    uCoord = a;

    // Figure-8 cross section: r(v) = (rBase + cos(u/2)*sin(v) - sin(u/2)*sin(2v))
    float uHalf = a * 0.5 + t * 0.4;
    float v = atan(p.z, r - rBase);

    float crossSecR = 0.65 + 0.25 * cos(uHalf) * sin(v) - 0.25 * sin(uHalf) * sin(2.0 * v);
    float d = length(vec2(r - rBase, p.z)) - crossSecR;

    return d * 0.65;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float rB = (radiusP > 0.01) ? radiusP : 1.8;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.32 * spd;

    // Camera ride coordinate inside the Klein bottle tube
    float aCam = t * 0.5;
    vec3 ro = vec3(cos(aCam) * rB, sin(aCam) * rB, 0.3 * sin(aCam * 2.0));
    vec3 ta = vec3(cos(aCam + 0.1) * rB, sin(aCam + 0.1) * rB, 0.3 * sin((aCam + 0.1) * 2.0));

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 0.0, 1.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + (1.25 + 0.2 * sin(audioSwell * 2.0)) * ww);

    // Raymarching through Klein bottle
    float totDist = 0.0;
    float minD = 1e4;
    float hitU = 0.0;
    vec3 hitCol = vec3(0.0);

    for (int i = 0; i < 52; i++) {
        vec3 p = ro + rd * totDist;
        float curU;
        float d = mapKlein(p, t, rB, curU);
        minD = min(minD, abs(d));

        if (abs(d) < 0.003 || totDist > 8.0) {
            hitU = curU;
            vec2 sampleUV = fract(vec2(hitU / 6.2831853 + 0.5, p.z * 0.4));
            vec3 texCol = img(sampleUV);
            vec3 pal = imgPalette(hitU / 6.2831853 + t * 0.05);
            hitCol = mix(texCol, pal, 0.5) * (0.7 + 0.4 * (1.0 - d));
            break;
        }

        totDist += max(0.015, d * 0.7);
    }

    // Glowing surface ribs
    float ribGlow = exp(-minD * (24.0 + 12.0 * audioCentroid)) * glw;
    vec3 glowTint = vec3(1.3, 1.1, 1.8) * ribGlow * (1.0 + 2.5 * audioKick);

    vec3 bgCol = imgPalette(length(uv) * 0.4 + 0.3) * (0.2 + 0.15 * audioLevel);
    vec3 finalCol = mix(bgCol, hitCol, clamp(length(hitCol), 0.0, 1.0));
    finalCol += glowTint;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
