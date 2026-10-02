#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file SolitonInternalWaveAndamanSea.frag
 * @brief SOLITON INTERNAL WAVE ANDAMAN SEA: the Andaman Sea seen from orbit,
 * in the sun glint -- the view the famous astronaut photographs show.  The
 * sea is a sheet of silver-bronze light fading to deep navy; across it run
 * trains of internal solitons, curved arcs of rough and smooth water that
 * spread from a submarine sill far off to one side, a new packet every
 * tide.  Islands with coral shallows and white surf lie in the glint;
 * popcorn cumulus throw small shadows on the water.  The trains travel at
 * their own slow, steady pace; the music is the light on the sea.
 *
 * Audio Reactivity:
 *   audioSwell   -> glint brightness and packet contrast (slow)
 *   audioMid     -> fine roughness texture in the packets (light)
 *   audioLevel   -> overall light
 *   sceneTime/sceneAdvance -> packet propagation and the slow pan (continuous)
 *
 * Per-activation variety:
 *   packetCountP float solitons per packet (3.0..8.0)
 *   pycnoclineP  float packet contrast (0.6..2.2)
 *   glitterP     float glint strength (0.8..2.5)
 *   roughnessP   float wind roughness texture (0.5..2.0)
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
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float packetCountP;
uniform float pycnoclineP;
uniform float glitterP;
uniform float roughnessP;

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
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 2.3; a *= 0.5; }
    return v;
}

/// One soliton train family: arcs spreading from a sill at `src`.  Returns
/// the roughness modulation (+ rough fronts, - smooth slicks behind them).
float solitons(vec2 w, vec2 src, float speed, float nSol, float phase0)
{
    float rr = length(w - src);
    // Packet phase: a new packet every 5 units of range; each packet a
    // rank-ordered train (largest leading), sech^2 profiles (KdV).
    float ph = rr * 7.0 - phase0 * speed;
    float x = mod(ph, 11.0);                           // 0..11 within the tide period
    float m = 0.0;
    for (int i = 0; i < 8; ++i) {
        if (float(i) >= nSol) break;
        float fi = float(i);
        float amp = 1.0 / (1.0 + fi * 0.35);
        float c = 0.8 + fi * 1.0;                        // leading soliton first
        float wdt = 0.28 + fi * 0.04;
        float s = 1.0 / cosh((x - c) / wdt);
        float s2 = 1.0 / cosh((x - c - wdt * 1.6) / wdt); // the smooth slick behind the front
        m += amp * (s * s - 0.6 * s2 * s2);
    }
    // Arcs fade away from the sill's main beam and with range.
    vec2 dir = normalize(w - src);
    m *= smoothstep(0.2, 0.75, dot(dir, normalize(vec2(1.0, 0.35)))) * exp(-rr * 0.12);
    return m;
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float nSol = clamp(packetCountP > 1.0 ? packetCountP : 5.0, 3.0, 8.0);
    float contrast = (pycnoclineP > 0.01 ? pycnoclineP : 1.2);
    float gl = (glitterP > 0.01 ? glitterP : 1.3);
    float rough = (roughnessP > 0.01 ? roughnessP : 1.0);

    // World coordinates: a very slow pan along the coast.
    float T = sceneTime + sceneAdvance * 0.6;
    vec2 w = p * 2.2 + vec2(T * 0.012, T * 0.004);

    // Sun glint: a broad lobe of specular light, off-centre.
    vec2 gc = vec2(0.15, 0.05) * 2.2 + vec2(T * 0.012, T * 0.004);
    float glint = exp(-dot(w - gc, w - gc) * 0.16);

    // Surface roughness: wind streaks plus the soliton trains.
    float streak = fbm(vec2(w.x * 1.2, w.y * 6.0) + 3.0) - 0.5;
    float fine = noise2(w * vec2(18.0, 60.0) + vec2(T * 0.05, 0.0)) - 0.5;
    float sol = solitons(w, vec2(-3.5, -1.6), 0.9, nSol, T * 0.25)
              + 0.6 * solitons(w, vec2(-2.8, 3.2), 0.9, nSol - 1.0, T * 0.25 + 11.0);
    float R = 1.0 + streak * 0.35 * rough + sol * 0.9 * contrast * (0.8 + 0.4 * swell);
    R += fine * 0.12 * rough * (0.6 + 0.8 * audioMid) * (1.0 + abs(sol) * 2.0);

    // In the glint core rough water scatters light away (darker); at the
    // edge it catches more (brighter) -- the reversal the photos show.
    float core = smoothstep(0.55, 0.95, glint);
    float bright = glint * (1.0 + (R - 1.0) * mix(1.2, -1.0, core));
    vec3 navy = vec3(0.02, 0.06, 0.13);
    vec3 glintC = mix(vec3(1.0, 0.93, 0.8), imgPalette(0.1) * 1.2, 0.12);
    vec3 col = navy * (0.8 + 0.4 * (R - 1.0)) + glintC * bright * sqrt(gl) * 0.95 * (0.85 + 0.3 * swell);   // sqrt: glitterP reaches 2.5, the glint blew out to white in the app

    // Islands: land with a coral-shallow halo and a surf line.
    float lf = fbm(w * 0.45 + vec2(5.0, 1.0)) + 0.18 * fbm(w * 3.0) + 0.02;
    float land = smoothstep(0.66, 0.67, lf);
    float shallow = smoothstep(0.62, 0.66, lf) * (1.0 - land);
    col = mix(col, mix(col, vec3(0.2, 0.75, 0.7) * (0.35 + 0.6 * glint), 0.7), shallow);
    float surf = exp(-abs(lf - 0.665) * 180.0);
    vec3 landC = mix(vec3(0.12, 0.2, 0.08), vec3(0.3, 0.3, 0.16), fbm(w * 6.0));
    landC = mix(landC, imgPalette(0.35) * 0.35, 0.2);
    col = mix(col, landC * (0.8 + 0.4 * fbm(w * 14.0)), land);
    col += vec3(0.9) * surf * 0.6;

    // Popcorn cumulus with their shadows.
    vec2 cw = w * 1.3 + vec2(T * 0.01, 0.0);
    float cd = fbm(cw * 3.0) + 0.35 * noise2(cw * 12.0);
    float cMask = smoothstep(0.62, 0.78, noise2(cw * 0.35 + 9.0));
    float cloud = smoothstep(0.8, 0.9, cd) * cMask;
    vec2 sw = cw + vec2(0.025, -0.02);
    float cShadow = smoothstep(0.8, 0.9, fbm(sw * 3.0) + 0.35 * noise2(sw * 12.0)) * cMask;
    col *= 1.0 - 0.3 * cShadow * (1.0 - cloud);
    col = mix(col, vec3(1.0) * (1.3 + 0.3 * swell), cloud);

    col *= 0.9 + 0.2 * audioLevel;
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
