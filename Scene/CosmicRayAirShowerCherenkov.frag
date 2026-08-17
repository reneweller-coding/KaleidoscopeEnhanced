#version 330 core
out vec4 fragColor;
// CosmicRayAirShowerCherenkov.frag
// -----------------------------------------------------------------------
// COSMIC RAY AIR SHOWER CHERENKOV: Ultra-high-energy cosmic ray striking
// the upper atmosphere, generating a cascading air shower of billions of
// relativistic secondary particles, nitrogen fluorescence in near-UV,
// and forward-directed atmospheric Cherenkov light cones.
//   audioAdvance -> drives relativistic particle cascade propagation
//   audioKick    -> fires primary cosmic ray impact & giant Cherenkov shock flash
//   audioBass    -> widens lateral particle distribution cone
//   audioHigh    -> excites molecular nitrogen UV fluorescence lines
//
// Per-activation variety:
//   cascadeP float air shower particle multiplication depth (0.5..2.2)
//   fluorP   float nitrogen fluorescence UV radiance        (0.5..2.0)
//   speedP   float cascade arrival velocity                 (0.5..2.0)
//   hueP     float atmospheric fluorescence hue offset      (0..6.28)
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

uniform float cascadeP;
uniform float fluorP;
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

// 2D Noise hash
float hash21(vec2 p) {
    p = fract(p * vec2(523.34, 825.21));
    p += dot(p, p + 41.32);
    return fract(p.x * p.y);
}

void main() {
    float csc = (cascadeP > 0.0) ? cascadeP : 1.0;
    float flr = (fluorP   > 0.0) ? fluorP   : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.45 * spd + audioAdvance * 0.22;

    // Air shower axis (top center to bottom)
    float showerY = uv.y;
    float showerX = uv.x - sin(showerY * 1.5 + t * 0.5) * 0.1;

    // Lateral particle spread (Greisen function profile: widens towards bottom)
    float altitude = clamp(showerY + 0.6, 0.01, 1.2);
    float lateralSpread = pow(1.2 - altitude, 1.5) * (0.45 * csc + 0.2 * audioBass);

    // Lateral distance from shower core
    float distToCore = abs(showerX) / max(lateralSpread, 0.01);
    float coreLuminance = exp(-distToCore * 4.0);

    // Cascading secondary particles (shower tracks)
    vec2 trackCoord = vec2(showerX * 25.0, showerY * 15.0 - t * 8.0);
    float particleSparks = pow(hash21(floor(trackCoord)), 8.0) * (audioHigh * 3.0 + 0.5);

    // Forward Cherenkov light cone (bright circular ring expanding downward)
    float cherenkovPhase = fract(t * 1.8 + audioPhase * 0.5);
    float cherenkovY = 0.5 - cherenkovPhase * 1.0;
    float cherenkovDist = abs(showerY - cherenkovY);
    float cherenkovRing = exp(-cherenkovDist * 20.0) * exp(-abs(showerX) * 3.0) * (audioKick * 3.5 + 0.8);

    // Photo texture mapping into atmospheric air shower ionization
    vec2 photoUV = st + vec2(sin(trackCoord.y), cos(trackCoord.x)) * 0.03 * (1.0 + audioKick * 0.5);
    vec3 photo = img(fract(photoUV));

    // Near-UV Nitrogen fluorescence & Cherenkov blue palette
    vec3 nightSky = vec3(0.02, 0.03, 0.08);
    vec3 nitrogenViolet = vec3(0.5, 0.2, 0.95);
    vec3 cherenkovCyan   = vec3(0.1, 0.85, 1.0);
    vec3 impactWhite     = vec3(0.95, 0.98, 1.0);

    // Combine visualizer
    vec3 col = mix(nightSky, photo * 0.8, 0.35 + 0.2 * audioLevel);
    col += coreLuminance * nitrogenViolet * (1.0 + audioSwell * 0.8) * flr;
    col += cherenkovRing * cherenkovCyan * 1.8;
    col += particleSparks * impactWhite * 2.0;

    // Primary impact flash at the top on kick
    float impactFlash = exp(-length(uv - vec2(0.0, 0.5)) * 6.0) * audioKick * 3.0;
    col += impactFlash * impactWhite;

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    // Vignette
    float vig = smoothstep(1.35, 0.35, length(uv));
    col *= vig;

    fragColor = vec4(col, 1.0);
}
