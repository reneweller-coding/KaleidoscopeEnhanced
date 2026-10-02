#version 330 core
out vec4 fragColor;   ///< The pixel's colour (output).
/**
 * @file ParametricPavilion.frag
 * @brief PARAMETRIC PAVILION: a white, flowing interior in the manner of Zaha
 * Hadid -- walls, floor and ceiling one continuous surface that swells,
 * twists and folds as it runs ahead, with long slit skylights curving
 * along it, and in its creases lines of light that follow the curvature
 * and run along the surfaces in the rhythm.  All white, glossy, soft
 * shadows gathering in the folds.  The camera glides slowly through.
 *
 * The space is a deformed tube with a flat floor, ray-marched as a signed
 * distance field.
 *
 * Audio Reactivity:
 *   audioBass   -> the brightness of the light lines (light)
 *   audioKick   -> pulses running along them (light)
 *   audioSwell  -> the daylight through the skylights (slow)
 *   audioLevel  -> brightness
 *   sceneTime / sceneAdvance -> the glide (constant speed), the running light
 *
 * Per-activation variety: twistP (how strongly the space twists), hueP.
 */

uniform vec2  resolution;   ///< Size of the render target in pixels.
uniform float time;   ///< Seconds since the program started (never reset; see sceneTime).
uniform sampler2D tex0;   ///< The current photo.
uniform sampler2D tex1;   ///< The next photo (cross-faded in by interpolation).
uniform float interpolation;   ///< Cross-fade between the photos: 1 = tex0, 0 = tex1.

uniform float sceneTime;   ///< Seconds since this scene was activated.
uniform float sceneAdvance;   ///< The music's advance since this scene was activated (integrated, never jumps).
uniform float audioAdvance;   ///< The music's advance: integrated tempo-weighted energy (never jumps, never runs backwards).
uniform float audioBass;   ///< Bass band level, 0..1.
uniform float audioKick;   ///< Kick-drum envelope, 0..1 (fast attack, short decay).
uniform float audioSwell;   ///< Slow loudness envelope, 0..1 (seconds).
uniform float audioLevel;   ///< Overall loudness, 0..1.
uniform float audioValence;   ///< Mood valence: 0 dark .. 1 bright.
uniform float audioChromaHue;   ///< Hue of the dominant pitch class (radians, unwrapped: continuous).

uniform float twistP;   ///< Twist knob, 0..1.
uniform float hueP;   ///< Hue knob (radians), usually the music's chroma hue plus a rolled offset.

/// @brief The photo at a coordinate: the cross-fade of tex0 and tex1.
vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

/// @brief The house palette: a colour of the photo on an arc that turns with the music's hue.
vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

float gTw;

/// The cross-section's centre drifts and the section twists along z.
vec2 axis(float z) { return vec2(0.9 * sin(z * 0.11), 0.4 * sin(z * 0.08 + 1.0)); }

/// Section coordinates: angle around the axis (twisted) and the radius.
float radiusAt(float th, float z)
{
    return 3.0 + 0.7 * sin(th * 2.0 + z * 0.23 * gTw) + 0.35 * sin(th * 3.0 - z * 0.17 + 2.0) + 0.25 * sin(z * 0.31);
}

float sdf(vec3 p)
{
    vec2 q = p.xy - axis(p.z);
    float th = atan(q.y, q.x) + gTw * 0.12 * p.z;
    float tube = radiusAt(th, p.z) - length(q);
    // Signed distance scaled down: the radius varies, so steps must be careful.
    tube *= 0.7;
    float floorD = p.y + 1.6;
    return min(tube, floorD);
}

vec3 normalAt(vec3 p)
{
    vec2 e = vec2(0.01, 0.0);
    return normalize(vec3(sdf(p + e.xyy) - sdf(p - e.xyy),
                          sdf(p + e.yxy) - sdf(p - e.yxy),
                          sdf(p + e.yyx) - sdf(p - e.yyx)));
}

