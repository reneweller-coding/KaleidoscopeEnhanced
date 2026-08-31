#version 330 core
out vec4 fragColor;
/**
 * @file XenobiologicalBioship.frag
 * @brief XENOBIOLOGICAL BIOSHIP: The camera flies through the grotesque, pulsing
 * interior of a massive living spaceship. Fleshy walls, glowing veins, and
 * strange internal organs ripple and contract to the beat.
 *   audioAdvance -> flight speed through the biological tunnel
 *   audioKick    -> intense contractions and bright bioluminescence flashes
 *   audioSwell   -> ambient brightness of the organic tissue
 *   audioChromaHue-> palette offset for the bioluminescent fluids
 *
 * Per-activation variety:
 *   fleshP float complexity of the fleshy structures (0.5..1.5)
 *   veinP float intensity of the glowing veins (0.5..2.0)
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

uniform float fleshP;
uniform float veinP;
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

float fbm(vec3 p) {
    float f = 0.0, a = 0.5;
    for(int i = 0; i < 4; i++) { f += a * noise(p); p *= 2.0; a *= 0.5; }
    return f;
}

// Organic voronoi for fleshy veins
float voronoi(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    float minDist = 1.0;
    for (int z = -1; z <= 1; z++) {
        for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
                vec3 neighbor = vec3(float(x), float(y), float(z));
                vec3 point = vec3(
                    hash11(dot(i + neighbor, vec3(1.0, 57.0, 113.0))),
                    hash11(dot(i + neighbor, vec3(57.0, 113.0, 1.0))),
                    hash11(dot(i + neighbor, vec3(113.0, 1.0, 57.0)))
                );
                vec3 diff = neighbor + point - f;
                float dist = length(diff);
                if (dist < minDist) minDist = dist;
            }
        }
    }
    return minDist;
}

float hitGlow = 0.0;

float map(vec3 p, float fp) {
    // Breathing contraction of the tunnel
    float breath = sin(p.z * 0.5 - time * 2.0 + audioPhase) * 0.5 * audioLevel;

    // Main tunnel
    float d = 4.0 - length(p.xy) - breath;

    // Organic, uneven fleshy surface
    float n1 = fbm(p * 1.5 * fp);
    d -= n1 * 1.5;

    // Deep veins carving into the flesh
    float v = voronoi(p * 2.0);
    float vein = smoothstep(0.1, 0.0, v); // Inverse distance to cell centers for ridges
    d += vein * 0.8;

    // Check if we hit a vein for glowing
    if (d < 0.1 && v < 0.15) {
        hitGlow = smoothstep(0.15, 0.0, v);
    } else {
        hitGlow = 0.0;
    }

    return d;
}

vec3 calcNormal(vec3 p, float fp) {
    vec2 e = vec2(0.05, 0.0);
    return normalize(vec3(
        map(p + e.xyy, fp) - map(p - e.xyy, fp),
        map(p + e.yxy, fp) - map(p - e.yxy, fp),
        map(p + e.yyx, fp) - map(p - e.yyx, fp)
    ));
}

void main()
{
    float fp = (fleshP > 0.01 ? fleshP : 1.0);
    float vp = (veinP > 0.01 ? veinP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float drift = time * 3.0 + audioAdvance * 12.0;

    vec3 ro = vec3(0.5 * sin(time * 0.5), 0.5 * cos(time * 0.6), drift);

    // Spasmodic camera shake on kick
    ro.x += (hash11(time * 20.0) - 0.5) * audioKick * 0.3;
    ro.y += (hash11(time * 20.0 + 1.0) - 0.5) * audioKick * 0.3;

    vec3 ta = ro + vec3(sin(time * 0.2) * 0.5, cos(time * 0.3) * 0.5, 1.0);

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);

    float roll = 0.2 * sin(time * 0.4);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.2 * ww);

    float d = 0.0;
    vec3 p;
    float g = 0.0;
    int steps = 0;

    for (int i = 0; i < 70; ++i) {
        p = ro + rd * d;
        float ds = map(p, fp);
        g = hitGlow;
        steps = i;
        if (ds < 0.02 * (1.0 + d * 0.05)) break;
        d += ds * 0.7;
        if (d > 50.0) break;
    }

    vec3 col = vec3(0.0);

    vec3 fleshColor = mix(vec3(0.3, 0.05, 0.05), vec3(0.4, 0.1, 0.1), fbm(p * 5.0)); // Dark red meat
    vec3 veinColor = imgPalette(0.6 + audioCentroid * 0.2); // Bioluminescent fluids

    if (d < 50.0) {
        vec3 n = calcNormal(p, fp);

        // Spot light from "headlamp" / biological luminescence ahead
        vec3 lightDir = normalize(vec3(0.0, 0.0, p.z + 5.0) - p);
        float dif = max(dot(n, lightDir), 0.0);

        // SSS (Subsurface scattering fake)
        float sss = exp(-length(p - ro) * 0.1) * (0.5 + 0.5 * dot(n, -rd));

        col = fleshColor * (0.1 + dif * (0.5 + audioSwell * 0.5));
        col += vec3(0.6, 0.2, 0.2) * sss * (1.0 + audioSwell);

        // Wet specularity (slime)
        float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 32.0);
        col += vec3(0.5, 0.6, 0.6) * spec * (0.5 + fbm(p * 10.0));

        // Glowing veins
        if (g > 0.0) {
            float pulse = sin(p.z * 5.0 - time * 10.0) * 0.5 + 0.5;
            col += veinColor * g * pulse * vp * (1.0 + audioKick * 3.0);
        }

        col *= clamp(1.0 - float(steps) * 0.015, 0.1, 1.0);
    }

    // Internal biological fog / fluids.  The march runs to 50, but the rate
    // was 0.05 -- a half-distance of 14, so the interior was 71 % replaced by
    // the constant below at half depth and the frame measured sd 0.035, under
    // the catalogue's 10th percentile (0.045; median 0.12).  0.028 puts the
    // half-distance at half the marched depth, which is what "fluid-filled"
    // should look like without dissolving the anatomy into a flat wash.
    col = mix(col, vec3(0.05, 0.01, 0.01), 1.0 - exp(-d * 0.028));

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
