#version 330 core
/**
 * @file BoseEinsteinVortexTangle.vert
 * @brief Vertex stage companion to BoseEinsteinVortexTangle.frag -- see that file's header for
 * this scene's description.
 */
layout(location = 0) in vec4 attrA;
layout(location = 1) in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float audioKick;
uniform float time;
uniform float audioAdvance;

out vec3 vWorldPos;
out vec3 vNormal;
out float vVortexPhase;
out vec2 vQuadUV;
out float vViewZ;

void main() {
    vec3 pos = attrA.xyz;

    // Quad-local coordinate in [-1,1], rebuilt from the corner code the
    // generator packed into attrA.w (gl_PointCoord is undefined for triangles).
    float cc = attrA.w;
    vQuadUV = vec2((cc == 0.0 || cc == 3.0) ? -1.0 : 1.0,
                   (cc <  2.0)              ? -1.0 : 1.0);
    vWorldPos = pos;
    vNormal = attrB.xyz;
    vVortexPhase = attrB.w;

    // Camera transform: projM expects NEGATIVE view-space z (clip-w = -z_view),
    // so push the scene away along +z and negate.  eyeOff is the stereo shift.
    // Camera: closer + slow orbit around the tangle
    vec3 vp = pos;
    float yaw = time * 0.14 + audioAdvance * 0.07;
    float cy = cos(yaw), sy = sin(yaw);
    vp.xz = mat2(cy, -sy, sy, cy) * vp.xz;
    float pit = 0.35 * sin(time * 0.11);
    float cp = cos(pit), sp = sin(pit);
    vp.yz = mat2(cp, -sp, sp, cp) * vp.yz;
    // 6.4, not 4.6: the tangle now spans the frustum instead of sitting in it
    // as a small knot, and the orbit swings its z extent through +-6 units --
    // at the old distance the near half of it would pass behind the lens.
    vp.z += 6.4;

    // BILLBOARD IN VIEW SPACE.  The generator hands every one of the six
    // vertices the sprite's CENTRE plus its radius in attrB.x; spreading the
    // corners here, after the orbit, is what keeps each sprite square-on to the
    // lens.  Done in the generator (in world space) instead, the quads went
    // exactly edge-on -- invisible -- every quarter turn of the yaw above.
    vViewZ = vp.z;
    vp.xy += vQuadUV * attrB.x;

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
}