/// @brief Entry point of this shader stage (the file description says what it draws).
void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 uv = gl_FragCoord.xy / resolution;
    vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
    float bass = clamp(audioBass, 0.0, 1.0);
    float kick = clamp(audioKick, 0.0, 1.0);
    float swell = clamp(audioSwell, 0.0, 1.0);
    float T = sceneTime + sceneAdvance * 0.4;
    gTw = 0.5 + 1.0 * clamp(twistP, 0.0, 1.0);

    // Gliding along the space's axis, eyes a little above the floor.
    float zc = T * 0.45;
    vec3 ro = vec3(axis(zc).x * 0.7, 0.1, zc);
    vec3 look = vec3(axis(zc + 6.0).x * 0.7, 0.3, zc + 6.0);
    vec3 fw = normalize(look - ro);
    vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));
    vec3 up = cross(fw, rt);
    vec3 rd = normalize(p.x * rt + p.y * up + 1.0 * fw);

    float t = 0.05;
    float d = 0.0;
    for (int i = 0; i < 110; ++i) {
        d = sdf(ro + rd * t);
        if (abs(d) < 0.002 * t || t > 60.0) break;
        t += d;
    }
    vec3 P = ro + rd * t;
    vec3 n = normalAt(P);

    // Surface coordinates for the skylights and light lines.
    vec2 q = P.xy - axis(P.z);
    float th = atan(q.y, q.x) + gTw * 0.12 * P.z;
    float tubeD = (radiusAt(th, P.z) - length(q)) * 0.7;
    bool isFloor = (P.y + 1.6) < tubeD;

    // Soft occlusion from the distance field.
    float ao = 0.0;
    for (int k = 1; k <= 4; ++k) {
        float h = 0.15 * float(k);
        ao += (h - sdf(P + n * h)) / h;
    }
    ao = clamp(1.0 - 0.3 * ao, 0.2, 1.0);

    // Daylight from above; the skylight slits curve along the ceiling.
    float sky = max(dot(n, normalize(vec3(0.2, -1.0, 0.1))) * -1.0, 0.0);
    vec3 white = vec3(0.93, 0.93, 0.95) * 1.4;
    vec3 col = white * (0.62 + 0.35 * max(dot(n, vec3(0.0, 1.0, 0.0)), 0.0) + 0.18 * max(-n.y, 0.0) + 0.1 * n.x) * ao;
    col *= 0.85 + 0.25 * swell;
    if (!isFloor) {
        // Skylight slits: bright bands winding across the ceiling.
        float slit = sin(th * 2.0 + P.z * 0.35);
        float sl = smoothstep(0.93, 0.97, slit) * smoothstep(-0.2, 0.6, q.y);
        col = mix(col, vec3(1.0, 1.0, 1.02) * (1.6 + 0.8 * swell), sl);
        // Light lines in the creases: iso-lines of the fold field, running.
        float field = th * 3.0 + P.z * 0.5 * gTw;
        float fl = abs(fract(field / 6.2831853 * 3.0) - 0.5);
        float fwl = min(fwidth(field / 6.2831853 * 3.0), 0.08) * 1.2 + 0.004;   // capped: the angle wraps
        float line = smoothstep(fwl + 0.01, 0.0, fl - 0.005) * (1.0 - sl);
        float run = pow(0.5 + 0.5 * sin(P.z * 1.2 - T * 1.5 + th), 6.0);
        vec3 lc = mix(vec3(0.7, 0.85, 1.0), imgPalette(0.55 + hueP * 0.159) * 1.3, 0.35);
        col += lc * line * (0.25 + 1.2 * bass + run * (0.4 + 1.5 * kick)) * exp(-t * 0.03);
    } else {
        // The glossy floor mirrors the bright skylights faintly.
        vec3 rr = reflect(rd, n);
        float t2 = 0.05;
        for (int i = 0; i < 40; ++i) {
            float d2 = sdf(P + n * 0.02 + rr * t2);
            if (d2 < 0.01 || t2 > 30.0) break;
            t2 += d2;
        }
        vec3 R = P + rr * t2;
        vec2 rq = R.xy - axis(R.z);
        float rth = atan(rq.y, rq.x) + gTw * 0.12 * R.z;
        float rsl = smoothstep(0.93, 0.97, sin(rth * 2.0 + R.z * 0.35)) * smoothstep(-0.2, 0.6, rq.y);
        col += vec3(1.0) * rsl * 0.35 * exp(-t2 * 0.05);
        col += white * 0.08 * max(rr.y, 0.0);
    }
    // Depth: the far end glows white.
    col = mix(col, vec3(0.96, 0.97, 1.0) * 1.5, 1.0 - exp(-t * 0.02));

    col *= 0.9 + 0.2 * audioLevel;
    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
