# CGVR programming guidelines: how they are applied here

The C++ sources (`Source/`, `PresetEditor/`, `SetupTool/`) and the GLSL shaders (`Scene2D/`, `Scene3D/`, `FX/`,
`Transitions/`, `Engine/`) follow the CGVR programming guidelines
(<https://cgvr.informatik.uni-bremen.de/progr/guidelines.shtml>) and their comment templates (`template.h`,
`template.cpp`, `template-comments.cpp`). The guidelines allow a rule to be broken where that makes the code more
readable, robust or maintainable; every such case is listed below with its reason. Comments stay in English.

## Tools

| What | How |
|---|---|
| Layout | `python Tools/cgvr_format.py` (clang-format with `.clang-format`, then `Tools/clang-format-wrap120.yaml` on long lines only) |
| Proof that a reformat changed layout only | `python Tools/cgvr_format.py --verify <git ref>`: same tokens, same comment words, same run-time comment directives |
| Generated shaders | `Tools/scenegen/gen.py` and `make_chainpass.py` write their output through `cgvr_format.format_text()` |

## Layout

- 4 spaces per level, no tabs; braces on lines of their own (Allman), K&R nowhere.
- Spaces inside parentheses (`if ( a == b )`, `f( x )`), a space before the parenthesis of a control statement only,
  as in `template.cpp`.
- `*` and `&` belong to the variable (`int *p`, `const QString &name`).
- Consecutive declarations and trailing comments are aligned in columns.
- One statement per line; the body of an `if`/`for`/`while` without braces goes on the next line (`template.cpp`).
- Constructor initialisers one per line, the colon leading.

### Deviations

| Rule | Here | Why |
|---|---|---|
| Lines "möglichst" ≤ 80 characters | Only lines longer than **120** characters are wrapped; shorter lines keep the break their author chose | Decision of 16.10.2026: re-wrapping ~6,500 lines at 80 would have rewritten most expressions for little gain. 21 lines stay longer: digit tables in comments and regular expressions in string literals that have no break point |
| Braces on lines of their own | One-line member functions inside a class body stay on one line (`int count() const { return m_count; }`); `case X: return y;` stays on one line | Four lines per accessor or per entry of a value table would bury the interface; each line still holds one statement |
| — | Continuation lines start with the operator (`* audioSwell`) | The guidelines do not say; the code did this in 1,713 places and after it in 126 |
| — | Comment lines of the form `// @name ...` are never wrapped | The app parses them at run time (`EffectShader`: `@chainclasses`, `@chainord`, `@chainss`, `@chainopening`, `@chainbake`; `gen.py`: `@expr`) |
| Whole code base formatted | The `#if 0` block in `Source/Uniform.cpp` (the original Shader Maker `CUniform`, kept as reference) is untouched | clang-format does not format disabled code |
| Generated files follow the guidelines | `Tools/scenegen/src/*.glsl` (the generator's sources) keep their own layout | `gen.py` and `make_chainpass.py` cut and patch that text with patterns written for it; their output is formatted when it is written |

## Known state outside the guidelines

- 223 of the 264 scenes that `gen.py` builds from `Tools/scenegen/src` differ from what `gen.py` produces today: the
  generator's shared library grew (`kaleidoUV`, `audioPhase`, the chain library) after they were last built.
  Rebuilding them is a content change, not a layout change, and is left for a round that looks at the scenes.
