#version 330 core
/**
 * @file VolcanoIsland.vert
 * @brief Vertex stage companion to VolcanoIsland.frag -- see that file's header for
 * this scene's description.
 */
// VolcanoIsland.vert — an island volcano at night: ballistic lava bombs
// arc from the crater (every kick feeds the fountain, a DROP is the big
// eruption), lava rivers crawl down seeded channels, embers spiral up into
// the smoke, and the whole island stands in a moonlit sea under its stars.
// 60k points: 20 % fountain, 17 % cone rock, 9 % lava rivers, 9 % rising
// embers, 15 % stars, 10 % sky airglow, 20 % sea (glittering water plane +
// horizon mist).
//
// The island only ever filled a band across the middle of the frame: the sky
// was near-empty and everything below the horizon was black.  The sea layer
// carries the bottom of the picture, the horizon mist closes the seam, and
// the stars are no longer thrown away by a 170-unit distance fade they all
// sat behind.
//
// Second pass: every layer was still drawing at the 1.5 px sprite floor (the
// shared sizeBase of 110 is 1.26 px at the island's 70-unit viewing distance),
// so the whole scene measured as a stipple of specks on black -- luma 0.027,
// a quarter of the frame's tiles carrying anything at all.  Sprite sizes are
// now chosen per layer so the solid things (rock, water, sky) overlap into
// surfaces, and the sky has its own bounded airglow layer.

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

    // The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
    const float kTanY = 0.5206;
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

    // Day/night: one full cycle per dayPhase period.  Stars fade in the
    // island's night sky; sunlit haze warms the rock by day.
    float daylight = clamp(sin(dayPhase * 6.2831853), 0.0, 1.0);

    // Camera circles the island at sea level distance.  Built BEFORE the
    // layers so the sea can be laid out relative to the eye.
    float ca  = time * 0.045;
    vec3 camP = vec3(cos(ca) * 70.0, 6.0, sin(ca) * 70.0);
    vec3 fwd  = normalize(vec3(0.0, 8.0, 0.0) - camP);
    vec3 rgt  = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3 up   = cross(rgt, fwd);
    vec3 fwdH = normalize(vec3(fwd.x, 0.0, fwd.z));

    // Cone: apex (crater rim) at y=14, base radius 34 at y=-12.
    vec3  world = vec3(0.0);
    vec3  vpView = vec3(0.0);
    bool  inView = false;          // layer already given in view space
    vec3  col;
    float glow = 1.0;
    // Per-layer sprite sizing and distance fade -- one shared 170-unit fade
    // used to erase the entire star sphere (radius 150, seen from 70 out).
    //
    // sizeBase used to be 110, which at the island's 70-unit viewing distance
    // is 1.26 px: EVERY solid layer collapsed onto its 1.5 px floor and the
    // island, the sea and the fountain all rendered as a faint stipple of
    // specks on black (luma 0.027).  The sprites now overlap into actual
    // surfaces, and each layer picks the size its distance needs.
    float sizeBase = 520.0, sizeMin = 1.5, sizeCap = 30.0, fadeD = 170.0;

    if (r1 < 0.20)
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
        sizeBase = 360.0; sizeCap = 20.0;      // hot: kept smaller, it clips
    }
    else if (r1 < 0.37)
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
        // Dark rock seen from 70 units out: it needs the biggest sprites of
        // all, or the island is a stipple of specks instead of a silhouette.
        sizeBase = 760.0; sizeCap = 34.0;
    }
    else if (r1 < 0.46)
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
        sizeBase = 380.0; sizeCap = 20.0;      // hot: kept smaller, it clips
    }
    else if (r1 < 0.55)
    {
        // ---- Embers spiralling up into the night. ----
        float u   = fract(r2 * 5.0 + time * (0.05 + 0.05 * r3));
        float ang = r4 * 6.2831853 + u * 5.0;
        float rad = 3.0 + u * 16.0;
        world = vec3(cos(ang) * rad, 15.0 + u * 42.0, sin(ang) * rad);
        col  = vec3(1.0, 0.45, 0.12);
        glow = (1.0 - u) * (0.35 + 0.5 * audioSwell + 0.8 * audioDrop)
             * (0.4 + 0.6 * r3);
        sizeBase = 380.0; sizeCap = 18.0;
    }
    else if (r1 < 0.70)
    {
        // ---- Stars. ----
        // They sit 80..220 units out, so the island's 170-unit haze fade used
        // to swallow the whole sky; stars carry their own (far) fade, and a
        // 2.4 px floor -- below that an additive speck averages away to
        // nothing and the sky reads black again.
        float th = r2 * 6.2831853;
        float ph = acos(2.0 * r3 - 1.0);
        world = vec3(sin(ph) * cos(th), abs(cos(ph)) * 0.9 + 0.06,
                     sin(ph) * sin(th)) * 150.0;
        col  = vec3(0.75, 0.8, 0.95);
        glow = (0.45 + 0.75 * r4) * (1.0 - 0.9 * daylight);   // fade by day
        sizeBase = 150.0; sizeMin = 3.0; sizeCap = 7.0; fadeD = 900.0;
    }
    else if (r1 < 0.80)
    {
        // ---- Sky: airglow and high haze. ----------------------------------
        // Stars alone are single pixels; a tile of sky full of them still
        // averages to black.  This is the bounded atmosphere the empty half of
        // the picture needs: big, very dim sprites laid straight into view
        // space over the whole sky, brightest in a soft diagonal band (the
        // Milky Way at night, sun haze by day).
        inView = true;
        float hz = 130.0 + 170.0 * r3;
        float ndcY = mix(-0.03, 1.22, r2);
        // NOT r4: r4 also sets the sprite size below, and reusing it would
        // make the sky grow steadily coarser from left to right.
        float ndcX = (hash11(r4 * 91.7 + r2 * 13.3 + 3.1) - 0.5) * 2.55
                   + 0.07 * sin(time * 0.02 + r2 * 31.0);
        vpView = vec3(ndcX * kTanY * aspect * hz, ndcY * kTanY * hz, hz);

        // NOT pow(x, 2.0): pow() is exp2(y*log2(x)) and this base goes
        // negative, which is undefined in GLSL.
        float bq   = ndcY - 0.52 + 0.34 * ndcX;
        float band = exp(-bq * bq * 2.6);
        float mott = 0.65 + 0.35 * sin(ndcX * 7.3 + ndcY * 5.1 + r3 * 6.2831853);
        vec3  night = palTint(vec3(0.13, 0.15, 0.28), 0.48, 0.30);
        vec3  dayly = palTint(vec3(0.30, 0.40, 0.55), 0.52, 0.25);
        col  = mix(night, dayly, daylight);
        // Bright enough that a sprite core clears the "this tile carries
        // content" step, dim enough that the sky as a whole stays night.
        glow = (0.16 + 0.42 * band) * mott * (0.85 + 0.30 * audioSwell);
        sizeBase = 4200.0; sizeMin = 4.0; sizeCap = 46.0; fadeD = 900.0;
    }
    else
    {
        // ---- The sea: everything below the horizon. ----
        float sq = (r1 - 0.80) / 0.20;
        if (sq < 0.28)
        {
            // Horizon mist: a thin frustum-placed band that closes the seam
            // between the farthest water and the sky.  Placed straight in
            // view space -- it is atmosphere, it needs no parallax.
            inView = true;
            float hz = 150.0 + 48.0 * r3;
            float ty = mix(-0.17, 0.055, r2);
            float tx = (hash11(r4 * 57.3 + 1.9) - 0.5) * 2.35 * kTanY * aspect;
            vpView = vec3(tx * hz, ty * hz, hz);
            col  = palTint(vec3(0.30, 0.38, 0.52), 0.55, 0.30);
            glow = (0.14 + 0.18 * r2) * (0.8 + 0.4 * audioSwell);
            sizeBase = 900.0; sizeMin = 4.0; sizeCap = 30.0; fadeD = 900.0;
        }
        else
        {
            // Water plane: rows laid out so they land at EVEN screen heights
            // from the bottom edge up to the horizon (the drop from the eye
            // divided by the screen tangent gives the distance), which is
            // what keeps the near water from being a handful of huge sprites
            // and the far water from bunching into one line.
            float sw   = (sq - 0.28) / 0.72;
            float seaY = -13.0;
            float H    = camP.y - seaY;
            float rowU = mix(0.182, 1.16, pow(sw, 0.9));   // 0.182 => 200 units, inside the far plane
            float dist = H / (rowU * kTanY);
            float sx   = (r2 - 0.5) * 2.35 * kTanY * aspect * dist;
            world = vec3(camP.x, seaY, camP.z) + rgt * sx + fwdH * dist;

            // Swell: long crossing waves, plus a glint that only fires on the
            // crests, so the water sparkles instead of glowing flatly.
            float wv = sin(world.x * 0.11 + time * 0.55 + audioAdvance * 0.10)
                     * cos(world.z * 0.09 - time * 0.41);
            float crest = smoothstep(0.55, 0.98, wv * 0.5 + 0.5);
            float glint = crest * step(0.72, fract(r4 * 17.0 + wv * 0.3));

            // The volcano's reflection lane runs straight down the picture
            // from the island; it flares with the eruption.
            float lane = exp(-abs(sx / max(dist, 1.0)) * 5.5);
            vec3  water = palTint(vec3(0.11, 0.17, 0.28), 0.62, 0.25);
            vec3  fire  = vec3(1.0, 0.42, 0.10);
            col = mix(water, fire, min(lane * (0.45 + 0.35 * audioBass
                                              + 0.5 * audioDrop), 0.85));
            col += vec3(0.55, 0.62, 0.75) * glint * 0.6;
            // Grazing rows (far water) catch more sky, near water is darker.
            // Shoreline: the sprites are additive and depth-less, so water
            // laid out behind the island would shine straight through the
            // cone.  Cutting it at the island's footprint both fixes that and
            // draws the shore.
            float ashore = smoothstep(30.0, 42.0, length(world.xz));
            glow = (0.42 + 0.60 * (1.0 - rowU / 1.16)) * (0.75 + 0.45 * audioSwell)
                 * (0.65 + 0.7 * r3) * (1.0 - 0.35 * daylight) * ashore;
            // Big enough to overlap into a continuous water surface: at 190 the
            // near rows were 3 px and the whole bottom of the frame was black.
            sizeBase = 900.0; sizeMin = 3.4; sizeCap = 44.0; fadeD = 900.0;
        }
    }

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
    // 3.0 rather than 3.4: the hot layers now draw with sprites several times
    // larger, so the same per-sprite peak would clip several times the area.
    vCol = vec4(min(col * 2.8, vec3(3.0)), 1.0);
}
