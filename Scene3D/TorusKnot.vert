#version 330 core
/**
 * @file TorusKnot.vert
 * @brief Vertex stage companion to TorusKnot.frag -- see that file's header for
 * this scene's description.
 *
 * Audio Reactivity:
 *   audioAdvance   -> flow of the particles along both closed curves and the
 *                     slow circling drift of the ember haze
 *                     (pre-integrated, never a factor on absolute time)
 *   audioBass      -> tube breath
 *   audioSwell     -> overall glow of the knots and of the haze
 *   audioChromaHue -> hue sweep along the knot (musical key)
 *   audioMidRel    -> TUBE PUNCH: the mid register's instant / slow-average
 *                     ratio (MilkDrop's mid_att idiom, ~1.0 = "as loud as
 *                     usual right now") swells and thins the tube on every
 *                     hit.  Self-normalising, so the knot punches just as
 *                     hard on a quiet acoustic track as on a loud master
 *   audioSpread    -> DISPERSION off the curve: a narrow spectrum keeps the
 *                     particles hugging one clean line, rich wide harmonics
 *                     let them drift out into a haze around it -- and opens
 *                     the surrounding ember field wider at the same time.
 *                     The ember extent only ever grows from an already
 *                     frame-filling base, so a thin mix cannot bunch the
 *                     additive sprites up and brighten the picture
 *   audioMode      -> colour temperature: minor cools both knots and the
 *                     embers to blue, major restores their warm ember orange
 *
 * NOTE: neither the knots' (p,q) families nor the `s * 0.8` hue sweep may be
 * audio-driven -- both multiply `s`, which carries absolute `time`, and any
 * change would remap the whole accumulated phase in one frame.
 */
// TorusKnot.vert — a glowing (p,q) torus knot of streaming particles, wrapped
// by a second, much wider knot of the same family tumbling the other way, the
// pair floating in a field of embers.  A single knot sat as one small ring in
// the middle of a black frame; the outer knot spans the picture, the embers
// carry the corners, and the whole thing turns slowly on two axes while the
// bass breathes the tube.  Harmonic and endless — the curves close on
// themselves.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform float sceneSeed;
uniform vec2  resolution;

uniform float audioAdvance;
uniform float audioBass;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioMidRel;
uniform float audioSpread;
uniform float audioMode;

out vec4 vCol;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float hsh(float a, float b, float s)
{
    return fract(sin(a * 91.73 + b * 47.31 + s) * 43758.5453);
}

