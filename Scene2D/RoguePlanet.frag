#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file RoguePlanet.frag
 * @brief ROGUE PLANET: A dark, frozen world drifting without a star. The atmosphere
 * is thick with volcanic ash and bioluminescent fissures glow intensely across
 * its frozen surface, pulsating to the beat.
 *   audioAdvance -> flight speed over the surface
 *   audioKick    -> flashes from volcanic vents
 *   audioSwell   -> ambient fog and bioluminescence glow
 *   audioChromaHue-> palette offset for the fissures
 *
 * Per-activation variety:
 *   reliefP float depth of the fissures (0.5..1.8)
 *   glowP float intensity of the bioluminescence (0.5..2.0)
 *   hueP float palette offset (0..6.28)
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
// Beide zaehlen ab DIESER Aktivierung statt ab Programmstart.
uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float reliefP;   ///< Relief knob, 0..1.
uniform float glowP;   ///< Glow / afterglow knob, 0..1.
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

/// Ridged noise for sharp fissures
float ridged(vec3 p) {
    float f = 0.0, a = 0.5;
    for(int i = 0; i < 5; i++) {
        float n = abs(noise(p) * 2.0 - 1.0);
        n = 1.0 - n;
        f += a * n * n; // sharpen
        p *= 2.0; a *= 0.5;
    }
    return f;
}

float hitMat = 0.0;
float fissureGlow = 0.0;

/// @brief The scene's distance field: distance from p to the nearest surface.
float map(vec3 p, float rp)
{
    float d = 1e10;
    float mat = 0.0;

    // Base terrain
    float ground = p.y + 1.0;

    // Add large rolling hills
    ground -= fbm(p * 0.2) * 2.0;

    // Add sharp fissures
    float ridges = ridged(p * 0.5);
    ground += ridges * 1.5 * rp;

    if (ground < d) { d = ground; mat = 1.0; }

    // Record glow amount (inversely proportional to ridge height)
    fissureGlow = smoothstep(0.8, 1.0, 1.0 - ridges) * smoothstep(-1.0, 0.0, p.y);

    hitMat = mat;
    return d;
}

/// @brief Surface normal of the distance field by central differences.
vec3 calcNormal(vec3 p, float rp)
{
    vec2 e = vec2(0.01, 0.0);
    return normalize(vec3(
        map(p + e.xyy, rp) - map(p - e.xyy, rp),
        map(p + e.yxy, rp) - map(p - e.yxy, rp),
        map(p + e.yyx, rp) - map(p - e.yyx, rp)));
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float rp = (reliefP > 0.01 ? reliefP : 1.0);
    float gp = (glowP > 0.01 ? glowP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // Die Flugstrecke ist die Koordinate, mit der das Rauschfeld
    // abgetastet wird -- sie MUSS pro Auftritt bei 0 anfangen.  Mit
    // `time` stand hier nach einer Stunde 7200, und `sin(n * 12.9898)`
    // hat bei solchen Argumenten keine Aufloesung mehr fuer benachbarte
    // Zellen: das Rauschen wird konstant und das Bild flach bis schwarz.
    // Der Musikschub bleibt, er zaehlt nur ebenfalls ab dem Auftritt.
    float drift = sceneTime * 2.0 + sceneAdvance * 5.0;

    vec3 ro = vec3(0.0, 2.0 + 0.5 * sin(time * 0.3), drift);
    vec3 ta = ro + vec3(0.0, -0.2, 1.0);

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);

    float roll = 0.05 * sin(time * 0.2);
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.2 * ww);

    float d = 0.0;
    vec3 p;
    float m = 0.0;
    int steps = 0;

    for (int i = 0; i < 90; ++i) {
        p = ro + rd * d;
        float ds = map(p, rp);
        m = hitMat;
        steps = i;
        if (ds < 0.01 * (1.0 + d * 0.05)) break;
        d += ds * 0.75;
        if (d > 80.0) { m = 0.0; break; }
    }

    vec3 bgCol = vec3(0.002, 0.003, 0.005); // pitch black sky, no stars
    vec3 col = bgCol;

    vec3 ventColor = imgPalette(0.8 + 0.1 * audioCentroid);

    if (m > 0.5) {
        vec3 n = calcNormal(p, rp);

        // No sun, only ambient and self-illumination
        vec3 albedo = vec3(0.115, 0.115, 0.135); // dark ice/rock

        col = albedo * (1.6 + 1.2 * max(dot(n, normalize(vec3(0.3, 0.8, -0.4))), 0.0));   // faint skyglow: dark, but a readable surface even in silence

        // Fissure glow
        // Re-evaluate glow at hit point
        float ridges = ridged(p * 0.5);
        float localGlow = smoothstep(0.7, 1.0, 1.0 - ridges);

        // Pulsing magma/bioluminescence
        float pulse = sin(p.x * 2.0 + p.z * 1.5 - time * 3.0) * 0.5 + 0.5;
        pulse = mix(pulse, 1.0, audioKick * 0.8);

        col += ventColor * localGlow * pulse * (0.9 + audioSwell * 1.4) * gp * 2.0;

        // Rim lighting from the glow
        float rim = 1.0 - max(dot(n, normalize(-rd)), 0.0);
        col += ventColor * smoothstep(0.6, 1.0, rim) * localGlow * 0.5 * gp;

        col *= clamp(1.0 - float(steps) * 0.01, 0.1, 1.0);
    }

    // Thick volcanic ash / fog near ground
    float fogY = exp(-max(p.y + 1.0, 0.0) * 0.5);
    float fogZ = exp(-d * 0.03);
    float fogDens = clamp(fogY * (1.0 - fogZ) * 1.5, 0.0, 1.0);

    // Fog is lit by the vents
    vec3 fogCol = mix(bgCol, ventColor * 0.3 * (1.0 + audioSwell), 0.5);

    col = mix(col, fogCol, fogDens);

    // General distance fade
    col = mix(bgCol, col, exp(-d * 0.02));

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
