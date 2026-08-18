#version 330 core
// AsteroidBelt.vert — drifting through an asteroid belt: 4900 tumbling
// rocks at every scale, sunlight from one side, kicks kick the throttle,
// a drop lights every rock's rim like a solar flare.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float cubeBudget;    // FPS detail budget: <1 -> drop every 2nd cube

uniform float audioAdvance;
uniform float audioKick;
uniform float audioChromaHue;
uniform float audioDrop;
uniform float audioSwell;
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

void main()
{
    // FPS budget: below full detail, every 2nd rock collapses.
    if (cubeBudget < 0.75 && mod(attrA.w, 2.0) > 0.5)
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vCol = vec4(0.0); vCorner = attrA.xyz;
        return;
    }

    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // Belt slab ahead; every rock loops independently down the flight path.
    float camZ = time * 5.0 + audioAdvance * 18.0;
    float L    = 220.0;
    float z    = mod(r3 * L - camZ, L) + 2.0;

    vec3 centre = vec3((r1 - 0.5) * 130.0,
                       (r2 - 0.5) * 55.0,
                       z);

    // CAMERA-SAFE corridor: rocks near the flight axis are pushed radially
    // aside, with the clearance widening as they come close — the belt
    // visibly parts around the ship and nothing ever engulfs the lens.
    {
        float rad  = length(centre.xy);
        float safe = 7.0 + 60.0 * exp(-z * 0.05);
        if (rad < safe)
            centre.xy *= safe / max(rad, 0.6);
    }

    // Whole-rock cull outside the visible corridor.
    if (z < 1.5 || z > 130.0)
    {
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
        vCol = vec4(0.0); vCorner = attrA.xyz;
        return;
    }

    // Tumble: each rock spins around a seeded axis (two-plane rotation).
    float s  = (r4 < 0.94) ? (0.4 + 2.2 * r4 * r4) : (3.5 + 5.0 * (r4 - 0.94) * 16.0);
    float a1 = time * (0.3 + r1 * 0.8) + r2 * 6.28;
    float a2 = time * (0.2 + r2 * 0.6) + r3 * 6.28;
    vec3 c = attrA.xyz;
    c.xy = mat2(cos(a1), -sin(a1), sin(a1), cos(a1)) * c.xy;
    c.yz = mat2(cos(a2), -sin(a2), sin(a2), cos(a2)) * c.yz;
    // Squash into an irregular shard.
    c *= vec3(1.0, 0.55 + 0.8 * r2, 0.7 + 0.6 * r3);

    vec3 world = centre + c * s;

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.06 * gl_Position.w;

    // Sunlight from the upper right; rocks are grey-brown regolith.
    vec3 n = normalize(c);
    float lit = clamp(dot(n, normalize(vec3(0.7, 0.5, -0.4))), 0.06, 1.0);
    vec3 col = mix(vec3(0.38, 0.33, 0.28), vec3(0.55, 0.53, 0.50), r4)
             * lit * (1.1 + 0.5 * audioSwell + 0.5 * audioKick);
    // Mineral variety: warm iron-oxide vs cool ice-bearing rocks -- pure
    // grey regolith read as colourless (metric scan: saturation 0.12).
    col *= mix(vec3(1.12, 0.94, 0.80), vec3(0.82, 0.95, 1.14), r4);
    col = palTint(col, 0.30 * r4, 0.15);
    col = col;
    col *= 1.0 + 1.6 * audioDrop;
    col *= clamp(1.0 - z / 130.0, 0.0, 1.0) * 1.5;

    vCol    = vec4(col, 1.0);
    vCorner = attrA.xyz;
}
