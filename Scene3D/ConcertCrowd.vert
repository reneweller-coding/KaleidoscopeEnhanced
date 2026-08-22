#version 330 core
/**
 * @file ConcertCrowd.vert
 * @brief Vertex stage companion to ConcertCrowd.frag -- see that file's header for
 * this scene's description.
 */
// ConcertCrowd.vert — YOU are on stage, looking out at a silhouetted crowd
// under backlight.  A "wave" of raised arms rolls through the rows on the
// beat phase (each person's own small phase offset keeps it human, not
// robotic); kicks/onsets punch the whole crowd into a jump.  1200 people x
// 50 points each (40 cols x 30 rows).

in vec4 attrA;
in vec4 attrB;

uniform mat4  projM;
uniform float eyeOff;
uniform float time;
uniform vec2  resolution;

uniform float audioBeatPhase;
uniform float audioPhase;
uniform float audioKick;
uniform float audioOnset;
uniform float audioSwell;
uniform float audioChromaHue;
uniform float audioDrop;

out vec4 vCol;

vec3 hueRot(vec3 c, float a)
{
    vec3  k = vec3(0.57735026919);
    float cs = cos(a), sn = sin(a);
    return c * cs + cross(k, c) * sn + k * dot(k, c) * (1.0 - cs);
}
float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

void main()
{
    float r1 = attrB.x, r2 = attrB.y, r3 = attrB.z, r4 = attrB.w;

    const float COLS = 40.0, ROWS = 30.0;
    float person = floor(attrA.w / 50.0);         // 0..1199
    float col    = mod(person, COLS);
    float row    = floor(person / COLS);

    // ORGANIC crowd placement: the grid is only the seed — every person
    // stands off it by a big personal offset, drifts toward loose CLUSTERS
    // (real crowds bunch up in front of the stage and around friends), and
    // has their own height.  No more rank-and-file rows.
    float jx = (hash11(person * 11.3 + 0.7) - 0.5) * 2.6;
    float jz = (hash11(person * 17.9 + 2.1) - 0.5) * 4.2;
    float clusterA = hash11(floor(person / 7.0) * 5.3) * 6.2831853;
    jx += cos(clusterA) * 0.9;
    jz += sin(clusterA) * 1.4;
    float hgt = 0.85 + 0.35 * hash11(person * 23.7);   // body height variance
    // ROOM-FILLING: wider spread, front rows reach past the frame edges,
    // rear rows recede far beyond the fog line, and the terrain undulates
    // (a festival field, not a cut plane).
    vec3 base = vec3((col - COLS * 0.5 + 0.5) * 2.0 + jx,
                     -9.0 + row * 0.24
                          + 0.9 * sin(col * 0.31) * sin(row * 0.22),
                     4.0 + row * 3.4 + jz);

    float ph = hash11(person * 3.7 + 0.5) * 6.2831853;   // per-person phase

    // The wave: travels through the rows on the beat; onsets/kicks add a
    // sudden whole-crowd jump on top.
    // The wave travels by DISTANCE from the stage (not by grid row), so it
    // rolls organically through the jittered crowd.
    float wave = 0.5 + 0.5 * sin(6.2831853 * audioBeatPhase - base.z * 0.085 + ph * 0.3);
    float armRaise = clamp(0.15 + 0.55 * wave + 0.5 * audioOnset
                           + 0.3 * audioDrop, 0.0, 1.0);
    float jump = 0.35 * audioKick * (0.5 + 0.5 * sin(ph + time * 3.0));

    vec3  world;
    vec3  col3;
    float rim;

    float beamK = 0.0;
    vec3 beamCol = vec3(0.0);
    if (r1 > 0.97)
    {
        // ---- Stage light beams sweeping the sky over the crowd. ----
        float beam = floor((r1 - 0.97) * 166.0);          // 0..4
        float a = r2;                                     // 0 stage .. 1 sky
        float ang = (beam / 4.0 - 0.5) * 1.5
                  + 0.45 * sin(audioPhase * 0.5 + beam * 1.7);
        world = vec3(sin(ang) * (1.5 + a * 15.0) + (r3 - 0.5) * 0.4,
                     1.8 + a * 10.5 + (r4 - 0.5) * 0.4,
                     24.0 - a * 10.0);
        rim = 1.0;
        beamK = 1.0;
        beamCol = hueRot(vec3(0.35, 0.75, 1.0), audioChromaHue + beam * 1.1)
                * (0.5 + 0.5 * a) * (0.8 + 0.8 * audioSwell + 1.2 * audioDrop);
    }
    else if (r1 < 0.45)
    {
        // ---- Torso + head: a small vertical cluster (per-person height). ----
        float h = r2 * 1.75 * hgt;
        float sway = sin(time * 1.3 + ph) * 0.05 * h;
        world = base + vec3(sway + (r3 - 0.5) * 0.22, h + jump, (r4 - 0.5) * 0.18);
        rim = abs(r3 - 0.5) * 2.0;                  // silhouette edge glow
    }
    else
    {
        // ---- Arms: left/right streaks rising from shoulder height. ----
        float side = (r1 < 0.72) ? -1.0 : 1.0;
        float a    = r2;                            // 0 shoulder .. 1 hand
        float shoulderY = 1.35 * hgt;
        float handY = mix(shoulderY, 2.55 * hgt, armRaise);
        float spread = mix(0.32, 0.10, armRaise) * side;
        world = base + vec3(spread * (1.0 - 0.3 * a) + (r3 - 0.5) * 0.05,
                            mix(shoulderY, handY, a) + jump,
                            (r4 - 0.5) * 0.08);
        rim = 0.6 + 0.4 * a;
    }

    vec3 vp = world;
    vp.x -= eyeOff;
    gl_Position = projM * vec4(vp.x, vp.y, -vp.z, 1.0);
    gl_Position.x += eyeOff * 0.05 * gl_Position.w;
    if (vp.z < 0.5)
        gl_Position = vec4(0.0, 0.0, -3.0, 1.0);

    float px   = resolution.y / 1080.0;
    float dist = max(vp.z, 0.5);
    gl_PointSize = clamp(140.0 * px / dist, 1.5, 16.0 * px);

    // Silhouette body, rim-lit by the stage backlight — every person wears
    // a PERSONAL hue shift (similar family, individual shade), so the crowd
    // reads as thousands of individuals instead of stamped clones.
    float personalHue = (hash11(person * 31.7) - 0.5) * 1.4;
    vec3 backlight = hueRot(vec3(1.0, 0.55, 0.20), audioChromaHue + personalHue);
    vec3 shirt     = hueRot(vec3(0.09, 0.06, 0.08), personalHue * 2.0);
    col3 = mix(shirt, backlight, rim * (0.6 + 0.5 * armRaise));
    col3 *= (0.7 + 0.7 * audioSwell + 1.1 * audioDrop)
          * clamp(1.0 - vp.z / 130.0, 0.10, 1.0);

    vCol = vec4(col3 * 3.2, 1.0);
}
