/**
 * @file ExprEval.cpp
 * @brief Implements ExprProgram — see ExprEval.h. Classic shunting-yard to RPN, evaluated
 *   on a small value stack. No allocations at eval time.
 */
#include "ExprEval.h"

#include <cstdio>
#include <cmath>
#include <cstring>

namespace {

/** @brief Variable identifier strings, in ExprVars::Index order; the only place that names must match ExprVars::Index for compile()'s identifier lookup to work. */
const char *kVarNames[ExprVars::V_COUNT] = {
    "time", "bass", "mid", "treb", "bassRel", "midRel", "trebRel",
    "subBass", "high", "level", "kick", "snare", "hat", "onset", "beat",
    "beatPhase", "barPhase", "downbeat", "swell", "buildUp", "drop",
    "chromaHue", "centroid", "flux", "arousal", "valence", "ambient",
    "rhythm", "music", "advance", "phase", "dayPhase", "flatness", "zcr",
    "fadeOut", "progress", "seed1", "seed2", "seed3"
};

} // namespace (closed early so ExprVars::names() below can sit in its own
  // namespace block; kVarNames keeps internal linkage, just accessed via a
  // function pointer return instead of being named directly outside this TU)

namespace ExprVars { const char* const* names() { return kVarNames; } }

namespace {

// RPN op codes (>= 0).  Negative codes in Op.code mean:
//   OP_CONST (-1): push Op.value;  OP_VAR (-2): push vars[(int)Op.value].
/** @brief Operator/function opcodes stored in a non-negative Op::code (see OP_CONST/OP_VAR for the two negative "push" codes). F_SIN..F_SIGN are unary, F_MIN..F_ATAN2 binary, F_CLAMP/F_MIX ternary — see the arity table in compile()'s stack-depth sanity check and the dispatch in eval(). */
enum {
    OP_ADD, OP_SUB, OP_MUL, OP_DIV, OP_POW, OP_NEG,
    F_SIN, F_COS, F_TAN, F_ABS, F_SQRT, F_EXP, F_LOG, F_FLOOR, F_FRACT,
    F_TANH, F_SIGN,
    F_MIN, F_MAX, F_POWF, F_ATAN2,
    F_CLAMP, F_MIX
};
const int OP_CONST = -1; ///< Op::code sentinel: push Op::value onto the eval stack as a literal constant.
const int OP_VAR   = -2; ///< Op::code sentinel: push vars[(int)Op::value] onto the eval stack.

/** @brief One entry in the function table: source-text name, its opcode, and its argument count (used both to consume the right number of comma-separated args and by compile()'s stack-depth sanity check). */
struct FuncDef { const char *name; int code; int arity; };
/** @brief All formula-language built-in functions, matched by name during tokenising. */
const FuncDef kFuncs[] = {
    { "sin", F_SIN, 1 }, { "cos", F_COS, 1 }, { "tan", F_TAN, 1 },
    { "abs", F_ABS, 1 }, { "sqrt", F_SQRT, 1 }, { "exp", F_EXP, 1 },
    { "log", F_LOG, 1 }, { "floor", F_FLOOR, 1 }, { "fract", F_FRACT, 1 },
    { "tanh", F_TANH, 1 }, { "sign", F_SIGN, 1 },
    { "min", F_MIN, 2 }, { "max", F_MAX, 2 }, { "pow", F_POWF, 2 },
    { "atan2", F_ATAN2, 2 },
    { "clamp", F_CLAMP, 3 }, { "mix", F_MIX, 3 }
};

/** @brief One lexical token produced by compile()'s tokeniser and consumed by its shunting-yard pass. */
struct Token
{
    enum Kind { NUM, VAR, FUNC, OP, LPAREN, RPAREN, COMMA } kind; ///< Which of the token forms this is.
    float num = 0.f;    ///< Literal value, valid only when kind == NUM.
    int   idx = 0;      // var index / func table index / op char
                         ///< Meaning depends on kind: ExprVars index (VAR), kFuncs table index (FUNC), or the operator character — including the synthetic 'n' for unary minus (OP).
};

/**
 * @brief Binding strength of an operator, for the shunting-yard pop-while-higher-or-equal-precedence rule.
 * @param opChar The operator character (as stored in Token::idx / Op-building switch): '+','-','*','/','^', or the synthetic 'n' for unary minus.
 * @return Higher number binds tighter (^ > unary minus > * / > + -); 0 for anything not a recognised operator.
 */
int precedence( int opChar )
{
    switch (opChar) {
    case '^': return 4;
    case 'n': return 5;              // unary minus
    case '*': case '/': return 3;
    case '+': case '-': return 2;
    }
    return 0;
}
/** @brief Whether an operator is right-associative (so equal-precedence chains pop the OTHER way in shunting-yard).
 * @param opChar The operator character (see precedence()).
 * @return True for '^' and unary minus ('n'); false (left-associative) for all others. */
bool rightAssoc( int opChar ) { return opChar == '^' || opChar == 'n'; }

} // namespace

