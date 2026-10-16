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

## Text the app and the tools read out of the shaders

Same tokens are not enough where a program searches the shader *text*. These contracts hold for any layout:

| Who | Reads | How |
|---|---|---|
| `EffectShader::parseChainSource()` | `// @chainclasses`, `// @chainord`, `// @chainss`, `// @chainopening` | whole comment lines, never wrapped (`cgvr_format.py`) |
| `EffectShader::parseChainSource()` | `int permCode( int i ) { ... return N; ... }` | `returnedValues()`: the definition however it is wrapped |
| `EffectShader::parseChainSource()` | `const float chainAP = 0.4752;` (frozen likes) | lines starting with `const float `; these names mirror the knob uniforms and are not renamed |
| `EffectShader::usesSceneLod()` | a `textureLod( tex0, ... )` call | `callsWithFirstArg()`: spaces between name, parenthesis and argument do not matter |
| `EffectShader` constructor | `// @chainbake`, `// @chain3d` | substring of a comment line |
| `Tools/scenegen/register_new.py` | `uniform float <knob>P;` | `uniform\s+float\s+(\w+P)\s*;` |
| `Tools/scenegen/make_chainpass.py` | the chain labs' functions and statements | reads the labs from `gen.assemble()`, i.e. before formatting |

Until 16.10.2026 the `permCode` and `textureLod(tex0` searches compared exact characters; the reformat of commit
33492b88 broke both (the chain labs lost their 24 stage orders, 302 shaders their scene mip levels) until they were
made layout-independent.

## Names (C++)

`.clang-tidy` holds the rules (readability-identifier-naming); `python Tools/cgvr_rename.py --plan` lists what
breaks them, `--apply` renames. clang-tidy finds every declaration and reference semantically; the new names are
formed after the guidelines' examples, not clang-tidy's suggestions:

| Kind | Rule | Example |
|---|---|---|
| Local variable | lower case, words joined by `_` | `applyBench` → `apply_bench`, `scenes3D` → `scenes_3d` |
| Constant (global, static, class, `constexpr`, local named constant) | CamelCase like `MaxNum`, the old `k` dropped | `kWaveRing` → `WaveRing`, `static const bool dbg` → `Dbg` |
| Instance variable | `m_` + camelCase | `vertices` → `m_vertices`, `m_sh_prog_id` → `m_shProgId` |
| Class variable | `M_` + CamelCase | `s_frozen` → `M_Frozen` |
| Enum type / member | suffix `E` / `ALL_CAPS` | `CueSection::Drop` → `CueSectionE::DROP` |
| typedef, type alias, template type parameter | suffix `T` | `Clock` → `ClockT` |
| Method, function | lowerCamelCase | `L1Norm` → `l1Norm`, `Strings::T` → `Strings::uiText` |

A rename is refused when its new name already occurs where it could clash; those few got names by hand
(`Tools/cgvr_rename.py`, `MANUAL`). References that clang-tidy cannot see -- an `#if` branch not compiled on Windows,
a macro -- are searched in each variable's block; the one found (`Utils.cpp`, the non-Windows timer) was renamed by
hand.

### Deviations

| Rule | Here | Why |
|---|---|---|
| Parameters, global and file-static variables, fields of plain data structs, namespaces | Not renamed | The guidelines give no rule for them |
| Typedefs end in `T` | `GLchar`, `GLsizeiptr`, `GLintptr`, `GLDEBUGPROCKC` (`glcore.h`) stay | They are the OpenGL API's own names |
| Classes are CamelCase | `Ui_MainWindow` stays | uic generates that name |
| Local variables are lower case | `W`, `H`, `N`, `NB` stay where they are `const` | They are named constants (`const int W = 64`), and constants are written like `MaxNum` |
| Global C functions carry a module prefix | Not applied | C++ here: namespaces (`Strings::`, `Platform::`) and class scope do that job |
| — | `FxEffectKaleidoscope`, `FxEffectMulti`, `TextureEffect`, `TextureEffectTunnel`, `TextureEffectTunnelReverse` and the `#if 0` block in `Uniform.cpp` keep their old names | No build compiles them, so a rename could not be checked |

## Names (GLSL)

clang-tidy does not read GLSL; `python Tools/cgvr_glsl_names.py --plan | --apply` finds the scopes itself (function
bodies, their declarations, global constants, macros, functions) and renames after the same examples:

