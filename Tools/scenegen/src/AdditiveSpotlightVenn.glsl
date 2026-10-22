//@doc
 * @brief ADDITIVE SPOTLIGHT VENN: three spotlights in a smoky room -- two in tones of the photo and one white -- their
 * cones crossing in the haze and their pools of light overlapping on the floor, the colours adding where they meet,
 * the lights wandering; each light glows with its own band of the music.  A cone is the region between two lines from
 * its lamp to the edges of its pool; its light in the air is the drifting smoke's density times a falloff along the
 * beam; the pools are soft ellipses on the floor.  The bands are smoothed over a second or so in a small field of the
 * scene's own.  Two tones of one colour family from the photo, and white.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSpectrum[32] -> each light glows with its own band (smoothed)
 *   audioAdvance      -> the lights wander and the smoke drifts (integrated)
 *
 * Knobs: beamP (the cones' width), smokeP (how thick the smoke is), hueP.
//@params beamP smokeP
//@audio audioSpectrum[32]
//@state 8 1 60
//@body
/**  The state pass: three bands of the spectrum, each smoothed over a second or so.
 *
 * @return
 *   This cell's smoothed band, 0, 0, 1.
 **/
vec4 stateStep()
{
    int k = stCell().x;
    float b = 0.0;
    for (int i = 0; i < 6; ++i) b += audioSpectrum[min(2 + 9 * k + i, 31)];
    b = clamp(b / 6.0, 0.0, 1.0);
    float old = stateFrame < 0.5 ? b : texelFetch(texState, ivec2(k, 0), 0).r;
    return vec4(mix(old, b, 0.04), 0.0, 0.0, 1.0);
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float bw = 0.12 + 0.1 * clamp(beamP, 0.0, 1.0);
    float smoke = 0.5 + 0.8 * clamp(smokeP, 0.0, 1.0);
    float run = 0.03 * sceneTime + 0.12 * audioAdvance;
    float haze = fbm(2.0 * p + vec2(0.4 * run, -0.2 * run)) * smoke;
    vec3 tones[3];
    tones[0] = famLight(fh, 0.5, 0.15);
    tones[1] = famLight(fract(fh + 0.3), 0.5, 0.15);
    tones[2] = vec3(1.0, 0.97, 0.92);
    vec3 col = vec3(0.012) + famCol(fh, 0.45) * 0.02 * haze;
    const float FLOOR = -0.38;
    for (int i = 0; i < 3; ++i) {
        float fi = float(i);
        float band = texelFetch(texState, ivec2(i, 0), 0).r;
        vec2 lamp = vec2(0.75 * (fi - 1.0), 0.62);
        vec2 aim = vec2(0.45 * sin(run * (0.7 + 0.2 * fi) + 2.1 * fi), FLOOR);
        vec2 ax = normalize(aim - lamp);
        vec2 rel = p - lamp;
        float along = dot(rel, ax), across = dot(rel, vec2(-ax.y, ax.x));
        float L = length(aim - lamp);
        float half0 = bw * along / L;                                 // the cone widens toward the floor
        float cone = smoothstep(half0 + 0.02, half0 - 0.02, abs(across)) * step(0.0, along) * step(FLOOR, p.y);
        float beam = cone * (0.35 + 0.65 * haze) * exp(-along * 0.5) * 1.0;
        vec2 dp = (p - aim) / vec2(bw * 1.3, 0.05);
        float pool = exp(-dot(dp, dp)) * step(p.y, FLOOR + 0.07);
        col += tones[i] * (beam + pool * 0.9) * (0.25 + 1.1 * band);
        col += tones[i] * exp(-dot(rel, rel) / 0.0008) * 0.6;          // the lamp
    }
    finish(col);
}
