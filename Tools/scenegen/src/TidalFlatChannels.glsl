//@doc
 * @brief TIDAL FLAT CHANNELS: tidal creeks on a mud flat seen from the air -- a branching network of channels, wide
 * where they drain to the sea and splitting into ever finer creeks inland, the whole net slowly shifting its course.
 * The tide comes in and goes out once a phrase: on the flood the water climbs out of the creeks and spreads over
 * the flat in sheets, on the ebb it drains back into the branches.  The water mirrors the photo like a sky.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the tide: in and out once a phrase (continuous)
 *   audioAdvance    -> the creeks slowly shift their course (integrated)
 *   audioKick       -> the water glints (light)
 *
 * Knobs: branchP (how finely the creeks branch), tideP (how high the flood rises), photoP (photo share), hueP.
//@params branchP tideP photoP
//@audio audioPhrasePos audioKick
//@body
/**  The flat's height: low along a branching network of creeks (ridged noise turned upside down, octave by octave
 * finer and shallower), a gentle slope toward the sea.
 *
 * @param x       The point. (in)
 * @param t       The creeks' slow shift. (in)
 * @param octs    How many octaves of branching. (in)
 *
 * @return
 *   The height.
 **/
float flatH(vec2 x, float t, float octs)
{
    float h = 0.0, a = 0.5, f = 1.2;
    vec2 q = x + 0.15 * vec2(fbm(x * 0.7 + vec2(0.0, 0.03 * t)), fbm(x * 0.7 + vec2(4.0, -0.02 * t)));
    for (int o = 0; o < 6; ++o) {
        if (float(o) >= octs) break;
        float n = noise2(q * f + float(o) * 3.7 + vec2(0.01 * t, 0.0));
        h += a * smoothstep(0.0, 0.3, abs(2.0 * n - 1.0));     // narrow valleys where the noise crosses its middle
        a *= 0.55;
        f *= 2.1;
    }
    return h + 0.25 * (x.y + 0.5);
}

void main()
{
    vec2 p = screenP();
    float prog = audioPhrasePos > 0.001 ? audioPhrasePos : fract(sceneTime / 16.0);
    float t = 0.2 * sceneTime + 0.6 * audioAdvance;
    float octs = 3.0 + 3.0 * clamp(branchP, 0.0, 1.0);
    float h = flatH(p, t, octs);
    float tide = 0.5 - 0.5 * cos(6.2831853 * prog);             // in and out once a phrase
    float level = 0.46 + (0.18 + 0.2 * clamp(tideP, 0.0, 1.0)) * tide;
    float e = 0.004;
    vec2 g = vec2(flatH(p + vec2(e, 0.0), t, octs) - h, flatH(p + vec2(0.0, e), t, octs) - h) / e;
    vec3 n = normalize(vec3(-g * 0.25, 1.0));
    float sun = 0.4 + 0.6 * max(dot(n, normalize(vec3(-0.4, 0.5, 0.7))), 0.0);
    vec3 tone = imgPalette(0.2 + 0.03 * audioPhase);
    vec3 mud = mix(vec3(0.32, 0.27, 0.2), tone * 0.6, 0.3) * sun * (0.8 + 0.3 * fbm(p * 12.0));
    // the water: the photo mirrored like a sky, rippled; its depth darkens it
    float depth = level - h;
    float wet = smoothstep(-0.005, 0.01, depth);
    vec2 rip = 0.004 * vec2(sin(40.0 * p.y + 1.3 * sceneTime), cos(37.0 * p.x - 1.1 * sceneTime));
    vec3 sky = imgLod(vec2(p.x, -p.y) * 0.5 + 0.5 + rip, 1.0);
    vec3 water = mix(sky * 1.2, sky * tone * 1.6, 0.3 * (1.0 - clamp(photoP, 0.0, 1.0))) * (0.75 + 0.25 * exp(-depth * 6.0));
    water += smoothstep(0.92, 1.0, noise2(p * 30.0 + vec2(sceneTime, 0.0))) * 0.4 * clamp(audioKick, 0.0, 1.0);
    vec3 col = mix(mud, water, wet);
    col = mix(col, col * 0.7 + vec3(0.05), smoothstep(0.02, 0.0, abs(depth)) * 0.6);   // the wet edge darkens the mud
    finish(col * 1.1);
}
