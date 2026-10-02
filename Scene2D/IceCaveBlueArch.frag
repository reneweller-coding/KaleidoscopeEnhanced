#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file IceCaveBlueArch.frag
 * @brief ICE CAVE BLUE ARCH: inside a glacier cave.  The walls and ceiling
 * are glacial ice lit from outside, glowing an impossible sapphire blue,
 * scalloped by meltwater into shallow cups whose rims catch the light; dark
 * bands of rock dust run through the ice; at the far end the mouth of the
 * cave opens onto white daylight.  A trickle of meltwater glints on the
 * floor.  The camera drifts slowly toward the mouth and back (bounded);
 * the music is the light in the ice.
 *
 * Audio Reactivity:
 *   audioSwell  -> the glow of the ice (slow)
 *   audioHigh   -> glints on the scallop rims and the water (light)
 *   audioKick   -> the daylight at the mouth brightens (light)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the drift, the water (continuous)
 *
 * Per-activation variety: scallopP (scallop size), dustP (dust bands), hueP.
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float scallopP;
uniform float dustP;
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

/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
vec3 hash33(vec3 p)
{
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
}
/// @brief Smooth 3D value noise, 0..1.
float noise3(vec3 p)
{
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = hash33(i).x, b = hash33(i + vec3(1, 0, 0)).x, c = hash33(i + vec3(0, 1, 0)).x, d = hash33(i + vec3(1, 1, 0)).x;
    float e = hash33(i + vec3(0, 0, 1)).x, f1 = hash33(i + vec3(1, 0, 1)).x, g = hash33(i + vec3(0, 1, 1)).x, h = hash33(i + vec3(1, 1, 1)).x;
    return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, f1, f.x), mix(g, h, f.x), f.y), f.z);
}

float g_sc = 1.0;

/// Scallops: Voronoi cells on the wall; each cell a shallow cup.
float scallop(vec3 p)
{
    vec3 g = p * 1.6 / g_sc;
    vec3 gi = floor(g), gf = fract(g);
    float d1 = 9.0;
    for (int k = 0; k < 27; ++k) {
        vec3 o = vec3(k % 3, (k / 3) % 3, k / 9) - 1.0;
        vec3 c = o + hash33(gi + o);
        d1 = min(d1, dot(gf - c, gf - c));
    }
    return d1;                                    // 0 in the cup centre, ~0.5 at rims
}

/// The cave: a winding tube along z, flattened floor.
vec2 caveAxis(float z) { return vec2(1.2 * sin(z * 0.08), 0.5 * sin(z * 0.11 + 1.0)); }

/// @brief The scene's distance field: distance from p to the nearest surface.
float map(vec3 p)
{
    vec2 a = caveAxis(p.z);
    vec2 q = p.xy - a;
    float r = 3.0 + 0.8 * noise3(p * 0.15) + 0.4 * sin(p.z * 0.3);
    float tube = r - length(q * vec2(0.85, 1.0));
    float floorD = q.y + 1.9;
    float d = min(tube, floorD);
    d += 0.18 * scallop(p);                        // cups carved into the ice
    return d;
}

/// @brief Surface normal of the distance field by central differences.
vec3 calcNormal(vec3 p)
{
    vec2 e = vec2(0.02, 0.0);
    return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float swell = clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    g_sc = 0.7 + 0.6 * clamp(scallopP, 0.0, 1.0);
    float dust = clamp(dustP, 0.0, 1.0);

    // Drift toward the mouth and back, bounded (never runs off).
    float z = 6.0 * sin(T * 0.02);
    vec3 ro = vec3(caveAxis(z), z);
    ro.y += 0.2;
    vec3 ta = vec3(caveAxis(z + 6.0), z + 6.0);
    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);
    vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.2 * ww);

    float mouthZ = 40.0;
    vec3 day = vec3(1.0, 0.98, 0.95) * (1.4 + 0.8 * clamp(audioKick, 0.0, 1.0));
    vec3 blue = mix(vec3(0.1, 0.45, 0.95), imgPalette(0.55 + hue * 0.159), 0.1);

    float t = 0.1, hit = 0.0;
    vec3 p = ro;
    for (int i = 0; i < 140; ++i) {
        p = ro + rd * t;
        if (p.z > mouthZ) break;
        float d = map(p);
        if (d < 0.004) { hit = 1.0; break; }
        t += d * 0.7;
        if (t > 60.0) break;
    }

    vec3 col;
    if (hit > 0.5) {
        vec3 n = calcNormal(p);
        float sc = scallop(p);
        // Light from outside: the ice glows by transmission, brighter nearer
        // the mouth and where the ice is thin (the cup centres).
        float nearMouth = exp(-(mouthZ - p.z) * 0.05);
        float thin = smoothstep(0.35, 0.0, sc);
        vec3 ice = mix(vec3(0.02, 0.12, 0.35), blue * vec3(0.8, 1.05, 1.1), 0.4 + 0.55 * thin);
        ice *= (0.55 + 1.2 * nearMouth) * (0.85 + 0.35 * swell);
        // Rims: the scallop edges catch the daylight.
        float rim = smoothstep(0.25, 0.45, sc);
        vec3 L = normalize(vec3(0.0, 0.2, 1.0));
        ice += vec3(0.7, 0.9, 1.0) * rim * max(dot(n, L), 0.0) * (0.25 + 0.5 * hi) * (0.4 + nearMouth);
        // Dark bands of rock dust frozen in the ice.
        float band = smoothstep(0.08, 0.0, abs(sin(p.y * 1.7 + p.z * 0.25 + noise3(p * 0.3) * 2.0)) - 0.02);
        ice = mix(ice, vec3(0.05, 0.05, 0.07), band * 0.7 * dust);
        // Floor: gravel and a meltwater trickle glinting.
        if (p.y - caveAxis(p.z).y < -1.8) {
            vec3 grav = vec3(0.12, 0.13, 0.16) * (0.6 + 0.6 * noise3(p * 6.0));
            float stream = smoothstep(0.35, 0.1, abs(p.x - caveAxis(p.z).x - 0.5 * sin(p.z * 0.4)));
            grav = mix(grav, blue * 0.5 + day * 0.15 * nearMouth, stream);
            grav += vec3(1.0) * stream * pow(noise3(p * 12.0 + vec3(0.0, 0.0, -T)), 8.0) * (0.3 + 1.2 * hi);
            ice = mix(ice, grav, 0.85);
        }
        // Blue haze in the cave.
        float fog = 1.0 - exp(-t * 0.035);
        col = mix(ice, blue * 0.6 * (0.5 + nearMouth), fog);
    } else {
        // The cave mouth: daylight, a hint of snowy landscape.
        col = day;
        col = mix(col, vec3(0.85, 0.9, 1.0), smoothstep(-0.05, 0.1, rd.y) * 0.3);
        // Rays that slip past the wall right at the mouth: melt the edge
        // into glowing ice instead of a hard white ring.
        vec3 pm = ro + rd * ((mouthZ - ro.z) / max(rd.z, 1e-3));
        float rr = length((pm.xy - caveAxis(mouthZ)) * vec2(0.85, 1.0)) / 3.0;
        col = mix(col, mix(blue, vec3(0.8, 0.95, 1.0), 0.6) * 1.2, smoothstep(0.55, 0.95, rr));
    }
    // Glare from the mouth.
    vec3 mdir = normalize(vec3(caveAxis(mouthZ), mouthZ) - ro);
    col += day * pow(max(dot(rd, mdir), 0.0), 40.0) * 0.4;

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
