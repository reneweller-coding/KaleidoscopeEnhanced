#version 330 core
out vec4 fragColor;
/**
 * @file InfinityMirrorRoom.frag
 * @brief INFINITY MIRROR ROOM: a mirrored box with real depth.  Instead of a
 * depth buffer the regress is built the way mirrors build it: space is
 * folded (mod + mirror), so a ray that leaves the room through a wall
 * re-enters a reflected copy, and every copy carries the same lamps and
 * the same photo panel.  The copies recede to infinity with a fog that
 * thickens on the sub-bass, so the room breathes deeper and shallower with
 * the low end.  Lamps pulse on the kick (light); the camera drifts slowly
 * on the scene clock, never on the beat.
 *
 * Audio Reactivity:
 *   audioSubBass  -> fog between the reflections (light)
 *   audioKick     -> the lamps flash (light)
 *   audioSwell    -> lamp warmth (slow)
 *   sceneAdvance  -> the slow drift and the turn of the view
 *   audioLevel    -> brightness
 *
 * Per-activation variety: roomP (room size), lampsP (lamp count), hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float audioAdvance;
uniform float audioSubBass;
uniform float audioKick;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float roomP;
uniform float lampsP;
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

// Mirror-fold a coordinate into [0, size]: the mirror room's tiling.
float foldM(float x, float size)
{
    float m = mod(x, 2.0 * size);
    return (m > size) ? 2.0 * size - m : m;
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    vec3 room = vec3(3.0, 2.2, 3.0) * (0.8 + 0.4 * clamp(roomP, 0.0, 1.0));
    float nLamps = floor((lampsP > 1.5 ? lampsP : 3.0) + 0.5);

    // Camera: inside the room, drifting slowly; a slow turn of the view.
    float t = sceneAdvance * 0.15 + sceneTime * 0.03;
    vec3 ro = vec3(room.x * 0.5 + 0.6 * sin(t * 0.7), room.y * 0.45 + 0.2 * sin(t * 0.5), room.z * 0.5 + 0.6 * cos(t * 0.6));
    float yaw = t * 0.4;
    vec3 rd = normalize(vec3(p.x, p.y, 1.4));
    rd = vec3(cos(yaw) * rd.x + sin(yaw) * rd.z, rd.y, -sin(yaw) * rd.x + cos(yaw) * rd.z);

    // March through the folded space: at each step we are inside SOME copy of
    // the room; the walls are where the fold flips.  We step to the next wall
    // analytically (box exit), accumulate lamp light and the photo panel of
    // each copy, and fog by distance.
    vec3 col = vec3(0.0);
    float trans = 1.0;
    float dist = 0.0;
    vec3 pos = ro;
    float fogK = 0.06 + 0.12 * clamp(audioSubBass, 0.0, 1.0);
    vec3 lampCol = mix(imgPalette(hue * 0.159 + 0.1), imgPalette(hue * 0.159 + 0.6), 0.5 * clamp(audioSwell, 0.0, 1.0)) * (1.0 + 1.5 * audioKick);
    for (int i = 0; i < 14; ++i)
    {
        // Exit distance from the current (unfolded) box cell.
        vec3 cellMin = floor(pos / room) * room;
        vec3 tMax = vec3(0.0);
        tMax.x = (rd.x > 0.0) ? (cellMin.x + room.x - pos.x) / rd.x : (cellMin.x - pos.x) / rd.x;
        tMax.y = (rd.y > 0.0) ? (cellMin.y + room.y - pos.y) / rd.y : (cellMin.y - pos.y) / rd.y;
        tMax.z = (rd.z > 0.0) ? (cellMin.z + room.z - pos.z) / rd.z : (cellMin.z - pos.z) / rd.z;
        float tExit = max(min(min(tMax.x, tMax.y), tMax.z), 1e-3);
        // Lamps in this copy: a ring of spheres near the ceiling; light the
        // ray segment by closest approach.
        vec3 localMin = cellMin;
        for (int k = 0; k < 5; ++k)
        {
            if (float(k) >= nLamps) break;
            float ak = float(k) * 6.2831853 / nLamps + sceneAdvance * 0.05;
            vec3 lp = localMin + vec3(room.x * (0.5 + 0.32 * cos(ak)), room.y * 0.8, room.z * (0.5 + 0.32 * sin(ak)));
            vec3 d = lp - pos;
            float along = clamp(dot(d, rd), 0.0, tExit);
            vec3 c = pos + rd * along;
            float r2 = dot(c - lp, c - lp);
            float glow = 0.09 / (r2 + 0.02);
            col += lampCol * imgPalette(hue * 0.159 + float(k) * 0.17) * glow * trans * exp(-(dist + along) * fogK) * 0.5;
        }
        // Wall hit: which wall, and the photo panel on the far z wall.
        vec3 hit = pos + rd * tExit;
        vec3 lp = (hit - cellMin) / room;               // 0..1 in the cell
        vec3 wallCol;
        if (tMax.z <= tMax.x && tMax.z <= tMax.y)
        {
            // A framed picture in the MIDDLE of the z wall; the rest of the wall
            // is dark mirror, so the regress (frames and lamps, copy after copy)
            // is what you see, not one photo filling the view.
            vec2 uv = vec2(foldM(lp.x, 1.0), lp.y);
            vec2 pu = (uv - 0.5) / vec2(0.5, 0.55) + 0.5;            // picture spans the middle half
            float inPic = step(0.0, pu.x) * step(pu.x, 1.0) * step(0.0, pu.y) * step(pu.y, 1.0);
            float frame = exp(-abs(min(min(pu.x, 1.0 - pu.x), min(pu.y, 1.0 - pu.y))) * 40.0) * inPic;
            wallCol = img(clamp(pu, 0.0, 1.0)) * 0.55 * inPic + imgPalette(hue * 0.159 + 0.9) * frame * 0.6
                    + imgPalette(hue * 0.159 + 0.6) * 0.02 * (1.0 - inPic);
        }
        else if (tMax.y <= tMax.x)
        {
            // Floor / ceiling: dark mirror with a faint tile grid.
            vec2 uv = lp.xz;
            float grid = smoothstep(0.0, 0.02, min(fract(uv.x * 4.0), fract(uv.y * 4.0)));
            wallCol = imgPalette(hue * 0.159 + 0.6) * 0.06 * grid;
        }
        else
        {
            vec2 uv = lp.zy;
            float grid = smoothstep(0.0, 0.02, min(fract(uv.x * 4.0), fract(uv.y * 4.0)));
            wallCol = imgPalette(hue * 0.159 + 0.3) * 0.05 * grid;
        }
        dist += tExit;
        // The mirror keeps most of the light (the regress) and shows a little
        // of the wall itself.
        float fogT = exp(-dist * fogK);
        col += wallCol * trans * fogT * 0.7;
        trans *= 0.82;
        pos = hit + rd * 1e-3;
        if (trans < 0.02) break;
    }
    // Fog colour fills what the regress left.
    col += imgPalette(hue * 0.159 + 0.6) * 0.03 * (1.0 - trans);
    col *= 0.8 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
