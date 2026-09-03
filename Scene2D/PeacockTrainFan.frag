#version 330 core
out vec4 fragColor;
/**
 * @file PeacockTrainFan.frag
 * @brief PEACOCK TRAIN FAN: the train fanning open.  A fan of feathers
 * spreads with the swell (the fan angle is a slow envelope), each feather
 * a barbed shaft ending in an eyespot of the photo ringed in iridescent
 * blue-green; the eyespots shimmer with the treble (structural colour
 * shifts with angle), the shafts glint on the kick, the bass warms the
 * body of the bird at the base.  Camera fixed in front of the display.
 *
 * Audio Reactivity:
 *   audioSwell   -> fan opening (slow)
 *   audioHigh    -> eyespot shimmer (light)
 *   audioKick    -> shaft glint (light)
 *   audioBass    -> body warmth (light)
 *   sceneAdvance -> a slow quiver of the feathers (continuous)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: feathersP, eyeP, hueP.
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
uniform float audioHigh;
uniform float audioKick;
uniform float audioBass;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float feathersP;
uniform float eyeP;
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

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float nF = floor(18.0 + 14.0 * clamp(feathersP, 0.0, 1.0));      // feathers, once per activation
    float eyeSize = 0.05 + 0.03 * clamp(eyeP, 0.0, 1.0);
    float open = 0.35 + 0.65 * clamp(audioSwell, 0.0, 1.0);            // fan opening
    float hi = clamp(audioHigh * 2.0, 0.0, 1.0);
    float quiver = 0.02 * sin(sceneAdvance * 1.5);
    vec2 base = vec2(0.0, -0.55);

    // Background: the photo dark and soft, a garden.
    vec3 col = (interpolation * textureLod(tex0, gl_FragCoord.xy / resolution, 3.0) + (1.0 - interpolation) * textureLod(tex1, gl_FragCoord.xy / resolution, 3.0)).rgb;
    col *= imgPalette(hue * 0.159 + 0.35) * 0.35;
    vec3 iridA = mix(vec3(0.1, 0.5, 0.35), imgPalette(hue * 0.159 + 0.4), 0.3);
    vec3 iridB = mix(vec3(0.15, 0.25, 0.7), imgPalette(hue * 0.159 + 0.65), 0.3);

    vec2 q = p - base;
    float r = length(q);
    float a = atan(q.x, q.y);                                          // 0 = straight up
    float spread = 1.5 * open;                                         // half-angle of the fan
    // Feather index from the angle within the fan.
    float fi = (a / spread * 0.5 + 0.5) * nF;
    float idx = floor(fi);
    float within = fract(fi) - 0.5;
    float inFan = step(abs(a), spread) * step(r, 1.05);
    if (inFan > 0.5)
    {
        float fa = (idx + 0.5) / nF * 2.0 - 1.0;                       // -1..1 across the fan
        float len = 0.85 + 0.15 * hash11(idx * 3.3) + quiver * hash11(idx * 5.5);
        float shaft = smoothstep(0.06, 0.0, abs(within)) * step(r, len);
        // Barbs: fine lines fanning off the shaft, iridescent by angle.
        float barb = pow(0.5 + 0.5 * sin(r * 160.0 + within * 30.0), 3.0) * step(r, len) * (1.0 - smoothstep(0.35, 0.5, abs(within)));
        float irid = 0.5 + 0.5 * sin(r * 6.0 + fa * 3.0 + hi * 2.0 + sceneAdvance * 0.3);
        vec3 feather = mix(iridA, iridB, irid) * (0.4 + 0.6 * barb) * (0.5 + 0.5 * r / len);
        // The eyespot near the tip: the photo in a ring of blue, gold, green.
        vec2 tip = base + vec2(sin((fa) * spread), cos((fa) * spread)) * (len - 0.1);
        float ed = length(p - tip);
        float eye = smoothstep(eyeSize, eyeSize * 0.9, ed);
        vec3 eyeCol = img(clamp((p - tip) / eyeSize * 0.5 + 0.5, 0.0, 1.0)) * 1.3;
        float ring1 = smoothstep(0.012, 0.0, abs(ed - eyeSize * 0.75));
        float ring2 = smoothstep(0.012, 0.0, abs(ed - eyeSize * 0.92));
        eyeCol = mix(eyeCol, mix(vec3(0.2, 0.3, 0.9), imgPalette(hue * 0.159 + 0.6), 0.3) * 1.5, ring1);
        eyeCol = mix(eyeCol, vec3(0.9, 0.7, 0.2) * 1.3, ring2);
        eyeCol *= 0.8 + 0.5 * hi * (0.5 + 0.5 * sin(sceneAdvance * 2.0 + idx));
        feather = mix(feather, eyeCol, eye);
        // Shaft glint on the kick.
        feather += vec3(1.0, 0.95, 0.8) * shaft * (0.15 + 0.9 * audioKick);
        float mask = max(barb * 0.9, max(shaft, eye));
        col = mix(col, feather, clamp(mask, 0.0, 1.0));
    }
    // The bird: a blue body and head at the base, warmed by the bass.
    float body = smoothstep(0.16, 0.15, length((p - base - vec2(0.0, 0.08)) * vec2(1.05, 1.0)));
    // A slender S-curved neck, a small head with a beak to the left and a crest of three stalks.
    float neck = smoothstep(0.024, 0.02, abs(p.x - 0.012 * sin((p.y - base.y) * 9.0))) * step(base.y + 0.18, p.y) * step(p.y, base.y + 0.5);
    vec2 hq = p - base - vec2(0.0, 0.52);
    float head = smoothstep(0.04, 0.035, length(hq * vec2(1.0, 1.15)));
    float beakX = -(hq.x + 0.035);
    float beak = step(0.0, beakX) * step(beakX, 0.055) * step(abs(hq.y + 0.005), 0.011 * (1.0 - beakX / 0.055));
    float crest = 0.0;
    for (int c = -1; c <= 1; ++c)
    {
        vec2 tip = vec2(float(c) * 0.035, 0.1 - 0.012 * abs(float(c)));
        crest = max(crest, smoothstep(0.012, 0.009, length(hq - tip)));
        vec2 e = tip - vec2(0.0, 0.03); float tt = clamp(dot(hq - vec2(0.0, 0.03), e) / dot(e, e), 0.0, 1.0);
        crest = max(crest, smoothstep(0.004, 0.002, length(hq - vec2(0.0, 0.03) - e * tt)));
    }
    head = max(head, max(beak, crest));
    vec3 blue = mix(vec3(0.1, 0.25, 0.8), imgPalette(hue * 0.159 + 0.65), 0.3) * (0.7 + 0.6 * clamp(audioBass, 0.0, 1.0));
    col = mix(col, blue * (0.7 + 0.3 * (p.y - base.y)), max(body, max(neck, head)));
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
