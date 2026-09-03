#version 330 core
out vec4 fragColor;
/**
 * @file TimeCrystalLattice.frag
 * @brief TIME CRYSTAL LATTICE: a discrete time crystal -- a lattice of
 * spins driven by a periodic kick that responds at half the drive
 * frequency, the hallmark of the phase.  The spins are round discs of the
 * photo; a phase gradient across the lattice makes the flips travel as a
 * wave; the flips themselves are light (colour A to colour B, crossfaded,
 * never a hard switch), the drive pulses are a flash on the kick, and the
 * swell is the lattice depth (contrast).  Camera still.
 *
 * Audio Reactivity:
 *   sceneAdvance -> the drive clock (continuous)
 *   audioKick    -> drive pulse flash (light)
 *   audioSwell   -> lattice depth / contrast (slow)
 *   audioBass    -> coupling glow between spins (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: pitchP (lattice pitch), gradP (phase gradient), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioBass;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float pitchP;
uniform float gradP;
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
    float pitch = 9.0 + 7.0 * clamp(pitchP, 0.0, 1.0);
    float grad = 0.3 + 1.2 * clamp(gradP, 0.0, 1.0);
    float depth = 0.4 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float clock = sceneAdvance * 0.5 + sceneTime * 0.1;

    // The lattice: square cells, a spin disc in each.
    vec2 gu = p * pitch; vec2 cell = floor(gu); vec2 f = fract(gu) - 0.5;
    float d = length(f);
    // Drive at frequency w; the response at w/2 (the time crystal): the
    // spin state is a smooth square wave of the half-frequency phase, with
    // a phase gradient across the lattice so the flips travel.
    float phase = clock * 0.5 + (cell.x * 0.5 + cell.y * 0.3) * grad * 1.1 + 0.1 * hash21(cell);
    float spinState = smoothstep(-0.6, 0.6, sin(phase * 3.14159));        // 0 = down, 1 = up
    // The drive pulse: a flash at frequency w (twice the flips), brightening on the kick.
    float drive = pow(0.5 + 0.5 * cos(clock * 3.14159 * 2.0), 8.0);
    vec3 up = imgPalette(hue * 0.159 + 0.0) * 1.5 + 0.15;
    vec3 down = imgPalette(hue * 0.159 + 0.5) * 1.5 + 0.15;
    vec3 spinCol = mix(down, up, spinState);
    // The disc: the photo cell tinted by its state; an arrow-like shading
    // (top bright for up, bottom bright for down) so the flip reads.
    vec2 puv = (cell + 0.5) / pitch;
    vec3 photo = img(clamp(puv * vec2(1.0 / aspect, 1.0) + 0.5, 0.0, 1.0));
    float shade = 0.6 + 0.5 * (f.y * 2.0) * (spinState * 2.0 - 1.0);
    vec3 disc = mix(photo * 1.2, spinCol, 0.55) * shade * depth + spinCol * (1.0 - depth) * 0.4;
    float discMask = smoothstep(0.42, 0.36, d);
    // Background: dark with the coupling lines between neighbours glowing
    // with the bass, and the drive flash across everything.
    vec3 col = imgPalette(hue * 0.159 + 0.6) * 0.04;
    float links = smoothstep(0.03, 0.0, min(abs(f.x), abs(f.y))) * (1.0 - discMask);
    col += mix(up, down, 0.5) * links * (0.15 + 0.6 * clamp(audioBass, 0.0, 1.0));
    col = mix(col, disc, discMask);
    col += vec3(1.0) * drive * (0.03 + 0.22 * audioKick) * discMask;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
