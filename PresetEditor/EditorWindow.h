// EditorWindow.h — the standalone preset editor's main window.
#pragma once

#include <QtWidgets/QMainWindow>
#include <QtCore/QStringList>
#include <memory>
#include "Preset.h"

class PreviewWidget;
class QComboBox;
class QSpinBox;
class QDoubleSpinBox;
class QLineEdit;
class QTableWidget;
class QLabel;
class QTimer;
class ExprProgram;

class EditorWindow : public QMainWindow
{
    Q_OBJECT
public:
    explicit EditorWindow(const QString &projectRoot, QWidget *parent = nullptr);

    // Default <bool>/<int>/<float>/<expr> params for a shader, copied from its
    // Komplett.xml entry (the exhaustive reference the whole engine tunes
    // against) so a newly-added preset entry starts COMPLETE instead of with
    // an empty or partial param list -- a missing param silently rolls its
    // uniform to GLSL's zero default at runtime, which degrades scenes.
    // Empty if the shader has no Komplett.xml entry.
    QVector<ShaderParam> defaultParamsFor(const QString &fileName) const;

protected:
    void keyPressEvent(QKeyEvent *e) override;

private slots:
    void onTextureChanged();
    void onCombineChanged();
    void addTextureEntry();
    void addCombineEntry();
    void removeSelectedEntry();
    void onTableSelectionChanged();
    void newPreset();
    void openPreset();
    void savePreset();
    void browseImageDir();
    void loadAudioWav();     // real-analyzer WAV preview (looped)
    void randomizeParams();          // dice: random values on every slider
    void freezeParamsIntoEntry();    // write slider values as min=max params

private:
    void scanShaders();
    void refreshTable();
    void metaToUi();
    void uiToMeta();
    void stepCombo(QComboBox *c, int delta);
    // True if fileName was found under Scene3D/ (not Scene/) by scanShaders().
    bool isScene3D(const QString &fileName) const { return m_scene3DFiles.contains(fileName); }
    void pushPreviewTexture();   // send the full type/geom/stateBytes/shadowExtent to m_preview

    // Live parameter sliders: per-activation params of the previewed shaders,
    // with slider ranges taken from Komplett.xml (which registers every shader
    // with sensible min/max).  Slider values override the preview defaults.
    void rebuildParamSliders();
    void pushParamOverrides();
    struct SliderInfo { QString name; float minV, maxV; bool isInt;
                        bool fromCombine; class QSlider *slider; };
    QVector<SliderInfo> m_sliders;
    class QGroupBox    *m_paramBox  = nullptr;
    class QFormLayout  *m_paramForm = nullptr;
    class QCheckBox    *m_transCheck = nullptr;   // transition slow-motion bench
    QSpinBox           *m_transSpin  = nullptr;

    // Per-preset-entry parameter RANGE editor (as opposed to the single-value
    // preview sliders above): lets a preset deliberately diverge from
    // Komplett.xml's default range for one shader -- e.g. a slower speedP
    // band in Ambient than in Club for the same shader, rather than every
    // preset mechanically inheriting identical ranges.  Rows are built from
    // the union of the selected entry's own params and Komplett.xml's
    // declared set; editing a row that only exists in Komplett (i.e. is
    // currently missing from the entry) ADDS it -- the same action doubles
    // as the fix for an accidentally-absent param.
    void rebuildRangeEditor();
    QGroupBox   *m_rangeBox  = nullptr;
    QFormLayout *m_rangeForm = nullptr;
    QLabel      *m_rangeHint = nullptr;   // "select an entry" placeholder

    // <expr> rows in the range editor get a live "current value" readout and
    // a red/invalid state instead of the formula silently evaluating to 0 on
    // a typo (ExprEval only ever logged parse errors to stderr). Recompiled
    // on every keystroke (see rebuildRangeEditor()); re-evaluated on a timer
    // since the result depends on the animated synthetic audio state, not
    // just the formula text.
    struct ExprRow { QLineEdit *edit; QLabel *valueLbl; std::shared_ptr<ExprProgram> prog; };
    QVector<ExprRow> m_exprRows;
    QTimer *m_exprTimer = nullptr;
    void tickExprValues();

    QString m_root;
    Preset  m_preset;
    Preset  m_komplett;   // loaded once from Configurations/Komplett.xml; the reference range set

    PreviewWidget *m_preview = nullptr;
    QComboBox *m_texCombo  = nullptr;
    QComboBox *m_combCombo = nullptr;
    QComboBox *m_musicCombo = nullptr;
    QComboBox *m_typeCombo = nullptr;
    QSpinBox  *m_minSolo = nullptr, *m_maxSolo = nullptr;
    QSpinBox  *m_minInterp = nullptr, *m_maxInterp = nullptr;
    QDoubleSpinBox *m_prob = nullptr;
    QSpinBox  *m_complex = nullptr;

    // scene3d authoring (only meaningful/enabled when m_typeCombo == "scene3d").
    QComboBox      *m_geomCombo = nullptr;
    QSpinBox       *m_stateBytesSpin = nullptr;
    QDoubleSpinBox *m_shadowExtentSpin = nullptr;
    QStringList     m_scene3DFiles;   // Scene3D/*.frag, populated by scanShaders()

    QTableWidget *m_table = nullptr;

    QLineEdit *m_nameEdit = nullptr;
    QLineEdit *m_imgDirEdit = nullptr;
    QSpinBox  *m_gSoloMin = nullptr, *m_gSoloMax = nullptr;
    QSpinBox  *m_gInterpMin = nullptr, *m_gInterpMax = nullptr;

    QLabel *m_status = nullptr;

    QString m_wavPath;       // current real-audio preview WAV (empty = synthetic)
};
