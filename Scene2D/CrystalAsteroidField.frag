#version 330 core
out vec4 fragColor;
/**
 * @file CrystalAsteroidField.frag
 * @brief CRYSTAL ASTEROID FIELD: An asteroid field made entirely of giant,
 * floating crystals. The crystals refract and scatter distant starlight,
 * lighting up like prisms in sync with the music.
 *   audioAdvance -> flight speed through the crystal field
 *   audioKick    -> flashes from light hitting the crystal facets
 *   audioSwell   -> overall ambient brightness and glow
 *   audioChromaHue-> palette offset for the refracted light
 *
 * Per-activation variety:
 *   densityP float density of the asteroid field (0.5..1.5)
 *   glowP float intensity of the crystal refraction (0.5..2.0)
 *   hueP float palette offset (0..6.28)
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
uniform float audioChromaHue;

uniform float densityP;
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
vec3 hash33(vec3 p) {
    p = vec3(dot(p,vec3(127.1,311.7, 74.7)),
             dot(p,vec3(269.5,183.3,246.1)),
             dot(p,vec3(113.5,271.9,124.6)));
    return fract(sin(p)*43758.5453123);
}
mat2 rotM(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c);
}

// Distance to a faceted crystal (octahedron/diamond shape)
float sdOctahedron(vec3 p, float s) {
    p = abs(p);
    return (p.x + p.y + p.z - s) * 0.57735027;
}

// Global variables for raymarching
float hitGlow = 0.0;
vec3 hitColor = vec3(0.0);

float map(vec3 p, float dp) {
    // Break space into grid cells for the asteroids
    float cellSize = 3.0 / dp;
    vec3 cell = floor(p / cellSize);
    vec3 fractP = fract(p / cellSize) * cellSize - (cellSize * 0.5);

    // Hash based on cell
    vec3 h = hash33(cell);

    // Determine if cell has a crystal (density control)
    if (h.x > 0.74) {
        return 1e10; // Empty cell
    }

    // Offset position within cell
    vec3 pos = fractP - (h - 0.5) * (cellSize * 0.5);

    // Random rotation for the crystal based on time and its seed
    float rotSpeed = (h.y - 0.5) * time;
    pos.xy = rotM(rotSpeed + h.x * 6.28) * pos.xy;
    pos.xz = rotM(rotSpeed * 0.5 + h.z * 6.28) * pos.xz;

    // Random size
    float size = 0.2 + h.z * 0.5;

    // Shape is a faceted octahedron stretched in one axis
    vec3 scale = vec3(1.0, 1.0 + h.y * 2.0, 1.0);
    float d = sdOctahedron(pos / scale, size) * min(scale.x, min(scale.y, scale.z));

    hitGlow = h.z; // Use seed for glow intensity/color

    return d;
}

vec3 calcNormal(vec3 p, float dp) {
    vec2 e = vec2(0.01, 0.0);
    return normalize(vec3(
        map(p + e.xyy, dp) - map(p - e.xyy, dp),
        map(p + e.yxy, dp) - map(p - e.yxy, dp),
        map(p + e.yyx, dp) - map(p - e.yyx, dp)
    ));
}

void main()
{
    float dp = (densityP > 0.01 ? densityP : 1.0);
    float gp = (glowP > 0.01 ? glowP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float drift = time * 2.0 + audioAdvance * 5.0;
    vec3 ro = vec3(sin(time * 0.2) * 2.0, cos(time * 0.3) * 2.0, drift);

    vec3 ta = ro + vec3(0.0, 0.0, 1.0);
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);

    float roll = sin(time * 0.1) * 0.2;
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.2 * ww);

    float d = 0.0;
    vec3 p;
    float g = 0.0;

    for (int i = 0; i < 60; ++i) {
        p = ro + rd * d;
        float ds = map(p, dp);
        // Camera clearance bubble: the field is dense enough now that the
        // flight regularly passed THROUGH a crystal -- one flat colour wall.
        ds = max(ds, 0.7 - d);
        g = hitGlow;
        if (ds < 0.01) break;
        d += ds * 0.8;
        if (d > 40.0) break;
    }

    vec3 col = vec3(0.0);

    // Background light (a distant nebula or star illuminating the field)
    vec3 bgLightDir = normalize(vec3(0.5, 0.5, 1.0));
    vec3 bgCol = imgPalette(0.2) * (0.18 + audioSwell * 0.25);

    if (d < 40.0) {
        vec3 n = calcNormal(p, dp);

        // Base color based on the crystal's unique seed
        vec3 crysColor = imgPalette(g + audioCentroid * 0.1);

        // Lighting
        float dif = max(dot(n, bgLightDir), 0.0);
        float backLight = max(dot(n, -bgLightDir), 0.0);

        // Fake refraction / subsurface scattering
        float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
        float internalGlow = backLight * 0.5 + fresnel * 0.5;

        col = crysColor * (0.22 + dif * 1.1);
        // Rim light so a crystal facing away from the key light still has a
        // silhouette instead of reading as a flat black quad.
        col += crysColor * fresnel * 0.6;
        col += crysColor * internalGlow * 1.5 * gp * (1.0 + audioSwell);

        // Specular flashes matching audio kicks (facets catching light perfectly)
        float spec = pow(max(dot(reflect(bgLightDir, n), -rd), 0.0), 32.0);

        // Flash logic based on time and the crystal's seed
        float flash = step(0.75, hash11(g * 100.0 + floor(time * 1.50)));
        col += crysColor * spec * (1.0 + flash * audioKick * 10.0) * gp;

        // Distance fog
        col = mix(col, bgCol, smoothstep(10.0, 40.0, d));
        // Weiche MATERIALISIERUNG: die alte harte Blase (2.2) liess jeden
        // Kristall beim Grenzuebertritt schlagartig als Riesenmenge
        // aufploppen -- jetzt blendet Naehe sanft ein.
        col = mix(bgCol, col, smoothstep(0.7, 3.2, d));
    } else {
        col = bgCol;

        // Round, jittered stars. The old code lit ENTIRE floor(uv*100)
        // cells -- the user-reported huge square pixels.
        vec2 sgrid = uv * 40.0;
        vec2 sid = floor(sgrid);
        vec2 sf = fract(sgrid) - 0.5;
        float sh = hash11(dot(sid, vec2(12.3, 45.6)));
        if (sh > 0.88) {
            vec2 spos = (vec2(fract(sh * 7.31), fract(sh * 13.7)) - 0.5) * 0.8;
            float sd = length(sf - spos);
            float twinkle = 0.65 + 0.35 * sin(time * (1.0 + 2.0 * fract(sh * 29.0)) + sh * 40.0);
            col += imgPalette(sh) * exp(-sd * sd * 220.0) * twinkle * (0.7 + audioSwell);
        }
    }

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