void main()
{
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    float mmaj = clamp(audioMode, 0.0, 1.0);
    float spr  = clamp(audioSpread, 0.0, 1.0);

    // The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
    // Placing the embers in FRUSTUM coordinates rather than in a fixed world
    // box is what keeps the field even across the picture at every depth.
    const float kTanY = 0.5206;
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

    // MODE sets the base temperature the hue sweep runs from: minor cools
    // everything to blue, major restores the warm ember orange.  The two
    // endpoints are luminance-matched.
    vec3 baseCol = mix(vec3(0.30, 0.50, 0.95), vec3(0.95, 0.45, 0.25), mmaj);

    vec3  vp;
    vec3  col;
    float sizeBase, sizeCap, sizeMin;

    if (r1 < 0.16)
    {
        // ---- EMBER HAZE ----------------------------------------------
        // Sparks shed by the knots, spread evenly over the frustum from just
        // in front of the camera out to the far dark.  A background layer:
        // clearly dimmer than the curves, but bright enough that no tile of
        // the picture is ever empty.
        float hx = hsh(r2, r3, 0.41);
        float hy = hsh(r3, r4, 1.83);
        float hz = hsh(r4, r2, 3.07);

        float dz = 14.0 + hz * 76.0;
        float ph = r2 * 6.2831853 + time * 0.08 + audioAdvance * 0.06;

        // 2.0 would fit the frustum exactly; the base is 2.25 so the field
        // still reaches past all four edges when the preset camera rig rolls
        // and yaws the view (every Scene3D preset carries one), and spectral
        // spread only ever opens it further.
        float open = 2.25 + 0.35 * spr;
        vp = vec3((hx - 0.5) * open * dz * kTanY * aspect + 2.4 * cos(ph),
                  (hy - 0.5) * open * dz * kTanY          + 2.4 * sin(ph * 0.79),
                  dz);

        col = hueRot(baseCol, audioChromaHue * 0.5);
        col *= (0.28 + 0.40 * r3) * (0.75 + 0.5 * audioSwell)
             * clamp(1.0 - dz / 145.0, 0.0, 1.0);
        // An ember has to stay a legible speck at any distance -- below
        // roughly two and a half pixels an additive sprite averages away to
        // nothing and the far half of the field reads as black again.
        sizeBase = 84.0;
        sizeCap  = 9.0;
        sizeMin  = 2.6;

        vCol = vec4(col * 4.4, 1.0);
    }
    else
    {
        // ---- THE TWO KNOTS -------------------------------------------
        // r1 doubles as the layer selector and, rescaled inside its band, as
        // the position along that layer's closed curve -- so both curves stay
        // evenly populated end to end.
        bool  outer = (r1 < 0.46);
        float u = outer ? (r1 - 0.16) / 0.30 : (r1 - 0.46) / 0.54;

        // Position along the closed curve; particles FLOW along it.  The outer
        // knot streams a little slower, so the two never lock together.
        float s = u * 6.2831853 + time * (outer ? 0.068 : 0.10)
                + audioAdvance * (outer ? 0.15 : 0.22);

        // Knot family rolled per activation: (2,3), (3,4), (2,5) or (3,5).
        float kv = floor(sceneSeed * 3.999);
        float p = (kv < 0.5 || kv > 1.5 && kv < 2.5) ? 2.0 : 3.0;
        float q = (kv < 0.5) ? 3.0 : (kv < 1.5) ? 4.0 : 5.0;
        // The outer knot takes the neighbouring family, so the two read as a
        // pair rather than as one curve drawn twice.
        if (outer) { p += 1.0; q = (q > 4.5) ? 3.0 : q + 1.0; }

        float R  = outer ? 24.0 : 13.5;
        float rr = outer ?  8.0 :  5.2;
        vec3 C = vec3((R + rr * cos(q * s)) * cos(p * s),
                      (R + rr * cos(q * s)) * sin(p * s),
                      rr * sin(q * s));

        // Tube thickness around the curve (cheap frame from neighbours).  On
        // top of the bass breath, the MID register's instant/slow ratio
        // punches it: ~1.0 means "as loud as usual right now", so this
        // self-normalises to any mix.  Bounded well away from collapsing the
        // tube to zero.
        float mp   = clamp(audioMidRel - 1.0, -0.8, 1.2);
        float tube = (0.5 + 1.1 * r2) * (1.0 + 0.35 * audioBass + 0.30 * mp)
                   * (outer ? 1.9 : 1.0);

        float a2 = r3 * 6.2831853;
        vec3 off = vec3(cos(a2 + s), sin(a2 + s * 0.7), cos(a2 * 1.3 - s)) * tube;

        // SPECTRAL SPREAD sets how far the particles drift off the curve: a
        // narrow spectrum keeps one clean drawn line, rich harmonics blur it
        // into a haze.  (Neutral spread 0.5 reproduces the original factor.)
        vec3 world = C + off * (0.38 + 0.30 * spr);

        // Slow two-axis tumble; the outer knot turns the other way, so the
        // pair is never simultaneously edge-on to the camera.
        float ra = time * (outer ? -0.045 : 0.07);
        float rb = time * (outer ?  0.031 : 0.043);
        world.xz = mat2(cos(ra), -sin(ra), sin(ra), cos(ra)) * world.xz;
        world.yz = mat2(cos(rb), -sin(rb), sin(rb), cos(rb)) * world.yz;

        vp = world + vec3(0.0, 0.0, outer ? 52.0 : 31.0);

        // Hue runs along the knot; the flow makes it stream forever.
        col = hueRot(baseCol, audioChromaHue + s * 0.8);
        col *= (0.45 + 0.55 * r3) * (0.75 + 0.5 * audioSwell)
             * (outer ? 0.55 : 1.0)
             * clamp(1.0 - vp.z / 135.0, 0.0, 1.0);

        sizeBase = outer ? 140.0 : 95.0;
        sizeCap  = outer ?  12.0 : 14.0;
        sizeMin  = 1.5;

        vCol = vec4(col * 4.4, 1.0);
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
}
