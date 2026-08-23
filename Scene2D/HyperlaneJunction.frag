#version 330 core
out vec4 fragColor;
/**
 * @file HyperlaneJunction.frag
 * @brief HYPERLANE JUNCTION: A massive cosmic traffic hub for FTL travel.
 * Neon-lit super-highways of light intersect in the void. Glowing pulses
 * (ships) zip past along these lanes at incredible speeds.
 *   audioAdvance -> camera flight speed through the junction
 *   audioKick    -> flashes from ships entering/exiting FTL
 *   audioSwell   -> brightness of the hyperlanes
 *   audioChromaHue-> palette offset for the neon lanes
 *
 * Per-activation variety:
 *   trafficP float density of the FTL traffic (0.5..1.5)
 *   laneP float complexity of the hyperlane grid (0.5..2.0)
 *   hueP float palette offset (0..6.28)
 */

uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float audioPhase;
uniform float audioAdvance;
uniform float audioSwell;
uniform float audioLevel;
uniform float audioKick;
uniform float audioCentroid;
uniform float audioValence;
uniform float audioChromaHue;

uniform float trafficP;
uniform float laneP;
uniform float hueP;

vec3 img(vec2 uv) {
    return (interpolation * texture(tex0, uv) + (1.0 - interpolation) * texture(tex1, uv)).rgb;
}

vec3 imgPalette(float t)
{
    float ang = audioChromaHue + audioAdvance * 0.04 + t * 6.2831853;
    float rad = 0.16 + 0.08 * sin(audioAdvance * 0.013);
    vec3  pc  = img(clamp(vec2(0.5) + rad * vec2(cos(ang), sin(ang)), 0.0, 1.0));
    float pg  = dot(pc, vec3(0.333));
    return mix(vec3(pg), pc, 0.55 + 0.45 * audioValence);
}

vec3 hueRot(vec3 c, float a) {
    vec3 k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash31(vec3 p)  { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

void main()
{
    float tp = (trafficP > 0.01 ? trafficP : 1.0);
    float lp = (laneP > 0.01 ? laneP : 1.0);
    float hue = (hueP > 0.01 ? hueP : 0.0);

    vec2 uv = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;

    float drift = time * 3.0 + audioAdvance * 10.0;

    vec3 ro = vec3(0.0, 0.0, drift);

    // Slow camera wandering
    ro.x += sin(time * 0.2) * 2.0;
    ro.y += cos(time * 0.3) * 2.0;

    vec3 ta = ro + vec3(sin(time * 0.1), cos(time * 0.1), 1.0);

    vec3 ww = normalize(ta - ro);
    vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
    vec3 vv = cross(uu, ww);

    float roll = 0.1 * sin(time * 0.2) + audioPhase * 0.1;
    vec2 ruv = mat2(cos(roll), -sin(roll), sin(roll), cos(roll)) * uv;
    vec3 rd = normalize(ruv.x * uu + ruv.y * vv + 1.2 * ww);

    vec3 col = vec3(0.0);

    vec3 laneColor = imgPalette(0.3);
    vec3 shipColor = imgPalette(0.8 + audioKick * 0.2);

    // Grid raymarching for hyperlanes (using 3D grid intersection approach)
    // We'll simulate glowing lines on a 3D grid.

    vec3 p = ro;
    float d = 0.0;

    for (int i = 0; i < 60; ++i) {
        vec3 q = ro + rd * d;

        // Grid coordinates
        vec3 gridP = fract(q * lp) - 0.5;
        vec3 id = floor(q * lp);

        // Distance to nearest grid lines
        vec3 distToLine = abs(gridP);
        float dLineX = max(distToLine.y, distToLine.z); // Line along X
        float dLineY = max(distToLine.x, distToLine.z); // Line along Y
        float dLineZ = max(distToLine.x, distToLine.y); // Line along Z

        // Minimum distance to any line
        float dl = min(min(dLineX, dLineY), dLineZ);

        // Smooth line rendering (volumetric accumulation)
        float lineThickness = 0.055 + 0.04 * audioSwell;   // floor so the lanes exist on quiet material
        if (dl < lineThickness) {
            // Check if this grid cell actually has a lane
            float h = hash31(id);
            if (h > 0.5) {
                float alpha = smoothstep(lineThickness, 0.0, dl);

                // Traffic pulses along the lines
                float speed = 5.0 + hash11(h) * 10.0;
                float dir = (hash11(h + 1.0) > 0.5) ? 1.0 : -1.0;

                // Determine which axis we are on to animate the pulse correctly
                float axisPos;
                if (dl == dLineX) axisPos = q.x;
                else if (dl == dLineY) axisPos = q.y;
                else axisPos = q.z;

                float pulse = step(0.95, fract(axisPos * 2.0 - time * speed * dir));

                // Kick flashes at intersections
                float intersection = step(0.9, hash31(id + floor(time * 5.0)));
                float flash = intersection * audioKick * 5.0;

                vec3 localCol = laneColor * alpha * (0.75 + audioSwell * 0.5);
                localCol += shipColor * pulse * alpha * (2.0 + audioKick * 2.0) * tp;
                localCol += vec3(1.0) * flash * alpha;

                col += localCol * exp(-d * 0.05);
            }
        }

        // Step forward. Since we use fract, we can step safely by distance to cell boundary
        vec3 distToBound = (sign(rd) * 0.5 - gridP) / rd;
        float stepSize = min(min(distToBound.x, distToBound.y), distToBound.z);
        d += max(0.01, stepSize / lp + 0.01);

        if (d > 40.0) break;
    }

    // Background glow
    col += laneColor * 0.14 * (1.0 + audioSwell);

    if (hue > 0.001) col = hueRot(col, 0.2 * sin(hue));

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
