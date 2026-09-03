#version 330 core
out vec4 fragColor;
/**
 * @file BellTowerDownbeat.frag
 * @brief BELL TOWER DOWNBEAT: a belfry of the photo -- a row of bells of
 * different sizes swinging in their frames.  The bells swing on the scene
 * clock (continuous, each at the period its size gives it), never on a
 * beat tracker; the downbeat is the strike: the bell that is nearest its
 * turning point flashes bronze and rings a light-wave down the tower.
 * The kick is the clapper spark, the swell the light through the louvres.
 * Camera fixed in the belfry.
 *
 * Audio Reactivity:
 *   sceneAdvance  -> the swings (continuous)
 *   audioDownbeat -> the strike (light: flash and ring wave)
 *   audioKick     -> clapper spark (light)
 *   audioSwell    -> louvre light (slow)
 *   audioLevel    -> brightness
 *
 * Per-activation variety: bellsP, swingP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioDownbeat;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float bellsP;
uniform float swingP;
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

// Signed distance to a bell profile (in the bell's local frame, apex at
// the origin, opening downward): a flared cup.
float bellSDF(vec2 q, float size)
{
    float h = clamp(-q.y / size, 0.0, 1.0);              // 0 at the crown, 1 at the lip
    float radius = size * (0.25 + 0.55 * pow(h, 2.2) + 0.2 * h);
    float body = abs(q.x) - radius;
    float cap = max(q.y - 0.02 * size, -q.y - size);
    return max(body, cap);
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float nBells = floor(3.0 + 3.0 * clamp(bellsP, 0.0, 1.0));      // once per activation
    float swingAmp = 0.35 + 0.5 * clamp(swingP, 0.0, 1.0);
    float louvre = 0.4 + 0.8 * clamp(audioSwell, 0.0, 1.0);
    float down = clamp(audioDownbeat, 0.0, 1.0);
    float clock = sceneAdvance * 0.8 + sceneTime * 0.12;

    // The belfry: the photo as stone, louvre light in slats from the sides.
    vec3 col = img(gl_FragCoord.xy / resolution) * mix(vec3(0.3), imgPalette(hue * 0.159 + 0.55) * 0.5, 0.5);
    float slats = pow(0.5 + 0.5 * sin(p.y * 40.0), 6.0) * smoothstep(0.3, 0.6, abs(p.x));
    col += imgPalette(hue * 0.159 + 0.1) * slats * louvre * 0.6;
    col *= 0.5 + 0.5 * louvre;
    // The ring wave of the strike: a light band travelling down the tower.
    float ringY = 0.4 - (1.0 - down) * 1.2;
    col += imgPalette(hue * 0.159 + 0.9) * exp(-abs(p.y - ringY) * 8.0) * down * 0.35;

    // Bells: hung along a beam; each swings on its own period (bigger =
    // slower); drawn as bronze cups with the photo in their reflection.
    float beamY = 0.35;
    col = mix(col, vec3(0.3, 0.22, 0.14), smoothstep(0.03, 0.02, abs(p.y - beamY)));
    for (int i = 0; i < 6; ++i)
    {
        if (float(i) >= nBells) break;
        float fi = float(i);
        float size = 0.16 + 0.12 * hash11(fi * 3.7);
        float x0 = (fi + 0.5) / nBells * aspect * 0.9 - aspect * 0.45;
        float period = 0.5 + size * 4.0;
        float ang = swingAmp * sin(clock / period * 3.0 + hash11(fi * 5.1) * 6.28);
        // Local frame: rotate about the pivot on the beam.
        vec2 q = p - vec2(x0, beamY);
        float c = cos(ang), s = sin(ang);
        q = mat2(c, -s, s, c) * q;
        float d = bellSDF(q, size);
        float inside = smoothstep(0.004, -0.004, d);
        // Bronze shading with the photo reflected, lit from the louvres.
        float h = clamp(-q.y / size, 0.0, 1.0);
        float nx = q.x / max(size * (0.25 + 0.75 * h), 1e-3);
        float shade = 0.35 + 0.65 * sqrt(max(1.0 - nx * nx, 0.0));
        vec3 bronze = mix(vec3(0.75, 0.55, 0.28), imgPalette(hue * 0.159 + 0.15), 0.3);
        vec3 refl = img(vec2(fract(nx * 0.3 + 0.5 + fi * 0.1), h));
        vec3 bell = mix(bronze, refl, 0.3) * shade * (0.5 + 0.6 * louvre);
        bell += vec3(1.0, 0.9, 0.7) * pow(max(1.0 - abs(nx + 0.4) * 2.0, 0.0), 5.0) * 0.5;
        // The strike: the bell nearest its turning point flashes on the downbeat.
        float atTurn = pow(abs(sin(clock / period * 3.0 + hash11(fi * 5.1) * 6.28)), 6.0);
        bell += imgPalette(hue * 0.159 + 0.9) * atTurn * down * 1.2;
        // Lip band.
        bell += vec3(0.9, 0.75, 0.45) * smoothstep(0.06, 0.0, abs(h - 0.93)) * 0.3;
        col = mix(col, bell, inside);
        // The clapper spark on the kick, at the lip.
        vec2 lip = vec2(0.0, -size * 0.92);
        col += vec3(1.0, 0.85, 0.5) * exp(-length(q - lip) * 40.0) * audioKick * 0.8 * (0.5 + atTurn);
        // Headstock and rope.
        col = mix(col, vec3(0.25, 0.18, 0.1), smoothstep(0.02, 0.015, abs(q.x)) * step(-0.02, q.y) * step(q.y, 0.06));
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
