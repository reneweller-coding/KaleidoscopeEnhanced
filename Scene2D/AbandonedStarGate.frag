#version 330 core
out vec4 fragColor;
/**
 * @file AbandonedStarGate.frag
 * @brief ABANDONED STAR GATE: A massive, ancient and corroded ring structure
 * drifting in deep space. It occasionally sparks with unstable, violent wormhole
 * energy that pulses to the music.
 *   audioAdvance -> slow drifting past the structure
 *   audioKick    -> violent energy sparks and unstable wormhole flashes
 *   audioSwell   -> ambient brightness of the dormant energy ring
 *   audioChromaHue-> palette offset for the wormhole energy
 *
 * Per-activation variety:
 *   rustP float amount of corrosion and damage (0.5..1.5)
 *   sparkP float intensity of the unstable energy (0.5..2.0)
 *   hueP float palette offset (0..6.28)
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioChromaHue;

uniform float rustP;
uniform float sparkP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = i.x + i.y * 57.0 + i.z * 113.0;
    return mix(
        mix(mix(hash11(n + 0.0), hash11(n + 1.0), f.x),
            mix(hash11(n + 57.0), hash11(n + 58.0), f.x), f.y),
        mix(mix(hash11(n + 113.0), hash11(n + 114.0), f.x),
            mix(hash11(n + 170.0), hash11(n + 171.0), f.x), f.y), f.z);
}

float fbm(vec3 p) {
    float f = 0.0, a = 0.5;
    for(int i = 0; i < 5; i++) { f += a * noise(p); p *= 2.0; a *= 0.5; }
    return f;
}

void main()
{
    float rp = (rustP > 0.01 ? rustP : 1.0);
    float sp = (sparkP > 0.01 ? sparkP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    // The gate is viewed slightly off-center and tilted
    float tilt = 0.3 * sin(time * 0.1);
    mat2 rotM = mat2(cos(tilt), -sin(tilt), sin(tilt), cos(tilt));
    vec2 p = rotM * uv;

    // Slow drift of the camera past the structure
    vec2 offset = vec2(sin(time * 0.05 + audioAdvance * 0.5) * 0.2, cos(time * 0.07) * 0.2);
    p += offset;

    // Perspective approximation for a 3D ring
    float ySquash = 2.0; // Squashes Y to make it look like it's tilted away in 3D
    vec2 ringP = vec2(p.x, p.y * ySquash);

    float distToCenter = length(ringP);
    float angle = atan(ringP.y, ringP.x);

    float ringRadius = 0.6;
    float ringThickness = 0.1;

    vec3 col = vec3(0.0);

    vec3 gateCol = vec3(0.15, 0.12, 0.1); // Rusted dark metal
    vec3 energyCol = imgPalette(0.8 + audioCentroid * 0.1);

    // Background Space
    float bgNoise = fbm(vec3(p * 5.0, 0.0));
    col += vec3(0.02, 0.01, 0.03) * bgNoise * (1.0 + audioSwell); // Faint nebula dust

    float ringDist = abs(distToCenter - ringRadius);

    // Render the physical ring structure
    if (ringDist < ringThickness) {
        // Detailed surface texture (rust, panels, damage)
        float surfaceDetail = fbm(vec3(angle * 10.0, distToCenter * 20.0, 0.0));
        float panels = step(0.9, fract(angle * 15.0)); // Radial panel gaps

        vec3 localCol = mix(gateCol, vec3(0.05), surfaceDetail * rp) * 2.2;
        localCol *= (1.0 - panels * 0.5);

        // Lighting from ambient stars + faint internal glow
        float lighting = 0.9 + 0.5 * sin(angle * 2.0 + time);
        localCol *= lighting;

        // Damage/holes in the ring
        float damage = smoothstep(0.4, 0.6, fbm(vec3(angle * 5.0, distToCenter * 5.0, 10.0)));
        if (damage * rp > 0.6) {
            localCol = vec3(0.0); // hole
        } else {
            col = localCol;
        }

        // Residual glowing circuitry on the ring (dormant until kick)
        float circuitry = step(0.95, fbm(vec3(angle * 30.0, distToCenter * 40.0, 0.0)));
        col += energyCol * circuitry * (0.2 + audioSwell * 0.5);
    }

    // Unstable Wormhole Energy sparking in the center and along the inner edge
    if (distToCenter < ringRadius + 0.02) {
        // Event horizon / tear in spacetime
        float tear = fbm(vec3(ringP * 3.0, time * 2.0 + audioAdvance * 5.0));

        // Intensity spikes on audioKick (violent unstable sparking)
        float sparkTrigger = step(0.95, hash11(floor(time * 8.0) + floor(angle * 5.0)));   // was 10 Hz
        float sparkInt = sparkTrigger * audioKick * 10.0 * sp;

        // Energy arcs jumping across the inner radius
        float arc = smoothstep(0.45, 0.75, tear) * exp(-(ringRadius - distToCenter) * 10.0);

        col += energyCol * arc * (0.9 + sparkInt + audioSwell * 1.5);

        // Occasional violent flash filling the center (failed opening attempt)
        float massiveFlash = step(0.98, hash11(floor(time * 2.0)));
        col += energyCol * massiveFlash * audioKick * 5.0 * sp * exp(-distToCenter * 5.0);
    }

    // Lens flare / Glare from sparks
    float glare = exp(-distToCenter * 2.0) * audioKick * 0.5 * sp;
    col += energyCol * glare;

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    // Soft-knee exposure
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
