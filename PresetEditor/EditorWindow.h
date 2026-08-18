/**
 * @file EditorWindow.h
 * @brief The standalone preset editor's main window.
 *
 * EditorWindow.h — the standalone preset editor's main window.
 */
#pragma once

#include <QtWidgets/QMainWindow>
#include <QtCore/QStringList>
#include <memory>
#include "Preset.h"

class PreviewWidget;
class QCheckBox;
class QComboBox;
class QSpinBox;
class QDoubleSpinBox;
class QLineEdit;
class QTableWidget;
class QLabel;
class QTimer;
class ExprProgram;

/**
 * @brief Main window of the standalone Preset Editor application.
 *
 * Hosts the live GL preview (PreviewWidget) alongside the full authoring UI:
 * texture/combine shader selection, an "add to preset" panel for new
 * PresetEntry rows, the preset-contents table, a per-entry parameter range
 * and formula/audio-mapping editor, and preset metadata + file actions
 * (New/Open/Save). Owns exactly one Preset (#m_preset) being edited at a
 * time, plus a permanently-loaded reference copy of Komplett.xml
 * (#m_komplett) used as the default/complete parameter set for any shader.
 * All GUI state is kept in sync with #m_preset through metaToUi()/uiToMeta()
 * and refreshTable()/rebuildRangeEditor()/rebuildParamSliders().
 */
class EditorWindow : public QMainWindow
{
    Q_OBJECT
public:
    /**
     * @brief Construct the editor window and build its entire UI.
     * @param projectRoot Root folder of the visualizer project (holds standard.vert, Configurations/, Scene2D/, Scene3D/, Combine/); resolved by main.cpp's findRoot().
     * @param parent Optional Qt parent widget.
     */
    explicit EditorWindow(const QString &projectRoot, QWidget *parent = nullptr);

    /**
     * @brief Look up a shader's default parameter set from the loaded Komplett.xml reference.
     * @param fileName Bare shader filename (e.g. "Kaleidoscope.frag") to look up.
     * @return A copy of that shader's Komplett.xml `<TextureShader>`/`<CombineShader>` params, or an empty vector if it has no Komplett.xml entry.
     *
     * Default `<bool>`/`<int>`/`<float>`/`<expr>` params for a shader, copied from its
     * Komplett.xml entry (the exhaustive reference the whole engine tunes
     * against) so a newly-added preset entry starts COMPLETE instead of with
     * an empty or partial param list -- a missing param silently rolls its
     * uniform to GLSL's zero default at runtime, which degrades scenes.
     * Empty if the shader has no Komplett.xml entry.
     */
    QVector<ShaderParam> defaultParamsFor(const QString &fileName) const;

protected:
    /**
     * @brief Keyboard-shortcut dispatcher for the window (texture/combine stepping, add/remove entry, music toggle, audio-WAV load).
     * @param e The key event.
     */
    void keyPressEvent(QKeyEvent *e) override;

private slots:
    /// @brief Reacts to a texture-shader combo change: infers the entry type from the shader's folder/filename, pushes it to the preview, and rebuilds the parameter sliders.
    void onTextureChanged();
    /// @brief Reacts to a combine-shader combo change: pushes it to the preview and rebuilds the parameter sliders.
    void onCombineChanged();
    /// @brief Appends a new TextureShader PresetEntry built from the "Add current shader to preset" panel (with defaultParamsFor() params) and refreshes the table.
    void addTextureEntry();
    /// @brief Appends a new CombineShader PresetEntry built from the "Add current shader to preset" panel (with defaultParamsFor() params) and refreshes the table.
    void addCombineEntry();
    /// @brief Removes the currently table-selected preset entry, if any, and refreshes the table.
    void removeSelectedEntry();
    /// @brief Rebuilds the range editor for the newly selected row and mirrors that entry's fields back into the shader combos and add-controls.
    void onTableSelectionChanged();
    /// @brief Replaces #m_preset with a blank Preset (keeping the current ImageDirectory) and refreshes the UI.
    void newPreset();
    /// @brief Prompts for a preset XML file under Configurations/, loads it via Preset::load(), and refreshes the UI on success (shows a warning dialog on failure).
    void openPreset();
    /// @brief Writes #m_preset to Configurations/&lt;name&gt;.xml, confirming before overwrite and reporting errors via a dialog.
    void savePreset();
    /// @brief Prompts for a directory and applies it as both the ImageDirectory field and the preview's image source.
    void browseImageDir();
    void loadAudioWav();     ///< real-analyzer WAV preview (looped)
    void randomizeParams();          ///< dice: random values on every slider
    void freezeParamsIntoEntry();    ///< write slider values as min=max params

private:
    /**
     * @brief Populate the texture/combine shader combos by scanning Scene/, Scene3D/ and Combine/ for *.frag files.
     *
     * Records which files came from Scene3D/ into #m_scene3DFiles (so
     * onTextureChanged()/isScene3D() can tell 3D scenes apart from 2D ones
     * without relying on any naming convention), and defaults the combine
     * selection to "FxPlain.frag" when present.
     */
    void scanShaders();
    /// @brief Repopulates #m_table's rows from m_preset's entries and rebuilds the range editor for the (possibly now-stale) selection.
    void refreshTable();
    /// @brief Pushes #m_preset's metadata fields (name, hidden, image dir, timing) into their UI widgets and refreshes the table.
    void metaToUi();
    /// @brief Reads the metadata UI widgets back into #m_preset (called before saving).
    void uiToMeta();
    /**
     * @brief Advance a combo box's current index by @p delta, wrapping around.
     * @param c Combo box to change.
     * @param delta Signed step, typically +1 or -1 (used by the [ ] and , . keyboard shortcuts).
     */
    void stepCombo(QComboBox *c, int delta);
    bool isScene3D(const QString &fileName) const { return m_scene3DFiles.contains(fileName); }   ///< True if fileName was found under Scene3D/ (not Scene2D/) by scanShaders().
    /**
     * @brief Send the "Add to preset" panel's current type/geom/stateBytes/shadowExtent settings to the live preview.
     *
     * Split out of onTextureChanged() so the geom/stateBytes/shadowExtent
     * fields can push an update on their own, without re-deriving which
     * file is selected.
     */
    void pushPreviewTexture();   // send the full type/geom/stateBytes/shadowExtent to m_preview

