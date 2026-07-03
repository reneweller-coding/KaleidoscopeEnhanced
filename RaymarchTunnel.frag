// RaymarchTunnel.frag
// A cheap 3D ray-marched tunnel whose walls are papered with the SOURCE IMAGE,
// mirror-folded around the bore so the picture radiates like a kaleidoscopic
// wormhole.  The camera flies forward with the music (audioAdvance/audioPhase),
// the walls breathe with the bass, beats flash and the image brightens.  The
// *image* is the star (it used to be dim under heavy fog).
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioBeat;
uniform float audioLevel;
uniform float audioBass;
uniform float audioValence;
uniform float audioAdvance;
uniform float audioPhase;

const float PI = 3.14159265358979;

vec3 img(vec2 uv) { return (interpolation * texture2D(tex0, uv)
                          + (1.0 - interpolation) * texture2D(tex1, uv)).rgb; }

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

    // Mirror-fold the angle so the image radiates in symmetric wedges.
    float sides = floor(2.0 + 6.0 * audioValence);
    float seg   = 2.0 * PI / sides;
    float fang  = abs(mod(ang + PI, seg) - 0.5 * seg) / (0.5 * seg);   // 0..1 mirrored
    vec2  wuv   = vec2(fang, hit.z * 0.15);

    vec3 pic = img(fract(wuv));
    float fog = exp(-0.06 * t);                        // lighter fog = brighter walls
    vec3 col  = pic * fog * (0.75 + 0.9 * audioLevel);
    col += fog * audioBeat * 0.35;

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
