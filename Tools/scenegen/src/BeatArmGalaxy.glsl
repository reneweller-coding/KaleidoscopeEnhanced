//@doc
 * @brief BEAT ARM GALAXY: a spiral galaxy with as many arms as the bar has beats: each arm, a logarithmic spiral of
 * stars and glowing dust, flares up on its own beat and fades through the rest of the bar, so the light runs round the
 * arms in time; the galaxy turns with the music's drive.  An arm's light is its closeness to a spiral (angle minus ln r
 * over the pitch) times the decay since its beat (the bar's phase past its quarter); the stars are a jittered field
 * whose brightness follows the arms.  The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioBarPhase -> each of the four arms flares on its beat and fades through the bar (light)
 *   audioAdvance  -> the galaxy turns (integrated: with the music's tempo and drive)
 *   audioSwell    -> the dust's glow
 *
 * Knobs: pitchP (how tightly the arms wind), starP (how dense the stars are), hueP.
//@params pitchP starP
//@audio audioBarPhase audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float B = 0.25 + 0.2 * clamp(pitchP, 0.0, 1.0);
    float dens = 0.4 + 0.5 * clamp(starP, 0.0, 1.0);
    float rot = 0.02 * sceneTime + 0.08 * audioAdvance;
    float glow = 0.5 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    float bp = clamp(audioBarPhase, 0.0, 1.0);
    vec2 q = rot2(rot) * p * vec2(1.0, 1.35);                         // the galaxy seen a little tilted
    float r = max(length(q), 1e-3), a = atan(q.y, q.x);
    // the arms: whole numbers of u; the nearest arm's number tells which beat it flares on
    float u = (a - log(r) / B) / 6.2831853 * 4.0;
    float ku = floor(u + 0.5);
    float d = abs(u - ku);
    float sinceBeat = fract(bp - mod(ku, 4.0) / 4.0);
    float flare = 0.25 + 1.2 * exp(-5.0 * sinceBeat);
    float arms = exp(-pow(d * 6.2831853 / 4.0 * r / (0.05 + 0.08 * r), 2.0)) * flare;
    float core = exp(-r * r / 0.01);
    // the stars: a jittered field, brighter in the arms
    vec2 g = p * 60.0;
    vec2 cid = floor(g);
    vec2 sp = cid + 0.2 + 0.6 * hash22(cid);
    float hs = hash21(cid + 3.0);
    float star = smoothstep(0.12, 0.05, length(g - sp)) * step(1.0 - dens * (0.15 + 0.85 * arms), hs);
    vec3 col = famCol(fh, 0.45) * 0.015;
    col += famLight(fh, 0.3 + 0.3 * arms, 0.3) * arms * exp(-r * 1.2) * 0.8 * glow;
    col += famLight(fh, 0.6, 0.9) * (core * 1.2 + star * 0.8);
    finish(col);
}
