#version 330 core
out vec4 fragColor;
/**
 * @file MangroveRootsTide.frag
 * @brief MANGROVE ROOTS TIDE (fragment): standing in the shallows among
 * prop roots.  Light comes down through the surface as a moving net of
 * caustics that lands on the bed and on every root; the water is green
 * and thickens with distance; fish flicker silver as they turn.  The tide
 * level rides the swell, the bass is the depth colour, the treble the
 * caustic sparkle, the kick a fish flashing its flank.
 *
 * Audio Reactivity:
 *   audioSwell -> tide level and light (slow)
 *   audioBass  -> water colour and depth (slow)
 *   audioHigh  -> caustic sparkle (light)
 *   audioKick  -> a fish flank flash (light)
 *   audioLevel -> brightness
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioBass;
uniform float audioHigh;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float treesP;
uniform float fishP;
uniform float hueP;

in vec2  vTexCoord;
in vec3  vWorld;
in float vKind;
in float vAux;
in float vId;

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

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 5.7; a *= 0.5; } return v; }

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    vec2 uv = vTexCoord;
    float light = 0.55 + 0.65 * clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float clock = sceneAdvance * 0.5 + sceneTime * 0.1;
    // The caustic net: the same field everywhere, sampled by world xz, so
    // it lies consistently across bed, roots and fish.
    float ca = fbm(vWorld.xz * 1.4 + vec2(clock * 0.5, clock * 0.3));
    float caustic = pow(smoothstep(0.42, 0.85, ca), 2.0);
    vec3 col;

    if (vKind < -1.5)
    {
        // The bed: silt and shell from the photo, with the caustics on it.
        col = img(clamp(vec2(vWorld.x * 0.03 + 0.5, vWorld.z * 0.025), 0.0, 1.0))
            * mix(vec3(0.42, 0.4, 0.3), imgPalette(hue * 0.159 + 0.2), 0.3);
        col *= 0.55 + 0.5 * fbm(vWorld.xz * 4.0);
        col += mix(vec3(1.0, 0.98, 0.8), imgPalette(hue * 0.159 + 0.15), 0.25) * caustic * light * 0.9;
    }
    else if (vKind < -0.5)
    {
        // The canopy above and beyond the water: bright green, blown out.
        col = img(uv) * mix(vec3(0.5, 0.8, 0.45), imgPalette(hue * 0.159 + 0.35), 0.3) * light * 1.2;
        col = mix(col, vec3(0.85, 0.95, 0.8) * light, smoothstep(0.45, 0.95, uv.y) * 0.6);
    }
    else if (vKind > 3.5)
    {
        // The surface seen from below: a bright pane with the caustic net
        // and the mirrored bed near the edges (total internal reflection).
        col = mix(vec3(0.55, 0.8, 0.75), imgPalette(hue * 0.159 + 0.45), 0.3) * light;
        col *= 0.5 + 0.7 * caustic;
        col += vec3(1.0) * pow(caustic, 2.0) * (0.3 + 0.9 * hi) * 0.6;
        col *= 0.35 + 0.5 * exp(-max(vWorld.z - 6.0, 0.0) * 0.06);
    }
    else if (vKind > 2.5)
    {
        // A floating leaf, seen from below as a dark shape against the light.
        vec2 d = (uv - 0.5) * 2.0;
        if (abs(d.x) + abs(d.y) * 1.6 > 1.0) discard;
        col = mix(vec3(0.12, 0.2, 0.1), imgPalette(hue * 0.159 + 0.3) * 0.3, 0.35) * light;
        col += vec3(0.6, 0.75, 0.5) * smoothstep(0.9, 1.0, abs(d.x) + abs(d.y) * 1.6) * 0.5;
    }
    else if (vKind > 1.5)
    {
        // A fish tail: translucent, catching the caustics.
        vec2 d = (uv - 0.5) * 2.0;
        if (abs(d.y) > 0.35 + 0.65 * (0.5 + 0.5 * d.x)) discard;
        col = mix(vec3(0.55, 0.6, 0.55), imgPalette(hue * 0.159 + 0.5), 0.3) * light;
        col *= 0.4 + 0.8 * caustic;
    }
    else if (vKind > 0.5)
    {
        // A fish body: a silver spindle with a dark back and a flank that
        // flashes on the kick.
        vec2 d = (uv - 0.5) * 2.0;
        float body = 1.0 - abs(d.x);
        if (abs(d.y) > body * 0.9) discard;
        col = mix(vec3(0.62, 0.66, 0.68), imgPalette(hue * 0.159 + 0.55), 0.25) * light;
        col *= 0.5 + 0.7 * (1.0 - abs(d.y) / max(body, 1e-3));
        col = mix(col, col * vec3(0.35, 0.4, 0.45), smoothstep(0.1, 0.7, d.y));   // dark back
        col += vec3(1.0, 0.98, 0.95) * smoothstep(0.5, 0.0, abs(d.y + 0.15)) * (0.15 + 1.1 * audioKick) * 0.6;
        col += vec3(1.0) * caustic * 0.35;
    }
    else
    {
        // A root: dark bark, wet where it enters the water, with the
        // caustic net running over it.
        float across = abs(uv.x - 0.5) * 2.0;
        col = mix(vec3(0.24, 0.16, 0.11), imgPalette(hue * 0.159 + 0.1) * 0.4, 0.3);
        col *= 0.4 + 0.85 * sqrt(max(1.0 - across * across, 0.0));
        col *= 0.7 + 0.5 * fbm(vec2(uv.y * 24.0, vId));
        col += mix(vec3(1.0, 0.95, 0.8), imgPalette(hue * 0.159 + 0.15), 0.25) * caustic * light * 0.5;
        col *= light;
    }
    // Water column: green, thickening with distance and with the bass.
    float depth = max(vWorld.z, 0.0);
    vec3 waterCol = mix(vec3(0.1, 0.3, 0.28), imgPalette(hue * 0.159 + 0.45) * 0.4, 0.35);
    float thick = 1.0 - exp(-depth * (0.035 + 0.03 * bass));
    col = mix(col, waterCol * light, clamp(thick, 0.0, 0.9));
    // Suspended particles: round motes lit by the caustics.
    vec2 mg = vec2(vWorld.x * 2.5, vWorld.y * 2.5 + clock * 0.2);
    vec2 mc = floor(mg), mf = fract(mg) - 0.5;
    vec2 mj = vec2(hash21(mc + 1.9), hash21(mc + 7.3)) - 0.5;
    float mote = smoothstep(0.2, 0.06, length(mf - mj * 0.7)) * step(0.92, hash21(mc));
    col += vec3(0.9, 1.0, 0.9) * mote * (0.1 + 0.8 * caustic) * (0.3 + 0.6 * hi);
    col *= 0.85 + 0.3 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
