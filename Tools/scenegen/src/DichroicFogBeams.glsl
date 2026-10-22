//@doc
 * @brief DICHROIC FOG BEAMS: light from one lamp passes through slowly turning dichroic filters and fans into beams in
 * a foggy room: a dichroic filter passes one colour and reflects its complement, and the colour it passes shifts with
 * the angle of the light, so as the filters turn each beam glides between two complementary tones of the photo.  The
 * beams are wedges from the lamp, each through its own filter; a beam's colour mixes the two tones by the cosine of the
 * angle between the beam and its filter, which turns with the music; the fog is drifting noise that the beams light.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance -> the filters turn and the fog drifts (integrated)
 *   audioSwell   -> the beams' strength
 *
 * Knobs: beamP (how many beams), fogP (how thick the fog is), hueP.
//@params beamP fogP
//@audio audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float N = floor(6.0 + 4.0 * clamp(beamP, 0.0, 1.0));
    float fogK = 0.5 + 0.8 * clamp(fogP, 0.0, 1.0);
    float run = 0.04 * sceneTime + 0.16 * audioAdvance;
    float bright = 0.6 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    vec3 toneA = famLight(fh, 0.5, 0.15), toneB = famLight(fract(fh + 0.5), 0.5, 0.15);
    vec2 lamp = vec2(-1.0, 0.55);
    vec2 rel = p - lamp;
    float ang = atan(rel.y, rel.x);
    float r = length(rel);
    float fog = (0.4 + 0.6 * fbm(2.5 * p + vec2(0.3 * run, -0.2 * run))) * fogK;
    vec3 col = vec3(0.01) + famCol(fh, 0.45) * 0.03 * fog;
    for (int i = 0; i < 10; ++i) {
        float fi = float(i);
        if (fi >= N) break;
        float a0 = -1.05 + 0.85 * (fi + 0.5) / N + 0.03 * sin(run + fi);
        float w = 0.028 + 0.012 * sin(1.7 * fi);
        float beam = smoothstep(w, w * 0.4, abs(ang - a0));
        float filt = run * (0.8 + 0.3 * fract(fi * 0.37)) + 1.9 * fi;  // the filter's turn
        float m = 0.5 + 0.5 * cos(filt - a0 * 3.0);
        vec3 c = mix(toneA, toneB, m);
        col += c * beam * fog * exp(-r * 0.5) * 0.7 * bright;
    }
    col += famLight(fh, 0.5, 0.9) * exp(-r * r / 0.004) * bright;
    finish(col);
}
