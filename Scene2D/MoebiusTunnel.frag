#version 330 core
out vec4 fragColor;
/**
 * @file MoebiusTunnel.frag
 * @brief MOEBIUS TUNNEL: a tunnel whose wall is a one-sided surface.  The
 * wall is built from a few ribbons that make an odd number of half-twists
 * per loop, so a ribbon that starts on the inside of the tube arrives on the
 * outside one loop later and comes back around: the stripes spiral past the
 * camera and never repeat the way a plain tunnel does.  Photo on the front
 * face, its palette-negative on the back face -- the twist is what swaps
 * them, continuously, as the tube streams by.
 *
 * Audio Reactivity:
 *   sceneAdvance     -> forward travel (music-paced, continuous, bounded)
 *   audioSwell       -> the tube widens on builds (slow)
 *   audioKick        -> the gaps between ribbons flash open for a beat
 *   audioMelodyPitch -> hue of the front face glides with the melody
 *   audioFlux        -> contrast of the ribbon texture
 *
 * Per-activation variety: twistP (half-twists per loop: 1 or 3, fixed),
 *                         sidesP (ribbons 2..4, fixed), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioBass;
uniform float audioKick;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioFlux;
uniform float audioBarPhase;
uniform float audioMelodyPitch;
uniform float audioChromaHue;
uniform float audioValence;

uniform float twistP;
uniform float sidesP;
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

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);


    // Odd half-twists make it a Moebius band; 1 or 3, chosen once.
    float k       = (twistP > 2.0) ? 3.0 : 1.0;
    // Ribbon count EVEN: with an odd count the face parity flips across the
    // atan seam and draws a hard line down the left axis.
    float ribbons = 2.0 * floor((sidesP > 1.5 ? sidesP : 3.0) * 0.5 + 0.5);
    float hue     = (hueP > 0.001) ? hueP : 0.0;

    float r = length(p) * (1.0 - 0.08 * clamp(audioSwell, 0.0, 1.0));  // builds widen the tube (slow, V7d)
    float a = atan(p.y, p.x);

    float travel = sceneAdvance * 1.5 + sceneTime * 0.3;
    float depth  = 1.0 / max(r, 0.02);
    float z      = depth + travel;

    // The ribbon coordinate: angle plus the twist that accumulates with
    // depth.  k half-twists over one loop length L.
    const float L = 5.0;
    float v    = a + 3.14159265 * k * z / L;
    float rb   = v * ribbons / 6.2831853;
    float s    = fract(rb);                       // across one ribbon, 0..1
    float par  = mod(floor(rb), 2.0);             // which face this ribbon shows

    // Gaps between ribbons; the kick flashes them wider.
    float gapW = 0.06 + 0.04 * audioKick;
    float body = smoothstep(0.0, gapW, s) * smoothstep(1.0, 1.0 - gapW, s);

    // Photo along the ribbon, endless in z.
    vec2 uv = vec2(s * 0.8 + 0.1, fract(z * 0.12));
    vec3 tex = img(uv);
    float contrast = 1.0 + 1.2 * clamp(audioFlux * 4.0, 0.0, 1.0);
    tex = (tex - 0.5) * contrast + 0.5;

    // Front face: the photo, tinted by the melody.  Back face: the palette
    // negative, so the swap the twist performs is unmistakable.
    vec3 front = tex * imgPalette(hue * 0.159 + 0.35 * audioMelodyPitch) * 1.6;
    vec3 back  = (1.0 - tex) * imgPalette(hue * 0.159 + 0.5) * 1.2;
    vec3 face  = mix(front, back, par);

    // Ribbon edges catch light.
    float edge = exp(-min(s, 1.0 - s) * 14.0) * 0.8;
    vec3 col = face * body * (0.55 + 0.7 * audioLevel) + imgPalette(hue * 0.159 + 0.85) * edge * body;
    // Depth rings so the tube reads as a tube, streaming with the travel.
    col *= 0.78 + 0.3 * pow(0.5 + 0.5 * cos(z * 1.6), 2.0);

    // Depth fog and a throat glow; the far end is dark, the near wall bright.
    float fog = 1.0 - exp(-depth * 0.09);
    col = mix(col, vec3(0.0), clamp(fog, 0.0, 0.92));
    col += imgPalette(hue * 0.159 + 0.1) * exp(-r * 8.0) * (0.3 + 0.9 * audioBass);
    col *= 0.85 + 0.35 * audioSwell;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
