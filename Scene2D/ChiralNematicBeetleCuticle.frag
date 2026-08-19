#version 330 core
out vec4 fragColor;
/**
 * @file ChiralNematicBeetleCuticle.frag
 * @brief CHIRAL NEMATIC BEETLE CUTICLE: Biomimetic jewel scarab beetle cuticle (Chrysina resplendens).
 * Helical cholesteric liquid-crystal chitin nanofibril multilayers generate circular polarization,
 * angle-dependent Bragg structural color, hexagonal cellular micro-faceting, and metallic iridescence.
 *   audioAdvance -> rotates cholesteric helical director pitch & viewing angle
 *   audioPhase   -> shifts chiral nematic polarization phase
 *   audioKick    -> flashes specular metallic facet glints & Bragg resonance peaks
 *   audioSwell   -> enriches structural iridescence color saturation & depth
 *   audioCentroid-> modulates micro-cellular hexagon facet curvature
 *
 * Per-activation variety:
 *   pitchP   float cholesteric helical pitch wavelength     (0.5..2.2)
 *   hexP     float hexagonal cellular micro-facet scale     (2.0..8.0)
 *   iridP    float Bragg structural interference intensity  (0.8..2.5)
 *   metalP   float specular metallic sheen reflection       (0.5..2.0)
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
uniform float audioChromaHue;
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;

uniform float pitchP;
uniform float hexP;
uniform float iridP;
uniform float metalP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

// Hexagonal cell grid generator
vec4 hexGrid(vec2 p) {
    vec2 s = vec2(1.0, 1.7320508);
    vec2 a = mod(p, s) - s * 0.5;
    vec2 b = mod(p - s * 0.5, s) - s * 0.5;
    vec2 h = dot(a, a) < dot(b, b) ? a : b;
    vec2 id = p - h;
    return vec4(h, id);
}

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // Hexagonal micro-cellular facet coordinates
    float hexScale = (hexP > 0.01 ? hexP : 4.5);
    vec4 hg = hexGrid(uv * hexScale + vec2(sin(t * 0.2), cos(t * 0.15)) * 0.3);
    vec2 cellLocal = hg.xy;
    vec2 cellId = hg.zw;
    
    // Dome facet curvature inside each hexagonal cell
    float cellR = length(cellLocal);
    float cellDome = sqrt(max(0.001, 1.0 - cellR * cellR * 4.0));
    vec3 facetNormal = normalize(vec3(cellLocal * 2.0, cellDome));
    
    // Macro curvature of beetle body
    vec3 macroNormal = normalize(vec3(uv * 1.5, sqrt(max(0.001, 1.0 - dot(uv, uv) * 0.8))));
    vec3 normal = normalize(mix(macroNormal, facetNormal, 0.45 + 0.2 * audioCentroid));
    
    // Viewing direction & Bragg reflection angle
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    float cosTheta = clamp(dot(normal, viewDir), 0.0, 1.0);
    
    // Cholesteric pitch Bragg resonance: lambda = 2 * n_avg * P * cos(theta)
    float pitch = (pitchP > 0.01 ? pitchP : 1.0);
    float braggPhase = (pitch * 3.0 / max(cosTheta, 0.1) + audioPhase * 0.5 - t * 0.8);
    
    // Structural color via photo palette mapped to Bragg reflection spectrum
    float palCoord = fract(braggPhase * 0.159 + length(cellId) * 0.05);
    vec3 structuralColor = imgPalette(palCoord) * (iridP > 0.01 ? iridP : 1.5);
    
    // Specular metallic sheen & facet highlights
    vec3 lightDir = normalize(vec3(cos(t * 0.6), sin(t * 0.6), 0.8));
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(0.0, dot(normal, halfVec)), 28.0) * (metalP > 0.01 ? metalP : 1.2);
    float kickGlint = pow(max(0.0, dot(normal, halfVec)), 80.0) * (1.0 + 4.0 * audioKick);
    
    // Hexagonal cell boundary lines
    float hexEdge = smoothstep(0.42, 0.48, cellR * 2.0);
    
    // Background photo reflection
    vec2 bgUv = fract(reflect(-viewDir, normal).xy * 0.4 + 0.5);
    vec3 bgRefl = img(bgUv) * 0.35;
    
    vec3 col = bgRefl;
    col += structuralColor * cosTheta * (0.8 + 0.4 * audioSwell);
    col += vec3(1.0, 0.95, 0.8) * spec * 1.2;
    col += structuralColor * kickGlint * 2.0;
    col -= vec3(0.15) * hexEdge; // Dark etched boundary grooves
    col += imgPalette(audioCentroid) * (audioKick * 0.3);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
