// Starfield.frag
// Flying through a layered starfield that accelerates with the music
// (audioAdvance) and rolls with the audio phase.  Beats add a flash.
// Colour stays near-white; the global mood grade tints it.
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioBeat;
uniform float audioLevel;
uniform float audioAdvance;
uniform float audioPhase;

const float PI = 3.14159265358979;

float hash21(vec2 p)
{
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
}

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;

    float speed = time * 0.25 + audioAdvance * 3.5 + audioPhase * 0.5;
    float rot   = audioPhase * 0.2 + time * 0.03;
    mat2  R     = mat2(cos(rot), -sin(rot), sin(rot), cos(rot));
    uv = R * uv;

    vec3 col = vec3(0.0);
    for (int i = 0; i < 4; i++)
    {
        float fi    = float(i);
        float depth = fract(speed * 0.12 + fi * 0.25);   // 0..1, loops
        float scale = mix(18.0, 0.6, depth);             // zoom in as depth → 1
        vec2  g  = uv * scale + fi * 37.2;
        vec2  gi = floor(g);
        vec2  gf = fract(g) - 0.5;
        float h  = hash21(gi);
        float star = step(0.92, h) * smoothstep(0.35, 0.0, length(gf));
        float fade = sin(depth * PI);                    // fade in far, out near
        col += star * fade * (0.5 + 0.7 * audioLevel);
    }

    col += audioBeat * 0.15;
    col *= vec3(0.95, 0.97, 1.08);

    vec2 iuv = gl_FragCoord.xy / resolution.xy;
    vec4 img = interpolation * texture2D(tex0, iuv) + (1.0 - interpolation) * texture2D(tex1, iuv);
    col = max(col, img.rgb * 0.12);                      // faint image backdrop

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
