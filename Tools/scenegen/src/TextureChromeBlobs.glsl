//@doc
 * @brief TEXTURE CHROME BLOBS: blobs of liquid chrome drift through the dark, mirroring the photo as their
 * surroundings, and melt into one another as the music swells; the louder it is, the more of them there are.  The
 * blobs are a metaball field -- a sum of soft bumps, one per blob, wandering on slow paths -- and its surface is the
 * level where the sum reaches one; the field's slope gives the surface's normal, and the view reflected from it reads
 * the photo as the world around and catches two lights.  The bumps widen with the swell, so neighbours flow together;
 * the loudness (smoothed in a small field of the scene's own) sets how many blobs there are, the newest one fading in.
 * The chrome is tinted by one colour family from the photo.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSwell   -> the blobs melt together
 *   audioLevel   -> how many blobs there are (smoothed; the last one fades in and out)
 *   audioAdvance -> the blobs drift (integrated)
 *
 * Knobs: sizeP (the blobs' size), shineP (the lights' strength), hueP.
//@params sizeP shineP
//@audio audioSwell
//@state 1 1 60
//@body
/**  The state pass: the loudness smoothed.
 *
 * @return
 *   x the smoothed loudness, 0, 0, 1.
 **/
vec4 stateStep()
{
    float l = clamp(audioLevel, 0.0, 1.0);
    float old = stateFrame < 0.5 ? l : texelFetch(texState, ivec2(0, 0), 0).r;
    return vec4(mix(old, l, 0.02), 0.0, 0.0, 1.0);
}

/**  The metaball field and its slope at a place.
 *
 * @param p    The place. (in)
 * @param n    How many blobs (fractional: the last one fades in). (in)
 * @param s    The bumps' width. (in)
 * @param run  The drift's progress. (in)
 *
 * @return
 *   x the field, yz its slope.
 **/
vec3 field(vec2 p, float n, float s, float run)
{
    vec3 f = vec3(0.0);
    for (int k = 0; k < 12; ++k) {
        float i = float(k);
        float w = clamp(n - i, 0.0, 1.0);
        if (w <= 0.0) break;
        vec2 c = vec2(0.75 * sin(run * (0.31 + 0.07 * i) + 1.7 * i), 0.4 * cos(run * (0.23 + 0.05 * i) + 2.9 * i));
        vec2 d = p - c;
        float rr = dot(d, d);
        float b = w * s * s / max(rr, 1e-4);                         // one at the blob's radius s
        f.x += b;
        f.yz += -2.0 * d * b * b / max(w * s * s, 1e-4);
    }
    return f;
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    float level = texelFetch(texState, ivec2(0, 0), 0).r;
    float n = 4.0 + 7.0 * level;
    float s = (0.13 + 0.07 * clamp(sizeP, 0.0, 1.0)) * (0.85 + 0.35 * clamp(audioSwell, 0.0, 1.0));
    float run = 0.08 * sceneTime + 0.3 * audioAdvance;
    vec3 f = field(p, n, s, run);
    float px = 1.0 / resolution.y;
    float edge = (f.x - 1.0) / max(length(f.yz), 1e-3);              // the distance to the surface, roughly
    float inside = smoothstep(-1.5 * px, 1.5 * px, edge);
    vec3 N = normalize(vec3(-f.yz * 0.08, 1.0));
    vec3 R = reflect(vec3(0.0, 0.0, -1.0), N);
    vec3 env = imgLod(vec2(0.5) + 0.45 * R.xy / (1.0 + abs(R.z)), 2.0);
    vec3 tint = famCol(fh, 0.5);
    vec3 chrome = (mix(env, tint * luma(env) * 1.3, 0.35) * 1.5 + tint * 0.08) * (0.4 + 0.6 * N.z);
    float shine = 0.4 + 0.8 * clamp(shineP, 0.0, 1.0);
    chrome += famLight(fh, 0.6, 0.85) * pow(max(dot(R, normalize(vec3(0.5, 0.6, 0.6))), 0.0), 40.0) * shine;
    chrome += famLight(fh, 0.4, 0.6) * pow(max(dot(R, normalize(vec3(-0.6, -0.3, 0.7))), 0.0), 20.0) * 0.5 * shine;
    chrome *= 1.0 - 0.6 * pow(1.0 - N.z, 3.0);                      // dark rims
    vec3 back = famCol(fh, 0.3) * 0.025 + imgLod(vec2(0.5) + 0.3 * p, 6.0) * 0.04;
    vec3 col = mix(back, chrome, inside);
    col += tint * exp(-max(-edge, 0.0) * 40.0) * 0.08 * (1.0 - inside);   // a faint glow round the blobs
    finish(col);
}
