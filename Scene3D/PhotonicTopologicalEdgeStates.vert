#version 330 core
/**
 * @file PhotonicTopologicalEdgeStates.vert
 * @brief Vertex stage companion to PhotonicTopologicalEdgeStates.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // x = t in [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; // 4 hash seeds in [0,1)

out vec2 vUV;
out float vSide;
out float vRibbonID;
out vec3 vCol;
out float vPulse;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioChromaHue;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float ribbonWidthP;
uniform float edgeSpeedP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

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
    vp.z += 2.9;   // the lattice filled barely a third of the frame
    vp.x -= eyeOff;

    // Tilt slightly for isometric view
    float tilt = 0.35;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
