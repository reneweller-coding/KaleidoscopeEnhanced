#version 330 core
out vec4 fragColor;
/**
 * @file SectionMemoryHalls.frag
 * @brief SECTION MEMORY HALLS: the song's structure as a suite of rooms.
 * Every section the analyser recognises gets its own hall -- its own colour,
 * pillar spacing, ceiling ornament and lamp tone -- and a RETURNING section
 * (the second chorus) leads back into the SAME hall, lit warm as a place
 * already visited; a new section opens a cool, unfamiliar one.  The change
 * never cuts: when a section boundary arrives, a lit doorway appears far
 * down the hall and the camera flies through it a few seconds later into
 * the new room.  Verse / chorus / bridge become a corridor of places.
 *
 * Audio Reactivity:
 *   audioSectionId / Prev / Age / Known -> which hall, which one behind, where the door is
 *   audioBeatPhase -> lamps pulse in turn down the hall (continuous phase)
 *   audioKick      -> the lamps flash
 *   audioBass      -> floor glow
 *   audioSwell     -> overall light
 *
 * Per-activation variety: speedP (flight speed), widthP (hall width), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSectionId;
uniform float audioSectionPrev;
uniform float audioSectionAge;
uniform float audioSectionKnown;
uniform float audioBeatPhase;
uniform float audioBarPhase;
uniform float audioKick;
uniform float audioBass;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioValence;

uniform float speedP;
uniform float widthP;
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

// A hall's character from its section id: hue, pillar spacing, ornament
// frequency, lamp warmth.
vec4 hallOf(float id)
{
    float s = max(id, -1.0) + 2.0;
    return vec4(hash11(s * 1.7), 2.2 + 2.0 * hash11(s * 3.1), 3.0 + 6.0 * hash11(s * 5.3), hash11(s * 7.9));
}

vec3 shadeHall(vec3 hit, float wz, float wall, vec4 hall, float known, float hue, float dist)
{
    // wall: 0 = side wall, 1 = floor, 2 = ceiling.
    vec3 tint = imgPalette(hue * 0.159 + hall.x);
    vec3 lamp = mix(imgPalette(hue * 0.159 + 0.6), imgPalette(hue * 0.159 + 0.95), known) * (1.0 + 0.8 * known);

    // Pillars at the hall's spacing; a lamp on each, pulsing in turn.
    float pil = pow(0.5 + 0.5 * cos(wz * 6.2831853 / hall.y), 12.0);
    float lampPhase = fract(wz / hall.y - audioBeatPhase);
    float lampOn = pow(0.5 + 0.5 * cos(lampPhase * 6.2831853), 4.0) * (0.6 + 1.2 * audioKick);

    vec3 col;
    if (wall < 0.5)
    {
        vec2 uv = vec2(fract(wz * 0.12), hit.y * 0.5 + 0.5);
        col = img(uv) * tint * 2.0 * (0.5 + 0.4 * audioLevel);
        col += lamp * pil * lampOn * 1.2;
        // Ornament band at eye height.
        col += tint * 0.3 * pow(0.5 + 0.5 * cos(hit.y * hall.z + wz * 0.7), 6.0);
    }
    else if (wall < 1.5)
    {
        vec2 uv = vec2(fract(hit.x * 0.4 + 0.5), fract(wz * 0.12));
        col = img(uv) * tint * 1.2 * (0.45 + 0.3 * audioLevel);
        col += lamp * pil * lampOn * 0.35 * exp(-abs(hit.x) * 1.2);
        col += tint * (0.2 + 0.9 * audioBass) * exp(-abs(hit.x) * 2.0) * 0.5;   // lit centre line
    }
    else
    {
        // Ceiling: the hall's ornament.
        float orn = pow(0.5 + 0.5 * cos(hit.x * hall.z) * cos(wz * hall.z * 0.5), 3.0);
        col = tint * (0.15 + 0.6 * orn) * (0.5 + 0.5 * audioLevel);
        col += lamp * pil * lampOn * 0.9;
    }
    return col;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float W = (widthP > 0.3 ? widthP : 1.0);
    float H = 0.75 * W;
    // Flight at a constant pace: the door is placed in seconds, so the walls
    // must move in seconds too, or the door would drift off them.
    float v = 1.7 * (speedP > 0.05 ? speedP : 1.0);
    float travel = sceneTime * v;

    // The box hall: analytic hit of the ray with the nearer of the four
    // planes.
    vec3 dir = normalize(vec3(p.x, p.y, 1.35));
    float tx = W / max(abs(dir.x), 1e-4);
    float ty = H / max(abs(dir.y), 1e-4);
    float t  = min(tx, ty);
    vec3 hit = dir * t;
    float wall = (tx < ty) ? 0.0 : ((dir.y < 0.0) ? 1.0 : 2.0);
    float wz = hit.z + travel;

    // The door: it appears D ahead when a section changes and comes toward
    // us at the flight speed.  Beyond it the new hall, before it the old.
    const float D = 14.0;
    float doorZ = D - v * audioSectionAge;
    float ahead = step(doorZ, hit.z);     // spatial: which side of the door this pixel is
    vec4 hallNew = hallOf(audioSectionId);
    vec4 hallOld = hallOf(audioSectionPrev);
    vec3 colNew = shadeHall(hit, wz, wall, hallNew, audioSectionKnown, hue, hit.z);
    vec3 colOld = shadeHall(hit, wz, wall, hallOld, 0.5, hue, hit.z);
    vec3 col = mix(colOld, colNew, ahead);

    // The doorway: a lit frame on the walls at the door plane.
    float frame = exp(-abs(hit.z - doorZ) * 3.0);
    vec3 doorLight = mix(imgPalette(hue * 0.159 + 0.6), imgPalette(hue * 0.159 + 0.95), audioSectionKnown);
    col += doorLight * frame * (0.8 + 0.6 * audioLevel) * step(0.0, doorZ + 0.5);

    // Fog: the far end vanishes, which also hides a new door's arrival.
    float fog = 1.0 - exp(-hit.z * 0.22);
    col = mix(col, vec3(0.0), clamp(fog, 0.0, 0.97));
    col *= 0.85 + 0.35 * audioSwell;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
