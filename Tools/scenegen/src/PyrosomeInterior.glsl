//@doc
 * @brief PYROSOME INTERIOR: a ride inside a pyrosome, the glowing colonial tube of the open sea: its wall is built of
 * thousands of small luminous zooids, and every onset in the music sets off a wave of light that spreads over the wall
 * from where it was touched, ring after ring, fading as it goes.  The wall is the tube seen from inside (depth = focal
 * length / radius on screen); the zooids sit on a hexagonal lattice over its angle and depth, each a soft oval with a
 * brighter siphon ring.  The waves come from touch points spaced along the tube: a zooid lights with the music's onset
 * as it was as long ago as the wave needed to reach it -- the scene keeps the last four seconds of onsets in a field of
 * its own.  The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioOnset   -> every onset sets off a wave of light spreading over the wall (kept for four seconds)
 *   audioAdvance -> the ride along the tube (integrated)
 *   audioSwell   -> the zooids' resting glow
 *
 * Knobs: zooidP (how many zooids round the tube), speedP (how fast the waves spread), hueP.
//@params zooidP speedP
//@audio audioOnset audioSwell
//@state 256 1 60
//@body
/**  The state pass: the onsets of the last four seconds, the newest in cell 0, each step moving them one cell on.
 *
 * @return
 *   The onset this cell keeps, 0, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 c = stCell();
    if (c.x == 0) return vec4(clamp(audioOnset, 0.0, 1.0), 0.0, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(0.0, 0.0, 0.0, 1.0);
    return texelFetch(texState, ivec2(c.x - 1, 0), 0);
}

/**  The music's onset as it was a while ago.
 *
 * @param age  How long ago, in seconds. (in)
 *
 * @return
 *   The onset then (0 beyond four seconds).
 **/
float onsetAgo(float age)
{
    return stLin(vec2(clamp(age * 60.0, 0.0, 254.0) + 0.5, 0.5)).r * (1.0 - smoothstep(3.6, 4.2, age));
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float fly = 0.25 * sceneTime + 1.0 * audioAdvance;
    float speed = 0.8 + 0.8 * clamp(speedP, 0.0, 1.0);
    float rest = 0.12 + 0.2 * clamp(audioSwell, 0.0, 1.0);
    float r = length(p), a = atan(p.y, p.x);
    float dz = 0.35 / max(r, 0.02);                                  // the depth of the wall seen here
    float z = dz + fly;
    // the zooids: a hexagonal lattice over the wall's angle and depth (equal spacing on the wall)
    float n = floor(28.0 + 16.0 * clamp(zooidP, 0.0, 1.0));
    vec2 w = vec2(a, z) * n / 6.2831853;
    const vec2 R = vec2(1.0, 1.7320508);
    vec2 qa = mod(w, R) - 0.5 * R, qb = mod(w - 0.5 * R, R) - 0.5 * R;
    vec2 q = dot(qa, qa) < dot(qb, qb) ? qa : qb;
    vec2 cid = w - q;
    float hz = hash21(floor(cid * 2.0 + 0.5));
    float rq = length(q / vec2(0.42, 0.36));
    float zooid = smoothstep(1.0, 0.45, rq) * 0.6 + exp(-pow((rq - 0.55) / 0.12, 2.0)) * 0.6;
    // the waves: from touch points spaced along the tube, each at its own angle
    float src = floor(z / 3.0 + 0.5) * 3.0;
    float a0 = 6.2831853 * fract(sin(src * 12.9898) * 43758.5453);
    float da = abs(fract((a - a0) / 6.2831853 + 0.5) - 0.5) * 6.2831853;
    float age = length(vec2(z - src, da)) / speed;
    float wave = onsetAgo(age) * exp(-0.35 * age);
    float lit = rest * (0.7 + 0.6 * hz) + 2.2 * wave;
    float fade = exp(-0.22 * dz) * smoothstep(0.0, 0.25, dz);
    vec3 col = famLight(fh, 0.3 + 0.4 * hz, 0.3 + 0.5 * wave) * zooid * lit * fade;
    col += famCol(fh, 0.45) * 0.015;
    finish(col);
}
