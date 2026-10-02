#version 330 core
/**
 * @file PhotonicTopologicalEdgeStates.vert
 * @brief Vertex stage companion to PhotonicTopologicalEdgeStates.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; ///< x = t in [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; ///< 4 hash seeds in [0,1)

out vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out float vSide;   ///< Which side of a strip (from the vertex stage).
out float vRibbonID;
out vec3 vCol;   ///< Colour (from the vertex stage).
out float vPulse;

uniform mat4 projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioPhase;   ///< Rotation phase driven by the music (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioCentroid;   ///< Spectral centroid (brightness of the sound), 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float ribbonWidthP;
uniform float edgeSpeedP;

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

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float tCoord = attrA.x;
    float side   = attrA.y;
    float rIndex = attrA.w;

    vSide = side;
    vRibbonID = rIndex;
    vUV = vec2(tCoord, side * 0.5 + 0.5);

    float t = time * 0.4 + audioAdvance * 0.35;

    // THE topological-insulator picture: a honeycomb array of waveguide
    // cells (dim lattice) with light racing around the array's EDGE (the
    // chiral edge state).  The old wobbly circles recorded as noodles.
    bool isEdge = (rIndex >= 18.0);

    // Hexagon path: piecewise-linear loop through 6 corners.
    float hexT = fract(tCoord) * 6.0;
    float hk = floor(hexT);
    float hf = fract(hexT);
    float a0 = (hk + 0.0) * 1.04719755 + 0.5235988;
    float a1 = (hk + 1.0) * 1.04719755 + 0.5235988;
    float hexR = isEdge ? 1.62 : 0.44;
    vec2 c0 = vec2(cos(a0), sin(a0)) * hexR;
    vec2 c1 = vec2(cos(a1), sin(a1)) * hexR;
    vec2 hexP = mix(c0, c1, hf);

    // Cell centres: one central cell plus a ring of six.
    float cellIdx = mod(rIndex, 7.0);
    vec2 cellC = (cellIdx < 0.5) ? vec2(0.0)
               : vec2(cos((cellIdx - 1.0) * 1.04719755),
                      sin((cellIdx - 1.0) * 1.04719755)) * 0.80;
    if (isEdge) cellC = vec2(0.0);

    vec3 centerPos = vec3(hexP + cellC, 0.0);
    // The whole array breathes and tilts gently in z.
    centerPos.z = 0.22 * sin(centerPos.x * 1.7 + t * 0.5)
                + 0.10 * sin(rIndex + t * 0.3);

    vec3 tangent = normalize(vec3(c1 - c0, 0.001));
    vec3 normal  = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));

    float width = (ribbonWidthP > 0.001 ? ribbonWidthP : 0.045)
                * (isEdge ? 2.6 : 1.0) * (1.0 + 0.3 * audioSwell);
    vec3 worldPos = centerPos + normal * (side * width);

    // The chiral pulse: on the edge loop it RACES (one direction only --
    // that is the topology); in the bulk cells it only breathes faintly.
    float pulseSpeed = (edgeSpeedP > 0.01 ? edgeSpeedP : 1.5);
    float pulsePhase = fract(tCoord * 2.0 - t * (isEdge ? pulseSpeed : 0.0) + rIndex * 0.37);
    vPulse = exp(-abs(pulsePhase - 0.5) * 16.0)
           * (isEdge ? (1.6 + 3.0 * audioKick) : (0.25 + 0.4 * audioSwell));

    // Bulk cells stay glassy-dim; the edge channel carries the colour.
    vCol = isEdge ? imgPalette(fract(0.08 + tCoord * 0.5)) * 1.5
                  : imgPalette(fract(0.55 + rIndex * 0.04)) * 0.45;

    // Engine Camera Transformation (V3)
    vec3 vp = worldPos;
    // Tilt FIRST, about the lattice's own centre: the old order tilted the
    // already-dollied scene about the camera origin, which shifted the whole
    // structure DOWN by dolly*sin(tilt) (~1 unit) -- the reported "black at
    // the top" with the lattice cropped at the bottom edge.
    float tilt = 0.35;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);
    vp.z += 3.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
