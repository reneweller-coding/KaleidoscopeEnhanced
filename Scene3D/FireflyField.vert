#version 330 core
/**
 * @file FireflyField.vert
 * @brief Vertex stage companion to FireflyField.frag -- see that file's header for
 * this scene's description.
 *
 * Audio Reactivity:
 *   audioBeatPhase -> the synchrony wave sweeping across the meadow
 *   audioSwell     -> overall glow of the field
 *   audioLevel     -> glow
 *   audioChromaHue -> gentle hue drift with the musical key
 *   audioArousal   -> how strongly the swarm LOCKS together: calm music lets
 *                     every firefly keep its own rhythm, intense music pulls
 *                     the whole meadow into one synchronous wave
 *   audioSpread    -> DEPTH dispersion of the swarm: a narrow, pure spectrum
 *                     draws the fireflies into a close shallow cloud, a rich
 *                     broadband one lets the meadow run far back into the
 *                     night -- and opens the field a little wider than the
 *                     frame at the same time.  The extent only ever GROWS
 *                     from an already frame-filling base, so a thin mix can
 *                     never bunch the additive sprites up in the middle
 *   audioMode      -> minor keys cool the glow to blue-green, major keys warm
 *                     it back to green-gold
 */
// FireflyField.vert — a summer night meadow: thousands of fireflies drift
// on lazy paths and blink softly; a slow wave of synchrony sweeps the
// field with the beat phase (real fireflies do this!).  Deeply calm.
//
// The swarm used to live in a fixed world box 16 units tall: seen from the
// near end of an 80-unit deep field that box is a narrow band across the
// middle of the picture, so the top and bottom of the frame stayed empty and
// the far half of the swarm fell under the 1.5 px an additive sprite needs to
// register at all.  The fireflies are now placed in FRUSTUM coordinates (x,y
// scaled by their own depth), which is what keeps the field even across the
// picture at every distance, and no lamp is ever drawn below ~2.6 px.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioBeatPhase;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioArousal;   // overall intensity -> flash synchrony
uniform float audioSpread;    // narrow .. wide spectrum -> swarm dispersion
uniform float audioMode;      // 0 = minor / cool, 1 = major / warm

out vec4 vCol;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    // The scene projection: 55 deg vertical FOV (see Scene3DShader::draw).
    const float kTanY = 0.5206;
    float aspect = (resolution.y > 0.5) ? resolution.x / resolution.y : 1.7778;

    // Spectral spread runs the swarm's DEPTH: a narrow, pure spectrum keeps
    // the fireflies in a close shallow cloud, a rich broadband one lets the
    // meadow run far back into the night.
    float spr  = clamp(audioSpread, 0.0, 1.0);
    float deep = 42.0 + 62.0 * spr;

    // Home position in FRUSTUM coordinates: x and y scaled by the firefly's
    // own depth, so the field covers the picture evenly whether a lamp is
    // eight units away or ninety.  2.0 would fit the frustum exactly; 2.25 so
    // the field still reaches past all four edges when the preset camera rig
    // rolls and yaws the view, and spread only ever opens it further.
    float dz    = 7.5 + pow(r3, 1.35) * deep;
    float halfH = dz * kTanY;
    float halfW = halfH * aspect;
    float open  = 2.25 + 0.30 * spr;

    // Vertical bias: still a MEADOW, so the lamps crowd the lower half and
    // thin out toward the top of the night, but they reach both edges.
    float fy = pow(r2, 0.78);

    vec3 home = vec3((r1 - 0.5) * open * halfW,
                     (1.05 - 2.30 * fy) * halfH,
                     dz);
    // Wander scaled with depth, so the drift reads the same at every distance.
    float wob = 0.9 + 0.055 * dz;
    vec3 world = home
               + vec3(sin(time * 0.23 + r4 * 40.0) * 1.1 * wob,
                      sin(time * 0.31 + r1 * 40.0) * 0.55 * wob,
                      sin(time * 0.19 + r2 * 40.0) * 2.5);

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;
    if (vp.z < 0.4)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    // Blink: own slow rhythm + a soft synchrony wave sweeping in x with
    // the beat phase — smooth envelopes only, no strobing.
    float own  = 0.5 + 0.5 * sin(time * (0.8 + r2 * 1.4) + r3 * 40.0);
    float sync = 0.5 + 0.5 * sin(6.2831853 * audioBeatPhase
                                 - world.x * 0.05);
    // Arousal decides how hard the swarm LOCKS: a calm passage leaves every
    // firefly on its own rhythm, an intense one pulls the entire meadow into
    // a single sweeping synchronous wave (real fireflies do exactly this).
    float syncW = 0.25 + 0.55 * clamp(audioArousal, 0.0, 1.0);
    // The squared envelope left most of the meadow sitting at zero; 1.6 keeps
    // the soft breathing blink but lets an unlit lamp stay faintly present.
    float blink = pow(own * (1.0 - syncW) + sync * syncW, 1.6);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    // A lamp must stay a legible speck at any distance -- below roughly two
    // and a half pixels an additive sprite averages away to nothing and the
    // far half of the meadow reads as black again.
    gl_PointSize = clamp(235.0 * (0.4 + 0.7 * r4) * px / dist,
                         2.6, max(15.0 * px, 2.6))
                 * (0.72 + 0.36 * blink);

    // Warm green-gold, a rare cool one — and the musical mode sets the night's
    // temperature: a minor key cools every lamp toward blue-green, a major key
    // warms them back to the classic green-gold.
    vec3 warm = (r1 > 0.94) ? vec3(0.50, 0.75, 0.90) : vec3(0.75, 0.90, 0.25);
    vec3 cool = (r1 > 0.94) ? vec3(0.38, 0.68, 1.00) : vec3(0.34, 0.84, 0.58);
    vec3 col = mix(cool, warm, clamp(audioMode, 0.0, 1.0));
    col = hueRot(col, audioChromaHue * 0.2);
    // A resting lamp keeps a low ember instead of going out completely, and
    // the haze fade reaches past the back of the field (at 100 the far third
    // of the meadow was multiplied to zero).
    col *= (0.14 + 0.90 * blink) * (0.65 + 0.4 * audioSwell + 0.25 * audioLevel)
         * clamp(1.0 - vp.z / 165.0, 0.0, 1.0);
    // Cap the TINTED vec3, not the scalar feeding it: the green-gold lamp
    // colour runs past 1.0 in its own channels, and pooled sprites clipped to
    // flat over-saturated green.
    vCol = vec4(min(col * 3.0, vec3(2.4)), 1.0);
}
