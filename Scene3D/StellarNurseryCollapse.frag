#version 330 core
out vec4 fragColor;

in vec3 vPos;
in float vTemp;
in float vSeed;
in float vRadius;

uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioKick;
uniform float audioChromaHue;
uniform float audioSwell;

uniform float glowP;
uniform float heatP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

// Blackbody stellar temperature palette
vec3 blackbodyColor(float t) {
    vec3 colM = vec3(1.0, 0.25, 0.05); // Cool red (M-class)
    vec3 colG = vec3(1.0, 0.85, 0.40); // Solar yellow (G-class)
    vec3 colO = vec3(0.4, 0.75, 1.00); // Hot blue-white (O-class)
    vec3 col;
    if (t < 0.5) col = mix(colM, colG, t * 2.0);
    else col = mix(colG, colO, (t - 0.5) * 2.0);
    return col;
}

void main() {
    float glw = (glowP > 0.0) ? glowP : 1.0;
    float ht  = (heatP > 0.0) ? heatP : 1.0;
    float hue = (hueP  > 0.0) ? hueP  : 0.0;

    // Soft Gaussian point sprite circle
    vec2 pc = gl_PointCoord - vec2(0.5);
    float r2 = dot(pc, pc);
    if (r2 > 0.25) discard;

    float alpha = exp(-r2 * 12.0);

    // Stellar temperature coloring
    vec3 starCol = blackbodyColor(clamp(vTemp * ht, 0.0, 1.0));
    
    // Photo texture modulation for dust tint
    vec2 dustUV = vPos.xz * 0.2 + 0.5;
    vec3 dustCol = img(fract(dustUV));

    vec3 col = (starCol * 2.2 + dustCol * 0.5) * alpha * glw;

    // Core thermonuclear glow
    if (vTemp > 0.8) {
        col += vec3(1.0) * pow(alpha, 2.0) * (1.0 + 2.0 * audioKick);
    }

    col = hueRot(col, audioChromaHue + hue);
    fragColor = vec4(col, 1.0);
}
