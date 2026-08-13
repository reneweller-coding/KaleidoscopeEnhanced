#version 330 core
// OrbitalShells.vert — a glowing nucleus wrapped in four precessing
// electron shells; each shell's brightness follows its register (bass to
// treble) with slow, dignified motion.  An atom as a chandelier.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioSwell;
uniform float audioChromaHue;

out vec4 vCol;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    vec3  world;
    vec3  col;

    if (r1 < 0.12)
    {
        // ---- Nucleus: a dense warm core, breathing with the sub-bass.
        float th = r2 * 6.2831853;
        float ph = acos(2.0 * r3 - 1.0);
        float R  = (1.2 + 1.6 * r4 * r4) * (1.0 + 0.30 * audioSubBass);
        world = vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th)) * R;
        col = vec3(1.0, 0.72, 0.30) * (1.1 + 0.8 * audioSubBass);
    }
    else
    {
        // ---- Four shells: rings of particles on tilted orbits that
        // precess at different stately rates.
        float shell = floor(mod(r1 * 40.0, 4.0));
        float R   = 7.0 + shell * 4.5;
        float lvl = (shell < 0.5) ? audioBass
                  : (shell < 1.5) ? audioMid * 0.8 + audioBass * 0.2
                  : (shell < 2.5) ? audioMid
                  : audioHigh;

        float ang = r2 * 6.2831853 + time * (0.30 - shell * 0.05);
        vec3 ring = vec3(cos(ang) * R, 0.0, sin(ang) * R);

        // Ring plane tilt + slow precession per shell.
        float tiltA = 0.5 + shell * 0.45;
        float prec  = time * (0.06 + shell * 0.017) + r3 * 0.0;
        ring.yz = mat2(cos(tiltA), -sin(tiltA), sin(tiltA), cos(tiltA)) * ring.yz;
        ring.xz = mat2(cos(prec), -sin(prec), sin(prec), cos(prec)) * ring.xz;

        world = ring + (vec3(r3, r4, r2) - 0.5) * 0.9;
        col = hueRot(vec3(0.35, 0.65, 1.0), audioChromaHue + shell * 0.8)
            * (0.30 + 1.6 * lvl);
    }

    vec3 vp = world + vec3(0.0, 0.0, 38.0);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(95.0 * (0.4 + 0.8 * r4) * px / dist, 1.5, 14.0 * px);

    col *= (0.75 + 0.45 * audioSwell) * clamp(1.0 - vp.z / 90.0, 0.0, 1.0);
    vCol = vec4(col * 2.6, 1.0);
}
