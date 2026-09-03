#version 330 core
/**
 * @file ShipShadowPlay.vert
 * @brief SHIP SHADOW PLAY: a ship between two lamps, and what you see is its
 * two shadows on a wall.  No shadow map is needed: the model is drawn three
 * times (instances="3") -- instance 0 is the ship itself, dim, and instances
 * 1 and 2 are the SAME mesh projected from each lamp onto the wall plane
 * (a planar projection), flattened into silhouettes.  Two lamps in two
 * colours give two coloured shadows that overlap to dark.  The lamps glide
 * on the scene clock, so the shadows stretch and swing slowly; the music
 * is the lamps' brightness.  No camera motion.
 */
in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float sceneAdvance;
uniform float sceneTime;
uniform int   meshVertexCount;
uniform int   meshInstances;
uniform vec3  meshExtent;
uniform vec3  meshCenter;

uniform float sizeP;
uniform float swingP;

out vec2 vUV;
out vec3 vNormal;
out vec3 vPos;
out float vBg;
out float vKind;      // 0 ship, 1 shadow of lamp A, 2 shadow of lamp B

const float WALL_Z = 60.0;

vec3 lampPos(int k)
{
    float t = sceneAdvance * 0.12 + sceneTime * 0.025;
    float sw = 0.6 + 0.6 * clamp(swingP, 0.0, 1.0);
    // Lamps well behind the ship (toward the camera): a long throw keeps the
    // shadows only a little larger than the ship instead of wall-sized.
    if (k == 1) return vec3(-16.0 + 9.0 * sw * sin(t),        7.0 + 3.0 * sin(t * 0.7),        4.0);
    return              vec3( 16.0 + 9.0 * sw * sin(t + 2.1), 6.0 + 3.0 * sin(t * 0.6 + 1.0), 4.0);
}

void main()
{
    bool isBg = gl_VertexID >= meshVertexCount;
    int inst = gl_InstanceID;

    if (isBg)
    {
        if (inst > 0)
        {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            vUV = vec2(0.0); vNormal = vec3(0.0, 1.0, 0.0); vPos = vec3(0.0); vBg = 1.0; vKind = 0.0;
            return;
        }
        vec3 w = attrA.xyz;
        vNormal = normalize(attrB.xyz);
        vPos = w; vUV = vec2(0.0); vBg = 1.0; vKind = 0.0;
        vec3 vp = vec3(w.x - eyeOff, w.y, w.z);
        gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
        gl_Position.z = gl_Position.w * 0.999999;
        return;
    }

    // The ship: centred, sized by its bounding sphere, turning slowly on time.
    vec3 p = attrA.xyz - meshCenter;
    vec3 n = attrB.xyz;
    float rad = max(length(meshExtent), 1e-4);
    p *= 16.0 * (sizeP > 0.05 ? sizeP : 1.0) / rad;
    float ry = time * 0.15, rx = 0.25 * sin(time * 0.07);
    mat3 RY = mat3(cos(ry), 0.0, -sin(ry), 0.0, 1.0, 0.0, sin(ry), 0.0, cos(ry));
    mat3 RX = mat3(1.0, 0.0, 0.0, 0.0, cos(rx), sin(rx), 0.0, -sin(rx), cos(rx));
    p = RY * RX * p;
    n = RY * RX * n;
    vec3 ship = p + vec3(0.0, 0.0, 38.0);

    vec3 world = ship;
    if (inst > 0)
    {
        // Planar projection from the lamp onto the wall z = WALL_Z.
        vec3 L = lampPos(inst);
        vec3 d = ship - L;
        float s = (WALL_Z - L.z) / max(d.z, 1e-3);
        world = L + d * s;
        world.z -= 0.05 * float(inst);          // the two shadows never z-fight
    }

    vUV = vec2(attrA.w, attrB.w);
    vNormal = normalize(n);
    vPos = world;
    vBg = 0.0;
    vKind = float(inst);
    vec3 vp = vec3(world.x - eyeOff, world.y, world.z);
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
}
