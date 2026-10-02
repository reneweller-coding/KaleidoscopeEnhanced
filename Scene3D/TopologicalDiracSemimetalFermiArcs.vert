#version 330 core
/**
 * @file TopologicalDiracSemimetalFermiArcs.vert
 * @brief Vertex stage companion to TopologicalDiracSemimetalFermiArcs.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; ///< x = t [0,1], y = side (-1/+1), z = 0, w = ribbon index
in vec4 attrB; ///< 4 seeds in [0,1)

out vec2 vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out float vSide;   ///< Which side of a strip (from the vertex stage).
out float vRibbonID;
out vec3 vCol;   ///< Colour (from the vertex stage).
out float vWeylPulse;

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

uniform float nodeDistP;
uniform float ribbonWidthP;
uniform float arcCurvP;

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
    
    float t = time * 0.35 + audioAdvance * 0.3;
    
    // Topological Dirac/Weyl semimetal Fermi Arcs: open disjoint arcs connecting Weyl nodes (+ and - chirality)
    float dNodes = (nodeDistP > 0.01 ? nodeDistP : 1.4);
    float kCurv  = (arcCurvP > 0.01 ? arcCurvP : 1.2);

    // Disjoint open Fermi arcs, on BOTH crystal surfaces.  The engine builds
    // 20 ribbons (indices 0..19); the old layout drew all twenty as one small
    // nested bundle around the origin -- 1.4 units wide in a view 8 units
    // across, which is why the scan found 86 % of the picture empty.  The
    // ribbons are now dealt out as ten nested arcs per surface: even indices
    // curve up out of the top face, odd ones mirror them out of the bottom
    // face (opposite chirality, which is what the two surfaces really carry),
    // each successive lane sitting further out and bowing harder, so the fan
    // opens across the whole frame instead of stacking in the middle of it.
    float lane   = floor(rIndex * 0.5);        // 0..9
    float ln     = lane / 9.0;                 // 0..1, inner .. outer
    float surf   = (mod(rIndex, 2.0) < 0.5) ? 1.0 : -1.0;
    float arcSc  = 1.0 + 1.35 * ln;

    // 1.45: the outer lanes have to run PAST the left and right edges.  Without
    // it the fan stopped at 70 % of the frame width and the outermost two tile
    // columns on each side stayed empty however tall the arcs were bowed.
    float xHalf = (0.9 + 0.55 * dNodes) * arcSc * 1.45;
    float xPos  = (tCoord - 0.5) * 2.0 * xHalf;

    float bow   = 1.0 - 4.0 * (tCoord - 0.5) * (tCoord - 0.5);
    float yAmp  = 0.45 * (0.6 + kCurv) * arcSc;
    float yPos  = surf * (0.25 + 0.85 * ln + bow * yAmp);

    float zLayer = (lane - 4.5) * 0.22 * surf + sin(tCoord * 12.0 - t * 2.5) * 0.10 * arcSc;

    vec3 centerPos = vec3(xPos, yPos, zLayer);

    vec3 tangent = normalize(vec3(2.0 * xHalf,
                                  surf * (-8.0 * (tCoord - 0.5)) * yAmp,
                                  0.0));
    vec3 binormal = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));
    
    // 1.7: the arcs sit further back now (z 6.2 rather than 4.5) and span a much
    // wider fan, so the original hairline width came out at barely two pixels of
    // a 1080-line frame -- a lane that thin averages away to nothing.
    float width = (ribbonWidthP > 0.001 ? ribbonWidthP : 0.05)
                * 1.7 * (1.0 + 0.3 * audioSwell);
    vec3 worldPos = centerPos + binormal * (side * width);
    
    // Chiral anomaly / Weyl node current pulse
    float pulse = exp(-abs(fract(tCoord * 2.0 - t * 3.0 + rIndex * 0.166) - 0.5) * 16.0) * (1.0 + 3.0 * audioKick);
    vWeylPulse = pulse;
    
    vCol = imgPalette(fract(rIndex * 0.166 + tCoord * 0.3 + audioCentroid));
    
    // Camera Transform (V3)
    vec3 vp = worldPos;

    // 3D rotation -- a BOUNDED sway, not a turntable.  A full turn takes the
    // fan (which is now nearly twelve units wide and only two deep) edge on
    // every ~30 s, and edge on it collapses to a vertical bar in the middle of
    // a black frame.  +-0.3 rad keeps the parallax without ever losing the face.
    float rot = 0.30 * sin(t * 0.13);
    float c = cos(rot), s = sin(rot);
    vp = vec3(vp.x * c - vp.z * s, vp.y, vp.x * s + vp.z * c);
    // Far enough back that the widened fan cannot swing through the eye when
    // the rotation turns it edge-on (its half-span is now ~4.6 units), and
    // close enough that the outer arcs still run off the top and bottom.
    vp.z += 6.2;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
}
