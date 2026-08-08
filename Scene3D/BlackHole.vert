#version 120
// BlackHole.vert — an accretion disk around an invisible black hole:
// white-hot inner rim, red-cool outer edge, Doppler-bright approaching
// side, a thin photon ring, and infalling streams.  A DROP fires the
// relativistic polar jets.

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioAdvance;
uniform float audioBass;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioDrop;

varying vec4 vCol;

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

    if (r1 < 0.78)
    {
        // ---- Accretion disk (Kepler: inner orbits scream). ----
        float rad = 6.0 + 22.0 * pow(r2, 1.7);
        float om  = 30.0 * pow(rad, -1.5);
        float ang = r3 * 6.2831853 + (time + audioAdvance * 1.5) * om;
        float th  = (r4 - 0.5) * (0.35 + 0.05 * rad) * (1.0 + 1.2 * audioBass);
        world = vec3(cos(ang) * rad, th, sin(ang) * rad);

        // Temperature falls outward; the approaching side is boosted.
        vec3 hot  = vec3(1.0, 0.97, 0.90);
        vec3 cool = vec3(0.85, 0.30, 0.10);
        col = mix(hot, cool, smoothstep(6.0, 28.0, rad));
        float doppler = 0.65 + 0.55 * sin(ang);
        col *= doppler * (1.4 - 0.028 * rad);
    }
    else if (r1 < 0.83)
    {
        // ---- Photon ring: razor-thin, brilliant. ----
        float ang = r2 * 6.2831853 + time * 0.4;
        float rad = 5.55 + r3 * 0.25;
        world = vec3(cos(ang) * rad, (r4 - 0.5) * 0.3, sin(ang) * rad);
        col = vec3(1.0, 0.95, 0.8) * 1.8;
    }
    else if (r1 < 0.93)
    {
        // ---- Infalling tidal streams spiralling in. ----
        float s   = fract(r2 + (time + audioAdvance) * 0.05);
        float rad = mix(30.0, 5.8, pow(s, 0.7));
        float ang = r3 * 6.2831853 + s * 9.0;
        world = vec3(cos(ang) * rad, (r4 - 0.5) * 2.0 * (1.0 - s), sin(ang) * rad);
        col = vec3(0.55, 0.35, 0.75) * (0.4 + 0.8 * s);
    }
    else
    {
        // ---- Polar jets: erupt on the drop, whisper otherwise. ----
        float t   = r2 * 26.0;
        float sgn = (r3 < 0.5) ? 1.0 : -1.0;
        float spread = 0.5 + t * 0.10;
        world = vec3(cos(r4 * 6.2831853) * spread, sgn * (1.0 + t),
                     sin(r4 * 6.2831853) * spread);
        col = vec3(0.55, 0.75, 1.0)
            * (0.12 + 2.6 * audioDrop) * exp(-t * 0.10);
    }

    // Camera orbits slowly, slightly above the disk plane.
    float ca  = time * 0.05;
    vec3 cam  = vec3(cos(ca) * 40.0, 9.0, sin(ca) * 40.0);
    vec3 fwd  = normalize(-cam);
    vec3 rgt  = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3 up   = cross(rgt, fwd);
    vec3 rel  = world - cam;
    vec3 vp   = vec3(dot(rel, rgt), dot(rel, up), dot(rel, fwd));

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(90.0 * (0.4 + 0.8 * r4) * px / dist, 1.5, 18.0 * px);

    col = hueRot(col, audioChromaHue * 0.35);
    col *= (0.8 + 0.45 * audioSwell) * clamp(1.0 - vp.z / 110.0, 0.0, 1.0);
    vCol = vec4(col * 2.4, 1.0);
}
