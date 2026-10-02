#version 330 core
/**
 * @file MoireHyperInterference.vert
 * @brief Vertex stage companion to MoireHyperInterference.frag -- see that file's header for
 * this scene's description.
 */
// MoireHyperInterference.vert — 220x120 heightfield grid undulating
// with optical Moiré superlattices and dynamic interference zone plates.
//   attrA.xy = grid UV (0..1), attrA.zw = quad index

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioHigh;   ///< High band level, 0..1.

uniform float freqP;
uniform float depthP;   ///< Depth knob, 0..1.
uniform float speedP;   ///< Speed knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).

uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
out vec4 vCol;   ///< Colour (from the vertex stage).
out vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3 vNormal;   ///< Surface normal (from the vertex stage).
out float vInterference;

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
    vec2 gridUV = attrA.xy; // 0..1

    float frq = (freqP  > 0.0) ? freqP  : 1.0;
    float dpt = (depthP > 0.0) ? depthP : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    float x = (gridUV.x - 0.5) * 20.0;
    float z = (gridUV.y - 0.5) * 20.0;

    float t = time * 0.35 * spd + audioAdvance * 0.15;

    // Dual rotating high-frequency optical grating grids
    float a1 = t * 0.3;
    float a2 = -t * 0.25;

    vec2 p1 = vec2(cos(a1) * x - sin(a1) * z, sin(a1) * x + cos(a1) * z) * frq;
    vec2 p2 = vec2(cos(a2) * x - sin(a2) * z, sin(a2) * x + cos(a2) * z) * (frq * 1.05);

    float g1 = sin(p1.x * 6.0) * sin(p1.y * 6.0);
    float g2 = sin(p2.x * 6.0) * sin(p2.y * 6.0);

    // Moiré superlattice beat frequency
    float moire = g1 * g2;
    float y = moire * 1.8 * dpt * (1.0 + 0.3 * audioBass);

    // Kick elevation
    y += audioKick * 1.5 * abs(moire);

    vec3 worldP = vec3(x, y, z);

    // Camera space
    vec3 camPos = vec3(0.0, 6.0, -16.0);
    vec3 relP = worldP - camPos;
    relP.x -= eyeOff;

    gl_Position = projM * vec4(relP.x, relP.y, -relP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vUV = gridUV;
    vInterference = abs(moire);
    vNormal = normalize(vec3(-sin(p1.x) * 0.5, 1.0, -cos(p2.y) * 0.5));

    // Holographic rainbow interference palette
    vec3 col = imgPalette((moire * 5.0 + t + audioPhase) * 0.159);

    if (audioChromaHue != 0.0)     if (hue > 0.001) col = hueRot(col, hue);

    vCol = vec4(col * (0.8 + 0.6 * audioHigh), 1.0);
}
