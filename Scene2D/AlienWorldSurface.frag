#version 330 core
out vec4 fragColor;
/**
 * @file AlienWorldSurface.frag
 * @brief ALIEN WORLD SURFACE: standing on the ground of another world. A
 * raymarched terrain of ridged mountains and wind-carved spires runs back to
 * a real horizon; over it hangs an alien sky with a low sun, a banded gas
 * giant with its ring seen edge-on, a second small moon, and high cirrus
 * that drifts across both. Bioluminescent growth glows in the hollows where
 * the light does not reach, and a haze layer separates every ridge line from
 * the one behind it -- the depth cue that makes a landscape read as vast.
 *   audioAdvance -> the walk forward across the terrain
 *   audioSwell   -> haze depth and the glow of the bioluminescent growth
 *   audioKick    -> a pulse through the glowing flora
 *   audioBass    -> ridge relief (the mountains breathe)
 *   audioBeatPhase-> slow pulse in the gas giant's aurora
 *   audioChromaHue-> sky and flora hue follow the musical key
 *
 * Per-activation variety:
 *   reliefP float mountain relief / how jagged the world is (0.5..1.8)
 *   skyP    float gas giant size in the sky                 (0.5..1.7)
 *   glowP   float bioluminescence intensity                 (0.5..2.0)
 *   hueP    float palette offset                            (0..6.28)
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
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioBeatPhase;
uniform float audioChromaHue;

uniform float reliefP;
uniform float skyP;
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
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash31(vec3 p)  { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float noise3(vec3 p)
{
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = i.x + i.y * 57.0 + i.z * 113.0;
    float a = mix(hash11(n +   0.0), hash11(n +   1.0), f.x);
    float b = mix(hash11(n +  57.0), hash11(n +  58.0), f.x);
    float c = mix(hash11(n + 113.0), hash11(n + 114.0), f.x);
    float d = mix(hash11(n + 170.0), hash11(n + 171.0), f.x);
    return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}

float fbm3(vec3 p, int oct)
{
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 6; ++i) {
        if (i >= oct) break;
        s += a * noise3(p); p *= 2.02; a *= 0.5;
    }
    return s;
}

// RIDGED multifractal: the sharp crests are what make this read as an alien
// mountain range rather than as rolling dunes.
float terrainH(vec2 p, float relief)
{
    float h = 0.0, a = 1.0, f = 1.0;
    for (int i = 0; i < 7; ++i) {
        float n = noise2(p * f);
        n = 1.0 - abs(n * 2.0 - 1.0);     // ridge
        n *= n;
        h += n * a;
        f *= 2.03;
        a *= 0.47;
    }
    return (h - 0.9) * 2.6 * relief;
}

void main()
{
    float rel = (reliefP > 0.01 ? reliefP : 1.0);
    float sky = (skyP    > 0.01 ? skyP    : 1.0);
    float glw = (glowP   > 0.01 ? glowP   : 1.0);
    float hue = (hueP    > 0.01 ? hueP    : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // The walk: slow, and pushed by the music through audioAdvance.
    float t = time * 0.06 + audioAdvance * 0.22;

    // Ride the terrain: a fixed eye height buries the camera the moment a
    // ridge is taller than it is (the first cut filmed the inside of a
    // mountain).  Sample the ground under the camera and fly above it.
    vec2 camXZ = vec2(0.0, t * 14.0);
    float groundY = terrainH(camXZ * 0.045, rel * 1.10) * 5.0;
    // Camera height needs BOTH a clearance above the ground under it and an
    // ABSOLUTE floor.  terrainH spans roughly -12..+13 here, so "local
    // ground + 17" still puts the eye eight units BELOW the peaks whenever
    // the camera happens to be over a deep valley -- which is why the frame
    // kept filling with rock no matter how far up the offset went.
    const float kPeak = 13.0;                     // highest terrain the fbm reaches
    float eyeY = max(groundY + 10.0, kPeak + 7.0) + 2.2 * sin(t * 0.19);
    vec3 ro = vec3(camXZ.x, eyeY, camXZ.y);
    float pitch = -0.070 + 0.025 * sin(t * 0.31);
    float yaw   = 0.16 * sin(t * 0.17);
    vec3 fwd = normalize(vec3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)));
    vec3 rgt = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3 upv = cross(rgt, fwd);
    float roll = 0.025 * sin(t * 0.23);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * rgt + ruv.y * upv + 1.35 * fwd);

    // A low sun, close to the horizon: long shadows, warm rim on every ridge.
    vec3 sun = normalize(vec3(-0.60, 0.34, 0.72));
    vec3 sunCol = mix(vec3(1.0, 0.62, 0.34), imgPalette(0.08), 0.30) * 1.5;
    vec3 skyTint = imgPalette(0.60);
    skyTint = mix(vec3(0.40, 0.52, 0.86), skyTint, 0.40);
    vec3 floraTint = imgPalette(0.34);
    floraTint = mix(vec3(0.25, 0.95, 0.80), floraTint, 0.35);

    float relief = rel * (1.0 + 0.09 * audioBass);

    // ---------------- sky ----------------
    vec3 col;
    {
        // A real atmospheric gradient: BRIGHT at the horizon, deep at the
        // zenith.  Without the bright band the ridges had nothing to stand
        // against -- ground and sky were the same violet and the horizon,
        // the one cue that makes a landscape read as vast, vanished.
        float up = clamp(rd.y * 2.1 + 0.06, 0.0, 1.0);
        vec3 horizonCol = mix(vec3(0.95, 0.74, 0.58), sunCol * 0.75, 0.35);
        vec3 zenithCol  = skyTint * 0.42;
        col = mix(horizonCol, zenithCol, pow(up, 0.75));
        // Sun disc and its bloom.
        float sd = max(dot(rd, sun), 0.0);
        col += sunCol * pow(sd, 900.0) * 3.0;
        col += sunCol * pow(sd, 8.0) * 0.28;
        col += sunCol * pow(sd, 2.0) * 0.10;

        // --- gas giant, low over the far ridges ---
        vec3 gg = normalize(vec3(0.46, 0.20, 0.86));
        float gr = 0.185 * sky;
        float gd = length(rd - gg * dot(rd, gg));
        float inGiant = smoothstep(gr, gr * 0.985, gd) * step(0.0, dot(rd, gg));
        if (inGiant > 0.001) {
            // Local sphere coordinates for the banding.
            vec3 gx = normalize(cross(gg, vec3(0.0, 1.0, 0.0)));
            vec3 gy = cross(gx, gg);
            vec2 lp = vec2(dot(rd, gx), dot(rd, gy)) / gr;
            float z = sqrt(max(0.0, 1.0 - dot(lp, lp)));
            vec3 sph = normalize(gx * lp.x + gy * lp.y + gg * z);

            float spin = t * 0.10;
            vec3 rot = sph;
            rot.xz = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * rot.xz;
            vec3 w1 = vec3(fbm3(rot * 2.2 + 5.0, 4),
                           fbm3(rot * 2.2 + 15.0, 4),
                           fbm3(rot * 2.2 + 25.0, 4)) - 0.5;
            float band = 0.5 + 0.5 * sin(sph.y * 11.0 + w1.x * 2.8);
            vec3 giantCol = mix(vec3(0.52, 0.40, 0.30), vec3(0.92, 0.84, 0.70), band);
            giantCol = mix(giantCol, imgPalette(0.16), 0.30);

            // Its own terminator, lit by the same sun.
            float glam = max(dot(sph, sun), 0.0);
            giantCol *= 0.28 + 1.55 * glam;   // it read as a dark disc against the amber sky
            // A slow aurora at the pole, breathing once per bar.
            float pole = smoothstep(0.72, 0.95, abs(sph.y));
            giantCol += floraTint * pole * (0.10 + 0.28 * (0.5 + 0.5 * sin(audioBeatPhase * 6.2831853)));

            col = mix(col, giantCol, inGiant);

            // Ring, seen nearly edge-on: a thin bright line across the disc.
            float ringY = abs(lp.y + 0.06);
            float ringBand = smoothstep(0.055, 0.030, ringY) * smoothstep(1.55, 1.10, length(lp));
            col += mix(vec3(0.85, 0.80, 0.70), imgPalette(0.24), 0.4)
                 * ringBand * 0.55 * step(0.35, length(lp));
        }

        // --- small close moon ---
        vec3 mn = normalize(vec3(-0.52, 0.30, 0.80));
        float mr = 0.052;
        float md = length(rd - mn * dot(rd, mn));
        float inMoon = smoothstep(mr, mr * 0.97, md) * step(0.0, dot(rd, mn));
        if (inMoon > 0.001) {
            vec3 mx = normalize(cross(mn, vec3(0.0, 1.0, 0.0)));
            vec3 my = cross(mx, mn);
            vec2 lp = vec2(dot(rd, mx), dot(rd, my)) / mr;
            float z = sqrt(max(0.0, 1.0 - dot(lp, lp)));
            vec3 sph = normalize(mx * lp.x + my * lp.y + mn * z);
            float crater = fbm3(sph * 7.0, 4);
            vec3 mcol = vec3(0.62, 0.60, 0.58) * (0.55 + 0.55 * crater);
            mcol *= 0.10 + 1.15 * max(dot(sph, sun), 0.0);
            col = mix(col, mcol, inMoon);
        }

        // --- high cirrus, drifting across the sky ---
        if (rd.y > 0.0) {
            vec3 cp = rd / max(rd.y, 0.02);
            vec2 cq = cp.xz * 0.16 + vec2(t * 0.25, t * 0.09);
            float cl = fbm3(vec3(cq, t * 0.05), 5);
            cl = smoothstep(0.52, 0.78, cl) * smoothstep(0.0, 0.22, rd.y);
            vec3 clCol = mix(skyTint, sunCol, 0.45) * (0.30 + 0.55 * pow(max(dot(rd, sun), 0.0), 3.0));
            col = mix(col, clCol, cl * 0.55);
        }
    }

    // ---------------- terrain ----------------
    float tHit = -1.0;
    {
        // Sphere-tracing a heightfield: step along the ray and bisect the
        // crossing.  Cheaper and far more stable than an SDF for ridges.
        float lastH = 0.0, lastT = 0.0;
        float tt = 0.6;
        for (int i = 0; i < 150; ++i) {
            vec3 p = ro + rd * tt;
            float h = p.y - terrainH(p.xz * 0.045, relief) * 5.0;
            if (h < 0.0) {
                // Linear interpolation back to the surface.
                tHit = lastT + (tt - lastT) * lastH / max(lastH - h, 1e-4);
                break;
            }
            lastH = h; lastT = tt;
            tt += max(0.35, h * 0.55);
            if (tt > 320.0) break;
        }
    }

    if (tHit > 0.0) {
        vec3 p = ro + rd * tHit;

        // Normal from the heightfield gradient.
        float e = 0.09 + tHit * 0.004;
        float hC = terrainH(p.xz * 0.045, relief) * 5.0;
        float hX = terrainH((p.xz + vec2(e, 0.0)) * 0.045, relief) * 5.0;
        float hZ = terrainH((p.xz + vec2(0.0, e)) * 0.045, relief) * 5.0;
        vec3 n = normalize(vec3(hC - hX, e, hC - hZ));

        float dif = max(dot(n, sun), 0.0);

        // Cheap terrain shadow: march a few long steps toward the sun.
        float sh = 1.0;
        for (int i = 1; i < 10; ++i) {
            float sd = float(i) * 2.6;
            vec3 sp = p + sun * sd;
            float hh = sp.y - terrainH(sp.xz * 0.045, relief) * 5.0;
            sh = min(sh, clamp(hh * 0.35 / sd, 0.0, 1.0));
            if (sh < 0.02) break;
        }
        sh = clamp(sh, 0.0, 1.0);

        // Rock: strata banding by altitude plus a fine grain.
        float strata = 0.5 + 0.5 * sin(p.y * 1.6 + fbm3(p * 0.12, 4) * 4.0);
        vec3 rock = mix(vec3(0.28, 0.18, 0.15), vec3(0.46, 0.36, 0.30), strata);
        rock = mix(rock, imgPalette(0.04), 0.22);
        rock *= 0.80 + 0.35 * fbm3(p * 0.9, 4);

        // Slope-dependent dust on the flats.
        // 'flat' is a reserved GLSL interpolation qualifier -- naming a
        // variable that is a compile error, not a warning.
        float flatness = smoothstep(0.55, 0.88, n.y);
        rock = mix(rock, mix(vec3(0.52, 0.42, 0.32), imgPalette(0.12), 0.3), flatness * 0.55);

        vec3 tcol = rock * (0.16 + 2.30 * dif * sh) * sunCol;
        // Sky fill from above -- without it the shadowed faces go black.
        tcol += rock * skyTint * (0.55 + 0.55 * n.y) * 2.10;
        // Bounce off the lit ridges: an airless-looking valley floor with no
        // indirect term reads as a hole cut in the picture.
        tcol += rock * sunCol * 0.16 * (0.4 + 0.6 * sh);

        // Bioluminescent growth: it lives in the hollows the sun misses, and
        // pulses with the music.
        // Real cavities only: keyed to a tight noise band and to how deep
        // the point sits below the local ridge line, NOT to (1 - dif) --
        // that made every shadowed face count as a hollow and painted the
        // whole world bioluminescent teal.
        float patch = smoothstep(0.56, 0.78, fbm3(p * 0.42, 4));
        float lowLying = smoothstep(0.30, -0.20, n.y - 0.55);
        float hollow = patch * (0.35 + 0.65 * lowLying) * (1.0 - flatness * 0.5);
        float pulse = 0.55 + 0.45 * sin(p.x * 0.35 + p.z * 0.28 - audioPhase * 0.8);
        tcol += floraTint * hollow * pulse
              * (0.35 + 0.55 * audioSwell + 0.9 * audioKick) * 0.30 * glw;

        // Distance haze: the depth cue that gives a landscape its scale.
        // Aerial perspective has to fade into THE SKY ALONG THIS RAY, not
        // into a colour of its own: with a separate fogCol the far ground
        // and the sky above it never met, so the horizon disappeared and
        // the frame read as one dark violet murk with no depth at all.
        // `col` already holds the sky for this exact direction.
        float fog = 1.0 - exp(-tHit * (0.0075 + 0.0025 * (1.0 - audioSwell)));
        vec3 fogCol = mix(col, sunCol * 0.65,
                          pow(max(dot(rd, sun), 0.0), 3.0) * 0.45);
        tcol = mix(tcol, fogCol, fog);

        col = tcol;
    }

    if (hue > 0.001) col = hueRot(col, 0.22 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.38 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
