#version 330 core
// MeteorStorm.vert — shooting stars over a still night sky: 40 meteors
// (1200 trail particles each), the rest static stars.  Meteor cycles run on
// music-nudged clocks; a drop turns the shower into a storm.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioAdvance;
uniform float audioOnset;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioDrop;
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
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;
    float idx = attrA.w;

    vec3  world;
    vec3  col;
    float sizeMul = 1.0;

    if (idx < 48000.0)
    {
        // ---- Meteors with long particle trails. ----
        float m  = floor(idx / 1200.0);              // meteor 0..39
        float h1 = hash11(m * 3.3 + 0.21);
        float h2 = hash11(m * 7.7 + 1.87);
        float h3 = hash11(m * 5.9 + 3.11);

        // Cycle: each meteor streaks, then waits; music advances the clock.
        float u = fract((time + audioAdvance * 1.4) * (0.14 + 0.10 * h3)
                        + h1 * 9.0);

        vec3 start = vec3((h1 - 0.5) * 150.0, 30.0 + h2 * 30.0,
                          35.0 + h3 * 70.0);
        vec3 dir   = normalize(vec3(0.55 + 0.3 * h2, -0.65, 0.10 * (h3 - 0.5)));
        float flight = u * (90.0 + 40.0 * h2);

        float t = r1;                                // 0 head .. 1 tail end
        world = start + dir * (flight - t * (14.0 + 10.0 * h2));
        world += vec3(r2 - 0.5, r3 - 0.5, r4 - 0.5) * (0.25 + 2.2 * t * t);

        // Bright while streaking mid-flight, invisible while waiting.
        float alive = smoothstep(0.02, 0.10, u) * (1.0 - smoothstep(0.55, 0.75, u));
        float head  = exp(-t * 4.5);
        col = palTint(mix(vec3(1.0, 0.85, 0.55), vec3(0.35, 0.55, 1.0), t), 0.30 * t, 0.22);
        col = col;
        col *= alive * (0.40 + 0.90 * head)
             * (1.0 + 0.6 * audioOnset + 2.2 * audioDrop);
        sizeMul = 0.7 + 1.3 * head;
    }
    else
    {
        // ---- Static star dome. ----
        float th = r1 * 6.2831853;
        float ph = acos(2.0 * r2 - 1.0);
        world = vec3(sin(ph) * cos(th), abs(cos(ph)) * 0.8 + 0.05,
                     sin(ph) * sin(th)) * 140.0;
        world.z = abs(world.z) + 20.0;
        float tw = 0.75 + 0.25 * sin(time * (1.0 + r3 * 3.0) + r4 * 40.0);
        col = vec3(0.75, 0.8, 0.95) * (0.25 + 0.55 * r4) * tw
            * (0.8 + 0.4 * audioSwell);
    }

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.04 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(100.0 * (0.4 + 0.8 * r4) * sizeMul * px / dist,
                         1.5, 16.0 * px);
    vCol = vec4(col * 3.0, 1.0);
}
