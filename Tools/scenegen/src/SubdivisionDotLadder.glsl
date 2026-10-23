//@doc
 * @brief SUBDIVISION DOT LADDER: a ladder of eight rows of dots, the first with one dot to the bar, the last with eight, a playhead sweeping once a bar from left to right and lighting each dot as it passes with a glow that
 * fades behind it; the dots wear the photo's colour at their place, and the vertical lines where the rows agree and the gaps where they do not draw a pattern like Ligeti's polyrhythms.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBarPhase   -> the playhead (one sweep a bar; the dots of every row lit in turn)
 *   audioSwell      -> the dots' size
 *
 * Knobs: dotP (the size of the dots), hueP.
//@params dotP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float bar = rhyBar();
    float xs = p.x / asp + 0.5;
    float row = floor((0.5 - p.y) * 8.0);
    float yc = 0.5 - (row + 0.5) / 8.0;
    float n = row + 1.0;
    float k = floor(xs * n);
    float xc = ((k + 0.5) / n - 0.5) * asp;
    vec2 dpos = vec2(xc, yc);
    float R = (0.03 + 0.03 * clamp(dotP, 0.0, 1.0)) * (0.8 + 0.4 * clamp(audioSwell, 0.0, 1.0));
    float dl = mod(bar - (k + 0.5) / n + 0.5, 1.0) - 0.5;
    float glow = exp(-max(dl, 0.0) * 6.0 + min(dl, 0.0) * 14.0);
    vec3 c = imgLod(dpos * 0.8 + 0.5, 2.0);
    float d = length(p - dpos);
    float rr = R * (1.0 + 0.5 * glow);
    float disc = smoothstep(rr, rr - 0.004, d);
    float head = exp(-pow((xs - bar) / 0.006, 2.0));
    vec3 col = imgLod(p * 0.8 + 0.5, 3.0) * 0.26 + c * (0.5 + 1.2 * glow) * disc + 0.08 * head * imgLod(vec2(0.5), 6.0);
    finish(col * 1.1);
}
