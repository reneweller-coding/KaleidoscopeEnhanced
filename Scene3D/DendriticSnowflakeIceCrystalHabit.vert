#version 330 core
/**
 * @file DendriticSnowflakeIceCrystalHabit.vert
 * @brief Vertex stage companion to DendriticSnowflakeIceCrystalHabit.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xy = Quad UV [0,1], z = 0, w = Quad index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vIceGlow;

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

uniform float flakeScaleP;
uniform float dendriteBranchP;

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

out float vGrow;

void main()
{
    // Remap quad UV [0,1] to centered [-1,1] domain
    vec2 uv = attrA.xy * 2.0 - 1.0;
    vUV = attrA.xy;

    float t = time * 0.35 + audioAdvance * 0.3;

    // Hexagonal 6-fold dendritic snowflake crystal morphology (Nakaya diagram)
    float r = length(uv);
    float theta = atan(uv.y, uv.x);

    // 6-fold symmetry folding
    float hexTheta = mod(theta + 0.52359877, 1.0471975) - 0.52359877;
    vec2 hexPos = vec2(cos(hexTheta), sin(hexTheta)) * r;

    // Dendritic side branches along 60-degree crystallographic axes
    float nBranch = (dendriteBranchP > 0.01 ? dendriteBranchP : 5.0);
    float branch = abs(sin(hexPos.x * nBranch * 6.2831853 + hexPos.y * 12.0));

    float fScale = (flakeScaleP > 0.01 ? flakeScaleP : 1.3) * (0.85 + 0.35 * audioSwell);

    // Faceted prism thickness
    float zThick = (0.15 - 0.08 * r + 0.04 * branch) * (1.0 + 0.2 * audioKick);

    vec3 worldPos = vec3(uv.x * 3.9, uv.y * 3.9, zThick) * fScale;

    // Crystal facet normal
    vNormal = normalize(vec3(cos(theta) * 0.3, sin(theta) * 0.3, 1.0));

    // Ice crystal diamond glint on kick
    float glint = pow(branch, 4.0) * (1.0 + 3.5 * audioKick);
    vIceGlow = glint;

    vCol = imgPalette(fract(r * 0.35 + 0.07));
    // Growth breathing for the frag's silhouette carve.
    vGrow = 0.62 + 0.38 * sin(t * 0.45 + audioSwell * 0.6);

    // Camera Transform (V3)
    vec3 vp = worldPos;

    // In-plane spin plus a gentle tilt wobble.  The old full Y-rotation
    // turned the flat quad edge-on twice a cycle, blanking half the frame.
    float c = cos(t * 0.22), s = sin(t * 0.22);
    vp.xy = vec2(vp.x * c - vp.y * s, vp.x * s + vp.y * c);
    float tl = 0.22 * sin(t * 0.35);
    float ct = cos(tl), st = sin(tl);
    vp = vec3(vp.x, vp.y * ct - vp.z * st, vp.y * st + vp.z * ct);
    vp.z += 4.5;
    vp.x -= eyeOff;

    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
