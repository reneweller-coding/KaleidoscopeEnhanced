#version 330 core
out vec4 fragColor;
/**
 * @file HyperbolicMetamaterialSpacetime.frag
 * @brief HYPERBOLIC METAMATERIAL SPACETIME: Anisotropic dielectric tensor metamaterial
 * emulating an effective (2+1)D Minkowski spacetime with hyperbolic dispersion relations.
 * Light rays trace relativistic null geodesics around artificial singularities,
 * forming nested hyperbolic resonance cones and chromatic phase-fronts.
 *   audioAdvance -> navigates through anisotropic spacetime layers
 *   audioBass    -> bends dielectric principal tensor axes
 *   audioKick    -> flashes artificial event horizon topological transitions
 *   audioSwell   -> broadens hyperbolic resonance cone width
 *   audioCentroid-> shifts extraordinary-wave dispersion slope
 *
 * Per-activation variety:
 *   coneSlopeP   float hyperbolic cone opening dispersion      (0.5..2.0)
 *   curvP        float spacetime metric curvature intensity    (0.4..1.8)
 *   densityP     float subwavelength multilayer density        (1.0..3.5)
 *   warpP        float relativistic frame-dragging warp        (0.2..1.5)
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

uniform float coneSlopeP;
uniform float curvP;
uniform float densityP;
uniform float warpP;

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

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // Relativistic coordinate warping
    float r = length(uv);
    float a = atan(uv.y, uv.x);
    float warp = (warpP > 0.01 ? warpP : 0.8) * (0.5 + 0.5 * audioBass);
    a += warp / (r + 0.25) + audioPhase * 0.5;
    
    vec2 p = vec2(cos(a), sin(a)) * r;
    
    // Hyperbolic metric tensor: eps_xx * x^2 - eps_yy * y^2 = const
    float slope = (coneSlopeP > 0.01 ? coneSlopeP : 1.0) * (0.8 + 0.4 * sin(audioCentroid * 3.14));
    float curv  = (curvP > 0.01 ? curvP : 1.0);
    
    float metricPhase = 0.0;
    vec3 accCol = vec3(0.0);
    float totalW = 0.0;
    
    float layers = 6.0;
    float density = (densityP > 0.01 ? densityP : 2.0);
    
    for (float i = 1.0; i <= 6.0; i += 1.0) {
        float scale = i * 0.45;
        vec2 q = p * scale;
        
        // Hyperbolic dispersion relation
        float hyp = q.x * q.x - slope * q.y * q.y;
        float cone = sin(hyp * density * 8.0 - t * (1.5 + i * 0.4)) * 0.5 + 0.5;
        
        // Evanescent decay away from resonance singularity
        float decay = exp(-abs(hyp) * curv * 2.5);
        
        // Sample photo palette at hyperbolic phase coordinates
        float palCoord = fract(hyp * 0.15 + i * 0.16 + t * 0.05);
        vec3 pal = imgPalette(palCoord);
        
        float w = decay / (i * 0.7 + 0.3);
        accCol += pal * (cone * 0.7 + 0.3) * w;
        totalW += w;
    }
    
    vec3 col = accCol / max(totalW, 0.001);
    
    // Add central metamaterial core & singularity glow
    float core = exp(-r * 6.0) * (1.0 + 2.0 * audioKick);
    col += imgPalette(t * 0.1) * core * 1.5;
    
    // Background photo projection with subtle anisotropic warp
    vec2 bgUv = fract(gl_FragCoord.xy / resolution + vec2(sin(p.y * 3.0), cos(p.x * 3.0)) * 0.02);
    col = mix(img(bgUv) * 0.35, col, 0.75 + 0.25 * audioSwell);
    
    // Kick accent
    col += imgPalette(audioCentroid) * audioKick * 0.3;
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
