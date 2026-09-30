# -*- coding: utf-8 -*-
"""One-off patch (30.09.): the stage wrappers call the class switch at most
twice.  They used to call it on three paths (rolled, app walk, hash walk) --
five inlined copies of the whole class switch per stage, the bulk of the chain
labs' compile time.  Now the wrapper first decides (from class, to class,
fade), then evaluates."""
import io, os, re
SP = os.path.dirname(os.path.abspath(__file__))
p = os.path.join(SP, "src", "ChainLab2D.glsl")
s = io.open(p, encoding="utf-8").read()
for X, IDX, WALK, SALT, WEAK in [("A", 1, "walkA", "1.3", 0), ("B", 2, "walkB", "2.9", 1), ("C", 3, "walkC", "4.7", 1), ("D", 4, "walkD", "6.1", 2)]:
    i = s.index("vec2 stage%s(vec2 uv)\n{" % X)
    j = s.index("\n}\n", i) + 3
    old = s[i:j]
    knob = re.search(r"pickStage\((chain[A-D]P), (\d+)\)", old)
    K, N = knob.group(1), knob.group(2)
    new = ('''vec2 stage%(X)s(vec2 uv)
{
    // Decide first (the class shown, the class faded to, the fade), then
    // evaluate: the class switch is inlined at most twice.
    int k0 = pickStage(%(K)s, %(N)s); float v0 = subVar(%(K)s, %(N)s);
    int ka = k0, kb = k0; float va = v0, vb = v0, f = 0.0;
    if (walks(%(I)d)) {
        if (walkHost > 0.5 && walkAll()) {
            f = smoothstep(0.0, 1.0, %(W)s.z);
            ka = pickStage(%(W)s.x, %(N)s); va = subVar(%(W)s.x, %(N)s);
            kb = pickStage(%(W)s.y, %(N)s); vb = subVar(%(W)s.y, %(N)s);
        } else {
            float kf = walkPos(%(I)d), c = floor(kf);
            walkPick(c, k0, v0, %(N)s, %(S)s, ka, va);
            walkPick(c + 1.0, k0, v0, %(N)s, %(S)s, kb, vb);
            f = walkFade(kf);
        }
    }
    gIdW *= (ka <= %(WK)d ? 1.0 - f : 0.0) + (kb <= %(WK)d ? f : 0.0);
    vec2 r = stage%(X)sk(uv, ka, va);
    if (f > 0.0) r = morphMix(r, stage%(X)sk(uv, kb, vb), f);
    return r;
}
''' % dict(X=X, K=K, N=N, I=IDX, W=WALK, S=SALT, WK=WEAK))
    s = s[:i] + new + s[j:]
io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("ok")
