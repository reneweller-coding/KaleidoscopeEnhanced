// ExprEval.h
// ---------------------------------------------------------------------------
// Tiny expression compiler/evaluator for the preset FORMULA LAYER — the
// MilkDrop lesson: presets become scripts.  A formula string like
//     "0.5 + 0.3*bassRel*sin(6.28*barPhase)"
// is compiled ONCE (shunting-yard -> RPN program) and evaluated every frame
// against the live audio features; the result is uploaded as a float uniform.
//
// Variables (resolved to indices at compile time — see kExprVarNames):
//   time  bass mid treb  bassRel midRel trebRel  subBass high level
//   kick snare hat onset beat  beatPhase barPhase downbeat
//   swell buildUp drop  chromaHue centroid flux  arousal valence
//   ambient rhythm music  advance phase  seed1 seed2 seed3
// Functions: sin cos tan abs sqrt exp log floor fract tanh sign
//            min(a,b) max(a,b) pow(a,b) atan2(a,b)  clamp(x,a,b) mix(a,b,t)
// Operators: + - * / ^ (power), unary minus, parentheses.
//
// Parse errors are reported to stderr once; a broken expression yields 0.
// ---------------------------------------------------------------------------
#pragma once

#include <vector>
#include <QtCore/QString>

namespace ExprVars {
enum Index {
    V_TIME, V_BASS, V_MID, V_TREB, V_BASSREL, V_MIDREL, V_TREBREL,
    V_SUBBASS, V_HIGH, V_LEVEL, V_KICK, V_SNARE, V_HAT, V_ONSET, V_BEAT,
    V_BEATPH, V_BARPH, V_DOWNBEAT, V_SWELL, V_BUILDUP, V_DROP, V_CHROMA,
    V_CENTROID, V_FLUX, V_AROUSAL, V_VALENCE, V_AMBIENT, V_RHYTHM, V_MUSIC,
    V_ADVANCE, V_PHASE, V_SEED1, V_SEED2, V_SEED3, V_COUNT
};
}

class ExprProgram
{
public:
    // Compile a formula.  Returns false (and logs) on a parse error; the
    // program then evaluates to 0.
    bool compile( const QString &formula, const QString &context );

    // Evaluate against a filled variable array (ExprVars::V_COUNT floats).
    float eval( const float *vars ) const;

    bool valid() const { return m_ok; }

private:
    struct Op { int code; float value; };   // code<0: push const / push var
    std::vector<Op> m_prog;
    bool m_ok = false;
};
