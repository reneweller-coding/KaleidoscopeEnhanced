#version 330 core
/**
 * @file MagnetoRotationalHypernovaInstability.vert
 * @brief Vertex stage companion to MagnetoRotationalHypernovaInstability.frag -- see that file's
 * header for this scene's description.
 */

// attrA.xyz = world pos, attrA.w = fluxIdx
// attrB.x   = isHaze, attrB.w = fieldEnergy
in vec4 attrA;
in vec4 attrB;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

out vec3 vPos;
out float vFluxIdx;
out float vEnergy;
out float vHaze;

void main() {
    vec3 worldP = attrA.xyz;
    vPos = worldP;
    vFluxIdx = attrA.w;
    vEnergy = attrB.w;
    vHaze = attrB.x;

    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;
    vec3 vp = worldP;

    if (vHaze > 0.5)
    {
        // The ejecta haze is already laid out in frustum coordinates for 16:9;
        // it must not swing with the object it sits behind, only stretch for
        // the actual aspect.
        vp.x *= aspect / 1.7778;
    }
    else
    {
        // Stereoscopic 3D camera projection (V3).  Tilt BEFORE the translate:
        // applied after it, the fixed 0.55 rad tilt swung the scene centre down
        // by sin(0.55)*4.8 = 2.5 units -- more than a full half-height at this
        // depth -- and parked the jets and the torus under the bottom edge.
        // That, not the geometry, was why an earlier widening pass never moved
        // the occupancy metric.  (kViewAxis in the .comp is the same either
        // way: it depends on the rotation, not on the translation.)
        float tilt = 0.55;
        float c = cos(tilt), s = sin(tilt);
        vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);
        // 6.6, not the old 4.8: the jets now flare to 3.3 units and run 4.4
        // along their axis, and the tilt folds both into the view depth -- at
        // 4.8 the head of the downward jet crossed the near plane and was
        // culled away.
        vp.z += 6.6;
    }

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
}
