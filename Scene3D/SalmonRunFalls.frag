#version 330 core
out vec4 fragColor;
/**
 * @file SalmonRunFalls.frag
 * @brief SALMON RUN FALLS (fragment): the step in the river where the
 * fish jump.  The chutes are white water with streaks running down them,
 * the pool below churns, spray hangs in the light, and the salmon are
 * silver with a red flank that catches the sun at the top of the arc.
 * The swell is how much water comes over, the treble the spray sparkle,
 * the kick lights the foam at the foot -- as light, never as motion.
 *
 * Audio Reactivity:
 *   audioSwell -> water volume and light (slow)
 *   audioHigh  -> spray sparkle (light)
 *   audioKick  -> foam flash at the foot (light)
 *   audioBass  -> the pool's depth colour (slow)
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
uniform float audioHigh;
uniform float audioKick;
uniform float audioBass;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float fishP;
uniform float chuteP;
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
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = p * 2.02 + 4.9; a *= 0.5; } return v; }

void main()
{
    float hue = (hueP > 0.001) ? hueP : 0.0;
    vec2 uv = vTexCoord;
    float flow = 0.5 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float clock = sceneAdvance * 0.9 + sceneTime * 0.18;
    vec3 col;

    if (vKind < -1.5)
    {
        // The pool: dark green water churning at the foot of the falls.
        vec2 puv = clamp(vec2(vWorld.x * 0.04 + 0.5, vWorld.z * 0.05), 0.0, 1.0);
        col = img(puv) * mix(vec3(0.2, 0.35, 0.3), imgPalette(hue * 0.159 + 0.45), 0.3);
        col *= 0.45 + 0.4 * bass;
        float churn = fbm(vec2(vWorld.x * 0.9, vWorld.z * 1.2 + clock * 0.8));
        // Foam: thickest right under the chutes, and the kick lights it.
        float foam = smoothstep(0.4, 0.8, churn) * smoothstep(3.0, 7.5, vWorld.z) * flow;
        col = mix(col, vec3(0.92, 0.96, 1.0), clamp(foam, 0.0, 0.9));
        col += vec3(1.0) * foam * (0.1 + 0.7 * audioKick);
        // Streaky surface wash flowing toward the camera.
        col *= 0.8 + 0.35 * fbm(vec2(vWorld.x * 2.0, vWorld.z * 0.6 - clock * 1.4));
    }
    else if (vKind < -0.5)
    {
        // Forest and sky above the falls.
        col = img(uv) * mix(vec3(0.35, 0.5, 0.35), imgPalette(hue * 0.159 + 0.35), 0.3);
        col = mix(col * 0.9, img(uv) * vec3(0.8, 0.88, 1.0) * 1.3, smoothstep(0.55, 0.95, uv.y));
        col *= 0.6 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    }
    else if (vKind > 3.5)
    {
        // The ledge rock: wet, dark, with the photo as its stone.
        col = img(clamp(vec2(uv.x, uv.y * 0.4 + 0.1), 0.0, 1.0))
            * mix(vec3(0.3, 0.28, 0.25), imgPalette(hue * 0.159 + 0.1), 0.25);
        col *= 0.5 + 0.55 * fbm(vec2(uv.x * 30.0, uv.y * 14.0));
        // Wet sheen near the lip.
        col *= 0.7 + 0.7 * smoothstep(0.55, 1.0, uv.y);
        col += vec3(0.7, 0.8, 0.85) * smoothstep(0.9, 1.0, uv.y) * 0.3 * flow;
    }
    else if (vKind > 2.5)
    {
        // A spray droplet: round, bright, fading as it falls back.
        vec2 d = (uv - 0.5) * 2.0;
        float r = length(d);
        if (r > 1.0) discard;
        float life = 4.0 * vAux * (1.0 - vAux);
        col = vec3(0.95, 0.98, 1.0) * (0.4 + 1.1 * life) * (1.0 - r * r * 0.6) * (0.5 + 0.9 * hi) * flow;
    }
    else if (vKind > 1.5)
    {
        // A chute: a sheet of white water with streaks running down it and
        // a glassy top where it leaves the lip.
        float across = abs(uv.x - 0.5) * 2.0;
        float down = 1.0 - uv.y;
        float streak = 0.5 + 0.5 * sin(uv.x * 90.0 + fbm(vec2(uv.x * 8.0, uv.y * 6.0 - clock * 2.2)) * 8.0);
        float white = smoothstep(0.1, 0.8, down);
        col = mix(mix(vec3(0.45, 0.6, 0.68), imgPalette(hue * 0.159 + 0.5), 0.3), vec3(0.95, 0.98, 1.0), white);
        col *= 0.55 + 0.55 * streak + 0.35 * white;
        col *= smoothstep(1.05, 0.55, across);                          // soft edges
        col *= 0.5 + 0.8 * flow;
        col += vec3(1.0) * smoothstep(0.92, 1.0, uv.y) * 0.5 * flow;    // the glassy lip
    }
    else if (vKind > 0.5)
    {
        // A salmon tail.
        vec2 d = (uv - 0.5) * 2.0;
        if (abs(d.y) > 0.35 + 0.65 * (0.5 + 0.5 * d.x)) discard;
        col = mix(vec3(0.45, 0.4, 0.42), imgPalette(hue * 0.159 + 0.05), 0.3);
        col *= 0.5 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    }
    else
    {
        // A salmon: silver flank, dark back, the red spawning stripe that
        // catches the light at the top of the arc.
        vec2 d = (uv - 0.5) * 2.0;
        float body = 1.0 - abs(d.x) * 0.9;
        if (abs(d.y) > body * 0.85) discard;
        col = mix(vec3(0.68, 0.7, 0.72), imgPalette(hue * 0.159 + 0.55), 0.2);
        col *= 0.5 + 0.7 * (1.0 - abs(d.y) / max(body, 1e-3));
        col = mix(col, col * vec3(0.3, 0.35, 0.4), smoothstep(0.1, 0.75, d.y));
        // The stripe.
        col = mix(col, mix(vec3(0.75, 0.18, 0.14), imgPalette(hue * 0.159 + 0.02), 0.3),
                  smoothstep(0.45, 0.0, abs(d.y + 0.1)) * 0.7);
        // Wet highlight, strongest at the top of the leap.
        float top = 4.0 * vAux * (1.0 - vAux);
        col += vec3(1.0, 0.98, 0.9) * smoothstep(0.5, 0.0, abs(d.y - 0.3)) * (0.2 + 0.7 * top) * 0.8;
        col *= 0.6 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    }
    // Mist over everything, thicker near the falls.
    float mist = smoothstep(4.0, 9.0, vWorld.z) * (0.2 + 0.3 * flow);
    vec3 mistCol = mix(vec3(0.8, 0.85, 0.88), imgPalette(hue * 0.159 + 0.55), 0.25) * (0.6 + 0.5 * clamp(audioSwell, 0.0, 1.0));
    col = mix(col, mistCol, clamp(mist, 0.0, 0.6) * step(-1.5, vKind));
    col *= 0.85 + 0.3 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
