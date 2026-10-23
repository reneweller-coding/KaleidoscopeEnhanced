//@doc
 * @brief CONE DEFICIT SEAMS: a flat cone of changing angle: a wedge is cut out of the plane and the edges are glued, and the photo stands in fans around the apex; at an angle that is not a fraction of a whole turn the last fan is cut
 * short and the seams overlap.  The cone angle glides with the harmony through the broken values (five-sevenths, three-fifths ...), the picture turns with the phase of the music.  Round the seam each fan shows the photo
 * continued across the glued edge, so the picture is whole inside every fan.
 *
 * Audio Reactivity (structure, not only light):
 *   audioHarmAdvance -> the cone angle glides with the chords
 *   audioPhase      -> the turn (integrated)
 *
 * Knobs: zoomP (the zoom into the photo), hueP.
//@params zoomP
//@audio audioHarmAdvance
//@body
void main()
{
    vec2 p = screenP();
    float r = length(p) + 0.0005, a = atan(p.y, p.x);
    float frac0 = 0.45 + 0.4 * (0.5 + 0.5 * sin(0.45 * audioHarmAdvance));
    float al = 6.2831853 * frac0;
    float rot = 0.12 * audioPhase + 0.02 * sceneTime;
    float th = mod(a - rot, al);
    float fanI = floor((a - rot) / al);
    float z = 0.8 * (0.5 + 1.2 * clamp(zoomP, 0.0, 1.0));
    vec2 q = r * vec2(cos(th), sin(th)) * z;
    vec3 c = imgLod(q + 0.5, 0.6);
    float seam = exp(-pow(min(th, al - th) * r / 0.012, 2.0));
    float shade = 0.85 + 0.15 * cos(fanI * 2.0);
    finish(c * shade * (1.0 - 0.5 * seam) * 1.08);
}
