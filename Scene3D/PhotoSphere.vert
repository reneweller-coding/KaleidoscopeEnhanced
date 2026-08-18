#version 330 core
/**
 * @file PhotoSphere.vert
 * @brief Vertex stage companion to PhotoSphere.frag -- see that file's header for
 * this scene's description.
 */
// PhotoSphere.vert — a slowly turning planet wrapped in the current image;
// the camera orbits it, the bass makes it breathe.  attrA.x = longitude,
// attrA.y = latitude (grid sheet closed around the sphere).

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioBass;
uniform float audioSwell;
uniform float audioAdvance;

out vec2  vUV;
out vec3  vN;
out vec3  vView;

void main()
{
    float lon = attrA.x * 6.2831853;
    float lat = (attrA.y - 0.5) * 3.14159265;

    vec3 n = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));

    // The planet spins; the music nudges the spin along.
    float spin = time * 0.12 + audioAdvance * 0.30;
    n.xz = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * n.xz;

    float R = 13.0 * (1.0 + 0.05 * audioBass + 0.03 * audioSwell);
    vec3 world = n * R + vec3(0.0, 0.0, 32.0);

    // The camera bobs gently around the equator plane.
    world.y += 2.0 * sin(time * 0.15);

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    vUV   = attrA.xy;
    vN    = n;
    vView = normalize(vec3(0.0, 0.0, 32.0));  // toward planet centre
}
