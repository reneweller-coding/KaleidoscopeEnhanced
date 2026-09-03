#version 330 core
out vec4 fragColor;
/**
 * @file StereoWidthCanyon.frag
 * @brief STEREO WIDTH CANYON: a slot canyon whose width is the stereo
 * width of the mix -- a mono passage closes the walls to a crack of sky, a
 * wide mix opens them.  The width is slow (the balance is filtered), the
 * walls carry the photo as sandstone, sunlight falls from the slot above
 * and the left and right channel levels light their own wall.  Nothing
 * moves but the walls, slowly, and the light; the camera is fixed on the
 * canyon floor.
 *
 * Audio Reactivity:
 *   audioStereo (width via |balance| history is not available, so the
 *                channel difference |L - R| filtered by the swell stands in)
 *   audioStereoL / R -> wall light (light)
 *   audioSwell       -> sunlight (slow)
 *   audioKick        -> dust motes flash (light)
 *   audioLevel       -> brightness
 *
 * Per-activation variety: widthP, depthP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioStereo;
uniform float audioStereoL;
uniform float audioStereoR;
uniform float audioSwell;
uniform float audioKick;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float widthP;
uniform float depthP;
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
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; ++i) { v += a * noise2(p); p = p * 2.03 + 5.0; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    // Width: the stereo balance magnitude is fast; the swell is the slow
    // envelope we are allowed, so the width follows the swell and the
    // balance only leans the slot left or right (slowly, scaled down).
    float widthBase = 0.12 + 0.2 * clamp(widthP, 0.0, 1.0);
    float width = widthBase + 0.3 * clamp(audioSwell, 0.0, 1.0);
    float lean = 0.15 * clamp(audioStereo, -1.0, 1.0);
    float depth = 0.6 + 0.6 * clamp(depthP, 0.0, 1.0);
    float sun = 0.6 + 0.7 * clamp(audioSwell, 0.0, 1.0);
    float lL = clamp(audioStereoL * 1.5, 0.0, 1.0), lR = clamp(audioStereoR * 1.5, 0.0, 1.0);

    // The canyon: looking up-and-forward; the walls are two surfaces
    // whose gap narrows with height (perspective) and with the width; the
    // sky is the slot at the top.  Screen y maps to height, x to across.
    float h = p.y + 0.5;                                   // 0 floor .. 1 top
    float gap = width * (0.35 + 0.65 * h) * (1.0 + 0.3 * fbm(vec2(h * 3.0, 1.0)));
    float centre = lean * h + 0.06 * sin(h * 6.0) * depth;
    float dl = p.x - (centre - gap), dr = (centre + gap) - p.x;
    float inSlot = step(0.0, dl) * step(0.0, dr);
    // Sky in the slot, brightest at the top.
    vec3 sky = mix(vec3(0.5, 0.7, 1.0), vec3(1.0, 0.95, 0.85), smoothstep(0.6, 1.0, h)) * sun;
    sky = mix(sky, sky * imgPalette(hue * 0.159 + 0.6) * 1.4, 0.15);
    // Walls: sandstone from the photo, banded, lit from above; left wall by L, right by R.
    float side = step(p.x, centre);                        // 1 = left wall
    float wallDist = side * (-dl) + (1.0 - side) * (-dr);  // distance into the wall
    vec2 wuv = vec2(side * (0.5 - wallDist * 0.6) + (1.0 - side) * (0.5 + wallDist * 0.6), h * 0.9);
    vec3 rock = img(clamp(wuv, 0.0, 1.0)) * 1.1;
    rock = mix(rock, rock * imgPalette(hue * 0.159 + 0.08) * 1.6, 0.35);
    float bands = 0.8 + 0.2 * sin(h * 40.0 + fbm(vec2(p.x * 3.0, h * 8.0)) * 6.0);
    rock *= bands;
    float fromSlot = clamp(wallDist / 0.6, 0.0, 1.0);
    float light = (0.25 + 0.75 * h) * (1.0 - 0.6 * fromSlot) * sun;
    light *= 0.7 + 0.5 * (side * lL + (1.0 - side) * lR);
    // Warm bounce light low in the canyon.
    rock = mix(rock * light, rock * vec3(1.1, 0.7, 0.4) * 0.5 * sun, (1.0 - h) * 0.3);
    vec3 col = mix(rock, sky, inSlot);
    // Sun shafts through the slot, and dust motes (round) flashing on the kick.
    float shaft = inSlot * pow(0.5 + 0.5 * sin(p.x * 30.0 + h * 5.0 + sceneAdvance * 0.3), 8.0) * 0.25 * sun;
    col += vec3(1.0, 0.95, 0.8) * shaft;
    vec2 mu = (p + vec2(0.0, -sceneAdvance * 0.15)) * 40.0; vec2 mc = floor(mu); vec2 mf = fract(mu) - 0.5;
    vec2 mo = vec2(hash21(mc + 1.3), hash21(mc + 5.9)) - 0.5;
    float motes = smoothstep(0.2, 0.06, length(mf - mo * 0.6)) * step(0.95, hash21(mc));
    col += vec3(1.0, 0.95, 0.8) * motes * (0.15 + 0.8 * audioKick) * sun;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
