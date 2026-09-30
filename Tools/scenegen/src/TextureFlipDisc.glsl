//@doc
 * @brief TEXTURE FLIP DISC: a giant flip-disc display, the kind once used on
 * buses and stations -- thousands of round discs, dark on one side and
 * fluorescent on the other, show the photograph; as the picture drifts
 * and a threshold sweeps through it, waves of discs flip over on their
 * axles, glinting edge-on for a moment as they turn; the fluorescent
 * faces glow softly in the dark housing.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the picture drifts and the flip waves travel (integrated)
 *   audioSpread     -> how soft the flip wave is (how many discs are mid-turn)
 *   audioKick       -> the faces flare (light)
 *   audioMode       -> face colour: cyan-green in minor, yellow-orange in major
 *   audioHigh       -> the turning discs glint (light)
 *   audioSwell      -> the threshold sways (more or less of the picture lit)
 *
 * Knobs: discP (disc size), waveP (flip wave strength), colourP (photo colour on the faces), hueP.
//@params discP waveP colourP
//@audio audioSpread audioKick audioMode audioHigh audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float hi = clamp(audioHigh * 1.5, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float S = 30.0 + 30.0 * (1.0 - clamp(discP, 0.0, 1.0));
    vec2 g = p * S;
    vec2 cid = floor(g);
    vec2 l = fract(g) - 0.5;
    vec2 cw = (cid + 0.5) / S;
    float T = 0.02 * sceneTime + 0.15 * audioAdvance;
    vec2 uv = cw * 0.6 + 0.5 + vec2(T, 0.4 * T);
    float lum = luma(imgLod(uv, 2.0)) - luma(imgLod(uv, 6.0)) + 0.5;   // local contrast: every photo shows
    // Threshold with travelling waves: discs flip progressively as it passes.
    float thr = 0.5 + 0.15 * (swell - 0.5) + (0.08 + 0.15 * clamp(waveP, 0.0, 1.0)) * sin(dot(cw, vec2(3.0, 1.5)) - 1.5 * sceneTime - 8.0 * audioAdvance);
    float soft = 0.03 + 0.08 * clamp(audioSpread, 0.0, 1.0);
    float th = 3.14159265 * smoothstep(-soft, soft, lum - thr);   // 0 dark face .. pi fluorescent face
    float c = cos(th);
    // The disc turns about its horizontal axle: its height shrinks by |cos|.
    float R = 0.42;
    vec2 e = vec2(l.x, l.y / max(abs(c), 0.04));
    float rr = length(e) / R;
    float px = S / resolution.y * 2.5 / R;
    float disc = smoothstep(1.0 + px, 1.0 - px, rr);
    vec3 face = mix(vec3(0.2, 1.0, 0.6), vec3(1.0, 0.85, 0.1), mode);
    face = mix(face, glowColour(imgLod(uv, 3.0), cw, hueP * 0.159), clamp(colourP, 0.0, 1.0) * 0.6);
    vec3 dark = vec3(0.04, 0.04, 0.045);
    vec3 dc = c < 0.0 ? face * (0.75 + 0.35 * (-c)) * (1.0 + 0.8 * kick) : dark * (0.6 + 0.6 * c);
    // Edge-on glint while turning.
    float turning = 1.0 - abs(c);
    dc += vec3(1.0) * pow(turning, 6.0) * (0.3 + 1.2 * hi) * smoothstep(0.9, 0.2, rr);
    // Housing, axle and a faint glow of lit neighbours.
    vec3 housing = vec3(0.015, 0.015, 0.02);
    housing += face * 0.04 * smoothstep(0.0, 1.0, -c);
    float axle = smoothstep(0.03, 0.0, abs(l.y)) * smoothstep(0.5, 0.42, abs(l.x)) * (1.0 - disc);
    vec3 col = mix(housing, dc, disc);
    col += vec3(0.1) * axle;
    finish(col);
}
