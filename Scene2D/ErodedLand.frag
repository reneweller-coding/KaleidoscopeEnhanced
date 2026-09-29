#version 330 core
out vec4 fragColor;
/**
 * @file ErodedLand.frag
 * @brief ERODED LAND: a slow glide over a worn mountain range -- long smooth
 * valleys and sharp crests (fractal terrain whose octaves are damped where
 * the slope is already steep, the classic erosion look), grass on the valley
 * floors, bare rock on the flanks, snow on the ridges, lakes in the hollows,
 * the far ranges fading into blue haze.  The sun wheels slowly overhead, so
 * the relief keeps turning in the light.
 *
 * This scene used to shade the CfxErosion droplet simulation from straight
 * above; that simulation ground its terrain into pixel speckle within
 * seconds and the scene was a purple noise field (catalogue review
 * 29.09.2026).  The analytic terrain needs no compute pass.
 *
 * Audio Reactivity:
 *  - audioRoughness -> RELIEF STEEPNESS of the lighting: consonant music
 *                      shades the land gently, dissonant clusters harshly
 *  - audioSharpness -> SPECULAR TIGHTNESS of the sun glint on the lakes
 *  - audioMode      -> SUNLIGHT COLOUR: cold overcast (minor) .. golden (major)
 *  - audioKick      -> the lakes catch the light (light only)
 *  - audioBeat      -> light pulse over the whole image
 *  - sceneTime / sceneAdvance -> the glide and the wheeling sun (continuous)
 */

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform vec2  resolution;
uniform float time;
uniform float interpolation;

uniform float sceneTime;
uniform float sceneAdvance;
uniform float audioLevel;
uniform float audioBeat;
uniform float audioKick;
uniform float audioAmbient;
uniform float audioChromaHue;
uniform float audioAdvance;
uniform float audioValence;
uniform float audioRoughness;   // 0=consonant .. 1=dissonant -> relief steepness
uniform float audioSharpness;   // 0=dull .. 1=bright/harsh -> sun-glint tightness
uniform float audioMode;        // 0=minor/cold .. 1=major/warm -> sunlight colour

uniform float sunP;
uniform float waterP;

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

// Sine-free hash (Hoskins): the octaves reach large coordinates, where
// fract(sin(x) * 43758) loses precision on the GPU.
float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// Value noise with analytic derivatives (quintic fade).
vec3 noised(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
    float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
    return vec3(a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y,
                du * (vec2(b - a, c - a) + (a - b - c + d) * u.yx));
}

const mat2 M2 = mat2(1.6, -1.2, 1.2, 1.6);
const float HS = 60.0;          // height scale (world units)
const float XS = 0.0085;        // horizontal frequency of the broadest octave

// Terrain height: each octave is damped by the slope accumulated so far
// (1 / (1 + |grad|^2)) -- steep flanks stay smooth, flats get detail,
// crests come out sharp.  `oct` octaves.
float terrain(vec2 x, int oct)
{
    vec2 p = x * XS;
    float a = 0.0, b = 1.0;
    vec2 d = vec2(0.0);
    for (int i = 0; i < 9; ++i) {
        if (i >= oct) break;
        vec3 n = noised(p);
        d += n.yz;
        a += b * n.x / (1.0 + dot(d, d));
        b *= 0.5;
        p = M2 * p;
    }
    return HS * a - 12.0;
}

