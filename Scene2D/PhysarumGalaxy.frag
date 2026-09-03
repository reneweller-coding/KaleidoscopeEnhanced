#version 330 core
out vec4 fragColor;
/**
 * @file PhysarumGalaxy.frag
 * @brief PHYSARUM GALAXY: the slime-mould simulation's trail map, wrapped
 * onto a slowly turning globe and lit like a galaxy seen from above.  A
 * million agents (texPhysarum, two species in R and G) grow, merge and
 * abandon vein networks; projected onto a sphere the veins become star
 * streams and the abandoned trails dark dust lanes.  The second species is
 * drawn as a colder, thinner web behind the first.
 *
 * Audio Reactivity:
 *   texPhysarum    -> the picture (star streams = trails)
 *   audioCentroid  -> which species dominates the light (bright mixes favour G)
 *   audioKick      -> a shockwave of light runs out along the veins
 *   audioSwell     -> globe radius breathes; halo brightens
 *   sceneAdvance   -> the globe turns; continuous, no jumps
 *   audioBass      -> core glow
 *
 * Per-activation variety: tiltP (globe tilt), gainP (trail light), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D texPhysarum;   // trail map (R/G = species pheromone), unit 11
uniform float interpolation;

uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioBass;
uniform float audioCentroid;
uniform float audioChromaHue;
uniform float audioValence;

uniform float tiltP;
uniform float gainP;
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

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float tilt = (tiltP > 0.001) ? tiltP : 0.5;
    float gain = (gainP > 0.05) ? gainP : 1.0;
    float hue  = (hueP > 0.001) ? hueP : 0.0;

    // Background: deep field of the photo, very dim, plus fixed stars.
    vec3 col = img(clamp(p * 0.3 + 0.5, 0.0, 1.0)) * 0.03;
    vec2 g = floor(p * 60.0);
    float hs = hash11(dot(g, vec2(1.0, 57.0)));
    col += vec3(0.8, 0.85, 1.0) * step(0.975, hs) * 0.4 * exp(-length(fract(p * 60.0) - 0.5) * 10.0);

    // The globe: radius breathes with the swell.
    float R = 0.62 + 0.06 * audioSwell;
    float r2 = dot(p, p) / (R * R);
    if (r2 < 1.0)
    {
        // Sphere point, tilted and turning.
        vec3 n = vec3(p / R, sqrt(1.0 - r2));
        float ct = cos(tilt), st = sin(tilt);
        n = vec3(n.x, ct * n.y - st * n.z, st * n.y + ct * n.z);
        float spin = sceneAdvance * 0.08;
        float cs = cos(spin), sn = sin(spin);
        n = vec3(cs * n.x - sn * n.z, n.y, sn * n.x + cs * n.z);
        // Equirectangular lookup into the trail map (it wraps).
        vec2 suv = vec2(atan(n.z, n.x) * 0.15915494 + 0.5, asin(clamp(n.y, -1.0, 1.0)) * 0.3183099 + 0.5);
        vec2 tr = texture(texPhysarum, suv).rg;

        // Kick shockwave: a ring of extra light running outward from the
        // core along whatever veins it crosses.
        float ring = exp(-abs(length(p) - (0.05 + 0.7 * (1.0 - audioKick))) * 25.0) * audioKick;

        // Two species: warm streams and a cold web; the centroid decides
        // which one carries the light.
        float wA = 1.0 - 0.6 * clamp(audioCentroid, 0.0, 1.0);
        float wB = 0.4 + 0.6 * clamp(audioCentroid, 0.0, 1.0);
        vec3 warm = imgPalette(hue * 0.159 + 0.05) * 1.3;
        vec3 cold = imgPalette(hue * 0.159 + 0.55);
        float a = smoothstep(0.03, 0.9, tr.r), b = smoothstep(0.03, 0.9, tr.g);
        vec3 veins = warm * a * wA + cold * b * wB;
        veins *= gain * (0.6 + 0.6 * audioLevel) * (1.0 + 2.0 * ring);

        // Dust lanes: where trails are faint the disc darkens.
        float dust = 1.0 - 0.6 * (1.0 - smoothstep(0.0, 0.25, tr.r + tr.g));
        // Limb darkening + core glow.
        float limb = pow(max(n.z, 0.0), 0.6);
        float core = exp(-dot(p, p) * 12.0) * (0.4 + 1.2 * audioBass);
        vec3 disc = veins * limb * dust + warm * core * 0.6;
        col = mix(col, disc, smoothstep(1.0, 0.97, r2));
    }
    // Halo around the globe.
    float halo = exp(-max(sqrt(dot(p, p)) - R, 0.0) * 9.0) * (0.15 + 0.35 * audioSwell);
    col += imgPalette(hue * 0.159 + 0.3) * halo * float(r2 >= 0.97);

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
