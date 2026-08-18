#version 330 core
// VolcanoIsland.vert — an island volcano at night: ballistic lava bombs
// arc from the crater (every kick feeds the fountain, a DROP is the big
// eruption), lava rivers crawl down seeded channels, embers spiral up into
// the smoke.  60k points: 35 % fountain, 25 % cone rock, 15 % lava
// rivers, 15 % rising embers, 10 % stars.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioSwell;
uniform float audioDrop;
uniform float dayPhase;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioChromaHue;
uniform float audioValence;   // slow host day/night cycle, 0..1

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
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

void main()
{
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // Day/night: one full cycle per dayPhase period.  Stars fade in the
    // island's night sky; sunlit haze warms the rock by day.
    float daylight = clamp(sin(dayPhase * 6.2831853), 0.0, 1.0);

    // Cone: apex (crater rim) at y=14, base radius 34 at y=-12.
    vec3  world;
    vec3  col;
    float glow = 1.0;

    if (r1 < 0.35)
    {
        // ---- Lava fountain: ballistic bombs on individual cycles. ----
        float cyc = 1.6 + 2.4 * r2;                       // flight time
        float u   = fract((time + audioAdvance * 0.8) / cyc + r3 * 7.0);
        float T   = u * cyc;
        float ang = r4 * 6.2831853;
        float vUp = 16.0 + 10.0 * r2;
        float vSide2 = (2.0 + 6.0 * fract(r3 * 13.0));
        world = vec3(cos(ang) * vSide2 * T,
                     14.0 + vUp * T - 6.5 * T * T,
                     sin(ang) * vSide2 * T);
        // Eruption strength gates how many bombs are lit.
        float intensity = 0.40 + 0.5 * audioKick + 1.0 * audioDrop
                        + 0.20 * audioBass;
        float lit = step(r4, intensity);
        col = palTint(mix(vec3(1.0, 0.95, 0.6), vec3(1.0, 0.25, 0.03),
                  smoothstep(0.0, 0.8, u)), 0.10, 0.15);
        glow = lit * (1.0 - smoothstep(0.75, 1.0, u)) * 1.6;
    }
    else if (r1 < 0.60)
    {
        // ---- The cone: rock points, ember-lit near the rim. ----
        float h   = pow(r2, 0.7);                          // 0 base .. 1 rim
        float rad = mix(34.0, 4.5, h);
        float ang = r3 * 6.2831853;
        rad *= 1.0 + 0.10 * sin(ang * 5.0 + r4 * 6.28);    // ridges
        world = vec3(cos(ang) * rad, -12.0 + 26.0 * h, sin(ang) * rad);
        float rim = smoothstep(0.70, 1.0, h);
        col = mix(vec3(0.11, 0.11, 0.16),
                  vec3(0.9, 0.30, 0.05), rim * (0.6 + 0.4 * audioBass));
        col += vec3(0.16, 0.11, 0.05) * daylight;         // sunlit haze by day
        glow = 0.8 + 0.4 * r4 + rim * (0.9 + 1.2 * audioDrop);
    }
    else if (r1 < 0.75)
    {
        // ---- Lava rivers: pulsing flows down 6 seeded channels. ----
        float ch  = floor(r2 * 6.0);
        float ang = ch * 1.047 + 0.3 * sin(ch * 9.0)
                  + (r3 - 0.5) * 0.14;
        float h   = 1.0 - fract(r4 * 9.0 + (time * 0.06 + audioAdvance * 0.02));
        float rad = mix(4.5, 34.0, 1.0 - h);
        world = vec3(cos(ang) * rad, -12.0 + 26.0 * h, sin(ang) * rad);
        float pulse = 0.6 + 0.4 * sin(h * 20.0 - time * 2.0 + ch);
        col = palTint(mix(vec3(1.0, 0.5, 0.08), vec3(0.75, 0.10, 0.02), 1.0 - h), 0.06 * h, 0.15);
        glow = pulse * (1.2 + 0.6 * audioBass + 1.2 * audioDrop);
    }
    else if (r1 < 0.90)
    {
        // ---- Embers spiralling up into the night. ----
        float u   = fract(r2 * 5.0 + time * (0.05 + 0.05 * r3));
        float ang = r4 * 6.2831853 + u * 5.0;
        float rad = 3.0 + u * 16.0;
        world = vec3(cos(ang) * rad, 15.0 + u * 42.0, sin(ang) * rad);
        col  = vec3(1.0, 0.45, 0.12);
        glow = (1.0 - u) * (0.35 + 0.5 * audioSwell + 0.8 * audioDrop)
             * (0.4 + 0.6 * r3);
    }
    else
    {
        // ---- Stars. ----
        float th = r2 * 6.2831853;
        float ph = acos(2.0 * r3 - 1.0);
        world = vec3(sin(ph) * cos(th), abs(cos(ph)) * 0.9 + 0.06,
                     sin(ph) * sin(th)) * 150.0;
        col  = vec3(0.75, 0.8, 0.95);
        glow = (0.15 + 0.35 * r4) * (1.0 - 0.9 * daylight);   // fade by day
    }

    // Camera circles the island at sea level distance.
    float ca  = time * 0.045;
    vec3 camP = vec3(cos(ca) * 70.0, 6.0, sin(ca) * 70.0);
    vec3 fwd  = normalize(vec3(0.0, 8.0, 0.0) - camP);
    vec3 rgt  = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3 up   = cross(rgt, fwd);
    vec3 rel  = world - camP;
    vec3 vp   = vec3(dot(rel, rgt), dot(rel, up), dot(rel, fwd));

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(110.0 * (0.4 + 0.8 * r4) * px / dist, 1.5, 16.0 * px);

    col *= glow * clamp(1.0 - vp.z / 170.0, 0.0, 1.0);
    vCol = vec4(col * 2.8, 1.0);
}
