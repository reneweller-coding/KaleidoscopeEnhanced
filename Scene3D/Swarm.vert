#version 120
// Swarm.vert — a murmuration: 60k points trail a swooping Lissajous leader
// path through space; onsets scatter the flock, calm passages pull it tight.
// The "flock" illusion comes from per-bird lag along the path plus smooth
// per-bird oscillation offsets — no simulation needed.

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioAdvance;
uniform float audioOnset;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioCentroid;
uniform float audioDrop;

varying vec4 vCol;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

vec3 leader(float s)
{
    return vec3(26.0 * sin(1.00 * s),
                14.0 * sin(1.31 * s + 2.0),
                20.0 * sin(0.73 * s + 4.0));
}

void main()
{
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    float s   = time * 0.16 + audioAdvance * 0.35;
    float lag = r1 * 0.9;                          // trailing along the path
    float si  = s - lag;

    // Scatter breathes with the music: onsets puff the flock apart.
    float spread = (0.8 + 5.5 * lag)
                 * (1.0 + 1.8 * audioOnset + 0.6 * audioLevel + 2.5 * audioDrop);
    vec3 off = vec3(sin(si * 3.7 + r2 * 40.0),
                    sin(si * 4.3 + r3 * 40.0),
                    sin(si * 2.9 + r4 * 40.0)) * spread;

    vec3 world = leader(si) + off;

    // Slow orbiting observer that keeps the flock centre framed.
    float ca  = time * 0.05;
    vec3 tgt  = leader(s - 0.45);
    vec3 cam  = tgt + vec3(cos(ca) * 30.0, 7.0, sin(ca) * 30.0);
    vec3 fwd  = normalize(tgt - cam);
    vec3 rgt  = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3 up   = cross(rgt, fwd);
    vec3 rel  = world - cam;
    vec3 vp   = vec3(dot(rel, rgt), dot(rel, up), dot(rel, fwd));

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.04 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(95.0 * (0.4 + 0.8 * r4) * px / dist, 1.5, 14.0 * px);

    // Iridescent flock: hue drifts along the trail and with the key.
    vec3 col = hueRot(vec3(0.4, 0.8, 1.0),
                      audioChromaHue * 1.3 + lag * 2.2 + r2 * 0.4);
    col *= (0.45 + 0.6 * r3) * (0.8 + 0.5 * audioSwell)
         * (0.7 + 0.5 * audioCentroid)
         * clamp(1.0 - vp.z / 110.0, 0.0, 1.0);
    vCol = vec4(col * 3.0, 1.0);
}
