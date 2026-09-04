#version 330 core
out vec4 fragColor;
/**
 * @file WeldingArcSeam.frag
 * @brief WELDING ARC SEAM: a torch running a seam across a steel plate on
 * the scene clock.  Ahead of it the bare plate (the photo as mill scale),
 * behind it the finished bead -- ripples of solidified metal cooling from
 * white through orange to blue temper colours.  The arc is a small violent
 * core with a wide glow; round sparks fly off it; the visor tint darkens
 * as the level rises, which is what a self-darkening helmet does.
 * Camera fixed on the plate.
 *
 * Audio Reactivity:
 *   sceneAdvance -> the torch travels, sparks fly (continuous)
 *   audioLevel   -> visor darkening (slow, inverse brightness)
 *   audioHigh    -> spark rate and glitter (light)
 *   audioBass    -> arc size and heat (light)
 *   audioKick    -> a spatter burst (light)
 *
 * Per-activation variety: speedP, sparkP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioLevel;
uniform float audioHigh;
uniform float audioBass;
uniform float audioKick;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioValence;

uniform float speedP;
uniform float sparkP;
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

// Steel glow by temperature t in 0..1 (0 = cold, 1 = the arc).
vec3 heat(float t)
{
    t = clamp(t, 0.0, 1.0);
    vec3 c = mix(vec3(0.35, 0.05, 0.02), vec3(1.0, 0.35, 0.05), smoothstep(0.0, 0.45, t));
    c = mix(c, vec3(1.0, 0.85, 0.45), smoothstep(0.45, 0.8, t));
    return mix(c, vec3(1.0, 1.0, 0.95), smoothstep(0.8, 1.0, t));
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float speed = 0.5 + 0.6 * clamp(speedP, 0.0, 1.0);
    float sparks = 0.4 + 0.9 * clamp(sparkP, 0.0, 1.0);
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float clock = sceneAdvance * speed + sceneTime * 0.12;
    // The torch position: a steady sweep left to right on the clock, with a
    // gentle weave, and it wraps.  The seam line sits a little below centre.
    float travel = fract(clock * 0.16);
    float tx = (travel - 0.5) * aspect * 1.7;
    float seamY = -0.06 + 0.02 * sin(p.x * 3.0 + clock * 0.2);
    vec2 torch = vec2(tx, seamY + 0.02 * sin(clock * 2.0));

    // The plate: mill scale from the photo, bluish grey, with a brushed grain.
    vec3 plate = img(uv * vec2(1.0, 0.6) + vec2(0.0, 0.2)) * mix(vec3(0.55, 0.58, 0.62), imgPalette(hue * 0.159 + 0.55), 0.3);
    plate *= 0.75 + 0.3 * hash21(floor(vec2(p.x * 400.0, p.y * 40.0)));
    vec3 col = plate * 1.15 + 0.05;
    // Distance to the seam line, and how far behind the torch we are.
    float dSeam = abs(p.y - seamY);
    float behind = tx - p.x;                                          // >0 = already welded
    // The bead: ripples of frozen metal, wider than the seam, only behind.
    float beadW = 0.05 + 0.016 * bass;
    float onSeam = smoothstep(beadW, beadW * 0.55, dSeam);
    float welded = smoothstep(0.0, 0.02, behind);
    float ripple = 0.5 + 0.5 * cos((p.x - tx) * 160.0);
    // Cooling: white at the torch, orange, then temper blues far behind.
    float coolT = exp(-max(behind, 0.0) * 6.0);
    vec3 bead = heat(coolT * (0.85 + 0.3 * bass)) * (0.75 + 0.35 * ripple);
    // Temper colours on the cooled part: a thin oxide rainbow beside the bead.
    float temper = exp(-max(behind, 0.0) * 1.6) * smoothstep(beadW * 2.6, beadW, dSeam) * (1.0 - onSeam);
    vec3 temperCol = mix(vec3(0.55, 0.35, 0.15), imgPalette(hue * 0.159 + 0.62), 0.45);
    col = mix(col, bead, onSeam * welded);
    col += temperCol * temper * welded * 0.8;
    // Heat haze glow around the whole hot stretch.
    col += heat(0.55) * exp(-dSeam * 7.0) * coolT * welded * 0.9;
    // The arc: a small core plus a wide glow.  Bright, but its size is on
    // the bass and its flicker on the treble -- never a whole-frame flash.
    float dArc = length((p - torch) * vec2(1.0, 1.25));
    float core = smoothstep(0.022 + 0.008 * bass, 0.0, dArc);
    float glow = exp(-dArc * 5.5);
    vec3 arcCol = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.95, 0.85), 0.4);
    col += arcCol * core * 2.6;
    col += arcCol * glow * (0.9 + 0.6 * bass) * (0.9 + 0.25 * hi);
    // The electrode holder: a dark wedge coming down from the top right.
    vec2 rod = p - torch;
    float alongRod = clamp(dot(rod, normalize(vec2(0.55, 1.0))), 0.0, 0.6);
    float acrossRod = length(rod - normalize(vec2(0.55, 1.0)) * alongRod);
    float holder = smoothstep(0.02, 0.014, acrossRod) * step(0.03, alongRod);
    col = mix(col, vec3(0.08, 0.08, 0.09) * (0.5 + alongRod), holder);
    col += heat(0.9) * smoothstep(0.05, 0.02, alongRod) * smoothstep(0.02, 0.0, acrossRod) * 1.2;
    // Sparks: round, jittered cells thrown forward and down from the arc,
    // their life a continuous phase so nothing pops into being.
    for (int layer = 0; layer < 3; ++layer)
    {
        float fl = float(layer);
        float n = 14.0 + fl * 8.0;
        for (int i = 0; i < 10; ++i)
        {
            float fi = float(i) + fl * 10.0;
            float ph = fract(clock * (0.9 + 0.5 * hash11(fi * 1.7)) + hash11(fi * 3.3));
            float ang = (hash11(fi * 5.1) - 0.5) * 2.6 - 1.2;
            float sp = 0.35 + 0.5 * hash11(fi * 7.7);
            vec2 sPos = torch + vec2(cos(ang), sin(ang)) * sp * ph + vec2(0.0, -0.55 * ph * ph);
            float d = length(p - sPos);
            float life = (1.0 - ph) * smoothstep(0.0, 0.06, ph);
            float sz = 0.006 + 0.004 * hash11(fi * 9.1);
            float dot_ = smoothstep(sz, sz * 0.25, d);
            col += heat(0.55 + 0.45 * (1.0 - ph)) * dot_ * life * (0.7 + 0.9 * hi) * sparks * 1.6;
            // A short trail behind each spark, along its own direction.
            col += heat(0.5) * smoothstep(sz * 2.5, 0.0, d) * life * 0.25 * sparks;
        }
    }
    // The kick is a spatter: a ring of extra round droplets near the arc.
    for (int i = 0; i < 8; ++i)
    {
        float fi = float(i);
        float a = fi * 0.7853982 + hash11(fi) * 0.4;
        float rr = 0.05 + 0.09 * hash11(fi * 2.3);
        float d = length(p - (torch + vec2(cos(a), sin(a)) * rr));
        col += heat(0.95) * smoothstep(0.009, 0.002, d) * audioKick * 1.6;
    }
    // The visor: the whole frame darkens as the level rises, plus the green
    // cast of the filter glass.  Slow, and it never brightens abruptly.
    float visor = 1.0 - 0.25 * smoothstep(0.15, 0.8, audioLevel);
    col *= visor;
    col = mix(col, col * vec3(0.75, 1.0, 0.85), 0.35);
    col *= 0.9 + 0.25 * clamp(audioSwell, 0.0, 1.0);

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
