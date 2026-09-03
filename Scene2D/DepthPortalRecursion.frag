#version 330 core
out vec4 fragColor;
/**
 * @file DepthPortalRecursion.frag
 * @brief DEPTH PORTAL RECURSION: a Droste zoom built from the engine's own
 * previous frame.  A rounded portal in the middle of the picture shows the
 * LAST frame, shrunk and turned -- which already contains the portal, which
 * contains the portal ...  The recursion is real, not painted: every level is
 * one frame older than the one around it, so a beat that flashes the rim
 * travels inward level by level over the following frames.
 *
 * Audio Reactivity:
 *   audioBeat      -> the portal rim flashes; the flash then sinks inward
 *   sceneAdvance   -> continuous inward drift (the zoom never stops, never jumps)
 *   audioBarPhase  -> the portal centre wanders in a slow ellipse
 *   audioMelodyPitch -> portal aspect: high notes make it tall, low notes wide
 *   audioSwell     -> how far the colour shifts per level (spectral depth)
 *   audioKick      -> a one-frame radial push on the outer picture
 *
 * Per-activation variety: portalP (portal radius), twistP (turn per level),
 *                         decayP (how many levels survive), hueP.
 *
 * Feedback safety (V10): the previous frame is decayed AND its luminance is
 * soft-knee'd before re-injection, so the loop converges instead of blooming.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform sampler2D texPrevFrame;   // last frame's fully composited image (unit 34)
uniform float interpolation;

uniform float sceneAdvance;
uniform float audioAdvance;
uniform float audioBeat;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioBarPhase;
uniform float audioMelodyPitch;
uniform float audioChromaHue;
uniform float audioValence;

uniform float portalP;
uniform float twistP;
uniform float decayP;
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

vec3 hueRot(vec3 c, float a)
{
    const vec3 k = vec3(0.57735);
    float ca = cos(a);
    return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

// Signed distance to a rounded rectangle (the portal outline).
float sdRoundBox(vec2 p, vec2 b, float r)
{
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv  = gl_FragCoord.xy / resolution;
    vec2 p   = (uv - 0.5) * vec2(aspect, 1.0);

    float por = (portalP > 0.01) ? portalP : 0.66;
    float tw  = (twistP > 0.001) ? twistP : 0.12;
    float dec = (decayP > 0.5) ? decayP : 0.93;
    float hue = (hueP > 0.001) ? hueP : 0.0;

    // The portal wanders on a slow ellipse driven by the bar, and its aspect
    // follows the melody: a high note stands the portal up, a low note lays
    // it down.  Both are continuous, so the recursion breathes instead of
    // snapping.
    float bar  = audioBarPhase * 6.2831853;
    vec2  cen  = vec2(0.10 * cos(bar), 0.06 * sin(bar * 0.5));
    float asp  = mix(1.35, 0.72, clamp(audioMelodyPitch, 0.0, 1.0));
    vec2  half = por * vec2(asp, 1.0 / asp) * 0.5;

    // Kick: a one-frame radial push on the outer picture (it then sinks in).
    vec2 q = p - cen;
    q *= 1.0 - 0.04 * audioKick * smoothstep(0.0, 0.6, length(q));

    float d = sdRoundBox(q, half, 0.18 * por);
    float inside = 1.0 - smoothstep(-0.004, 0.004, d);

    // Inside the portal: the previous frame, shrunk by the portal size and
    // turned by twistP -- plus a continuous inward drift, so the nesting
    // moves deeper at a rate the music sets (sceneAdvance: no jump on
    // activation, no run-away after an hour).
    float scale = por * 1.0;                       // portal covers `por` of the frame
    float ang   = tw + 0.25 * sin(sceneAdvance * 0.7);
    float ca = cos(ang), sa = sin(ang);
    vec2  pr = vec2(ca * q.x - sa * q.y, sa * q.x + ca * q.y) / scale;
    // Drift: sample slightly further out than the pure Droste mapping, so
    // each frame the content appears to come toward the viewer.
    pr *= 1.0 + 0.035 + 0.025 * audioLevel;
    vec2  puv = pr / vec2(aspect, 1.0) + 0.5;
    vec3  prev = texture(texPrevFrame, clamp(puv, 0.0, 1.0)).rgb;
    // Each level shifts hue a little: depth reads as a spectral gradient.
    prev = hueRot(prev, 0.35 + 0.45 * audioSwell);
    // Converge: decay, and soft-knee the luminance so bright rims cannot
    // pile up level after level.
    float pl = dot(prev, vec3(0.299, 0.587, 0.114));
    prev *= dec * (1.0 - 0.25 * smoothstep(0.55, 1.0, pl));
    // Outside the frame the previous image has nothing: fade to dark blue.
    float outside = smoothstep(0.0, 0.03, max(abs(puv.x - 0.5), abs(puv.y - 0.5)) - 0.47);
    prev = mix(prev, vec3(0.02, 0.02, 0.05), outside);

    // Outside the portal: the photo, pulled toward the portal like a tunnel
    // mouth, so the eye is led to the recursion.
    float pull = 0.18 / (1.0 + 4.0 * max(d, 0.0));
    vec2  ouv  = (q * (1.0 - pull)) / vec2(aspect, 1.0) + 0.5;
    vec3  fresh = img(clamp(ouv, 0.0, 1.0));
    vec3  tint  = imgPalette(hue * 0.159 + 0.15);
    fresh = mix(fresh, fresh * tint * 1.6, 0.35);
    float vign = 1.0 - 0.55 * smoothstep(0.35, 0.95, length(p));
    fresh *= vign;

    // The rim: a glowing frame that flashes on the beat.  Because the rim is
    // part of what the next frame will show inside the portal, the flash
    // travels inward -- one level per frame -- without any extra code.
    float rim = exp(-abs(d) * 45.0);
    vec3  rimCol = imgPalette(hue * 0.159 + 0.6) * (0.9 + 2.2 * audioBeat);

    vec3 col = mix(fresh, prev, inside);
    col += rimCol * rim * 0.9;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
