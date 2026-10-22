//@doc
 * @brief FIFTHS CIRCLE HALLS: twelve glowing halls stand round a rotunda in the order of the circle of fifths; the view
 * stands at its centre facing the hall of the current key, and when the music modulates it turns and glides to the
 * neighbouring hall; each hall shows a different stretch of the photo through its arch, lit by how strongly its note
 * sounds.  The key's direction is the strength-weighted mean of the twelve pitch classes placed on the circle of fifths
 * (smoothed over a second or two in a small field of the scene's own), so the view turns smoothly; the halls are arched
 * openings in a panorama round the eye, with pillars between them.  The photo's colours, calmed toward one family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioChroma[12] -> the key: the view turns to its hall; each hall lights with its own note (smoothed)
 *   audioSwell      -> the halls' light
 *
 * Knobs: archP (the arches' height), fovP (how wide the view is), hueP.
//@params archP fovP
//@audio audioChroma[12] audioSwell
//@state 12 1 60
//@body
/**  The state pass: each pitch class's strength smoothed over a second or two.
 *
 * @return
 *   This pitch class's smoothed strength, 0, 0, 1.
 **/
vec4 stateStep()
{
    int k = stCell().x;
    float c = clamp(audioChroma[k], 0.0, 1.0);
    float old = stateFrame < 0.5 ? c : texelFetch(texState, ivec2(k, 0), 0).r;
    return vec4(mix(old, c, 0.02), 0.0, 0.0, 1.0);
}

/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float archH = 0.2 + 0.15 * clamp(archP, 0.0, 1.0);
    float fov = 0.9 + 0.5 * clamp(fovP, 0.0, 1.0);
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    // the key's direction on the circle of fifths
    vec2 v = vec2(0.0);
    for (int k = 0; k < 12; ++k) {
        float c = texelFetch(texState, ivec2(k, 0), 0).r;
        float fi = mod(float(k) * 7.0, 12.0);
        v += c * c * vec2(cos(6.2831853 * fi / 12.0), sin(6.2831853 * fi / 12.0));
    }
    float yaw = atan(v.y, v.x + 1e-5);
    float a = yaw + p.x * fov;
    const float SEC = 0.5235988;
    float j = floor(a / SEC + 0.5);
    float u = (a - j * SEC) / (0.5 * SEC);
    int hall = int(mod(j, 12.0));
    // the hall's pitch class: the inverse of the fifths order (7 x 7 = 49 = 1 mod 12)
    int pc = int(mod(float(hall) * 7.0, 12.0));
    float lit = texelFetch(texState, ivec2(pc, 0), 0).r;
    float top = 0.1 + archH * sqrt(max(1.0 - pow(u / 0.72, 2.0), 0.0));
    float opening = smoothstep(0.74, 0.7, abs(u)) * smoothstep(top + 0.01, top - 0.01, p.y) * smoothstep(-0.42, -0.4, p.y);
    vec2 uv = vec2(fract(float(hall) / 12.0 + u * 0.035), 0.5 + p.y * 0.9);
    vec3 view = tone(imgLod(uv, 1.0), fh) * (0.25 + 1.2 * lit) * glow;
    vec3 stone = famCol(fh, 0.4) * 0.04 * (0.7 + 0.3 * noise2(vec2(a * 20.0, p.y * 20.0)));
    float rim = exp(-pow((abs(u) - 0.72) / 0.02, 2.0)) * step(p.y, top) * step(-0.4, p.y) + exp(-pow((p.y - top) / 0.006, 2.0)) * step(abs(u), 0.72);
    vec3 col = mix(stone, view, opening);
    col += famLight(fh, 0.5, 0.6) * rim * (0.15 + 0.6 * lit);
    col += famCol(fh, 0.5) * 0.06 * exp(-pow((p.y + 0.42) / 0.01, 2.0));   // the floor's edge
    finish(famExpose(col, 1.20, 1.00, 0.00, fh));
}
