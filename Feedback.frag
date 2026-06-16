// Feedback.frag
// Phosphor-style feedback/trails pass.  Blends the previous displayed frame back
// in so bright, moving structures leave glowing trails that fade out.
//   out = max(current, previous * decay)
// decay near 0 = no trails; near 1 = long trails.  The host modulates it (longer
// in ambient/sustained passages, shorter on busy/percussive ones).
uniform sampler2D texCur;    // current combined frame
uniform sampler2D texPrev;   // previous trail frame
uniform vec2  resolution;
uniform float decay;

void main()
{
    vec2 uv  = gl_FragCoord.xy / resolution;
    vec3 cur = texture2D(texCur,  uv).rgb;
    vec3 prv = texture2D(texPrev, uv).rgb;
    gl_FragColor = vec4(max(cur, prv * decay), 1.0);
}
