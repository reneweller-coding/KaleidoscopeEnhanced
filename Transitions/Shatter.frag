#version 330 core
out vec4 fragColor;
/**
 * @file Shatter.frag
 * @brief Shatter: the old scene breaks into Voronoi shards that fly apart,
 * spin and fall; the new scene stands behind.
 *
 * Scene TRANSITION shader (Transitions/): blends the outgoing scene
 * (tex0) into the incoming one (tex1) over one cross-fade.
 * interpolation: 1 = old scene fully visible .. 0 = new scene.
 * Extracted from the former FxPlain.frag 28-style library.
 */
uniform vec2 resolution;
uniform sampler2D tex0;
uniform sampler2D tex1;
uniform float interpolation;

const float PI = 3.14159265358979;

float hashT(vec2 p2)
{
    return fract(sin(dot(p2, vec2(127.1, 311.7))) * 43758.5453);
}

void main()
{
    vec2  p   = gl_FragCoord.xy / resolution;
    float d   = 1.0 - interpolation;          // transition progress 0..1
    float aspect = resolution.x / resolution.y;
    vec2  cc  = p - 0.5;                      // centred, aspect-corrected
    cc.x *= aspect;

    // Jittered-grid Voronoi shards over the aspect-true frame.  To draw a
    // MOVED shard correctly the pixel is un-transformed by each candidate
    // shard's motion and only accepted if the landing point really lies in
    // that shard's cell (nearest-site test over its 3x3 hood) - sampling
    // through the pixel's OWN cell would smear content once shards part.
    const float SC = 3.4;                 // shard cells per unit
    vec4  fresh = texture(tex1, p);
    vec4  outC  = fresh;
    float bestT = 1e9;                    // most intact matching shard wins
    vec2  gcell = floor(cc * SC);
    for (int gy = -1; gy <= 1; gy++)
    for (int gx = -1; gx <= 1; gx++)
    {
        vec2  cell = gcell + vec2(float(gx), float(gy));
        vec2  site = (cell + vec2(hashT(cell), hashT(cell + 19.7))) / SC;
        float rs   = hashT(cell + 4.2);
        float t    = clamp(d * 1.3 - rs * 0.3, 0.0, 1.0);  // staggered break
        t = t * t;                                          // eases in
        // Throw: outward + random sideways, then gravity + spin.
        vec2  vel = normalize(site + vec2(1e-4, 2e-4)) * 0.55
                  + vec2((hashT(cell + 7.7) - 0.5) * 0.9, 0.30);
        vec2  off = vel * t + vec2(0.0, -1.35) * t * t;
        float ang = (hashT(cell + 2.2) - 0.5) * 3.2 * t;
        float cs2 = cos(ang), sn2 = sin(ang);
        vec2  q   = mat2(cs2, sn2, -sn2, cs2) * (cc - site - off) + site;
        // Membership: q's nearest site must be THIS cell's site.
        vec2  qc = floor(q * SC);
        float bd = 1e9;  vec2 bc = vec2(99.0);
        for (int ny = -1; ny <= 1; ny++)
        for (int nx = -1; nx <= 1; nx++)
        {
            vec2  c2  = qc + vec2(float(nx), float(ny));
            vec2  s2  = (c2 + vec2(hashT(c2), hashT(c2 + 19.7))) / SC;
            float dd2 = dot(q - s2, q - s2);
            if (dd2 < bd) { bd = dd2; bc = c2; }
        }
        if (bc == cell && t < bestT)
        {
            vec2 pq = vec2(q.x / aspect, q.y) + 0.5;
            if (pq.x > 0.0 && pq.x < 1.0 && pq.y > 0.0 && pq.y < 1.0)
            {
                vec4 shard = texture(tex0, pq);
                shard.rgb *= 1.0 - 0.45 * t;            // tumbling into shadow
                float wS = 1.0 - smoothstep(0.70, 1.0, t);
                outC  = mix(fresh, shard, wS);
                bestT = t;
            }
        }
    }
    fragColor = outC;
}
