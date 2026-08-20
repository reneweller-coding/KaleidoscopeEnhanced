#version 330 core
/**
 * @file Fireworks.vert
 * @brief Vertex stage companion to Fireworks.frag -- see that file's header for
 * this scene's description.
 */
// Fireworks.vert — a night sky of procedural fireworks at real 3D depths,
// with DISTINCT SHELL TYPES: every burst re-rolls its kind each cycle —
//   0 PEONY     classic uniform sphere
//   1 WILLOW    golden long-droop trails (heavy gravity, slow fade)
//   2 RING      a flat saturn ring at a seeded tilt
//   3 STROBE    blinking white-silver crackle
//   4 CROSSETTE the shell splits into ~12 star clusters
// Each cycle starts with a visible ROCKET RISE (a thin streak climbing from
// below, brightness fed by the kick channel), then the shell explodes; the
// explosion pop is scaled by the music's accents (downbeat/kick), and a
// drop turns the whole sky on.
//   attrA.w = particle index: the first 10000 are the night sky itself --
//   frustum-spread across three layers (wide soft haze puffs that carry the
//   sky, a star field, and a band of city glow along the horizon) -- and the
//   remaining 50000 are 50 bursts of 1000.  attrB = per-particle seeds.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioDownbeat;
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

    // The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
    const float kTanY = 0.5206;
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

    // ------------------------------------------------------------------
    // THE NIGHT ITSELF.  A shell is only actually bright for a fraction of its
    // cycle, so at any instant only a handful of the bursts are lit and the
    // rest of the sky was literally nothing (measured occ 0.18).  The first
    // 10000 particles are the sky the fireworks go off IN: a star field spread
    // over the FRUSTUM so it stays even at every depth, and a low band of
    // city glow along the horizon.  Deliberately far dimmer than any shell --
    // this is the floor of the picture, not a subject.
    // ------------------------------------------------------------------
    if (attrA.w < 10000.0)
    {
        float dz = 34.0 + r3 * 108.0;
        // 2.0 would fit the frustum exactly; 2.2 keeps the field past all four
        // edges when the preset camera rig rolls and yaws the view.
        float open = 2.2;

        // THREE LAYERS, picked by r4.  A pure star field did NOT rescue the
        // measurement (still occ 0.18): 10000 sprites of 2.6 px at luma 0.02
        // come to 3% of the frame at 2% brightness, which is nothing a tile
        // measurement can see.  The sky is now carried by a layer of wide,
        // soft, very dim HAZE puffs -- screen-space sized, so they stay big at
        // any depth -- with the stars and the city ember band on top of it.
        bool haze     = (r4 < 0.040);                      // ~400 puffs
        bool cityGlow = (!haze && r4 < 0.36);

        float fy = cityGlow ? (-0.62 - 0.28 * r2)          // along the horizon
                            : (r2 - 0.5) * open;
        vec3  vpS = vec3((r1 - 0.5) * open * dz * kTanY * aspect,
                         fy * dz * kTanY,
                         dz);

        vpS.x -= eyeOff;
        gl_Position = projM * vec4(vpS.x, vpS.y, -vpS.z, 1.0);
        gl_Position.x += eyeOff * 0.04 * gl_Position.w;

        float pxS = resolution.y / 1080.0;
        // A star has to stay a legible speck: below roughly three pixels an
        // additive sprite averages away to nothing again.  A haze puff is the
        // opposite -- a wide soft blob, sized in SCREEN space so the far ones
        // do not shrink away.
        gl_PointSize = haze
            ? clamp((110.0 + 60.0 * r1) * pxS, 8.0, 160.0 * pxS)
            : clamp(70.0 * (0.4 + 0.8 * r4) * pxS / dz, 3.2, 6.5 * pxS);

        // Slow twinkle / ember flicker on jump-free clocks only.
        float tw = 0.62 + 0.38 * sin(time * (0.5 + 1.4 * r4) + r1 * 30.0);
        vec3  sc = haze    ? vec3(0.34, 0.42, 0.72)
                 : cityGlow ? vec3(1.00, 0.62, 0.30)
                            : vec3(0.72, 0.80, 1.00);
        sc = palTint(sc, 0.40 * r2, 0.28);
        // A puff is spread over ~20000 px, a star over ~10, so the puff's
        // per-pixel figure is far lower even though it carries the sky.
        // Haze level up from 0.100. At that figure a puff contributed about
        // 0.006 per pixel and even four overlapping puffs came to ~0.024 luma --
        // under the 1/16 step at which a tile registers as carrying anything, so
        // the layer built to be "the floor of the picture" measured as black.
        // The per-puff spread is widened too: uniform puffs would just raise the
        // modal value, and it is the VARIATION between them that fills tiles.
        float lay = haze ? 0.26 : (cityGlow ? 0.34 : 0.30);
        sc *= lay * (haze ? (0.45 + 1.15 * r2) : tw)
            * (0.8 + 0.35 * audioSwell + 0.5 * audioDrop)
            * clamp(1.0 - dz / 190.0, 0.0, 1.0);
        // Additive pass: cap the FINAL tinted colour, so no amount of puff
        // overlap can push the sky itself toward white.
        vCol = vec4(min(sc, vec3(0.30)), 1.0);
        return;
    }

    // 50 bursts of 1000 instead of 24 of 2500: twice as many shells are in the
    // air at once, which is what actually spreads the light across the sky.
    float burst = floor((attrA.w - 10000.0) / 1000.0);
    float hb1 = hash11(burst * 3.17 + 0.31);
    float hb2 = hash11(burst * 7.91 + 1.73);
    float hb3 = hash11(burst * 5.53 + 2.61);
    float hb4 = hash11(burst * 9.13 + 3.97);

    // Burst position in the sky.  Laid out in FRUSTUM coordinates so the
    // shells stay evenly spread across the picture at every depth -- the old
    // fixed world box put the near bursts off both sides and stacked every one
    // of them into the top third of the frame.
    // View depth, biased toward the camera. A flat 26..100 spread put the median
    // shell 63 units out, where the size formula below yields a 2.4-pixel spark:
    // 50 000 sparks at 2.4 px cover about 2% of the frame, which is why a sky
    // full of shells still measured luma 0.011. Squaring hb3 keeps the same far
    // reach while most shells break near enough to have real sparks.
    float cbz = 16.0 + hb3 * hb3 * 62.0;                // view depth
    // 2.00 / 1.55 (was 1.85 / 1.45): shells now also break just past the left
    // and right edges and reach lower down the frame, so the sky is lit corner
    // to corner instead of in a band across the middle.
    vec3 Cb = vec3((hb1 - 0.5) * 2.00 * cbz * kTanY * aspect,
                   // 10.0 is added back by the camera transform below.
                   10.0 + (hb2 - 0.42) * 1.55 * cbz * kTanY,
                   cbz - 12.0);

    // Cycle clock: music energy (integrated advance) drives the firing rate,
    // so busy passages genuinely fire more shells.
    // Base rate up from 0.075: a shell's whole life took 10-17 seconds, so over
    // any given stretch most of the fifty bursts were sitting in the dim tail of
    // their fade with nothing happening. At 0.16 a shell rises, breaks and dies
    // in about 5-8 seconds, which is both what a firework does and what puts
    // light in the sky. Constant coefficient on `time`, so anti-flicker safe.
    float clockv = (time * 0.16 + audioAdvance * 0.30) * (0.8 + 0.5 * hb4)
                 + hb1 * 7.0;
    float u   = fract(clockv);
    float cyc = floor(clockv);

    // Shell TYPE re-rolls every cycle (type 5 = GLITTER: sparks that fall
    // slowly and twinkle for a long time); every shell also gets its own
    // BURN SPEED, so some flash out quickly while others linger.
    float typ  = floor(hash11(burst * 13.7 + cyc * 3.1) * 5.999);
    float burn = 0.8 + 1.6 * hash11(burst * 21.3 + cyc * 7.7);

    const float RISE = 0.10;              // first 10 % of the cycle = rocket
    vec3  world;
    float B;

    if (u < RISE)
    {
        // ---- Rocket rise: a thin climbing streak from below. ----
        if (r4 > 0.08)                    // only a few particles form the streak
        {
            gl_Position = vec4(0.0, 0.0, -3.0, 1.0);
            vCol = vec4(0.0);
            return;
        }
        float ur = u / RISE;
        // Start the climb just below the frame AT THIS SHELL'S DEPTH.  A fixed
        // world-space -14.0 is below the picture for a near shell but a third
        // of the way UP it for one 100 units back, so the distant rockets used
        // to pop into existence in mid-air.
        float yBase = 10.0 - 1.15 * cbz * kTanY;
        float yy = mix(yBase, Cb.y, ur * ur * (3.0 - 2.0 * ur));
        world = vec3(Cb.x + sin(ur * 9.0 + hb2 * 6.0) * 0.6,
                     yy - r1 * 2.5 * ur,          // short trail behind the head
                     Cb.z);
        B = (0.5 + 0.8 * audioKick) * (0.4 + 0.6 * ur);
    }
    else
    {
        // ---- Explosion flight. ----
        float ub = (u - RISE) / (1.0 - RISE);

        float th = r1 * 6.2831853;
        float ph = acos(2.0 * r2 - 1.0);
        if (typ == 4.0)                    // CROSSETTE: cluster the directions
        {
            th = (floor(r1 * 12.0) + 0.5) / 12.0 * 6.2831853
               + (r3 - 0.5) * 0.35;
            ph = acos(2.0 * (floor(r2 * 6.0) + 0.5) / 6.0 - 1.0)
               + (r4 - 0.5) * 0.35;
        }
        vec3 d = vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th));
        if (typ == 2.0)                    // RING: flatten, then seeded tilt
        {
            d.y *= 0.10;
            d = normalize(d);
            float t1 = hb2 * 3.14159, t2 = hb3 * 3.14159;
            d.xy = mat2(cos(t1), -sin(t1), sin(t1), cos(t1)) * d.xy;
            d.yz = mat2(cos(t2), -sin(t2), sin(t2), cos(t2)) * d.yz;
        }

        float grav = (typ == 1.0) ? 34.0 : ((typ == 5.0) ? 6.0 : 15.0);
        float sp   = (8.0 + 7.0 * r3) * ((typ == 2.0) ? 0.85 : 1.0);
        float re   = sp * (1.0 - exp(-ub * 4.0)) * 1.1;
        world = Cb + d * re + vec3(0.0, -grav * ub * ub, 0.0);
        if (typ == 5.0)                    // GLITTER: sparks drift down slowly
            world.y -= 6.0 * ub;

        // Brightness: the POP is scaled by the music's accents, then fades
        // with the shell's OWN burn speed (willow and glitter linger).
        float fade = (typ == 1.0) ? exp(-ub * 0.9 * burn)
                   : (typ == 5.0) ? exp(-ub * 0.6 * burn)
                                  : exp(-ub * 1.9 * burn);
        float pop  = smoothstep(0.0, 0.04, ub)
                   * (0.55 + 0.75 * audioDownbeat + 0.6 * audioKick);
        B = pop * fade * (0.7 + 0.3 * sin(ub * 40.0 + r4 * 20.0));
        if (typ == 3.0)
            B *= step(0.45, fract(ub * 26.0 + r4 * 9.0)) * 1.6;   // STROBE
        if (typ == 5.0)                    // GLITTER: hard fast twinkle
            B *= 0.35 + 1.5 * step(0.72, fract(sin(r4 * 91.7) * 437.5 + ub * 33.0));
        B *= 1.0 + 1.6 * audioDrop;
    }

    vec3 vp = vec3(world.x, world.y - 10.0, world.z + 12.0);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.04 * gl_Position.w;
    if (vp.z < 0.5)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    // 2.4 px floor, not 1.5: below roughly two and a half pixels an additive
    // sprite averages away to nothing and the far half of the sky reads black.
    gl_PointSize = clamp(210.0 * (0.4 + 0.8 * r4) * px / dist, 3.0, 30.0 * px)
                 * (0.6 + 0.7 * B);

    // Colour by type: peony = key-hued family, willow = gold, ring = cool
    // electric, strobe = white-silver, crossette = two-tone split.
    vec3 col;
    if      (typ == 5.0) col = vec3(1.0, 0.95, 0.75);     // glitter: champagne
    else if (typ == 1.0) col = vec3(1.0, 0.75, 0.30);
    else if (typ == 2.0) col = hueRot(vec3(0.30, 0.75, 1.0), audioChromaHue);
    else if (typ == 3.0) col = vec3(1.0, 0.97, 0.90);
    else if (typ == 4.0) col = hueRot(mix(vec3(1.0, 0.4, 0.2), vec3(0.3, 0.5, 1.0),
                                          step(0.5, fract(r1 * 12.0))), audioChromaHue);
    else                 col = hueRot(vec3(1.0, 0.62, 0.25), hb3 * 5.0 + audioChromaHue);
    float ub2 = max(u - RISE, 0.0) / (1.0 - RISE);
    col = mix(col, vec3(1.0, 0.35, 0.15), smoothstep(0.55, 0.85, ub2) * 0.7);

    col *= B * (0.9 + 0.4 * audioSwell) * clamp(1.0 - vp.z / 150.0, 0.0, 1.0);
    vCol = vec4(palTint(col, 0.30 * r1, 0.20) * 3.0, 1.0);
}
