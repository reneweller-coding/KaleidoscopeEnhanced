// Starfield.frag
// Flying INTO the source image: the picture is radially zoomed in looping
// layers so it rushes past the camera like a nebula, with a sparkling star
// warp-field on top.  Accelerates with the music (audioAdvance), rolls with the
// audio phase, beats add a flash.  The *image* is the star (was a 12% backdrop).
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

vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }

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

    // Nebula: two looping depth layers of the image rushing toward the camera.
    vec3 col = vec3(0.0);
    for (int k = 0; k < 2; k++)
    {
        float depth = fract(speed * 0.06 + float(k) * 0.5);   // 0..1 loop
        float zscale = mix(2.2, 0.15, depth);                 // zoom in as depth -> 1
        vec2  iuv = uv * zscale * 0.5 + 0.5;
        float fade = sin(depth * PI);                         // fade in far, out near
        col += img(fract(iuv)) * fade * (0.45 + 0.6 * audioLevel);
    }

    // Star warp-field sparkling over the nebula.
    vec3 stars = vec3(0.0);
    for (int i = 0; i < 4; i++)
    {
        float fi    = float(i);
        float depth = fract(speed * 0.12 + fi * 0.25);
        float scale = mix(18.0, 0.6, depth);
        vec2  g  = uv * scale + fi * 37.2;
        vec2  gi = floor(g);
        vec2  gf = fract(g) - 0.5;
        float h  = hash21(gi);
        float star = step(0.92, h) * smoothstep(0.35, 0.0, length(gf));
        float fade = sin(depth * PI);
        stars += star * fade * (0.6 + 0.8 * audioLevel);
    }
    col += stars * vec3(0.95, 0.97, 1.08);

    col += audioBeat * 0.15;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
