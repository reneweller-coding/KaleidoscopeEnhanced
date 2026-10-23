//@doc
 * @brief SASTRUGI DRIFT SCALES: sastrugi: snowdrifts as sharp-edged ridges with scales, shaped by the wind; the photo sets the colour of the light on the edges, and the scales wander.  A ridge field of absolute values of stretched noise (sharp crests), small overlapping scales on the lee sides, a low raking sun
 * and a sky tint taken from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the wind turns and the drifts wander (integrated)
 *   audioSwell   -> the height of the ridges
 *
 * Knobs: sizeP (the scale of the drifts), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
float sh(vec2 p, float ang, float sc, float t)
{
    vec2 q = rot2(-ang) * p;
    float a = abs(fbm(vec2(q.x * sc * 0.35 - 0.01 * t, q.y * sc * 1.3)) - 0.5) * 2.0;
    float b = abs(fbm(vec2(q.x * sc * 0.8 + 3.0, q.y * sc * 3.0 + 0.012 * t)) - 0.5) * 2.0;
    return 1.0 - 0.7 * a - 0.3 * b;
}
void main()
{
    vec2 p = screenP();
    float ang = 0.35 + 0.008 * audioAdvance + 0.01 * sceneTime;
    float sc = 2.0 + 3.0 * (1.0 - clamp(sizeP, 0.0, 1.0));
    float t = sceneTime;
    float ht = 0.5 + 0.8 * clamp(audioSwell, 0.0, 1.0);
    float h = sh(p, ang, sc, t);
    float e = 0.004;
    float hx = sh(p + vec2(e, 0.0), ang, sc, t) - h;
    float hy = sh(p + vec2(0.0, e), ang, sc, t) - h;
    vec3 n = normalize(vec3(-hx / e * 0.3 * ht, -hy / e * 0.3 * ht, 1.0));
    float dif = 0.4 + 0.9 * max(dot(n, normalize(vec3(-0.8, 0.3, 0.5))), 0.0);
    vec3 c = imgLod(p * 0.85 + 0.5, 1.2);
    vec3 snow = mix(vec3(0.82, 0.9, 1.0), c * 1.2, 0.35);
    vec3 shadow = mix(vec3(0.35, 0.45, 0.7), c, 0.3);
    vec3 col = mix(shadow, snow, clamp(dif - 0.3, 0.0, 1.0));
    col *= 0.9 + 0.2 * noise2(p * 250.0);
    finish(col * 1.1);
}
