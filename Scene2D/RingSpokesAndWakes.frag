#version 330 core
out vec4 fragColor;
/**
 * @file RingSpokesAndWakes.frag
 * @brief RING SPOKES AND WAKES: the rings of Saturn seen from above the
 * plane, the planet's limb at one edge.  Thirty-two ringlets whose
 * density is the spectrum (bass innermost); tiny moons on their orbits
 * raise wakes -- wavy edges that trail behind them -- and the dark radial
 * spokes rotate with the ring, lit by the kick.  The whole ring turns
 * steadily on the scene clock (differentially: inner faster).  The photo
 * tints the ring particles.  Camera still.
 *
 * Audio Reactivity:
 *   audioSpectrum[32] -> ringlet density (light)
 *   sceneAdvance      -> rotation, moon orbits, wakes (continuous)
 *   audioKick         -> spokes flash (light)
 *   audioSwell        -> sunlight (slow)
 *   audioLevel        -> brightness
 *
 * Per-activation variety: tiltP, moonsP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSpectrum[32];
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float tiltP;
uniform float moonsP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  col = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float g   = dot(col, vec3(0.333));
    return mix(vec3(g), col, 0.55 + 0.45 * audioValence);
}

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float tilt = 0.35 + 0.35 * clamp(tiltP, 0.0, 1.0);        // view elevation: y squashed
    int nMoons = 2 + int(clamp(moonsP, 0.0, 1.0) * 3.0);
    float sun = 1.0 + 0.5 * clamp(audioSwell, 0.0, 1.0);
    float clock = sceneAdvance * 0.3 + sceneTime * 0.06;

    // Ring plane coordinates: the planet centre off to the lower left.
    vec2 centre = vec2(-0.35 * aspect, -0.55);
    vec2 q = (p - centre) / vec2(1.0, tilt);
    float r = length(q);
    float a = atan(q.y, q.x);
    float rIn = 0.55, rOut = 1.55;

    // Space background with round stars.
    vec3 col = vec3(0.005, 0.006, 0.012);
    vec2 su = p * 90.0; vec2 sc = floor(su); vec2 sf = fract(su) - 0.5;
    vec2 so = vec2(hash21(sc + 1.3), hash21(sc + 5.9)) - 0.5;
    col += vec3(0.7) * smoothstep(0.14, 0.03, length(sf - so * 0.6)) * step(0.985, hash21(sc));

    // The planet: a banded disc inside rIn (in plane coordinates it is a
    // sphere: use the screen-space distance).
    float pr = length((p - centre) / vec2(1.0, 1.0));
    float planet = smoothstep(0.5, 0.495, pr);
    float bands = 0.5 + 0.5 * sin((p.y - centre.y) * 30.0 + sin((p.x - centre.x) * 3.0));
    vec3 planetCol = mix(vec3(0.85, 0.75, 0.55), imgPalette(hue * 0.159 + 0.1), 0.3) * (0.6 + 0.3 * bands);
    planetCol *= 0.4 + 0.7 * sqrt(max(1.0 - pr * pr / 0.25, 0.0)) * sun;

    // Rings: ringlet index from radius; density from the band; differential
    // rotation for the particle texture; the Cassini gap.
    vec3 ringCol = vec3(0.0); float ringA = 0.0;
    if (r > rIn && r < rOut)
    {
        float u = (r - rIn) / (rOut - rIn);                 // 0..1 across the rings
        float fb = u * 31.0;
        int b0 = int(floor(fb)); int b1 = min(b0 + 1, 31);
        float e = mix(clamp(audioSpectrum[b0] * 1.6, 0.0, 1.0), clamp(audioSpectrum[b1] * 1.6, 0.0, 1.0), fract(fb));
        float ringlet = 0.5 + 0.5 * sin(u * 6.2831853 * 32.0);
        float gap = smoothstep(0.03, 0.0, abs(u - 0.62) - 0.03);
        float omega = 0.8 / pow(r, 1.5);                   // Kepler
        float texA = a - clock * omega;
        float grain = hash21(floor(vec2(texA * 60.0, u * 120.0)));
        // Moon wakes: wavy displacement of the density trailing each moon.
        float wake = 0.0;
        for (int m = 0; m < 5; ++m)
        {
            if (m >= nMoons) break;
            float fm = float(m);
            float rm = rIn + (0.15 + 0.7 * hash11(fm * 3.3)) * (rOut - rIn);
            float am = clock * 0.8 / pow(rm, 1.5) + hash11(fm * 5.1) * 6.28;
            float da = mod(a - am + 3.14159, 6.2831853) - 3.14159;     // angle behind the moon (negative = trailing)
            float trail = smoothstep(0.0, -2.5, da) * exp(da * 0.6);
            wake += trail * sin(da * 14.0) * exp(-abs(r - rm) * 12.0) * 0.5;
            // The moon itself: a round bright dot.
            vec2 mp = centre + vec2(cos(am) * rm, sin(am) * rm * tilt);
            col += vec3(0.9, 0.85, 0.75) * smoothstep(0.012, 0.006, length(p - mp)) * sun;
        }
        float dens = clamp((0.65 + 0.45 * e) * (0.7 + 0.3 * ringlet) * (1.0 - gap * 0.85) * (1.0 + wake) * (0.75 + 0.25 * grain), 0.0, 1.2);
        // Spokes: radial dark streaks corotating, flashing bright on the kick.
        float spokeA = a - clock * 0.55;
        float spoke = pow(0.5 + 0.5 * sin(spokeA * 9.0 + sin(spokeA * 3.0) * 1.5), 12.0) * smoothstep(0.35, 0.55, u) * (1.0 - smoothstep(0.75, 0.95, u));
        vec3 particleCol = mix(vec3(0.95, 0.9, 0.8), img(fract(vec2(texA * 0.3, u * 2.0))) * 1.3, 0.35) * sun * 1.5;
        particleCol = mix(particleCol, particleCol * imgPalette(hue * 0.159 + 0.5) * 1.6, 0.2);
        ringCol = particleCol * dens * (1.0 - spoke * 0.6) + imgPalette(hue * 0.159 + 0.9) * spoke * audioKick * 1.5;
        ringA = clamp(dens + spoke * audioKick, 0.0, 1.0);
        // The planet's shadow across the rings.
        float shadow = smoothstep(0.1, 0.0, abs(a - 2.6)) * smoothstep(1.0, 0.7, r);
        ringCol *= 1.0 - shadow * 0.8;
    }
    // Compose: the rings behind the planet where they pass behind it (upper
    // half), in front where below.
    bool behind = (q.y > 0.0);
    if (behind) { col = mix(col, ringCol, ringA); col = mix(col, planetCol, planet); }
    else        { col = mix(col, planetCol, planet); col = mix(col, ringCol, ringA); }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
