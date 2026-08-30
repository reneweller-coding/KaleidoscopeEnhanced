#version 330 core
out vec4 fragColor;
/**
 * @file OpticalDispersionCausticVault.frag
 * @brief OPTICAL DISPERSION CAUSTIC VAULT: High-resolution multi-wavelength
 * dispersive refraction caustics. Crystal chamber water wave interference
 * with full RGB spectral splitting, specular focal nodes, and luminous caustics.
 *
 * Audio Reactivity:
 *   audioAdvance -> drives continuous fluid caustic wave motion & focal shifts
 *   audioKick    -> flashes intense caustic focal nodes & chromatic shockwaves
 *   audioCentroid-> modulates wave frequency & caustic network filigree
 *   audioSubBass -> expands wave amplitude breathing
 *   audioChromaHue-> rotates the prismatic refractive spectrum
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
uniform float dispersionP;
uniform float waveScaleP;
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

// Dispersive water caustic wave intensity function for a given wavelength offset
float causticIntensity(vec2 p, float t, float wlOffset, float wScale) {
    vec2 pWarp = p * wScale;
    float tWarp = t + wlOffset;

    // Sum over 4 directional sinusoidal wave trains
    vec2 grad = vec2(0.0);
    for (int i = 0; i < 4; i++) {
        float a = float(i) * 0.785398 + tWarp * 0.1;
        vec2 dir = vec2(cos(a), sin(a));
        // Tonal brightness raises the SPATIAL wave number only (the tWarp*2.5
        // drift term is left alone, so the flow phase is never remapped):
        // bright material packs the interference into a finer caustic filigree.
        float phase = dot(pWarp, dir) * (4.0 * (1.0 + 0.45 * audioCentroid)) + tWarp * 2.5;
        grad += dir * cos(phase);
    }

    // Caustic focusing occurs where wave gradient is stationary (Jacobian
    // determinant peak). Near-perfect cancellation of the 4 wave trains
    // drives length(grad) down toward its 0.08 floor, sending jacobian up
    // to ~12.5 and pow(.,1.8) up past 90 -- an effectively unbounded spike
    // that was flooding whole caustic focal regions to solid white. Cap the
    // returned intensity so focal points stay bright highlights instead.
    float jacobian = 1.0 / max(0.08, length(grad));
    return min(pow(jacobian, 1.8), 3.0);
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / min(resolution.x, resolution.y);

    float spd = (speedP > 0.01) ? speedP : 1.0;
    float disp = (dispersionP > 0.01) ? dispersionP : 1.0;
    float wSc = (waveScaleP > 0.01) ? waveScaleP : 1.0;
    float glw = (glowP > 0.01) ? glowP : 1.0;

    float t = time * 0.35 * spd + audioAdvance * 0.28 * spd;   // Zeit-Basis:
    // audioAdvance allein steht bei ruhiger Musik still ("wirkt wie ein Bild").

    // Dispersive wavelength offsets for R, G, B channels
    float dLambda = (0.12 + 0.08 * audioFlux) * disp;
    float scale = (2.2 + 0.3 * sin(audioSwell * 2.0)) * wSc;

    // Sample chromatic caustic intensities separately for R, G, B
    float causticR = causticIntensity(uv, t, -dLambda, scale);
    float causticG = causticIntensity(uv, t, 0.0, scale);
    float causticB = causticIntensity(uv, t, dLambda, scale);

    vec3 causticRGB = vec3(causticR, causticG, causticB) * (0.12 + 0.18 * audioLevel);

    // Sample distorted background photo texture on the pool floor. This
    // refraction offset is the only place the water's wave AMPLITUDE is
    // visible, so sub-bass swells it here; scaling the wave trains inside
    // causticIntensity instead would fight the jacobian floor and just dim
    // the caustic web rather than making it heave.
    vec2 floorUV = fract(uv * 0.4 + causticRGB.xy * (0.05 * (1.0 + 0.9 * audioSubBass)) + 0.5);
    vec3 floorTex = img(floorUV);

    // Crystal vault ambient palette. This base mix alone sat close to the
    // tonemap ceiling across most of the frame, leaving no headroom for the
    // caustic highlights to read as highlights -- give it room to breathe.
    vec3 palBase = imgPalette(length(uv) * 0.3 + 0.2);
    vec3 col = mix(floorTex, palBase, 0.4) * 0.55;

    // Add glowing chromatic caustic webs (causticIntensity is capped above,
    // but the kick multiplier can still push it past 1.0 -- clamp the
    // applied term too, tighter than before since it still washed the frame).
    col += min(causticRGB * (1.0 + 3.0 * audioKick) * glw, vec3(0.7));

    // Specular wave glints -- the first pass capped the SCALAR to 1.0, but
    // the 1.6-peak tint channel still turned a "capped" glint into a value
    // above 1.0 per channel, the same class of bug as the neutron-star and
    // Clifford-torus files: cap the FINAL tinted vector, not just the
    // scalar feeding it.
    float totalCaustic = (causticR + causticG + causticB) * 0.3333;
    float specularGlint = pow(clamp(totalCaustic * 0.8, 0.0, 1.0), 4.0) * (1.0 + 3.0 * audioKick);
    col += min(vec3(1.0, 1.0, 1.15) * specularGlint, vec3(0.55));

    // Edge water vignette
    float vig = 1.0 - smoothstep(0.85, 1.4, length(uv));
    col *= vig;

    col = pow(col, vec3(0.88));
    vec3 _catTone = clamp(col, 0.0, 1.0);
    _catTone /= 1.0 + 1.3 * max(_catTone.r, max(_catTone.g, _catTone.b));
    _catTone = clamp((_catTone - 0.26) * 1.55 + 0.12, 0.0, 1.0);   // washed-out fix: contrast S-curve, darker fog floor
    // "Dispersion" without a rainbow is just fog: split the caustic
    // brightness into a spectral gradient across its own intensity.
    float _lum = dot(_catTone, vec3(0.299, 0.587, 0.114));
    float _sh = fract(_lum * 1.6 + 0.06);
    vec3 _spec = clamp(vec3(abs(_sh * 6.0 - 3.0) - 1.0,
                            2.0 - abs(_sh * 6.0 - 2.0),
                            2.0 - abs(_sh * 6.0 - 4.0)), 0.0, 1.0);
    _catTone = mix(_catTone, _spec * _lum * 1.35, 0.42);
    fragColor = vec4(_catTone, 1.0);
}
