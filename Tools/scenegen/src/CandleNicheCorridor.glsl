//@doc
 * @brief CANDLE NICHE CORRIDOR: an endless corridor with arched niches in its walls, a flame burning in every one;
 * the flames breathe with the music and the warm light pools on the stone around them and on the floor below, and
 * when the music strikes, a draught runs down the corridor and the flames flare one after another into the distance.
 * The walls are the planes beside the eye; the niches stand at a fixed step, the two walls offset by half a step;
 * each flame is a soft teardrop that sways steadily and lights the wall with a falloff from its niche.  The draught is
 * the onset of as long ago as it needed to reach the flame (the scene keeps four seconds of onsets in a field of its
 * own).  The stone is the photo, calmed toward one warm colour family.
 *
 * Audio Reactivity (structure, not only light):
 *   audioOnset   -> a draught: the flames flare one after another down the corridor (kept for four seconds)
 *   audioSwell   -> the flames breathe: their size and their light
 *   audioAdvance -> the walk down the corridor (integrated)
 *
 * Knobs: stepP (the niches' spacing), flameP (the flames' size), hueP.
//@params stepP flameP
//@audio audioOnset audioSwell
//@state 256 1 60
//@body
/**  The state pass: the onsets of the last four seconds, the newest in cell 0.
 *
 * @return
 *   x the onset, 0, 0, 1.
 **/
vec4 stateStep()
{
    ivec2 c = stCell();
    if (c.x == 0) return vec4(clamp(audioOnset, 0.0, 1.0), 0.0, 0.0, 1.0);
    if (stateFrame < 0.5) return vec4(0.0);
    return texelFetch(texState, ivec2(c.x - 1, 0), 0);
}

/**  The music's onset as it was a while ago.
 *
 * @param age  How long ago, in seconds. (in)
 *
 * @return
 *   The onset then (0 beyond four seconds).
 **/
float onsetAgo(float age)
{
    return stLin(vec2(clamp(age * 60.0 - stateFrac, 0.0, 254.0) + 0.5, 0.5)).r * (1.0 - smoothstep(3.6, 4.2, age));
}

/**  The photo's colour calmed toward the colour family.
 *
 * @param photo  The photo's colour. (in)
 * @param fh     The family's hue. (in)
 *
 * @return
 *   The colour.
 **/
vec3 tone(vec3 photo, float fh)
{
    float l = luma(photo);
    return mix(photo * 1.1, famCol(fh, 0.15 + 0.7 * l) * (0.25 + 1.2 * l), 0.45);
}

/**  The signed distance to a niche's outline (an arch over a rectangle).
 *
 * @param dz  Along the wall from the niche's middle. (in)
 * @param ny  Up from the niche's foot. (in)
 * @param hw  The niche's half width. (in)
 *
 * @return
 *   The distance, negative inside.
 **/
float nicheD(float dz, float ny, float hw)
{
    return ny < 0.45 ? max(abs(dz) - hw, -ny) : length(vec2(dz, ny - 0.45)) - hw;
}

/**  How big a flame burns: its breath and the draught that reaches it.
 *
 * @param dist  How far ahead the flame is. (in)
 * @param fs    The flames' size. (in)
 *
 * @return
 *   The flame's size.
 **/
float flameSize(float dist, float fs)
{
    return fs * (0.8 + 0.4 * clamp(audioSwell, 0.0, 1.0) + 0.5 * onsetAgo(max(dist, 0.0) / 4.0));
}

/**  A wall with its niches and flames.
 *
 * @param zw    The place along the corridor. (in)
 * @param y     The height (floor at 0). (in)
 * @param side  Which wall (-1 left, +1 right). (in)
 * @param S     The niches' spacing. (in)
 * @param walk  The walk so far. (in)
 * @param fs    The flames' size. (in)
 * @param px    A pixel on the wall. (in)
 * @param fh    The family's hue. (in)
 *
 * @return
 *   The wall's light.
 **/
