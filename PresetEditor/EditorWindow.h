// EditorWindow.h — the standalone preset editor's main window.
#pragma once

#include <QtWidgets/QMainWindow>
#include "Preset.h"

class PreviewWidget;
class QComboBox;
class QSpinBox;
class QDoubleSpinBox;
class QLineEdit;
class QTableWidget;
class QLabel;

class EditorWindow : public QMainWindow
{
    Q_OBJECT
public:
    explicit EditorWindow(const QString &projectRoot, QWidget *parent = nullptr);

    // Default <bool>/<int>/<float> params for the known legacy shaders (empty for
    // the modern shaders, which read audio uniforms directly).  Shared with the
    // headless self-test.
    static QVector<ShaderParam> defaultParamsFor(const QString &fileName);

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

    QString m_root;
    Preset  m_preset;

    PreviewWidget *m_preview = nullptr;
    QComboBox *m_texCombo  = nullptr;
    QComboBox *m_combCombo = nullptr;
    QComboBox *m_musicCombo = nullptr;
    QComboBox *m_typeCombo = nullptr;
    QSpinBox  *m_minSolo = nullptr, *m_maxSolo = nullptr;
    QSpinBox  *m_minInterp = nullptr, *m_maxInterp = nullptr;
    QDoubleSpinBox *m_prob = nullptr;
    QSpinBox  *m_complex = nullptr;

    QTableWidget *m_table = nullptr;

    QLineEdit *m_nameEdit = nullptr;
    QLineEdit *m_imgDirEdit = nullptr;
    QSpinBox  *m_gSoloMin = nullptr, *m_gSoloMax = nullptr;
    QSpinBox  *m_gInterpMin = nullptr, *m_gInterpMax = nullptr;

    QLabel *m_status = nullptr;

    QString m_wavPath;       // current real-audio preview WAV (empty = synthetic)
};
