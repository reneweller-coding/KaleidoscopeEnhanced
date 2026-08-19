/**
 * @file ExprEval.h
 * @brief Tiny expression compiler/evaluator for the preset FORMULA LAYER — the
 *   MilkDrop lesson: presets become scripts.  A formula string like
 *       "0.5 + 0.3*bassRel*sin(6.28*barPhase)"
 *   is compiled ONCE (shunting-yard -> RPN program) and evaluated every frame
 *   against the live audio features; the result is uploaded as a float uniform.
 *
 * Variables (resolved to indices at compile time — see kExprVarNames):
 *   time  bass mid treb  bassRel midRel trebRel  subBass high level
 *   kick snare hat onset beat  beatPhase barPhase downbeat
 *   swell buildUp drop  chromaHue centroid flux  arousal valence
 *   ambient rhythm music  advance phase  seed1 seed2 seed3
 * Functions: sin cos tan abs sqrt exp log floor fract tanh sign
 *            min(a,b) max(a,b) pow(a,b) atan2(a,b)  clamp(x,a,b) mix(a,b,t)
 * Operators: + - * / ^ (power), unary minus, parentheses.
 *
 * Parse errors are reported to stderr once; a broken expression yields 0.
 */
#pragma once

#include <vector>
#include <string>

/** @brief Identifiers usable inside a preset `<expr formula="...">` string, and the lookup table that names them. */
namespace ExprVars {
/** @brief Index of each audio/time feature exposed to formulas; also the layout of the `vars` array passed to ExprProgram::eval(). */
enum Index {
    V_TIME, V_BASS, V_MID, V_TREB, V_BASSREL, V_MIDREL, V_TREBREL,
    V_SUBBASS, V_HIGH, V_LEVEL, V_KICK, V_SNARE, V_HAT, V_ONSET, V_BEAT,
    V_BEATPH, V_BARPH, V_DOWNBEAT, V_SWELL, V_BUILDUP, V_DROP, V_CHROMA,
    V_CENTROID, V_FLUX, V_AROUSAL, V_VALENCE, V_AMBIENT, V_RHYTHM, V_MUSIC,
    V_ADVANCE, V_PHASE, V_DAYPHASE, V_FLATNESS, V_ZCR, V_FADEOUT,
    V_SEED1, V_SEED2, V_SEED3, V_COUNT
};
// Names in Index order (size V_COUNT) -- for building an editor menu /
// autocomplete list; the evaluator itself resolves identifiers structurally
// at compile() time and never calls this.
/**
 * @brief Returns the variable-name table, indexed by ExprVars::Index (size V_COUNT).
 * @return Pointer to a static array of C-string variable names, in Index order.
 */
const char* const* names();
}

/**
 * @brief Compiles a formula-language expression string into an RPN program and evaluates it against live variables.
 *
 * Used for a preset's `<expr name="..." formula="...">` uniform overrides:
 * compile() is called once at preset-load time (see
 * Configuration::addUniforms()) turning the formula text into a flat
 * `std::vector<Op>` RPN program via shunting-yard; eval() then runs that
 * program every frame against a caller-filled `float[ExprVars::V_COUNT]`
 * array with no further allocation or parsing. An instance that failed to
 * compile (valid() == false) evaluates to 0 rather than crashing or using
 * stale state.
 */
class ExprProgram
{
public:
    /**
     * @brief Parses and compiles @p formula into the internal RPN program.
     * @param formula The expression source, e.g. "0.5 + 0.3*bassRel*sin(6.28*barPhase)".
     * @param context A label identifying the formula's origin (e.g. uniform/shader name), used only to prefix stderr error messages.
     * @param outError Optional: on failure, receives the same message logged to stderr (without the "Expr [context]: " prefix) — e.g. for surfacing in a UI tooltip. Left untouched on success or when null.
     * @return True on success; false on a parse error (unknown identifier, unexpected character, unbalanced parens, misplaced comma, or a malformed/unbalanced RPN stack) — the program then evaluates to 0 via eval().
     */
    bool compile( const std::string &formula, const std::string &context, std::string *outError = nullptr );

    /**
     * @brief Runs the compiled RPN program against a filled variable array.
     * @param vars Array of ExprVars::V_COUNT floats, indexed by ExprVars::Index, holding the current audio/time feature values.
     * @return The formula's result, or 0 if compile() had failed (or the stack didn't reduce to exactly one value).
     */
    float eval( const float *vars ) const;

    bool valid() const { return m_ok; } ///< @return True if the last compile() call succeeded.

private:
    struct Op { int code; float value; };   ///< One RPN instruction: code<0 means push const (OP_CONST, value=the constant) or push var (OP_VAR, value=the ExprVars index as a float); code>=0 is an operator/function opcode consuming its operands off the stack.
    std::vector<Op> m_prog; ///< The compiled program, in RPN (postfix) order, as produced by compile()'s shunting-yard pass.
    bool m_ok = false;      ///< Whether m_prog is a valid, safely-evaluable program (set by compile()).
};
