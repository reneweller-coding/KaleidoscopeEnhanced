//@doc
 * @brief MACH CONE RIPPLES: moving sources send out circular waves of light; where a source moves slower than its
 * waves they crowd ahead of it and spread behind (Doppler), where it moves faster they pile into a Mach cone trailing
 * from it.  Each source travels on a straight track across the field (wrapping round), emitting a wavefront at even
 * steps; front j was emitted at the source's place then and has grown since at the waves' speed, so it is a circle
 * of known centre and radius.  The fronts' light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the clock of emission and growth (integrated): faster music, faster sources and waves
 *   audioOnset   -> the newest fronts flare
 *   audioSwell   -> the fronts' glow
 *
 * Knobs: speedP (the sources' speed against the waves'), frontP (how many fronts are kept), hueP.
//@params speedP frontP
//@audio audioOnset audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float clock = 0.2 * sceneTime + 0.8 * audioAdvance;
    float keep = 10.0 + 10.0 * clamp(frontP, 0.0, 1.0);
    float glow = 0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float flare = clamp(audioOnset, 0.0, 1.0);
    const float C = 0.5;                                         // the waves' speed (screen units per clock unit)
    const float DT = 0.12;                                       // the clock between two fronts
    vec3 col = vec3(0.0);
    for (int s = 0; s < 3; ++s) {
        float fs = float(s);
        float v = C * (0.5 + (1.0 + 1.2 * clamp(speedP, 0.0, 1.0)) * (0.3 + 0.5 * fs));   // some below, some above C
        vec2 dir = normalize(vec2(cos(1.9 * fs + 0.3), sin(1.9 * fs + 0.3)));
        vec2 nrm = vec2(-dir.y, dir.x);
        float lane = 0.35 * (fs - 1.0);
        float track = 2.6;                                       // the track's length before it wraps
        float jNow = floor(clock / DT);
        for (int j = 0; j < 20; ++j) {
            float fj = float(j);
            if (fj >= keep) break;
            float te = (jNow - fj) * DT;                         // when this front was emitted
            float age = clock - te;
            float along = mod(v * te, track) - 0.5 * track;
            vec2 c = dir * along + nrm * lane;
            float r = C * age;
            float d = abs(length(p - c) - r);
            float fade = (1.0 - fj / keep) * smoothstep(0.0, 1.0, fj + fract(clock / DT));
            col += famLight(fh, 0.2 + 0.3 * fs, 0.3) * (exp(-pow(d / 0.006, 2.0)) + 0.12 * exp(-d / 0.02)) * fade
                   * (1.0 + 1.5 * flare * step(fj, 2.0)) * glow * 1.3;
        }
        // the source itself
        float along0 = mod(v * clock, track) - 0.5 * track;
        col += famLight(fh, 0.5, 0.85) * exp(-pow(length(p - dir * along0 - nrm * lane) / 0.012, 2.0));
    }
    finish(col);
}
