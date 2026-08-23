#version 330 core
/**
 * @file SubglacialVolcanicPillowLava.vert
 * @brief Vertex stage companion to SubglacialVolcanicPillowLava.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xy = Cell UV [0,1], z = 0, w = Cell index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vHeat;

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

uniform float pillowScaleP;
uniform float crustHeightP;

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

vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}

void main()
{
    // Remap grid UV [0,1] to centered [-1,1] domain
    vec2 uv = attrA.xy * 2.0 - 1.0;
    vUV = attrA.xy;

    float t = time * 0.35 + audioAdvance * 0.3;

    // Pillow lava extrusion lobes
    float pScale = (pillowScaleP > 0.01 ? pillowScaleP : 4.5);
    vec2 p = uv * pScale;

    // Cellular pillow lobes
    float lobe1 = sin(p.x * 2.0 + t * 0.5) * cos(p.y * 2.0 - t * 0.4);
    float lobe2 = sin(p.x * 4.0 - p.y * 3.0) * 0.35;
    float pillowHeight = (lobe1 + lobe2);

    // Extrusion fissures and cracks between pillow lobes
    float crack = pow(clamp(1.0 - abs(pillowHeight), 0.0, 1.0), 3.0);
    float heat = crack * (1.0 + 2.5 * audioKick);
    vHeat = heat;

    float hScale = (crustHeightP > 0.001 ? crustHeightP : 0.35) * (1.0 + 0.4 * audioSwell);
    float z = (pillowHeight * 0.5 - 0.2) * hScale;

    vec3 worldPos = vec3(uv.x * 3.0, uv.y * 3.0, z);

    // Approximate surface normal
    float dHdx = cos(p.x * 2.0) * 0.3;
    float dHdy = sin(p.y * 2.0) * 0.3;
    vNormal = normalize(vec3(-dHdx, -dHdy, 1.0));

    // Basalt crust tinted toward photo palette
    vec3 basaltCrust = vec3(0.12, 0.11, 0.14);
    vCol = palTint(basaltCrust, attrA.x * 0.3 + audioCentroid, 0.22);

    // Camera Transform (V3). Tilt FIRST, about the field's centre -- the
    // old tilt-after-dolly shifted the pillow field down by 4.5*sin(0.65)
    // (~2.7 units): top half of the frame black, field cropped below.
    vec3 vp = worldPos;
    float tilt = 0.65;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);
    vp.z += 5.2;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
