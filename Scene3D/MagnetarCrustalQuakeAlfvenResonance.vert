#version 330 core
/**
 * @file MagnetarCrustalQuakeAlfvenResonance.vert
 * @brief Vertex stage companion to MagnetarCrustalQuakeAlfvenResonance.frag -- see that file's
 * header for this scene's description.
 */

// attrA.xyz = world pos, attrA.w = depthNorm (or panel u for kind 2)
// attrB.x   = kind (0 = field line, 1 = far X-ray speck, 2 = plasma haze panel)
// attrB.w   = quakeGlow (or panel v for kind 2)
in vec4 attrA;
in vec4 attrB;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;

out vec3 vPos;
out float vDepth;
out float vGlow;
out float vKind;

void main() {
    vec3 worldP = attrA.xyz;
    vPos = worldP;
    vDepth = attrA.w;
    vGlow = attrB.w;
    vKind = attrB.x;

    // Stereoscopic 3D camera projection (V3).  TILT BEFORE THE TRANSLATE: this
    // used to translate first, which meant the fixed 0.55 rad tilt rotated the
    // already-pushed-back scene about the CAMERA and swung the magnetar's
    // centre down by sin(0.55)*4.5 = 2.35 units -- a full frame-height below
    // the picture.  Most of the magnetosphere was simply off the bottom of the
    // screen, which is the real reason this scene measured 84% empty.
    vec3 vp = worldP;

    float tilt = 0.55;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);

    vp.z += 4.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    // Anything that ended up behind the near plane would otherwise smear a
    // wedge of garbage across the frame.
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
}
