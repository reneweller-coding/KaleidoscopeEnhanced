#version 330 core
/**
 * @file RollerCoaster.vert
 * @brief Vertex stage companion to RollerCoaster.frag -- see that file's header for
 * this scene's description.
 */
// RollerCoaster.vert — THE CAMERA RIDES THE TRACK.  A glowing coaster
// track winds through a dark void; the view races along it, through neon
// arch gates and past light pylons.  The music's integrated energy is the
// throttle, kicks flash the gate you pass, a drop sends everything blazing.
// Ribbons: 0-1 rails, 2-3 ties, 4-11 arch gates, 12-19 scenery pylons.
//   attrA.x = t along ribbon, attrA.y = side, attrA.w = ribbon index.

in vec4 attrA;   ///< Vertex attribute A (meaning per geometry kind, see the stage's header; e.g. position or u/v and an index).
in vec4 attrB;   ///< Vertex attribute B (meaning per geometry kind; e.g. normal or per-element seeds).

uniform mat4  projM;   ///< Projection matrix.
uniform float eyeOff;   ///< Stereo eye offset (0 in mono).
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).

uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioBuildUp;   ///< Build-up toward a drop, 0..1.
uniform float audioDrop;   ///< Drop envelope: high after a detected drop, decaying.
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

out vec4  vCol;   ///< Colour (from the vertex stage).
out float vSide;   ///< Which side of a strip (from the vertex stage).

/// @brief Rotates a colour's hue by an angle (about the grey axis).
vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

/// The track: a bounded 3D Lissajous ride with rolling hills — smooth
/// everywhere, never repeating exactly on human timescales.
vec3 trackPos(float s)
{
    return vec3(40.0 * sin(s * 0.021) + 18.0 * sin(s * 0.043 + 1.3),
                 7.0 * sin(s * 0.031) +  4.5 * sin(s * 0.013 + 0.7),
                40.0 * cos(s * 0.017) + 22.0 * sin(s * 0.037 + 2.1));
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float t  = attrA.x;
    float sd = attrA.y;
    float ri = attrA.w;
    float r1 = attrB.x, r2 = attrB.y;

    // Camera rides the track; the music is the throttle.
    float sCam = time * 10.0 + audioAdvance * 26.0;

    vec3 camP = trackPos(sCam);
    vec3 fwdT = normalize(trackPos(sCam + 2.5) - camP);
    vec3 rgtC = normalize(cross(fwdT, vec3(0.0, 1.0, 0.0)));
    vec3 upC  = cross(rgtC, fwdT);
    camP += upC * 1.5;

    vec3  world;
    vec3  col;
    float bright = 1.0;

    if (ri < 2.0)
    {
        // ---- Rails: the visible 80 units of track ahead. ----
        float s = sCam + 1.2 + t * 80.0;
        vec3 P  = trackPos(s);
        vec3 T  = normalize(trackPos(s + 1.0) - P);
        vec3 R  = normalize(cross(T, vec3(0.0, 1.0, 0.0)));
        vec3 U  = cross(R, T);
        float side = (ri < 0.5) ? -1.0 : 1.0;
        world = P + R * side * 0.85 + U * sd * 0.14;
        col = vec3(0.35, 0.95, 1.0);
        bright = (1.0 - t * 0.8) * 1.3;
    }
    else if (ri < 4.0)
    {
        // ---- Ties: crossbars every 2 track units. ----
        float k  = floor(t * 40.0) + ((ri < 2.5) ? 0.0 : 0.5);
        float s  = sCam + 1.2 + k * 2.0;
        vec3 P   = trackPos(s);
        vec3 T   = normalize(trackPos(s + 1.0) - P);
        vec3 R   = normalize(cross(T, vec3(0.0, 1.0, 0.0)));
        world = P + R * sd * 0.95 + T * (fract(t * 40.0) - 0.5) * 0.22;
        col = vec3(1.0, 0.55, 0.15);
        bright = (1.0 - k / 42.0) * 0.9;
    }
    else if (ri < 12.0)
    {
        // ---- Neon arch gates every 12 units of track (they wrap ahead
        // once passed — the jump happens behind the camera, unseen). ----
        float a  = ri - 4.0;
        float sA = (floor(sCam / 12.0) + a + 1.0) * 12.0;
        vec3 P   = trackPos(sA);
        vec3 T   = normalize(trackPos(sA + 1.0) - P);
        vec3 R   = normalize(cross(T, vec3(0.0, 1.0, 0.0)));
        vec3 U   = cross(R, T);
        float ang = t * 6.2831853;
        vec3 ring = R * cos(ang) + U * sin(ang);
        world = P + U * 1.2 + ring * (5.5 + sd * 0.30);

        float dist  = sA - sCam;                      // 0..96 ahead
        float pass  = exp(-abs(dist - 4.0) * 0.25);   // the gate you pass
        col = hueRot(vec3(1.0, 0.25, 0.65), audioChromaHue + a * 0.8);
        bright = (0.45 + 1.6 * pass * audioKick + 1.4 * audioDrop
                  + 0.4 * audioBuildUp)
               * clamp(1.0 - dist / 100.0, 0.0, 1.0) * 1.2;
    }
    else
    {
        // ---- Scenery: glowing pylons scattered through the void. ----
        float p  = ri - 12.0 + floor(r1 * 4.0) * 8.0;
        vec3 base = vec3(sin(p * 2.13) * 90.0,
                         -12.0,
                         cos(p * 1.71) * 90.0);
        world = base + vec3(sd * 0.5, t * (26.0 + r2 * 18.0), 0.0);
        col = hueRot(vec3(0.35, 0.25, 0.8), audioChromaHue * 0.5 + p);
        bright = 0.35 + 0.3 * audioSwell + 0.8 * audioDrop;
    }

    // View transform (camera basis).
    vec3 rel = world - camP;
    vec3 vp  = vec3(dot(rel, rgtC), dot(rel, upC), dot(rel, fwdT));

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.06 * gl_Position.w;
    if (vp.z < 0.3)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    vCol  = vec4(col * bright * 1.4, 1.0);
    vSide = sd;
}
