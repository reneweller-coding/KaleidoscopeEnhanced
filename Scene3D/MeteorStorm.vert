#version 330 core
/**
 * @file MeteorStorm.vert
 * @brief Vertex stage companion to MeteorStorm.frag -- see that file's header for
 * this scene's description.
 */
// MeteorStorm.vert — shooting stars over a still night sky: 56 meteors
// (500 trail particles each), the rest a star field.  Meteor cycles run on
// music-nudged clocks; a drop turns the shower into a storm.
//
// Both halves used to sit in a corner of the picture.  The star DOME put
// every star at |y| >= 0 on a sphere of radius 140, so the entire lower half
// of the frame was starless and the upper half's stars were all pinned at the
// same distance and clamped to the 1.5 px floor.  The stars are now laid out
// in FRUSTUM coordinates -- x and y scaled by their own depth -- across a
// wide range of depths, so they cover the whole picture evenly and come in
// every size, with a slice of them grown into a dim milky haze that carries
// the space between them.  The meteors, meanwhile, were aimed steeply down
// and to the right out of a start point high above the frame, so most of each
// flight happened off-screen; each one now starts just inside the top-left of
// its OWN depth's frustum and crosses the full diagonal.

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
    float sizeBase, sizeCap, sizeMin, sizeJit;

    // The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
    // Everything below is placed in FRUSTUM coordinates -- an x/y offset
    // scaled by its own depth -- which is what keeps both the star field and
    // the meteors' flight paths evenly spread over the picture at every
    // distance instead of bunching into one corner of a black frame.
    const float kTanY = 0.5206;
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

    if (idx < 28000.0)
    {
        // ---- Meteors with long particle trails. ----
        float m  = floor(idx / 500.0);               // meteor 0..55
        float h1 = hash11(m * 3.3 + 0.21);
        float h2 = hash11(m * 7.7 + 1.87);
        float h3 = hash11(m * 5.9 + 3.11);

        // Cycle: each meteor streaks, then waits; music advances the clock.
        float u = fract((time + audioAdvance * 1.4) * (0.14 + 0.10 * h3)
                        + h1 * 9.0);

        // Enter just inside the top-left of this meteor's own frustum slice
        // and cross the full diagonal; every length below is measured in that
        // slice's half-width / half-height, so a far meteor sweeps exactly as
        // much of the PICTURE as a near one.
        float dz0 = 45.0 + h3 * 90.0;
        float hw  = kTanY * aspect * dz0;
        float hh  = kTanY * dz0;
        vec3  start = vec3(-0.85 * hw, 0.80 * hh, dz0);
        vec3  dir   = normalize(vec3( 0.82 + 0.14 * h2,
                                     -0.50 - 0.22 * h2,
                                      0.06 * (h3 - 0.5)));
        float flight = u * 1.9 * hw;

        float t = r1;                                // 0 head .. 1 tail end
        world = start + dir * (flight - t * (0.11 + 0.07 * h2) * dz0);
        world += vec3(r2 - 0.5, r3 - 0.5, r4 - 0.5)
               * (0.25 + 2.2 * t * t) * (0.4 + dz0 / 70.0);

        // Bright while streaking mid-flight, invisible while waiting.
        float alive = smoothstep(0.02, 0.10, u) * (1.0 - smoothstep(0.60, 0.80, u));
        float head  = exp(-t * 4.5);
        col = palTint(mix(vec3(1.0, 0.85, 0.55), vec3(0.35, 0.55, 1.0), t), 0.30 * t, 0.22);
        col *= alive * (0.40 + 0.90 * head)
             * (1.0 + 0.6 * audioOnset + 2.2 * audioDrop);

        sizeBase = 297.2 * (0.7 + 1.3 * head);
        sizeCap  = 47.6;
        sizeMin  = 1.5;
        sizeJit  = 0.4 + 0.8 * r4;
    }
    else if (r4 < 0.30)
    {
        // ---- Milky haze: the dim stuff BETWEEN the stars. ----
        // A speck must stay legible at any distance -- below ~2.5 px an
        // additive sprite averages away to nothing and the far field reads
        // as black again, which is exactly what the old star dome did.
        float dz = 22.0 + r3 * 130.0;
        float open = 2.3;      // 2.0 fits the frustum exactly; 2.3 covers the rig's roll
        world = vec3((r1 - 0.5) * open * dz * kTanY * aspect,
                     (r2 - 0.5) * open * dz * kTanY,
                     dz);
        float tw = 0.85 + 0.15 * sin(time * (0.4 + r3 * 0.9) + r1 * 40.0);
        col = palTint(vec3(0.55, 0.62, 0.90), 0.62, 0.35)
            * (0.075 + 0.115 * r1) * tw * (0.8 + 0.4 * audioSwell)
            * clamp(1.0 - dz / 190.0, 0.0, 1.0);

        // The size term below divides by depth, which is right for a STAR (a
        // real object that gets smaller with distance) and wrong for a haze
        // patch, which has to hold a constant apparent size or the far half of
        // the field collapses onto the minimum-size floor and stops being
        // haze.  Folding dz back into the jitter cancels that division.
        sizeBase = 26.7;
        sizeCap  = 47.6;
        sizeMin  = 3.0;
        sizeJit  = (0.5 + 1.3 * r1) * dz;
    }
    else
    {
        // ---- Star field, spread across the frustum at every depth. ----
        float dz = 20.0 + r3 * r3 * 150.0;
        float open = 2.3;
        world = vec3((r1 - 0.5) * open * dz * kTanY * aspect,
                     (r2 - 0.5) * open * dz * kTanY,
                     dz);
        float tw = 0.75 + 0.25 * sin(time * (1.0 + r3 * 3.0) + r4 * 40.0);
        col = vec3(0.75, 0.8, 0.95) * (0.30 + 0.70 * r4) * tw
            * (0.8 + 0.4 * audioSwell);

        sizeBase = 297.2;
        sizeCap  = 47.6;
        sizeMin  = 1.8;
        sizeJit  = 0.4 + 0.8 * r4;
    }

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.04 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(sizeBase * sizeJit * px / dist,
                         sizeMin, max(sizeCap * px, sizeMin));
    // Cap the TINTED colour, not the scalar that fed it.
    vCol = vec4(min(col * 3.0, vec3(3.4)), 1.0);
}
