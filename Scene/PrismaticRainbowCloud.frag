#version 330 core
out vec4 fragColor;
// PrismaticRainbowCloud.frag
// -----------------------------------------------------------------------
// PRISMATIC RAINBOW CLOUD: Polar stratospheric nacreous (mother-of-pearl) clouds
// with high-altitude Mie/Rayleigh pastel diffraction iridescence, glowing twilight
// crepuscular rays, and delicate fluid-like cloud wisp advection.
//   audioSwell   -> thickens cloud density and illuminates internal pastel glow
//   audioPhase   -> drifts diffraction iridescence color spectra
//   audioKick    -> pulses crepuscular god rays and lens sparkles
//   audioBass    -> creates deep atmospheric gravity wave ripples
//
// Per-activation variety:
//   densityP float nacreous cloud density & thickness      (0.5..1.8)
//   waveP    float atmospheric gravity wave frequency      (0.5..2.0)
//   rayP     float crepuscular sun ray intensity           (0.5..2.2)
//   hueP     float iridescent pastel spectrum offset       (0..6.28)
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

uniform float densityP;
uniform float waveP;
uniform float rayP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float hash21(vec2 p) {
    p = fract(p * vec2(219.78, 483.12));
    p += dot(p, p + 67.21);
    return fract(p.x * p.y);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 5; ++i) {
        v += a * noise(p);
        p = rot * p * 2.0 + vec2(20.0);
        a *= 0.5;
    }
    return v;
}

void main() {
    float den = (densityP > 0.0) ? densityP : 1.0;
    float wav = (waveP    > 0.0) ? waveP    : 1.0;
    float ry  = (rayP     > 0.0) ? rayP     : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    vec2 st = gl_FragCoord.xy / resolution;

    float t = time * 0.2 + audioAdvance * 0.15;

    // Atmospheric gravity wave distortion
    vec2 waveUV = uv;
    waveUV.x += sin(uv.y * 6.0 * wav + t) * 0.05 * (1.0 + audioBass * 0.5);
    waveUV.y += cos(uv.x * 4.0 * wav - t * 0.8) * 0.04;

    // Multi-octave polar stratospheric cloud wisps
    float n1 = fbm(waveUV * 3.0 + vec2(t * 0.5, -t * 0.2));
    float n2 = fbm(waveUV * 6.0 - vec2(t * 0.3, t * 0.4));
    float cloudDensity = smoothstep(0.3, 0.85, (n1 * 0.65 + n2 * 0.35) * den) * (0.8 + 0.4 * audioSwell);

    // Mie / Optical diffraction: Thin-film thickness variation produces pastel iridescent rainbow bands
    float opticalThickness = n1 * 12.0 + n2 * 6.0 + audioPhase * 2.0;
    vec3 iridColor = 0.5 + 0.5 * cos(vec3(0.0, 1.8, 3.6) + opticalThickness);
    // Enhance pastel lightness typical of nacreous clouds
    iridColor = mix(iridColor, vec3(1.0, 0.95, 0.9), 0.35);

    // Crepuscular god rays from low horizon twilight sun
    vec2 sunPos = vec2(0.3, -0.4);
    vec2 toSun = uv - sunPos;
    float sunDist = length(toSun);
    float sunAngle = atan(toSun.y, toSun.x);
    float godRay = (0.5 + 0.5 * sin(sunAngle * 18.0 + t * 0.5)) * exp(-sunDist * 1.5) * ry;
    vec3 rayColor = vec3(1.0, 0.85, 0.6) * godRay * (1.0 + audioKick * 2.0);

    // Twilight deep blue to violet background sky
    vec3 skyColor = mix(vec3(0.02, 0.05, 0.15), vec3(0.12, 0.08, 0.22), st.y);

    // Input photo blend as high-altitude cirrus texture
    vec3 photo = img(st);
    skyColor += photo * 0.25;

    // Combine nacreous cloud shading
    vec3 nacreous = iridColor * cloudDensity * 1.6;
    vec3 col = mix(skyColor, nacreous, clamp(cloudDensity * 1.2, 0.0, 1.0));
    col += rayColor * 0.6;

    // Lens sparkle on beats
    if (audioHigh > 0.4) {
        float sparkle = hash21(floor(uv * 40.0) + floor(time * 20.0));
        if (sparkle > 0.97 && cloudDensity > 0.3) {
            col += vec3(1.2, 1.1, 1.0) * audioHigh * 1.5;
        }
    }

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col, 1.0);
}
