#version 330 core
/**
 * @file HolographicLaserDiffractionGrid.vert
 * @brief Vertex stage companion to HolographicLaserDiffractionGrid.frag -- see that file's header for
 * this scene's description.
 */
// HolographicLaserDiffractionGrid.vert — 3,000 spatial light modulator (SLM)
// holographic cards reconstructing 3D Fourier optical diffraction patterns.
//   attrA.xy = corner u/v (0..1), attrA.w = quad index
//   attrB    = per-quad seeds

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioHigh;   ///< High band level, 0..1.

uniform float gratingP;
uniform float depthP;   ///< Depth knob, 0..1.
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
out vec4 vCol;   ///< Colour (from the vertex stage).
out vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3 vNormal;   ///< Surface normal (from the vertex stage).
out vec3 vWorldPos;   ///< World position (from the vertex stage).

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
    float qi = attrA.w;
    vec2 corner = attrA.xy - 0.5; // -0.5..0.5
    vec4 seeds = attrB;

    float grt = (gratingP > 0.0) ? gratingP : 1.0;
    float dpt = (depthP   > 0.0) ? depthP   : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    float t = time * 0.4 * spd + audioAdvance * 0.15;

    // 3D cylindrical holographic array
    float ringIdx = floor(qi / 300.0); // 10 rings
    float slotIdx = mod(qi, 300.0);

    float angle = (slotIdx / 300.0) * 6.2831853 + time * 0.2 * ((mod(ringIdx, 2.0) > 0.5) ? 1.0 : -1.0);
    float radius = (4.0 + ringIdx * 1.5) * grt + audioSwell * 1.8;
    float y = (ringIdx - 5.0) * 1.6 * dpt + sin(angle * 4.0 + t) * 0.6;

    vec3 centerPos = vec3(cos(angle) * radius, y, sin(angle) * radius);

    // Kick laser burst expansion
    centerPos += normalize(centerPos) * audioSwell * 0.9;

    // Card orientation: tangent to ring
    float yaw = angle + 1.5708;
    mat3 rotY = mat3(cos(yaw), 0.0, sin(yaw), 0.0, 1.0, 0.0, -sin(yaw), 0.0, cos(yaw));

    vec3 cardSize = vec3(0.65, 0.65, 0.0);
    vec3 localPos = rotY * vec3(corner.x * cardSize.x, corner.y * cardSize.y, 0.0);
    vec3 worldP = centerPos + localPos;

    // Camera space
    vec3 camPos = vec3(0.0, 3.0, -18.0);
    vec3 relP = worldP - camPos;
    relP.x -= eyeOff;

    gl_Position = projM * vec4(relP.x, relP.y, -relP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vUV = attrA.xy;
    vNormal = rotY * vec3(0.0, 0.0, 1.0);
    vWorldPos = worldP;

    // Holographic laser diffraction palette (laser red, neon emerald, optical violet)
    vec3 col = imgPalette((angle * 2.0 + ringIdx * 0.5 + audioPhase) * 0.159);

    if (audioChromaHue != 0.0)     if (hue > 0.001) col = hueRot(col, hue);

    vCol = vec4(col * (0.85 + 0.5 * audioHigh), 1.0);
}
