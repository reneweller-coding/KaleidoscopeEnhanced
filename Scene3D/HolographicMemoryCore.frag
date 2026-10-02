#version 330 core
in vec3 vPos;   ///< Position (from the vertex stage).
in vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
in float vTier;
in float vReadLaser;

out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file HolographicMemoryCore.frag
 * @brief Shades a hexagonal holographic memory-crystal wafer: a hard
 * hex-boundary cutout, a rim glow at its edge, the current slideshow photo
 * as its stored imagery with scanning optical data-track lines, an
 * iridescent per-tier photo-arc tint (imgPalette), and a cyan laser pulse
 * that reads across it.
 *
 * audioKick boosts the laser read pulse (vReadLaser) by up to 4x, and
 * audioSwell brightens the blend of stored photo and iridescent tint. The
 * iridescent tint's arc position follows audioChromaHue with a slow
 * audioAdvance drift and audioValence-controlled saturation. glowP and
 * laserP scale overall brightness and laser strength, and hueP applies a
 * final hue rotation.
 */

uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioMid;   ///< Mid band level, 0..1.
uniform float audioHigh;   ///< High band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).

uniform float glowP;   ///< Glow / afterglow knob, 0..1.
uniform float laserP;
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.


uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


/// IMG-PALETTE (house standard): colours come from a rotating arc in the
/// CURRENT slideshow image, so every activation inherits a fresh palette from
/// the photos; the arc follows the musical key (audioChromaHue is circular-
/// slewed = jump-free) with a slow advance drift, valence shapes saturation.
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

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    float glw = (glowP  > 0.0) ? glowP  : 1.0;
    float lsr = (laserP > 0.0) ? laserP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    // Hexagonal crystal wafer boundary
    vec2 p = abs(vUV - vec2(0.5));
    float hexDist = max(p.x * 0.866025 + p.y * 0.5, p.y);
    if (hexDist > 0.48) discard;

    // Crystal edge rim glow
    float edge = smoothstep(0.42, 0.48, hexDist);

    // Stored holographic photo imagery
    vec3 photo = img(vUV);

    // Optical data track scan lines
    float tracks = 0.5 + 0.5 * sin(vUV.y * 80.0 + time * 10.0);
    photo *= (0.7 + 0.3 * tracks);

    // Holographic quartz crystal iridescence
    vec3 irid = imgPalette(vTier + vUV.x * 0.64);

    // Laser read pulse illumination
    vec3 laserCol = vec3(0.0, 1.0, 0.8) * vReadLaser * lsr * (1.0 + audioKick * 3.0);

    // Combine wafer appearance
    vec3 col = mix(photo, irid, 0.35) * (0.8 + 0.4 * audioSwell);
    col += irid * edge * 2.0;
    col += laserCol;

    if (hue > 0.001) col = hueRot(col, hue);

    fragColor = vec4(col * glw, 0.9);
}
