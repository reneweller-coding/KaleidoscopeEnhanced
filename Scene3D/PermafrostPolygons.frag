#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file PermafrostPolygons.frag
 * @brief PERMAFROST POLYGONS: the tundra from a low flight -- ice-wedge
 * polygons rimmed with ridges of moss and cotton grass, the troughs
 * between them flooded, every pond a mirror of the sky (the photo).  The
 * ponds brighten with the bass (the sky light in them), frost glints on
 * the ridges with the treble, the low arctic sun is the swell, the kick a
 * bird lifting as a flash of white.  Camera height fixed.
 *
 * Audio Reactivity:
 *   audioBass  -> pond light (light)
 *   audioHigh  -> frost glints (light)
 *   audioSwell -> sunlight (slow)
 *   audioKick  -> bird flash (light)
 *   audioLevel -> brightness
 *
 * Per-activation variety: camHP, detailP, cellP, hueP.
 */
in vec3  vWorld;   ///< World position (from the vertex stage).
in vec2  vSurfUV;
in vec3  vNormal;   ///< Surface normal (from the vertex stage).
in float vTrough;
in float vCell;
in float vDist;   ///< Distance (from the vertex stage).

uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float camHP;   ///< Camera height knob, 0..1.
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

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    vec3 n = normalize(vNormal);
    float sun = 0.85 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 L = normalize(vec3(-0.5, 0.35, 0.4));
    float diff = max(dot(n, L), 0.0);
    // Tundra: moss and lichen colours, the photo as the ground pattern.
    vec3 moss = mix(vec3(0.35, 0.4, 0.2), img(fract(vWorld.xz * 0.02 + vCell * 0.3)) * 1.2, 0.4);
    moss = mix(moss, moss * imgPalette(hue * 0.159 + 0.3) * 1.5, 0.25);
    float grass = hash21(floor(vWorld.xz * 2.0));
    moss *= 0.8 + 0.4 * grass;
    vec3 col = moss * (0.45 + 0.9 * diff * sun);
    // The ponds in the troughs: mirrors of the sky (the photo top), lit by the bass.
    vec3 V = normalize(vec3(0.0, camHP, 0.0) - vWorld);
    vec3 R = reflect(-V, vec3(0.0, 1.0, 0.0));
    vec3 skyRefl = img(clamp(vec2(0.5 + R.x * 0.4, 0.75 + R.y * 0.25), 0.0, 1.0)) * mix(vec3(0.7, 0.85, 1.0), imgPalette(hue * 0.159 + 0.6), 0.3);
    skyRefl *= (0.6 + 0.9 * clamp(audioBass, 0.0, 1.0)) * sun;
    float fres = 0.3 + 0.7 * pow(1.0 - max(V.y, 0.0), 2.0);
    vec3 pond = mix(vec3(0.08, 0.12, 0.15), skyRefl, fres);
    col = mix(col, pond, smoothstep(0.4, 0.9, vTrough));
    // Frost glints on the ridges (round), on the treble.
    vec2 gu = vWorld.xz * 1.5; vec2 gc = floor(gu); vec2 gf = fract(gu) - 0.5;
    vec2 go = vec2(hash21(gc + 1.3), hash21(gc + 5.9)) - 0.5;
    float glint = smoothstep(0.2, 0.05, length(gf - go * 0.6)) * step(0.92, hash21(gc)) * (1.0 - vTrough) * clamp(audioHigh * 2.0, 0.0, 1.0);
    col += vec3(1.0) * glint * diff;
    // A bird lifting on the kick: a white flash on a random cell.
    col += vec3(1.0) * audioKick * 0.6 * step(0.985, hash21(vec2(vCell, floor(sceneAdvance * 0.5)))) * (1.0 - vTrough);
    // Distance haze into a pale arctic sky.
    vec3 hazeCol = mix(vec3(0.7, 0.78, 0.85), imgPalette(hue * 0.159 + 0.6), 0.25) * sun;
    float fog = 1.0 - exp(-vDist * 0.007);
    col = mix(col, hazeCol, clamp(fog, 0.0, 0.85));
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
