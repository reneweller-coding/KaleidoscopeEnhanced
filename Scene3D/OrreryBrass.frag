#version 330 core
out vec4 fragColor;
/**
 * @file OrreryBrass.frag
 * @brief Fragment stage for OrreryBrass: a dark study (the photo as the
 * bookshelves), the brass base engraved with rings, the arms and column
 * in warm brass, the sun lamp glowing with the bass, the planets as photo
 * spheres lit from the sun side (the orbit angle gives the terminator),
 * moons as small ivory beads; the kick glints the brass, the treble the
 * engraving.
 *
 * Audio Reactivity: audioBass -> sun lamp; audioKick -> brass glints;
 *                   audioHigh -> engraving sparkle; audioSwell -> study light; audioLevel.
 */
in vec2  vTexCoord;
in vec3  vWorld;
in float vKind;
in float vAux;
in float vId;

uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform float sceneAdvance;
uniform float audioBass;
uniform float audioKick;
uniform float audioHigh;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioAdvance;
uniform float audioValence;
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
    float hue = (hueP > 0.001) ? hueP : 0.0;
    float light = 0.8 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    vec3 brass = mix(vec3(0.85, 0.65, 0.3), imgPalette(hue * 0.159 + 0.1), 0.2);
    vec3 col;
    if (vKind < -0.5)
    {
        vec2 uv = vTexCoord;
        col = img(uv) * imgPalette(hue * 0.159 + 0.55) * 0.6 * light + 0.05;
        col *= 0.5 + 0.6 * exp(-length(uv - vec2(0.5, 0.4)) * 2.0);
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 4.5)
    {
        col = brass * 0.7 * light;                                          // orbit rings on the base
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 3.5)
    {
        col = brass * (0.5 + 0.5 * (1.0 - abs(vTexCoord.y - 0.5) * 2.0)) * light + vec3(1.0) * audioKick * 0.3;   // arms and column
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 2.5)
    {
        // The sun lamp: a glowing round bulb.
        vec2 d = (vTexCoord - 0.5) * 2.0;
        float r = length(d);
        if (r > 1.0) discard;
        col = mix(vec3(1.0, 0.85, 0.5), imgPalette(hue * 0.159 + 0.08), 0.2) * (1.2 + 1.2 * bass) * (1.0 - r * r * 0.5);
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 1.5)
    {
        // The base disc: brass with engraved concentric rings and a zodiac
        // band, sparkling on the treble.
        vec2 d = (vTexCoord - 0.5) * 2.0;
        float r = length(d);
        if (r > 1.0) discard;
        float rings = pow(0.5 + 0.5 * sin(r * 60.0), 8.0);
        float zodiac = smoothstep(0.02, 0.0, abs(r - 0.92)) + smoothstep(0.02, 0.0, abs(r - 0.82));
        float tick = pow(0.5 + 0.5 * sin(atan(d.y, d.x) * 12.0), 40.0) * step(0.82, r) * step(r, 0.92);
        col = brass * (0.42 + 0.3 * rings + 0.35 * zodiac + 0.5 * tick) * light;
        col += vec3(1.0) * (rings + tick) * clamp(audioHigh * 2.0, 0.0, 1.0) * 0.25;
        col += vec3(1.0, 0.9, 0.7) * exp(-r * 3.0) * bass * 0.3;
        fragColor = vec4(col, 1.0);
        return;
    }
    if (vKind > 0.5)
    {
        // A moon: ivory bead.
        vec2 d = (vTexCoord - 0.5) * 2.0;
        float r = length(d);
        if (r > 1.0) discard;
        col = vec3(0.9, 0.88, 0.8) * (0.4 + 0.6 * sqrt(1.0 - r * r)) * light;
        fragColor = vec4(col, 1.0);
        return;
    }
    // A planet: the photo wrapped on a sphere, lit from the sun (the centre
    // of the table): the terminator from the orbit angle.
    vec2 d = (vTexCoord - 0.5) * 2.0;
    float r = length(d);
    if (r > 1.0) discard;
    float nz = sqrt(1.0 - r * r);
    vec3 n = vec3(d, nz);
    // The sun direction in screen terms: toward the table centre, i.e. -(cos ang, 0) roughly.
    vec3 L = normalize(vec3(-cos(vAux), 0.3, 0.6 * sin(vAux) + 0.5));
    float diff = max(dot(n, L), 0.0);
    vec2 puv = vec2(fract(atan(d.x, nz) / 6.2831853 + sceneAdvance * 0.05 + vId * 0.2), 0.5 + d.y * 0.5);
    vec3 photo = img(puv);
    col = mix(photo * 1.3, imgPalette(hue * 0.159 + vId * 0.13), 0.25) * (0.15 + 0.95 * diff) * (0.7 + 0.6 * bass) * light;
    col += vec3(1.0) * pow(max(dot(n, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 40.0) * 0.4;
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
