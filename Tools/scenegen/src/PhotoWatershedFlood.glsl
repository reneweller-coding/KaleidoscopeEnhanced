//@doc
 * @brief PHOTO WATERSHED FLOOD: a flood over the photo's brightness as a landscape -- every point runs downhill to the
 * floor of its own basin, as the watershed transform has it, and the water rises: wherever the land lies below the
 * water's level, its basin fills with its own colour, a glassy lake with the picture shimmering through.  The level
 * rises and falls once a phrase, so lakes spread, meet at the watersheds and drain away again.
 *
 * Audio Reactivity (structure, not only light):
 *   audioPhrasePos  -> the water rises and falls once a phrase (continuous)
 *   audioAdvance    -> the photo drifts and the water shimmers (integrated)
 *
 * Knobs: depthP (how high the water rises), basinP (the basins' size), photoP (how much of the picture shows through),
 * hueP.
//@params depthP basinP photoP
//@audio audioPhrasePos
//@body
void main()
{
    vec2 p = screenP();
    float prog = audioPhrasePos > 0.001 ? audioPhrasePos : fract(sceneTime / 16.0);
    vec2 drift = 0.04 * vec2(sin(0.014 * sceneTime + 0.01 * audioAdvance), cos(0.011 * sceneTime));
    vec2 uv = p * 0.5 + 0.5 + drift;
    float lodB = 3.5 + 1.5 * clamp(basinP, 0.0, 1.0);
    float land = luma(imgLod(uv, lodB - 1.5));
    // down to the basin's floor
    vec2 x = uv;
    for (int i = 0; i < 14; ++i) {
        vec2 g = texGrad(x, lodB);
        float gl = length(g);
        if (gl < 1e-3) break;
        x -= g / gl * exp2(lodB) / 1024.0 * 1.5;
    }
    vec2 basin = floor(x * 14.0);
    float level = (0.2 + 0.5 * clamp(depthP, 0.0, 1.0)) * (0.5 - 0.5 * cos(6.2831853 * prog)) + 0.08;
    float under = smoothstep(level, level - 0.04, land);
    vec3 photo = imgLod(uv, 0.0);
    vec3 lake = imgPalette(hash21(basin) + 0.03 * audioPhase);
    float shimmer = 0.5 + 0.5 * sin(40.0 * (land - level) + 0.6 * sceneTime + 0.2 * audioAdvance);
    vec3 water = mix(lake * (0.7 + 0.5 * shimmer), photo, 0.3 + 0.4 * clamp(photoP, 0.0, 1.0));
    water += (1.0 - smoothstep(0.0, 0.025, abs(land - level))) * 0.25 * mix(lake, vec3(1.0), 0.6);   // the shore's glint
    vec3 col = mix(photo, water, under);
    finish(col * 1.05);
}
