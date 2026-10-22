//@doc
 * @brief INFINITY CUBE ROOM: inside a cube of six mirrors whose twelve edges are tubes of light -- an infinity cube
 * -- the edges' images form a lattice of light running away in every direction, each image one more bounce away and
 * a little dimmer, while the eye floats in the middle and turns steadily.  Optics: unfolding the reflections turns
 * the mirror cube into a lattice of cubes, the image cell's distance (in bounces) is the sum of its offsets; the
 * light is the glow round the nearest edge, dimmed by 0.85 per bounce.  The edges' colour runs round them in one
 * colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the colour runs along the edges (integrated: faster music, faster run) and the eye's turn
 *   audioSwell   -> the edges' glow widens
 *   audioKick    -> the edges flash (light)
 *
 * Knobs: edgeP (the edges' thickness), driftP (how far the eye wanders from the middle), hueP.  Distinct from
 * InfinityMirrorRoom, which has mirror walls with lamps.
//@params edgeP driftP
//@audio audioSwell audioKick
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float turn = 0.025 * sceneTime + 0.12 * audioAdvance;
    float run = 0.4 * audioAdvance + 0.03 * sceneTime;
    float tube = (0.012 + 0.012 * clamp(edgeP, 0.0, 1.0)) * (0.85 + 0.4 * clamp(audioSwell, 0.0, 1.0));
    float kick = clamp(audioKick, 0.0, 1.0);
    float dr = 0.15 + 0.2 * clamp(driftP, 0.0, 1.0);
    vec3 ro = dr * vec3(sin(0.05 * sceneTime), 0.7 * sin(0.04 * sceneTime + 1.0), cos(0.045 * sceneTime));
    vec3 rd = normalize(vec3(p, 1.0));
    rd.xz = rot2(turn) * rd.xz;
    rd.yz = rot2(0.4 * sin(0.6 * turn)) * rd.yz;
    rd.xy = rot2(0.25 * turn) * rd.xy;
    vec3 col = vec3(0.0);
    float t = 0.02;
    for (int i = 0; i < 90; ++i) {
        vec3 x = ro + rd * t;
        // the image cell (cube of size 2 round the origin) and the point inside it, mirrored for odd cells
        vec3 c = floor(x * 0.5 + 0.5);
        vec3 q = x - 2.0 * c;
        q = mix(q, -q, mod(c, 2.0));
        float bounces = abs(c.x) + abs(c.y) + abs(c.z);
        // the twelve edges: two coordinates at +-1
        vec3 a = abs(q);
        float d = min(length(vec2(a.x - 1.0, a.y - 1.0)), min(length(vec2(a.y - 1.0, a.z - 1.0)), length(vec2(a.z - 1.0, a.x - 1.0)))) - tube;
        float g = 1.0 / (1.0 + pow(max(d, 0.0) * 35.0, 2.0));
        // the colour runs along each edge (its coordinate along the edge)
        float along = a.x > 0.99 && a.y > 0.99 ? q.z : a.y > 0.99 && a.z > 0.99 ? q.x : q.y;
        float shade = 0.5 + 0.5 * sin(3.14159265 * along + 6.2831853 * run + bounces);
        float fade = pow(0.85, bounces) * smoothstep(0.02, 0.2, t);
        col += famLight(fh, shade, 0.2 + 0.3 * kick) * g * fade * (1.0 + 1.5 * kick) * 0.06;
        t += clamp(0.6 * d, 0.01, 0.3);
        if (t > 30.0) break;
    }
    finish(col);
}
