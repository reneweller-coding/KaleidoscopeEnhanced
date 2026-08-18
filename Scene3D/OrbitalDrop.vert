#version 330 core
// OrbitalDrop.vert — atmospheric re-entry, looping forever: the fall
// begins among the stars, plasma fire streaks past the view, then a cloud
// deck bursts open and a city of lights rushes up — fade to black, and the
// next drop begins.  A DROP in the music fires a sonic-boom ring.
// Camera looks steeply down; the world rises past it.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioDrop;
uniform float audioLevel;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioValence;

out vec4 vCol;

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

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // Altitude 1 (orbit) -> 0 (ground), ~35 s per drop; every layer fades
    // around the wrap so the reset is invisible.
    float alt = 1.0 - fract(time * 0.028 + audioAdvance * 0.004);

    vec3  world;
    vec3  col;
    float glow = 1.0;

    if (r1 < 0.20)
    {
        // ---- Star dome above (fades as the air thickens). ----
        float th = r2 * 6.2831853;
        float ph = acos(2.0 * r3 - 1.0);
        world = vec3(sin(ph) * cos(th), abs(cos(ph)), sin(ph) * sin(th)) * 150.0;
        world.y = -world.y;                       // "down" is ahead
        col  = vec3(0.8, 0.85, 1.0) * (0.35 + 0.6 * r4);
        glow = smoothstep(0.35, 0.65, alt) * 1.4;
    }
    else if (r1 < 0.45)
    {
        // ---- Plasma streaks racing past during the burn window. ----
        float rad = 2.0 + 26.0 * pow(r2, 1.6);
        float ang = r3 * 6.2831853;
        float z   = mod(r4 * 120.0 + time * (60.0 + 30.0 * audioLevel), 120.0);
        world = vec3(cos(ang) * rad, -z + 30.0, sin(ang) * rad);
        world.xz += vec2(sin(z * 0.2), cos(z * 0.17)) * 0.8;
        col = imgPalette(0.25 * r2) * 1.5;
        float burn = exp(-pow((alt - 0.55) * 3.0, 2.0));
        glow = burn * (0.7 + 0.5 * audioKick + 0.8 * audioSwell)
             * (0.4 + 0.6 * r4) * 2.6;
    }
    else if (r1 < 0.70)
    {
        // ---- Cloud deck at altitude ~0.30, billowing past. ----
        float spread = 4.0 + 116.0 * r2;
        float ang    = r3 * 6.2831853;
        world = vec3(cos(ang) * spread,
                     (0.30 - alt) * 420.0 + (r4 - 0.5) * 14.0,
                     sin(ang) * spread);
        col  = vec3(0.75, 0.80, 0.90);
        glow = exp(-pow((alt - 0.28) * 6.0, 2.0)) * (0.25 + 0.45 * r4);
    }
    else if (r1 < 0.97)
    {
        // ---- The city below: a grid of lights rushing up. ----
        vec2 cell = vec2(mod(floor(r2 * 4096.0), 64.0),
                         floor(r3 * 64.0)) - 31.5;
        world = vec3(cell.x * 5.5 + (r4 - 0.5) * 2.0,
                     (0.02 - alt) * 420.0,
                     cell.y * 5.5 + (fract(r2 * 63.0) - 0.5) * 2.0);
        vec3 sodium = vec3(1.0, 0.65, 0.25);
        vec3 neon   = hueRot(vec3(0.3, 0.7, 1.0), audioChromaHue + r4 * 3.0);
        col  = mix(sodium, neon, step(0.8, r4));
        glow = smoothstep(0.45, 0.25, alt)          // appears through clouds
             * smoothstep(0.015, 0.06, alt)         // fades just before "impact"
             * (0.4 + 0.6 * r2) * 1.6;
    }
    else
    {
        // ---- Sonic-boom ring on the music's drop. ----
        float ang = r2 * 6.2831853;
        float R   = 6.0 + (1.0 - audioDrop) * 55.0;
        world = vec3(cos(ang) * R, -20.0 + (r3 - 0.5) * 3.0, sin(ang) * R);
        col  = vec3(0.7, 0.9, 1.0);
        glow = audioDrop * 2.5;
    }

    // Fixed camera pitched steeply down at the fall.
    float pitch = -1.15;
    vec3 vp = vec3(world.x,
                   world.y * cos(pitch) - world.z * sin(pitch),
                   world.y * sin(pitch) + world.z * cos(pitch));
    vp.z += 40.0;

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(105.0 * (0.4 + 0.8 * r4) * px / dist, 1.5, 16.0 * px);

    col *= glow * clamp(1.0 - vp.z / 190.0, 0.0, 1.0);
    vCol = vec4(col * 2.8, 1.0);
}
