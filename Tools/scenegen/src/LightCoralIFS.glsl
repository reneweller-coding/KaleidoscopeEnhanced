//@doc
 * @brief LIGHT CORAL IFS: corals of light grow from the wall of an unseen tube all round the line of flight and reach
 * in toward it -- each a branching glow drawn by an iterated function system: a stem, then the space mirrored four
 * ways, tilted outward, shrunk and moved to the stem's tip, again and again, so every branch carries four smaller
 * ones.  Seven corals per ring, each ring turned half a step, each coral jittered and of its own size; the eye
 * drifts down the middle of the reef.  One colour family from the photo, the young tips paler than the old stems.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the branching angle glides with every chord change: the reef opens and closes
 *   audioSwell       -> the number of branching levels (a broken level fades in its tips): loud music grows the
 *                       corals out to their finest twigs
 *   audioAdvance     -> the drift (integrated)
 *
 * Knobs: spreadP (the base branching angle), lengthP (the stems' length), hueP.
//@params spreadP lengthP
//@audio audioHarmAdvance audioSwell
//@body
float gLevel = 0.0;        // the branching level of the nearest twig

/**  A coral's distance: a stem along y, then four branches per level, levels faded in up to a broken count.
 *
 * @param p       The point, base of the coral at the origin. (in)
 * @param ang     The branching angle. (in)
 * @param len     The stem's length. (in)
 * @param levels  How many levels (fractional: the last fades in). (in)
 * @param hc      The coral's own hash (twist). (in)
 *
 * @return
 *   The distance to the nearest twig, those of unfinished levels pushed away.
 **/
float coral(vec3 p, float ang, float len, float levels, float hc)
{
    float d = 1e9, s = 1.0;
    float r = 0.08 * len;
    gLevel = 0.0;
    for (int i = 0; i < 7; ++i) {
        float on = clamp(levels - float(i), 0.0, 1.0);
        if (on <= 0.0) break;
        vec3 a = p;
        a.y -= clamp(a.y, 0.0, len);
        float di = length(a) / s - r * pow(0.76, float(i)) * (1.2 - 0.25 * on);
        di += (1.0 - on) * 0.3;                                  // an unfinished level stays faint
        if (di < d) { d = di; gLevel = float(i); }
        p.y -= len;
        p.xz = abs(p.xz);
        p.xz = rot2(0.6 + 0.4 * hc) * p.xz;
        p.xy = rot2(-ang) * p.xy;
        p.zy = rot2(ang) * p.zy;
        p /= 0.62;
        s /= 0.62;
    }
    return d;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    const float NS = 7.0;                                        // corals round the wall
    const float SEG = 1.9;                                       // the rings' spacing along the flight
    const float RW = 2.3;                                        // the wall's radius
    float h = max(audioHarmAdvance, 0.0);
    float ang = 0.35 + 0.25 * clamp(spreadP, 0.0, 1.0) + 0.12 * sin(0.9 * h) + 0.06 * sin(0.37 * h + 2.0);
    float len = 0.5 + 0.14 * clamp(lengthP, 0.0, 1.0);
    float levels = 4.2 + 2.6 * clamp(audioSwell, 0.0, 1.0);
    float drift = 0.3 * sceneTime + 1.3 * audioAdvance;
    vec3 ro = vec3(0.25 * sin(0.05 * drift), 0.2 * sin(0.04 * drift), drift);
    vec3 rd = normalize(vec3(p, 1.0));
    rd.xz = rot2(0.25 * sin(0.024 * sceneTime)) * rd.xz;
    rd.yz = rot2(0.16 * sin(0.019 * sceneTime + 1.0)) * rd.yz;
    float roll = 0.02 * sceneTime;
    vec3 col = vec3(0.0);
    float t = 0.05;
    for (int i = 0; i < 110; ++i) {
        vec3 x = ro + rd * t;
        // the coral's cell: a ring along the flight and a sector round the wall, every ring turned half a sector;
        // the neighbouring ring and sector are measured too, so no coral is cut at a cell's border
        float zs = x.z / SEG;
        float seg0 = floor(zs + 0.5);
        float d = 1e9, lvl = 0.0, hcBest = 0.0;
        for (int k = 0; k < 4; ++k) {
            float seg = seg0 + (k >= 2 ? (zs > seg0 ? 1.0 : -1.0) : 0.0);
            float th = atan(x.y, x.x) - roll - 0.5 * seg * 6.2831853 / NS;
            float u = th * NS / 6.2831853;
            float sec = floor(u + 0.5) + ((k & 1) == 1 ? (u > floor(u + 0.5) ? 1.0 : -1.0) : 0.0);
            float hc = fract(sin(seg * 12.9898 + mod(sec, NS) * 78.233) * 43758.5453);
            float ca = (sec + 0.3 * (hc - 0.5)) * 6.2831853 / NS;
            vec2 xy = rot2(ca + roll + 0.5 * seg * 6.2831853 / NS) * x.xy;      // the sector's centre on +x
            // the coral grows from the wall inward: its own y axis points to the line of flight
            vec3 q = vec3(xy.y, RW - xy.x, x.z - (seg + 0.35 * (fract(hc * 7.3) - 0.5)) * SEG);
            q.xz = rot2(6.2831853 * fract(hc * 3.1)) * q.xz;
            float dk = coral(q, ang, len * (0.75 + 0.45 * fract(hc * 5.7)), levels, hc);
            if (dk < d) { d = dk; lvl = gLevel; hcBest = hc; }
        }
        float hc = hcBest;
        float lv = lvl / 6.0;
        float g = 1.0 / (1.0 + pow(max(d, 0.0) * 18.0, 2.0));
        float fade = exp(-0.08 * t) * smoothstep(0.05, 0.5, t);
        col += famLight(fh, 0.2 + 0.6 * hc, 0.1 + 0.5 * lv * lv) * g * fade * 0.12;
        t += clamp(0.6 * d, 0.02, 0.25);
        if (t > 30.0) break;
    }
    col += famCol(fh, 0.5) * 0.012;
    finish(col);
}
