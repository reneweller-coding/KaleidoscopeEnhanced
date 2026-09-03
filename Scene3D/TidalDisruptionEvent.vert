#version 330 core
/**
 * @file TidalDisruptionEvent.vert
 * @brief Vertex stage for TidalDisruptionEvent.comp/.frag: a fixed camera
 * above the orbital plane looking at the hole; particles coloured by their
 * depth in the star (attrB.y: core bright, envelope dim) and their speed
 * (attrB.x: the stream runs hot).  sceneProgress is declared here so the
 * host treats the scene as staged (drop regie).  No camera motion.
 */
layout(location = 0) in vec4 attrA;   // xyz = position, w = id
layout(location = 1) in vec4 attrB;   // x = speed, y = kind (-1 sky, 2 hole, else radius fraction), zw = uv

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float sceneProgress;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float hueP;

out vec4 vColor;
out vec2 vTexCoord;
out float vDepth;
out float vKind;
out float vSpeed;

vec3 hueRot(vec3 c, float a)
{
    const vec3 k = vec3(0.57735);
    float ca = cos(a);
    return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

void main()
{
    vec3 pos = attrA.xyz;
    float kind = attrB.y;
    vTexCoord = attrB.zw;
    vSpeed = attrB.x;
    vKind = kind;

    // Star colour: white-hot core, orange envelope; the stream heats with speed.
    vec3 core = vec3(1.0, 0.95, 0.85), env = vec3(1.0, 0.55, 0.25);
    vec3 col = mix(core, env, clamp(kind, 0.0, 1.0));
    col = mix(col, vec3(0.7, 0.85, 1.0), clamp(attrB.x * 0.35, 0.0, 0.6));
    if (kind < 0.0 || kind > 1.5) col = vec3(1.0);
    float hue = (hueP > 0.001) ? hueP : 0.0;
    if (hue > 0.001) col = hueRot(col, 0.3 * sin(hue));
    vColor = vec4(col * (0.8 + 0.4 * audioLevel), 1.0);

    vec3 vp = pos;
    if (kind >= 0.0)
    {
        // Tilt the orbital plane toward the camera, then back off.
        float t = 0.75;
        vp = vec3(vp.x, cos(t) * vp.y - sin(t) * vp.z, sin(t) * vp.y + cos(t) * vp.z);
        vp.z += 4.2;
    }
    else vp.z = 16.0;
    vDepth = vp.z;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
