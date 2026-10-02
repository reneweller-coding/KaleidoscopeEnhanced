#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file TravertineTerracePools.frag
 * @brief TRAVERTINE TERRACE POOLS: a white limestone hillside of stacked
 * pools.  The crust is blinding white, the water in each pool is a shallow
 * turquoise mirror of the sky (the photo), and the rims are wet and
 * glassy where the water pours over them.  The sky light in the pools
 * rides the bass, the wet rims glint with the treble, the sun is the
 * swell, and the kick is a wader lifting off as a flash of white.
 * Camera height fixed.
 *
 * Audio Reactivity:
 *   audioBass  -> the sky in the pools (light)
 *   audioHigh  -> wet rim glints (light)
 *   audioSwell -> sunlight and the water level (slow)
 *   audioKick  -> a bird flash (light)
 *   audioLevel -> brightness
 *
 * Per-activation variety: camHP, detailP, stepsP, hueP.
 */
in vec3  vWorld;   ///< World position (from the vertex stage).
in vec2  vSurfUV;
in vec3  vNormal;   ///< Surface normal (from the vertex stage).
in float vPool;
in float vTerrace;
in float vDist;   ///< Distance (from the vertex stage).

uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float camHP;   ///< Camera height knob, 0..1.
uniform float stepsP;
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
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

/// @brief Pseudo-random number 0..1 from a 2D point.
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
/// @brief Smooth 2D value noise, 0..1.
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
/// @brief Fractal noise: octaves of value noise.
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 2.7; a *= 0.5; } return v; }

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float sun = 0.6 + 0.55 * clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.45 + sceneTime * 0.09;
    vec3 n = normalize(vNormal);
    vec3 L = normalize(vec3(0.42, 0.78, -0.36));
    float diff = max(dot(n, L), 0.0);

    // The crust: white travertine with a warm cream in the shadows and a
    // ripple grain that follows the slope.
    vec3 crust = mix(vec3(0.93, 0.91, 0.85), imgPalette(hue * 0.159 + 0.1) * 1.2, 0.2);
    crust *= 0.82 + 0.3 * fbm(vWorld.xz * 0.9);
    crust *= 0.78 + 0.35 * fbm(vWorld.xz * 4.0);
    // The photo lives in the crust as its mineral banding.
    crust = mix(crust, crust * (0.6 + 0.9 * img(clamp(vec2(fract(vWorld.x * 0.02), fract(vWorld.z * 0.014)), 0.0, 1.0))), 0.35);
    vec3 col = crust * (0.35 + 0.75 * diff) * sun;

    // The water in the pools: the level breathes with the swell, so a pool
    // fills and empties without the dam ever moving.
    float level = 0.35 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float wet = smoothstep(level - 0.25, level + 0.05, vPool);
    if (wet > 0.001)
    {
        // The sky in the water: the photo, turquoise, brighter with the bass.
        vec2 skyUV = clamp(vec2(vWorld.x * 0.006 + 0.5, 0.6 + vWorld.z * 0.0015), 0.0, 1.0);
        vec3 sky = img(skyUV) * mix(vec3(0.35, 0.85, 0.9), imgPalette(hue * 0.159 + 0.5), 0.3);
        sky *= 0.7 + 0.9 * bass;
        // Depth: the middle of a pool is deeper and bluer.
        vec3 water = mix(sky, mix(vec3(0.05, 0.42, 0.5), imgPalette(hue * 0.159 + 0.45) * 0.5, 0.35), vPool * 0.55);
        // Ripples on the surface, moving on the clock.
        float rip = fbm(vWorld.xz * 2.2 + vec2(clock * 0.5, clock * 0.25));
        water *= 0.82 + 0.35 * rip;
        // Caustics on the shallow floor.
        water += vec3(1.0, 0.98, 0.9) * pow(smoothstep(0.5, 0.85, rip), 2.0) * (0.25 + 0.3 * bass) * sun * 0.6;
        col = mix(col, water * sun, wet * 0.92);
    }
    // The rim: wet, glassy, and where the water pours it catches the sun.
    float lip = smoothstep(0.35, 0.05, vPool);
    float pourNoise = fbm(vec2(vWorld.x * 0.5, vTerrace * 6.0 - clock * 1.4));
    float pour = lip * smoothstep(0.45, 0.8, pourNoise);
    col = mix(col, col * vec3(0.85, 0.95, 1.0) * 1.1, lip * 0.5);
    col += vec3(1.0, 0.99, 0.95) * pour * (0.3 + 0.5 * sun);
    // Glints on the wet lip, on the treble: round, jittered points.
    vec2 gg = vWorld.xz * 3.5;
    vec2 gc = floor(gg), gf = fract(gg) - 0.5;
    vec2 gj = vec2(hash21(gc + 1.7), hash21(gc + 6.3)) - 0.5;
    float glint = smoothstep(0.2, 0.05, length(gf - gj * 0.7)) * step(0.9, hash21(gc));
    col += vec3(1.0) * glint * lip * hi * 0.9;
    // A wader lifting off: a small white flash low over the terraces.
    float bph = fract(clock * 0.09);
    vec3 bird = vec3(mix(-30.0, 30.0, bph), 2.5 + 3.0 * sin(bph * 3.14159), 45.0);
    float bd = length(vWorld - bird);
    col += vec3(1.0, 0.98, 0.95) * exp(-bd * 0.6) * audioKick * 1.2;
    // Distance haze over the hill.
    float fog = 1.0 - exp(-max(vDist - 25.0, 0.0) * 0.006);
    vec3 fogCol = mix(vec3(0.82, 0.88, 0.95), imgPalette(hue * 0.159 + 0.6), 0.3) * sun;
    col = mix(col, fogCol, clamp(fog, 0.0, 0.85));
    col *= 0.9 + 0.2 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
