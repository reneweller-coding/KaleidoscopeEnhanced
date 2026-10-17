//@doc
 * @brief SONG FORM RINGS: the song's form laid down as the growth rings of a tree -- every section of the music adds a
 * ring, growing outward while the section lasts, and a section that comes back (the chorus again) wears the same cut
 * of the photo as before, so the form reads in the rings: verse, chorus, verse, chorus, bridge.  As the rings pile up
 * the trunk draws back so the newest ring stays in view; each ring shades darker toward its edge like latewood, and
 * the rings wander a little, as wood does.
 *
 * Audio Reactivity (structure, not only light):
 *   audioSectionId  -> every new section starts a ring; its label picks the ring's photo (counted on the state pass)
 *   audioSectionAge -> the ring grows while its section lasts
 *   audioKick       -> the growing ring's edge flashes (light)
 *
 * Knobs: widthP (the rings' width), wobbleP (how much the rings wander), photoP (photo share), hueP.
//@params widthP wobbleP photoP
//@audio audioSectionId audioSectionAge audioKick
//@state 64 2 30
//@body
/**  The state pass: row 1, texel 0 counts the sections (and remembers the last id), texel 1 is the growth, gliding
 * toward the count plus the current ring's share; row 0 holds each ring's section label.
 *
 * @return
 *   Row 0: the label (r); row 1: the count (r) and last id (g) in texel 0, the growth (r) in texel 1.
 **/
vec4 stateStep()
{
    ivec2 ip = ivec2(gl_FragCoord.xy);
    float sid = max(audioSectionId, 0.0);
    vec4 cnt = texelFetch(texState, ivec2(0, 1), 0);
    if (stateFrame < 0.5) {
        if (ip.y == 1 && ip.x == 0) return vec4(0.0, sid, 0.0, 1.0);
        return vec4(ip.y == 0 ? sid : 0.0, 0.0, 0.0, 1.0);
    }
    bool changed = abs(sid - cnt.g) > 0.5;
    float count = cnt.r + (changed ? 1.0 : 0.0);
    if (ip.y == 1) {
        if (ip.x == 0) return vec4(count, sid, 0.0, 1.0);
        if (ip.x == 1) {
            float g = texelFetch(texState, ivec2(1, 1), 0).r;
            float target = count + min(max(audioSectionAge, 0.0) / 40.0, 0.95);
            return vec4(mix(g, target, 0.01), 0.0, 0.0, 1.0);
        }
        return vec4(0.0);
    }
    vec4 me = texelFetch(texState, ip, 0);
    if (changed && ip.x == int(mod(count, 64.0))) return vec4(sid, 0.0, 0.0, 1.0);   // the new ring's label
    return me;
}

void main()
{
    if (statePass == 1) { fragColor = stateStep(); return; }
    vec2 p = screenP();
    float g = texelFetch(texState, ivec2(1, 1), 0).r;
    float W = 0.06 + 0.05 * clamp(widthP, 0.0, 1.0);
    float scale = 0.46 / ((g + 0.6) * W);                       // the trunk draws back so the newest ring stays in view
    float ang = atan(p.y, p.x);
    float wob = (0.15 + 0.5 * clamp(wobbleP, 0.0, 1.0)) * (noise2(vec2(ang * 2.0, 0.0) + vec2(3.0, 1.0)) - 0.5);
    float u = length(p) / (W * scale) * (1.0 + 0.12 * wob) - 0.6;   // the radius in rings
    vec3 tone = imgPalette(0.35 + 0.03 * audioPhase);
    vec3 col = imgLod(vec2(ang / 6.2831853 * 3.0, length(p) * 4.0), 2.0) * 0.25;   // the bark beyond the newest ring
    if (u < 0.0) {
        col = imgLod(p * 2.0 + 0.5, 2.0) * 0.4;                 // the pith
    } else if (u < g) {
        float ring = floor(u);
        float within = fract(u);
        float label = texelFetch(texState, ivec2(int(mod(ring, 64.0)), 0), 0).r;
        float hl = hash11(label * 3.17 + 0.5);
        vec2 uv = vec2(0.5) + 0.35 * vec2(cos(hl * 6.2831853), sin(hl * 6.2831853)) + rot2(hl * 6.2831853) * p * 0.6;
        vec3 photo = imgLod(uv, 0.6);
        vec3 tr = imgPalette(hl + 0.03 * audioPhase);
        float late = smoothstep(0.55, 1.0, within);
        vec3 c = mix(tr * 1.2, photo * 1.4, 0.5 + 0.45 * clamp(photoP, 0.0, 1.0)) * (1.0 - 0.45 * late);
        bool growing = ring + 1.0 > g;
        if (growing) c += mix(tr, vec3(1.0), 0.5) * smoothstep(0.08, 0.0, g - u) * 0.6 * (0.4 + clamp(audioKick, 0.0, 1.0));
        col = c;
    }
    finish(col * 1.05);
}
