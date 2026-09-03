#version 330 core
out vec4 fragColor;
/**
 * @file CoronagraphSpeckleField.frag
 * @brief CORONAGRAPH SPECKLE FIELD: direct imaging of exoplanets.  A
 * coronagraph mask blocks the star; what remains is the speckle halo --
 * a field of diffraction speckles whose brightness is the spectrum (band
 * by radius) -- rotating slowly with the sky (angular differential
 * imaging: the speckles turn with the telescope, the planets do not), so
 * the few steady round dots that stay put are the planets.  The photo is
 * the residual halo texture; the swell is the halo level.  Camera still.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> speckle brightness by radius (light)
 *   sceneAdvance      -> field rotation (continuous)
 *   audioSwell        -> halo level (slow)
 *   audioKick         -> the mask edge glints (light)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: planetsP, speckleP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioSwell;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float planetsP;
uniform float speckleP;
uniform float hueP;

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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    int nPlanets = 2 + int(clamp(planetsP, 0.0, 1.0) * 3.0);
    float speckleDens = 30.0 + 30.0 * clamp(speckleP, 0.0, 1.0);
    float halo = 0.3 + 0.9 * clamp(audioSwell, 0.0, 1.0);
    float rot = sceneAdvance * 0.12 + sceneTime * 0.025;
    float r = length(p);
    float maskR = 0.08;

    // Rotating frame for the speckles.
    float c2 = cos(rot), s2 = sin(rot);
    vec2 q = mat2(c2, -s2, s2, c2) * p;

    // Halo: the photo as a soft residual, falling off with radius; Airy
    // rings faintly.
    vec3 col = (interpolation * textureLod(tex0, q * 0.6 + 0.5, 3.0) + (1.0 - interpolation) * textureLod(tex1, q * 0.6 + 0.5, 3.0)).rgb;
    col *= imgPalette(hue * 0.159 + 0.6) * 1.1 * halo * exp(-r * 1.6);
    float airy = pow(0.5 + 0.5 * cos(r * 90.0), 6.0) * exp(-r * 3.0) * 0.6;
    col += imgPalette(hue * 0.159 + 0.5) * airy * halo;

    // Speckles: a grid of hashed spots in the rotating frame; brightness
    // from the band at that radius; they shimmer slowly (a noise clock).
    vec2 gu = q * speckleDens; vec2 cell = floor(gu); vec2 f = fract(gu) - 0.5;
    vec2 off = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;
    float d = length(f - off * 0.5);
    float rr = length((cell + 0.5 + off * 0.5) / speckleDens);
    int band = int(clamp(rr / 0.7 * 31.0, 0.0, 31.0));
    float e = clamp(audioSpectrum[band] * 1.6, 0.0, 1.0);
    float present = step(0.3, hash21(cell + 1.1));
    float shimmer = 0.6 + 0.4 * sin(sceneAdvance * 1.5 + hash21(cell + 9.9) * 6.28);
    float speckle = exp(-d * d * 40.0) * present * (0.35 + 0.65 * e) * shimmer * exp(-rr * 1.0);
    vec3 spCol = mix(vec3(0.9, 0.85, 0.8), imgPalette(hue * 0.159 + hash21(cell + 5.5) * 0.2), 0.5) * 2.0;
    col += spCol * speckle * halo * 2.5;

    // Planets: steady round dots in the fixed frame (they do not rotate).
    for (int i = 0; i < 5; ++i)
    {
        if (i >= nPlanets) break;
        float fi = float(i);
        float pa = hash11(fi * 3.7) * 6.2831853;
        float pr = 0.16 + 0.32 * hash11(fi * 5.1);
        vec2 pp = vec2(cos(pa), sin(pa)) * pr;
        float pd = length(p - pp);
        float sz = 0.008 + 0.006 * hash11(fi * 7.3);
        vec3 pc = mix(vec3(1.0, 0.85, 0.7), imgPalette(hue * 0.159 + 0.3 + fi * 0.15), 0.5) * 1.8;
        col += pc * (smoothstep(sz, sz * 0.4, pd) + exp(-pd / (sz * 3.0)) * 0.4);
    }
    // The coronagraph mask: black disc with a bright glinting rim.
    float mask = smoothstep(maskR, maskR * 0.97, r);
    float rim = smoothstep(0.006, 0.0, abs(r - maskR));
    col = mix(col, vec3(0.0), mask);
    col += imgPalette(hue * 0.159 + 0.9) * rim * (0.3 + 1.2 * audioKick);
    // The inner working angle ring, faint.
    col += vec3(0.4, 0.45, 0.6) * smoothstep(0.003, 0.0, abs(r - maskR * 2.2)) * 0.15;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
