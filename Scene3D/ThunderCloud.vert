#version 330 core
/**
 * @file ThunderCloud.vert
 * @brief Vertex stage companion to ThunderCloud.frag -- see that file's header for
 * this scene's description.
 */
// ThunderCloud.vert — inside a night thunderstorm: a towering cloud mass
// broods overhead, and jagged lightning bolts tear through it — every
// SNARE can trigger a strike, a DROP is the full discharge.  The cloud
// billows around each bolt are lit from within by "their" bolt.
// 60k points: 52 % cloud, 25 % bolts (12 of them), 11 % rain, 12 % the far
// storm sky that flickers with sheet lightning behind everything.
//
// The cloud used to be a thin fog of 2 px specks -- present all over the
// frame, but so sparse and so evenly dim that the picture read as flat
// near-black.  The billow sprites are now several times wider (and
// correspondingly fainter each) so they fuse into real cloud mass, the bolt
// glow inside the cloud falls off much faster so lit cores stand against dark
// broil, and the far sky layer keeps the gaps between the billows off pure
// black.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioSnare;
uniform float audioKick;
uniform float audioBass;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioDrop;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float audioChromaHue;
uniform float audioAdvance;
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
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

// Strike envelope of bolt b: its own slow clock arms it, the flash decays
// fast; audio (snare/drop) multiplies whatever is armed RIGHT NOW.
float boltEnv(float b)
{
    float cyc = fract(time * (0.10 + 0.07 * hash11(b * 3.3))
                      + hash11(b * 7.7) * 9.0);
    // Between full strikes, a faint "leader" keeps flickering inside the
    // cloud so the storm never goes fully dark.
    float leader = 0.10 + 0.08 * sin(time * (5.0 + hash11(b * 9.1) * 4.0)
                                     + b * 2.7);
    return max(exp(-cyc * 14.0), leader);
}

// Bolt b's jagged column: position at height h (0 top .. 1 ground).
vec3 boltPos(float b, float h)
{
    vec2 start = vec2((hash11(b * 1.9) - 0.5) * 110.0,
                      (hash11(b * 5.1) - 0.5) * 110.0);
    float seg  = floor(h * 22.0);
    vec2 jag = vec2(hash11(b * 13.7 + seg * 1.31) - 0.5,
                    hash11(b * 17.3 + seg * 2.17) - 0.5) * 26.0 * h;
    return vec3(start.x + jag.x, 34.0 - h * 58.0, start.y + jag.y);
}

