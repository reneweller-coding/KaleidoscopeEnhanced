#version 120
// MonolithField.vert — gliding through a plain of towering alien
// monoliths: near-black slabs whose glyph edges hum with their own
// spectrum band; the downbeat sends a choir-pulse rolling through the
// field, and on a DROP the monoliths LEVITATE, glyphs ablaze.
// Cubes: 64 monoliths + drifting shards + ground rubble.

attribute vec4 attrA;
attribute vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float cubeBudget;    // FPS detail budget: <1 -> drop every 2nd cube

uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioDownbeat;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioDrop;
uniform float dayPhase;   // slow host day/night cycle, 0..1 -> ambient light angle

varying vec4 vCol;
varying vec3 vCorner;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

void main()
{
    float idx = attrA.w;

    if (cubeBudget < 0.75 && mod(idx, 2.0) > 0.5 && idx >= 64.0)
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vCol = vec4(0.0); vCorner = attrA.xyz;
        return;
    }

    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    float camZ = time * 3.2 + audioAdvance * 8.0;

    // Day/night ambient angle: a warm grazing light by day keeps the
    // glyph edges dimly visible even without band energy; night is starker.
    float daylight = clamp(sin(dayPhase * 6.2831853), 0.0, 1.0);

    vec3  world;
    vec3  col;
    float glowB = 1.0;
    vec3  scale;

    if (idx < 64.0)
    {
        // ---- The monoliths: looping rows flanking a broad avenue. ----
        float L = 260.0;
        float z = mod(r1 * L - camZ, L);
        float side = (r2 < 0.5) ? -1.0 : 1.0;
        float lane = 9.0 + r3 * 34.0;
        float H = 9.0 + r4 * 13.0;

        // Levitation on the drop (slewed dropPulse -> smooth rise/settle).
        float lift = audioDrop * (2.5 + 3.0 * r2);

        world = vec3(side * lane, H * 0.5 - 8.0 + lift, z);
        scale = vec3(2.6, H, 0.9 + r3);

        int band = int(mod(idx, 32.0));
        float hum   = audioSpectrum[band];
        // Choir pulse: the downbeat rolls a wave outward through the field.
        float choir = audioDownbeat * exp(-abs(z - 26.0) * 0.05);
        col = hueRot(vec3(0.30, 0.55, 0.85),
                     audioChromaHue + r4 * 1.3 + 0.12 * (1.0 - daylight));
        glowB = 0.30 + 0.20 * daylight + 1.7 * hum + 1.2 * choir
              + 2.2 * audioDrop;

        if (z < 1.5 || z > 150.0)
        {
            gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
            vCol = vec4(0.0); vCorner = attrA.xyz;
            return;
        }
    }
    else if (idx < 1600.0)
    {
        // ---- Drifting shards high above the plain. ----
        float L = 260.0;
        float z = mod(r1 * L - camZ * 0.8, L);
        world = vec3((r2 - 0.5) * 110.0,
                     8.0 + r3 * 30.0 + sin(time * 0.2 + r4 * 40.0) * 1.5,
                     z);
        scale = vec3(0.4 + 0.7 * r4);
        col = hueRot(vec3(0.35, 0.45, 0.70), audioChromaHue);
        glowB = 0.25 + 0.35 * audioSwell + 1.2 * audioDrop;
        if (z < 1.5 || z > 130.0)
        {
            gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
            vCol = vec4(0.0); vCorner = attrA.xyz;
            return;
        }
    }
    else
    {
        // ---- Ground rubble for scale. ----
        float L = 260.0;
        float z = mod(r1 * L - camZ, L);
        world = vec3((r2 - 0.5) * 120.0, -8.3, z);
        scale = vec3(0.3 + 0.8 * r3, 0.25, 0.3 + 0.8 * r4);
        col = vec3(0.16, 0.17, 0.22);
        glowB = 0.5 + 0.6 * audioDrop;
        if (z < 1.5 || z > 110.0)
        {
            gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
            vCol = vec4(0.0); vCorner = attrA.xyz;
            return;
        }
    }

    world += attrA.xyz * scale;

    vec3 vp = vec3(world.x, world.y + 4.0, world.z);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.055 * gl_Position.w;

    col *= glowB * clamp(1.0 - world.z / 140.0, 0.0, 1.0);
    vCol    = vec4(col * 1.5, 1.0);
    vCorner = attrA.xyz;
}
