#version 330 core
out vec4 fragColor;
/**
 * @file CapillaryFlight.frag
 * @brief CAPILLARY FLIGHT: a flight through a blood capillary.  The vessel
 * wall is a soft, translucent tube lit from within; red cells stream past
 * on the scene clock as objects (discs that tumble); the pulse is LIGHT --
 * the wall flushes with the sub-bass, never moves.  Branching side vessels
 * pass as dark mouths in the wall.  The camera flies steadily.
 *
 * Audio Reactivity:
 *   sceneAdvance -> flight and cell flow (continuous)
 *   audioSubBass -> wall flush (light)
 *   audioKick    -> cells brighten as they pass (light)
 *   audioSwell   -> vessel glow (slow)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: cellsP (cell density), speedP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSubBass;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float cellsP;
uniform float speedP;
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
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float travel = sceneAdvance * 1.8 * (speedP > 0.05 ? speedP : 1.0) + sceneTime * 0.35;
    float dens = 0.5 + 0.5 * clamp(cellsP, 0.0, 1.0);

    // The vessel: a tube; the wall's radius varies slowly along z (the
    // vessel bends and narrows), never with the beat.
    float r = length(p);
    float a = atan(p.y, p.x);
    float depth = 1.0 / max(r, 0.02);
    float z = depth + travel;
    float wallR = 1.0 + 0.12 * sin(z * 0.35) + 0.06 * sin(z * 0.9 + a * 2.0);
    float rr = r / wallR;
    float depthW = 1.0 / max(rr, 0.02);
    float zw = depthW + travel;

    // Wall: translucent tissue, veins of the photo, a flush on the sub-bass.
    vec3 tissue = mix(vec3(0.55, 0.12, 0.12), imgPalette(hue * 0.159 + 0.05), 0.4);
    float fibres = 0.6 + 0.4 * noise2(vec2(a * 6.0, zw * 0.8));
    vec2 uv = vec2(fract(a * 0.15915494 * 2.0), fract(zw * 0.06));
    vec3 wall = tissue * fibres * (0.6 + 0.5 * img(uv));
    wall *= 1.0 + 0.6 * clamp(audioSubBass, 0.0, 1.0);
    // Side vessels: dark mouths in the wall at intervals.
    float mouth = 0.0;
    for (int k = 0; k < 4; ++k)
    {
        float fk = float(k);
        float zk = floor(zw / 7.0 + fk * 0.25) * 7.0 - fk * 0.25 * 7.0;
        float ak = hash11(zk * 1.3 + fk) * 6.2831853;
        float dA = atan(sin(a - ak), cos(a - ak));
        mouth += exp(-(dA * dA * 6.0 + (zw - zk - 3.5) * (zw - zk - 3.5) * 0.8));
    }
    wall = mix(wall, tissue * 0.15, clamp(mouth, 0.0, 0.85));
    // Light: from ahead, warm; fog is the plasma, dim.
    float fog = 1.0 - exp(-depthW * 0.09);
    vec3 col = mix(wall, tissue * 0.5, clamp(fog, 0.0, 0.92)) * (0.6 + 0.5 * audioLevel);
    col += imgPalette(hue * 0.159 + 0.1) * exp(-rr * 5.0) * (0.3 + 0.6 * clamp(audioSwell, 0.0, 1.0));

    // Red cells: discs streaming down the tube in the near half, each on its
    // own lane (angle, radius) and phase; tumbling as objects.
    vec3 cellCol = vec3(0.85, 0.15, 0.12);
    for (int k = 0; k < 14; ++k)
    {
        float fk = float(k);
        if (hash11(fk * 4.4) > dens) continue;
        float lane = hash11(fk * 3.1) * 6.2831853;
        float laneR = 0.35 + 0.5 * hash11(fk * 5.7);
        float ph = fract(travel * (0.18 + 0.1 * hash11(fk * 7.9)) + hash11(fk * 9.3));
        float zc = 1.0 + 12.0 * (1.0 - ph);                    // from far to near
        // Project the cell: its screen position and size from its depth.
        float sr = laneR / zc;
        vec2 cpos = vec2(cos(lane), sin(lane)) * sr;
        float size = 0.09 / zc;
        vec2 d = p - cpos;
        // Tumble: an ellipse whose axis turns with the phase.
        float tumble = ph * 12.0 + fk;
        vec2 ax = vec2(cos(tumble), sin(tumble));
        float e1 = dot(d, ax) / size, e2 = dot(d, vec2(-ax.y, ax.x)) / (size * (0.55 + 0.45 * abs(sin(tumble * 0.7))));
        float disc = 1.0 - smoothstep(0.85, 1.0, e1 * e1 + e2 * e2);
        float dimple = 1.0 - 0.35 * exp(-(e1 * e1 + e2 * e2) * 4.0);
        float near = 1.0 - smoothstep(0.0, 0.05, ph);            // fade out as it passes the camera
        vec3 cc = cellCol * dimple * (0.7 + 0.6 * audioKick) * (0.5 + 0.5 * (1.0 - ph));
        col = mix(col, cc, disc * (1.0 - near) * (1.0 - smoothstep(10.0, 13.0, zc)));
    }

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
