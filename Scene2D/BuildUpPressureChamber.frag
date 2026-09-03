#version 330 core
out vec4 fragColor;
/**
 * @file BuildUpPressureChamber.frag
 * @brief BUILD-UP PRESSURE CHAMBER: a corridor whose walls close in as the
 * music builds.  The camera flies down it on the music's pace; the build-up
 * envelope (seconds-slow) narrows the walls and ceiling and reddens the
 * light, so the space itself tightens toward the drop -- and on the drop
 * the far end floods with light and the walls glow, then release.  The
 * walls never jump: build-up and release are slew-limited envelopes, and
 * the drop is light.  The regie as a scene, without a cut.
 *
 * Audio Reactivity:
 *   audioBuildUp  -> wall distance and light colour (slow)
 *   audioDrop     -> the flood of light at the far end (light)
 *   sceneAdvance  -> flight (continuous)
 *   audioBass     -> floor glow (light)
 *   audioKick     -> wall lamps flash (light)
 *
 * Per-activation variety: widthP, speedP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioBuildUp;
uniform float audioDrop;
uniform float audioBass;
uniform float audioKick;
uniform float audioLevel;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioValence;

uniform float widthP;
uniform float speedP;
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

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float build = clamp(audioBuildUp, 0.0, 1.0);
    float drop  = clamp(audioDrop, 0.0, 1.0);
    // Walls close in with the build-up: from wide to tight.
    float W = (widthP > 0.3 ? widthP : 1.0) * mix(1.2, 0.55, build);
    float H = 0.8 * mix(1.0, 0.6, build);
    float travel = sceneAdvance * 1.6 * (speedP > 0.05 ? speedP : 1.0) + sceneTime * 0.3;

    vec3 dir = normalize(vec3(p.x, p.y, 1.3));
    float tx = W / max(abs(dir.x), 1e-4);
    float ty = H / max(abs(dir.y), 1e-4);
    float t  = min(tx, ty);
    vec3 hit = dir * t;
    float wall = (tx < ty) ? 0.0 : ((dir.y < 0.0) ? 1.0 : 2.0);
    float wz = hit.z + travel;

    // Light: cool and open when relaxed, red and close under pressure; the
    // drop floods the far end.
    vec3 calmCol = imgPalette(hue * 0.159 + 0.55);
    vec3 tenseCol = imgPalette(hue * 0.159 + 0.02) * 1.3 + vec3(0.3, 0.0, 0.0);
    vec3 lightCol = mix(calmCol, tenseCol, build);

    // Ribs every 2 units, lamps on them flashing with the kick.
    float rib = pow(0.5 + 0.5 * cos(wz * 3.14159265), 14.0);
    float lamp = rib * (0.4 + 1.2 * audioKick);
    vec3 col;
    if (wall < 0.5)
    {
        vec2 uv = vec2(fract(wz * 0.1), hit.y / H * 0.5 + 0.5);
        col = img(uv) * lightCol * 1.6 * (0.35 + 0.4 * audioLevel);
        // Pressure lines: the walls show stress fractures as the build rises.
        float stress = pow(0.5 + 0.5 * sin(hit.y * 40.0 + wz * 2.0), 20.0) * build;
        col += tenseCol * stress * 0.6;
    }
    else if (wall < 1.5)
    {
        vec2 uv = vec2(fract(hit.x / W * 0.5 + 0.5), fract(wz * 0.1));
        col = img(uv) * lightCol * 0.9 * (0.3 + 0.3 * audioLevel);
        col += lightCol * (0.15 + 0.8 * clamp(audioBass, 0.0, 1.0)) * exp(-abs(hit.x) / W * 2.5) * 0.5;
    }
    else
    {
        col = lightCol * 0.25 * (0.4 + 0.5 * audioLevel);
    }
    col += lightCol * lamp * 0.9;

    // The far end: a bright opening that floods on the drop and glows with
    // the build (the pressure has somewhere to go).
    float far = exp(-hit.z * 0.12);
    float ahead = exp(-dot(p, p) * 6.0);
    col += mix(calmCol, vec3(1.0, 0.95, 0.9), drop) * ahead * (0.15 + 0.4 * build + 2.5 * drop);
    // Fog toward the far end, colour of the current light.
    float fog = 1.0 - exp(-hit.z * 0.16);
    col = mix(col, lightCol * (0.03 + 0.3 * drop), clamp(fog, 0.0, 0.95));
    col *= 0.85 + 0.35 * audioSwell;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
