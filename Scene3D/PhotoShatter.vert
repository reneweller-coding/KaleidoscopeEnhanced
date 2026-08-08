#version 120
// PhotoShatter.vert — the current image stands as a wall of 3000 shards
// (75 x 40 grid).  Calm music keeps it assembled with a gentle breathing;
// kicks knock it apart a little, a DROP blows it into a tumbling cloud that
// drifts back together.  attrA.xy = shard corner, attrA.w = shard index.

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioKick;
uniform float audioDrop;
uniform float audioBuildUp;
uniform float audioOnset;

varying vec2  vUV;
varying float vLight;

void main()
{
    float idx = attrA.w;
    float cx  = mod(idx, 75.0);              // shard column
    float cy  = floor(idx / 75.0);           // shard row

    // Assembled wall: 30 x 16 world units at z = 26.
    vec2 cell   = vec2(cx / 75.0, cy / 40.0);
    vec2 size   = vec2(30.0 / 75.0, 16.0 / 40.0);
    vec3 home   = vec3((cell.x - 0.5 + 0.5 / 75.0) * 30.0,
                       (cell.y - 0.5 + 0.5 / 40.0) * 16.0,
                       26.0);

    // Explosion amount: breathing + build-up tension + the drop blast.
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;
    float e  = 0.06 + 0.06 * sin(time * 0.45 + r1 * 6.28)
             + 0.22 * audioBuildUp
             + 0.10 * audioKick * r2
             + 1.00 * audioDrop;

    // Seeded flight direction + tumble.
    vec3 dir = normalize(vec3(r1 - 0.5, r2 - 0.5, r3 - 0.35));
    vec3 centre = home + dir * e * 26.0;

    float a  = e * (2.0 + 10.0 * r4) + time * 0.15 * e;
    vec2 corner = (attrA.xy - 0.5) * vec2(30.0 / 75.0, 16.0 / 40.0);
    // Tumble the shard around a seeded axis (2D rotation in a tilted plane).
    vec3 right = vec3(cos(a), sin(a) * 0.8, sin(a) * 0.4);
    vec3 up    = vec3(-sin(a) * 0.7, cos(a), sin(a) * 0.3);

    vec3 vp = centre + right * corner.x + up * corner.y;

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.5)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    // Shard texture = its cell of the image (the wall assembles the photo).
    vUV = cell + attrA.xy * vec2(1.0 / 75.0, 1.0 / 40.0);

    // Flying shards catch rim light; onsets glint.
    vLight = 1.0 + e * (0.8 + 0.6 * sin(a * 3.0)) + 0.4 * audioOnset * r4;
}
