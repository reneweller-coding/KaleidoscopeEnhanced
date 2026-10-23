//@doc
 * @brief TRI HALFTONE TILES: a halftone of triangles: every triangle of a triangular lattice grows with the brightness, the apexes pointing up and down in turn, the lattice
 * rolling as a wave across the picture; each triangle in the photo's colour at its place.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpread     -> the triangles' size
 *   audioPhase      -> the wave of the lattice (integrated)
 *
 * Knobs: gridP (the lattice's fineness), hueP.
//@params gridP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    float t = 0.1 * sceneTime + 0.8 * audioPhase;
    float N = (14.0 + 20.0 * clamp(gridP, 0.0, 1.0)) * (0.9 + 0.2 * clamp(audioSpread, 0.0, 1.0));
    vec2 q = p * N + 0.4 * vec2(sin(0.6 * t + p.y * 2.0), 0.0);
    vec2 s = vec2(q.x + q.y * 0.57735, q.y * 1.1547);
    vec2 f = floor(s);
    vec2 fr = s - f;
    float up = fr.x + fr.y > 1.0 ? 1.0 : 0.0;
    vec2 cs = f + (up > 0.5 ? vec2(0.6667) : vec2(0.3333));
    float y = cs.y / 1.1547;
    vec2 centre = vec2(cs.x - y * 0.57735, y);
    vec3 c = imgLod(centre / N * 0.8 + 0.5, 1.5);
    vec2 d = q - centre;
    float k = up > 0.5 ? -1.0 : 1.0;
    float L = clamp(luma(c), 0.1, 1.0);
    float tri = smoothstep(0.03, -0.03, max(abs(d.x) * 0.866 + d.y * 0.5 * k, -d.y * k) - 0.33 * L * 1.6 * 0.8);
    vec3 col = vec3(0.05) + c * 1.2 * tri;
    finish(col);
}
