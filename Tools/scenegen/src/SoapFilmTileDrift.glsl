//@doc
 * @brief SOAP FILM TILE DRIFT: soap films in a frame: every cell of a honeycomb an interference film that mirrors the photo and thins toward the top; where it tears one sees clear
 * through to the photo, and the film's thickness shows only as a fine fringe at the edges, the faces carrying the photo's own colours.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell      -> the films' thickness
 *   audioAdvance    -> the films drift and drain (integrated)
 *
 * Knobs: cellsP (how many films), hueP.
//@params cellsP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = 0.05 * sceneTime + 0.4 * audioAdvance;
    float N = 4.0 + 5.0 * clamp(cellsP, 0.0, 1.0);
    vec2 q = p * N;
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(q, r) - h;
    vec2 b = mod(q - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    vec2 cid = floor((q - gv) * 2.0 + 0.5);
    float th = (0.5 - 0.5 * gv.y) * (0.6 + 0.5 * clamp(audioSwell, 0.0, 1.0)) + 0.15 * noise2(cid + t);
    float tear = smoothstep(0.12, 0.05, th + 0.2 * (hash21(cid) - 0.6));
    float fringe = 0.5 + 0.5 * cos(12.0 * th + 3.0 * length(gv));
    vec2 mirr = vec2(1.0 - uv.x, uv.y) + gv * 0.05;
    vec3 refl = imgLod(mirr, 0.8) * (0.5 + 0.7 * fringe);
    vec3 clear = imgLod(uv, 0.5);
    float edge = smoothstep(0.44, 0.5, 0.5 - max(abs(gv.x * 0.866 + gv.y * 0.5), max(abs(gv.y), abs(gv.x * 0.866 - gv.y * 0.5))));
    vec3 col = mix(refl, clear, tear);
    col += 0.1 * vec3(0.4 * fringe, 0.7 * (1.0 - fringe), 0.9) * (1.0 - tear) * smoothstep(0.1, 0.4, length(gv));
    col *= 0.88 + 0.2 * (1.0 - edge);
    finish(col * 1.05);
}