/**
 * @brief Compiles @p formula into m_prog via tokenising then shunting-yard, with a final stack-depth sanity pass.
 * @param formula The expression source text.
 * @param context Label used only in stderr diagnostics to identify which formula failed.
 * @return True on success (m_ok is also set true); false on any lexical or structural error, leaving m_ok false so eval() safely returns 0.
 *
 * Three passes over the token stream:
 *  1. Tokenise: scans @p formula into NUM/VAR/FUNC/OP/LPAREN/RPAREN/COMMA
 *     tokens. A '-' is classified as unary (op char 'n') rather than binary
 *     subtraction whenever it does NOT immediately follow a value-producing
 *     token (prevWasValue) — i.e. at the start of the expression, after '(',
 *     another operator, or a comma.
 *  2. Shunting-yard: converts the infix token stream to RPN in m_prog,
 *     popping lower-or-equal precedence operators before pushing a new one
 *     (see precedence()/rightAssoc() — '^' and unary minus are
 *     right-associative so chains like `-x^y` or `2^3^2` nest correctly).
 *     A FUNC token sits on the operator stack until its matching ')' is
 *     popped, at which point it too is emitted to m_prog (functions are
 *     RPN-encoded as a single opcode consuming their fixed arity, not as
 *     a call with an argument count).
 *  3. Sanity check: replays m_prog counting stack depth per opcode's arity
 *     (1 for OP_NEG/F_SIN..F_SIGN, 3 for F_CLAMP/F_MIX, 2 otherwise) to catch
 *     malformed programs (e.g. a function invoked with the wrong argument
 *     count) that the shunting-yard pass alone wouldn't reject; a compiled
 *     program must reduce to exactly one value on the stack.
 */
