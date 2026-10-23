//@doc
 * @brief BARBER POLE APERTURE: the barber pole illusion: diagonal stripes cut from the photo run sideways inside tall windows but seem to climb up (or sink), where the window ends bound them; three windows side by side, each with
 * another slant of stripes.  The slants change with the section of the music, gliding over from the old to the new, the running follows the drive of the music.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId/Prev/Age -> the stripes' slants glide to new ones at a section change
 *   audioAdvance    -> the stripes run (integrated)
 *
 * Knobs: stripeP (how dense the stripes), hueP.
//@params stripeP
//@audio audioSectionId audioSectionPrev audioSectionAge
//@body
void main()
{
    vec2 p = screenP();
    float asp = resolution.x / resolution.y;
    float wi = floor(clamp((p.x / asp + 0.5) * 3.0, 0.0, 2.999));
    float cx = (wi + 0.5) / 3.0 - 0.5;
    vec2 lc = vec2(p.x / asp - cx, p.y);
    float inW = smoothstep(0.014, 0.0, abs(lc.x) - 0.135) * smoothstep(0.014, 0.0, abs(lc.y) - 0.43);
    float blend = smoothstep(0.0, 6.0, audioSectionAge);
    float angA = 0.35 + 0.5 * mod(max(audioSectionPrev, 0.0) + wi, 3.0);
    float angB = 0.35 + 0.5 * mod(max(audioSectionId, 0.0) + wi, 3.0);
    float ang = mix(angA, angB, blend) + 0.2 * (wi - 1.0);
    float N = 14.0 + 14.0 * clamp(stripeP, 0.0, 1.0);
    float s = dot(p, vec2(cos(ang), sin(ang))) * N - 0.12 * audioAdvance - 0.1 * sceneTime;
    float tone = smoothstep(0.42, 0.58, abs(fract(s) - 0.5) * 2.0);
    vec3 c = imgLod(p * 0.8 + 0.5, 1.0);
    vec3 stripes = c * mix(0.12, 1.25, tone);
    vec3 outside = imgLod(p * 0.8 + 0.5, 3.5) * 0.3;
    float frame = smoothstep(0.012, 0.0, abs(max(abs(lc.x) - 0.135, abs(lc.y) - 0.43)) - 0.004);
    finish(mix(outside, stripes, inW) + 0.5 * frame * vec3(0.8));
}