    /**
     * @brief Rebuild the live parameter-slider panel for the currently previewed texture/combine shader.
     *
     * Live parameter sliders: per-activation params of the previewed shaders,
     * with slider ranges taken from Komplett.xml (which registers every shader
     * with sensible min/max). If the previewed shader matches the table-
     * selected entry, ranges are taken from that entry's own saved range
     * instead, so panel edits are visible immediately.  Slider values
     * override the preview defaults.
     */
    void rebuildParamSliders();
    /// @brief Maps every slider's current [0,1000] position into its parameter's [minV,maxV] range and sends the resulting overrides to the preview.
    void pushParamOverrides();
    /**
     * @brief One live parameter slider's binding: which uniform it drives, its value range, and which shader stage it belongs to.
     */
    struct SliderInfo {
        QString name;       ///< Parameter/uniform name.
        float minV, maxV;   ///< Range the slider's [0,1000] position is linearly mapped into.
        bool isInt;         ///< True if the underlying param is declared int (affects rounding/formatting).
        bool fromCombine;   ///< True if this slider belongs to the combine shader rather than the texture shader.
        class QSlider *slider;   ///< The actual slider widget.
    };
    QVector<SliderInfo> m_sliders;   ///< Registry of all live parameter sliders currently shown; rebuilt by rebuildParamSliders().
    class QGroupBox    *m_paramBox  = nullptr;   ///< Group box hosting the live parameter-slider panel.
    class QFormLayout  *m_paramForm = nullptr;   ///< Form layout the sliders are added to (rows cleared/rebuilt on every rebuildParamSliders() call).
    class QCheckBox    *m_transCheck = nullptr;   ///< transition slow-motion bench

    /**
     * @brief Rebuild the "Selected entry: parameter ranges / formula / audio mapping" panel for the table-selected entry.
     *
     * Per-preset-entry parameter RANGE editor (as opposed to the single-value
     * preview sliders above): lets a preset deliberately diverge from
     * Komplett.xml's default range for one shader -- e.g. a slower speedP
     * band in Ambient than in Club for the same shader, rather than every
     * preset mechanically inheriting identical ranges.  Rows are built from
     * the union of the selected entry's own params and Komplett.xml's
     * declared set; editing a row that only exists in Komplett (i.e. is
     * currently missing from the entry) ADDS it -- the same action doubles
     * as the fix for an accidentally-absent param.
     */
    void rebuildRangeEditor();
    QGroupBox   *m_rangeBox  = nullptr;   ///< Group box hosting the per-entry range/formula/audio-mapping editor.
    QFormLayout *m_rangeForm = nullptr;   ///< Form layout the range-editor rows are added to (cleared/rebuilt by rebuildRangeEditor()).
    QLabel      *m_rangeHint = nullptr;   ///< "select an entry" placeholder

