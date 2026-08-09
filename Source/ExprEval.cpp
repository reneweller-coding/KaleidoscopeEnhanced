// ExprEval.cpp — see ExprEval.h.  Classic shunting-yard to RPN, evaluated
// on a small value stack.  No allocations at eval time.
#include "ExprEval.h"

#include <cstdio>
#include <cmath>
#include <cstring>

namespace {

const char *kVarNames[ExprVars::V_COUNT] = {
    "time", "bass", "mid", "treb", "bassRel", "midRel", "trebRel",
    "subBass", "high", "level", "kick", "snare", "hat", "onset", "beat",
    "beatPhase", "barPhase", "downbeat", "swell", "buildUp", "drop",
    "chromaHue", "centroid", "flux", "arousal", "valence", "ambient",
    "rhythm", "music", "advance", "phase", "dayPhase", "flatness", "zcr",
    "fadeOut", "seed1", "seed2", "seed3"
};

// RPN op codes (>= 0).  Negative codes in Op.code mean:
//   OP_CONST (-1): push Op.value;  OP_VAR (-2): push vars[(int)Op.value].
enum {
    OP_ADD, OP_SUB, OP_MUL, OP_DIV, OP_POW, OP_NEG,
    F_SIN, F_COS, F_TAN, F_ABS, F_SQRT, F_EXP, F_LOG, F_FLOOR, F_FRACT,
    F_TANH, F_SIGN,
    F_MIN, F_MAX, F_POWF, F_ATAN2,
    F_CLAMP, F_MIX
};
const int OP_CONST = -1;
const int OP_VAR   = -2;

struct FuncDef { const char *name; int code; int arity; };
const FuncDef kFuncs[] = {
    { "sin", F_SIN, 1 }, { "cos", F_COS, 1 }, { "tan", F_TAN, 1 },
    { "abs", F_ABS, 1 }, { "sqrt", F_SQRT, 1 }, { "exp", F_EXP, 1 },
    { "log", F_LOG, 1 }, { "floor", F_FLOOR, 1 }, { "fract", F_FRACT, 1 },
    { "tanh", F_TANH, 1 }, { "sign", F_SIGN, 1 },
    { "min", F_MIN, 2 }, { "max", F_MAX, 2 }, { "pow", F_POWF, 2 },
    { "atan2", F_ATAN2, 2 },
    { "clamp", F_CLAMP, 3 }, { "mix", F_MIX, 3 }
};

struct Token
{
    enum Kind { NUM, VAR, FUNC, OP, LPAREN, RPAREN, COMMA } kind;
    float num = 0.f;
    int   idx = 0;      // var index / func table index / op char
};

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
bool rightAssoc( int opChar ) { return opChar == '^' || opChar == 'n'; }

} // namespace

bool ExprProgram::compile( const QString &formula, const QString &context )
{
    m_prog.clear();
    m_ok = false;

    QByteArray ba = formula.toLatin1();
    const char *s = ba.constData();
    const int   n = ba.size();

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
            QByteArray ident(s + i, j - i);
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
            {
                fprintf(stderr, "Expr [%s]: unknown identifier '%s'\n",
                        qPrintable(context), ident.constData());
                return false;
            }
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
        fprintf(stderr, "Expr [%s]: unexpected character '%c'\n",
                qPrintable(context), ch);
        return false;
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
            {
                fprintf(stderr, "Expr [%s]: misplaced comma\n", qPrintable(context));
                return false;
            }
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
            {
                fprintf(stderr, "Expr [%s]: unbalanced ')'\n", qPrintable(context));
                return false;
            }
            stack.pop_back();                          // the '('
            if (!stack.empty() && stack.back().kind == Token::FUNC)
            { popOpToProg(stack.back()); stack.pop_back(); }
            break;
        }
    }
    while (!stack.empty())
    {
        if (stack.back().kind == Token::LPAREN)
        {
            fprintf(stderr, "Expr [%s]: unbalanced '('\n", qPrintable(context));
            return false;
        }
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
        {
            fprintf(stderr, "Expr [%s]: malformed expression\n", qPrintable(context));
            return false;
        }
        depth -= arity - 1;
    }
    if (depth != 1)
    {
        fprintf(stderr, "Expr [%s]: malformed expression\n", qPrintable(context));
        return false;
    }

    m_ok = true;
    return true;
}

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
