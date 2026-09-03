#version 330 core
out vec4 fragColor;
/**
 * @file HurricaneEyeWall.frag
 * @brief HURRICANE EYE WALL: standing in the eye.  All around, the stadium
 * of the eyewall rises -- a tilted amphitheatre of cloud turning steadily
 * on the scene clock -- and above, the calm blue sky.  The wall's height
 * is the swell, lightning flickers in it on the kick, the sea below heaves
 * with the bass, and the photo is the cloud texture of the wall.  Camera
 * fixed, looking across the eye.
 *
 * Audio Reactivity:
 *   sceneAdvance -> the wall's rotation (continuous)
 *   audioSwell   -> wall height (slow)
 *   audioKick    -> lightning in the wall (light)
 *   audioBass    -> the sea's light (light)
 *   audioLevel   -> brightness
 *
 * Per-activation variety: radiusP, tiltP, hueP.
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
uniform float audioKick;
uniform float audioBass;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float radiusP;
uniform float tiltP;
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

float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise2(vec2 p)
{
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p)
{
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; ++i) { v += a * noise2(p); p = p * 2.03 + 5.0; a *= 0.5; }
    return v;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float R = 6.0 + 4.0 * clamp(radiusP, 0.0, 1.0);                   // eye radius (world units)
    float tilt = 0.15 + 0.25 * clamp(tiltP, 0.0, 1.0);                 // the wall leans outward
    float wallH = (5.0 + 5.0 * clamp(radiusP, 0.0, 1.0)) * (0.7 + 0.6 * clamp(audioSwell, 0.0, 1.0));
    float rot = sceneAdvance * 0.12 + sceneTime * 0.025;
    float bass = clamp(audioBass, 0.0, 1.0);

    // Camera at the eye centre, 1.5 units above the sea, looking +z; a ray
    // per pixel: it hits the wall cylinder (radius R, leaning by tilt) or
    // the sea plane, or escapes to the sky above the wall.
    vec3 ro = vec3(0.0, 1.5, 0.0);
    vec3 rd = normalize(vec3(p.x, p.y, 1.1));
    vec3 col;
    // Sea plane y = 0.
    float tSea = (rd.y < -1e-3) ? -ro.y / rd.y : 1e9;
    // Wall: a cone opening upward: radius(y) = R + tilt * y.  Solve
    // |xz(t)| = R + tilt * y(t) approximately by iteration.
    float tWall = 1e9;
    {
        float t = R;
        for (int i = 0; i < 6; ++i)
        {
            vec3 q = ro + rd * t;
            float rr = length(q.xz);
            float target = R + tilt * max(q.y, 0.0);
            float f = rr - target;
            float df = dot(normalize(q.xz), rd.xz) - tilt * rd.y;
            t -= f / max(abs(df), 0.2) * sign(df);
            t = max(t, 0.5);
        }
        vec3 q = ro + rd * t;
        if (q.y < wallH && t > 0.5) tWall = t;
    }
    if (tSea < tWall)
    {
        // The sea: dark, heaving swell lines, lit by the bass and the sky.
        vec3 q = ro + rd * tSea;
        float swellLines = 0.5 + 0.5 * sin(length(q.xz) * 1.5 - sceneAdvance * 0.8 + fbm(q.xz * 0.3) * 4.0);
        vec3 sea = mix(vec3(0.05, 0.12, 0.18), vec3(0.15, 0.3, 0.35), swellLines * (0.4 + 0.6 * bass));
        sea += vec3(0.3, 0.5, 0.6) * pow(swellLines, 6.0) * bass * 0.4;
        float fog = 1.0 - exp(-tSea * 0.05);
        col = mix(sea, vec3(0.5, 0.55, 0.6), fog * 0.6);
    }
    else if (tWall < 1e8)
    {
        // The wall: cloud texture (the photo) turning; lit from the top,
        // dark at the base; lightning on the kick.
        vec3 q = ro + rd * tWall;
        float ang = atan(q.z, q.x) + rot;
        vec2 wuv = vec2(ang / 6.2831853 * 3.0, q.y / wallH);
        vec3 cloud = img(fract(wuv)) * 0.6 + 0.35;
        float bil = fbm(vec2(ang * 3.0, q.y * 0.4) + vec2(0.0, -sceneAdvance * 0.05));
        cloud *= 0.6 + 0.6 * bil;
        cloud = mix(cloud, cloud * imgPalette(hue * 0.159 + 0.6) * 1.5, 0.2);
        float heightLight = 0.25 + 0.75 * pow(q.y / wallH, 0.7);
        col = cloud * heightLight;
        // Lightning: a localised branching flash (never the whole wall) on the kick.
        float bolt = pow(fbm(vec2(ang * 6.0, q.y * 0.5 + sceneAdvance)), 5.0) * 8.0;
        float sector = exp(-pow(sin(ang * 0.5 - sceneAdvance * 0.2), 2.0) * 12.0);
        col += vec3(1.0, 0.95, 0.9) * bolt * sector * audioKick * 0.5;
        float fog = 1.0 - exp(-tWall * 0.03);
        col = mix(col, vec3(0.6, 0.65, 0.7), fog * 0.4);
    }
    else
    {
        // The sky above the wall: calm blue, the sun.
        col = mix(vec3(0.45, 0.65, 0.95), vec3(0.8, 0.9, 1.0), smoothstep(0.6, 0.0, rd.y));
        col += vec3(1.0, 0.95, 0.85) * pow(max(dot(rd, normalize(vec3(0.3, 0.8, 0.5))), 0.0), 60.0) * 1.5;
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
