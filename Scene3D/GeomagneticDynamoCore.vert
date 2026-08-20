#version 330 core
/**
 * @file GeomagneticDynamoCore.vert
 * @brief Vertex stage companion to GeomagneticDynamoCore.frag -- see that file's header for
 * this scene's description.
 */
layout(location = 0) in vec4 attrA;   // xyz = sprite centre, w = corner code
layout(location = 1) in vec4 attrB;   // x = radius, y = phase, z = isHaze, w = spare

uniform mat4  projM;
uniform float eyeOff;
uniform float audioKick;
uniform float time;
uniform float audioAdvance;
uniform vec2  resolution;

out vec3 vWorldPos;
out float vDynamoPhase;
out float vHaze;
out vec2 vQuadUV;

void main() {
    vec3  c      = attrA.xyz;
    float radius = attrB.x;
    float haze   = attrB.z;

    // Quad-local coordinate in [-1,1], rebuilt from the corner code the
    // generator packed into attrA.w (gl_PointCoord is undefined for triangles).
    float cc = attrA.w;
    vQuadUV = vec2((cc == 0.0 || cc == 3.0) ? -1.0 : 1.0,
                   (cc <  2.0)              ? -1.0 : 1.0);
    vWorldPos    = c;
    vDynamoPhase = attrB.y;
    vHaze        = haze;

    // Camera transform: projM expects NEGATIVE view-space z (clip-w = -z_view),
    // so push the scene away along +z and negate.  eyeOff is the stereo shift.
    // Camera: closer + slow orbit around the tangle.  The FLUX FOG is exempt:
    // it is already laid out in frustum coordinates and must not swing with
    // the core it sits behind.
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;
    vec3 vp;
    if (haze > 0.5)
    {
        vp = c;
        vp.x *= aspect / 1.7778;
    }
    else
    {
        vp = c;
        float yaw = time * 0.14 + audioAdvance * 0.07;
        float cy = cos(yaw), sy = sin(yaw);
        vp.xz = mat2(cy, -sy, sy, cy) * vp.xz;
        float pit = 0.35 * sin(time * 0.11);
        float cpi = cos(pit), spi = sin(pit);
        vp.yz = mat2(cpi, -spi, spi, cpi) * vp.yz;
        // 6.6, not the old 4.6: the outer shell now reaches 4.4 units out, and
        // at 4.6 its near arc crossed the near plane and was culled away.
        vp.z += 6.6;
    }

    // The billboard is spread in VIEW space, AFTER the orbit -- so it always
    // faces the camera instead of turning edge-on as the yaw comes round.  The
    // floor keeps a sprite about three pixels across at any distance; below
    // that a small sprite averages away and the field reads black again.
    float rr = max(radius, vp.z * 0.0028);
    vp.xy += vQuadUV * rr;

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
}
