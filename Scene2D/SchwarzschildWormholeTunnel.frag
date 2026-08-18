#version 330 core
out vec4 fragColor;
/**
 * @file SchwarzschildWormholeTunnel.frag
 * @brief SCHWARZSCHILD WORMHOLE TUNNEL: Raymarched flight through a traversable
 * Morris-Thorne wormhole connecting two distinct universes (tex0 and tex1).
 * Relativistic spacetime throat curvature, gravitational lensing arcs,
 * chromatic dispersion, and seamless topological universe transitions.
 *   audioAdvance -> navigates camera through the wormhole throat
 *   audioKick    -> pulses gravitational metric contraction shockwaves
 *   audioSubBass -> expands throat diameter and event horizon clearance
 *   audioChromaHue-> shifts relativistic Doppler blueshift/redshift
 *
 * Per-activation variety:
 *   throatP    float wormhole throat radius & length   (0.5..2.2)
 *   curvatureP float spacetime bending strength        (0.5..2.0)
 *   speedP     float hyperspace flight velocity        (0.5..2.0)
 *   hueP       float chromatic dispersion hue offset   (0..6.28)
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

uniform float throatP;
uniform float curvatureP;
uniform float speedP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
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
    float thrt = (throatP    > 0.0) ? throatP    : 1.0;
    float crv  = (curvatureP > 0.0) ? curvatureP : 1.0;
    float spd  = (speedP     > 0.0) ? speedP     : 1.0;
    float hue  = (hueP       > 0.0) ? hueP       : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.4 * spd + audioAdvance * 0.2;

    // Camera trajectory moving forward along z through the wormhole
    float camZ = mod(t * 3.0, 20.0) - 10.0; // from -10 to +10
    vec3 ro = vec3(sin(t * 0.5) * 0.2, cos(t * 0.4) * 0.2, camZ);
    vec3 rd = normalize(vec3(uv, 1.2 - 0.3 * audioKick));

    // Throat radius profile: r(l) = sqrt(r0^2 + l^2)
    float r0 = (0.7 + 0.25 * audioSubBass) * thrt;

    // Ray deflection through wormhole metric
    vec3 p = ro;
    float stepSize = 0.12;
    float crossedThroat = 0.0;
    float throatGlow = 0.0;
    vec2 celestialUV = vec2(0.0);

    for (int i = 0; i < 40; ++i) {
        p += rd * stepSize;
        float r = length(p.xy);
        float l = p.z; // length along throat

        // Throat surface distance
        float throatRadius = sqrt(r0 * r0 + l * l * 0.35);
        float distToThroat = r - throatRadius;

        // Lensing curvature
        vec2 defl = -normalize(p.xy) * (r0 * r0 / max(r * r, 0.05)) * 0.05 * crv;
        rd.xy += defl;
        rd = normalize(rd);

        if (abs(l) < 0.5) {
            throatGlow += exp(-abs(distToThroat) * 20.0) * 0.15;
        }

        if (l > 0.0) {
            crossedThroat = 1.0;
        }
    }

    // Map asymptotic ray angles to celestial sphere coordinates
    celestialUV = fract(vec2(atan(rd.y, rd.x) * 0.15915 + t * 0.05, rd.z * 0.5 + 0.5));

    // Sample Universe 1 (tex0) or Universe 2 (tex1) depending on throat traversal
    vec3 u1 = texture(tex0, celestialUV).rgb;
    vec3 u2 = texture(tex1, celestialUV).rgb;

    // Blend across throat transition
    float transition = smoothstep(-1.5, 1.5, p.z);
    vec3 photo = mix(u1, u2, transition);

    // Gravitational lensing photon ring
    float rScreen = length(uv);
    float photonRing = exp(-abs(rScreen - 0.45 * thrt) * 35.0) * (1.2 + audioKick * 3.0);
    vec3 ringColor = imgPalette(0.30 * transition) * 1.5;

    // Combine visualizer
    vec3 col = photo * (0.85 + 0.3 * audioLevel);
    col += photonRing * ringColor * 1.5;
    col += throatGlow * vec3(1.0, 0.9, 0.6) * (1.0 + audioKick * 2.0);

    if (audioChromaHue != 0.0)     if (hue > 0.001) col = hueRot(col, hue);

    // Vignette
    float vig = smoothstep(1.3, 0.35, rScreen);
    col *= vig;

    fragColor = vec4(col, 1.0);
}
