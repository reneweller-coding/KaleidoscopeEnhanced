//@doc
 * @brief URANIUM GLASS UV GLOW: pressed uranium glass under ultraviolet light: the glass glows from inside with its own
 * green, strongest where it is thickest, the thin edges and the hollows of the pressed pattern darker; the UV lamp's
 * beam wanders over it, and the pressed pattern changes from section to section.  The glow is the glass' thickness
 * under the beam: a pressed pattern -- hobnail domes, diamond points or fan ribs -- gives the thickness, a soft spot of
 * UV moves over it, and the glow bleeds softly into the glass round it.  The green is pulled a little toward the
 * photo's hue.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId/Age -> every new section presses another pattern (cross-faded over six seconds)
 *   audioAdvance       -> the UV beam wanders (integrated)
 *   audioSwell         -> the glow's strength
 *
 * Knobs: cellP (the pattern's size), beamP (the beam's width), hueP.
//@params cellP beamP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
/**  The pressed glass' thickness at a place.
 *
 * @param p     The place (in pattern cells). (in)
 * @param kind  0 hobnail domes, 1 diamond points, 2 fan ribs. (in)
 *
 * @return
 *   The thickness, 0..1.
 **/
float pressed(vec2 p, float kind)
{
    if (kind < 0.5) {
        const vec2 R = vec2(1.0, 1.7320508);
        vec2 a = mod(p, R) - 0.5 * R, b = mod(p - 0.5 * R, R) - 0.5 * R;
        vec2 q = dot(a, a) < dot(b, b) ? a : b;
        return 0.15 + 0.85 * max(1.0 - dot(q, q) / 0.2, 0.0);
    }
    if (kind < 1.5) {
        vec2 q = fract(rot2(0.7853982) * p * 1.2) - 0.5;
        return 1.0 - 2.0 * max(abs(q.x), abs(q.y));
    }
    vec2 q = fract(p * 0.7) - 0.5;
    float r = length(q), an = atan(q.y, q.x);
    return (0.5 + 0.5 * cos(14.0 * an)) * smoothstep(0.5, 0.15, r) * 0.8 + 0.2 * smoothstep(0.12, 0.05, r) + 0.1;
}

void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.09 + 0.06 * clamp(cellP, 0.0, 1.0);
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float kA = mod(max(audioSectionPrev, 0.0), 3.0), kB = mod(max(audioSectionId, 0.0), 3.0);
    float run = 0.03 * sceneTime + 0.12 * audioAdvance;
    float bw = 0.35 + 0.3 * clamp(beamP, 0.0, 1.0);
    float strength = 0.6 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    // the green, pulled a little toward the photo's hue
    float gh = fract(0.33 + 0.25 * (fract(fh - 0.33 + 0.5) - 0.5));
    vec3 green = hsv2rgb(vec3(gh, 0.75, 1.0));
    vec2 q = p / S;
    float th = (1.0 - m) * pressed(q, kA) + m * pressed(q, kB);
    float soft = (1.0 - m) * pressed(q * 0.5 + 3.1, kA) + m * pressed(q * 0.5 + 3.1, kB);   // the glow bleeding round
    // the UV beam: a soft spot wandering, with a fainter wash everywhere
    vec2 B = vec2(0.6 * sin(run * 1.1), 0.3 * cos(run * 0.8));
    float uv = 0.3 + exp(-dot(p - B, p - B) / (bw * bw));
    th *= 0.55 + 0.6 * smoothstep(0.25, 0.75, fbm(1.3 * p + 0.1 * run));   // the vessel's walls: thick and thin
    vec3 col = green * (0.12 + 1.1 * pow(th, 1.5) + 0.2 * soft) * uv * strength;
    col = mix(col, famLight(gh, 0.5, 0.6) * 0.9, smoothstep(0.85, 1.0, th) * uv * 0.25);
    finish(col);
}
