#version 330 core
/**
 * @file GearWorks.vert
 * @brief Vertex stage companion to GearWorks.frag -- see that file's header for
 * this scene's description.
 */
// GearWorks.vert — a colossal clockwork wall: eight brass gears mesh and
// turn (small ones spin fast, big ones stately), a pendulum swings one
// full period per BAR, and a piston hammers with the beat.  Cubes are the
// teeth, spokes, hubs, frame and machinery.  A drop over-cranks the works.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float cubeBudget;    // FPS detail budget: <1 -> drop every 2nd cube

uniform float audioAdvance;
uniform float audioBarPhase;
uniform float audioKick;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioDrop;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioValence;

out vec4 vCol;
out vec3 vCorner;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}


// IMG-PALETTE (house standard): colours come from a rotating arc in the
// CURRENT slideshow image, so every activation inherits a fresh palette from
// the photos; the arc follows the musical key (audioChromaHue is circular-
// slewed = jump-free) with a slow advance drift, valence shapes saturation.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}


// House tint: bend a colour toward the photo palette while keeping its
// luminance -- the identity look survives, only the hue follows the photos.
vec3 palTint(vec3 c, float t, float k)
{
    vec3 tp = imgPalette(t);
    tp *= dot(c, vec3(0.3333)) / max(dot(tp, vec3(0.3333)), 1e-3);
    return mix(c, tp, k);
}
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

    // FPS budget: below full detail, every 2nd cube collapses.
    if (cubeBudget < 0.75 && mod(idx, 2.0) > 0.5)
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vCol = vec4(0.0); vCorner = attrA.xyz;
        return;
    }

    float r4 = attrB.w;

    // Eight gears on a vertical plane; teeth counts scale with radius so
    // the rims all move at the SAME surface speed — they read as meshed.
    vec2  gc[8];
    gc[0] = vec2(-24.0,   6.0);  gc[1] = vec2( -6.5,  14.0);
    gc[2] = vec2(  8.0,   2.0);  gc[3] = vec2( 24.0,  10.0);
    gc[4] = vec2(-16.0, -12.0);  gc[5] = vec2(  2.0, -15.0);
    gc[6] = vec2( 18.0,  -8.0);  gc[7] = vec2( 30.0,  -4.0);
    float gr[8];
    gr[0] = 10.5; gr[1] = 7.5; gr[2] = 5.0; gr[3] = 8.5;
    gr[4] = 6.0;  gr[5] = 7.0; gr[6] = 4.5; gr[7] = 5.5;

    vec3  world;
    vec3  col;
    float glowB = 1.0;

    float spin = time * 0.55 + audioAdvance * 0.9;

    if (idx < 4160.0)
    {
        // ---- Gear cubes: 520 per gear (72 teeth/rim, rest spokes+hub).
        float g = floor(idx / 520.0);
        float k = mod(idx, 520.0);
        int   gi = int(g);
        float R  = gr[gi];
        float dir = (mod(g, 2.0) < 0.5) ? 1.0 : -1.0;
        float rot = spin * dir * (6.0 / R)
                  * (1.0 + 0.5 * audioDrop);

        vec2 P; float s = 1.0;
        if (k < 72.0)
        {
            // Teeth on the rim.
            float ang = (k / 36.0) * 3.14159265 + rot;
            float tooth = mod(k, 2.0);                  // in / out
            P = gc[gi] + vec2(cos(ang), sin(ang)) * (R + tooth * 0.9);
            s = 0.85;
        }
        else if (k < 420.0)
        {
            // Rim ring + 6 spokes.
            float kk = k - 72.0;
            if (kk < 216.0)
            {
                float ang = (kk / 108.0) * 3.14159265 + rot;
                P = gc[gi] + vec2(cos(ang), sin(ang)) * (R - 0.6);
                s = 0.7;
            }
            else
            {
                float sp  = floor((kk - 216.0) / 22.0);
                float d   = fract((kk - 216.0) / 22.0);
                float ang = sp * 1.047 + rot;
                P = gc[gi] + vec2(cos(ang), sin(ang)) * (R - 1.4) * d;
                s = 0.6;
            }
        }
        else
        {
            // Hub.
            float ang = ((k - 420.0) / 50.0) * 6.2831853 + rot * 0.5;
            P = gc[gi] + vec2(cos(ang), sin(ang)) * (1.1 + fract(k * 0.37));
            s = 0.7;
        }
        world = vec3(P.x, P.y, 36.0 + g * 0.7 - 2.0);
        col = palTint(mix(vec3(0.85, 0.55, 0.20), vec3(0.55, 0.55, 0.60),
                  hash11(g * 9.1)), 0.30 * hash11(g * 9.1), 0.18);
        glowB = 0.7 + 0.5 * audioSwell + 1.0 * audioDrop;
    }
    else if (idx < 4400.0)
    {
        // ---- Pendulum: PHYSICAL fixed-period swing (a real pendulum obeys
        // gravity, not the DJ) — the old bar-phase drive snapped whenever
        // the beat tracker re-locked and read as canned animation.
        float k = idx - 4160.0;
        float a = 0.55 * sin(time * 1.35);
        vec2 pivot = vec2(4.0, 26.0);
        vec2 dirV  = vec2(sin(a), -cos(a));
        float d = k / 240.0;
        vec2 P = pivot + dirV * d * 24.0;
        float s = (d > 0.88) ? 2.0 : 0.55;              // the bob
        world = vec3(P.x, P.y, 33.0);
        col = vec3(0.95, 0.75, 0.30);
        glowB = 0.8 + 0.4 * audioSwell;
        world.xy += attrA.xy * s; world.z += attrA.z * s;
        vec3 vpP = world; vpP.x -= eyeOff;
        gl_Position = projM * vec4(vpP.x, vpP.y, -vpP.z, 1.0);
        gl_Position.x += eyeOff * 0.05 * gl_Position.w;
        vCol = vec4(col * glowB * 1.4, 1.0);
        vCorner = attrA.xyz;
        return;
    }
    else
    {
        // ---- Piston hammering with the kick + frame girders. ----
        float k = idx - 4400.0;
        if (k < 200.0)
        {
            float d = k / 200.0;
            float stroke = -3.5 * audioKick - 1.0
                         + 1.0 * sin(6.2831853 * audioBarPhase * 4.0);
            world = vec3(-34.0 + d * 4.0, 20.0 + stroke, 35.0);
            col = vec3(0.75, 0.30, 0.15);
            glowB = 0.8 + 1.2 * audioKick;
        }
        else
        {
            // Frame girders around the works.
            float f = k - 200.0;
            float sideH = (mod(f, 2.0) < 0.5) ? -1.0 : 1.0;
            float d = fract(f * 0.007);
            world = (f < 400.0)
                  ? vec3(-40.0 + d * 80.0, sideH * 24.0, 38.0)
                  : vec3(sideH * 40.0, -24.0 + d * 48.0, 38.0);
            col = vec3(0.30, 0.32, 0.38);
            glowB = 0.5 + 0.3 * audioSwell;
        }
    }

    world.xy += attrA.xy * 0.8;
    world.z  += attrA.z * 0.8;

    // CAMERA DOLLY: the eye cranes across the clockwork — slow push-ins on
    // single gears, pull-backs to the whole machine, slight parallax orbit.
    vec3 vp = world;
    vp.x += sin(time * 0.045) * 14.0;
    vp.y += sin(time * 0.031 + 1.0) * 7.0;
    vp.z += sin(time * 0.023) * 10.0 - 4.0;
    float yaw = sin(time * 0.045) * 0.12;
    vp.xz = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw)) * vp.xz;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;

    // KICK SPARKS: random teeth flash white-hot on the kick (metal striking
    // metal), a drop sets the whole machine glowing.
    col = col;
    float sparkG = step(0.85, hash11(idx * 7.7 + floor(time * 8.0))) * audioKick;
    col += vec3(1.0, 0.9, 0.6) * sparkG * 1.8;
    vCol    = vec4(col * glowB * (0.9 + 0.3 * r4) * 1.4, 1.0);
    vCorner = attrA.xyz;
}
