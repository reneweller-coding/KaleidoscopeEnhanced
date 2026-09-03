#version 330 core
/**
 * @file LaserArena.vert
 * @brief Vertex stage companion to LaserArena.frag -- see that file's header for
 * this scene's description.
 *
 * Audio Reactivity:
 *   audioBarPhase  -> the fan sweep of every beam (pre-integrated phase)
 *   audioBeatPhase -> the strobe on the beams' brightness
 *   audioKick      -> punch on every hit
 *   audioDrop      -> snaps the whole rig vertical and floods it
 *   audioChromaHue -> tint wobble of the laser family (musical key)
 */
// LaserArena.vert — a club laser show: 80 beams from four stage towers fan
// and sweep with the bar phase, kicks strobe them, a DROP snaps every beam
// vertical.  Each ribbon is one beam: t = distance along the beam,
// side = across the beam width.  attrA.x = t, attrA.y = side, attrA.w = beam.
//
// The engine hands this scene a fixed 20 ribbons of 300 segments (see
// Scene3DShader's GEOM_RIBBON builder), so each ribbon is CUT INTO FOUR
// beams of 75 segments: 20 beams from two towers left barely a third of the
// picture lit, with every beam converging on the same far vanishing point.
// The one quad that straddles a cut is killed by tapering the brightness to
// exactly zero at both ends of it -- under this scene's additive blending a
// zero-colour triangle is genuinely invisible, so the stretched connector
// never shows.  The towers also moved much closer to the camera, so the
// beams enter from off-frame and sweep across the whole view instead of
// starting small and deep.

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioBarPhase;
uniform float audioBeatPhase;
uniform float audioKick;
uniform float audioChromaHue;
uniform float audioDrop;

out vec4  vCol;
out float vSide;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main()
{
    float side = attrA.y;
    float rIdx = attrA.w;                    // ribbon 0..19
    float r1 = attrB.x, r2 = attrB.y;

    // Four beams per ribbon.  t runs 0..1 inside each of them.
    float tt  = attrA.x * 4.0;
    float sub = min(floor(tt), 3.0);
    float t   = clamp(tt - sub, 0.0, 1.0);
    float bi  = rIdx * 4.0 + sub;            // beam 0..79

    // Decorrelate the four beams that share a ribbon's hashes.
    float h1 = fract(r1 + sub * 0.2718);
    float h2 = fract(r2 + sub * 0.6180);

    // Four towers across the stage; the outer pair lean outwards.
    float twi   = mod(bi, 4.0);
    float twSgn = (twi < 1.5) ? -1.0 : 1.0;
    vec3  origin = vec3((twi - 1.5) * 9.5, 8.5, 7.0);

    // Fan of beams sweeping with the bar; the drop points them all up.
    float k     = floor(bi / 4.0) / 19.0;    // 0..1 across one tower's fan
    float fan   = (k - 0.5) * 1.9;
    float sweep = sin(6.2831853 * audioBarPhase + h1 * 6.2831853) * 0.85;
    float yaw   = fan * (0.55 + 0.25 * sweep) - twSgn * 0.42;
    float pitch = -0.30 + 0.55 * sweep
                + (h2 - 0.5) * 0.45;   // (drop camera pitch removed, V7d)

    // Beams point away from the crowd, deeper into the fog (never crossing
    // the camera plane — no clipping slivers).
    vec3 dir = normalize(vec3(sin(yaw) * cos(pitch),
                              sin(pitch),
                              cos(yaw) * cos(pitch)));

    // Beam quad: a thin glowing plane along the beam, carrying a wide soft
    // fog halo around a razor core (shaped in the fragment stage).
    float len = 85.0;
    vec3 pos = origin + dir * t * len;
    // cross(dir, +Z) collapses to zero for a beam aimed straight down the
    // view axis -- normalize()ing that gives NaN and drops the whole beam.
    vec3  sd = cross(dir, vec3(0.0, 0.0, 1.0));
    float sl = length(sd);
    vec3  sideDir = (sl > 1e-4) ? sd / sl : vec3(1.0, 0.0, 0.0);
    pos += sideDir * side * (0.30 + 1.60 * t);   // cone spread

    vec3 vp = vec3(pos.x, pos.y - 2.0, pos.z);

    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.06 * gl_Position.w;
    if (vp.z < 0.5)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    // Beam colour cycles per beam; kick strobe; fog fade along the beam.
    // Bounded hue spread (was a full-circle rainbow): the beams stay in
    // one laser-family, the musical key only wobbles the tint.
    //
    // hueRot spins the colour about the grey axis and does NOT keep it inside
    // the cube: over this scene's own hue range a third of the angles push a
    // channel down to -0.07. A negative channel writes as zero, and a pixel
    // with a zero channel reads as FULLY saturated -- which is a good part of
    // why the rig measured 85% of the frame above 0.8 saturation. Clamped at
    // the source, before the strobe scales it.
    vec3 col = max(hueRot(vec3(1.0, 0.15, 0.25),
                          k * 0.7 + sin(audioChromaHue) * 0.45), vec3(0.0));
    float strobe = 0.55 + 0.45 * sin(6.2831853 * audioBeatPhase);

    // The taper that makes the cut between two beams disappear: exactly zero
    // at t = 0 (a beam's first vertex) and at t = 74/75 (its last), which are
    // the two ends of the straddling quad.  It doubles as a soft emitter
    // flare-up and a fog dissolve at the beam's tip.
    // (Written as 1 - smoothstep(lo, hi) rather than smoothstep(hi, lo):
    // GLSL leaves smoothstep undefined when edge0 >= edge1.)
    float taper = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.92, 0.9866, t));

    // Four times the beam count, so each one carries proportionally less
    // light: the rig as a whole lands where the old 20 beams did instead of
    // clipping to white wherever a few of them overlap.
    col *= (0.35 + 0.40 * strobe + 0.55 * audioKick + 0.70 * audioDrop)
         * exp(-t * 0.9) * taper * 1.35;

    vCol  = vec4(min(col, vec3(2.2)), 1.0);
    vSide = side;
}