bool ExprProgram::compile( const std::string &formula, const std::string &context, std::string *outError )
{
    m_prog.clear();
    m_ok = false;

    // Every parse-error site reports through this: stderr always gets the
    // context-prefixed line (unchanged behaviour for every existing caller),
    // and outError -- when a caller passed one, e.g. the editor's UI -- gets
    // just the message, so it can show something more specific than a bare
    // "invalid" indicator without also owning the "Expr [context]:" framing.
    auto fail = [&]( const std::string &msg )
    {
        fprintf( stderr, "Expr [%s]: %s\n", context.c_str(), msg.c_str() );
        if( outError ) *outError = msg;
        return false;
    };

    const char *s = formula.c_str();
    const int   n = (int)formula.size();

    // ---- Tokenise ----
    std::vector<Token> toks;
    bool prevWasValue = false;      // for unary-minus detection
    int i = 0;
    while (i < n)
    {
        char ch = s[i];
        if (ch == ' ' || ch == '\t') { ++i; continue; }

        if ((ch >= '0' && ch <= '9') || ch == '.')
        {
            char *end = nullptr;
            float v = (float)strtod(s + i, &end);
            Token t; t.kind = Token::NUM; t.num = v;
            toks.push_back(t);
            i = int(end - s);
            prevWasValue = true;
            continue;
        }
        if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch == '_')
        {
            int j = i;
            while (j < n && ((s[j] >= 'a' && s[j] <= 'z')
                          || (s[j] >= 'A' && s[j] <= 'Z')
                          || (s[j] >= '0' && s[j] <= '9') || s[j] == '_'))
                ++j;
            std::string ident(s + i, j - i);
            i = j;

            int fidx = -1;
            for (size_t f = 0; f < sizeof(kFuncs) / sizeof(kFuncs[0]); ++f)
                if (ident == kFuncs[f].name) { fidx = (int)f; break; }
            if (fidx >= 0)
            {
                Token t; t.kind = Token::FUNC; t.idx = fidx;
                toks.push_back(t);
                prevWasValue = false;
                continue;
            }
            int vidx = -1;
            for (int v = 0; v < ExprVars::V_COUNT; ++v)
                if (ident == kVarNames[v]) { vidx = v; break; }
            if (vidx < 0)
                return fail("unknown identifier '" + ident + "'");
            Token t; t.kind = Token::VAR; t.idx = vidx;
            toks.push_back(t);
            prevWasValue = true;
            continue;
        }
        if (ch == '(') { Token t; t.kind = Token::LPAREN; toks.push_back(t); prevWasValue = false; ++i; continue; }
        if (ch == ')') { Token t; t.kind = Token::RPAREN; toks.push_back(t); prevWasValue = true;  ++i; continue; }
        if (ch == ',') { Token t; t.kind = Token::COMMA;  toks.push_back(t); prevWasValue = false; ++i; continue; }
        if (ch == '+' || ch == '-' || ch == '*' || ch == '/' || ch == '^')
        {
            Token t; t.kind = Token::OP;
            t.idx = (ch == '-' && !prevWasValue) ? 'n' : ch;   // unary minus
            toks.push_back(t);
            prevWasValue = false;
            ++i;
            continue;
        }
        return fail(std::string("unexpected character '") + ch + "'");
    }

    // ---- Shunting-yard ----
    std::vector<Token> stack;
    auto popOpToProg = [&](const Token &t)
    {
        Op op;
        if (t.kind == Token::FUNC)
        {
            op.code = kFuncs[t.idx].code; op.value = 0.f;
        }
        else
        {
            switch (t.idx) {
            case '+': op.code = OP_ADD; break;
            case '-': op.code = OP_SUB; break;
            case '*': op.code = OP_MUL; break;
            case '/': op.code = OP_DIV; break;
            case '^': op.code = OP_POW; break;
            case 'n': op.code = OP_NEG; break;
            default:  op.code = OP_ADD; break;
            }
            op.value = 0.f;
        }
        m_prog.push_back(op);
    };

    for (const Token &t : toks)
    {
        switch (t.kind)
        {
        case Token::NUM: { Op o{OP_CONST, t.num}; m_prog.push_back(o); break; }
        case Token::VAR: { Op o{OP_VAR, (float)t.idx}; m_prog.push_back(o); break; }
        case Token::FUNC:   stack.push_back(t); break;
        case Token::LPAREN: stack.push_back(t); break;
        case Token::COMMA:
            while (!stack.empty() && stack.back().kind != Token::LPAREN)
            { popOpToProg(stack.back()); stack.pop_back(); }
            if (stack.empty())
                return fail("misplaced comma");
            break;
        case Token::OP:
            while (!stack.empty() && stack.back().kind == Token::OP
                   && (precedence(stack.back().idx) > precedence(t.idx)
                       || (precedence(stack.back().idx) == precedence(t.idx)
                           && !rightAssoc(t.idx))))
            { popOpToProg(stack.back()); stack.pop_back(); }
            stack.push_back(t);
            break;
        case Token::RPAREN:
            while (!stack.empty() && stack.back().kind != Token::LPAREN)
            { popOpToProg(stack.back()); stack.pop_back(); }
            if (stack.empty())
                return fail("unbalanced ')'");
            stack.pop_back();                          // the '('
            if (!stack.empty() && stack.back().kind == Token::FUNC)
            { popOpToProg(stack.back()); stack.pop_back(); }
            break;
        }
    }
    while (!stack.empty())
    {
        if (stack.back().kind == Token::LPAREN)
            return fail("unbalanced '('");
        popOpToProg(stack.back());
        stack.pop_back();
    }

    // ---- Sanity: simulate stack depth ----
    int depth = 0;
    for (const Op &op : m_prog)
    {
        if (op.code == OP_CONST || op.code == OP_VAR) { ++depth; continue; }
        int arity = 2;
        if (op.code == OP_NEG || (op.code >= F_SIN && op.code <= F_SIGN)) arity = 1;
        else if (op.code == F_CLAMP || op.code == F_MIX) arity = 3;
        if (depth < arity)
            return fail("malformed expression");
        depth -= arity - 1;
    }
    if (depth != 1)
        return fail("malformed expression");

    m_ok = true;
    return true;
}