vec3 calcNormal(vec3 pos, float t)
{
    vec2 e = vec2(0.002 * t + 0.02, 0.0);
    return normalize(vec3(terrain(pos.xz - e.xy, 8) - terrain(pos.xz + e.xy, 8),
                          2.0 * e.x,
                          terrain(pos.xz - e.yx, 8) - terrain(pos.xz + e.yx, 8)));
}

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    float T = sceneTime + sceneAdvance * 0.8;

    // The glide: steady along z with a gentle sway; the height follows the
    // land ahead, smoothed over a long stretch so it never bobs.
    float z = T * 7.0;
    vec3 ro = vec3(40.0 * sin(T * 0.013), 0.0, z);
    float ground = 0.0;
    for (int k = 0; k < 5; ++k)
        ground = max(ground, terrain(ro.xz + vec2(12.0 * sin(float(k) * 2.1), float(k) * 25.0), 3));
    ro.y = ground + 34.0;
    vec3 ta = ro + vec3(0.25 * sin(T * 0.021), -0.28, 1.0);
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.3 * ww);

    // The sun wheels slowly and stays low enough to rake the relief.
    float sa = T * 0.02 + 2.2;
    vec3 L = normalize(vec3(cos(sa), 0.35 + 0.25 * clamp(sunP, 0.0, 1.0), sin(sa)));
    vec3 sunCol = mix(vec3(0.82, 0.9, 1.08), vec3(1.15, 1.0, 0.78), clamp(audioMode, 0.0, 1.0)) * (1.0 + 0.1 * audioBeat);

    // Sky and haze.
    vec3 skyC = mix(vec3(0.55, 0.68, 0.85), vec3(0.2, 0.36, 0.66), clamp(rd.y * 2.0, 0.0, 1.0));
    skyC = mix(skyC, imgPalette(0.55) * 0.9, 0.1);
    float sunA = max(dot(rd, L), 0.0);
    vec3 col = skyC + sunCol * (pow(sunA, 400.0) * 2.0 + pow(sunA, 8.0) * 0.18);
    vec3 hazeC = mix(vec3(0.62, 0.72, 0.85), sunCol * 0.8, pow(sunA, 4.0) * 0.4);

    // March the terrain.
    float wl = 2.0 + 5.0 * clamp(waterP, 0.0, 1.0);                // lake level
    float t = 1.0;
    float hit = 0.0;
    vec3 p = ro;
    for (int i = 0; i < 160; ++i) {
        p = ro + rd * t;
        float h = max(terrain(p.xz, 5), wl);
        float dh = p.y - h;
        if (dh < 0.002 * t) { hit = 1.0; break; }
        t += dh * 0.45;
        if (t > 900.0) break;
    }

    if (hit > 0.5) {
        float hT = terrain(p.xz, 8);
        bool lake = hT < wl;
        vec3 n = lake ? vec3(0.0, 1.0, 0.0) : calcNormal(p, t);
        // Relief contrast: dissonance steepens the shading.
        vec3 ns = normalize(vec3(n.x, n.y / (1.0 + 0.6 * clamp(audioRoughness, 0.0, 1.0)), n.z));
        float dif = max(dot(ns, L), 0.0);
        // A short shadow ray across the neighbouring ridges.
        float sh = 1.0;
        float st = 2.0;
        for (int k = 0; k < 16; ++k) {
            vec3 q = p + L * st;
            float dq = q.y - terrain(q.xz, 4);
            sh = min(sh, clamp(10.0 * dq / st, 0.0, 1.0));
            st += 3.0 + st * 0.3;
            if (sh < 0.01 || q.y > 80.0) break;
        }
        float amb = 0.5 + 0.5 * n.y;

        vec3 alb;
        if (lake) {
            vec3 R = reflect(rd, n);
            vec3 skyR = mix(vec3(0.55, 0.68, 0.85), vec3(0.2, 0.36, 0.66), clamp(R.y * 2.0, 0.0, 1.0));
            float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
            float specPow = mix(60.0, 400.0, clamp(audioSharpness, 0.0, 1.0));
            vec3 wcol = vec3(0.03, 0.12, 0.16);
            col = mix(wcol, skyR, fres) + sunCol * pow(max(dot(R, L), 0.0), specPow) * (1.2 + 1.5 * clamp(audioKick, 0.0, 1.0)) * sh;
            col *= 0.85 + 0.3 * clamp(audioAmbient, 0.0, 1.0);
        } else {
            // Grass in the valleys, rock on the flanks, snow on the crests.
            vec3 grass = mix(vec3(0.16, 0.26, 0.08), vec3(0.3, 0.33, 0.12), hash21(floor(p.xz * 0.3)) * 0.3 + 0.35);
            vec3 rock = mix(vec3(0.34, 0.28, 0.22), vec3(0.45, 0.42, 0.38), clamp((hT - 10.0) / 35.0, 0.0, 1.0));
            rock = mix(rock, rock * imgPalette(0.2) * 1.8, 0.15);
            float flat_ = smoothstep(0.72, 0.9, n.y);
            alb = mix(rock, grass, flat_ * smoothstep(30.0, 14.0, hT));
            float snow = smoothstep(26.0, 34.0, hT + 10.0 * (n.y - 0.75)) * smoothstep(0.55, 0.75, n.y);
            alb = mix(alb, vec3(0.9, 0.93, 0.98), snow);
            col = alb * (sunCol * dif * sh * 1.5 + vec3(0.35, 0.42, 0.55) * amb * 0.75);
        }
        // Aerial perspective.
        float fog = 1.0 - exp(-t * 0.0032);
        col = mix(col, hazeC, fog);
    }

    col *= 0.9 + 0.2 * audioLevel;
    col = col / (1.0 + 0.3 * max(col.r, max(col.g, col.b)));
    col = pow(clamp(col, 0.0, 1.0), vec3(0.9));
    fragColor = vec4(col, interpolation);
}
