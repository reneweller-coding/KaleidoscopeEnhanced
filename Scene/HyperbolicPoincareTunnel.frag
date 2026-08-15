#version 330 core
out vec4 fragColor;
// HyperbolicPoincareTunnel.frag
// -----------------------------------------------------------------------
// HYPERBOLIC POINCARE TUNNEL: 100% viewport-filling infinite flight down
// a non-Euclidean tunnel whose cross-section is an {8,3} hyperbolic
// Poincare disk. The tunnel walls are paved with conformal self-similar
// tiles of the loaded photo with hyperbolic circle reflections.
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

uniform float speedP;
uniform float branchP;
uniform float curveP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float spd = (speedP  > 0.0) ? speedP  : 1.0;
    float brn = (branchP > 0.0) ? branchP : 1.0;
    float crv = (curveP  > 0.0) ? curveP  : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float r = length(uv);
    float angle = atan(uv.y, uv.x);

    // Tunnel depth coordinate z
    float z = (1.0 / (r + 0.05)) * (0.8 + 0.3 * audioSwell) + (time * 0.7 * spd + audioAdvance * 0.35);
    
    // Curving tunnel axis
    vec2 tunnelCenter = vec2(sin(z * 0.3 * crv) * 0.4, cos(z * 0.25 * crv) * 0.3);
    vec2 p = (uv - tunnelCenter / (z * 0.5 + 1.0));
    r = length(p);
    angle = atan(p.y, p.x);

    // 8-fold hyperbolic sector symmetry
    float sectors = 8.0 * brn;
    float secAngle = 6.2831853 / sectors;
    float foldedAngle = mod(angle + 0.5 * secAngle, secAngle) - 0.5 * secAngle;
    vec2 hCoord = vec2(cos(foldedAngle), sin(foldedAngle)) * (1.0 - exp(-r * 2.0));

    // Hyperbolic circle inversion reflection
    float cX = 0.85;
    float cR = 0.55;
    vec2 d = hCoord - vec2(cX, 0.0);
    float d2 = dot(d, d);
    if (d2 < cR * cR) {
        hCoord = vec2(cX, 0.0) + d * (cR * cR / d2);
    }

    // Photo texture mapping onto hyperbolic tunnel tiles
    vec2 tunnelUV = vec2(hCoord.x * 1.5, fract(z * 0.2 + hCoord.y * 0.5));
    tunnelUV = abs(fract(tunnelUV) * 2.0 - 1.0); // Kaleidoscopic fold

    vec3 photoTile = img(tunnelUV);

    // Hyperbolic tile borders & glowing archways
    float tileBorder = min(abs(fract(z * 0.5) - 0.5), abs(foldedAngle / (0.5 * secAngle) - 1.0));
    float archGlow = exp(-tileBorder * 20.0) * (0.8 + 1.5 * audioHigh);

    // Color grading & depth perspective
    vec3 archCol = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + z * 0.5 + audioPhase);
    vec3 col = photoTile * (0.8 + 0.5 * audioLevel) + archCol * archGlow * 1.8;

    // Vanishing point core laser flare on kicks
    float coreFlare = exp(-r * 4.0) * (0.5 + 2.5 * audioKick);
    col += vec3(1.0, 0.95, 0.85) * coreFlare;

    // Tunnel wall entrance fade
    col *= smoothstep(0.0, 0.1, r);

    col = hueRot(col, audioChromaHue + hue);
    col = pow(col, vec3(0.88));

    fragColor = vec4(col, 1.0);
}
