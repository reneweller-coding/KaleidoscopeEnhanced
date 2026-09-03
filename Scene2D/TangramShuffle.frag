#version 330 core
out vec4 fragColor;
/**
 * @file TangramShuffle.frag
 * @brief TANGRAM SHUFFLE: the seven pieces -- two large triangles, one
 * medium, two small, a square and a parallelogram -- each carrying its
 * part of the photo, gliding between figures over the scene arc: the
 * square, a cat, a bird, a boat, a runner.  Every piece moves and turns
 * by a smooth blend between its poses (no snaps); the piece that has
 * just settled lights on the kick, the swell is the lamp on the table,
 * the treble the lacquer glint.  Camera fixed over the table.
 *
 * Audio Reactivity:
 *   sceneProgress -> the sequence of figures (the arc)
 *   audioKick     -> the settled piece lights (light)
 *   audioSwell    -> lamp (slow)
 *   audioHigh     -> lacquer glint (light)
 *   audioLevel    -> brightness
 *
 * Per-activation variety: sizeP, lacquerP, hueP.
 */
uniform vec2  resolution;
uniform float time;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

uniform float sceneAdvance;
uniform float sceneTime;
uniform float sceneProgress;
uniform float audioAdvance;
uniform float audioKick;
uniform float audioSwell;
uniform float audioHigh;
uniform float audioLevel;
uniform float audioChromaHue;
uniform float audioValence;

uniform float sizeP;
uniform float lacquerP;
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

// Signed distance to a triangle (a, b, c).
float sdTri(vec2 p, vec2 a, vec2 b, vec2 c)
{
    vec2 e0 = b - a, e1 = c - b, e2 = a - c;
    vec2 v0 = p - a, v1 = p - b, v2 = p - c;
    vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
    vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
    vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
    float s = sign(e0.x * e2.y - e0.y * e2.x);
    vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)), vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))), vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
    return -sqrt(d.x) * sign(d.y);
}

// Pose of piece i in figure f: position and rotation (five figures x
// seven pieces).  Local shapes are defined about their own centroid.
void pose(int i, int f, out vec2 pos, out float rot)
{
    vec2 P[35]; float Rr[35];
    // square
    P[0] = vec2(-0.25, 0.25); Rr[0] = 0.0;      P[1] = vec2(0.25, -0.25); Rr[1] = 3.14159;
    P[2] = vec2(0.25, 0.25); Rr[2] = -1.5708;   P[3] = vec2(-0.25, -0.25); Rr[3] = 1.5708;
    P[4] = vec2(0.0, 0.0); Rr[4] = 0.7854;      P[5] = vec2(0.1, -0.35); Rr[5] = 0.0;
    P[6] = vec2(-0.3, 0.05); Rr[6] = 0.0;
    // cat
    P[7] = vec2(-0.35, -0.1); Rr[7] = 0.8;      P[8] = vec2(0.1, -0.2); Rr[8] = 2.5;
    P[9] = vec2(0.35, 0.25); Rr[9] = -0.7;      P[10] = vec2(0.45, 0.5); Rr[10] = 0.3;
    P[11] = vec2(0.2, 0.45); Rr[11] = 1.2;      P[12] = vec2(-0.05, 0.1); Rr[12] = 0.4;
    P[13] = vec2(0.5, -0.35); Rr[13] = 0.8;
    // bird
    P[14] = vec2(-0.4, 0.2); Rr[14] = 2.2;      P[15] = vec2(0.3, 0.1); Rr[15] = -0.6;
    P[16] = vec2(0.0, -0.3); Rr[16] = 1.2;      P[17] = vec2(0.45, 0.4); Rr[17] = 0.0;
    P[18] = vec2(-0.1, 0.45); Rr[18] = 2.0;     P[19] = vec2(0.1, 0.2); Rr[19] = 0.7854;
    P[20] = vec2(-0.45, -0.25); Rr[20] = 0.4;
    // boat
    P[21] = vec2(-0.3, -0.3); Rr[21] = 0.0;     P[22] = vec2(0.3, -0.3); Rr[22] = 0.0;
    P[23] = vec2(0.0, 0.15); Rr[23] = 1.5708;   P[24] = vec2(0.05, 0.45); Rr[24] = 0.0;
    P[25] = vec2(-0.2, 0.35); Rr[25] = 0.8;     P[26] = vec2(0.0, -0.05); Rr[26] = 0.0;
    P[27] = vec2(0.35, 0.1); Rr[27] = 0.5;
    // runner
    P[28] = vec2(-0.1, 0.35); Rr[28] = 0.5;     P[29] = vec2(0.1, -0.1); Rr[29] = 2.8;
    P[30] = vec2(-0.35, -0.35); Rr[30] = 1.0;   P[31] = vec2(0.15, 0.55); Rr[31] = 0.2;
    P[32] = vec2(0.4, -0.4); Rr[32] = 2.4;      P[33] = vec2(-0.1, 0.05); Rr[33] = 0.3;
    P[34] = vec2(0.4, 0.2); Rr[34] = 1.1;
    int idx = f * 7 + i;
    pos = P[idx]; rot = Rr[idx];
}

