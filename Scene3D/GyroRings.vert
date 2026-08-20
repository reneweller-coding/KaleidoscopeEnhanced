#version 330 core
/**
 * @file GyroRings.vert
 * @brief Vertex stage companion to GyroRings.frag -- see that file's header for
 * this scene's description.
 *
 * Audio Reactivity:
 *   audioBarPhase  -> the glint's position: it travels once around each ring
 *                     per bar
 *   audioBass      -> breath of the whole instrument
 *   audioSwell     -> overall glow
 *   audioChromaHue -> hue of the rings (musical key)
 *   audioSpread    -> HOW FAR THE NEST OPENS: a narrow spectrum (a pure tone)
 *                     draws the six rings in tight around the hub, rich wide
 *                     harmonics spread them out into a broad gyroscope
 *   audioDownbeat  -> the glint's PUNCH.  The scene has always promised that
 *                     "the downbeat sends a soft glint around each ring", but
 *                     only the bar PHASE was wired.  The accent on the bar's
 *                     "1" now widens the glint's falloff so it blooms along
 *                     the ring; its peak amplitude drops slightly at the same
 *                     time, keeping the extra energy to a bounded ~+35%
 *   audioSharpness -> machined-edge crispness (see .frag)
 */
// GyroRings.vert — a great gyroscope: six nested rings of cubes, each
// revolving around its own tilted axis at its own stately rate; the bass
// breathes the whole instrument, the downbeat sends a soft glint around
// each ring.  Harmonic clockwork.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioBass;
uniform float audioSwell;
uniform float audioBarPhase;
uniform float audioChromaHue;
uniform float audioSpread;
uniform float audioDownbeat;

out vec4 vCol;
out vec3 vCorner;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    float idx = attrA.w;

    // Ring r holds 80 + r*60 cubes: 80,140,200,260,320,380 -> 1380 used.
    float ring = 0.0, node = idx, count = 80.0;
    for (int i = 0; i < 6; ++i)
    {
        if (node < count) break;
        node -= count;
        ring += 1.0;
        count += 60.0;
    }
    if (ring > 5.5)
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vCol = vec4(0.0); vCorner = attrA.xyz;
        return;
    }

    // SPECTRAL SPREAD opens the nest: a pure tone draws the six rings in
    // tight around the hub, rich wide harmonics spread them into a broad
    // gyroscope.  R feeds no integrated phase (ang's time term is
    // independent of it), so this is a safe static shape parameter.
    float R = (6.0 + ring * 3.6) * (1.0 + 0.06 * audioBass)
            * (0.86 + 0.30 * clamp(audioSpread, 0.0, 1.0));
    float ang = (node / count) * 6.2831853
              + time * (0.22 - ring * 0.028) * ((mod(ring, 2.0) < 0.5) ? 1.0 : -1.0);

    vec3 p = vec3(cos(ang) * R, 0.0, sin(ang) * R);

    // Each ring's plane is tilted differently and precesses slowly.
    float tiltA = ring * 0.55;
    float prec  = time * (0.05 + ring * 0.012);
    p.yz = mat2(cos(tiltA), -sin(tiltA), sin(tiltA), cos(tiltA)) * p.yz;
    p.xy = mat2(cos(prec), -sin(prec), sin(prec), cos(prec)) * p.xy;

    // Soft glint travels around each ring once per bar (wrapped distance),
    // and the DOWNBEAT accent is what gives it its punch: on the bar's "1"
    // the falloff widens so the glint blooms along the ring.  Its peak
    // amplitude is trimmed at the same time (see the col *= below), so the
    // accent buys roughly +35% integrated energy and no more.
    float dbt = clamp(audioDownbeat, 0.0, 1.0);
    float gd = mod(node / count - audioBarPhase + 1.0, 1.0);
    float glint = exp(-min(gd, 1.0 - gd) * (10.5 - 4.0 * dbt));

    float s = 0.9 - ring * 0.06;
    vec3 world = p + attrA.xyz * s;

    vec3 vp = world + vec3(0.0, 0.0, 36.0);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    vec3 col = hueRot(vec3(0.35, 0.7, 0.95),
                      audioChromaHue + ring * 0.55);
    col *= (0.45 + 0.35 * audioSwell + (0.95 - 0.15 * dbt) * glint);
    col *= clamp(1.0 - vp.z / 90.0, 0.15, 1.0);

    vCol    = vec4(col * 1.5, 1.0);
    vCorner = attrA.xyz;
}
