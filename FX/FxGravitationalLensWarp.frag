#version 330 core
out vec4 fragColor;
// FxGravitationalLensWarp.frag
// -----------------------------------------------------------------------
// FX GRAVITATIONAL LENS WARP: Relativistic black-hole gravitational lensing.
// A dark matter singularity opens at the center of the frame, bending spacetime,
// forming Einstein rings, swallowing the outgoing scene and expanding the new one.
//   interpolation -> sweeps Schwarzschild radius from 0 to maximum and back
//   audioKick     -> flashes bright photon sphere ring emission
//   audioBass     -> drives gravitational deflection depth
//
// Per-activation variety:
//   lensP  float gravitational lensing strength (0.5..2.2)
//   massP  float black hole mass & ring radius  (0.5..2.0)
//   speedP float frame dragging rotation speed  (0.5..2.0)
//   hueP   float photon ring hue offset         (0..6.28)
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

uniform float lensP;
uniform float massP;
uniform float speedP;
uniform float hueP;

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
    float lns = (lensP  > 0.0) ? lensP  : 1.0;
    float mss = (massP  > 0.0) ? massP  : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float t = time * 0.4 * spd + audioAdvance * 0.2;
    float tProg = clamp(interpolation, 0.0, 1.0);
    float midTransition = sin(tProg * 3.14159265);

    float r = length(p);
    float rSchwarzschild = 0.25 * midTransition * mss;
    float rPhotonRing = rSchwarzschild * 1.5;

    // Relativistic gravitational deflection: r' = r - r_s^2 / r
    float deflection = (rSchwarzschild * rSchwarzschild) / max(r * r, 0.001) * lns;
    vec2 pLensed = p * (1.0 - deflection * 0.7);
    pLensed = rot2D(deflection * 1.2 + t * 0.3) * pLensed;

    vec2 warpUV = (pLensed * resolution.y + 0.5 * resolution) / resolution;

    vec4 c1 = texture(tex1, fract(mix(uv, warpUV, midTransition)));
    vec4 c0 = texture(tex0, fract(mix(warpUV, uv, 1.0 - midTransition)));

    vec4 col = mix(c1, c0, tProg);

    // Glowing Einstein photon ring
    float photonRing = exp(-abs(r - rPhotonRing) * 35.0) * midTransition;
    col.rgb += photonRing * vec3(0.2, 0.9, 1.0) * (1.5 + audioKick * 3.0);

    // Central event horizon shadow
    float shadow = smoothstep(rSchwarzschild * 0.7, rSchwarzschild * 1.1, r);
    col.rgb *= mix(1.0, shadow, midTransition);

    if (audioChromaHue != 0.0) col.rgb = hueRot(col.rgb, audioChromaHue);
    if (hue > 0.001) col.rgb = hueRot(col.rgb, hue);

    fragColor = col;
}