float pieceSD(int i, vec2 q)
{
    // Local shapes about their centroid (unit square tangram, side 1).
    if (i == 0 || i == 1) return sdTri(q, vec2(-0.5, -0.167), vec2(0.5, -0.167), vec2(0.0, 0.333));            // large triangles
    if (i == 2) return sdTri(q, vec2(-0.354, -0.118), vec2(0.354, -0.118), vec2(0.0, 0.236));                   // medium
    if (i == 3 || i == 4) return sdTri(q, vec2(-0.25, -0.083), vec2(0.25, -0.083), vec2(0.0, 0.167));            // small
    if (i == 5) return max(abs(q.x), abs(q.y)) - 0.177;                                                           // square
    // parallelogram: as two triangles
    return min(sdTri(q, vec2(-0.35, -0.09), vec2(0.0, -0.09), vec2(0.18, 0.09)), sdTri(q, vec2(-0.35, -0.09), vec2(0.18, 0.09), vec2(-0.18, 0.09)));
}

void main()
{
    float aspect = resolution.x / resolution.y;
    vec2 p = (gl_FragCoord.xy / resolution - 0.5) * vec2(aspect, 1.0);

    float hue = (hueP > 0.001) ? hueP : 0.0;
    float size = 0.75 + 0.25 * clamp(sizeP, 0.0, 1.0);
    float lacquer = 0.4 + 0.6 * clamp(lacquerP, 0.0, 1.0);
    float lamp = 0.8 + 0.6 * clamp(audioSwell, 0.0, 1.0);
    float prog = clamp(sceneProgress, 0.0, 1.0);
    // The figure sequence: five figures over the arc, each transition a
    // smooth blend (pieces glide and turn); the last part of each slot holds.
    float fseq = prog * 4.0;
    int f0 = int(floor(fseq)); int f1 = min(f0 + 1, 4);
    float blend = smoothstep(0.0, 0.6, fract(fseq));
    float settled = smoothstep(0.6, 0.75, fract(fseq)) * (1.0 - smoothstep(0.95, 1.0, fract(fseq)));

    // The table: the photo as dark lacquered wood.
    vec3 col = (img(gl_FragCoord.xy / resolution) * 0.6 + 0.2) * mix(vec3(0.5, 0.38, 0.25), imgPalette(hue * 0.159 + 0.1) * 0.7, 0.4) * lamp;
    col *= 0.7 + 0.3 * (1.0 - length(p) * 0.6);
    // Pieces, back to front; each piece in its blended pose.
    for (int i = 0; i < 7; ++i)
    {
        vec2 pa, pb; float ra, rb;
        pose(i, f0, pa, ra); pose(i, f1, pb, rb);
        // Shortest-way rotation blend.
        float dr = rb - ra; dr = dr - 6.2831853 * floor((dr + 3.14159) / 6.2831853);
        vec2 pos = mix(pa, pb, blend) * size;
        float rot = ra + dr * blend;
        // A lift while moving: the piece rises off the table (a shadow offset).
        float moving = blend * (1.0 - blend) * 4.0;
        vec2 q = p - pos;
        q = mat2(cos(rot), sin(rot), -sin(rot), cos(rot)) * q / size;
        float sd = pieceSD(i, q);
        float inside = smoothstep(0.006, 0.0, sd);
        float shadow = smoothstep(0.03 + 0.03 * moving, 0.0, pieceSD(i, q + vec2(0.02, 0.02) * (1.0 + moving) / size)) * (1.0 - inside);
        col *= 1.0 - shadow * 0.5;
        // The piece: its part of the photo (cut at the square-figure pose so
        // the square reassembles the picture), lacquered.
        vec2 pSq; float rSq; pose(i, 0, pSq, rSq);
        vec2 photoUV = (mat2(cos(-rSq), sin(-rSq), -sin(-rSq), cos(-rSq)) * q + pSq) * 0.8 + 0.5;
        vec3 face = img(clamp(photoUV, 0.0, 1.0)) * 1.4 + 0.12;
        vec3 tint = imgPalette(hue * 0.159 + float(i) * 0.14);
        face = mix(face, face * tint * 1.6, 0.35) * lamp;
        float gloss = pow(max(1.0 - length(q - vec2(-0.15, 0.15)) * 2.5, 0.0), 3.0) * lacquer;
        face += vec3(1.0, 0.98, 0.9) * gloss * (0.2 + 0.5 * clamp(audioHigh * 2.0, 0.0, 1.0));
        // Bevel edge.
        face *= 0.8 + 0.2 * smoothstep(-0.03, -0.005, sd);
        col = mix(col, face, inside);
        // The settled piece lights on the kick (the last one, the parallelogram).
        col += tint * inside * settled * audioKick * 0.6 * step(5.5, float(i));
    }
    col *= 0.75 + 0.5 * audioLevel;

    vec3 _catTone = max(col, 0.0);
    _catTone /= 1.0 + 0.35 * max(_catTone.r, max(_catTone.g, _catTone.b));
    fragColor = vec4(clamp(_catTone, 0.0, 1.0), 1.0);
}