    /**
     * @brief One `<expr>` formula row's live-evaluation state in the range editor.
     *
     * `<expr>` rows in the range editor get a live "current value" readout and
     * a red/invalid state instead of the formula silently evaluating to 0 on
     * a typo (ExprEval only ever logged parse errors to stderr). Recompiled
     * on every keystroke (see rebuildRangeEditor()); re-evaluated on a timer
     * since the result depends on the animated synthetic audio state, not
     * just the formula text.
     */
    struct ExprRow {
        QLineEdit *edit;                    ///< The formula's text-edit widget.
        QLabel *valueLbl;                   ///< Label showing the formula's current evaluated value, or an error/placeholder state.
        std::shared_ptr<ExprProgram> prog;  ///< Compiled program for the current formula text, or null if empty/invalid.
    };
    QVector<ExprRow> m_exprRows;   ///< All currently-shown expr rows; rebuilt by rebuildRangeEditor(), re-evaluated each tick by tickExprValues().
    QTimer *m_exprTimer = nullptr;   ///< Fires tickExprValues() periodically so expr readouts track the animated audio state.
    /// @brief Re-evaluates every currently-valid expr row's compiled program against the animated audio state and updates its value label.
    void tickExprValues();

    QString m_root;   ///< Project root directory (holds standard.vert, Configurations/, Scene2D/, Scene3D/, Combine/).
    Preset  m_preset; ///< The preset currently being authored/edited.
    Preset  m_komplett;   ///< loaded once from Configurations/Komplett.xml; the reference range set

    PreviewWidget *m_preview = nullptr;   ///< Embedded live GL preview widget.
    QComboBox *m_texCombo  = nullptr;   ///< Texture-shader selection combo (drives the preview and "add texture" panel).
    QComboBox *m_combCombo = nullptr;   ///< Combine-shader selection combo (drives the preview and "add combine" panel).
    QComboBox *m_musicCombo = nullptr;   ///< Synthetic preview music profile selector (Beat / Drone).
    QComboBox *m_typeCombo = nullptr;   ///< "Add to preset" panel: texture entry type (normal / KaleidoscopeBase / scene3d).
    QSpinBox  *m_minSolo = nullptr, *m_maxSolo = nullptr;   ///< "Add to preset" panel: minTimeSolo/maxTimeSolo for the next entry.
    QSpinBox  *m_minInterp = nullptr, *m_maxInterp = nullptr;   ///< "Add to preset" panel: minTimeInterpolation/maxTimeInterpolation for the next entry.
    QDoubleSpinBox *m_prob = nullptr;   ///< "Add to preset" panel: probability for the next entry.
    QSpinBox  *m_complex = nullptr;   ///< "Add to preset" panel: complexity for the next entry.

    // scene3d authoring (only meaningful/enabled when m_typeCombo == "scene3d").
    QComboBox      *m_geomCombo = nullptr;   ///< scene3d authoring: geometry kind ("points"/"cubes"/"ribbon"/...).
    QSpinBox       *m_stateBytesSpin = nullptr;   ///< scene3d authoring: persistent generator state buffer size (0 = none).
    QDoubleSpinBox *m_shadowExtentSpin = nullptr;   ///< scene3d authoring: shadow-box half-width (0 = engine default).
    QStringList     m_scene3DFiles;   ///< Scene3D/*.frag, populated by scanShaders()

    QTableWidget *m_table = nullptr;   ///< "Preset contents" table; one row per entry in m_preset.entries, rebuilt by refreshTable().

    QLineEdit *m_nameEdit = nullptr;   ///< Preset name field (ConfigurationName / on-disk filename stem).
    QCheckBox *m_hiddenCheck = nullptr;   ///< hidden="true" root attribute
    QLineEdit *m_imgDirEdit = nullptr;   ///< ImageDirectory field.
    QSpinBox  *m_gSoloMin = nullptr, *m_gSoloMax = nullptr;   ///< Preset-level (root attribute) timeTextureSoloMin/Max fields.
    QSpinBox  *m_gInterpMin = nullptr, *m_gInterpMax = nullptr;   ///< Preset-level (root attribute) timeTextureInterpolationMin/Max fields.

    QLabel *m_status = nullptr;   ///< Status-bar label; most actions update it to report their outcome.

    QString m_wavPath;       ///< current real-audio preview WAV (empty = synthetic)
};
