//@doc
 * @brief TEXTURE SATELLITE CLOUDS: a weather satellite's view drifting over
 * the planet -- white cloud decks, cloud streets in long parallel rows,
 * swirling cyclones with their spiral bands, and patches of clear sky
 * where the ground below (the photograph as land and sea) shows through,
 * with the clouds casting shadows on it; the whole scene drifts slowly
 * and the cyclones turn.  Endless, mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the drift and the cyclones' rotation (integrated, jump-free)
 *   audioSpread     -> cloud cover
 *   audioKick       -> lightning in the storm cells (light)
 *   audioMode       -> the sun: cool morning light in minor, warm evening in major
 *   audioRoughness  -> cloud texture detail
 *   audioSwell      -> the shadows (slow)
 *
 * Knobs: cycloneP (cyclones), streetP (cloud streets), groundP (the photo as ground), hueP.
//@params cycloneP streetP groundP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
float gT, gRough;
float cloudField(vec2 x, out float storm)
{
    // Cyclones: swirl the coordinates around a few drifting centres.
    storm = 0.0;
    vec2 q = x;
    for (int i = 0; i < 3; ++i) {
        float fi = float(i);
        vec2 c = vec2(0.9 * sin(0.013 * sceneTime * (1.0 + 0.3 * fi) + fi * 2.1), 0.5 * cos(0.011 * sceneTime * (1.0 + 0.2 * fi) + fi * 1.3));
        vec2 d = q - c;
        float r = length(d);
        float fall = exp(-r * r * 6.0);
        float ang = fall * (3.5 + 2.0 * sin(gT * 0.3 + fi));
        q = c + rot2(ang) * d;
        storm = max(storm, fall);
    }
    float c = fbm(q * 2.2 + vec2(gT * 0.3, 0.0)) * 0.7 + fbm(q * 5.0 - gT * 0.1) * 0.3 * (0.5 + gRough);
    return c;
}

void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    gRough = clamp(audioRoughness, 0.0, 1.0);
    gT = 0.05 * sceneTime + 0.35 * audioAdvance;
    vec2 drift = vec2(0.02, 0.005) * sceneTime + vec2(0.1, 0.02) * audioAdvance;
    vec2 x = p + drift;
    float storm;
    float c = cloudField(x, storm);
    float cyc = clamp(cycloneP, 0.0, 1.0);
    // Cloud streets: parallel rolls, stronger where there is no storm.
    float streets = 0.5 + 0.5 * sin(dot(x, vec2(0.3, 1.0)) * 60.0 + fbm3(x * 3.0) * 4.0);
    c = mix(c, c * (0.8 + 0.3 * streets), clamp(streetP, 0.0, 1.0) * (1.0 - storm) * 0.6);
    float cover = 0.45 - 0.2 * clamp(audioSpread, 0.0, 1.0) - 0.1 * cyc * storm;
    float cloud = smoothstep(cover, cover + 0.08, c);
    // Ground: the photo as land/sea, seen from orbit.
    vec2 uv = x * 0.4 + 0.5;
    vec3 ground = imgK(uv, 2.0);
    ground = mix(vec3(0.05, 0.15, 0.3), ground * vec3(0.8, 0.9, 0.7), clamp(groundP + 0.2, 0.0, 1.2) * 0.8);
    // Cloud shadows on the ground (offset toward the sun).
    float storm2;
    float cs = smoothstep(cover, cover + 0.2, cloudField(x + vec2(0.03, -0.02), storm2));
    ground *= 1.0 - (0.4 + 0.3 * swell) * cs;
    vec3 sun = mix(vec3(0.9, 0.95, 1.05), vec3(1.1, 0.95, 0.8), mode);
    // Cloud tops: brightness from the density (thicker = whiter), soft grey edges.
    vec3 cloudC = sun * (0.65 + 0.4 * smoothstep(cover + 0.1, cover + 0.5, c));
    vec3 col = mix(ground, cloudC, cloud);
    // Lightning in storm cells.
    float flash = kick * storm * smoothstep(0.7, 0.9, fbm3(x * 8.0 + sceneTime));
    col += vec3(0.7, 0.8, 1.0) * flash * cloud;
    // Thin atmospheric haze.
    col = mix(col, vec3(0.6, 0.75, 1.0), 0.06);
    col = mix(col, col * glowColour(imgLod(uv, 6.0), p, hueP * 0.159) * 1.2, 0.04);
    finish(col);
}
