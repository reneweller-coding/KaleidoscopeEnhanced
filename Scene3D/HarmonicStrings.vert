#version 330 core
/**
 * @file HarmonicStrings.vert
 * @brief Vertex stage companion to HarmonicStrings.frag -- see that file's header for
 * this scene's description.
 */
// HarmonicStrings.vert — a giant invisible harp: 20 strings stretched
// through space, each ringing as a standing wave in its own mode; the
// string's spectrum band feeds its amplitude smoothly.  Pure, steady.
// attrA.x = along the string, attrA.y = side, attrA.w = string index.

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioSpectrum[32];   ///< Spectrum bands, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).
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
    float t  = attrA.x;
    float sd = attrA.y;
    float si = attrA.w;                      // string 0..19
    float r1 = attrB.x;

    int   band = int(mod(si * 1.6, 32.0));
    float lvl  = audioSpectrum[band];

    // Strings fan gently through depth, low strings in front.
    float x = (t - 0.5) * 60.0;
    float y = (si - 9.5) * 2.3;
    float z = 30.0 + si * 1.8;

    // Standing wave: mode number rises with the string; amplitude follows
    // the band with a slow envelope so it RINGS instead of jittering.
    float mode = 1.0 + mod(si, 5.0);
    float freq = 1.4 + mode * 0.5;
    float a = sin(t * 3.14159265 * mode)
            * cos(time * freq + r1 * 6.2831853)
            * (0.25 + 3.6 * lvl) * (0.7 + 0.6 * audioSwell);
    y += a + sd * 0.32;                      // sd = string thickness

    vec3 vp = vec3(x, y, z);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    // String colour by register: warm bass strings, silvery trebles.
    vec3 col = imgPalette(0.30 * si / 19.0) * 1.5;
    col *= 0.50 + 2.0 * lvl + 0.30 * audioSwell;

    vCol  = vec4(col * 1.4, 1.0);
    vSide = sd;
}