/**
 * @brief Runs the compiled RPN program (m_prog) against @p vars on a small fixed-size stack.
 * @param vars Array of ExprVars::V_COUNT floats indexed by ExprVars::Index; supplies the live audio/time feature values.
 * @return The single value left on the stack after executing every instruction, or 0 if compile() had failed or the program didn't reduce to exactly one value.
 *
 * The stack is a fixed `float st[32]` with no bounds-checked growth — pushes
 * beyond depth 32 are silently dropped (`if (sp < 32)`); this is safe only
 * because compile()'s stack-depth sanity pass already rejects any program
 * whose evaluation could underflow, and formulas short enough to be preset
 * `<expr>` attributes never come close to depth 32. Division guards against
 * a near-zero divisor (returns 0 instead of Inf/NaN) and log()/sqrt() clamp
 * their argument into a domain-safe range, so a pathological live feature
 * value can't poison the uniform with a NaN.
 */
float ExprProgram::eval( const float *vars ) const
{
    if (!m_ok) return 0.f;

    float st[32];
    int   sp = 0;

    for (const Op &op : m_prog)
    {
        if (op.code == OP_CONST) { if (sp < 32) st[sp++] = op.value; continue; }
        if (op.code == OP_VAR)   { if (sp < 32) st[sp++] = vars[(int)op.value]; continue; }

        switch (op.code)
        {
        case OP_ADD: st[sp-2] = st[sp-2] + st[sp-1]; --sp; break;
        case OP_SUB: st[sp-2] = st[sp-2] - st[sp-1]; --sp; break;
        case OP_MUL: st[sp-2] = st[sp-2] * st[sp-1]; --sp; break;
        case OP_DIV: st[sp-2] = (fabsf(st[sp-1]) > 1e-9f)
                              ? st[sp-2] / st[sp-1] : 0.f; --sp; break;
        case OP_POW: st[sp-2] = powf(st[sp-2], st[sp-1]); --sp; break;
        case OP_NEG: st[sp-1] = -st[sp-1]; break;
        case F_SIN:  st[sp-1] = sinf(st[sp-1]); break;
        case F_COS:  st[sp-1] = cosf(st[sp-1]); break;
        case F_TAN:  st[sp-1] = tanf(st[sp-1]); break;
        case F_ABS:  st[sp-1] = fabsf(st[sp-1]); break;
        case F_SQRT: st[sp-1] = sqrtf(fmaxf(st[sp-1], 0.f)); break;
        case F_EXP:  st[sp-1] = expf(st[sp-1]); break;
        case F_LOG:  st[sp-1] = logf(fmaxf(st[sp-1], 1e-9f)); break;
        case F_FLOOR:st[sp-1] = floorf(st[sp-1]); break;
        case F_FRACT:st[sp-1] = st[sp-1] - floorf(st[sp-1]); break;
        case F_TANH: st[sp-1] = tanhf(st[sp-1]); break;
        case F_SIGN: st[sp-1] = (st[sp-1] > 0.f) ? 1.f
                              : (st[sp-1] < 0.f) ? -1.f : 0.f; break;
        case F_MIN:  st[sp-2] = fminf(st[sp-2], st[sp-1]); --sp; break;
        case F_MAX:  st[sp-2] = fmaxf(st[sp-2], st[sp-1]); --sp; break;
        case F_POWF: st[sp-2] = powf(st[sp-2], st[sp-1]); --sp; break;
        case F_ATAN2:st[sp-2] = atan2f(st[sp-2], st[sp-1]); --sp; break;
        case F_CLAMP:st[sp-3] = fminf(fmaxf(st[sp-3], st[sp-2]), st[sp-1]);
                     sp -= 2; break;
        case F_MIX:  st[sp-3] = st[sp-3] + (st[sp-2] - st[sp-3]) * st[sp-1];
                     sp -= 2; break;
        default: break;
        }
    }
    return (sp == 1) ? st[0] : 0.f;
}
