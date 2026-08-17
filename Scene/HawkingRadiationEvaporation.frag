#version 330 core
out vec4 fragColor;
// HawkingRadiationEvaporation.frag
// -----------------------------------------------------------------------
// HAWKING RADIATION EVAPORATION: Micro-black hole event horizon displaying
// quantum tunneling evaporation. Virtual particle-antiparticle pairs separate
// at the horizon boundary, emitting thermal Hawking photons with extreme
// gravitational redshift, photon sphere light deflection, and photo mapping.
//   audioAdvance -> accelerates quantum horizon entanglement & particle flux
//   audioKick    -> triggers explosive micro-black hole evaporation bursts
//   audioSubBass -> pulses Schwarzschild radius & gravitational lens depth
//   audioChromaHue-> shifts Hawking thermal emission temperature spectrum
//
// Per-activation variety:
//   evapP    float Hawking radiation flux & burst intensity (0.5..2.2)
//   horizonP float Schwarzschild event horizon scale        (0.5..2.0)
//   speedP   float quantum tunneling phase velocity         (0.5..2.0)
//   hueP     float thermal radiation hue offset             (0..6.28)
// -----------------------------------------------------------------------

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

uniform float evapP;
uniform float horizonP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

mat2 rot2D(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

void main() {
    float evp = (evapP    > 0.0) ? evapP    : 1.0;
    float hrz = (horizonP > 0.0) ? horizonP : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.4 * spd + audioAdvance * 0.2;

    float r = length(uv);
    float angle = atan(uv.y, uv.x);

    // Event horizon radius: r_s
    float rSchwarzschild = (0.22 + 0.08 * sin(t * 0.7) + 0.1 * audioSubBass) * hrz;
    float rPhotonSphere = rSchwarzschild * 1.5;

    // Relativistic gravitational light deflection: theta = r - r_s^2 / r
    float deflection = (rSchwarzschild * rSchwarzschild) / max(r * r, 0.001);
    vec2 deflUV = uv * (1.0 - deflection * 0.6);
    deflUV = rot2D(deflection * 1.5 + t * 0.2) * deflUV;

    vec2 photoUV = fract((deflUV * resolution.y + 0.5 * resolution) / resolution);
    vec3 photo = img(photoUV);

    // Quantum Hawking radiation particles streaming outwards: r > r_s
    float particleWaves = sin(r * 45.0 - t * 12.0 + angle * 4.0);
    float particleSparks = pow(max(0.0, sin(r * 80.0 - t * 18.0 + angle * 8.0)), 6.0);
    float hawkingFlux = exp(-abs(r - rSchwarzschild) * 8.0) * (particleWaves * 0.5 + 0.5) * evp;

    // Explosive gamma-ray burst on kick
    float evaporationBurst = exp(-r * 6.0) * (audioKick * 4.0 * evp + audioHigh * 1.5);

    // Blackbody thermal Hawking radiation spectrum: T ~ 1 / M
    vec3 thermalHawking = mix(vec3(1.0, 0.3, 0.05), vec3(0.3, 0.85, 1.0), clamp(hawkingFlux * 1.5, 0.0, 1.0));
    thermalHawking = mix(thermalHawking, vec3(1.0, 0.98, 0.9), evaporationBurst * 0.5);

    // Event horizon core shadow
    float shadow = smoothstep(rSchwarzschild * 0.7, rSchwarzschild * 1.1, r);

    // Photon sphere bright ring
    float photonRing = exp(-abs(r - rPhotonSphere) * 35.0) * (1.2 + audioKick * 2.5);

    // Combine visualizer
    vec3 col = photo * (0.8 + 0.3 * audioLevel) * shadow;
    col += hawkingFlux * thermalHawking * (1.2 + audioSwell * 0.8);
    col += particleSparks * vec3(1.0, 0.9, 0.6) * 1.5 * shadow;
    col += photonRing * vec3(0.4, 0.9, 1.0) * 1.5;
    col += evaporationBurst * vec3(1.0, 0.98, 0.92) * 2.0;

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    // Vignette
    float vig = smoothstep(1.35, 0.35, r);
    col *= vig;

    fragColor = vec4(col, 1.0);
}
