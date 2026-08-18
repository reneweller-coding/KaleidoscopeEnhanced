#version 330 core
// WarpStars.vert — warp-speed starfield with REAL parallax.  The camera
// races down a star tube; audioAdvance IS the throttle (fast music = warp),
// a drop fires a hyperjump flash.  attrA.w = index, attrB = seeds.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioAdvance;
uniform float audioSwell;
uniform float audioKick;
uniform float audioDrop;
uniform float audioChromaHue;
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
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    const float L = 240.0;
    float camZ = time * 12.0 + audioAdvance * 55.0;   // the music is the throttle

    float ang = r1 * 6.2831853;
    float rad = 1.6 + 30.0 * pow(r2, 1.5);            // clear corridor centre
    float z   = mod(r3 * L - camZ, L);

    vec3 vp = vec3(cos(ang) * rad, sin(ang) * rad, z);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.06 * gl_Position.w;
    if (z < 1.0)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(z, 1.0);
    float hyper = audioDrop + 0.35 * audioKick;
    gl_PointSize = clamp(90.0 * (0.4 + 0.8 * r4) * px / dist, 1.0, 16.0 * px)
                 * (1.0 + 0.5 * hyper);

    // White-blue stars with a scatter of warm/violet ones; the music's key
    // tints the whole field.
    vec3 col = palTint(mix(vec3(1.0), vec3(0.55, 0.7, 1.0), r4 * 0.7), 0.30 * r4, 0.20);
    col = hueRot(col, audioChromaHue * 0.4 + (r1 - 0.5) * 1.1);
    float fadeFar  = clamp(1.0 - z / L, 0.0, 1.0);
    float fadeNear = smoothstep(1.0, 6.0, z);
    col *= (0.45 + 0.65 * r2) * fadeFar * fadeNear
         * (0.8 + 0.5 * audioSwell + 0.4 * audioLevel + 2.0 * hyper);
    vCol = vec4(col * 2.4, 1.0);
}
