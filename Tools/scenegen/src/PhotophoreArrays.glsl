//@doc
 * @brief PHOTOPHORE ARRAYS: a skin covered in rows of small light organs, like the firefly squid's: they swell and fade
 * in waves that run over the whole array -- straight fronts, rings and spirals -- the patterns melting into one another
 * over each phrase.  The organs sit on a slightly jittered hexagonal lattice, each a bright core with a soft halo; its
 * light is the sum of three wave patterns at its place, weighted by where the phrase stands (the weights come round
 * again each phrase, so the patterns cycle without a jump).  The light is shades of one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance   -> the waves run (integrated: with the music's rhythm and drive)
 *   audioPhrasePos -> which pattern the waves make: straight fronts, rings, spirals, melting over the phrase
 *   audioSwell     -> the organs' resting glow
 *
 * Knobs: organP (the organs' spacing), waveP (how long the waves are), hueP.
//@params organP waveP
//@audio audioPhrasePos audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float fh = famHue();
    float S = 0.045 + 0.03 * clamp(organP, 0.0, 1.0);
    float k = 6.0 + 8.0 * (1.0 - clamp(waveP, 0.0, 1.0));
    float run = 0.4 * sceneTime + 1.6 * audioAdvance;
    float rest = 0.08 + 0.15 * clamp(audioSwell, 0.0, 1.0);
    vec2 g = p / S;
    const vec2 R = vec2(1.0, 1.7320508);
    vec2 qa = mod(g, R) - 0.5 * R, qb = mod(g - 0.5 * R, R) - 0.5 * R;
    vec2 q = dot(qa, qa) < dot(qb, qb) ? qa : qb;
    vec2 cid = g - q;
    float ho = hash21(floor(cid * 2.0 + 0.5));
    vec2 jit = 0.12 * (hash22(floor(cid * 2.0 + 0.5) + 3.0) - 0.5);
    vec2 c = (cid + jit) * S;                                         // the organ's place on screen
    // the three wave patterns, weighted round the phrase
    float pos = audioPhrasePos;
    vec3 w = max(vec3(cos(6.2831853 * (pos - vec3(0.0, 1.0, 2.0) / 3.0))), 0.0);
    w = w * w;
    w /= max(w.x + w.y + w.z, 1e-3);
    float lin = sin(dot(c, vec2(0.8, 0.6)) * k - run);
    vec2 c1 = vec2(0.4 * sin(0.05 * run), 0.2 * cos(0.04 * run));
    float rad = sin(length(c - c1) * k * 1.3 - run);
    vec2 c2 = -c1;
    float spi = sin(3.0 * atan(c.y - c2.y, c.x - c2.x) + length(c - c2) * k - run);
    float wave = w.x * lin + w.y * rad + w.z * spi;
    float b = rest + 1.4 * pow(0.5 + 0.5 * wave, 3.0);
    float d = length(q - jit);
    float organ = smoothstep(0.28, 0.16, d) + 0.25 * exp(-d / 0.18);
    vec3 col = famCol(fh, 0.45) * 0.02 + famLight(fh, 0.3 + 0.4 * ho, 0.35 + 0.3 * b) * organ * b;
    finish(col);
}
