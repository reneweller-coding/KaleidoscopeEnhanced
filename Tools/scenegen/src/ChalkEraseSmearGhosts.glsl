//@doc
 * @brief CHALK ERASE SMEAR GHOSTS: smears on a blackboard: chalk that was wiped away with a sponge in strokes, leaving shadows of old traces; the photo stands as a chalk drawing, and the smears wander.  The chalk drawing is the photo's light, dusted on a dark board; wide curved wipe strokes replace it by a blurred,
 * pale ghost drawn out along the stroke, and the strokes slowly move.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the width of the wipes
 *   audioAdvance -> the wipes wander (integrated)
 *
 * Knobs: sizeP (the chalk's grain), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    vec2 fc = gl_FragCoord.xy;
    float px = resolution.y / 270.0;
    float t = 0.01 * audioAdvance + 0.015 * sceneTime;
    vec2 uv = p * 0.85 + 0.5;
    vec3 c = imgLod(uv, 0.8);
    float l = luma(c);
    float grain = noise2(fc / px * (0.8 + 0.8 * clamp(sizeP, 0.0, 1.0))) * 0.6 + noise2(fc / px * 2.3 + 4.0) * 0.4;
    float chalk = smoothstep(0.35, 0.8, l) * smoothstep(0.3, 0.7, grain + 0.3 * l);
    float wipe = 0.0;
    vec2 smearDir = vec2(0.0);
    for (int k = 0; k < 3; ++k) {
        float fk = float(k);
        float cx = 0.9 * sin(t * (2.0 + fk) + 2.0 * fk);
        float rad = 0.55 + 0.2 * fk;
        vec2 cen = vec2(cx * 0.8, -0.7 + 0.5 * fk);
        float d = length(p - cen);
        float w = (0.1 + 0.12 * clamp(audioSwell, 0.0, 1.0)) * (1.0 + 0.3 * fk);
        float band = exp(-pow((d - rad) / w, 2.0));
        wipe = max(wipe, band);
    }
    vec3 ghostc = imgLod(uv + vec2(0.0, 0.0), 2.8);
    float gh = smoothstep(0.35, 0.8, luma(ghostc)) * 0.35;
    float chalkv = mix(chalk, gh, wipe) + wipe * 0.12 * noise2(fc / px * vec2(0.3, 2.5));
    vec3 board = vec3(0.07, 0.1, 0.09) * (0.8 + 0.4 * noise2(fc / px * 0.5));
    vec3 chalkc = mix(vec3(0.95), c * 1.3, 0.35);
    finish(board + chalkc * chalkv * 1.05);
}
