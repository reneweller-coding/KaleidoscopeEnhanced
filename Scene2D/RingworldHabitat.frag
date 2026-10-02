#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file RingworldHabitat.frag
 * @brief RINGWORLD HABITAT: the camera glides low over the inner surface of
 * a colossal ring around its sun.  Ahead the land -- oceans, fields, shore
 * cities -- rises and rises until it arches overhead as a narrowing band
 * against black space, walled at both edges by the rim walls.  Shadow
 * squares orbiting the sun throw night bands across the arch; the cities in
 * them glitter.  The glide is steady; the music is the light.
 *   sceneTime/sceneAdvance -> glide along the ring (continuous)
 *   audioKick    -> city lights flare (light only)
 *   audioSwell   -> daylight and cloud brightness (slow)
 *   audioChromaHue-> photo tint of fields and cities
 *
 * Per-activation variety:
 *   cityP float density of city clusters (0.5..1.5)
 *   cloudP float cloud density (0.5..1.5)
 *   hueP float palette offset (0..6.28)
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float cityP;
uniform float cloudP;
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Pseudo-random number 0..1 from a float.
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21(vec2 p)  { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

/// @brief Smooth value noise.
float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = i.x + i.y * 57.0 + i.z * 113.0;
    return mix(
        mix(mix(hash11(n + 0.0), hash11(n + 1.0), f.x),
            mix(hash11(n + 57.0), hash11(n + 58.0), f.x), f.y),
        mix(mix(hash11(n + 113.0), hash11(n + 114.0), f.x),
            mix(hash11(n + 170.0), hash11(n + 171.0), f.x), f.y), f.z);
}

/// @brief Fractal noise: octaves of value noise.
float fbm(vec3 p) {
    float f = 0.0, a = 0.5;
    for(int i = 0; i < 5; i++) { f += a * noise(p); p *= 2.0; a *= 0.5; }
    return f;
}

float hitMat = 0.0;
float cityGlow = 0.0;
float g_rot = 0.0;                    ///< how far the ring has turned under us

const float RAD = 100.0;              ///< ring radius (the sun sits on the axis)
const float W   = 38.0;               ///< half width of the band

/// World -> ring coordinates: the ring turns about the X axis beneath the
/// camera, which is how the glide is done without the camera ever leaving
/// the geometry (V7b).
vec3 toRing(vec3 p)
{
    float c = cos(g_rot), s = sin(g_rot);
    return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z);
}

/// Point on the ideal surface below q: 3D noise there has no seam anywhere
/// around the ring (no atan wrap).
vec3 onSurface(vec3 q, float r) { return vec3(q.x, normalize(q.yz) * r); }

float terrainAt(vec3 q)
{
    vec3 qs = onSurface(q, RAD);
    return fbm(qs * 0.05) * 4.0 + fbm(qs * 0.2) * 1.0;
}

/// @brief The scene's distance field: distance from p to the nearest surface.
float map(vec3 p)
{
    vec3 q = toRing(p);
    float r = length(q.yz);
    float terrain = terrainAt(q);
    float waterLvl = 2.5;
    // Solid: outside radius RAD - height, inside the band.
    float ground = max((RAD - max(terrain, waterLvl)) - r, abs(q.x) - W);
    // Rim walls: thin and tall at both edges.
    float wall = max(abs(abs(q.x) - W) - 0.6, (RAD - 11.0) - r);
    float d = min(ground, wall);
    float mat = (wall < ground) ? 3.0 : ((terrain < waterLvl + 0.1) ? 1.0 : 2.0);

    float shore = smoothstep(waterLvl + 2.0, waterLvl, terrain);
    float cNoise = noise(onSurface(q, RAD) * 0.12);
    cityGlow = (mat == 2.0) ? shore * smoothstep(0.42, 0.6, cNoise) : 0.0;
    hitMat = mat;
    return d;
}

/// @brief Surface normal of the distance field by central differences.
vec3 calcNormal(vec3 p)
{
    vec2 e = vec2(0.1, 0.0);
    return normalize(vec3(
        map(p + e.xyy) - map(p - e.xyy),
        map(p + e.yxy) - map(p - e.yxy),
        map(p + e.yyx) - map(p - e.yyx)));
}

