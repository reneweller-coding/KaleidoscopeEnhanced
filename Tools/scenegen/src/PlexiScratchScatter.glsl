//@doc
 * @brief PLEXI SCRATCH SCATTER: scratched acrylic: thousands of fine scratches scatter the light of the photo's bright places into sheaves of rays at right angles to each scratch;
 * where the scratches run in circles (polishing marks) wreaths of light lie round the bright spots.  The scratches' density follows the roughness of the music, the glow its swell.
 *
 * Audio Reactivity (structure, not only light):
 *   audioRoughness  -> the density of the scratches (how much light they scatter)
 *   audioSwell      -> the glow
 *   audioPhase      -> the polishing wreath's centre wanders (integrated)
 *
 * Knobs: scratchP (the base density), hueP.
//@params scratchP
//@audio audioSwell audioRoughness
//@body
void main()
{
    vec2 p = screenP();
    vec2 uv = p * 0.8 + 0.5;
    float t = 0.05 * sceneTime + 0.4 * audioPhase;
    vec2 c = 0.3 * vec2(sin(t), cos(0.8 * t));
    float circ = smoothstep(0.7, 0.2, length(p - c));
    float ang = 6.2831853 * fbm(p * 2.5 + 3.0);
    vec2 cd = p - c;
    float angC = atan(cd.y, cd.x) + 1.5708;
    ang = mix(ang, angC, circ);
    vec2 dir = vec2(cos(ang), sin(ang));
    vec2 nrm = vec2(-dir.y, dir.x);
    float dens = 0.4 + 0.9 * clamp(scratchP, 0.0, 1.0) * (0.5 + clamp(audioRoughness, 0.0, 1.0));
    float reach = 0.1 + 0.1 * dens;
    vec3 base = imgLod(uv, 0.5) * 0.7;
    vec3 acc = vec3(0.0);
    float ws = 0.0;
    for (int i = -7; i <= 7; ++i) {
        float s = float(i) / 7.0;
        float w = 1.0 - abs(s);
        vec3 c2 = imgLod(uv + nrm * s * reach * 0.8, 0.8 + 2.0 * abs(s));
        acc += c2 * smoothstep(0.55, 0.9, luma(c2)) * w;
        ws += w;
    }
    float grain = 0.8 + 0.4 * noise2(p * 300.0 + ang * 5.0);
    vec3 col = base + acc / ws * (0.6 + 1.0 * clamp(audioSwell, 0.0, 1.0)) * dens * grain;
    finish(col);
}
