#version 330 core
out vec4 fragColor;
uniform vec2 resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;
uniform int positive;// = 0; //positive or negative display
uniform float posX;
uniform float posY;
uniform float posZ;
uniform float divisor;
uniform float fiOffset;//original = 0.1
//uniform float timefactor;
uniform float audioAdvance;   // integrated drift: the inkblot morphs with the music (jump-free)
uniform float audioKick;      // kick throb on the blot intensity
uniform float audioLevel;     // louder music = denser ink


vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x),
               mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p)
{
    float v = 0.0, a = 0.55;
    for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 17.7; a *= 0.5; }
    return v;
}

// USER-FEEDBACK-REDESIGN: a real, ever-morphing Rorschach inkblot — an fbm
// ink field mirrored on the vertical axis, breathing with the music, on a
// warm paper ghost of the photo.  The old 124-metaball loop collapsed into
// a static heart (and inverted to solid black on hot audio).
void main(void)
{
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
    p.x = abs(p.x);                        // the fold — perfect mirror symmetry

    // Per-activation character from the legacy params: seed + scale.
    float seed  = fiOffset * 13.7 + posX * 5.1 + posY * 3.3;
    float scale = 2.4 + 2.0 * clamp(divisor * 20.0, 0.0, 1.0) + posZ;

    // The blot MORPHS continuously: slow base clock + music advance.
    float mt = time * 0.05 + audioAdvance * 0.35;
    vec2  q  = p * scale + vec2(seed, seed * 0.7);
    float f1 = fbm(q + vec2(mt, mt * 0.6));
    float f2 = fbm(q * 1.9 - vec2(mt * 0.7, mt) + f1 * 1.5);

    // Ink field: noise minus a centre-weighted falloff keeps the blot compact;
    // kick dilates it, level densifies the ink.
    float field = f1 * 0.85 + f2 * 0.55
                - dot(p, p) * (2.1 - 0.3 * audioLevel)
                + 0.05 * audioKick;
    float inkEdge = smoothstep(0.30, 0.40, field);          // main blot
    float spots   = smoothstep(0.24, 0.27, field)
                  * (1.0 - smoothstep(0.27, 0.30, field));  // satellite droplets
    float inner   = smoothstep(0.40, 0.75, field);          // dense core

    // Warm paper with a faint photo ghost; ink is a deep blue-black whose
    // edges pick up a whisper of the photo-arc colour.
    vec2 suv = gl_FragCoord.xy / resolution;
    vec3 paper = vec3(0.86, 0.82, 0.74) * (0.75 + 0.25 * img(suv));
    vec3 inkCol = vec3(0.035, 0.030, 0.055)
                + img(clamp(vec2(0.5) + p * 0.2, 0.0, 1.0)) * 0.10 * (1.0 - inner);

    float ink = clamp(inkEdge + spots * 0.85, 0.0, 1.0)
              * (0.88 + 0.12 * audioLevel);
    vec3 col = mix(paper, inkCol, ink);

    if (positive > 0)
        col = mix(inkCol, paper, ink);     // inverted plate

    fragColor = vec4(col, 1.0);
}
