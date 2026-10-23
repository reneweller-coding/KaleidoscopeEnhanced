//@doc
 * @brief STANDING WAVE BEATING NODES: standing waves in two directions of slightly different frequency: a grid that beats; the picture shows nodes that wander, with the photo behind.  Two standing-wave patterns whose frequencies differ slightly (the detuning follows the roughness) are added, so the nodal lines of the
 * sum creep across the picture, and the photo shines through the antinodes.
 *
 * Audio Reactivity (structure, not only light):
 *   audioRoughness -> the detuning of the two systems (the beat speed)
 *   audioAdvance   -> the nodes creep (integrated)
 *
 * Knobs: sizeP (the wave number), hueP.
//@params sizeP
//@audio audioRoughness audioAdvance
//@body
void main()
{
    vec2 p = screenP();
    float k = 12.0 + 24.0 * clamp(sizeP, 0.0, 1.0);
    float det = 0.02 + 0.08 * clamp(audioRoughness, 0.0, 1.0);
    float t = 0.05 * audioAdvance + 0.08 * sceneTime;
    float a = sin(k * p.x) * sin(k * p.y) * cos(t);
    float b = sin(k * (1.0 + det) * p.x + 0.5) * sin(k * (1.0 - det) * p.y + 0.3) * cos(t * 1.07 + 1.0);
    float c2 = sin(k * 0.7 * (p.x + p.y)) * sin(k * 0.7 * (p.x - p.y)) * cos(t * 0.9 + 2.0);
    float u = a + b + 0.6 * c2;
    float node = 1.0 - smoothstep(0.0, 0.12, abs(u));
    float anti = smoothstep(0.5, 1.8, abs(u));
    vec3 c = imgLod(p * 0.85 + 0.5, 0.8);
    c = mix(vec3(luma(c)), c, 1.3);
    vec3 col = c * (0.15 + 1.2 * anti) + vec3(0.9, 0.95, 1.0) * node * 0.2;
    finish(col);
}
