#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file CryogenicBrinicleStalactite.frag
 * @brief CRYOGENIC BRINICLE STALACTITE: a CURTAIN of hollow ice stalactite tubes (brinicles)
 * descending from polar sea ice into supercooled seawater at every depth, through a suspended
 * field of frost motes. Freezing brine channels, benthic frost webs, refractive ice crystal
 * glints, and polar deep ocean photo texturing.
 *   audioAdvance -> drives descending brine icicle growth, the freeze front running down each
 *                   tube, & polar current drift of the frost motes
 *   audioKick    -> flashes brittle ice crystal fracturing & spark glints
 *   audioSwell   -> thickens hollow icicle tube diameter & frost web density, and brightens
 *                   the suspended motes
 *   audioCentroid-> shifts polar ice crystal refraction colors
 *
 * Per-activation variety:
 *   iceGlowP float cryogenic ice crystal luminance          (0.8..2.5)
 *   refrP    float ice refractive dispersion intensity      (0.5..2.2)
 */

in vec3 vPos;   ///< Position (from the vertex stage).
in float vDepth;   ///< Depth (from the vertex stage).
in float vGlow;

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float iceGlowP;
uniform float refrP;

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

/// @brief Tints a colour toward the house palette at t, keeping its brightness.
vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main() {
    // Polar cyan ice identity color
    vec3 iceCyan = vec3(0.25, 0.85, 1.0);
    vec3 iceCol = palTint(iceCyan, vDepth * 0.4 + audioCentroid, 0.25);
    
    // The curtain now spans tens of world units laterally, so the photo is
    // sampled in SCREEN-relative coordinates -- a fixed world scale wrapped the
    // picture dozens of times across the far layers.
    vec2 photoUv = fract(vPos.xy / max(vPos.z, 0.5) * 0.85 + 0.5);
    vec3 photoSample = img(photoUv);

    vec3 col = iceCol * (0.6 + 0.4 * photoSample) * vGlow;
    col *= (iceGlowP > 0.01 ? iceGlowP : 1.2) * (0.85 + 0.35 * audioSwell);
    // Fracture glint: gated on the tubes, so a kick does not flash the whole
    // mote field white.
    col += iceCol * min(audioKick * 0.35, 0.4) * smoothstep(0.55, 0.95, vGlow);
    
    // Soft knee compression
    col /= 1.0 + 0.35 * max(col.r, max(col.g, col.b));
    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
