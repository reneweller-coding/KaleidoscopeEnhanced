#version 330 core
/**
 * @file DielectricResonatorMetagrating.vert
 * @brief Vertex stage companion to DielectricResonatorMetagrating.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xy = Quad local UV [0,1], z = 0, w = Quad index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vMieResonance;

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

uniform float gratingPitchP;
uniform float pillarHeightP;

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
    // Remap quad UV [0,1] to centered [-1,1] domain
    vec2 localUV = attrA.xy * 2.0 - 1.0;
    vUV = attrA.xy;
    float qIndex = attrA.w;

    float t = time * 0.35 + audioAdvance * 0.3;

    // 16x16 2D array of high-index silicon dielectric resonant nanopillars
    float nx = 16.0;
    float ix = mod(qIndex, nx);
    float iy = floor(qIndex / nx);

    float pitch = (gratingPitchP > 0.001 ? gratingPitchP : 0.18);
    vec2 pillarCenter = vec2((ix - 7.5) * pitch, (iy - 7.5) * pitch);

    // Dielectric Mie electric/magnetic dipole resonance: height modulation
    float miePhase = pillarCenter.x * 4.0 + pillarCenter.y * 3.0 - t * 2.5;
    float mieRes = sin(miePhase) * 0.5 + 0.5;
    vMieResonance = mieRes;

    float hScale = (pillarHeightP > 0.001 ? pillarHeightP : 0.25) * (0.8 + 0.4 * audioSwell);
    float pillarZ = (mieRes * 0.6) * hScale;

    // Quad face size
    float quadSize = pitch * 0.42;
    vec3 worldPos = vec3(pillarCenter + localUV * quadSize, pillarZ);
    worldPos.x *= 2.3;   // the grating recorded as a narrow tower in 80% black

    vNormal = normalize(vec3(0.0, 0.0, 1.0));
    vCol = imgPalette(fract(qIndex * 0.0039 + mieRes * 0.3 + audioCentroid));

    // Camera Transform (V3)
    vec3 vp = worldPos;
    vp.z += 3.6;
    vp.x -= eyeOff;

    // Isometric camera tilt
    float tilt = 0.65;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