| Kind | Example |
|---|---|
| Local variable | `lightDir` → `light_dir`, `sampleUV` → `sample_uv` |
| Local named constant | `const float TAU` → `Tau`, `kTanY` → `TanY` |
| Global constant | `PI` → `Pi`, `kGround` → `Ground`, `MAX_STEPS` → `MaxSteps`, `M_PI` → `Pi` |
| Macro | `#define spacing (...)` → `SPACING` |
| Function | `hue_of` → `hueOf`, `stageAk_0` → `stageAk0` |

Every new name is new to its file, so mapping it back must give the old token sequence exactly; a file that fails
this is not written. Generated shaders get their names when they are written (`gen.py`, `make_chainpass.py` call
`layout_and_names()`), so regenerating gives the committed files byte for byte.

### Deviations

| Rule | Here | Why |
|---|---|---|
| Local variables are lower case | `N`, `L`, `P`, `R`, `V`, `ND`, `R2` ... stay | The vectors of shading maths (normal, light, point, reflection); lower case they would clash with the scalar or 2D namesakes in the same function (`p`, `n`) |
| Constants are written like `MaxNum` | One upper-case letter with digits (`E`, `M2`, `R0`) stays | Same notation, nothing to gain |
| — | Uniforms, `in`/`out` variables, buffer blocks and struct members keep their names | They are the interface to the app, the presets, the other shader stage and the tools |
| Constants are written like `MaxNum` | `const float chainAP = 0.47;` (frozen likes) keeps its name | `EffectShader::parseChainSource()` reads it under the knob's name |
| Functions are lowerCamelCase | `permCode` and `main` are kept as they are | `EffectShader` reads `permCode` by name; `main` is GLSL's |
| — | Parameters are not renamed | The guidelines give no rule for them |
| — | 92 locals keep their name | The new name would also be a parameter, a file-scope name or a macro word somewhere in the file: a rename there could change what a name refers to |
| Generated files follow the guidelines | `Tools/scenegen/src/*.glsl` and the GLSL inside `gen.py` keep the old names | The generators patch that text with patterns written for it; their output is renamed when it is written |

## C++ language rules

| Rule | How it holds |
|---|---|
| C++ casts only | All C-style and functional casts are `static_cast`/`reinterpret_cast` (clang-tidy `google-readability-casting`, run through `Tools/cgvr_tidy.py --fix`) |
| Single-argument constructors are `explicit` | clang-tidy `google-explicit-constructor`; conversion operators too |
| `const` consistently, `const &` for read-only objects | clang-tidy `readability-make-member-function-const`, `performance-unnecessary-value-param` |
| Copy constructor and assignment always declared | Every class declares both (`Tools/cgvr_copyops.py`): `= delete` where nothing copies it (C++11's form of template.h's private undefined declarations), `= default` plus the move operations where instances live by value (`ExprProgram`) |
| Virtual destructors | `EffectShader` and `Scene3DShader`, the one hierarchy deleted through its base |
| Assignment operators return `void` | `Vector3D`, `Vector4D` |
| Member variables are never public | `Configuration` has accessors; `RenderPipeline`'s mesh and image members are private (`ImageLoader` is a friend: it fills the next photo) |
| No assignment inside a condition | The uniform upload in `EffectShader` assigns, then tests |
| Every `switch` has a `default` | A "can't happen" default prints what it got and goes on |
| `++i`, not `i++` | Where the value is unused: `for` increments and statements of their own, C++ and GLSL (`Tools/cgvr_preincrement.py`) |

### Deviations

| Rule | Here | Why |
|---|---|---|
| Virtual destructors in every class | Only where a class is used polymorphically | A vtable in value types and plain data (`AudioFeatures`, `Vector3D`) would change their layout and size for nothing |
| Avoid multiple inheritance | `PresetEditor`'s `PreviewWidget : QOpenGLWidget, QOpenGLFunctions` | Qt's documented way to reach the GL functions from a widget |
| Member variables are never public | `Vector3D`/`Vector4D` keep public `x y z w`; plain data `struct`s keep public fields | Value types of maths and records without invariants; the guidelines give no rule for struct fields |
| Avoid nested classes | Records nested in the class they serve stay (`Mesh::Triangle`, `ScoreCues::Frame`) | They have no meaning outside it |
| Assignment operators return `void` | Defaulted ones (`ExprProgram`) return a reference | That is what `= default` declares; the containers holding them require it |
| — | `IMMDeviceEnumerator`'s destructor | A Windows COM interface, not ours |

## Known state outside the guidelines

- 223 of the 264 scenes that `gen.py` builds from `Tools/scenegen/src` differ from what `gen.py` produces today: the
  generator's shared library grew (`kaleidoUV`, `audioPhase`, the chain library) after they were last built.
  Rebuilding them is a content change, not a layout change, and is left for a round that looks at the scenes.
