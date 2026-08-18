#version 330 core
/**
 * @file QuantumVortexField.vert
 * @brief Vertex stage companion to QuantumVortexField.frag -- see that file's header for
 * this scene's description.
 */
// QuantumVortexField.vert — Indirect render pass for compute magnetic filaments
in vec4 attrA; // xyz = world pos, w = hue
in vec4 attrB; // xyz = normal, w = glow

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float audioAdvance;
uniform float audioSwell;
uniform float hueP;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioChromaHue;
uniform float audioValence;

out vec4 vCol;
out vec3 vNormal;
out vec3 vWorld;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    vec3 worldP = attrA.xyz;
    float hue = attrA.w;
    vec3 norm = attrB.xyz;
    float glow = attrB.w;

    // Orbiting Camera
    float camAngle = time * 0.15 + audioAdvance * 0.05;
    float camDist = 26.0 - audioSwell * 5.0;
    vec3 camPos = vec3(sin(camAngle) * camDist, 14.0 + 3.0 * sin(time * 0.2), cos(camAngle) * camDist);
    vec3 lookTarget = vec3(0.0, 0.0, 0.0);

    vec3 ww = normalize(lookTarget - camPos);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);

    vec3 relP = worldP - camPos;
    vec3 viewP = vec3(dot(relP, uu), dot(relP, vv), dot(relP, ww));

    viewP.x -= eyeOff;
    gl_Position = projM * vec4(viewP.x, viewP.y, -viewP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    // Quantum flux ribbon color: Cyan, Violet, Gold
    vec3 fluxCol = imgPalette(0.30 * hue) * 1.4;
    fluxCol = mix(fluxCol, vec3(1.0, 0.8, 0.2), 0.28 * (sin(hue * 6.28 + time) * 0.5 + 0.5));

    float h = (hueP > 0.0) ? hueP : 0.0;
    if (h > 0.001) fluxCol = hueRot(fluxCol, h);

    vCol = vec4(fluxCol * glow, 1.0);
    vNormal = norm;
    vWorld = worldP;
}
