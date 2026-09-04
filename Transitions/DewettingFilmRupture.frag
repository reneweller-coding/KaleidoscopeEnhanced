#version 330 core
out vec4 fragColor;
/**
 * @file DewettingFilmRupture.frag
 * @brief TRANSITION DEWETTING FILM RUPTURE: the outgoing scene is a thin film
 * that ruptures.  Holes nucleate, their rims thicken as they sweep material up,
 * the ligaments between them thin out and break, and the incoming scene is the
 * substrate underneath.
 *
 * The rim is the whole point.  A dewetting film does not simply vanish where a
 * hole opens: the material has to go somewhere, and it collects in a raised
 * ring around the hole that grows brighter and thicker as the hole widens.
 * Holes without rims read as a mask being erased; holes with rims read as a
 * liquid pulling itself apart.  So the rim here is a function of the hole's own
 * radius, and it is what carries the light.
 *
 * The holes sit on a jittered grid, which is what a nucleation field looks like
 * once the sites have repelled each other, and each has its own moment of
 * rupture -- fixed for the activation, never re-rolled.
 *
 * Audio Reactivity:
 *   audioFlux  -> how quickly new holes open (slow-ish, rate only)
 *   audioHigh  -> the light on the rims (light)
 *   audioSwell -> the rim's thickness (slow)
 *   audioKick  -> the flash of a ligament snapping (light)
 *
 * Per-activation variety: sitesP, rimP, hueP.
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
uniform float audioSubBass;
uniform float audioBass;
uniform float audioMid;
uniform float audioHigh;
uniform float audioFlux;
uniform float audioChromaHue;

uniform float sitesP;
uniform float rimP;
uniform float hueP;

const float PI = 3.14159265358979;

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float sites = 3.0 + floor(clamp(sitesP, 0.0, 1.0) * 4.0);   // rolled ONCE
    float rimW  = (rimP > 0.0) ? rimP : 1.0;
    float hue   = (hueP > 0.0) ? hueP : 0.0;

    float aspect = resolution.x / resolution.y;
    vec2  uv = gl_FragCoord.xy / resolution;
    vec2  p  = (uv - 0.5) * vec2(aspect, 1.0);

    float d   = clamp(1.0 - interpolation, 0.0, 1.0);
    float arc = sin(d * PI);

    // Rupture rate: the flux hurries the holes along but never reverses them.
    float rate = 0.75 + 0.5 * clamp(audioFlux * 2.0, 0.0, 1.0);

    // The nucleation field: a jittered grid, which is what sites look like once
    // they have repelled each other into place.
    float cell = 0.62 / sites;
    vec2  g = p / cell;
    vec2  gi = floor(g);

    float best = 1e9;          // distance to the nearest hole EDGE
    float bestR = 0.0;
    for (int j = -1; j <= 1; ++j)
    for (int i = -1; i <= 1; ++i)
    {
        vec2 id = gi + vec2(float(i), float(j));
        vec2 jitter = vec2(hash21(id + 3.1), hash21(id + 9.7)) - 0.5;
        vec2 c = (id + 0.5 + jitter * 0.8) * cell;
        float t0 = hash21(id + 21.3) * 0.55;                  // its moment, fixed
        float grow = smoothstep(t0, t0 + 0.70 / rate, d);
        // Holes open and keep opening; late in the turn they overlap and the
        // ligaments between them are gone.
        float r = cell * 1.15 * grow;
        float dist = length(p - c) - r;
        if (dist < best) { best = dist; bestR = r; }
    }

    // The film survives outside every hole.
    float film = smoothstep(-0.004, 0.006, best);
    film = mix(1.0, film, smoothstep(0.0, 0.04, d));       // unbroken at the start
    film = mix(film, 0.0, smoothstep(0.88, 1.0, d));          // nothing left at the end

    // The rim: material swept up at the hole's edge, thicker as the hole grows.
    float rw = (0.012 + 0.016 * clamp(audioSwell, 0.0, 1.0)) * rimW
             * (0.4 + 1.6 * clamp(bestR / max(cell, 1e-3), 0.0, 1.0));
    float rim = exp(-pow(max(best, 0.0) / max(rw, 1e-4), 2.0)) * film;

    vec3 sub = texture(tex1, uv).rgb;
    // The film is thin: it carries its own picture and a little of the substrate.
    vec3 flm = mix(texture(tex0, uv).rgb, sub, 0.12 * arc);
    // Where the rim has piled up, the film is thicker, so less shows through.
    flm = mix(flm, texture(tex0, uv).rgb, rim);

    vec3 col = mix(sub, flm, film);
    col += vec3(0.92, 0.95, 1.0) * rim * arc
         * (0.10 + 0.28 * clamp(audioHigh * 2.0, 0.0, 1.0));
    // A ligament snapping: the thinnest surviving film flashes.
    float ligament = film * smoothstep(0.030, 0.004, best) * (1.0 - rim);
    col += vec3(1.0, 0.94, 0.86) * ligament * arc * 0.30 * clamp(audioKick, 0.0, 1.0);
    // A hole's floor is wet: it keeps a faint sheen of the film's colour.
    col += mix(vec3(0.5), texture(tex0, uv).rgb, 0.5)
         * (1.0 - film) * exp(-max(-best, 0.0) * 26.0) * 0.14 * arc;

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
