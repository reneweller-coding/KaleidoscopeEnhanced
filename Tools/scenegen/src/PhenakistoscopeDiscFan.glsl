//@doc
 * @brief PHENAKISTOSCOPE DISC FAN: a phenakistoscope disc: the photo lies as a ring of twelve sectors, each changed by a small step against its neighbour, and slits at the rim sweep across them; in the sum the photo stands still and runs at the same
 * time.  The disc turns slowly, the slits turn a little faster, and the sectors are separated by thin dark gaps.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the turn of the disc and of the slits (integrated)
 *   audioSwell   -> the step between the sectors
 *
 * Knobs: sizeP (the width of the slits), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float r = length(p);
    float a = atan(p.y, p.x);
    float rot = 0.05 * audioAdvance + 0.03 * sceneTime;
    float wedge = 6.2831853 / 12.0;
    float aa = a - rot;
    float kf = aa / wedge;
    float k = floor(kf);
    float fk = fract(kf);
    float step_ = 0.018 + 0.03 * clamp(audioSwell, 0.0, 1.0);
    vec2 dir = vec2(cos(0.6), sin(0.6));
    vec2 sh = (k + 6.0) * step_ * dir;
    float zoom = 1.0 + 0.012 * k;
    vec3 c = imgLod((rot2(rot) * p) * 0.9 / zoom + 0.5 - sh * 0.5, 0.4);
    float gap = smoothstep(0.0, 0.03, fk) * (1.0 - smoothstep(0.97, 1.0, fk));
    float sa = a - 1.7 * rot;
    float sl = 0.5 + 0.5 * cos(12.0 * sa);
    float sw = 0.25 + 0.4 * clamp(sizeP, 0.0, 1.0);
    float slit = 0.3 + 0.7 * smoothstep(1.0 - sw - 0.12, 1.0 - sw, sl) * smoothstep(0.1, 0.22, r);
    float rim = 1.0 - 0.5 * smoothstep(0.52, 0.62, r);
    finish(c * (0.35 + 0.65 * gap) * slit * rim * 1.35);
}
