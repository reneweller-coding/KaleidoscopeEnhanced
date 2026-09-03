#version 330 core
out vec4 fragColor;
/**
 * @file SeismographDrum.frag
 * @brief SEISMOGRAPH DRUM: the classic recorder -- a paper drum turning
 * steadily on the scene clock while the pen writes.  The trace is the
 * recent loudness (audioWave for the fine wiggle, the level for the
 * envelope), a quake on the kick is an ink spike and a flash of the pen
 * lamp, the bass is the low rumble in the trace.  The drum turns, the pen
 * arm rests, the frame never shakes: only the ink moves.  The photo is the
 * observatory wall and the paper's watermark.
 *
 * Audio Reactivity:
 *   sceneAdvance  -> drum rotation (continuous)
 *   audioWave[64] -> the trace wiggle (light-sized, on the paper)
 *   audioKick     -> quake spike and pen-lamp flash (light)
 *   audioBass     -> rumble amplitude in the trace (light)
 *   audioLevel    -> brightness
 *
 * Per-activation variety: speedP, gainP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioWave[64];
uniform float audioKick;
uniform float audioBass;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float speedP;
uniform float gainP;
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

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float speed = 0.6 + 0.8 * clamp(speedP, 0.0, 1.0);
    float gain = 0.5 + 0.8 * clamp(gainP, 0.0, 1.0);
    float clock = sceneAdvance * 0.5 * speed + sceneTime * 0.1;

    // The drum: a horizontal cylinder filling the frame, axis along x, its
    // surface curving away top and bottom; the paper scrolls with the
    // rotation (screen y maps to the drum angle).
    float drumR = 0.42;
    float ny = p.y / drumR;                                            // -1..1 across the drum face
    float onDrum = step(abs(ny), 1.0) * step(abs(p.x), aspect * 0.47);
    float ang = asin(clamp(ny, -1.0, 1.0));                            // angle on the drum
    float shade = sqrt(max(1.0 - ny * ny, 0.0));
    // Paper coordinate: unwrapped angle scrolling with the clock (the drum
    // turns), and x along the axis; the pen sits at x = penX and the trace
    // it wrote earlier is further around the drum (higher angle) AND
    // shifted along x by the slow carriage feed (a helix).
    float paperV = ang + clock * 2.0;                                  // unwrapped scroll
    float carriage = paperV * 0.012;                                   // helical feed along x
    float penX = 0.25;
    // The trace: at paper column x, the line was written when the pen was
    // at this angle -- we sample the waveform by the "age" of that angle
    // around the drum (0 at the pen, growing with paperV - now).
    float age = fract(paperV / 6.2831853) * 6.2831853;                 // 0..2pi around the drum
    int wi = int(clamp(age / 6.2831853 * 63.0, 0.0, 63.0));
    float wave = audioWave[wi];
    float rumble = 0.5 * clamp(audioBass, 0.0, 1.0) * sin(age * 9.0 + clock * 3.0);
    float traceX = penX - carriage * 0.0 + (wave * 0.6 + rumble * 0.4) * 0.12 * gain;
    // The trace is a line in x at each paper row; drawn as ink on the paper.
    float ink = smoothstep(0.004, 0.0015, abs(p.x - traceX)) * onDrum;
    // Older turns of the helix: faint parallel traces offset by the feed.
    float ink2 = smoothstep(0.003, 0.001, abs(p.x - (traceX - 0.09))) * onDrum * 0.5;
    float ink3 = smoothstep(0.003, 0.001, abs(p.x - (traceX - 0.18))) * onDrum * 0.3;
    // The paper: cream with a faint photo watermark and ruled lines.
    vec3 paper = vec3(0.93, 0.9, 0.82) * (0.35 + 0.75 * shade);
    paper = mix(paper, paper * (0.85 + 0.3 * dot(img(vec2(p.x / aspect + 0.5, fract(paperV * 0.15))), vec3(0.333))), 0.5);
    float rule = smoothstep(0.003, 0.0, abs(fract(paperV * 4.0) - 0.5) - 0.48) * 0.15 + smoothstep(0.002, 0.0, abs(fract(p.x * 12.0) - 0.5) - 0.48) * 0.08;
    paper *= 1.0 - rule;
    vec3 inkCol = mix(vec3(0.1, 0.05, 0.05), imgPalette(hue * 0.159 + 0.0) * 0.4, 0.4);
    vec3 drum = mix(paper, inkCol, max(ink, max(ink2, ink3)));
    // The quake: a spike of ink at the pen row on the kick (light: the fresh
    // ink glows red for a moment), and the pen lamp flashes.
    float penRow = smoothstep(0.03, 0.0, abs(ang - 0.0));
    drum += vec3(0.8, 0.1, 0.05) * ink * penRow * audioKick * 1.5;
    // The wall behind the drum: the photo dark, the observatory.
    vec3 wall = img(gl_FragCoord.xy / resolution) * imgPalette(hue * 0.159 + 0.55) * 0.25 + 0.02;
    vec3 col = mix(wall, drum, onDrum);
    // The pen arm: a dark bar from the right reaching the pen tip, with a lamp.
    float arm = step(penX + 0.02, p.x) * step(abs(p.y), 0.012) * step(p.x, aspect * 0.5);
    col = mix(col, vec3(0.2, 0.18, 0.15), arm);
    col += vec3(1.0, 0.8, 0.5) * exp(-length(p - vec2(penX + 0.05, 0.0)) * 30.0) * (0.3 + 1.5 * audioKick);
    // Drum end caps and axle glints.
    col = mix(col, vec3(0.25, 0.2, 0.15) * (0.5 + 0.5 * shade), step(aspect * 0.47, abs(p.x)) * step(abs(ny), 1.0) * step(abs(p.x), aspect * 0.5));
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
