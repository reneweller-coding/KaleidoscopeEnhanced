#version 330 core
out vec4 fragColor;
/**
 * @file CameraObscuraRoom.frag
 * @brief CAMERA OBSCURA ROOM: a darkened room with a pinhole in one wall.
 * The world outside (the photo) stands upside-down and left-right reversed
 * on the far wall, soft at the edges as a pinhole image is.  The aperture
 * breathes with the swell -- wide open means bright and soft, stopped down
 * means dim and sharp -- dust motes drift through the light cone on the
 * scene clock, and the kick is a flicker of the daylight outside (a cloud
 * passing, light only).  Camera fixed in the room.
 *
 * Audio Reactivity:
 *   audioSwell   -> aperture: brightness and blur together (slow)
 *   sceneAdvance -> dust motes and the slow drift of the projection (continuous)
 *   audioKick    -> daylight flicker (light)
 *   audioHigh    -> mote sparkle (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: holeP (aperture size), dustP, hueP.
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

uniform float holeP;
uniform float dustP;
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
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}

// The projected image: the photo turned through 180 degrees (a pinhole
// inverts in both axes), blurred by the aperture.  Sampled as a small
// disc of taps whose radius is the circle of confusion.
vec3 projected(vec2 uv, float blur)
{
    vec2 flipped = vec2(1.0) - uv;
    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    for (int i = 0; i < 8; ++i)
    {
        float a = float(i) * 0.7853982;
        vec2 o = vec2(cos(a), sin(a)) * blur;
        float w = 1.0 - float(i) / 12.0;
        acc += img(clamp(flipped + o, 0.0, 1.0)) * w;
        wsum += w;
    }
    acc += img(clamp(flipped, 0.0, 1.0)) * 1.4;
    wsum += 1.4;
    return acc / wsum;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float holeBase = 0.4 + 0.6 * clamp(holeP, 0.0, 1.0);
    float dust = 0.4 + 0.8 * clamp(dustP, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    // The aperture: open on the swell.  Brightness and blur move together,
    // which is what an aperture does, and both are slow.
    float aperture = holeBase * (0.5 + 0.7 * swell);
    float blur = 0.0015 + 0.006 * aperture;
    float clock = sceneAdvance * 0.5 + sceneTime * 0.1;
    // Daylight outside: the kick is a cloud edge passing the hole (light only).
    float daylight = (0.7 + 0.5 * swell) * (1.0 + 0.35 * audioKick);

    // The far wall: rough plaster, faintly warm, dark where the light does
    // not reach.  The projection sits on it, keystoned a little because the
    // wall is not exactly parallel to the outside.
    vec2 wall = vec2(p.x / aspect + 0.5, uv.y);
    vec2 keyed = vec2((wall.x - 0.5) / (0.86 + 0.13 * wall.y) + 0.5, wall.y);
    vec3 image = projected(clamp(keyed, 0.0, 1.0), blur) * daylight;
    // A pinhole image falls off toward the edges of the cone.
    float cone = smoothstep(0.85, 0.32, length((uv - vec2(0.5, 0.52)) * vec2(aspect * 0.8, 1.0)));
    // Plaster texture and its own dim colour.
    float plaster = 0.75 + 0.25 * noise2(p * 60.0);
    vec3 room = mix(vec3(0.1, 0.09, 0.085), imgPalette(hue * 0.159 + 0.55) * 0.25, 0.5) * plaster;
    vec3 col = room * 1.3 + image * cone * plaster * 1.9;
    // The light cone itself, hanging in the dusty air: a wedge from the
    // pinhole (upper right, behind the viewer) across the room.
    vec2 hole = vec2(aspect * 0.42, 0.36);
    vec2 toWall = p - hole;
    float along = clamp(-toWall.y / 0.95, 0.0, 1.0);
    float spread = 0.03 + 0.26 * along;
    float across = abs(toWall.x + toWall.y * 0.55) / max(spread, 1e-3);
    float beam = smoothstep(1.0, 0.35, across) * smoothstep(0.0, 0.15, along) * (0.05 + 0.14 * aperture);
    vec3 beamCol = mix(vec3(1.0, 0.96, 0.88), imgPalette(hue * 0.159 + 0.1), 0.3);
    col += beamCol * beam * daylight * 0.5;
    // Dust motes: round, jittered, drifting up and sideways on the clock;
    // they only light where the beam is.
    for (int layer = 0; layer < 2; ++layer)
    {
        float fl = float(layer);
        float scale = 22.0 + fl * 14.0;
        vec2 g = (p + vec2(sin(clock * 0.3 + fl) * 0.05, -clock * (0.03 + 0.02 * fl))) * scale + fl * 19.0;
        vec2 c = floor(g);
        vec2 f = fract(g) - 0.5;
        vec2 jit = vec2(hash21(c + 1.3), hash21(c + 5.9)) - 0.5;
        float r = length(f - jit * 0.7);
        float mote = smoothstep(0.18, 0.05, r) * step(1.0 - 0.09 * dust, hash21(c + fl * 3.1));
        col += beamCol * mote * beam * 6.0 * (0.6 + 0.9 * clamp(audioHigh * 2.0, 0.0, 1.0));
    }
    // The pinhole itself: a small bright point on the wall behind us, seen
    // as a glow at the top right edge.
    float hd = length(p - hole);
    col += beamCol * exp(-hd * 24.0) * daylight * (0.25 + 0.5 * aperture);
    // Floor line and the room's darkness at the bottom.
    col *= 0.55 + 0.45 * smoothstep(-0.12, 0.25, p.y);
    col *= 0.8 + 0.4 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
