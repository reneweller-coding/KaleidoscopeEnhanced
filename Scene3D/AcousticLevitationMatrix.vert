#version 330 core
// AcousticLevitationMatrix.vert — 4,900 monolithic levitating voxels
// trapped in an ultrasonic standing wave field creating a volumetric 3D photo display.
//   attrA.xyz = local cube corner (-0.5..0.5), attrA.w = cube index
//   attrB.xy  = grid coords (0..1), attrB.zw = per-cube seeds

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioCentroid;
uniform float audioSwell;
uniform float audioHigh;

uniform float nodeP;
uniform float liftP;
uniform float speedP;
uniform float hueP;

out vec4 vCol;
out vec2 vUV;
out vec3 vNormal;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float ci = attrA.w;
    vec3 corner = attrA.xyz;
    vec2 gridCoord = attrB.xy; // 0..1 (70x70 grid)
    vec2 seeds = attrB.zw;

    float nod = (nodeP  > 0.0) ? nodeP  : 1.0;
    float lft = (liftP  > 0.0) ? liftP  : 1.0;
    float spd = (speedP > 0.0) ? speedP : 1.0;
    float hue = (hueP   > 0.0) ? hueP   : 0.0;

    float t = time * 0.4 * spd + audioAdvance * 0.15;

    // Planar grid spacing in XZ
    float x = (gridCoord.x - 0.5) * 14.0;
    float z = (gridCoord.y - 0.5) * 14.0;

    // Acoustic standing wave nodal trap heights in Y
    float k = 1.2 * nod;
    float standingWave = sin(x * k) * cos(z * k) * sin(t * 3.0);
    float nodeLayer = floor(standingWave * 3.0) * 1.2 * lft;
    float y = nodeLayer + sin(x * 0.8 + z * 0.8 + t * 4.0) * 0.3 * (1.0 + audioBass);

    // Kick particle ejection jump
    y += audioKick * 2.2 * exp(-length(vec2(x, z)) * 0.3);

    // Voxel rotation on acoustic acoustic torque
    float spin = t * 2.0 + seeds.x * 6.28;
    mat3 rotY = mat3(cos(spin), 0.0, sin(spin), 0.0, 1.0, 0.0, -sin(spin), 0.0, cos(spin));

    vec3 voxelSize = vec3(0.12, 0.12, 0.12) * (1.0 + 0.5 * audioHigh);
    vec3 localPos = rotY * (corner * voxelSize);
    vec3 worldP = vec3(x, y, z) + localPos;

    // Camera space
    vec3 camPos = vec3(0.0, 5.0, -16.0);
    vec3 relP = worldP - camPos;
    relP.x -= eyeOff;

    gl_Position = projM * vec4(relP.x, relP.y, -relP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vUV = gridCoord;
    vNormal = rotY * normalize(corner);

    // Acoustic levitation ultrasound color gradient
    vec3 col = mix(vec3(0.1, 0.6, 1.0), vec3(1.0, 0.3, 0.8), gridCoord.y);
    col = mix(col, vec3(1.0, 0.95, 0.4), abs(standingWave));

    if (hue > 0.001) col = hueRot(col, hue);

    vCol = vec4(col, 1.0);
}
