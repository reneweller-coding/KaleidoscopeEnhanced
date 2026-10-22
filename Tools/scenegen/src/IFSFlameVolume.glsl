//@doc
 * @brief IFS FLAME VOLUME: a fractal flame (Draves' iterated function system with non-linear variations) in space --
 * three affine maps of 3D space, each bent by a blend of the sinusoidal, spherical and swirl variations -- whose
 * chaos-game orbit is gathered as a density of light, a veiled, folded flame the eye circles slowly.  The density
 * is gathered over time in the state field: every step runs a fresh stretch of the orbit, adds each point's light
 * to the cells it falls near and lets the old light fade; each point carries the flame's colour coordinate (the mean
 * of the maps it came through), turned into shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBass/Mid/High -> the weights of the three variations (sinusoidal, spherical, swirl): the flame's texture
 *   audioAdvance       -> the maps turn (integrated): the flame folds and unfolds; and the eye circles
 *   audioSwell         -> the flame's glow
 *
 * Knobs: shapeP (the maps' base layout), glowP (how far each point's light spreads), hueP.  Distinct from
 * FractalFlame, which is flat.
//@params shapeP glowP
//@audio audioBass audioMid audioHigh audioSwell
//@state 400 225 20
//@body
/**  A rotation about an axis.
 *
 * @param ax  The unit axis. (in)
 * @param a   The angle. (in)
 *
 * @return
 *   The rotation matrix.
 **/
mat3 axisRotF(vec3 ax, float a)
{
    float c = cos(a), s = sin(a);
    return mat3(c + ax.x * ax.x * (1.0 - c), ax.y * ax.x * (1.0 - c) + ax.z * s, ax.z * ax.x * (1.0 - c) - ax.y * s,
                ax.x * ax.y * (1.0 - c) - ax.z * s, c + ax.y * ax.y * (1.0 - c), ax.z * ax.y * (1.0 - c) + ax.x * s,
                ax.x * ax.z * (1.0 - c) + ax.y * s, ax.y * ax.z * (1.0 - c) - ax.x * s, c + ax.z * ax.z * (1.0 - c));
}

/**  One map of the flame: affine (turn, scale, shift), then the variations.
 *
 * @param x    The point. (in)
 * @param k    Which map, 0..2. (in)
 * @param ph   The maps' turning phase. (in)
 * @param var  The variations' weights (sinusoidal, spherical, swirl). (in)
 *
 * @return
 *   The image.
 **/
vec3 flameMap(vec3 x, int k, float ph, vec3 var)
{
    float fk = float(k);
    float base = clamp(shapeP, 0.0, 1.0);
    vec3 ax = normalize(vec3(sin(1.7 * fk + base), cos(2.3 * fk + 0.5), sin(0.9 * fk + 1.0)));
    vec3 shift = 0.7 * vec3(cos(2.0944 * fk + base), sin(2.0944 * fk + base), 0.4 * sin(1.3 * fk));
    vec3 y = axisRotF(ax, 0.9 + 0.6 * fk + ph * (0.4 + 0.2 * fk)) * x * 0.62 + shift;
    float r2 = dot(y, y);
    vec3 sinus = sin(y);
    vec3 sph = y / max(r2, 0.05);
    float sr = sin(r2), cr = cos(r2);
    vec3 swirl = vec3(y.x * sr - y.y * cr, y.x * cr + y.y * sr, y.z);
    return (y * 0.4 + sinus * var.x + sph * var.y + swirl * var.z) / (0.4 + var.x + var.y + var.z);
}

/**  One gathering step for this cell: a fresh stretch of the orbit splatted (as a gather) into the faded old light.
 *
 * @return
 *   The light (r) and the colour coordinate weighted by it (g).
 **/
vec4 stateStep()
{
    vec2 here = vec2(stCell()) + 0.5;
    float orbit = 0.025 * sceneTime + 0.1 * audioAdvance;
    vec3 eye = 1.75 * vec3(sin(orbit), 0.35 * sin(0.7 * orbit), -cos(orbit));
    vec3 fw = normalize(-eye);
    vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(rt, fw);
    float ph = 0.15 * audioAdvance + 0.01 * sceneTime;
    vec3 var = 0.2 + 0.8 * vec3(clamp(audioBass, 0.0, 1.0), clamp(audioMid, 0.0, 1.0), clamp(audioHigh, 0.0, 1.0));
    float sig = 0.8 + 1.4 * clamp(glowP, 0.0, 1.0);
    float aspect = stateRes.x / stateRes.y;
    vec3 x = vec3(stRandStep(0), stRandStep(1), stRandStep(2)) * 2.0 - 1.0;
    float cc = 0.5;
    float acc = 0.0, accC = 0.0;
    for (int i = 0; i < 520; ++i) {
        int k = int(floor(hash11(stateFrame * 0.6131 + float(i) * 0.3717) * 3.0));
        x = flameMap(x, k, ph, var);
        cc = 0.5 * (cc + float(k) * 0.5);
        if (i < 16) continue;
        vec3 v = x - eye;
        float d = max(dot(v, fw), 0.05);
        vec2 s = vec2(dot(v, rt), dot(v, up)) / d * 1.1;
        vec2 pc = (s / vec2(aspect, 1.0) + 0.5) * stateRes;
        vec2 e = (here - pc) / (sig * 2.6 / d);
        float g = exp(-dot(e, e)) * (2.6 / d);
        acc += g;
        accC += g * cc;
    }
    vec4 old = stateFrame < 0.5 ? vec4(0.0) : stAt(stCell());
    return vec4(old.r * 0.97 + acc * 0.2, old.g * 0.97 + accC * 0.2, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    vec2 cc = (p / vec2(stateRes.x / stateRes.y, 1.0) + 0.5) * stateRes;
    vec4 s = stLin(cc);
    // the flame's log-density tone: bright cores, soft veils
    float lit = log(1.0 + s.r * 3.0) / log(1.0 + 30.0);
    lit = clamp(lit, 0.0, 1.2) * (0.7 + 0.5 * clamp(audioSwell, 0.0, 1.0));
    float shade = s.g / max(s.r, 1e-4);
    vec3 col = famLight(fh, shade, 0.5 * lit * lit) * lit;
    col += famCol(fh, 0.5) * 0.012;
    finish(famExpose(col, 1.15, 1.00, 0.00, fh));
}
