#version 330 core
out vec4 fragColor;
/**
 * @file QuaternionFractalHopfLoom.frag
 * @brief QUATERNION FRACTAL HOPF LOOM: 4D hypercomplex quaternion Julia fractal
 * sliced dynamically and projected via continuous Hopf fibration into interlocking
 * self-similar 3D/2D nested torus weaves and iridescent optical filaments.
 *   audioAdvance -> navigates hypercomplex 4D slice coordinates (w-axis orbit)
 *   audioPhase   -> twists Hopf fibration projection angles
 *   audioKick    -> flashes fractal boundary orbit-trap contact points
 *   audioSwell   -> deepens fractal iteration glow & luminous field density
 *   audioCentroid-> shifts orbit-trap distance palette spectra
 *
 * Per-activation variety:
 *   iterP    float fractal iteration depth & detail        (6.0..14.0)
 *   sliceP   float 4D quaternion hyper-rotation speed      (0.3..1.5)
 *   trapP    float orbit trap geometry scale & sharpness   (0.5..2.2)
 *   hopfP    float Hopf fibration fiber winding density    (1.0..3.5)
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

uniform float iterP;
uniform float sliceP;
uniform float trapP;
uniform float hopfP;

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

// Quaternion multiplication: q1 * q2
vec4 qMul(vec4 a, vec4 b) {
    return vec4(
        a.x * b.x - a.y * b.y - a.z * b.z - a.w * b.w,
        a.x * b.y + a.y * b.x + a.z * b.w - a.w * b.z,
        a.x * b.z - a.y * b.w + a.z * b.x + a.w * b.y,
        a.x * b.w + a.y * b.z - a.z * b.y + a.w * b.x
    );
}

// Quaternion square: q^2
vec4 qSquare(vec4 q) {
    return vec4(
        q.x * q.x - dot(q.yzw, q.yzw),
        2.0 * q.x * q.yzw
    );
}

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / min(resolution.x, resolution.y);
    float t = time * 0.3 + audioAdvance * 0.35;
    
    // Hopf fibration coordinates
    // Ganzzahlige Hopf-Windung, sonst springt r*sin(theta) am atan-Cut
    // (die gemeldete Kante links).
    float hopfWinding = max(1.0, floor((hopfP > 0.01 ? hopfP : 2.0) + 0.5));
    float r = length(uv);
    float theta = atan(uv.y, uv.x) * hopfWinding + audioPhase;
    
    // Hyper-slice rotation in 4D: C parameter
    float sliceSpeed = (sliceP > 0.01 ? sliceP : 0.8);
    vec4 C = vec4(
        -0.2 + 0.15 * cos(t * sliceSpeed),
        0.55 + 0.1 * sin(t * sliceSpeed * 0.7),
        0.25 * sin(t * 0.5 + audioPhase),
        -0.15 * cos(t * 0.4)
    );
    
    // Initial quaternion state Z0
    vec4 z = vec4(
        uv.x * 1.5,
        uv.y * 1.5,
        r * sin(theta) * 0.5,
        r * cos(theta) * 0.5
    );
    
    float trapScale = (trapP > 0.01 ? trapP : 1.2);
    float trapDist = 1e5;
    float trapCross = 1e5;
    
    float maxIt = (iterP > 1.0 ? iterP : 9.0);
    float itCount = 0.0;
    
    for (float i = 0.0; i < 14.0; i += 1.0) {
        if (i >= maxIt) break;
        if (dot(z, z) > 8.0) break;
        
        z = qSquare(z) + C;
        
        // Orbit traps: spherical and cross-plane
        float dSphere = abs(length(z) - trapScale);
        float dCross  = min(abs(z.x * z.y), abs(z.z * z.w));
        
        trapDist = min(trapDist, dSphere);
        trapCross = min(trapCross, dCross);
        itCount = i;
    }
    
    // Smooth iteration metric & potential
    float smoothIt = itCount - log(max(1.0, log(dot(z, z)) * 0.5)) / log(2.0);
    
    // Optical trap glow synthesis.  The cross trap min(|x*y|,|z*w|) is
    // near zero for almost EVERY orbit (any single component crossing
    // zero suffices), so its falloff must be sharp and its gain modest --
    // the original 12.0/2.2 pairing lit the entire frame to white.
    float glowSphere = exp(-trapDist * 7.0) * (0.8 + 0.5 * audioMid);
    float glowCross  = exp(-trapCross * 60.0) * (1.0 + 2.5 * audioKick);
    
    // Palette assignment
    vec3 colSphere = imgPalette(fract(trapDist * 0.35 + smoothIt * 0.1 + audioCentroid));
    vec3 colCross  = imgPalette(fract(trapCross * 0.8 + t * 0.05 + 0.5));
    vec3 colField  = imgPalette(fract(smoothIt * 0.15 + t * 0.04));
    
    // Sample background photo
    vec2 bgUv = gl_FragCoord.xy / resolution;
    vec3 bg = img(bgUv) * 0.25;
    
    vec3 col = bg * 0.5;
    col += colField * (smoothstep(0.0, maxIt, smoothIt) * 0.9 + 0.15) * (0.85 + 0.4 * audioSwell);
    col += colSphere * glowSphere * 1.2;
    col += colCross * glowCross * 1.2;
    col += imgPalette(audioAdvance * 0.1) * (audioKick * 0.35);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
