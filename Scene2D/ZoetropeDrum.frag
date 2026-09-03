#version 330 core
out vec4 fragColor;
/**
 * @file ZoetropeDrum.frag
 * @brief ZOETROPE DRUM: a real zoetrope seen from outside.  The drum is a
 * dark cylinder with vertical slits; inside, a strip of frames -- the photo
 * in successive phases of a wave -- runs round the wall.  Motion is seen
 * only through the slits: as the drum turns steadily on the scene clock the
 * frames glimpsed through each slit advance, and the strip appears to move.
 * The drum wall between the slits is lit by the lamp inside (the swell) and
 * the kick flashes the slit edges.  The camera never moves.
 *
 * Audio Reactivity:
 *   sceneAdvance -> drum rotation (continuous)
 *   audioSwell   -> lamp inside the drum (slow)
 *   audioKick    -> slit-edge flash (light)
 *   audioHigh    -> sparkle on the brass rim (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: slitsP (slit count), waveP, hueP.
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
uniform float audioKick;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float slitsP;
uniform float waveP;
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

// One frame of the strip: the photo in phase ph of a wave (0..1 = one cycle).
vec3 frameAt(vec2 uv, float ph, float wave)
{
    float w = 6.2831853 * ph;
    vec2 d = vec2(sin(uv.y * 9.0 + w), cos(uv.x * 7.0 - w)) * 0.035 * wave;
    d += vec2(0.0, 0.05 * wave * sin(w + uv.x * 3.0));
    return img(clamp(uv + d, 0.0, 1.0));
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float slits = floor(10.0 + 8.0 * clamp(slitsP, 0.0, 1.0));   // once per activation
    float wave = 0.7 + 0.8 * clamp(waveP, 0.0, 1.0);
    float rot = sceneAdvance * 0.35 + sceneTime * 0.06;

    // The drum: a cylinder of radius 1 seen from the side; the visible
    // front half maps x -> angle.  Outside the drum: the room.
    float R = 0.78 * aspect * 0.5 + 0.35;
    vec3 col;
    if (abs(p.x) < R && abs(p.y) < 0.42)
    {
        float sn = p.x / R;                                  // -1..1
        float cs = sqrt(max(1.0 - sn * sn, 0.0));
        float ang = atan(sn, cs);                            // -pi/2..pi/2 on the front
        float u = ang / 6.2831853 + rot;                     // drum coordinate (turns)
        // Slits: one narrow gap per frame.
        float slot = fract(u * slits);
        float gap = smoothstep(0.16, 0.11, abs(slot - 0.5));
        // The frame seen through this slit: the strip on the far wall,
        // frame index = the slit's index, shifted with the turn so the
        // motion appears (each slit shows the next phase in turn).
        float idx = floor(u * slits);
        float ph = fract(idx / slits + rot * slits * 0.0 + rot);   // frame phase advances with the turn
        // Through the slit we see the strip on the opposite wall: map the
        // slit's neighbourhood to the frame.
        vec2 fuv = vec2(0.5 + (slot - 0.5) * 2.2, (p.y + 0.42) / 0.84);
        vec3 fr = frameAt(clamp(fuv, 0.0, 1.0), ph, wave);
        float lamp = 1.1 + 0.9 * clamp(audioSwell, 0.0, 1.0);
        // The drum wall: dark lacquer with the lamp glowing through faintly.
        vec3 wall = img(vec2(fract(u * 2.0), (p.y + 0.42) / 0.84)) * imgPalette(hue * 0.159 + 0.6) * 0.35 * (0.5 + 0.7 * cs) + vec3(0.04);
        wall += imgPalette(hue * 0.159 + 0.1) * 0.05 * lamp;
        col = mix(wall, fr * lamp * (0.6 + 0.6 * cs), gap);
        // Slit edges: brass, flashing on the kick.
        float edge = smoothstep(0.19, 0.16, abs(slot - 0.5)) - gap;
        col += vec3(0.9, 0.7, 0.35) * edge * (0.2 + 0.8 * audioKick) * cs;
    }
    else
    {
        // The room: the photo dim as wallpaper, a table under the drum.
        vec2 ruv = fract(vec2(p.x * 0.3 + 0.5 + sceneAdvance * 0.002, p.y * 0.5 + 0.5));
        col = img(ruv) * imgPalette(hue * 0.159 + 0.5) * 0.6 + 0.03;
        col *= 0.5 + 0.5 * exp(-abs(p.y) * 1.5);
    }
    // Brass rims top and bottom, sparkling on the treble.
    float rim = smoothstep(0.03, 0.0, abs(abs(p.y) - 0.42)) * step(abs(p.x), R + 0.02);
    float sp = 0.5 + 0.5 * sin(p.x * 60.0 + sceneAdvance * 2.0);
    col = mix(col, vec3(0.95, 0.75, 0.4) * (0.5 + 0.5 * sp) * (0.6 + 1.0 * clamp(audioHigh * 2.0, 0.0, 1.0)), rim);
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
