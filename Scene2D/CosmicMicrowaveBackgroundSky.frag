#version 330 core
out vec4 fragColor;
/**
 * @file CosmicMicrowaveBackgroundSky.frag
 * @brief COSMIC MICROWAVE BACKGROUND SKY: the oldest light, as a sky.  The
 * anisotropy map is built from noise at eight angular scales, and the
 * amplitude of each scale is a spectrum band -- the acoustic peaks of the
 * early universe were literally sound waves in the plasma, so here the
 * music's spectrum IS the power spectrum: bass paints the large blobs,
 * treble the fine grain.  We look out from inside the sphere; the view
 * turns slowly and breathes closer on the swell; the classic blue-red map
 * is tinted by the palette.  The camera never jolts.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> multipole amplitudes (the whole point)
 *   sceneAdvance      -> the sky turns (continuous)
 *   audioSwell        -> zoom breath (slow)
 *   audioKick         -> the dipole (our own motion) flashes (light)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: grainP (fine-scale weight), tiltP (view axis), hueP.
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

uniform float grainP;
uniform float tiltP;
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

float hash13(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x)
{
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float grain = 0.5 + 0.5 * clamp(grainP, 0.0, 1.0);
    // View direction: the sky turns slowly; the swell breathes the field of
    // view (slow).
    float fov = 1.0 + 0.25 * clamp(audioSwell, 0.0, 1.0);
    vec3 rd = normalize(vec3(p.x, p.y, fov));
    float yaw = sceneAdvance * 0.05 + sceneTime * 0.01;
    float pitch = 0.3 * (clamp(tiltP, 0.0, 1.0) - 0.5);
    rd = vec3(cos(yaw) * rd.x + sin(yaw) * rd.z, rd.y, -sin(yaw) * rd.x + cos(yaw) * rd.z);
    rd = vec3(rd.x, cos(pitch) * rd.y - sin(pitch) * rd.z, sin(pitch) * rd.y + cos(pitch) * rd.z);

    // The map: eight angular scales, each weighted by four bands averaged
    // (bass -> big blobs, treble -> fine grain); the sum is the temperature
    // anisotropy.
    float T = 0.0;
    float norm = 0.0;
    for (int k = 0; k < 8; ++k)
    {
        float e = 0.0;
        for (int j = 0; j < 4; ++j) e += clamp(audioSpectrum[k * 4 + j] * 1.5, 0.0, 1.0);
        e *= 0.25;
        float scale = 1.6 * pow(1.9, float(k));
        float w = (0.35 + 1.2 * e) * (k >= 5 ? grain : 1.0);
        T += (noise3(rd * scale + float(k) * 7.0) - 0.5) * w / (1.0 + 0.25 * float(k));
        norm += w / (1.0 + 0.25 * float(k));
    }
    T = T / max(norm, 1e-3) * 6.0;                       // roughly -1 .. 1 (the noise sum is narrow)
    // The dipole: our own motion through the CMB, a smooth hot/cold pair
    // that flashes on the kick.
    vec3 dipoleDir = normalize(vec3(0.6, 0.2, 0.7));
    T += dot(rd, dipoleDir) * (0.15 + 0.35 * audioKick);

    // Colour: the classic map (blue cold, red hot, through white) tinted by
    // the palette so it belongs to the photo.
    vec3 cold = mix(vec3(0.1, 0.25, 0.95), imgPalette(hue * 0.159 + 0.6), 0.2);
    vec3 hot  = mix(vec3(1.0, 0.3, 0.1), imgPalette(hue * 0.159 + 0.05), 0.2);
    vec3 mid  = mix(vec3(0.9, 0.85, 0.6), imgPalette(hue * 0.159 + 0.3), 0.2);
    float u = clamp(T * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = (u < 0.5) ? mix(cold, mid, u * 2.0) : mix(mid, hot, (u - 0.5) * 2.0);
    col *= 0.55 + 0.6 * audioLevel;
    // Galactic plane: a faint band of foreground dust, the photo.
    float plane = exp(-abs(rd.y - 0.15 * sin(rd.x * 2.0)) * 6.0);
    col = mix(col, img(fract(vec2(atan(rd.z, rd.x) * 0.159 + 0.5, rd.y * 0.5 + 0.5))) * 0.35, plane * 0.2);
    col *= 1.0 - 0.3 * smoothstep(0.7, 1.15, length(p));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
