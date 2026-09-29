#version 330 core
out vec4 fragColor;
/**
 * @file PlanetaryRingRings.frag
 * @brief PLANETARY RING RINGS: skimming the ring plane of a super-Saturn.
 * The rings stretch to the horizon as a sheet of ringlets in perspective,
 * bright and dark bands running to the vanishing point, and close under
 * the camera the ice chunks themselves -- round, sunlit boulders of every
 * size -- drift past and out of view.  Above, the banded planet fills half
 * the sky with the rings' shadow lying across it, against black space.
 * The glide is steady; the music is the light: sparkle on the ice, the
 * sunlight on the planet.
 *
 *   sceneTime/sceneAdvance -> the glide over the rings (continuous)
 *   audioSwell    -> sunlight on planet and rings (slow)
 *   audioKick     -> glints on the ice chunks (light only)
 *   audioChromaHue-> photo tint of the planet's bands
 *
 * Per-activation variety:
 *   ringP float density of ringlets and chunks (0.5..1.5)
 *   sparkP float strength of the glints (0.5..2.0)
 *   hueP float palette offset (0..6.28)
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioValence;
uniform float audioChromaHue;

uniform float ringP;
uniform float sparkP;
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

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float noise1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash11(i), hash11(i + 1.0), f); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Ring brightness across the ring radius (the lateral coordinate here).
float ringlets(float x, float rp)
{
    float v = 0.5 + 0.5 * noise1(x * 3.0);
    v *= 0.55 + 0.45 * noise1(x * 17.0 * rp + 4.0);
    v *= 0.7 + 0.3 * noise1(x * 60.0 * rp + 9.0);
    v *= smoothstep(0.02, 0.06, abs(fract(x * 0.08) - 0.5));    // gaps
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float rp = (ringP > 0.01) ? ringP : 1.0;
    float spk = (sparkP > 0.01) ? sparkP : 1.0;
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.5;

    vec3 sunDir = normalize(vec3(-0.55, 0.3, 0.75));
    float horizon = -0.08;

    // Space.
    vec3 col = vec3(0.004, 0.005, 0.012);
    {
        vec2 g = p * 70.0;
        vec2 gi = floor(g), gf = fract(g);
        vec2 c = 0.2 + 0.6 * vec2(hash21(gi + 1.0), hash21(gi + 2.0));
        col += vec3(0.85, 0.9, 1.0) * smoothstep(0.1, 0.0, length(gf - c)) * step(0.975, hash21(gi)) * 0.7;
    }

    // The planet: a huge banded disc, lit from the left, rings' shadow on it.
    vec2 pc = vec2(0.28, 0.72);
    float R = 0.78;
    vec2 d = (p - pc) / R;
    float r2 = dot(d, d);
    if (r2 < 1.0 && p.y > horizon) {
        vec3 n = vec3(d, sqrt(1.0 - r2));
        float lat = d.y * 0.94 + d.x * 0.18;                  // bands tilted with the planet
        float band = noise1(lat * 7.0) * 0.55 + noise1(lat * 23.0 + 2.0) * 0.3 + noise1(lat * 70.0 + 5.0) * 0.15;
        vec3 bandC = mix(vec3(0.78, 0.6, 0.38), vec3(1.0, 0.94, 0.8), smoothstep(0.25, 0.75, band));
        bandC = mix(bandC, vec3(0.72, 0.55, 0.38), smoothstep(0.7, 0.9, noise1(lat * 5.0 + 7.0)) * 0.6);
        bandC = mix(bandC, imgPalette(0.1 + hue * 0.159), 0.15);
        float dif = max(dot(n, sunDir), 0.0);
        float term = smoothstep(-0.05, 0.25, dot(n, sunDir));
        vec3 pcol = bandC * (0.03 + 1.35 * dif) * term * (0.9 + 0.35 * swell);
        // The rings' shadow: a band across the planet just above the ring line.
        float sh = smoothstep(0.02, 0.0, abs(lat + 0.12) - 0.05) * (0.6 + 0.4 * noise1(lat * 90.0));
        pcol *= 1.0 - 0.75 * sh;
        // Limb darkening and a thin atmosphere rim.
        pcol *= 0.55 + 0.45 * n.z;
        pcol += vec3(0.9, 0.8, 0.6) * pow(1.0 - n.z, 6.0) * term * 0.4;
        col = mix(col, pcol, smoothstep(1.0, 0.995, r2));
    }

    // The ring plane below the horizon, in perspective.
    if (p.y < horizon) {
        float h = horizon - p.y;
        float z = 0.12 / h;                                   // depth
        float x = p.x * z;                                    // lateral = ring radius
        float lanes = ringlets(x * 2.0 + 30.0, rp);
        lanes *= 0.6 + 0.4 * noise1(x * 140.0 * rp + 3.0);
        // The flow of fine particles along the flight (texture streaming).
        float grain = noise2(vec2(x * 25.0, z * 8.0 + T * 3.0));
        vec3 ringC = mix(vec3(0.7, 0.58, 0.45), vec3(1.0, 0.97, 0.9), lanes);
        ringC = mix(ringC, vec3(0.6, 0.65, 0.72), smoothstep(0.6, 0.9, noise1(x * 1.3 + 50.0)) * 0.5);
        vec3 rc = ringC * (0.15 + 0.85 * lanes) * (0.55 + 0.35 * grain) * (0.85 + 0.4 * swell);
        // Distance haze toward the horizon (the rings get thin and bright).
        rc = mix(rc, ringC * 0.55 * lanes, smoothstep(2.0, 12.0, z));
        // The rings are a sheet of particles, not a floor: thin ringlets and
        // the gaps let the stars below shine through; far away (grazing
        // view) the sheet closes up.
        float opac = clamp(0.25 + 0.9 * lanes, 0.0, 1.0);
        opac = mix(opac, 1.0, smoothstep(1.5, 8.0, z));
        col = mix(col, rc, opac);

        // Ice chunks near the camera: depth layers of round, sunlit boulders
        // streaming toward and past the lens.
        for (int L = 0; L < 7; ++L) {
            float fl = float(L);
            float zl = 0.35 + fract(-T * 0.08 + fl / 7.0) * 3.2;        // layer depth, recycles far away
            float fade = smoothstep(3.55, 2.9, zl) * smoothstep(0.35, 0.6, zl);
            float cyc = floor((T * 0.08 + 1.0 - fl / 7.0));
            // Screen position of this layer's surface line.
            float ys = horizon - 0.12 / zl;
            float sx = p.x * zl;                                         // lateral in world
            float cell = 0.45;
            float ci = floor(sx / cell);
            for (int k = -1; k <= 1; ++k) {
                float cc = ci + float(k);
                float hsh = hash21(vec2(cc, fl + cyc * 7.0));
                if (hsh < 1.0 - 0.55 * rp) continue;
                float wx = (cc + 0.2 + 0.6 * hash21(vec2(cc, fl + 3.0 + cyc))) * cell;
                float size = 0.03 + 0.08 * pow(hash21(vec2(cc, fl + 5.0 + cyc)), 2.0);
                float wy = (hash21(vec2(cc, fl + 9.0 + cyc)) - 0.3) * 0.08; // above / below the plane
                vec2 sc = vec2(wx / zl, ys + wy / zl + size / zl);
                float sr = size / zl;
                vec2 dd = (p - sc) / sr;
                float rr = dot(dd, dd);
                if (rr < 1.0) {
                    vec3 n = vec3(dd.x, dd.y, sqrt(1.0 - rr));
                    // Lumpy ice: bump the normal.
                    n = normalize(n + 0.45 * vec3(noise2(dd * 3.0 + hsh * 20.0) - 0.5, noise2(dd * 3.0 + 7.0 + hsh * 20.0) - 0.5, 0.0));
                    float dif = max(dot(n, sunDir), 0.0);
                    vec3 ice = mix(vec3(0.62, 0.58, 0.52), vec3(0.95, 0.94, 0.92), hsh);
                    vec3 cc3 = ice * (0.05 + 1.2 * dif) * (0.85 + 0.3 * swell);
                    float glint = pow(max(dot(reflect(-sunDir, n), vec3(0.0, 0.0, 1.0)), 0.0), 40.0);
                    cc3 += vec3(1.0) * glint * (0.3 + 1.5 * kick) * spk;
                    col = mix(col, cc3, fade * smoothstep(1.0, 0.9, rr));
                }
            }
        }
    }
    // The ring's far edge: a bright thin line at the horizon.
    col += vec3(0.9, 0.85, 0.75) * exp(-abs(p.y - horizon) * 300.0) * 0.35 * (0.8 + 0.4 * swell);

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
