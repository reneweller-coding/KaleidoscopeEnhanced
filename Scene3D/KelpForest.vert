#version 330 core
/**
 * @file KelpForest.vert
 * @brief Vertex stage companion to KelpForest.frag -- see that file's header for
 * this scene's description.
 */
// KelpForest.vert — an underwater kelp forest swaying in the surge: each
// ribbon is one kelp frond anchored on the sea floor; the swell IS the
// surge, caustic light ripples from above.  attrA.x = height 0..1,
// attrA.y = side, attrA.w = frond index.

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
uniform float audioBarPhase;   ///< Position within the current bar, 0..1.
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

out vec4  vCol;   ///< Colour (from the vertex stage).
out float vSide;   ///< Which side of a strip (from the vertex stage).

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


/// House tint: bend a colour toward the photo palette while keeping its
/// luminance -- the identity look survives, only the hue follows the photos.
vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}
/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float t    = attrA.x;                    // 0 root .. 1 tip
    float side = attrA.y;
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // Frond anchors scattered on the floor ahead of the camera — packed
    // TIGHTER than before (user: plants stood too far apart), and the
    // whole forest streams toward the camera: an endless glide THROUGH it.
    float flight = time * 2.2 + audioAdvance * 1.6;
    float rz = mod(r2 * 46.0 - flight, 46.0) + 6.0;
    vec3 root = vec3((r1 - 0.5) * 34.0, -12.0, rz);
    float H   = 22.0 + 14.0 * r3;

    // Surge: one broad push per bar plus fine flutter, growing toward
    // the free tip.
    float surge = sin(6.2831853 * audioBarPhase + r1 * 6.2831853)
                * (0.8 + 1.6 * audioSwell);
    float flutter = sin(t * 6.0 - time * 1.7 + r4 * 6.2831853);
    float bendX = (surge * 4.5 + flutter * 1.2) * t * t;
    float bendZ = (surge * 1.5 + cos(t * 5.0 - time * 1.3 + r2 * 9.0))
                * t * t * 0.8;

    // Blade widens mid-frond, tapers at the tip.
    float wHalf = (0.55 + 0.9 * r4) * sin(3.14159265 * min(t * 1.15, 1.0));

    vec3 pos = root + vec3(bendX + side * wHalf, t * H, bendZ);

    vec3 vp = pos;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.5)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    // Deep green-teal, sunlit toward the tips, caustic bands wandering.
    vec3 col = palTint(mix(vec3(0.04, 0.24, 0.15), vec3(0.16, 0.80, 0.44), t), 0.20 * t, 0.18);
    float caustic = 0.6 + 0.4 * sin(pos.x * 0.35 + pos.y * 0.22
                                    + time * 1.1);
    col *= 0.5 + 0.9 * caustic * (0.5 + 0.5 * t);
    col = col;
    col *= (0.85 + 0.5 * audioLevel + 0.4 * audioSwell)
         * clamp(1.0 - vp.z / 100.0, 0.0, 1.0) * 1.15
         * smoothstep(6.0, 10.0, vp.z);   // fade fronds out as they pass us

    vCol  = vec4(col, 1.0);
    vSide = side;
}
