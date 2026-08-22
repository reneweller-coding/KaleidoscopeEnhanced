#version 330 core
/**
 * @file CherenkovCascadeShower.vert
 * @brief Vertex stage companion to CherenkovCascadeShower.frag -- see that file's header for
 * this scene's description.
 *
 * Audio Reactivity:
 *   audioAdvance  -> shower generation cycle (pre-integrated, jump-free)
 *   audioKick     -> shockwave explosion + particle size surge
 *   audioHigh     -> overall Cherenkov emission gain
 *   audioChromaHue-> rotates the cyan/ultraviolet track palette
 *   audioSpread   -> spatial spread of the cascade cone (narrow spectrum =
 *                    collimated pencil beam, broadband = wide fan)
 *   audioRoughness-> dissonance scatters tracks off their clean Lorentz helices
 *   audioHat      -> hi-hats/cymbals spark a subset of tracks bigger + white
 */
// CherenkovCascadeShower.vert — 60,000 relativistic particle collision tracks
// in heavy water with glowing cyan Cherenkov radiation and magnetic deflection.
//   attrA.x = particle ID, attrA.y = seed, attrA.zw = track params

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;

uniform float audioAdvance;
uniform float audioKick;
uniform float audioBass;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioHigh;
uniform float audioSpread;      // narrow spectrum = collimated, wide = fanned out
uniform float audioRoughness;   // sensory dissonance -> track scatter
uniform float audioHat;         // hi-hat / cymbal onset envelope

uniform float cascadeP;
uniform float fieldP;
uniform float speedP;
uniform float hueP;

out vec4 vCol;
out vec2 vUV;

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

void main() {
    float pi   = attrA.x; // particle index 0..59999
    vec4 seeds = attrB;

    float csc = (cascadeP > 0.0) ? cascadeP : 1.0;
    float fld = (fieldP   > 0.0) ? fieldP   : 1.0;
    float spd = (speedP   > 0.0) ? speedP   : 1.0;
    float hue = (hueP     > 0.0) ? hueP     : 0.0;

    // Shower generation cycle
    float cycle = fract(seeds.x + time * 0.4 * spd + audioAdvance * 0.2);
    float sDist = cycle * 12.0 * csc;

    // Cone opening angle — the SPECTRAL spread sets the shower's spatial
    // spread: a narrow, pure spectrum collimates the cascade into a tight
    // pencil beam, a rich broadband one fans it out across the tank.
    float coneAngle = seeds.y * 6.2831853;
    float spread = (0.25 + 0.5 * seeds.z) * cycle * (0.75 + 0.55 * audioSpread);

    // Magnetic field Lorentz curvature (helical spiral track)
    float charge = (seeds.w > 0.5) ? 1.0 : -1.0;
    float lorentzAngle = coneAngle + cycle * 4.0 * fld * charge;

    vec3 worldP = vec3(
        cos(lorentzAngle) * spread * 6.0,
        sin(lorentzAngle) * spread * 6.0,
        sDist - 6.0
    );

    // Dissonant clusters scatter the tracks off their clean helical paths —
    // consonant harmony lets every particle ride its Lorentz spiral cleanly.
    float jitter = audioRoughness * 0.55;
    worldP.xy += vec2(sin(seeds.x * 91.7 + cycle * 17.0),
                      cos(seeds.y * 73.3 + cycle * 13.0)) * jitter * spread * 3.0;

    // Kick shockwave explosion
    worldP += normalize(worldP + vec3(0.001)) * audioKick * 2.0 * exp(-cycle * 3.0);

    // Camera space
    vec3 camPos = vec3(0.0, 0.0, -10.0);
    vec3 relP = worldP - camPos;
    relP.x -= eyeOff;

    gl_Position = projM * vec4(relP.x, relP.y, -relP.z, 1.0);
    gl_Position.x += eyeOff * 0.045 * gl_Position.w;

    // Point size attenuation — hi-hats/cymbals spark a scattered SUBSET of the
    // tracks into brief bright grains (bounded, so the frame cannot flood).
    float hatSpark = min(audioHat, 1.0) * step(0.62, seeds.z) * (1.0 - cycle);
    gl_PointSize = (7.0 + 12.0 * audioKick * (1.0 - cycle) + 4.5 * hatSpark)
                 * (1.0 / max(gl_Position.w * 0.1, 0.5));

    vUV = vec2(seeds.x, seeds.y);

    // Pure Cherenkov cyan / ultraviolet electric color
    vec3 cherenkovCyan = vec3(0.05, 0.85, 1.0);
    vec3 cherenkovWhite = vec3(0.9, 0.98, 1.0);
    vec3 col = mix(cherenkovCyan, cherenkovWhite, exp(-cycle * 4.0));
    // Cymbal hits also flash those sparked tracks toward pure white.
    col = mix(col, cherenkovWhite, hatSpark * 0.35);

    if (audioChromaHue != 0.0) col = hueRot(col, audioChromaHue);
    if (hue > 0.001) col = hueRot(col, hue);

    vCol = vec4(col * (1.0 + audioHigh * 1.2), 1.0 - cycle);
}
