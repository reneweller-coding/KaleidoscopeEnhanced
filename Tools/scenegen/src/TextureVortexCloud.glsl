//@doc
 * @brief TEXTURE VORTEX CLOUD: looking up into the heart of a rotating storm
 * -- a vast spiral of clouds winds around a clear eye, the cloud bands
 * stretched by the rotation into long streaks that sweep inward faster
 * near the centre, their undersides tinted by the photograph and lit from
 * the eye's pale glow; lightning flickers within the bands.  Endless
 * beyond the frame; mirrorable.
 *
 * Audio Reactivity (structure, not only light):
 *   audioAdvance    -> the rotation (integrated, jump-free)
 *   audioSpread     -> the spiral winds tighter
 *   audioKick       -> lightning in the bands (light)
 *   audioMode       -> the light: steel blue in minor, sulphur-orange in major
 *   audioRoughness  -> the turbulence in the bands
 *   audioSwell      -> the eye's glow (slow)
 *
 * Knobs: armP (spiral arms), eyeP (eye size), densityP (cloud density), hueP.
//@params armP eyeP densityP
//@audio audioSpread audioKick audioMode audioRoughness audioSwell
//@body
void main()
{
    vec2 p = screenP();
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float mode = clamp(audioMode, 0.0, 1.0);
    float rough = clamp(audioRoughness, 0.0, 1.0);
    float r = max(length(p), 1e-4);
    float a = atan(p.y, p.x);
    float lr = log(r);
    float T = 0.15 * sceneTime + 1.0 * audioAdvance;
    // The spiral: bands wound by twist * log r.
    float twist = (1.5 + 2.0 * clamp(audioSpread, 0.0, 1.0));
    float arms = floor(2.0 + 3.0 * clamp(armP, 0.0, 1.0));
    // Rigid rotation of a fixed spiral (a radius-dependent speed would wind the
    // bands ever tighter over time); the inward drift lives in the noise phase.
    float rotA = a + twist * lr + T * 0.6;
    lr += 0.25 * T;
    // Clouds on the unit circle of the rotated angle (seamless), stretched along the spiral.
    vec2 u = vec2(cos(rotA), sin(rotA));
    vec2 ua = vec2(cos(rotA * arms), sin(rotA * arms));
    float band = 0.5 + 0.5 * dot(ua, vec2(1.0, 0.0));
    // Cloud detail: noise in (spiral angle on the circle, log radius), several scales.
    float cl = fbm(u * 2.0 + vec2(lr * 3.0, 0.0)) * 0.45 + fbm(ua * 1.5 + vec2(lr * 5.0, 3.0) + rough * 0.5 * u) * 0.35;
    cl += 0.3 * fbm(vec2(u * 6.0) + vec2(lr * 14.0, 7.0)) + 0.15 * noise2(u * 18.0 + vec2(lr * 40.0, 1.0));
    float dens = smoothstep(0.35 - 0.2 * clamp(densityP, 0.0, 1.0), 0.8, cl * 0.7 + band * 0.45);
    // The eye: clear and bright in the middle.
    float eyeR = 0.06 + 0.1 * clamp(eyeP, 0.0, 1.0);
    float eye = smoothstep(eyeR * 1.4, eyeR * 0.7, r);
    dens *= 1.0 - eye;
    vec3 lc = mix(vec3(0.55, 0.65, 0.85), vec3(0.95, 0.7, 0.35), mode);
    vec2 uv = u * (0.25 + 0.2 * r) + 0.5;
    vec3 ph = imgLod(uv, 1.5);
    vec3 cloudC = mix(lc * 0.35, ph * lc * 0.9, 0.5) * (0.4 + 0.8 * cl);
    // Lit from the eye: inner edges brighter.
    cloudC *= 0.6 + 0.8 * exp(-r * 2.0);
    vec3 skyC = glowColour(imgLod(vec2(0.5), 6.0), p, hueP * 0.159) * (0.4 + 0.8 * swell);
    vec3 col = mix(skyC * (0.2 + 0.8 * exp(-r * 4.0)), cloudC, dens);
    col += skyC * eye * 0.8;
    // Lightning: flickers in a wandering band sector.
    float sector = pow(0.5 + 0.5 * cos(a - 0.7 * sceneTime), 20.0);
    col += vec3(0.8, 0.85, 1.0) * kick * sector * dens * smoothstep(0.55, 0.8, cl) * 1.5;
    finish(col);
}
