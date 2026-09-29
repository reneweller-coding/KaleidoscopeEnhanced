#version 330 core
out vec4 fragColor;
/**
 * @file EndOfTheUniverse.frag
 * @brief END OF THE UNIVERSE: the heat death of the cosmos, and the last
 * thing left in it -- a black hole with a dim, ember-red accretion disk seen
 * nearly edge-on.  Its gravity bends the few remaining red dwarfs around
 * it; the far side of the disk is lensed into a loop over and under the
 * shadow, the photon ring a thin thread of light.  The disk turns slowly,
 * the dying stars drift past; the music is how brightly the embers glow.
 *   sceneTime/sceneAdvance -> the disk turning, the stars drifting (continuous)
 *   audioKick    -> the photon ring brightens a little (light only)
 *   audioSwell   -> disk and halo brightness (slow)
 *   audioChromaHue-> photo tint of the embers
 *
 * Per-activation variety:
 *   starP float density of the remaining stars (0.1..1.0)
 *   glowP float intensity of the embers (0.5..1.5)
 *   hueP float palette offset (0..6.28)
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioChromaHue;

uniform float starP;
uniform float glowP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Noise periodic in x with an integer period of cells: sampled around an
// angle it has no seam where atan wraps.
float noiseP(vec2 p, float per)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float x0 = mod(i.x, per), x1 = mod(i.x + 1.0, per);
    return mix(mix(hash21(vec2(x0, i.y)), hash21(vec2(x1, i.y)), f.x),
               mix(hash21(vec2(x0, i.y + 1.0)), hash21(vec2(x1, i.y + 1.0)), f.x), f.y);
}

// The last stars: sparse red and brown dwarfs, round points.
vec3 embers(vec2 q, float sp, vec3 emberColor)
{
    vec3 c = vec3(0.0);
    for (int L = 0; L < 2; ++L) {
        float sc = 38.0 + 30.0 * float(L);
        vec2 g = q * sc + float(L) * 17.0;
        vec2 gi = floor(g), gf = fract(g);
        vec2 cc = 0.2 + 0.6 * vec2(hash21(gi), hash21(gi + 3.1));
        float h = hash21(gi + 7.9);
        float on = step(1.0 - 0.12 * sp, h);
        float d = length(gf - cc);
        vec3 sc3 = mix(vec3(0.35, 0.06, 0.04), emberColor, hash21(gi + 1.3));
        c += sc3 * on * (smoothstep(0.12, 0.0, d) * 1.4 + exp(-d * 9.0) * 0.12);
    }
    return c;
}

void main()
{
    float sp = (starP > 0.01 ? starP : 0.5);
    float gp = (glowP > 0.01 ? glowP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);
    float swell = clamp(audioSwell, 0.0, 1.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    float T = sceneTime + sceneAdvance * 0.5;

    vec3 emberColor = max(imgPalette(0.1 + hue * 0.159), vec3(0.42, 0.16, 0.10));
    vec3 diskHot  = vec3(1.0, 0.55, 0.25);
    vec3 diskCool = mix(vec3(0.45, 0.08, 0.04), emberColor, 0.3);

    // The last black hole, a little off centre.
    vec2 p = uv - vec2(0.08, 0.03);
    float r = length(p);
    float Rs = 0.15;                                   // shadow radius
    float thetaE = 0.28;                               // Einstein radius

    // Background: the last embers, lensed -- the star field is pulled around
    // the hole (thin-lens deflection beta = theta - thetaE^2 / theta) and
    // drifts past very slowly.
    vec2 src = p - normalize(p + 1e-5) * thetaE * thetaE / max(r, 1e-3);
    vec2 drift = vec2(T * 0.0015, T * 0.0004);
    vec3 col = embers(src + drift, sp, emberColor) * gp;
    // Einstein ring: a faint glow where the lensing piles light up.
    col += emberColor * 0.08 * exp(-pow((r - thetaE) / 0.02, 2.0)) * gp;
    // The dim cosmic haze, lensed with the rest.
    col += vec3(0.05, 0.02, 0.05) * smoothstep(0.2, 0.9, noise2(src * 2.0 + drift * 5.0));

    // The disk: thin, seen nearly edge-on, turning slowly; streaks of embers
    // along the orbit, the approaching side (left) brighter and hotter.
    float incl = 0.16;
    vec2 dq = vec2(p.x, p.y / incl);
    float dr = length(dq) / Rs;
    float dang = atan(dq.y, dq.x);
    float streak = noiseP(vec2((dang - T * 0.05) / 6.2831853 * 32.0, dr * 7.0), 32.0);
    streak = 0.45 + 0.8 * streak * streak;
    float diskBand = smoothstep(1.55, 1.8, dr) * smoothstep(5.8, 3.2, dr);
    float beam = 1.0 + 0.7 * (-p.x / max(length(dq), 1e-3));             // Doppler beaming
    vec3 diskC = mix(diskCool, diskHot, smoothstep(4.5, 1.8, dr)) * beam * streak;
    float diskA = diskBand * (0.85 + 0.5 * swell) * gp;

    // The far side of the disk, lensed up over the top of the shadow and
    // under its bottom: a halo hugging the hole (Interstellar's loop).
    float hr = r / Rs;
    float halo = smoothstep(1.02, 1.12, hr) * smoothstep(1.9, 1.3, hr);
    float hang = atan(p.y, p.x);
    halo *= 0.35 + 0.65 * abs(sin(hang));                                  // thickest above and below
    float hStreak = noiseP(vec2((hang + T * 0.05) / 6.2831853 * 38.0, hr * 9.0), 38.0);
    col += mix(diskCool, diskHot, 0.6) * halo * (0.5 + 0.7 * hStreak) * (0.7 + 0.5 * swell) * gp
         * (1.0 + 0.5 * (-p.x / max(r, 1e-3)));

    // The shadow and its photon ring.
    float shadow = smoothstep(1.0, 0.97, hr);
    col *= 1.0 - shadow;
    col += diskHot * exp(-pow((hr - 1.02) / 0.02, 2.0)) * (0.55 + 0.3 * swell + 0.25 * audioKick) * gp;

    // The near side of the disk crosses in front of the shadow; the far side
    // of the flat image lies behind it and stays hidden.
    float front = (dq.y < 0.0) ? 1.0 : (1.0 - shadow);
    col = mix(col, diskC, clamp(diskA * front, 0.0, 1.0) * 0.9);

    // The vast emptiness around it all.
    vec3 voidColor = mix(vec3(0.045, 0.02, 0.06), vec3(0.01, 0.006, 0.018), length(uv));
    col = max(col, voidColor * (1.0 + swell * 0.5));

    col *= 0.9 + 0.2 * audioLevel;
    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
