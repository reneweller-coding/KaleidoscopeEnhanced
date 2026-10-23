//@doc
 * @brief RUN LENGTH STREAKS: run-length coding: equal colour values in a row are gathered into one stripe whose length is the run; the photo turns into horizontal strokes of different length that grow and break up with the threshold of the gathering.  Each pixel
 * walks left and right while the brightness stays near its own, and takes the colour of what it passed.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell       -> the threshold of the gathering (longer runs)
 *   audioHarmAdvance -> the rows tilt (integrated)
 *
 * Knobs: sizeP (the height of the rows), hueP.
//@params sizeP
//@audio audioSwell audioHarmAdvance
//@body
void main()
{
    vec2 fc = gl_FragCoord.xy - 0.5 * resolution;
    float px = resolution.y / 270.0;
    float tilt = 0.12 * sin(0.2 * audioHarmAdvance) + 0.05 * sin(0.04 * sceneTime);
    vec2 u = rot2(tilt) * fc;
    float h = (2.0 + 4.0 * clamp(sizeP, 0.0, 1.0)) * px;
    float row = floor(u.y / h);
    float fy = fract(u.y / h);
    vec2 base = vec2(u.x, (row + 0.5) * h);
    float thr = 0.05 + 0.2 * (0.5 + 0.5 * sin(0.06 * sceneTime + 1.5 * clamp(audioSwell, 0.0, 1.0)));
    float st = 6.0 * px;
    vec3 c0 = imgLod((rot2(-tilt) * base) / resolution.y * 0.8 + 0.5, 1.0);
    float l0 = luma(c0);
    vec3 sum = c0;
    float ws = 1.0;
    for (int dir = 0; dir < 2; ++dir) {
        float sg = dir == 0 ? -1.0 : 1.0;
        float alive = 1.0;
        for (int i = 1; i <= 20; ++i) {
            vec2 b = base + vec2(sg * st * float(i), 0.0);
            vec3 c = imgLod((rot2(-tilt) * b) / resolution.y * 0.8 + 0.5, 1.0);
            alive *= 1.0 - smoothstep(0.8 * thr, 1.2 * thr, abs(luma(c) - l0));
            sum += c * alive;
            ws += alive;
        }
    }
    vec3 col = sum / ws;
    float gapm = smoothstep(0.0, 0.12, fy) * (1.0 - smoothstep(0.88, 1.0, fy));
    finish(col * (0.35 + 0.65 * gapm) * 1.1);
}