/// Shadow squares orbit the sun inside the ring: 1 = day, 0 = night.
float daylight(vec3 q)
{
    float a = atan(q.y, q.z);
    return smoothstep(-0.75, -0.15, sin(a * 4.0 + sceneTime * 0.035));
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float cp = (cityP > 0.01 ? cityP : 1.0);
    float clp = (cloudP > 0.01 ? cloudP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);
    float swell = clamp(audioSwell, 0.0, 1.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // The glide: the ring turns under a camera that stays put.
    float drift = sceneTime * 6.0 + sceneAdvance * 14.0;
    g_rot = drift / RAD;

    vec3 ro = vec3(8.0 * sin(sceneTime * 0.021), -(RAD - 9.0) + 1.5 * sin(sceneTime * 0.05), 0.0);
    // Forward and well up: the land ahead rises into the arch.
    vec3 ta = ro + vec3(0.0, 0.5, 1.0);
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.1 * ww);

    float d = 0.0;
    vec3 p = ro;
    float m = 0.0;
    for (int i = 0; i < 110; ++i) {
        p = ro + rd * d;
        float ds = map(p);
        m = hitMat;
        if (ds < 0.02 * (1.0 + d * 0.03)) break;
        d += ds * 0.8;
        if (d > 320.0) { m = 0.0; break; }
    }

    vec3 sunCol = vec3(1.0, 0.92, 0.8) * (1.05 + swell * 0.35);
    vec3 hazeC  = vec3(0.55, 0.72, 0.95) * (0.75 + swell * 0.3);
    vec3 cityCol = mix(vec3(1.0, 0.7, 0.35), imgPalette(0.8), 0.3);

    // Space beyond the band: black with stars, a faint blue rim of air.
    vec3 col = vec3(0.01, 0.015, 0.035);
    {
        vec3 sd = rd * 220.0;
        vec3 si = floor(sd), sf = fract(sd) - 0.5;
        float st = hash21(si.xy + si.z * 7.1);
        col += vec3(0.9, 0.95, 1.0) * smoothstep(0.12, 0.0, length(sf)) * step(0.985, st) * (0.4 + 0.6 * hash11(st * 91.0));
        col += hazeC * 0.12 * exp(-abs(rd.y) * 4.0);
    }

    if (m > 0.5) {
        vec3 q = toRing(p);
        vec3 n = calcNormal(p);
        vec3 sunDir = normalize(-p);                  // the sun is on the axis
        float dif = max(dot(n, sunDir), 0.0);
        float day = daylight(q);
        vec3 qs = onSurface(q, RAD);

        vec3 albedo;
        if (m == 1.0) {
            albedo = vec3(0.08, 0.25, 0.45);
            float spec = pow(max(dot(reflect(-sunDir, n), -rd), 0.0), 24.0);
            col = albedo * (0.25 + dif * sunCol) + spec * sunCol * 0.4;
        } else if (m == 2.0) {
            // Fields: a patchwork in natural tones with a tint of the photo.
            vec3 fi = floor(qs * 0.14);
            float fieldTone = hash21(fi.xy + fi.z * 3.7);
            vec3 field = mix(vec3(0.22, 0.42, 0.16), vec3(0.62, 0.55, 0.26), fieldTone);
            field = mix(field, imgPalette(0.25 + fieldTone * 0.3), 0.25);
            float hgt = terrainAt(q);
            field = mix(field, vec3(0.5, 0.45, 0.4), smoothstep(4.0, 5.0, hgt));   // bare highlands
            albedo = field;
            col = albedo * (0.2 + dif * sunCol) + albedo * 0.15;
        } else {
            albedo = vec3(0.22, 0.25, 0.32);             // rim wall
            col = albedo * (0.25 + dif * sunCol * 0.8);
        }
        // Night bands: the land goes deep blue and the cities come out.
        col = mix(col * vec3(0.05, 0.07, 0.14), col, day);
        // City lights: round jittered points on the surface, which fade to
        // their average glow in the distance (no sub-pixel sparkle).
        float glow = cityGlow * cp;
        if (glow > 0.0) {
            vec2 su = vec2(q.x, atan(q.y, q.z) * RAD) * 1.6;
            vec2 si = floor(su), sf = fract(su);
            vec2 jc = 0.25 + 0.5 * vec2(hash21(si), hash21(si + 5.3));
            float lit = step(0.35, hash21(si + 9.1));
            float pts = smoothstep(0.2, 0.0, length(sf - jc)) * lit + 0.12 * lit * exp(-length(sf - jc) * 5.0);
            pts = mix(pts, 0.05, smoothstep(45.0, 110.0, d));
            col += cityCol * glow * pts * ((1.0 - day) * 9.0 + 0.6) * (0.7 + 0.8 * audioKick);
        }

        // The ring's own air: the far arch pales into a bright blue haze.
        float atm = 1.0 - exp(-d * 0.0045);
        col = mix(col, hazeC * mix(0.12, 1.0, day), atm * 0.85);
    }

    // Cloud sheet at RAD - 17, above the camera: seen from below near us and
    // from above over the far arch.  Analytic crossings of a thin sheet.
    {
        float Rc = RAD - 17.0;
        vec2 o = ro.yz, v = rd.yz;
        float A = dot(v, v), B = dot(o, v), C = dot(o, o) - Rc * Rc;
        float disc = B * B - A * C;
        if (disc > 0.0 && A > 1e-5) {
            float sq = sqrt(disc);
            for (int k = 0; k < 2; ++k) {
                float t = (k == 0) ? (-B - sq) / A : (-B + sq) / A;
                if (t <= 0.0 || (m > 0.5 && t > d)) continue;
                vec3 cq = toRing(ro + rd * t);
                if (abs(cq.x) > W) continue;
                vec3 cs = onSurface(cq, Rc) * 0.08 + vec3(0.0, 0.0, sceneTime * 0.02);
                float cl = smoothstep(0.5, 0.8, fbm(cs)) * clp;
                float dayC = daylight(cq);
                vec3 cc = vec3(0.95, 0.96, 1.0) * (0.55 + 0.45 * swell) * mix(0.06, 1.0, dayC);
                float fogC = 1.0 - exp(-t * 0.0045);
                cc = mix(cc, hazeC * mix(0.12, 1.0, dayC), fogC * 0.7);
                col = mix(col, cc, clamp(cl * 0.75, 0.0, 1.0));
            }
        }
    }

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
