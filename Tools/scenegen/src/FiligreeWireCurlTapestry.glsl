//@doc
 * @brief FILIGREE WIRE CURL TAPESTRY: filigree: thin wires twisted into tendrils and scrolls and soldered into a lattice; the photo appears through the gaps of the lattice and in the wires as reflections.  Every cell holds a spiral scroll, the handedness changes from cell to cell, the number of turns
 * glides, and the cells turn slowly; the wire is gold and carries the photo's light in glints.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the scrolls turn (integrated)
 *   audioSwell   -> the number of turns and the wire's gloss
 *
 * Knobs: sizeP (the size of the cells), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.16 + 0.12 * clamp(sizeP, 0.0, 1.0);
    vec2 q = p / S;
    vec2 r2 = vec2(1.0, 1.7320508);
    vec2 h = r2 * 0.5;
    vec2 a = mod(q, r2) - h;
    vec2 b = mod(q - h, r2) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    vec2 id = q - gv;
    float hnd = mod(floor(id.x * 2.0 + id.y * 1.1547), 2.0) < 0.5 ? 1.0 : -1.0;
    float rr = length(gv);
    float th = atan(gv.y, gv.x);
    float turns = 2.0 + 2.0 * clamp(audioSwell, 0.0, 1.0);
    float s = rr * turns * 2.0 - hnd * th / 6.2831853 - hnd * (0.02 * audioAdvance + 0.03 * sceneTime);
    float wd = abs(fract(s) - 0.5);
    float wire = 1.0 - smoothstep(0.06, 0.13, wd);
    float hexd = max(abs(gv.x) * 0.8660254 + abs(gv.y) * 0.5, abs(gv.y));
    float frame = 1.0 - smoothstep(0.0, 0.05, abs(hexd - 0.5));
    float cut = smoothstep(0.52, 0.46, hexd);
    float wiremask = max(wire * cut, frame);
    vec3 c = imgLod(p * 0.85 + 0.5, 0.6);
    vec3 gap = c * 0.5;
    float glint = pow(0.5 + 0.5 * cos(6.0 * s + 3.0 * th), 6.0) * (0.3 + 0.7 * clamp(audioSwell, 0.0, 1.0));
    vec3 gold = vec3(1.0, 0.78, 0.35) * (0.55 + 0.4 * luma(imgLod(p * 0.85 + 0.5, 1.5))) + vec3(1.0, 0.95, 0.8) * glint * 0.6;
    finish(mix(gap, gold, wiremask) * 1.15);
}
