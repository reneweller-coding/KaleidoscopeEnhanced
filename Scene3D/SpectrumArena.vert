#version 120
// SpectrumArena.vert — the camera stands INSIDE a circular equalizer arena:
// 98 columns of 50 stacked cubes wrap around; each column belongs to a
// spectrum band (mirrored left/right), cubes light bottom-up with the
// band's level.  The whole arena breathes with the bass and slowly turns.

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float cubeBudget;    // FPS detail budget: <1 -> drop every 2nd cube

uniform float audioSpectrum[32];
uniform float audioBass;
uniform float audioAdvance;
uniform float audioChromaHue;
uniform float audioDrop;
uniform float audioKick;
uniform float audioDownbeat;
uniform float audioBeatPhase;

varying vec4 vCol;
varying vec3 vCorner;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    float idx = attrA.w;

    // FPS budget: below full detail, every 2nd cube collapses (vertical
    // pairing keeps every meter column alive, just half as dense).
    if (cubeBudget < 0.75 && mod(floor(idx / 98.0), 2.0) > 0.5)
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vCol = vec4(0.0); vCorner = attrA.xyz;
        return;
    }

    float colI = mod(idx, 98.0);             // column around the arena
    float row  = floor(idx / 98.0);          // 0..49 stacked upward

    // Column angle; the arena revolves slowly with the music.
    float ang = (colI / 98.0) * 6.2831853
              + time * 0.05 + audioAdvance * 0.10;

    // Mirrored band layout: bass at the front, highs behind you.
    float frac_ = colI / 98.0;
    float m = abs(frac_ * 2.0 - 1.0);        // 0 front .. 1 back
    int band = int(min(m * 31.0, 31.0));
    float lvl = audioSpectrum[band];

    float R = 30.0 * (1.0 + 0.05 * audioBass);
    // KICK SHOCKWAVE: every kick sends a ring of columns bulging outward,
    // rolling around the arena once per beat — the wall itself dances.
    float ringPh = fract(colI / 98.0 * 2.0 - audioBeatPhase);
    R += 3.5 * audioKick * exp(-ringPh * 6.0);
    float y = (row - 6.0) * 1.75;
    // Downbeat: the whole arena JUMPS a step upward and settles.
    y += 1.4 * audioDownbeat;

    // Meter: a cube is LIT while its row sits below the band level; dead
    // cubes stay as a faint skeleton so the arena always reads as a space.
    float meter = sqrt(lvl) * 50.0;
    float lit  = step(row, meter);
    float head = step(abs(row - meter), 1.2);        // the meter head

    vec3 centre = vec3(cos(ang) * R, y, sin(ang) * R);
    // CAMERA: instead of standing still, it flies a slow figure inside the
    // arena — near the wall, back through the middle (object-space motion:
    // the arena shifts around the camera, always continuous).
    centre.x += sin(time * 0.13) * 10.0;
    centre.z += cos(time * 0.09) * 7.0;
    centre.y -= sin(time * 0.07) * 3.0;

    // Whole-cube cull only behind the camera.
    if (centre.z < 1.0)
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vCol = vec4(0.0); vCorner = attrA.xyz;
        return;
    }

    // Cube corners tangent to the wall.
    vec3 tangent = vec3(-sin(ang), 0.0, cos(ang));
    vec3 normal  = vec3(-cos(ang), 0.0, -sin(ang));
    vec3 c = attrA.xyz;
    vec3 world = centre
               + tangent * c.x * 1.55
               + vec3(0.0, c.y * 1.55, 0.0)
               + normal * c.z * 1.2;

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    // Band hue sweeps around the arena; the meter head burns white-hot;
    // dead cubes are a dim blue-grey skeleton.
    vec3 hue = hueRot(vec3(1.0, 0.25, 0.4),
                      float(band) * 0.16 + audioChromaHue * 1.4);
    vec3 col = hue * (0.55 + 0.6 * (row / 46.0)) * lit
             + vec3(0.05, 0.06, 0.09) * (1.0 - lit);
    col = mix(col, hue * 1.6 + vec3(0.5), head);
    col *= 1.0 + 1.2 * audioDrop;
    col *= clamp(1.0 - vp.z / 90.0, 0.15, 1.0);

    vCol    = vec4(col * 1.8, 1.0);
    vCorner = attrA.xyz;
}
