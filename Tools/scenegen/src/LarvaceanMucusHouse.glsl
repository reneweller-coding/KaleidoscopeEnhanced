//@doc
 * @brief LARVACEAN MUCUS HOUSE: the mucus house of a larvacean seen from close by: a translucent palace of nested
 * chambers, its walls woven of fine meshes, two fan-shaped filters in its middle, and streams of light running in
 * through the walls, round the chambers and through the filters.  The walls are level lines of a gently wobbling
 * elliptic field, each with a fine mesh woven along it; the filters are fans of close curved lines; the streams follow
 * the lines of a flow round and through the house, beads of light running along them.  The house is shades of one
 * colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the streams run and the house sways (integrated: faster with the music's drive)
 *   audioSwell   -> how many streams run and how bright they are
 *
 * Knobs: wallP (how many walls), meshP (how fine the meshes are), hueP.
//@params wallP meshP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float NW = floor(3.0 + 2.0 * clamp(wallP, 0.0, 1.0));
    float mesh = 40.0 + 40.0 * clamp(meshP, 0.0, 1.0);
    float run = 0.15 * sceneTime + 0.6 * audioAdvance;
    float sw = clamp(audioSwell, 0.0, 1.0);
    vec2 q = rot2(0.08 * sin(0.1 * run)) * p;
    float an = atan(q.y, q.x);
    float F = length(q / vec2(1.0, 0.62)) * (1.0 + 0.04 * sin(3.0 * an + 0.3 * run) + 0.03 * sin(5.0 * an - 0.2 * run));
    vec3 col = famCol(fh, 0.45) * 0.015;
    // the walls: level lines of the field, each with a mesh woven along it
    for (int k = 0; k < 5; ++k) {
        float fk = float(k);
        if (fk >= NW) break;
        float Fk = 0.3 + 0.7 * (fk + 1.0) / NW;
        float dw = F - Fk;
        float wall = exp(-pow(dw / 0.004, 2.0));
        float band = exp(-pow(dw / 0.03, 2.0));
        float m = max(exp(-pow((fract(an / 6.2831853 * mesh * Fk) - 0.5) / 0.08, 2.0)), exp(-pow((fract(dw * 120.0) - 0.5) / 0.1, 2.0)));
        col += famLight(fh, 0.4 + 0.1 * fk, 0.5) * (wall * 0.6 + band * m * 0.12);
        col += famCol(fh, 0.45) * 0.02 * smoothstep(0.0, -0.05, dw);  // the clear fill inside each wall
    }
    // the two filters: fans of close curved lines either side of the middle
    float fan = smoothstep(0.75, 0.55, abs(abs(an) - 1.5708)) * smoothstep(0.55, 0.45, F) * smoothstep(0.08, 0.15, F);
    col += famLight(fh, 0.6, 0.6) * fan * exp(-pow((fract(F * 60.0 + an * 3.0) - 0.5) / 0.12, 2.0)) * 0.3;
    // the streams: lines of a flow round and through the house, beads running along them
    float r2 = dot(q, q);
    float psi = q.y * (1.0 - 0.25 / max(r2, 0.02)) * 0.6 + 0.4 * q.y;
    float lines = 10.0 + 10.0 * sw;
    float sl = exp(-pow((fract(psi * lines) - 0.5) / 0.06, 2.0));
    float beads = pow(0.5 + 0.5 * cos(6.2831853 * (q.x * 3.0 - run)), 10.0);
    col += famLight(fh, 0.7, 0.8) * sl * (0.08 + 0.9 * beads) * (0.4 + 0.6 * sw);
    finish(famExpose(col, 2.25, 0.90, 0.03, fh));
}
