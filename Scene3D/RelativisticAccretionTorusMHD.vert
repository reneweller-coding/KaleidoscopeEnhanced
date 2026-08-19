#version 330 core
/**
 * @file RelativisticAccretionTorusMHD.vert
 * @brief Vertex stage companion to RelativisticAccretionTorusMHD.frag -- see that file's
 * header for this scene's description.
 */

in vec4 attrA; // xy = Patch UV [0,1], z = 0, w = Patch index
in vec4 attrB; // 4 seeds in [0,1)

out vec2 vUV;
out vec3 vNormal;
out vec3 vCol;
out float vDoppler;

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

uniform float torusRadiusP;
uniform float torusThickP;

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
    // Remap patch UV [0,1] to centered [-1,1] domain
    vec2 uv = attrA.xy * 2.0 - 1.0;
    vUV = attrA.xy;
    
    float t = time * 0.4 + audioAdvance * 0.35;
    
    // Thick magnetohydrodynamic Polish Donut accretion torus
    float u = uv.x * 3.14159265;
    float v = uv.y * 3.14159265;
    
    float R_torus = (torusRadiusP > 0.01 ? torusRadiusP : 1.3);
    float r_tube  = (torusThickP > 0.01 ? torusThickP : 0.65) * (0.85 + 0.3 * audioSwell);
    
    // Magnetohydrodynamic spiral turbulent ripples on torus surface
    float mhdWaves = sin(u * 6.0 - v * 4.0 - t * 3.0) * 0.12;
    float currentR = r_tube * (1.0 + mhdWaves);
    
    float cu = cos(u), su = sin(u);
    float cv = cos(v), sv = sin(v);
    
    vec3 worldPos = vec3(
        (R_torus + currentR * cv) * cu,
        (R_torus + currentR * cv) * su,
        currentR * sv
    );
    
    vNormal = normalize(vec3(cv * cu, cv * su, sv));
    
    // Relativistic Doppler beaming factor: g = 1 / (gamma * (1 - v/c * cos(theta)))
    // Material moving towards observer on left side is blueshifted & boosted
    float doppler = -su * 0.45;
    vDoppler = doppler;
    
    // Accretion plasma color
    vec3 plasmaCol = mix(vec3(1.0, 0.4, 0.1), vec3(0.3, 0.8, 1.0), clamp(doppler + 0.5, 0.0, 1.0));
    vCol = palTint(plasmaCol, u * 0.15 + audioCentroid, 0.25);
    
    // Camera Transform (V3): tilt BEFORE the translate -- applied after,
    // it swings the scene centre down by sin(tilt)*4.5 and left only the
    // torus rim peeking into the bottom of the frame.
    vec3 vp = worldPos;
    float tilt = 0.65;
    float c = cos(tilt), s = sin(tilt);
    vp = vec3(vp.x, vp.y * c - vp.z * s, vp.y * s + vp.z * c);
    vp.z += 4.5;
    vp.x -= eyeOff;
    
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
