#version 330 core
/**
 * @file RainOnWater.vert
 * @brief Vertex stage companion to RainOnWater.frag -- see that file's header for
 * this scene's description.
 *
 * Audio Reactivity:
 *   audioLevel     -> depth of the raindrop rings
 *   audioSwell     -> the far standing swell that keeps the water alive
 *   audioZCR       -> GRAIN of the surface: a pure tone or drone leaves the
 *                     pond glassy, broadband/noisy material roughens it into
 *                     a fine wind chop that catches the moon lane
 *   audioHat       -> hi-hats and cymbals ARE the drizzle -- each hat onset
 *                     makes the drops land harder and the rings bite deeper
 *                     (and drives the falling drizzle itself, see .frag)
 *   audioMode      -> moon colour temperature (see .frag)
 *   audioChromaHue -> key tint of the water and ring crests (see .frag)
 */
// RainOnWater.vert — a still pond at night under a low moon; raindrops land
// on their own unhurried clocks and send damped rings gliding outward.  The
// music sets the rain's density and the moon's warmth — the pond stays a pond.
//
// The mesh is ONE continuous sheet: attrA.y runs from the near water, out to
// the horizon, and then bends up into a sky curtain behind it.  Two things
// used to leave three quarters of the picture dead:  the surface was a fixed
// 160-unit-wide slab, so the far water never reached the left and right edges
// of the frame, and above the horizon there was simply nothing at all.  Now
// every row is laid out in FRUSTUM coordinates -- its width grows with its
// depth -- so the water spans the picture edge to edge at every distance, and
// the curtain carries the sky, the moon and the drizzle above the horizon.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioLevel;
uniform float audioSwell;
uniform float audioZCR;
uniform float audioHat;

out vec3  vWorld;
out float vSlope;
out float vDist;
out float vSky;

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

void main()
{
    float u = attrA.x, w = attrA.y;

    // The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
    const float kTanY = 0.5206;
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;
    float halfA  = kTanY * aspect;          // tan of the horizontal half-FOV

    // Row 87 of 120 is the shoreline between water and sky curtain.  The two
    // halves MEET there -- same depth, same height -- so the row of cells that
    // straddles the split is an ordinary quad and not a stretched seam.
    const float T = 0.725;

    float eye = 7.0;                        // the camera floats this high
    float z, y;
    float slope = 0.0;
    float sky   = 0.0;

    if (w < T)
    {
        // ---- THE WATER ----------------------------------------------
        // Depth grows with the SQUARE of the row index: a linear sheet spends
        // most of its rows in the last few pixels under the horizon and leaves
        // the near water a coarse ladder, while a fully perspective-even (1/z)
        // one spreads the far rows so far apart that the ripples between them
        // alias.  The square is the compromise that keeps both ends usable.
        float wa = w / T;
        z = 11.0 + wa * wa * 139.0;

        // 2.0 would fit the frame exactly; 2.25 keeps water under all four
        // corners while the preset camera rig rolls and yaws the view.
        float x = (u - 0.5) * 2.25 * z * halfA;

        // Eighteen raindrop sites on staggered cycles; each ring expands and
        // dies away smoothly.  The sites are scattered across the FRUSTUM --
        // each one's sideways spread grows with its own depth -- so drops land
        // all over the picture instead of in one central patch of world that
        // covers a quarter of the screen.  The rings themselves keep their
        // honest world size, so a far one simply reads as a smaller ring.
        float h = 0.0;
        for (int i = 0; i < 18; ++i)
        {
            float fi    = float(i);
            float cycle = 3.6 + hash11(fi * 3.3) * 4.6;
            float ph    = hash11(fi * 7.7);
            float t01   = fract(time / cycle + ph);
            float ep    = floor(time / cycle + ph);       // which drop

            float cz = 10.0 + hash11(fi * 9.1 + ep) * 90.0;
            float cx = (hash11(fi * 1.7 + ep) - 0.5) * 1.90 * cz * halfA;

            float d     = length(vec2(x, z) - vec2(cx, cz));
            float ringR = t01 * 42.0;
            float wave  = sin((d - ringR) * 0.9)
                        * exp(-abs(d - ringR) * 0.28)
                        * (1.0 - t01) * 0.8;
            h     += wave;
            slope += wave * 0.9;
        }
        // Hi-hats and cymbals ARE the drizzle: every hat onset makes the drops
        // land harder, so the rings bite deeper into the surface.
        h *= 0.8 + 0.5 * audioLevel + 0.40 * clamp(audioHat, 0.0, 1.0);

        // Angular coordinate across the frame: the swell and the chop are
        // written against it so their wavelength stays roughly constant ON
        // SCREEN.  In plain world units the far half of the sheet would fold
        // dozens of wave crests into a single row of cells and just alias.
        float ax = x / z;

        // A faint standing swell keeps the far water alive.
        h += sin(ax * 9.0 + time * 0.5) * sin(z * 0.06 + time * 0.4) * 0.25
           * (1.0 + audioSwell);

        // WIND CHOP: broadband, noisy material (high zero-crossing rate) frets
        // the whole surface into a fine grain; a held tone or drone leaves it
        // glassy.  Only the AMPLITUDE is audio-driven -- the wavelength and the
        // time coefficient are constants, so the accumulated phase never jumps.
        float zr   = clamp(audioZCR, 0.0, 1.0);
        float chop = sin(ax * 26.0 + z * 0.08 + time * 0.9)
                   * sin(ax * 17.0 - z * 0.13 - time * 0.7);
        h     += chop * 0.45 * zr;
        slope += chop * 0.26 * zr;

        // Calm the last few rows so the surface meets the sky curtain exactly.
        float join = 1.0 - smoothstep(0.92, 1.0, wa);
        h     *= join;
        slope *= join;

        y = -eye + h;
        vWorld = vec3(x, y, z);
    }
    else
    {
        // ---- THE SKY CURTAIN ----------------------------------------
        // Rises out of the water's far edge and leans back, covering
        // everything above the horizon.  At sk = 0 it sits exactly where the
        // last row of water sits, so the sheet is continuous.
        float sk = (w - T) / (1.0 - T);
        z = mix(150.0, 195.0, sk);
        y = -eye + sk * 130.0;          // top edge lands ~20% above the frame

        float x = (u - 0.5) * 2.25 * z * halfA;
        sky    = 1.0;
        vWorld = vec3(x, y, z);
    }

    vec3 vp = vec3(vWorld.x, y, z);
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    vSlope = slope;
    vDist  = z;
    vSky   = sky;
}
