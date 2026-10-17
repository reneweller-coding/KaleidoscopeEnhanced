//@doc
 * @brief KIRIGAMI EXPANSION: a sheet cut into squares joined at their corners -- the rotating-squares kirigami.  Pull
 * it and it grows in both directions at once (auxetic): every square turns, neighbours the other way, and diamond
 * holes open between them.  The sheet breathes open and shut; each square carries its piece of the photo, the holes
 * show the photo behind, darker.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the sheet breathes open and shut over each phrase (continuous; the opening rescales the
 *                      lattice, so it follows the slow phrase clock, never the beat)
 *   audioKick       -> the hinges flash (light)
 *
 * Knobs: cellP (square size), openP (the base opening), depthP (how dark the holes are), hueP.
//@params cellP openP depthP
//@audio audioKick audioPhrasePos
//@body
void main()
{
    vec2 p = screenP();
    float prog = audioPhrasePos > 0.001 ? audioPhrasePos : fract(sceneTime / 16.0);
    float open = clamp(0.1 + 0.35 * clamp(openP, 0.0, 1.0) + 0.3 * sin(3.14159265 * prog), 0.0, 0.75);
    float th = open * 0.7854;                                   // each square turns by up to 45 degrees
    // the lattice spacing grows as the squares turn (corner hinges keep them joined)
    float s = 0.09 + 0.06 * clamp(cellP, 0.0, 1.0);
    float pitch = s * (cos(th) + sin(th));
    vec2 g = p / pitch;
    vec2 id = floor(g + 0.5);
    vec2 l = (g - id) * pitch;
    float dir = mod(id.x + id.y, 2.0) < 0.5 ? 1.0 : -1.0;       // neighbours turn the other way
    vec2 q = rot2(-dir * th) * l;
    float inside = smoothstep(0.004, -0.004, max(abs(q.x), abs(q.y)) - 0.5 * s);
    vec2 uv = (id * s + q) * 1.1 + 0.5;                         // each square keeps its own piece of the photo
    vec3 piece = imgLod(uv, 0.4);
    vec3 behind = imgLod(p * 0.5 + 0.5, 2.0) * (0.35 - 0.3 * clamp(depthP, 0.0, 1.0));
    vec3 tone = imgPalette(hash21(id) + 0.03 * audioPhase);
    vec3 col = mix(behind, piece * (0.85 + 0.25 * hash21(id + 0.5)), inside);
    // the hinges: the squares' corners
    vec2 qa = abs(q);
    float hinge = exp(-dot(qa - 0.5 * s, qa - 0.5 * s) / (s * s * 0.004));
    col += mix(tone, vec3(1.0), 0.6) * hinge * 0.5 * (0.4 + clamp(audioKick, 0.0, 1.0));
    finish(col);
}
