//@doc
 * @brief LIGHT IN FLIGHT WAVEFRONT: femto-photography: a pulse of light caught in flight, running as a glowing
 * wavefront through a field of glass spheres and haze; where the front passes through a sphere it is slowed, so it
 * dents and bulges behind each one, and the spheres light up from within as it crosses them.  The front's arrival
 * time at a point is its distance from the source plus the extra delay (n - 1) times the length of glass on the
 * straight way there (the chords through the spheres it crosses); the front glows where the arrival time equals the
 * pulse's age.  Several pulses follow each other.  The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the pulses' flight (integrated: faster music, faster light)
 *   audioOnset   -> the fronts flare
 *   audioSwell   -> the haze glows
 *
 * Knobs: sphereP (how many spheres), glassP (the glass' index: how much it slows), hueP.
//@params sphereP glassP
//@audio audioOnset audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float present = 0.35 + 0.5 * clamp(sphereP, 0.0, 1.0);
    float idx = 0.3 + 0.5 * clamp(glassP, 0.0, 1.0);            // n - 1
    float clock = 0.15 * sceneTime + 0.6 * audioAdvance;
    vec2 src = vec2(-1.05, -0.15);
    vec2 dir = normalize(p - src);
    float dist = length(p - src);
    // the extra delay: the length of glass on the straight way there (a sum over 24 samples along it)
    const float S = 0.28;
    float glass = 0.0;
    for (int i = 0; i < 24; ++i) {
        vec2 at = src + dir * dist * (float(i) + 0.5) / 24.0;
        vec2 cid = floor(at / S);
        float hc = fract(sin(dot(cid, vec2(12.9898, 78.233))) * 43758.5453);
        vec2 c = (cid + 0.5 + 0.4 * (vec2(fract(hc * 7.3), fract(hc * 3.1)) - 0.5)) * S;
        float R = S * (0.2 + 0.15 * fract(hc * 5.7));
        glass += step(hc, present) * smoothstep(R, R * 0.9, length(at - c));
    }
    float delay = glass * dist / 24.0;
    // is this point itself inside a sphere (it glows when a front crosses it)
    vec2 pid = floor(p / S);
    float hp = fract(sin(dot(pid, vec2(12.9898, 78.233))) * 43758.5453);
    vec2 pc = (pid + 0.5 + 0.4 * (vec2(fract(hp * 7.3), fract(hp * 3.1)) - 0.5)) * S;
    float pR = S * (0.2 + 0.15 * fract(hp * 5.7));
    float inside = step(hp, present) * smoothstep(pR, pR * 0.85, length(p - pc));
    float rim = step(hp, present) * exp(-pow((length(p - pc) - pR) / 0.003, 2.0));
    float arrive = dist + idx * delay;
    vec3 col = vec3(0.0);
    for (int k = 0; k < 4; ++k) {
        float age = fract(clock + float(k) * 0.25) * 2.6;        // four pulses, a quarter apart
        float front = exp(-pow((arrive - age) / 0.012, 2.0));
        float wake = exp(-max(age - arrive, 0.0) / 0.15) * step(arrive, age) * 0.15;
        col += famLight(fh, 0.3 + 0.1 * float(k), 0.4 * front) * (front * (1.0 + 1.5 * clamp(audioOnset, 0.0, 1.0)) + wake);
    }
    // the spheres glow inside while a front crosses them, their rims faintly always; the haze
    float lit = 0.0;
    for (int k = 0; k < 4; ++k) lit += exp(-pow((arrive - fract(clock + float(k) * 0.25) * 2.6) / 0.12, 2.0));
    col += famLight(fh, 0.6, 0.3) * inside * lit * 0.25 + famCol(fh, 0.5) * rim * 0.12;
    col += famCol(fh, 0.45) * 0.03 * (0.5 + 0.8 * clamp(audioSwell, 0.0, 1.0)) * fbm(p * 3.0);
    finish(col);
}
