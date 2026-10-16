#version 430 core
/**
 * @file AuroraBorealisOverFjord.tesc
 * @brief Tessellation-control stage companion to AuroraBorealisOverFjord.frag -- see that file's header for
 * this scene's description.
 */
/// Layout qualifiers of this stage (work-group size, or the primitive in or out).
layout( vertices = 4 ) out;

in vec3 vControlPos[]; ///< Control pos (from the vertex stage).
in vec2 vControlUV[];  ///< Control UV (from the vertex stage).

out vec3 tcPos[]; ///< Pos (from the tessellation control stage).
out vec2 tcUV[];  ///< UV (from the tessellation control stage).

uniform float audioSwell; ///< Slow loudness envelope, 0..1 (seconds).

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    tcPos[gl_InvocationID] = vControlPos[gl_InvocationID];
    tcUV[gl_InvocationID] = vControlUV[gl_InvocationID];

    if ( gl_InvocationID == 0 )
    {
        float tess_level = 16.0 + 8.0 * audioSwell;
        gl_TessLevelOuter[0] = tess_level;
        gl_TessLevelOuter[1] = tess_level;
        gl_TessLevelOuter[2] = tess_level;
        gl_TessLevelOuter[3] = tess_level;

        gl_TessLevelInner[0] = tess_level;
        gl_TessLevelInner[1] = tess_level;
    }
}
