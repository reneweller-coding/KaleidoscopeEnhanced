#version 330 core
/**
 * @file QuantumHallEdgeCurrents.vert
 * @brief Vertex stage companion to QuantumHallEdgeCurrents.frag -- see that file's header for
 * this scene's description.
 */
// QuantumHallEdgeCurrents.vert — 20 chiral topological edge channels
// in a 2D electron gas executing cyclotron skipping orbits with quantum phase transitions.
//   attrA.x = t along ribbon, attrA.y = side (-1/+1), attrA.w = ribbon index
//   attrB   = per-ribbon seeds

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

uniform float orbitP;
uniform float channelP;
uniform float widthP;   ///< Width knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.

out vec4  vCol;   ///< Colour (from the vertex stage).
out float vSide;   ///< Which side of a strip (from the vertex stage).
out float vLength;

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
    float t    = attrA.x; // 0..1 along ribbon
    float side = attrA.y; // -1..+1
    float ri   = attrA.w; // 0..19

    float orb = (orbitP   > 0.0) ? orbitP   : 1.0;
    float chn = (channelP > 0.0) ? channelP : 1.0;
    float wid = (widthP   > 0.0) ? widthP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    const float L = 150.0;
    float camZ = time * 8.0 + audioAdvance * 16.0;
    float zRel = t * L;
    float zAbs = zRel + camZ;

    // Edge boundary profile
    float boundaryAngle = (ri / 20.0) * 6.2831853;
    float edgeRadius = (5.0 + 2.0 * sin(ri * 1.5)) * chn + audioSwell * 2.0;

    // Cyclotron skipping orbits: cycloid curve along z: r(z) = r0 + r_cyc * (1 - cos(omega*z))
    float omega = 0.25 * orb;
    float rCyc = 0.8 * (1.0 + 0.5 * audioBass);
    float skipRadius = edgeRadius + rCyc * (1.0 - cos(zAbs * omega));
    float skipAngle = boundaryAngle + sin(zAbs * omega) * 0.15;

    vec3 centerPos = vec3(
        cos(skipAngle) * skipRadius,
        sin(skipAngle) * skipRadius,
        zRel
    );

    // Kick phase jump
    centerPos += vec3(cos(boundaryAngle), sin(boundaryAngle), 0.0) * audioSwell * 0.8;

    vec3 tangentDir = vec3(-sin(skipAngle), cos(skipAngle), 0.0);
    float ribbonWidth = (0.32 * wid) * (1.0 + 0.3 * audioKick);
    vec3 worldP = centerPos + tangentDir * (side * ribbonWidth);

    // Camera space
    vec3 camPos = vec3(0.0, 0.0, 0.0);
    vec3 relP = worldP - camPos;
    relP.x -= eyeOff;

    gl_Position = projM * vec4(relP.x, relP.y, -relP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vSide = side;
    vLength = t;

    // Chiral pulse wave
    float pulse = fract(zAbs * 0.05 - time * 3.5 - ri * 0.2);
    float pulseGlow = exp(-pulse * 6.0) * 2.0;

    // Landau level color palette (topological emerald, gold, cyan)
    vec3 col = imgPalette((ri * 0.7 + time) * 0.159) * 1.4;
    col = mix(col, vec3(1.0, 0.85, 0.2), pulseGlow * 0.5);

    if (audioChromaHue != 0.0)     if (hue > 0.001) col = hueRot(col, hue);

    vCol = vec4(col * (1.0 + pulseGlow + audioHigh * 0.8), 1.0);
}
