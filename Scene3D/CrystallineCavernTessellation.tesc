#version 430 core
/**
 * @file CrystallineCavernTessellation.tesc
 * @brief Tessellation-control stage companion to CrystallineCavernTessellation.frag -- see that file's header for
 * this scene's description.
 */
/// Layout qualifiers of this stage (work-group size, or the primitive in or out).
layout( vertices = 4 ) out;

in vec3 vControlPos[];
in vec2 vControlUV[];

out vec3 tcPos[];
out vec2 tcUV[];

uniform float audioSwell; ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioMid;   ///< Mid band level, 0..1.

/** Entry point of this shader stage (the file description says what it draws). */
void main()
{
    tcPos[gl_InvocationID] = vControlPos[gl_InvocationID];
    tcUV[gl_InvocationID] = vControlUV[gl_InvocationID];

    if ( gl_InvocationID == 0 )
    {
        float tess_level = 16.0 + 12.0 * audioMid + 8.0 * audioSwell;
        gl_TessLevelOuter[0] = tess_level;
        gl_TessLevelOuter[1] = tess_level;
        gl_TessLevelOuter[2] = tess_level;
        gl_TessLevelOuter[3] = tess_level;

        gl_TessLevelInner[0] = tess_level;
        gl_TessLevelInner[1] = tess_level;
    }
}
