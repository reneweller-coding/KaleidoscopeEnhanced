#version 330 core
// HelixTower.vert — a 100-unit DNA double helix of glowing points; the base
// pair "rungs" light up with their spectrum band, a kick wave climbs the
// tower, the camera spirals slowly around it.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioKick;
uniform float audioBeatPhase;
uniform float audioChromaHue;
uniform float audioSwell;
uniform float audioDrop;

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

    bool  rung   = fract(r4 * 7.31) < 0.22;
    float strand = step(0.5, r1);
    float t      = rung ? floor(r2 * 46.0) / 46.0 : r2;   // rungs quantised
    float y      = (t - 0.5) * 100.0;
    float angH   = t * 28.0 + time * 0.06 + audioPhase * 0.10;

    vec3 pA = vec3(cos(angH) * 6.0,            y, sin(angH) * 6.0);
    vec3 pB = vec3(cos(angH + 3.14159) * 6.0,  y, sin(angH + 3.14159) * 6.0);
    vec3 world = rung ? mix(pA, pB, r3)
                      : (strand > 0.5 ? pB : pA)
                        + vec3(r3 - 0.5, 0.0, r4 - 0.5) * 0.8;

    // Kick wave climbing the tower with the beat phase.
    float wave = exp(-abs(y - (audioBeatPhase * 100.0 - 50.0)) * 0.15) * audioKick;

    // Camera spirals around the tower.
    float ca  = time * 0.07 + audioAdvance * 0.12;
    vec3 cam  = vec3(cos(ca) * 22.0, sin(time * 0.05) * 22.0, sin(ca) * 22.0);
    vec3 fwd  = normalize(vec3(0.0, cam.y * 0.35, 0.0) - cam);
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
    gl_PointSize = clamp((rung ? 55.0 : 42.0) * (0.5 + 0.7 * r4) * px / dist,
                         1.5, 24.0 * px) * (1.0 + 0.8 * wave);

    // Strands in two key-driven hues; rungs glow with their spectrum band.
    vec3 col;
    if (rung)
    {
        int band = int(mod(floor(t * 46.0), 32.0));
        col = hueRot(vec3(1.0, 0.7, 0.3), audioChromaHue + t * 2.0)
            * (0.5 + 2.2 * audioSpectrum[band]);
    }
    else
        col = hueRot(vec3(0.2, 0.85, 0.8), strand * 2.6 + audioChromaHue * 1.2)
            * (0.55 + 0.45 * r3);
    col *= 1.0 + 1.6 * wave + 1.2 * audioDrop;
    col *= (0.8 + 0.4 * audioSwell) * clamp(1.0 - vp.z / 90.0, 0.0, 1.0);
    vCol = vec4(col * 2.0, 1.0);
}
