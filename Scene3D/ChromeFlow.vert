#version 330 core
/**
 * @file ChromeFlow.vert
 * @brief Vertex stage companion to ChromeFlow.frag -- see that file's header for
 * this scene's description.
 */
// ChromeFlow.vert — a sheet of liquid chrome: broad, slow undulations,
// mirror-bright sheen bands gliding across the metal.  The bass leans on
// the wave weight; everything else is pure patience.
// attrA.x/.y span the sheet.

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).

out vec2  vUV;   ///< Texture coordinate 0..1 over the screen (from the vertex stage).
out vec3  vNrm;
out float vDist;   ///< Distance (from the vertex stage).

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float u = attrA.x, w = attrA.y;

    float x = (u - 0.5) * 130.0;
    float z = 6.0 + w * 110.0;

    // Four wave trains: two broad rollers plus two short chops — liquid
    // chrome needs CURVATURE, or the mirror has nothing to bend.
    float ph = time * 0.35 + audioAdvance * 0.3;
    float wgt = 1.0 + 1.2 * audioBass + 0.5 * audioSwell;
    float h  = sin(x * 0.045 + z * 0.030 + ph)        * 2.6
             + sin(x * 0.020 - z * 0.050 + ph * 0.6)  * 3.4
             + sin(x * 0.130 + z * 0.095 - ph * 1.7)  * 0.85
             + sin(x * 0.075 - z * 0.160 + ph * 1.2)  * 1.1;
    h *= wgt;

    // Analytic normal from the derivatives (for the mirror in the frag).
    float dhx = (cos(x * 0.045 + z * 0.030 + ph)       * 0.045 * 2.6
               + cos(x * 0.020 - z * 0.050 + ph * 0.6) * 0.020 * 3.4
               + cos(x * 0.130 + z * 0.095 - ph * 1.7) * 0.130 * 0.85
               + cos(x * 0.075 - z * 0.160 + ph * 1.2) * 0.075 * 1.1) * wgt;
    float dhz = (cos(x * 0.045 + z * 0.030 + ph)       * 0.030 * 2.6
               - cos(x * 0.020 - z * 0.050 + ph * 0.6) * 0.050 * 3.4
               + cos(x * 0.130 + z * 0.095 - ph * 1.7) * 0.095 * 0.85
               - cos(x * 0.075 - z * 0.160 + ph * 1.2) * 0.160 * 1.1) * wgt;

    vec3 vp = vec3(x, h - 8.0, z);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    vUV   = vec2(u, w);
    vNrm  = normalize(vec3(-dhx, 1.0, -dhz));
    vDist = z;
}
