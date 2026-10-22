//@doc
 * @brief COUNTERPOINT BRAIDS: the bass, the middle voice and the melody as three glowing strands braiding away into the
 * depth: each strand's place round the braid's axis is its voice's pitch, so when two voices cross their strands cross,
 * and the last two seconds of the music lie stretched out into the distance.  A small field of the scene's own keeps the
 * three pitches over the last sixty-four steps (the bass and the middle voice as the centroids of the low and the
 * middle bands, the melody from the analysis); each strand is drawn through those steps, newest nearest, as a curve in
 * perspective, inside faint rings that move away with the steps.  Three shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpectrum[32]  -> the bass's and the middle voice's pitch (the bands' centroids): the strands' places
 *   audioMelodyPitch   -> the melody's pitch (where the analysis is sure of it)
 *   audioAdvance       -> the braid turns slowly (integrated)
 *   audioSwell         -> the strands' glow
 *
 * Knobs: widthP (the braid's width), lineP (the strands' width), hueP.
//@params widthP lineP
//@audio audioSpectrum[32] audioMelodyPitch audioMelodyConf audioSwell
//@state 64 1 30 32
//@body
/**  The state pass: the three voices' pitches over the last sixty-four steps, the newest in cell 0.
 *
 * @return
 *   x the bass, y the middle voice, z the melody, 1.
 **/
vec4 stateStep()
{
    int j = stCell().x;
    if (j > 0) return stateFrame < 0.5 ? vec4(0.5, 0.5, 0.5, 1.0) : texelFetch(texState, ivec2(j - 1, 0), 0);
    float sb = 0.0, wb = 0.0, sm = 0.0, wm = 0.0;
    for (int i = 0; i < 8; ++i) { float e = audioSpectrum[i]; sb += e * float(i); wb += e; }
    for (int i = 8; i < 20; ++i) { float e = audioSpectrum[i]; sm += e * float(i - 8); wm += e; }
    vec4 old = stateFrame < 0.5 ? vec4(0.5, 0.5, 0.5, 1.0) : texelFetch(texState, ivec2(0, 0), 0);
    float bass = wb > 0.01 ? sb / wb / 7.0 : old.x;
    float mid = wm > 0.01 ? sm / wm / 11.0 : old.y;
    float mel = mix(old.z, clamp(audioMelodyPitch, 0.0, 1.0), clamp(audioMelodyConf, 0.0, 1.0));
    return vec4(mix(old.xyz, vec3(bass, mid, mel), 0.25), 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float Rb = 0.35 + 0.15 * clamp(widthP, 0.0, 1.0);
    float lw = 0.0025 + 0.003 * clamp(lineP, 0.0, 1.0);
    float spin = 0.03 * sceneTime + 0.12 * audioAdvance;
    float glow = 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    vec3 col = famCol(fh, 0.45) * 0.015;
    // the braid's frames: a faint ring every eight steps, moving away with the music
    float r = max(length(p), 1e-3);
    float zr = Rb * 0.8 / r;
    float S8 = mod(stateFrame - 1.0, 8.0) + stateFrac;
    float u = ((zr - 0.45) / 0.06 - S8) / 8.0;
    float du = Rb * 0.8 / (r * r) / 0.06 / 8.0 / resolution.y;
    float frame = exp(-pow((0.5 - abs(fract(u) - 0.5)) / (1.5 * du), 2.0));
    col += famCol(fh, 0.5) * frame * 0.12 * smoothstep(0.45, 0.6, zr) * (1.0 - smoothstep(3.6, 4.3, zr)) * exp(-0.3 * zr);
    for (int v = 0; v < 3; ++v) {
        float fv = float(v);
        float best = 9.0, nearZ = 1.0;
        vec2 prev = vec2(0.0);
        for (int j = 0; j < 64; ++j) {
            vec4 s = texelFetch(texState, ivec2(j, 0), 0);
            float pitch = v == 0 ? s.x : v == 1 ? s.y : s.z;
            float fj = float(j) + stateFrac;                              // the steps move on smoothly
            float th = 6.2831853 * pitch * 1.5 + spin + 0.15 * fj;
            float z = 0.45 + 0.06 * fj;
            vec2 sp = Rb * vec2(cos(th), sin(th)) / z * 0.8;
            if (j > 0) {
                vec2 ab = sp - prev, ap = p - prev;
                float d = length(ap - ab * clamp(dot(ap, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0));
                if (d < best) { best = d; nearZ = z; }
            }
            prev = sp;
        }
        float w = lw / nearZ;
        float g = exp(-pow(best / w, 2.0)) + 0.25 * exp(-best / (5.0 * w));
        col += famLight(fh, 0.2 + 0.3 * fv, 0.4) * g * exp(-0.4 * nearZ) * glow;
    }
    finish(col);
}
