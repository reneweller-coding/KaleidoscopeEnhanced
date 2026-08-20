#version 330 core
out vec4 fragColor;
/**
 * @file InterstellarNebulaWarpCruise.frag
 * @brief INTERSTELLAR NEBULA WARP CRUISE: Volumetric 3D FBM raymarching flight through
 * dense stellar nursery emission nebulae (Pillars of Creation) with self-luminous
 * protostellar cores, cosmic absorption dust lanes, and spectral gas clouds.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous forward cruising through the nebula clouds
 *   audioKick    -> flashes interior protostar fusion cores & gas ionization bursts
 *   audioCentroid-> sharpens volumetric dust lane turbulence resolution
 *   audioSubBass -> expands nebula density volume breathing
 *   audioChromaHue-> steers the ionized oxygen/hydrogen/sulfur spectral palette
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
uniform float densityP;
uniform float starsP;
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

// 3D Procedural FBM noise for volumetric nebula clouds
float fbm3D(vec3 p, float t) {
    float f = 0.0;
    float amp = 0.5;
    vec3 q = p + vec3(0.0, 0.0, t * 0.2);

    for (int i = 0; i < 4; i++) {
        f += amp * (sin(q.x) * cos(q.y) + sin(q.y) * cos(q.z) + sin(q.z) * cos(q.x));
        q = q * 2.05 + vec3(1.2, 3.4, 5.6);
        // Persistence, NOT lacunarity, carries the brightness: q already holds
        // the drift offset t*0.2, so an audio-varying lacunarity would rescale
        // that accumulated phase every frame. Holding more amplitude in the
        // upper octaves sharpens the dust-lane filigree the same way.
        amp *= 0.5 + 0.12 * audioCentroid;
    }
    return f;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float dens = (densityP > 0.01) ? densityP : 1.0;
    float strMod = (starsP > 0.01) ? starsP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = audioAdvance * 0.32 * spd;

    // Camera cruise position through cosmic gas cloud
    vec3 ro = vec3(sin(t * 0.3) * 0.6, cos(t * 0.25) * 0.4, t * 2.0);
    vec3 rd = normalize(vec3(uv, 1.2 + 0.2 * sin(audioSwell * 2.0)));

    vec3 colAcc = vec3(0.0);
    float transAcc = 1.0;
    float totDist = 0.0;

    // Volumetric raymarching loop
    for (int i = 0; i < 44; i++) {
        vec3 p = ro + rd * totDist;

        float gasNoise = fbm3D(p * 0.8, t);
        // Sub-bass swells the cloud volume; the same factor also feeds the
        // Beer-Lambert absorption below, so thicker gas self-shadows instead of
        // simply glowing brighter.
        float gasDensity = smoothstep(-0.2, 0.8, gasNoise) * (0.04 * dens + 0.03 * audioLevel) * (1.0 + 0.3 * audioSubBass);

        if (gasDensity > 0.001) {
            // Protostellar core sparkle inside dense regions
            float starSpark = pow(max(0.0, sin(dot(p, vec3(12.3, 45.6, 78.9)))), 32.0) * strMod;

            // Emission color gradient based on gas temperature
            vec3 palGas = imgPalette(gasNoise * 0.4 + p.z * 0.05);
            vec3 gasEmission = mix(vec3(0.2, 1.1, 1.6), vec3(1.8, 0.4, 0.9), clamp(gasNoise * 0.5 + 0.5, 0.0, 1.0));
            gasEmission = mix(gasEmission, palGas, 0.45);

            vec3 gasColor = gasEmission + vec3(1.8, 1.7, 1.2) * starSpark * (1.0 + 3.0 * audioKick) * glw;

            // Light integration with Beer-Lambert absorption
            colAcc += gasColor * gasDensity * transAcc * (1.0 + 2.0 * audioKick);
            transAcc *= (1.0 - gasDensity * 2.0);

            if (transAcc < 0.02) break;
        }

        totDist += 0.12;
    }

    // Background cosmic space texture
    vec2 skyUV = fract(uv * 0.3 + vec2(t * 0.02, 0.0));
    vec3 bgTex = img(skyUV);
    vec3 finalCol = bgTex * 0.25 * transAcc + colAcc;

    finalCol = pow(finalCol, vec3(0.88));
    fragColor = vec4(clamp(finalCol, 0.0, 1.0), 1.0);
}