void main()
{
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
    const float kTanY = 0.5206;
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

    vec3  world = vec3(0.0);
    vec3  vpView = vec3(0.0);
    bool  inView = false;          // layer already given in view space
    vec3  col;
    float glow = 1.0;
    float sizeBase = 155.0, sizeMin = 1.5, sizeCap = 22.0, fadeD = 190.0;

    if (r1 < 0.52)
    {
        // ---- Cloud mass: clumpy billows, kneaded slowly, bottom heavy.
        float knot = floor(r2 * 32.0);
        vec3 Ck = vec3((hash11(knot * 3.1) - 0.5) * 105.0,
                       20.0 + hash11(knot * 5.3) * 20.0,
                       (hash11(knot * 7.7) - 0.5) * 105.0);
        world = Ck + (vec3(r3, fract(r2 * 31.0), r4) - 0.5) * 30.0;
        world.x += sin(world.y * 0.08 + time * 0.10) * 4.0;
        world.z += sin(world.x * 0.06 + time * 0.08) * 4.0;

        // Lit from inside by "its" bolt; otherwise near-black broil.  The
        // 0.016 falloff washed the flash evenly over the whole cloud, which
        // is what made the storm read FLAT -- 0.034 keeps the discharge a
        // bright core inside dark billows.
        float b   = mod(knot, 12.0);
        float lit = boltEnv(b) * (0.55 + 1.8 * audioSnare + 1.2 * audioKick
                                  + 3.0 * audioDrop);
        float d   = length(world.xz - boltPos(b, 0.2).xz);
        col = mix(vec3(0.15, 0.18, 0.27),
                  vec3(0.85, 0.88, 1.0), clamp(lit * exp(-d * 0.034), 0.0, 1.0));
        // Cold rim light on the cloud TOPS: vertical structure the flat
        // uniform broil never had.
        col += vec3(0.09, 0.12, 0.19) * smoothstep(26.0, 44.0, world.y);
        glow = (0.95 + 0.45 * r4 + 0.4 * audioBass * (22.0 / max(world.y, 8.0)))
             * 0.42;   // wide sprites carry far more energy each -- see below
        // Billows have to FUSE, not speckle: several times the old width, and
        // never below the ~2.6 px an additive sprite needs to stay legible.
        sizeBase = 430.0; sizeMin = 2.6; sizeCap = 55.0;
    }
    else if (r1 < 0.77)
    {
        // ---- The bolts: 12 jagged columns with branches. ----
        float b = floor((r1 - 0.52) * 48.0);       // 0..11
        float h = r2;
        world = boltPos(b, h);
        if (r3 > 0.72)                             // side branch
        {
            float bh = fract(r3 * 13.0);
            world = boltPos(b, h * 0.6 + 0.1)
                  + vec3(hash11(b * 23.1 + floor(bh * 8.0)) - 0.5,
                         -bh * 0.4,
                         hash11(b * 29.7 + floor(bh * 8.0)) - 0.5) * 22.0 * bh;
        }
        float env = boltEnv(b) * (0.55 + 1.8 * audioSnare + 1.2 * audioKick
                                  + 3.0 * audioDrop);
        col  = vec3(0.80, 0.85, 1.0);
        glow = env * (0.8 + 0.4 * r4) * 3.0;
    }
    else if (r1 < 0.88)
    {
        // ---- Rain sheets under the cloud. ----
        float fall = fract(r2 * 7.0 + time * (0.5 + 0.3 * r3));
        world = vec3((r3 - 0.5) * 150.0,
                     18.0 - fall * 44.0,
                     (r4 - 0.5) * 150.0);
        col  = vec3(0.35, 0.45, 0.60);
        glow = (0.16 + 0.22 * audioLevel + 0.28 * audioSwell)
             * (0.4 + 0.6 * fract(r2 * 17.0));
        sizeBase = 210.0; sizeMin = 2.2; sizeCap = 24.0;
    }
    else
    {
        // ---- The far storm sky. ----
        // A frustum-placed sheet of overcast behind the whole storm: it keeps
        // the gaps between the billows off pure black, and the same bolt
        // clocks flicker across it as distant SHEET lightning.  Placed
        // straight in view space -- it is atmosphere, it needs no parallax.
        inView = true;
        float hz = 96.0 + 92.0 * r3;
        // 2.0 would fit the frustum exactly; 2.35 so the sheet still reaches
        // past all four edges when the preset camera rig rolls the view.
        vpView = vec3((r2 - 0.5) * 2.35 * kTanY * aspect * hz,
                      (r4 - 0.5) * 2.35 * kTanY * hz,
                      hz);
        float b   = floor(fract(r2 * 6.13 + r4 * 2.71) * 12.0);
        float env = boltEnv(b) * (0.45 + 1.4 * audioSnare + 2.2 * audioDrop);
        col  = mix(vec3(0.10, 0.12, 0.20), vec3(0.60, 0.64, 0.88),
                   clamp(env * 0.45, 0.0, 1.0));
        glow = 0.30 + 0.28 * r4;
        sizeBase = 2200.0; sizeMin = 3.5; sizeCap = 46.0; fadeD = 900.0;
    }

    // Low camera looking up into the storm, drifting slowly.
    float ca  = time * 0.03;
    vec3 camP = vec3(cos(ca) * 40.0, -14.0, sin(ca) * 40.0);
    vec3 fwd  = normalize(vec3(0.0, 14.0, 0.0) - camP);
    vec3 rgt  = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3 up   = cross(rgt, fwd);

    vec3 vp;
    if (inView)
    {
        vp = vpView;
    }
    else
    {
        vec3 rel = world - camP;
        vp = vec3(dot(rel, rgt), dot(rel, up), dot(rel, fwd));
    }

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(sizeBase * (0.4 + 0.8 * r4) * px / dist,
                         sizeMin, max(sizeCap * px, sizeMin));

    col *= glow * clamp(1.0 - vp.z / fadeD, 0.0, 1.0);
    // Cap the TINTED vec3, not the scalar feeding it: the flash colours run
    // past 1.0 per channel on their own.
    vCol = vec4(min(palTint(col, 0.25 * r1, 0.18) * 3.0, vec3(3.2)), 1.0);
}
