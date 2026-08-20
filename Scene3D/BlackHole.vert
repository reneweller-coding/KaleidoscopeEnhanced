#version 330 core
/**
 * @file BlackHole.vert
 * @brief Vertex stage companion to BlackHole.frag -- see that file's header for
 * this scene's description.
 *
 * Audio Reactivity:
 *   audioAdvance   -> orbital flow of the disk and of the infalling streams,
 *                     plus the slow churn of the lensed sky
 *                     (pre-integrated, never a factor on absolute time)
 *   audioBass      -> disk scale height (the disk breathes)
 *   audioSwell     -> overall glow of every layer, sky included
 *   audioChromaHue -> hue sweep of the emitting matter (musical key)
 *   audioDrop      -> fires the relativistic polar jets
 */
// BlackHole.vert — an accretion disk around an invisible black hole:
// white-hot inner rim, red-cool outer edge, Doppler-bright approaching
// side, a thin photon ring, and infalling streams.  A DROP fires the
// relativistic polar jets.
//
// The disk alone was one thin ellipse stranded in a black frame.  It now
// spans out to five times the ISCO radius, the infall reaches in from past
// the picture edges, and the whole thing hangs in the sky it lenses: a
// frustum-spread star field deflected radially out of the shadow, so the
// corners carry starlight and the hole itself stays a hard black disc.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioAdvance;
uniform float audioBass;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioDrop;

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

    // The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
    const float kTanY = 0.5206;
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

    // Camera orbits slowly, a little above the disk plane.  Pulled back far
    // enough that the whole widened disk fits, tipped up far enough that it
    // reads as an open ellipse rather than a bright horizontal line.
    float ca  = time * 0.05;
    vec3 cam  = vec3(cos(ca) * 62.0, 19.0, sin(ca) * 62.0);
    vec3 fwd  = normalize(-cam);
    vec3 rgt  = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3 up   = cross(rgt, fwd);

    vec3  vp;
    vec3  col;
    float sizeBase = 90.0, sizeCap = 18.0, sizeMin = 1.5;

    if (r1 < 0.22)
    {
        // ---- The lensed sky ------------------------------------------
        // Background stars and cold dust, placed in FRUSTUM coordinates so
        // the field stays even from the near haze out to the far dark, then
        // deflected radially outward: nothing survives inside the shadow,
        // and the light that grazes it piles up into a bright rim just
        // outside.  This is the layer that carries the corners of the frame.
        float hx = hsh(r2, r3, 0.41);
        float hy = hsh(r3, r4, 1.83);
        float hz = hsh(r4, r2, 3.07);

        float dz = 16.0 + hz * 128.0;

        // Normalised screen position, aspect-corrected so the shadow stays
        // round.  2.0 would fit the frustum exactly; 2.3 keeps the field
        // past all four edges while the preset camera rig rolls the view.
        const float open = 2.3;
        vec2 sxy = vec2((hx - 0.5) * 2.0 * aspect, (hy - 0.5) * 2.0);

        // Slow churn so the sky is never a frozen photograph.
        float ph = r2 * 6.2831853 + time * 0.03 + audioAdvance * 0.04;
        sxy += vec2(cos(ph), sin(ph * 0.83)) * 0.035;

        // Gravitational deflection: r -> sqrt(r^2 + b^2) empties a disc of
        // radius b and compresses everything just beyond it.
        float rs = max(length(sxy), 1e-4);
        sxy *= sqrt(rs * rs + 0.09) / rs;

        vp = vec3(sxy.x * 0.5 * open * dz * kTanY,
                  sxy.y * 0.5 * open * dz * kTanY,
                  dz);

        // Cool starlight with the occasional warm giant; the dust behind
        // the hole glows faintly redder.
        float warm = pow(hsh(r2, r4, 7.11), 4.0);
        col = mix(vec3(0.52, 0.62, 1.00), vec3(1.00, 0.78, 0.52), warm);
        // (the common tail below applies the audioSwell glow to every layer)
        col *= (0.10 + 0.20 * r3) * clamp(1.0 - dz / 168.0, 0.0, 1.0);

        // A star has to stay a legible speck at any depth -- below about two
        // and a half pixels an additive sprite averages away to nothing and
        // the far half of the sky reads black again.
        sizeBase = 70.0;
        sizeCap  = 7.0;
        sizeMin  = 2.4;
    }
    else
    {
        vec3 world;

        if (r1 < 0.76)
        {
            // ---- Accretion disk (Kepler: inner orbits scream). ----
            // Reaches from the ISCO out to roughly six times its radius, so
            // the disk spans the picture instead of sitting in the middle of
            // it.  The radial exponent is gentle enough that the outer decades
            // stay populated rather than draining into the inner rim.
            float rad = 7.0 + 37.0 * pow(r2, 1.15);
            float om  = 30.0 * pow(rad, -1.5);
            float ang = r3 * 6.2831853 + (time + audioAdvance * 1.5) * om;
            float th  = (r4 - 0.5) * (0.35 + 0.05 * rad) * (1.0 + 1.2 * audioBass);
            world = vec3(cos(ang) * rad, th, sin(ang) * rad);

            // Temperature falls outward; the approaching side is boosted.
            vec3 hot  = vec3(1.0, 0.97, 0.90);
            vec3 cool = vec3(0.85, 0.30, 0.10);
            col = mix(hot, cool, smoothstep(7.0, 40.0, rad));
            float doppler = 0.65 + 0.55 * sin(ang);
            // Gentler radial roll-off than before: the old one had faded the
            // disk to nothing well inside the new outer edge.
            col *= doppler * (1.32 - 0.016 * rad);

            sizeBase = 95.0;
            sizeCap  = 18.0;
            sizeMin  = 2.0;
        }
        else if (r1 < 0.81)
        {
            // ---- Photon ring: razor-thin, brilliant. ----
            float ang = r2 * 6.2831853 + time * 0.4;
            float rad = 6.4 + r3 * 0.28;
            world = vec3(cos(ang) * rad, (r4 - 0.5) * 0.3, sin(ang) * rad);
            col = vec3(1.0, 0.95, 0.8) * 1.8;
            sizeCap = 14.0;
        }
        else if (r1 < 0.91)
        {
            // ---- Infalling tidal streams spiralling in. ----
            // They now start well outside the frame, so matter is always
            // sweeping in across the corners.
            float s   = fract(r2 + (time + audioAdvance) * 0.05);
            // Starting radius held at the camera's own orbit: further out and
            // most of the stream would spawn BEHIND the eye and be culled.
            float rad = mix(62.0, 6.6, pow(s, 0.7));
            float ang = r3 * 6.2831853 + s * 9.0;
            world = vec3(cos(ang) * rad, (r4 - 0.5) * 5.0 * (1.0 - s), sin(ang) * rad);
            col = vec3(0.55, 0.35, 0.75) * (0.32 + 0.85 * s);
            sizeBase = 110.0;
            sizeCap  = 12.0;
            sizeMin  = 2.2;
        }
        else
        {
            // ---- Polar jets: erupt on the drop, glow faintly otherwise. ----
            // Long enough to run off the top and bottom of the picture.
            float t   = r2 * 62.0;
            float sgn = (r3 < 0.5) ? 1.0 : -1.0;
            float spread = 0.6 + t * 0.09;
            world = vec3(cos(r4 * 6.2831853) * spread, sgn * (1.5 + t),
                         sin(r4 * 6.2831853) * spread);
            col = vec3(0.55, 0.75, 1.0)
                * (0.30 + 2.2 * audioDrop) * exp(-t * 0.045);
            sizeBase = 100.0;
            sizeCap  = 10.0;
            sizeMin  = 2.0;
        }

        vec3 rel = world - cam;
        vp = vec3(dot(rel, rgt), dot(rel, up), dot(rel, fwd));

        col *= clamp(1.0 - vp.z / 190.0, 0.0, 1.0);
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

    col = hueRot(col, audioChromaHue * 0.35);
    col *= (0.8 + 0.45 * audioSwell);
    // Cap the tinted vec3, not just a scalar: the disk's hot core and the
    // drop-lit jets both carry per-channel gains above 1.0.
    vCol = vec4(min(col * 2.4, vec3(3.2)), 1.0);
}
