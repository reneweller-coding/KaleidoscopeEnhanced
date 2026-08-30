#version 330 core
out vec4 fragColor;
/**
 * @file OctagrammicMirrorVault.frag
 * @brief OCTAGRAMMIC MIRROR VAULT: 8-pointed star ({8/3}-octagram) kinetic origami
 * mirror dome with opening/closing facet petals, central infinite light funnel,
 * and high-velocity kaleidoscopic ray reflections.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous star facet folding & vault rotation
 *   audioKick    -> explodes star facet apertures & flashes central light funnel
 *   audioCentroid-> modulates star point sharpness & facet ribbing
 *   audioSubBass -> expands origami dome breathing aperture
 *   audioChromaHue-> rotates the luminous star polygon palette
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
uniform float foldP;
uniform float depthP;
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

// 2D 8-Pointed star polygon SDF
float sdOctagram(vec2 p, float r, float m) {
    // 8-Fold symmetry
    float a = atan(p.y, p.x);
    float l = length(p);
    float seg = 3.14159265 / 4.0;
    a = mod(a + seg * 0.5, seg) - seg * 0.5;
    a = abs(a);
    vec2 q = vec2(cos(a), sin(a)) * l;

    // Star point facet lines
    vec2 n = normalize(vec2(m, 1.0));
    return dot(q - vec2(r, 0.0), n);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float fld = (foldP > 0.01) ? foldP : 1.0;
    float dpth = (depthP > 0.01) ? depthP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.192 * spd + audioAdvance * 0.192 * spd;
    // Zeit-Basis + Musik-Schub: audioAdvance ALLEIN steht bei ruhiger
    // Musik still (die gemeldete "wirkt wie ein Bild"-Klasse).

    // Dome rotation & breathing
    float rotA = t * 0.2 + audioPhase * 0.1;
    float cs = cos(rotA), sn = sin(rotA);
    vec2 p = mat2(cs, -sn, sn, cs) * uv;

    vec3 colAcc = vec3(0.0);
    float totalWeight = 0.0;

    // Accumulate across 5 nested star polygon vault shells
    for (int k = 0; k < 5; k++) {
        float kf = float(k);
        // Sub-bass breathes the whole shell stack open: starScale is the
        // octagram's circumradius, i.e. the dome's aperture.
        float starScale = (0.5 + kf * 0.45) * dpth * (1.0 + 0.15 * sin(audioSwell * 2.5 + kf)) * (1.0 + 0.32 * audioSubBass);

        // Facet fold sharpness
        float mSharp = (0.7 + 0.3 * sin(t * 0.5 + kf) + 0.2 * audioFlux) * fld;
        float dStar = sdOctagram(p, starScale, mSharp);

        float edgeGlow = exp(-abs(dStar) * (25.0 + 12.0 * audioCentroid)) * glw;

        // Sample texture mapped on star facet coordinate
        vec2 sampleUV = fract(p * (0.4 + kf * 0.1) + 0.5);
        vec3 texCol = img(sampleUV);
        vec3 palCol = imgPalette(kf * 0.2 + t * 0.05);

        vec3 starCol = mix(texCol, palCol, 0.5);
        starCol += vec3(1.4, 1.1, 1.7) * edgeGlow * (1.0 + 2.5 * audioKick);

        float w = 1.0 / (1.0 + kf * 0.4);
        colAcc += starCol * w;
        totalWeight += w;
    }

    vec3 finalCol = colAcc / max(0.001, totalWeight);

    // Central infinite light funnel flare
    float rCenter = length(uv);
    float funnelBloom = exp(-rCenter * 6.0) * (1.2 + 2.5 * audioKick);
    finalCol += imgPalette(0.8) * funnelBloom;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
