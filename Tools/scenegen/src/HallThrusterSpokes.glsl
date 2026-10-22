//@doc
 * @brief HALL THRUSTER SPOKES: a tunnel of glowing plasma rings, one behind the other like the discharge channels of
 * Hall thrusters, each ring carrying bright spokes that rotate round it -- the rotating spokes of a Hall discharge --
 * while the view flies along the tunnel; the number of spokes changes with the sections.  The rings are annuli at even
 * steps along a gently winding axis, projected by their depth; a ring's light is a soft band whose brightness
 * swells into n spokes turning at their own rate, faster for nearer rings.  The plasma is shades of one colour family
 * from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance       -> the flight along the tunnel and the spokes' rotation (integrated: with the music's drive)
 *   audioSectionId/Age -> every new section changes the number of spokes (cross-faded over six seconds)
 *   audioSwell         -> the rings' glow
 *
 * Knobs: spaceP (the rings' spacing), widthP (the rings' width), hueP.
//@params spaceP widthP
//@audio audioSectionId audioSectionPrev audioSectionAge audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float sp = 0.3 + 0.2 * clamp(spaceP, 0.0, 1.0);
    float wr = 0.03 + 0.04 * clamp(widthP, 0.0, 1.0);
    float fly = 0.25 * sceneTime + 1.0 * audioAdvance;
    float spin = 0.4 * sceneTime + 1.6 * audioAdvance;
    float m = smoothstep(0.0, 6.0, audioSectionAge);
    float nA = 3.0 + mod(max(audioSectionPrev, 0.0), 4.0), nB = 3.0 + mod(max(audioSectionId, 0.0), 4.0);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec2 cam = 0.2 * vec2(sin(0.27 * fly), cos(0.21 * fly));
    vec3 col = famCol(fh, 0.45) * 0.015;
    float k0 = floor(fly / sp) + 1.0;
    for (int j = 0; j < 30; ++j) {
        float k = k0 + float(j);
        float dz = k * sp - fly;
        vec2 cs = (0.2 * vec2(sin(0.27 * k * sp), cos(0.21 * k * sp)) - cam) / dz;
        vec2 d = p - cs;
        float r = length(d);
        float R = 0.55 / dz;
        float band = exp(-pow((r - R) / (wr / dz), 2.0));
        if (band < 0.001) continue;
        float th = atan(d.y, d.x) - spin * (0.6 + 0.4 / dz) - 0.7 * k;
        float spokes = (1.0 - m) * pow(0.5 + 0.5 * cos(nA * th), 4.0) + m * pow(0.5 + 0.5 * cos(nB * th), 4.0);
        float fade = smoothstep(0.0, 0.6, dz) * smoothstep(30.0 * sp, 26.0 * sp, dz) * exp(-0.08 * dz);
        col += famLight(fh, 0.35 + 0.3 * fract(k * 0.17), 0.3 + 0.5 * spokes) * band * (0.25 + 1.3 * spokes) * fade * glow;
    }
    finish(famExpose(col, 1.40, 1.00, 0.00, fh));
}
