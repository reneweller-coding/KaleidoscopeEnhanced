#version 330 core
/**
 * @file GrapheneGyroidTriplyPeriodicMinimalSurface.vert
 * @brief Vertex stage companion to GrapheneGyroidTriplyPeriodicMinimalSurface.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xy = Cell UV [0,1], z = 0, w = Cell index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vGyroidAngle;

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

uniform float gyroidPitchP;
uniform float gyroidAmpP;

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
    // Remap grid UV [0,1] to centered [-1,1] domain
    vec2 uv = attrA.xy * 2.0 - 1.0;
    vUV = attrA.xy;

    float t = time * 0.35 + audioAdvance * 0.3;

    // Triply Periodic Minimal Surface (TPMS) Gyroid nodal approximation:
    // f(x,y,z) = sin(x)*cos(y) + sin(y)*cos(z) + sin(z)*cos(x) = 0
    float kPitch = (gyroidPitchP > 0.01 ? gyroidPitchP : 3.5);
    vec2 p = uv * 3.14159265 * kPitch;

    float zG = sin(p.x) * cos(p.y + t) + cos(p.x - t) * sin(p.y);
    float gAmp = (gyroidAmpP > 0.01 ? gyroidAmpP : 0.6) * (0.85 + 0.35 * audioSwell);

    vGyroidAngle = zG;

    vec3 worldPos = vec3(uv.x * 2.5, uv.y * 2.5, zG * gAmp);

    // Gradient normal of gyroid
    float dZdx = cos(p.x) * cos(p.y + t) - sin(p.x - t) * sin(p.y);
    float dZdy = -sin(p.x) * sin(p.y + t) + cos(p.x - t) * cos(p.y);
    vNormal = normalize(vec3(-dZdx * gAmp, -dZdy * gAmp, 1.0));

    vCol = imgPalette(fract(zG * 0.3 + length(uv) * 0.2 + audioCentroid));

    // Camera Transform (V3)
    // Tilt FIRST, then push away.  The old order rotated the already-pushed
    // plate about the CAMERA, which dropped the plate's centre by D*sin(tilt)
    // and left it sitting in the lower half of the frame with black above.
    // Tilting about the plate's own centre keeps it on the view axis, and at
    // this distance it then fills the frame (reported: "bildschirmfuellender").
    vec3 vp = worldPos;
    float tilt = 0.55;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);
    vp.z += 4.0;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
