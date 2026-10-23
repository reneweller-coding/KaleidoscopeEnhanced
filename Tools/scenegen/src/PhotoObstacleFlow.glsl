//@doc
 * @brief PHOTO OBSTACLE FLOW: a flow round the dark parts of the photo as obstacles: eddies shed from every edge and the wake of every dark island streams out behind it, while the photo lies in the flow as its colour, carried
 * and smeared along the streamlines and slowly drawn home to its own place.  The flow is calculated in a small field of the scene's own (a stable-fluids scheme: advection, viscosity and a pressure projection spread over the
 * steps), together with the field that carries the photo's coordinates.  The inflow follows the swell, its direction the phase of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the speed of the inflow
 *   audioPhase      -> the direction of the inflow sways (integrated)
 *
 * Knobs: darkP (how dark a place must be to be an obstacle), hueP.
//@params darkP
//@audio audioSwell
//@state 480 135 480 32
//@body
/** The size of the flow half of the field, in cells. */
const vec2 FS = vec2(240.0, 135.0);
/**  The photo coordinate of a field cell.
 *
 * @param c  The cell coordinate (in cells of the flow half). (in)
 *
 * @return
 *   The photo coordinate.
 **/
vec2 photoUV(vec2 c) { return ((c / FS) - 0.5) * vec2(1.7778, 1.0) * 0.8 + 0.5; }
/**  The flow half of the field, filtered, the coordinate clamped into the half.
 *
 * @param c  The cell coordinate. (in)
 *
 * @return
 *   The state there.
 **/
vec4 flowAt(vec2 c) { return texture(texState, (clamp(c, vec2(0.5), FS - 0.5)) / stateRes); }
/**  The coordinate half of the field, filtered, the coordinate clamped into the half.
 *
 * @param c  The cell coordinate. (in)
 *
 * @return
 *   The state there.
 **/
vec4 coordAt(vec2 c) { return texture(texState, (clamp(c, vec2(0.5), FS - 0.5) + vec2(FS.x, 0.0)) / stateRes); }
/**  Whether a cell is an obstacle: a dark place of the photo.
 *
 * @param c  The cell. (in)
 *
 * @return
 *   True for an obstacle.
 **/
bool isSolid(vec2 c) { return luma(imgLod(photoUV(c), 2.0)) < 0.2 + 0.2 * clamp(darkP, 0.0, 1.0); }
/**  One step of the flow and of the coordinate field (the state pass).
 *
 * @return
 *   In the flow half the velocity and the pressure, in the other half the photo coordinate carried by the flow.
 **/
vec4 stateStep()
{
    ivec2 ip = stCell();
    bool flowHalf = float(ip.x) < FS.x;
    vec2 cell = vec2(flowHalf ? float(ip.x) : float(ip.x) - FS.x, float(ip.y)) + 0.5;
    if (stateFrame < 0.5) return flowHalf ? vec4(0.2, 0.0, 0.0, 1.0) : vec4(cell, 0.0, 1.0);
    vec4 v0 = flowAt(cell);
    float dt = 0.7;
    bool solid = isSolid(cell);
    if (flowHalf) {
        vec2 va = flowAt(cell - v0.xy * dt).xy;
        vec4 e = flowAt(cell + vec2(1.0, 0.0)), w = flowAt(cell - vec2(1.0, 0.0)), n = flowAt(cell + vec2(0.0, 1.0)), s = flowAt(cell - vec2(0.0, 1.0));
        va += 0.04 * (e.xy + w.xy + n.xy + s.xy - 4.0 * va);
        float div = 0.5 * (e.x - w.x + n.y - s.y);
        float p = 0.25 * (e.z + w.z + n.z + s.z - 1.0 * div);
        va -= 0.5 * vec2(e.z - w.z, n.z - s.z) * 0.9;
        float U = 0.22 + 0.3 * clamp(audioSwell, 0.0, 1.0);
        float sway = 0.35 * sin(0.2 * audioPhase + 0.05 * sceneTime);
        if (cell.x < 1.5) { va = U * vec2(cos(sway), sin(sway)); p = 0.0; }
        if (cell.x > FS.x - 1.5) { va = flowAt(cell - vec2(1.0, 0.0)).xy; p = 0.0; }
        if (cell.y < 1.5 || cell.y > FS.y - 1.5) va.y *= 0.3;
        if (solid) { va = vec2(0.0); p = 0.5 * (e.z + w.z); }
        return vec4(clamp(va, vec2(-1.2), vec2(1.2)), clamp(p, -2.0, 2.0), 1.0);
    }
    vec2 co = coordAt(cell - v0.xy * dt).xy;
    co = mix(co, cell, 0.012);
    if (solid) co = cell;
    return vec4(co, 0.0, 1.0);
}
void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    vec2 cc = (p / vec2(asp, 1.0) + 0.5) * FS;
    vec2 co = texture(texState, (clamp(cc, vec2(0.5), FS - 0.5) + vec2(FS.x, 0.0)) / stateRes).xy;
    vec3 c = imgLod(photoUV(co), 0.7);
    bool solid = isSolid(cc);
    vec2 v = flowAt(cc).xy;
    finish((solid ? imgLod(p * 0.8 + 0.5, 0.7) * 0.85 : c) * (0.92 + 0.3 * length(v)) * 1.05);
}
