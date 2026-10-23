//@doc
 * @brief GONG SHIMMER BLOOM: a gong: the metal swings in modes that build up non-linearly until a noise in the middle opens the sound; in the picture a disc of photo opens in glowing nodal lines that wander outwards.  The disc swells, its rim becomes ragged, and two neighbouring modes fade into
 * one another so the lines keep rearranging themselves.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell       -> the build-up: the disc opens and the lines flare (a slow signal)
 *   audioHarmAdvance -> the mode (the nodal lines) changes with the key (integrated)
 *
 * Knobs: sizeP (the size of the disc), hueP.
//@params sizeP
//@audio audioSwell audioHarmAdvance
//@body
float nodal(vec2 p, float m, float k, float t)
{
    float r = length(p);
    float th = atan(p.y, p.x);
    return cos(m * th) * sin(k * r - t);
}
void main()
{
    vec2 p = screenP();
    float r = length(p);
    float sw = clamp(audioSwell, 0.0, 1.0);
    float R = (0.4 + 0.1 * clamp(sizeP, 0.0, 1.0)) * (0.9 + 0.2 * sw);
    float ph = 0.04 * audioHarmAdvance + 0.01 * sceneTime;
    float m0 = 3.0 + mod(floor(ph), 4.0);
    float m1 = 3.0 + mod(floor(ph) + 1.0, 4.0);
    float f = smoothstep(0.1, 0.9, fract(ph));
    float t = 1.5 * sceneTime;
    float v = mix(nodal(p, m0, 30.0, t), nodal(p, m1, 30.0, t * 1.1), f);
    float line = exp(-v * v * 60.0);
    float rag = R * (1.0 + 0.04 * (noise2(vec2(atan(p.y, p.x) * 3.0, 0.1 * sceneTime)) - 0.5));
    float disc = 1.0 - smoothstep(rag * 0.97, rag, r);
    float open = smoothstep(0.0, 0.3 + 0.5 * R, R - r);
    vec3 c = imgLod(p * 0.85 + 0.5, 0.6);
    vec3 plate = c * (0.45 + 0.2 * sin(40.0 * r - t) * 0.5);
    vec3 glow = vec3(1.0, 0.82, 0.5) * line * (0.4 + 0.9 * sw) * disc;
    vec3 bg = imgLod(p * 0.85 + 0.5, 2.5) * 0.14;
    float rim = smoothstep(rag * 0.97, rag, r) * (1.0 - smoothstep(rag * 1.04, rag * 1.08, r));
    vec3 col = bg + plate * disc + glow + vec3(0.8, 0.6, 0.3) * rim * 0.5;
    finish(col * 1.1);
}
