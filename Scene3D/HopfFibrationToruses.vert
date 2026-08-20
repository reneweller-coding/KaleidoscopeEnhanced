#version 330 core
/**
 * @file HopfFibrationToruses.vert
 * @brief Vertex stage companion to HopfFibrationToruses.frag -- see that file's header for
 * this scene's description.
 */
// attrA.x = t along ribbon (0..1), attrA.y = side (-1..+1), attrA.w = ribbon
// id, attrB = per-ribbon seeds (Scene3DShader.cpp GEOM_RIBBON).
in vec4 attrA;
in vec4 attrB;

uniform mat4 projM;
uniform float eyeOff;
uniform float time;
uniform float audioPhase;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioSwell;

out vec3 vPos;
out vec2 vUV;
out float vFiberID;
out float vEnergy;

void main() {
    float ribbonID = attrA.w;
    float tAlong = attrA.x * 6.2831853; // Angle along fiber circle

    // 4D Hopf Fibration parameterization
    // Each fiber is defined by two angles eta (torus radius) and xi (torus
    // angle).  eta runs strictly INSIDE (0, pi/2): at either end the fiber
    // degenerates to the Hopf circle, sin(eta) or cos(eta) goes to zero and the
    // ribbon frame below normalises a zero vector -- ribbon 0 used to come out
    // NaN and vanish, taking a twentieth of the picture with it.
    float fu  = (ribbonID + 0.5) / 20.0;
    float eta = 0.10 + fu * 1.38;              // ~0.10 .. ~1.48 rad
    float xi = fu * 6.2831853 + time * 0.2 + audioAdvance * 0.1;

    // 4D Clifford rotation driven by audio
    float t4D = time * 0.4 + audioAdvance * 0.2;
    float psi = tAlong + t4D;
    float phi = xi + t4D * 0.5;

    // Coordinates on 4D 3-sphere S3
    float x1 = cos(psi) * sin(eta);
    float x2 = sin(psi) * sin(eta);
    float x3 = cos(phi) * cos(eta);
    float x4 = sin(phi) * cos(eta);

    // Conformal stereographic projection from S3 to R3.  The 2.2 scale left
    // the whole fibration as a small knot in the middle of the frame; 2.9
    // lets the outer Villarceau circles run past the edges of the picture.
    float denom = max(1.0 - x4 * 0.7, 0.2);
    vec3 hopfR3 = vec3(x1, x2, x3) / denom * 2.9;

    // Ribbon width offset.  The old 0.04-0.06 drew the fibers as hairlines --
    // 20 threads in a 1080-line frame, which is why the scan read the scene as
    // near-black despite reasonable coverage.  These are ribbons, so they are
    // wide enough to be seen as surfaces.
    vec3 tangent = normalize(vec3(-sin(psi) * sin(eta), cos(psi) * sin(eta), 0.0));
    vec3 normal4D = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));
    float ribbonWidth = (0.09 + 0.035 * sin(tAlong * 4.0)) * (1.0 + audioKick * 0.5);

    vec3 pos = hopfR3 + normal4D * (attrA.y * 0.5) * ribbonWidth;

    vPos = pos;
    vUV = vec2(attrA.x, attrA.y * 0.5 + 0.5);
    vFiberID = fu;
    vEnergy = (0.8 + 0.4 * sin(tAlong * 8.0 - time * 6.0)) * (1.0 + audioKick * 2.0);

    // Stereoscopic 3D camera projection
    vec3 vp = pos;
    vp.z += 5.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