vec3 wall(float zw, float y, float side, float S, float walk, float fs, float px, float fh)
{
    const float YN = 0.55, HW = 0.16;                                  // the niches' foot and half width
    float off = side > 0.0 ? 0.0 : 0.5 * S;
    float zo = zw - off;
    float k = floor(zo / S + 0.5);
    float dz = zo - k * S, ny = y - YN;
    vec3 warm = famLight(fh, 0.75, 0.35);
    vec3 stone = tone(imgLod(fract(vec2(zw * 0.13, y * 0.4 + 0.3)), 2.0), fh) * 0.35;
    float lightSum = 0.0;
    for (int j = -1; j <= 1; ++j) {
        float kj = k + float(j);
        float f = flameSize(kj * S + off - walk, fs);
        vec2 fp = vec2(zo - kj * S, ny - 0.12);
        lightSum += f * exp(-dot(fp, fp) / (0.08 + 0.15 * f));
    }
    vec3 col = stone * 0.25 + stone * warm * lightSum * 3.0;
    // the niche: an arched recess, darker, warm inside, its rim catching the light
    float dn = nicheD(dz, ny, HW);
    col = mix(col, stone * 0.4 + warm * 0.25 * lightSum, 1.0 - smoothstep(-px, px, dn));
    col += warm * 0.3 * exp(-pow(dn / (2.0 * px + 0.004), 2.0)) * lightSum;
    // the flame itself, swaying
    float f = flameSize(k * S + off - walk, fs);
    float sway = 0.015 * sin(2.3 * sceneTime + 1.7 * k) + 0.01 * sin(5.1 * sceneTime + k);
    vec2 q = vec2(dz - sway * max(ny - 0.05, 0.0) * 6.0, ny - 0.06);
    float tear = length(vec2(q.x * (1.0 + 2.5 * max(q.y, 0.0) / f), q.y * (q.y > 0.0 ? 0.45 : 1.0))) / (0.05 * f);
    col += famLight(fh, 0.8, 0.8) * exp(-tear * tear) * 1.6 + warm * exp(-tear) * 0.3;
    return col;
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float fh = famHue();
    const float W = 0.8, FLOOR = -0.45, CEIL = 0.75, F = 1.2;
    float walk = 0.22 * sceneTime + 0.8 * audioAdvance;
    float S = 0.9 + 0.6 * clamp(stepP, 0.0, 1.0);
    float fs = 0.8 + 0.5 * clamp(flameP, 0.0, 1.0);
    vec3 warm = famLight(fh, 0.75, 0.35);
    float zWall = W * F / max(abs(p.x), 1e-4);
    float zFloor = p.y < 0.0 ? -FLOOR * F / -p.y : 1e9;
    float zCeil = p.y > 0.0 ? CEIL * F / p.y : 1e9;
    vec3 col;
    if (zWall < min(zFloor, zCeil)) {
        float y = p.y * zWall / F - FLOOR;
        float px = zWall * zWall / (W * F) / resolution.y;
        col = wall(zWall + walk, y, sign(p.x), S, walk, fs, px, fh) * exp(-0.06 * zWall);
    } else if (zFloor < zCeil) {
        // the floor: stone with pools of light under the niches of both walls
        float x = p.x * zFloor / F, zw = zFloor + walk;
        float pool = 0.0;
        for (int s = 0; s < 2; ++s) {
            float side = s == 0 ? 1.0 : -1.0, off = s == 0 ? 0.0 : 0.5 * S;
            float k = floor((zw - off) / S + 0.5);
            float dz = zw - off - k * S;
            pool += flameSize(k * S + off - walk, fs) * exp(-(dz * dz * 4.0 + pow(x - side * W, 2.0) * 6.0));
        }
        vec3 stone = tone(imgLod(fract(vec2(x * 0.3 + 0.5, zw * 0.11)), 2.5), fh) * 0.2;
        col = (stone * 0.3 + stone * warm * pool * 2.5 + warm * pool * 0.05) * exp(-0.06 * zFloor);
    } else {
        col = famCol(fh, 0.3) * 0.03 * exp(-0.05 * zCeil);
    }
    col += warm * exp(-length(p - vec2(0.0, 0.05)) * 6.0) * 0.25;
    finish(famExpose(col, 1.25, 1.00, 0.00, fh));
}
