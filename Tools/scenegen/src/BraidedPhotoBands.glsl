//@doc
 * @brief BRAIDED PHOTO BANDS: the photo in four plaits that are plaited anew without end: each plait is a band of the picture, a different
 * window of it, running down the screen and crossing the others over and under; the crossings are shaded round like rope.  The plaiting
 * runs with the music's phase and the bands widen with the spectrum.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhase      -> the plaiting runs on (integrated)
 *   audioSpread     -> the bands' width
 *
 * Knobs: swingP (how far the plaits swing), shiftP (how different the four windows are), hueP.
//@params swingP shiftP
//@audio audioSpread
//@body
void main()
{
    vec2 p = screenP();
    float t = sceneTime * 0.15 + 1.2 * audioPhase;
    float hw = 0.07 + 0.05 * clamp(audioSpread, 0.0, 1.0);
    float swing = 0.12 + 0.18 * clamp(swingP, 0.0, 1.0);
    float colId = floor((p.x + 0.35) / 0.7);
    float px = p.x - 0.7 * colId;
    vec3 best = imgLod(p * 0.8 + 0.5, 4.0) * 0.28;
    float bestZ = -9.0;
    for (int i = 0; i < 4; ++i) {
        float fi = float(i);
        float ph = 3.14159265 * 0.5 * fi;
        float xc = (fi - 1.5) * 0.04 + swing * sin(6.2831853 * 0.9 * p.y - t + ph);
        float dx = px - xc;
        float z = cos(6.2831853 * 0.9 * p.y * 2.0 - 2.0 * t + 2.0 * ph);
        float inside = smoothstep(hw, hw * 0.85, abs(dx));
        if (inside > 0.01 && z > bestZ) {
            vec2 win = (hash22(vec2(fi + 4.0 * colId, 2.0)) - 0.5) * (0.15 + 0.6 * clamp(shiftP, 0.0, 1.0));
            vec3 c = imgLod(vec2(0.5 + dx * 1.2 + 0.3 * colId, p.y * 0.8 + 0.5) + win, 0.5);
            float rnd = sqrt(max(1.0 - (dx / hw) * (dx / hw), 0.0));
            best = mix(best, c * (0.55 + 0.6 * rnd), inside);
            bestZ = z;
        }
    }
    finish(best * 1.1);
}
