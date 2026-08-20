#version 330 core
/**
 * @file MonolithField.vert
 * @brief Vertex stage companion to MonolithField.frag -- see that file's header for
 * this scene's description.
 */
// MonolithField.vert — gliding through a plain of towering alien
// monoliths: near-black slabs whose glyph edges hum with their own
// spectrum band; the downbeat sends a choir-pulse rolling through the
// field, and on a DROP the monoliths LEVITATE, glyphs ablaze.
// Cubes: 200 monoliths + drifting shards + a sky-dust haze + the plain itself.
//
// The plain used to be 3300 pebble-sized rubble cubes scattered over an
// otherwise BLACK ground, under an entirely black sky: a few bright glyph
// lines on nothing (luma 0.018, occ 0.37).  The rubble budget now lays a
// continuous dark ground plane out to the horizon, a dust haze placed in
// FRUSTUM coordinates carries the sky above it, and the avenue is three times
// as long a row of monoliths.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;
uniform float cubeBudget;    // FPS detail budget: <1 -> drop every 2nd cube

uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioDownbeat;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioDrop;
uniform float dayPhase;   // slow host day/night cycle, 0..1 -> ambient light angle

out vec4 vCol;
out vec3 vCorner;
out float vFlat;   // 1 = shade as a plain solid (ground / sky dust), no glyph edges

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

    // The monoliths are never dropped by the detail budget.
    if (cubeBudget < 0.75 && mod(idx, 2.0) > 0.5 && idx >= 200.0)
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vCol = vec4(0.0); vCorner = attrA.xyz; vFlat = 0.0;
        return;
    }

    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
    const float kTanY = 0.5206;
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

    const float L = 260.0;
    float camZ = time * 3.2 + audioAdvance * 8.0;

    // Day/night ambient angle: a warm grazing light by day keeps the
    // glyph edges dimly visible even without band energy; night is starker.
    float daylight = clamp(sin(dayPhase * 6.2831853), 0.0, 1.0);

    vec3  world;
    vec3  col;
    float glowB = 1.0;
    vec3  scale;
    float fade = 1.0;
    vFlat = 0.0;

    if (idx < 200.0)
    {
        // ---- The monoliths: looping rows flanking a broad avenue. ----
        float z = mod(r1 * L - camZ, L);
        float side = (r2 < 0.5) ? -1.0 : 1.0;
        float lane = 7.0 + r3 * 40.0;
        float H = 9.0 + r4 * 15.0;

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
        glowB = min(0.30 + 0.20 * daylight + 1.7 * hum + 1.2 * choir
                  + 2.2 * audioDrop, 4.0);

        if (z < 1.5 || z > 175.0)
        {
            gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
            vCol = vec4(0.0); vCorner = attrA.xyz; vFlat = 0.0;
            return;
        }
        fade = clamp(1.0 - z / 185.0, 0.0, 1.0);
    }
    else if (idx < 1300.0)
    {
        // ---- Drifting shards high above the plain. ----
        float z = mod(r1 * L - camZ * 0.8, L);
        world = vec3((r2 - 0.5) * 130.0,
                     7.0 + r3 * 34.0 + sin(time * 0.2 + r4 * 40.0) * 1.5,
                     z);
        scale = vec3(0.5 + 0.9 * r4);
        col = hueRot(vec3(0.35, 0.45, 0.70), audioChromaHue);
        glowB = min(0.25 + 0.35 * audioSwell + 1.2 * audioDrop, 2.0);
        if (z < 1.5 || z > 145.0)
        {
            gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
            vCol = vec4(0.0); vCorner = attrA.xyz; vFlat = 0.0;
            return;
        }
        fade = clamp(1.0 - z / 155.0, 0.0, 1.0);
    }
    else if (idx < 2500.0)
    {
        // ---- Sky dust: the haze that gives the black sky a body. ----
        // Placed in FRUSTUM coordinates -- lateral offset, height and mote size
        // all scale with depth -- so the sky is evenly carried at every
        // distance.  This branch never enters the world-space row loop, so it
        // is exempt from the z wrap the plain uses.
        float hx = r1, hy = r2, hz = r3, hw = r4;

        // The scene's far plane is 220 (Scene3DShader::draw); a mote past it is
        // clipped away entirely, so the band stops well short of it.
        float dz    = 52.0 + hz * 138.0;
        float halfH = dz * kTanY;
        float halfW = halfH * aspect;

        // 2.0 would span the frustum exactly; 2.3 so the field still reaches
        // past the side edges when the preset camera rig rolls and yaws.  The
        // vertical band starts just above the horizon (which sits at the frame
        // centre for this camera) and reaches past the top edge.
        float ny = -0.04 + hy * 1.22;
        float ph = hx * 6.2831853 + time * 0.05 + audioAdvance * 0.04;

        world = vec3((hx - 0.5) * 2.3 * halfW + 0.02 * halfW * cos(ph),
                     ny * halfH - 4.0 + 0.015 * halfH * sin(ph * 0.83),
                     dz);
        // A mote sized as a fraction of its own depth stays a legible ~10 px
        // speck at any distance; below a few pixels it averages away and the
        // sky reads as black again.
        scale = vec3(dz * 0.0105 * (0.6 + 1.0 * hw));

        col = hueRot(vec3(0.26, 0.38, 0.62), audioChromaHue + hz * 0.9);
        glowB = (0.44 + 0.44 * hw) * (0.85 + 0.35 * audioSwell)
              + 0.45 * audioDrop;
        fade = clamp(1.0 - dz / 260.0, 0.20, 1.0);
        vFlat = 1.0;
    }
    else
    {
        // ---- The plain itself: overlapping slabs laid out to the horizon. ----
        float z = mod(r1 * L - camZ, L);
        world = vec3((r2 - 0.5) * 250.0, -8.35 + (r3 - 0.5) * 0.22, z);
        scale = vec3(7.0 + 5.0 * r3, 0.30, 7.0 + 5.0 * r4);
        col = vec3(0.105, 0.115, 0.155) * (0.65 + 0.7 * r4);
        glowB = min(0.9 + 0.25 * audioSwell + 0.6 * audioDrop, 2.0);
        if (z < 0.8 || z > 205.0)
        {
            gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
            vCol = vec4(0.0); vCorner = attrA.xyz; vFlat = 0.0;
            return;
        }
        fade = clamp(1.0 - z / 220.0, 0.10, 1.0);
        vFlat = 1.0;
    }

    world += attrA.xyz * scale;

    vec3 vp = vec3(world.x, world.y + 4.0, world.z);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.055 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    col *= glowB * fade;
    vCol    = vec4(col * 1.5, 1.0);
    vCorner = attrA.xyz;
}
