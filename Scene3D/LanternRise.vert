#version 330 core
/**
 * @file LanternRise.vert
 * @brief Vertex stage companion to LanternRise.frag -- see that file's header for
 * this scene's description.
 *
 * Audio Reactivity:
 *   audioSwell     -> the sky brightens and dims with the music's breath
 *   audioLevel     -> glow
 *   audioKick      -> soft flicker in the flame cores
 *   audioChromaHue -> hue drift of the paper glow with the musical key
 *   audioZCR       -> flame gutter: broadband hiss makes every flame sputter
 *                     and guttering, a pure held tone lets them burn steady
 *   audioLowMid    -> harmonic warmth feeds the fire -- low-mid body swells
 *                     the burning core inside the paper shell
 *   audioSpread    -> how far the lanterns disperse across the sky (narrow
 *                     spectrum = a tight column, rich spectrum = a wide drift)
 */
// LanternRise.vert — hundreds of sky lanterns drifting up into the night
// (600 lanterns x 100 points as soft glowing shells + flame).  Deeply calm:
// the swell brightens the sky, kicks are only a soft flicker.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioSwell;
uniform float audioKick;
uniform float audioChromaHue;
uniform float audioLevel;
uniform float audioZCR;      // signal noisiness -> flame gutter depth
uniform float audioLowMid;   // 150-500 Hz warmth -> size of the burning core
uniform float audioSpread;   // narrow .. wide spectrum -> lantern dispersion

out vec4 vCol;

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

    float lant = floor(attrA.w / 100.0);
    float h1 = hash11(lant * 3.9 + 0.41);
    float h2 = hash11(lant * 6.3 + 1.09);
    float h3 = hash11(lant * 9.1 + 2.77);

    // Each lantern rises forever (looped), swaying on its own breeze.
    // Spectral spread fans the release out: a narrow, pure spectrum keeps the
    // lanterns in one tight rising column, a rich broadband one lets them
    // drift wide across the whole night sky.  (The rise RATE never moves.)
    float disp = 0.78 + 0.42 * clamp(audioSpread, 0.0, 1.0);
    float H = 70.0;
    float y = mod(h2 * H + time * (1.1 + 0.8 * h3), H) - 18.0;
    vec3 Cl = vec3((h1 - 0.5) * 110.0 * disp + 3.5 * sin(time * 0.16 + h3 * 6.0),
                   y,
                   16.0 + h3 * 80.0 * disp + 2.0 * sin(time * 0.11 + h1 * 6.0));

    // Lantern body: a small vertically stretched shell + flame core below.
    vec3  world;
    float glow;
    if (r1 < 0.85)
    {
        float th = r2 * 6.2831853;
        float ph = acos(2.0 * r3 - 1.0);
        vec3 n = vec3(sin(ph) * cos(th), cos(ph) * 1.35, sin(ph) * sin(th));
        world = Cl + n * (0.9 + 0.25 * h2);
        glow  = 0.95 + 0.40 * cos(ph);            // brighter near the flame
    }
    else
    {
        // Flame: tight flickering core at the mouth.  Harmonic warmth in the
        // low mids is the fuel — the burning core licks bigger as the music
        // fills out, and shrinks to a pilot light when it thins.
        float flameBody = 1.0 + 0.45 * clamp(audioLowMid, 0.0, 1.0);
        world = Cl + vec3((r2 - 0.5) * 0.35 * flameBody,
                          -0.9 + 0.2 * sin(time * 9.0 + r3 * 40.0) * flameBody,
                          (r4 - 0.5) * 0.35 * flameBody);

        // Broadband hiss makes the flames gutter and sputter; a pure held tone
        // lets them burn steady.  Only the flicker DEPTH moves (the rate stays
        // fixed), and the base is trimmed so the mean brightness holds.
        float gutter = 0.5 + 0.55 * clamp(audioZCR, 0.0, 1.0);
        glow = (1.85 - 0.5 * gutter) + gutter * sin(time * 11.0 + r2 * 30.0)
             + 0.6 * audioKick;
    }

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(130.0 * (0.4 + 0.8 * r4) * px / dist, 1.5, 16.0 * px);

    // Warm paper glow, a few teal strays; height fades toward the stars.
    vec3 col = (h1 > 0.92) ? vec3(0.35, 0.8, 0.75) : vec3(1.0, 0.62, 0.22);
    col = hueRot(col, audioChromaHue * 0.25 + (h2 - 0.5) * 0.3);
    col *= glow * (0.55 + 0.45 * audioSwell + 0.25 * audioLevel)
         * clamp(1.0 - vp.z / 110.0, 0.0, 1.0)
         * (1.0 - smoothstep(30.0, 52.0, world.y));
    vCol = vec4(col * 3.6, 1.0);
}
