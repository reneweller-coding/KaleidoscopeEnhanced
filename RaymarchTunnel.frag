// RaymarchTunnel.frag
// A cheap 3D ray-marched tunnel.  The camera flies forward with the music
// (audioAdvance/audioPhase), the walls breathe with the bass, beats flash.
// Colour is left fairly neutral — the global mood grade tints it.
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioBeat;
uniform float audioLevel;
uniform float audioBass;
uniform float audioAdvance;
uniform float audioPhase;

const float PI = 3.14159265358979;

// Distance to the inside of a wobbling cylindrical tunnel wall.
float mapTunnel(vec3 p, float bass)
{
    p.xy += 0.35 * vec2(sin(p.z * 0.30), cos(p.z * 0.25));   // tunnel snakes
    float radius = 1.0 + 0.15 * bass;                        // bass widens it
    return radius - length(p.xy);                            // >0 inside
}

void main()
{
    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;

    float fly = time * 1.2 + audioAdvance * 4.0;
    vec3 ro = vec3(0.0, 0.0, fly);
    // roll the camera slowly with the audio phase.
    float roll = audioPhase * 0.3 + time * 0.05;
    mat2 rot = mat2(cos(roll), -sin(roll), sin(roll), cos(roll));
    vec3 rd = normalize(vec3(rot * uv, 1.0));

    float t = 0.0;
    for (int i = 0; i < 48; i++)
    {
        vec3 p = ro + rd * t;
        float d = mapTunnel(p, audioBass);
        if (d < 0.01 || t > 25.0) break;
        t += max(d * 0.6, 0.02);
    }

    vec3 hit = ro + rd * t;
    float ang = atan(hit.y, hit.x);
    vec2 wuv  = vec2(ang / (2.0 * PI) + 0.5, hit.z * 0.15);

    vec4 img = interpolation * texture2D(tex0, wuv) + (1.0 - interpolation) * texture2D(tex1, wuv);
    float fog = exp(-0.09 * t);
    vec3 col = img.rgb * fog * (0.55 + 0.8 * audioLevel);
    col += fog * audioBeat * 0.30;

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
