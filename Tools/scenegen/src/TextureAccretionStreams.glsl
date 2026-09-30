//@doc
 * @brief TEXTURE ACCRETION STREAMS: looking down onto a vast glowing disc of
 * matter spiralling inward -- many rings of hot streams circling a bright
 * centre, inner rings faster than outer ones (Kepler shear), so the streams
 * are drawn out into fine spiral filaments; the streams are made of the
 * photograph, sheared along the orbits, glowing hot white-gold near the
 * centre and cooling to red and violet outward, with dark lanes between.
 * The disc fills the frame and continues beyond it.  Endless polar field.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the orbiting (integrated, jump-free)
 *   audioSpread     -> shear: how strongly inner and outer rings differ
 *   audioRoughness  -> turbulence in the streams
 *   audioMode       -> the colour ramp warms in major
 *   audioBass       -> the centre's glow (light)
 *   audioSwell      -> the brightness of the streams (slow)
 *
 * Knobs: tiltP (view tilt), laneP (dark lane contrast), photoP, hueP.
//@params tiltP laneP photoP
//@audio audioSpread audioRoughness audioMode audioBass audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float bass = clamp(audioBass, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    // Tilted disc: squash the y axis.
    float tilt = 1.0 + 1.2 * clamp(tiltP, 0.0, 1.0);
    vec2 q = vec2(p.x, p.y * tilt);
    float r = length(q);
    float a = atan(q.y, q.x);
    float T = 0.12 * sceneTime + 1.0 * audioAdvance;
    // Kepler shear: angular speed ~ r^-1.5 (clamped at the centre).
    float shear = 0.6 + 0.8 * clamp(audioSpread, 0.0, 1.0);
    float omega = shear * pow(max(r, 0.08), -1.5) * 0.25;
    float ao = a - T * omega;
    vec2 dir = vec2(cos(ao), sin(ao));
    float lr = log(max(r, 0.02));
    // Streams: the photo sampled along the orbit (seamless: on the unit circle).
    vec2 uv = dir * 0.25 + vec2(lr * 0.35, 0.0) + 0.5;
    uv += 0.03 * clamp(audioRoughness, 0.0, 1.0) * vec2(noise2(dir * 5.0 + lr * 8.0), noise2(dir * 5.0 - lr * 8.0));
    vec3 ph = imgLod(uv, 2.0);
    float lum = luma(ph);
    // Dark lanes: rings of lower density.
    float lanes = 0.5 + 0.5 * sin(lr * 18.0 + fbm3(dir * 2.0 + lr) * 3.0);
    float dens = mix(1.0, smoothstep(0.2, 0.8, lanes), clamp(laneP, 0.0, 1.0)) * (0.5 + 0.8 * lum);
    // Temperature ramp by radius.
    float mode = clamp(audioMode, 0.0, 1.0);
    float t = clamp(1.0 - r * 1.1, 0.0, 1.0);
    vec3 hot = mix(vec3(1.0, 0.95, 0.85), vec3(1.0, 0.8, 0.45), 1.0 - t);
    vec3 warm = mix(vec3(0.9, 0.35, 0.15), vec3(1.0, 0.5, 0.2), mode);
    vec3 cool = mix(vec3(0.45, 0.2, 0.7), vec3(0.8, 0.3, 0.45), mode);
    vec3 ramp = mix(cool, warm, smoothstep(0.0, 0.5, t));
    ramp = mix(ramp, hot, smoothstep(0.5, 0.95, t));
    vec3 photoTint = glowColour(ph, dir + lr, hueP * 0.159);
    vec3 c = mix(ramp, ramp * photoTint * 1.5, 0.35 * clamp(photoP, 0.0, 1.0));
    vec3 col = c * dens * (0.5 + 0.7 * swell) * (0.6 + 1.4 * t);
    // The bright centre.
    col += vec3(1.0, 0.9, 0.75) * exp(-r * 9.0) * (0.8 + 1.2 * bass);
    col += warm * exp(-r * 3.0) * 0.2 * (0.6 + 0.8 * bass);
    finish(col);
}
