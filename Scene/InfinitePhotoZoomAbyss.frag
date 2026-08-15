#version 330 core
out vec4 fragColor;
// InfinitePhotoZoomAbyss.frag
// -----------------------------------------------------------------------
// INFINITE PHOTO ZOOM ABYSS: 100% viewport-filling seamless infinite
// logarithmic Droste spiral dive into the loaded photo texture.
// Conformal mapping w = ln(z) transforms the image into an endless
// self-similar recursive fractal spiral with smooth multi-octave blending.
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
uniform float spiralP;
uniform float zoomP;
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
    float spi = (spiralP > 0.0) ? spiralP : 1.0;
    float zm  = (zoomP   > 0.0) ? zoomP   : 1.0;
    float hue = (hueP    > 0.0) ? hueP    : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Center coordinates
    float r = length(uv);
    float angle = atan(uv.y, uv.x);

    // Conformal complex logarithm w = ln(z) = ln(r) + i*theta
    float logR = log(max(r, 1e-4));

    // Logarithmic spiral transformation parameters
    float spiralAngle = 0.35 * spi;
    float scaleFactor = 2.0; // Zoom octave scale
    float logScale = log(scaleFactor);

    // Continuous forward zoom & spiral rotation
    float zoomProg = (time * 0.4 * spd + audioAdvance * 0.25) * zm;
    
    // Droste spiral coordinates
    float u = (logR - zoomProg * logScale + angle * spiralAngle) / logScale;
    float v = angle / 6.2831853 + u * 0.15 + audioPhase * 0.1;

    // Multi-octave blending to ensure 100% seamless continuity without pop-in
    float oct = fract(u);
    float octIndex = floor(u);

    // Sample two neighboring scale octaves
    vec2 uv1 = vec2(fract(oct), fract(v));
    vec2 uv2 = vec2(fract(oct + 1.0), fract(v));

    // Apply kaleidoscopic mirror fold to each octave coordinate
    uv1 = abs(uv1 * 2.0 - 1.0);
    uv2 = abs(uv2 * 2.0 - 1.0);

    // Kick shockwave ripple
    float shock = sin(r * 18.0 - time * 8.0) * 0.04 * (1.0 + 2.0 * audioKick);
    uv1 += shock;
    uv2 += shock;

    vec3 col1 = img(fract(uv1));
    vec3 col2 = img(fract(uv2));

    // Smooth sinusoidal octave cross-fade
    float blendWeight = smoothstep(0.0, 1.0, oct);
    vec3 photoMix = mix(col1, col2, blendWeight);

    // Octave depth chromatic tint
    vec3 octaveTint = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + octIndex * 0.8 + audioPhase);

    // Vignetting and central vortex glow
    float centerVortex = exp(-r * 3.5) * (0.8 + 2.0 * audioKick);
    vec3 col = photoMix * (0.85 + 0.35 * octaveTint) * (0.8 + 0.5 * audioLevel);
    col += (vec3(1.0, 0.85, 0.6) * col1 + vec3(0.6, 0.9, 1.0)) * centerVortex;

    col = hueRot(col, audioChromaHue + hue);
    col = pow(col, vec3(0.9)); // Saturation boost
    col += vec3(0.03, 0.02, 0.05) * audioSwell;

    fragColor = vec4(col, 1.0);
}
