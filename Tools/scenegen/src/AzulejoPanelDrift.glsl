//@doc
 * @brief AZULEJO PANEL DRIFT: azulejo panels: the photo is split into tiles, each with its own pattern repeat at the edges; the tiles slide against each other like gears, and cobalt lines appear at the joints.  Every tile shows the photo mirrored four-fold inside itself, rows and columns move in opposite
 * directions, and the joints are drawn in deep blue with a thin white glaze line.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the sliding of rows and columns (integrated)
 *   audioSwell   -> the width of the blue joints
 *
 * Knobs: sizeP (the size of the tiles), hueP.
//@params sizeP
//@audio audioSwell audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float S = 0.12 + 0.12 * clamp(sizeP, 0.0, 1.0);
    float sl = 0.02 * audioAdvance + 0.03 * sceneTime;
    vec2 q = p / S;
    float row = floor(q.y);
    float colx = floor(q.x);
    float dirx = mod(row, 2.0) < 0.5 ? 1.0 : -1.0;
    q.x += dirx * sl * 3.0;
    float diry = mod(floor(q.x), 2.0) < 0.5 ? 1.0 : -1.0;
    q.y += diry * sl * 1.5;
    vec2 ci = floor(q);
    vec2 f = fract(q);
    vec2 m = abs(f - 0.5) * 2.0;
    vec2 uv = (ci + 0.5) * S * 0.0 + (1.0 - m - 0.5) * 0.55 + 0.5 + 0.08 * vec2(sin(1.7 * ci.x + ci.y), cos(1.3 * ci.y - ci.x));
    vec3 c = imgLod(uv, 0.6);
    float jw = 0.025 + 0.05 * clamp(audioSwell, 0.0, 1.0);
    float ed = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    float joint = 1.0 - smoothstep(jw * 0.5, jw, ed);
    float glaze = smoothstep(jw, jw + 0.012, ed) * (1.0 - smoothstep(jw + 0.012, jw + 0.03, ed));
    vec3 blue = vec3(0.08, 0.2, 0.62);
    vec3 col = mix(c * 1.1, blue, joint);
    col = mix(col, vec3(0.95), glaze * 0.45);
    finish(col);
}
