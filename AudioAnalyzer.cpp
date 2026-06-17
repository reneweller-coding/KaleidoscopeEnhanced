#include "AudioAnalyzer.h"

// Windows / WASAPI headers
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <functiondiscoverykeys_devpkey.h>
#include <combaseapi.h>

#include <cmath>
#include <algorithm>
#include <cstring>

// ---------------------------------------------------------------------------
// Helper: one-pole IIR low-pass coefficient for given cutoff and sample rate.
//   a = exp(-2*pi*fc/fs)
//   y[n] = a*y[n-1] + (1-a)*x[n]
// Larger 'a' → slower response (lower cutoff).
// ---------------------------------------------------------------------------
float AudioAnalyzer::coeff(float cutoffHz, int sampleRate)
{
    return std::exp(-2.f * 3.14159265f * cutoffHz / float(sampleRate));
}

// ---------------------------------------------------------------------------
// radix2fft – in-place Radix-2 Cooley-Tukey Decimation-In-Time FFT.
//
// Parameters:
//   re  – real part array, length N.  Input: windowed audio samples.
//          Output: real part of DFT coefficients X[0..N-1].
//   im  – imag part array, length N.  Input: all zeros for real-valued audio.
//          Output: imaginary part of X[0..N-1].
//   N   – transform size, MUST be a power of two (e.g. 2048).
//
// After the call, the magnitude of the k-th frequency bin is:
//   |X[k]| = sqrt(re[k]^2 + im[k]^2),  frequency = k * sampleRate / N.
//
// For real-valued input the spectrum is conjugate-symmetric:
//   X[N-k] = conj(X[k]),  so only bins 0..N/2 carry unique information.
// ---------------------------------------------------------------------------
/*static*/ void AudioAnalyzer::radix2fft(float *re, float *im, int N)
{
    // ---- Bit-reversal permutation ----
    // Reorders the input array so the butterfly passes work correctly.
    for (int i = 1, j = 0; i < N; ++i) {
        int bit = N >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit;
        if (i < j) {
            std::swap(re[i], re[j]);
            std::swap(im[i], im[j]);
        }
    }

    // ---- Butterfly stages ----
    // len doubles each iteration: 2 → 4 → 8 → … → N.
    // Each stage computes the DFT of sub-sequences of length len using
    // the DFT results of sub-sequences of length len/2 (Cooley-Tukey).
    for (int len = 2; len <= N; len <<= 1) {
        const float ang = -2.f * 3.14159265358979f / float(len);  // negative: forward FFT
        const float wRe = std::cos(ang);  // twiddle factor increment (real)
        const float wIm = std::sin(ang);  // twiddle factor increment (imag)

        for (int i = 0; i < N; i += len) {
            float curRe = 1.f, curIm = 0.f;  // current twiddle = W^0 = 1
            for (int j = 0; j < len / 2; ++j) {
                // Butterfly:  (u, v) → (u + W^j·v,  u - W^j·v)
                const float uRe = re[i + j];
                const float uIm = im[i + j];
                // W^j · x[i+j+len/2]  (complex multiply)
                const float vRe = re[i + j + len/2] * curRe
                                - im[i + j + len/2] * curIm;
                const float vIm = re[i + j + len/2] * curIm
                                + im[i + j + len/2] * curRe;
                re[i + j]          = uRe + vRe;
                im[i + j]          = uIm + vIm;
                re[i + j + len/2]  = uRe - vRe;
                im[i + j + len/2]  = uIm - vIm;
                // Advance twiddle factor:  cur *= W  (complex multiply)
                const float nextRe = curRe * wRe - curIm * wIm;
                curIm = curRe * wIm + curIm * wRe;
                curRe = nextRe;
            }
        }
    }
}

// ---------------------------------------------------------------------------
AudioAnalyzer::AudioAnalyzer(QObject *parent)
    : QThread(parent)
{
    std::memset(m_bassHistory,     0, sizeof(m_bassHistory));
    std::memset(m_levelHistory,    0, sizeof(m_levelHistory));
    std::memset(m_ringBuf,         0, sizeof(m_ringBuf));
    std::memset(m_fftRe,           0, sizeof(m_fftRe));
    std::memset(m_fftIm,           0, sizeof(m_fftIm));
    std::memset(m_prevMags,        0, sizeof(m_prevMags));
    std::memset(m_smoothedChroma,  0, sizeof(m_smoothedChroma));

    // Precompute Hann window for FFT:  w[i] = 0.5 · (1 - cos(2π·i/(N-1)))
    // Reduces spectral leakage from block edges.
    for (int i = 0; i < kFFTSize; ++i)
        m_fftWin[i] = 0.5f * (1.f - std::cos(
            2.f * 3.14159265358979f * float(i) / float(kFFTSize - 1)));
}

AudioAnalyzer::~AudioAnalyzer()
{
    stop();
    wait();
}

void AudioAnalyzer::stop()
{
    m_running = false;
}

AudioFeatures AudioAnalyzer::getFeatures() const
{
    QMutexLocker lk(&m_mutex);
    return m_features;
}

// ---------------------------------------------------------------------------
// Device enumeration + accessors (runtime audio-source selection)
// ---------------------------------------------------------------------------
void AudioAnalyzer::enumerateDevices( IMMDeviceEnumerator *pEnum )
{
    QList<AudioDevice> devs;
    auto addFlow = [&]( EDataFlow flow, bool isCap ) {
        IMMDeviceCollection *coll = nullptr;
        if ( FAILED(pEnum->EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE, &coll)) || !coll )
            return;
        UINT n = 0; coll->GetCount(&n);
        for ( UINT i = 0; i < n; ++i ) {
            IMMDevice *d = nullptr;
            if ( FAILED(coll->Item(i, &d)) || !d ) continue;
            LPWSTR id = nullptr; QString qid, qname;
            if ( SUCCEEDED(d->GetId(&id)) && id ) { qid = QString::fromWCharArray(id); CoTaskMemFree(id); }
            IPropertyStore *ps = nullptr;
            if ( SUCCEEDED(d->OpenPropertyStore(STGM_READ, &ps)) && ps ) {
                PROPVARIANT v; PropVariantInit(&v);
                if ( SUCCEEDED(ps->GetValue(PKEY_Device_FriendlyName, &v)) && v.vt == VT_LPWSTR )
                    qname = QString::fromWCharArray(v.pwszVal);
                PropVariantClear(&v); ps->Release();
            }
            if ( !qid.isEmpty() ) {
                AudioDevice ad; ad.id = qid; ad.name = qname.isEmpty() ? qid : qname; ad.isCapture = isCap;
                devs.append(ad);
            }
            d->Release();
        }
        coll->Release();
    };
    addFlow( eRender,  false );   // outputs (loopback)
    addFlow( eCapture, true  );   // inputs (mic / line-in)

    QMutexLocker lk(&m_mutex);
    m_devices = devs;
}

QList<AudioDevice> AudioAnalyzer::devices() const
{
    QMutexLocker lk(&m_mutex);
    return m_devices;
}

QString AudioAnalyzer::currentDeviceName() const
{
    QMutexLocker lk(&m_mutex);
    return m_curDeviceName;
}

void AudioAnalyzer::requestDevice( const QString &id, bool isCapture )
{
    {
        QMutexLocker lk(&m_mutex);
        if ( id.isEmpty() ) { m_useReqDevice = false; m_reqDeviceId.clear(); }
        else                { m_useReqDevice = true;  m_reqDeviceId = id; m_reqIsCapture = isCapture; }
    }
    m_deviceChangeReq = true;     // ask the capture loop to re-initialise now
}

// ---------------------------------------------------------------------------
// run() – WASAPI loopback capture loop
// ---------------------------------------------------------------------------
void AudioAnalyzer::run()
{
    m_running = true;

    // --- COM init for this thread ---
    HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    if (FAILED(hr)) { m_running = false; return; }

    IMMDeviceEnumerator *pEnum = nullptr;
    hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                          __uuidof(IMMDeviceEnumerator), (void**)&pEnum);
    if (FAILED(hr)) { CoUninitialize(); m_running = false; return; }

    // Temporary float conversion buffer (max 4096 frames × 8 channels)
    static float convBuf[4096 * 8];

    // Outer reconnect loop.  If the capture device is invalidated (the user
    // switches the default output, unplugs headphones, an HDMI display sleeps,
    // …), the per-device objects are released and the default endpoint is
    // re-acquired — so audio reactivity recovers automatically instead of dying.
    while (m_running)
    {
        IMMDevice           *pDevice  = nullptr;
        IAudioClient        *pClient  = nullptr;
        IAudioCaptureClient *pCapture = nullptr;
        WAVEFORMATEX        *pwfx     = nullptr;

        auto deviceCleanup = [&]() {
            if (pCapture) { pCapture->Release(); pCapture = nullptr; }
            if (pClient)  { pClient->Stop(); pClient->Release(); pClient = nullptr; }
            if (pwfx)     { CoTaskMemFree(pwfx); pwfx = nullptr; }
            if (pDevice)  { pDevice->Release(); pDevice = nullptr; }
        };

        // Refresh the selectable-device list (cheap; keeps it current across
        // plug/unplug), and read the runtime selection.
        enumerateDevices(pEnum);
        QString reqId; bool reqCap = false; bool useReq = false;
        {
            QMutexLocker lk(&m_mutex);
            useReq = m_useReqDevice; reqId = m_reqDeviceId; reqCap = m_reqIsCapture;
        }
        m_deviceChangeReq = false;

        // The selected endpoint, or the default render endpoint (loopback) if none.
        // Loopback only applies to OUTPUT endpoints; an input device (mic/line-in)
        // is captured normally.
        bool isCaptureEndpoint = false;
        if (useReq && !reqId.isEmpty()) {
            hr = pEnum->GetDevice((LPCWSTR)reqId.utf16(), &pDevice);
            isCaptureEndpoint = reqCap;
        } else {
            hr = pEnum->GetDefaultAudioEndpoint(eRender, eConsole, &pDevice);
            isCaptureEndpoint = false;
        }
        if (SUCCEEDED(hr))
            hr = pDevice->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, (void**)&pClient);
        if (SUCCEEDED(hr))
            hr = pClient->GetMixFormat(&pwfx);
        if (SUCCEEDED(hr))
        {
            REFERENCE_TIME bufferDuration = 200000; // 100ns units → 20 ms
            DWORD streamFlags = isCaptureEndpoint ? 0 : AUDCLNT_STREAMFLAGS_LOOPBACK;
            hr = pClient->Initialize(AUDCLNT_SHAREMODE_SHARED, streamFlags,
                                     bufferDuration, 0, pwfx, nullptr);
        }
        if (SUCCEEDED(hr))
            hr = pClient->GetService(__uuidof(IAudioCaptureClient), (void**)&pCapture);
        if (SUCCEEDED(hr))
            hr = pClient->Start();

        if (FAILED(hr))
        {
            // Setup failed.  If a *selected* device failed, drop back to the
            // default so we don't get stuck retrying a dead source.
            deviceCleanup();
            if (useReq) { QMutexLocker lk(&m_mutex); m_useReqDevice = false; }
            msleep(500);
            continue;
        }

        // Publish the friendly name of what we're now capturing.
        {
            QMutexLocker lk(&m_mutex);
            m_curDeviceName.clear();
            if (!useReq) m_curDeviceName = QStringLiteral("Standard-Ausgabe (Loopback)");
            else for (const AudioDevice &ad : m_devices)
                if (ad.id == reqId) { m_curDeviceName = ad.name; break; }
        }

        const int  sampleRate  = pwfx->nSamplesPerSec;
        const int  numChannels = pwfx->nChannels;
        // Detect IEEE float vs PCM16 format
        const bool isFloat = (pwfx->wFormatTag == WAVE_FORMAT_IEEE_FLOAT) ||
                             (pwfx->wFormatTag == WAVE_FORMAT_EXTENSIBLE &&
                              reinterpret_cast<WAVEFORMATEXTENSIBLE*>(pwfx)->SubFormat ==
                              KSDATAFORMAT_SUBTYPE_IEEE_FLOAT);

        bool deviceLost = false;
        while (m_running && !deviceLost)
        {
            if (m_deviceChangeReq) { deviceLost = true; break; }   // runtime source switch

            UINT32 packetSize = 0;
            hr = pCapture->GetNextPacketSize(&packetSize);
            if (FAILED(hr)) { deviceLost = true; break; }   // e.g. AUDCLNT_E_DEVICE_INVALIDATED

            while (packetSize > 0 && m_running)
            {
                BYTE  *pData     = nullptr;
                UINT32 numFrames = 0;
                DWORD  flags     = 0;

                hr = pCapture->GetBuffer(&pData, &numFrames, &flags, nullptr, nullptr);
                if (FAILED(hr)) { deviceLost = true; break; }

                if (!(flags & AUDCLNT_BUFFERFLAGS_SILENT) && numFrames > 0)
                {
                    const int totalSamples = numFrames * numChannels;
                    const float *src = nullptr;

                    if (isFloat) {
                        src = reinterpret_cast<const float*>(pData);
                    } else {
                        // PCM 16-bit → float
                        const int16_t *pcm = reinterpret_cast<const int16_t*>(pData);
                        int count = std::min(totalSamples, 4096 * 8);
                        for (int i = 0; i < count; ++i)
                            convBuf[i] = pcm[i] / 32768.f;
                        src = convBuf;
                    }

                    processBlock(src, numFrames, std::min(numChannels, 2), sampleRate);
                }

                pCapture->ReleaseBuffer(numFrames);
                hr = pCapture->GetNextPacketSize(&packetSize);
                if (FAILED(hr)) { deviceLost = true; break; }
            }

            msleep(10); // poll every 10 ms
        }

        deviceCleanup();
        if (deviceLost && m_running)
            msleep(300); // brief pause before attempting to reconnect
    }

    if (pEnum) pEnum->Release();
    CoUninitialize();
}

// ---------------------------------------------------------------------------
// processBlock – 6-band IIR analysis, beat detection, ambient classification
// ---------------------------------------------------------------------------
void AudioAnalyzer::processBlock(const float *data, int numFrames,
                                 int numChannels, int sampleRate)
{
    // ---- 5 one-pole LP coefficients ----
    // One-pole IIR: y[n] = a*y[n-1] + (1-a)*x[n]
    // Band extraction by subtraction of adjacent LP outputs.
    const float a60  = coeff(  60.f, sampleRate);
    const float a150 = coeff( 150.f, sampleRate);
    const float a500 = coeff( 500.f, sampleRate);
    const float a2k  = coeff(2000.f, sampleRate);
    const float a6k  = coeff(6000.f, sampleRate);

    // Stereo per-channel 3-band split (low <250 Hz, mid 250-2500 Hz, high >2500 Hz)
    const float aStLo = coeff( 250.f, sampleRate);
    const float aStHi = coeff(2500.f, sampleRate);

    // ---- Ambient-adaptive smoothing (one-pole attack / release) ----
    // Beat mode: fast release (≈0.88-0.93) – visuals snap with each kick.
    // Ambient mode: very slow release (≈0.985-0.99) – majestic long swell.
    // The ambientFactor (0=beat, 1=ambient) blends the two coefficients.
    // At 100 update cycles/sec: release=0.99 → ~37% decay in ~100 frames ≈ 1 s.
    const float af = m_ambientFactor;  // 0=beat, 1=ambient

    // Attack coefficients (same for both modes – fast rise is always desired)
    const float atkSub  = 0.80f;
    const float atkBass = 0.70f;
    const float atkLow  = 0.65f;
    const float atkMid  = 0.60f;
    const float atkUpp  = 0.55f;
    const float atkHigh = 0.50f;

    // Release coefficients: lerp between beat-mode and ambient-mode values
    auto lerpRel = [&](float beat, float amb) { return beat + af * (amb - beat); };
    const float relSub  = lerpRel(0.94f, 0.993f);
    const float relBass = lerpRel(0.93f, 0.990f);
    const float relLow  = lerpRel(0.92f, 0.990f);
    const float relMid  = lerpRel(0.91f, 0.988f);
    const float relUpp  = lerpRel(0.89f, 0.987f);
    const float relHigh = lerpRel(0.88f, 0.985f); // slightly faster so shimmer can breathe

    // ---- Per-sample IIR pass: accumulate squared band energies + ZCR ----
    float accSub  = 0.f, accBass = 0.f, accLow  = 0.f;
    float accMid  = 0.f, accUpp  = 0.f, accHigh = 0.f;
    float accStereoSide = 0.f, accStereoMid = 0.f;   // for stereo width
    float accStLo[2] = {0.f, 0.f}, accStMid[2] = {0.f, 0.f}, accStHi[2] = {0.f, 0.f};
    int   crossings = 0;
    float prevMono  = 0.f;

    for (int i = 0; i < numFrames; ++i)
    {
        // Mix to mono
        float mono = 0.f;
        for (int c = 0; c < numChannels; ++c)
            mono += data[i * numChannels + c];
        mono /= float(numChannels);

        // Per-channel samples (R falls back to L for mono → mirrored spectrum).
        const float L = data[i * numChannels + 0];
        const float R = (numChannels >= 2) ? data[i * numChannels + 1] : L;

        // Stereo width: energy of the side (L-R) vs. mid (L+R) signal.
        if (numChannels >= 2) {
            float side = 0.5f * (L - R);
            float midS = 0.5f * (L + R);
            accStereoSide += side * side;
            accStereoMid  += midS * midS;
        }

        // Stereo-separated spectrum: cheap 3-band split per channel (2 LPs each).
        m_lpStL[0] = aStLo * m_lpStL[0] + (1.f - aStLo) * L;
        m_lpStL[1] = aStHi * m_lpStL[1] + (1.f - aStHi) * L;
        m_lpStR[0] = aStLo * m_lpStR[0] + (1.f - aStLo) * R;
        m_lpStR[1] = aStHi * m_lpStR[1] + (1.f - aStHi) * R;
        const float loL = m_lpStL[0], miL = m_lpStL[1] - m_lpStL[0], hiL = L - m_lpStL[1];
        const float loR = m_lpStR[0], miR = m_lpStR[1] - m_lpStR[0], hiR = R - m_lpStR[1];
        accStLo[0] += loL * loL; accStMid[0] += miL * miL; accStHi[0] += hiL * hiL;
        accStLo[1] += loR * loR; accStMid[1] += miR * miR; accStHi[1] += hiR * hiR;

        // Zero-crossing rate: count sign changes (Temporal feature from paper)
        if ((mono > 0.f && prevMono < 0.f) || (mono < 0.f && prevMono > 0.f))
            crossings++;
        prevMono = mono;

        // Feed ring buffer for FFT (circular, kFFTSize = 2048 samples)
        m_ringBuf[m_ringWrite] = mono;
        m_ringWrite = (m_ringWrite + 1) % kFFTSize;

        // Feed 5 LP filters in parallel (same input, different cutoffs)
        m_lp60  = a60  * m_lp60  + (1.f - a60)  * mono;
        m_lp150 = a150 * m_lp150 + (1.f - a150) * mono;
        m_lp500 = a500 * m_lp500 + (1.f - a500) * mono;
        m_lp2k  = a2k  * m_lp2k  + (1.f - a2k)  * mono;
        m_lp6k  = a6k  * m_lp6k  + (1.f - a6k)  * mono;

        // Extract 6 bands by subtraction of adjacent LP outputs
        float vSub  = m_lp60;                    // 20–60 Hz   sub-bass rumble
        float vBass = m_lp150 - m_lp60;          // 60–150 Hz  drone body / kick
        float vLow  = m_lp500 - m_lp150;         // 150–500 Hz harmonic warmth
        float vMid  = m_lp2k  - m_lp500;         // 500–2k Hz  melody / texture
        float vUpp  = m_lp6k  - m_lp2k;          // 2k–6k Hz   metallic / scrape
        float vHigh = mono    - m_lp6k;          // 6k+ Hz     air / shimmer

        // Accumulate squared amplitudes for RMS calculation
        accSub  += vSub  * vSub;
        accBass += vBass * vBass;
        accLow  += vLow  * vLow;
        accMid  += vMid  * vMid;
        accUpp  += vUpp  * vUpp;
        accHigh += vHigh * vHigh;
    }

    m_frameCounter += float(numFrames);

    // ---- RMS per band ----
    const float inv  = (numFrames > 0) ? 1.f / float(numFrames) : 0.f;
    float rSub  = std::sqrt(accSub  * inv);
    float rBass = std::sqrt(accBass * inv);
    float rLow  = std::sqrt(accLow  * inv);
    float rMid  = std::sqrt(accMid  * inv);
    float rUpp  = std::sqrt(accUpp  * inv);
    float rHigh = std::sqrt(accHigh * inv);

    // ---- Asymmetric attack/release smoothing per band ----
    auto smooth = [](float &s, float v, float atk, float rel) {
        float a = (v > s) ? atk : rel;
        s = a * s + (1.f - a) * v;
    };
    smooth(m_sSubBass,  rSub,  atkSub,  relSub);
    smooth(m_sBass,     rBass, atkBass, relBass);
    smooth(m_sLowMid,   rLow,  atkLow,  relLow);
    smooth(m_sMid,      rMid,  atkMid,  relMid);
    smooth(m_sUpperMid, rUpp,  atkUpp,  relUpp);
    smooth(m_sHigh,     rHigh, atkHigh, relHigh);

    // ---- Beat detection on combined subBass + bass (linear RMS) ----
    // Beat detection intentionally stays in linear domain (more sensitive
    // to energy transients than dB). Combined sub+bass catches both:
    //   - Electronic kick drums (body in 60-150 Hz)
    //   - Dark ambient sub-bass pulses (modulation in 20-60 Hz)
    float beatBand = m_sSubBass * 0.35f + m_sBass * 0.65f;

    m_bassHistory[m_histIdx] = beatBand;
    m_histIdx = (m_histIdx + 1) % kHistoryLen;

    float histMean = 0.f;
    for (float v : m_bassHistory) histMean += v;
    histMean /= float(kHistoryLen);

    bool  isBeat  = false;
    float beatStr = 0.f;

    // Ambient-adaptive beat threshold.
    // Beat music (ambientFactor≈0): threshold = 1.5× histMean  (normal sensitivity).
    // Drone music (ambientFactor≈1): threshold = 4.5× histMean  (requires a true
    // transient 3× above the drone level — small sustain fluctuations never qualify).
    // This is the primary defence against false beats on Köner / Lustmord / Heemann.
    const float dynThresh = kBeatThresholdRatio + m_ambientFactor * 3.0f;

    if (m_beatCooldown > 0.f) {
        m_beatCooldown -= 1.f;
    } else if (histMean > 1e-4f && beatBand > dynThresh * histMean) {
        isBeat         = true;
        beatStr        = std::min((beatBand / (histMean * dynThresh)) - 1.f, 1.f);
        m_beatCooldown = kBeatCooldownFrames;
    }

    // ---- Logarithmic (dB) normalisation for shader outputs ----
    // Human hearing is logarithmic. dB mapping gives far better perceived
    // dynamic range for driving visual parameters.
    //   dB = 20 * log10(rms + ε)
    //   Map [-60 dB .. 0 dB] → [0 .. 1]
    auto toNorm = [](float rms) -> float {
        const float dB = 20.f * std::log10(rms + 1e-5f);
        return std::max(0.f, std::min(1.f, (dB + 60.f) / 60.f));
    };

    float subBass  = toNorm(m_sSubBass);
    float bass     = toNorm(m_sBass);
    float lowMid   = toNorm(m_sLowMid);
    float mid      = toNorm(m_sMid);
    float upperMid = toNorm(m_sUpperMid);
    float high     = toNorm(m_sHigh);

    // Overall level: perceptually weighted mix (bass-heavy, as drones tend to be)
    float level = subBass  * 0.15f
                + bass     * 0.30f
                + lowMid   * 0.25f
                + mid      * 0.15f
                + upperMid * 0.10f
                + high     * 0.05f;

    // ---- Sharpness (Zwicker-style high-frequency weighting) ----
    // Ratio of high-frequency energy to total: dark drones → ~0, bright/harsh → ~1.
    float sharpNum = 0.40f * mid + 0.70f * upperMid + 1.00f * high;
    float sharpDen = subBass + bass + lowMid + mid + upperMid + high + 1e-6f;
    m_sSharpness   = 0.95f * m_sSharpness + 0.05f * std::min(sharpNum / sharpDen, 1.f);

    // ---- Stereo width: RMS(side) / (RMS(mid) + RMS(side)) ----
    float rawWidth = 0.f;
    if (accStereoMid > 1e-9f) {
        float rmsSide = std::sqrt(accStereoSide * inv);
        float rmsMid  = std::sqrt(accStereoMid  * inv);
        rawWidth = rmsSide / (rmsMid + rmsSide + 1e-6f);
    }
    m_sStereoWidth = 0.90f * m_sStereoWidth + 0.10f * std::min(rawWidth * 2.f, 1.f);

    // ---- Band spread: fraction of energy in bass + treble (vs. mid only) ----
    // Speech sits mostly in low-mid/mid; music spreads into sub-bass and highs.
    // A cheap, robust ingredient of the music/speech classifier below.
    float bandSpread = (subBass + bass + high) / sharpDen;   // 0..~1

    // ---- Automatic gain control (volume independence) ----
    // Track a slow loudness reference (only while there is signal, with a floor)
    // and normalise the levels the VISUALS see to it, so the same track played
    // quietly or loudly drives the visualisation identically.  A single gain is
    // applied to overall level + all bands, so the spectral SHAPE is preserved;
    // beat / ambient / music-speech detection keep using the raw values.
    if (level > 0.02f)
        m_loudnessRef = 0.9995f * m_loudnessRef + 0.0005f * level;  // ~ tens of seconds
    m_loudnessRef = std::max(m_loudnessRef, 0.04f);                 // don't amplify near-silence
    const float kTargetLevel = 0.40f;                              // average music → ~0.40
    float agcGain = std::max(0.3f, std::min(kTargetLevel / m_loudnessRef, 5.0f));

    float nLevel    = std::min(level    * agcGain, 1.f);
    float nSubBass  = std::min(subBass  * agcGain, 1.f);
    float nBass     = std::min(bass     * agcGain, 1.f);
    float nLowMid   = std::min(lowMid   * agcGain, 1.f);
    float nMid      = std::min(mid      * agcGain, 1.f);
    float nUpperMid = std::min(upperMid * agcGain, 1.f);
    float nHigh     = std::min(high     * agcGain, 1.f);

    // ---- Stereo per-channel band levels (AGC-normalised, lightly smoothed) ----
    {
        auto smCh = [](float &s, float v) { s = 0.7f * s + 0.3f * v; };
        for (int ch = 0; ch < 2; ++ch) {
            smCh(m_sStBand[ch][0], std::min(std::sqrt(accStLo[ch]  * inv) * agcGain, 1.f));
            smCh(m_sStBand[ch][1], std::min(std::sqrt(accStMid[ch] * inv) * agcGain, 1.f));
            smCh(m_sStBand[ch][2], std::min(std::sqrt(accStHi[ch]  * inv) * agcGain, 1.f));
        }
    }

    // ---- Ambient detection – rolling variance of dB level over ~6 s ----
    // Low variance over time → content is a static drone / ambient pad.
    // High variance → dynamic beat-driven music with significant energy swings.
    m_levelHistory[m_ambientIdx] = level;
    m_ambientIdx = (m_ambientIdx + 1) % kAmbientHistLen;

    float mean2 = 0.f, var2 = 0.f;
    for (float v : m_levelHistory) mean2 += v;
    mean2 /= float(kAmbientHistLen);
    for (float v : m_levelHistory) { float d = v - mean2; var2 += d * d; }
    var2 /= float(kAmbientHistLen);

    // stddev < 0.07 → ambient/drone; stddev > 0.07 → beat-driven
    float targetAmbient = 1.f - std::min(std::sqrt(var2) / 0.07f, 1.f);

    // Asymmetric transition speed:
    //   Rising into ambient mode (drone detected): fast, ~2 s  → catch drones quickly.
    //   Falling back to beat mode: slow, ~10 s → brief silences / pauses don't
    //   abruptly switch the visualiser back to restless beat behaviour.
    const float ambSpeedRise = 0.005f;  // 200 frames ≈ 2 s
    const float ambSpeedFall = 0.001f;  // 1000 frames ≈ 10 s
    float ambientSpeed = (targetAmbient > m_ambientFactor) ? ambSpeedRise : ambSpeedFall;
    m_ambientFactor += ambientSpeed * (targetAmbient - m_ambientFactor);

    // ---- Speed scale envelope ----
    // On beat: m_beatPulse jumps then decays at 0.85×/cycle → 4-frame ramp.
    // In ambient mode: speed tracks spectral flux (drone moves when it changes).
    // beatPulse magnitude is gated by ambientFactor:
    //   ambientFactor=0 → full pulse (1 + beatStr*2, up to 3.0)
    //   ambientFactor=1 → almost no pulse (×0.05 = max 0.15)
    // Even if the raised threshold above lets a drone fluctuation through as a "beat",
    // the resulting visual flash is negligible because beatDecay ≤ 0.15/3 = 0.05.
    if (isBeat) m_beatPulse = (1.f + beatStr * 2.f) * (1.f - m_ambientFactor * 0.95f);
    m_beatPulse = std::max(m_beatPulse * 0.85f, 0.f);

    // ---- Downbeat accent: accent the bar's "1" (≈ every 4th detected kick) ----
    if (isBeat) { m_kickCount++; if (m_kickCount % 4 == 0) m_downbeatPulse = 1.f; }
    m_downbeatPulse = std::max(m_downbeatPulse * 0.90f, 0.f);
    float downbeat = m_downbeatPulse;

    float beatSpeed = 1.f + m_beatPulse;

    // Spectral flux is not yet computed here, so we use the previous m_sFlux.
    // This is fine since flux is smoothed and the one-frame lag is imperceptible.
    float fluxContrib = std::min(m_sFlux / 0.15f, 1.f);
    float ambientSpd  = 0.1f + fluxContrib * 2.0f + level * 0.5f;

    float speedScale = beatSpeed * (1.f - m_ambientFactor)
                     + ambientSpd * m_ambientFactor;
    speedScale = std::max(speedScale, 0.05f);

    // ---- Power (distortion) scale ----
    float powerScale = (1.f + high * 2.f)    * (1.f - m_ambientFactor)
                     + (1.f + level * 0.5f)  * m_ambientFactor;

    // ---- beatDecay: smooth decaying pulse 0..1 for shaders ----
    // Jumps to >0 on a beat and decays in ~4-5 frames (40-50 ms).
    // Shaders can use this for a sustained visual pop, unlike the one-frame isBeat flag.
    float beatDecay = std::min(m_beatPulse / 3.f, 1.f);

    // ---- Spectral Flux (6-band) ----
    // Measures positive-only inter-frame change across all bands.
    // Zero for a perfectly static held drone; peaks when layers enter or leave.
    // Primary motion driver for the dark ambient tunnel shader.
    float rawFlux = std::max(0.f, subBass  - m_prevSubBass)
                  + std::max(0.f, bass     - m_prevBass)
                  + std::max(0.f, lowMid   - m_prevLowMid)
                  + std::max(0.f, mid      - m_prevMid)
                  + std::max(0.f, upperMid - m_prevUpperMid)
                  + std::max(0.f, high     - m_prevHigh);

    m_prevSubBass  = subBass;
    m_prevBass     = bass;
    m_prevLowMid   = lowMid;
    m_prevMid      = mid;
    m_prevUpperMid = upperMid;
    m_prevHigh     = high;

    m_sFlux = 0.7f * m_sFlux + 0.3f * rawFlux;
    float spectralFlux = std::min(m_sFlux / 0.15f, 1.f);

    // ---- Spectral-flux variance over ~1 s ("restlessness") ----
    m_fluxHistory[m_fluxIdx] = spectralFlux;
    m_fluxIdx = (m_fluxIdx + 1) % kFluxHistLen;
    float fMean = 0.f;
    for (float v : m_fluxHistory) fMean += v;
    fMean /= float(kFluxHistLen);
    float fVar = 0.f;
    for (float v : m_fluxHistory) { float d = v - fMean; fVar += d * d; }
    fVar /= float(kFluxHistLen);
    m_sFluxVar = 0.90f * m_sFluxVar + 0.10f * std::min(std::sqrt(fVar) * 4.f, 1.f);

    // ---- Full-spectrum onset detection (snares / claps / melodic, not just kicks) ----
    // Peak-pick the onset detection function (instantaneous spectral flux): an onset
    // is a clear rising jump above its recent average.  Ambient-gated so drones don't
    // trigger.  A detected onset boosts the visual beat pulse, so the SAME beat-driven
    // reactions (zoom, rotation kick) now fire across every genre.
    float onsetStrength = 0.f;
    if (m_onsetCooldown > 0.f) {
        m_onsetCooldown -= 1.f;
    } else if (rawFlux > m_onsetAvg * 1.7f + 0.015f && rawFlux > m_prevODF) {
        onsetStrength  = std::min((rawFlux / (m_onsetAvg * 1.7f + 1e-4f)) - 1.f, 1.f);
        m_onsetCooldown = 5.f;
        float onsetPulse = (0.6f + 0.8f * onsetStrength) * (1.f - m_ambientFactor * 0.9f);
        m_beatPulse = std::max(m_beatPulse, onsetPulse);
    }
    m_onsetAvg = 0.95f * m_onsetAvg + 0.05f * rawFlux;
    m_prevODF  = rawFlux;

    // Re-derive the decaying beat pulse now that onsets are folded into m_beatPulse.
    beatDecay = std::min(m_beatPulse / 3.f, 1.f);

    // ---- Track-change detection (sustained silence -> first onset/energy) ----
    // When the audio goes near-silent for a while (track ends / is changed) and
    // then sound returns, fire a one-shot flag so the host can start the new
    // track with a clean, fresh transition instead of mid-effect.
    bool trackChange = false;
    {
        const float silenceThresh = 0.015f;   // raw level below this ≈ silence
        if (level < silenceThresh) {
            m_silenceFrames += 1.f;
            if (m_silenceFrames > 60.f)        // ~0.6 s+ of silence → armed
                m_wasSilent = true;
        } else {
            if (m_wasSilent && (onsetStrength > 0.25f || level > 0.05f))
                trackChange = true;            // first real sound after the gap
            m_silenceFrames = 0.f;
            m_wasSilent = false;
        }
    }

    // ---- Autocorrelation tempo ----
    // Feed the onset detection function into a fixed-rate envelope, then autocorrelate
    // it over the natural-tempo lag range (70..180 BPM).  The peak lag gives a robust
    // tempo estimate (and confidence) that refines the inter-beat BPM below.
    {
        int framesPerEnv = std::max(1, sampleRate / kEnvRate);
        m_envFrameAcc += numFrames;
        while (m_envFrameAcc >= framesPerEnv) {
            m_envFrameAcc -= framesPerEnv;
            m_odfEnv[m_odfEnvIdx] = rawFlux;
            m_odfEnvIdx = (m_odfEnvIdx + 1) % kOdfEnvLen;
        }
        const int lagLo = (60 * kEnvRate) / 180;   // 33 samples (180 BPM)
        const int lagHi = (60 * kEnvRate) / 70;    // 85 samples (70 BPM)
        float ac0 = 1e-6f;
        for (int i = 0; i < kOdfEnvLen; ++i) ac0 += m_odfEnv[i] * m_odfEnv[i];
        float bestAc = 0.f; int bestLag = 0;
        for (int lag = lagLo; lag <= lagHi; ++lag) {
            float ac = 0.f;
            for (int i = 0; i + lag < kOdfEnvLen; ++i)
                ac += m_odfEnv[i] * m_odfEnv[i + lag];
            if (ac > bestAc) { bestAc = ac; bestLag = lag; }
        }
        if (bestLag > 0) {
            float bpm  = float(60 * kEnvRate) / float(bestLag);
            float conf = bestAc / ac0;
            m_acConf = 0.90f * m_acConf + 0.10f * std::min(conf * 2.f, 1.f);
            m_acBPM  = (m_acBPM < 1.f) ? bpm : 0.90f * m_acBPM + 0.10f * bpm;
        }
    }

    // ---- Spectral Centroid (6-band, log-spaced frequency weights) ----
    // Each weight is the log-normalised centre frequency of that band,
    // mapped to [0..1] over the audible range (20 Hz – 20 kHz).
    //   pos = (log10(fc) - log10(20)) / (log10(20000) - log10(20))
    //   subBass  fc≈ 40 Hz  → 0.10
    //   bass     fc≈100 Hz  → 0.23
    //   lowMid   fc≈275 Hz  → 0.38
    //   mid      fc≈1000 Hz → 0.57
    //   upperMid fc≈3500 Hz → 0.75
    //   high     fc≈13000 Hz→ 0.94
    static const float kCentroidWeights[6] = { 0.10f, 0.23f, 0.38f, 0.57f, 0.75f, 0.94f };
    float bands6[6] = { subBass, bass, lowMid, mid, upperMid, high };

    float totalEnergy = 1e-6f;
    float rawCentroid = 0.f;
    for (int k = 0; k < 6; ++k) {
        totalEnergy += bands6[k];
        rawCentroid += bands6[k] * kCentroidWeights[k];
    }
    rawCentroid /= totalEnergy;

    // Very slow smoothing: colour temperature should drift like sunrise/sunset,
    // not flash with every transient.
    float smoothedCentroid = 0.98f * m_features.spectralCentroid + 0.02f * rawCentroid;

    // ---- Zero-Crossing Rate (ZCR) ----
    // Normalise: typical tonal music sits at 0-0.10 crossings/sample,
    // noise/harsh textures reach 0.25+.  Clip to [0,1].
    float rawZCR = (numFrames > 0) ? float(crossings) / float(numFrames) : 0.f;
    m_sZCR = 0.92f * m_sZCR + 0.08f * std::min(rawZCR / 0.25f, 1.f);

    // ---- Spectral Flatness Measure (SFM) ----
    // Geometric mean / Arithmetic mean of 6 band energies (all dB-normalised).
    // SFM = 0: one dominant band (pure drone), SFM = 1: even energy (noise).
    {
        float b[6] = { subBass, bass, lowMid, mid, upperMid, high };
        float logSum = 0.f, sumB = 1e-6f;
        for (int k = 0; k < 6; ++k) { logSum += std::log(b[k] + 1e-6f); sumB += b[k]; }
        float geoMean   = std::exp(logSum / 6.f);
        float arithMean = sumB / 6.f;
        float rawSFM    = (arithMean > 1e-6f) ? geoMean / arithMean : 0.f;
        m_sSFM = 0.93f * m_sSFM + 0.07f * std::min(rawSFM, 1.f);
    }

    // ---- Log Attack Time (onset sharpness) ----
    // Measures how quickly the overall level rises frame-to-frame.
    // Fast rise (> threshold in one cycle) = sharp attack (kick, metal hit).
    // Very slow rise = pad swell, drone layer entry.
    {
        float rise = std::max(level - m_prevLevel, 0.f);
        // 0.05 per cycle = moderate attack; clip fast transients to 1.
        float rawAttack = std::min(rise / 0.05f, 1.f);
        m_attackAccum = 0.85f * m_attackAccum + 0.15f * rawAttack;
        m_prevLevel   = level;
    }

    // ---- BPM estimation from inter-beat intervals ----
    // Store the time (in samples) between the last kBPMHistLen beats.
    // Smooth the resulting BPM to avoid jitter.
    float estimatedBPM = m_smoothedBPM;
    if (isBeat) {
        float intervalFrames = m_frameCounter - m_lastBeatFrame;
        m_lastBeatFrame = m_frameCounter;
        if (intervalFrames > 0.f && intervalFrames < float(sampleRate) * 3.f) {
            // Convert sample interval to BPM
            float bpm = float(sampleRate) * 60.f / intervalFrames;
            m_beatIntervals[m_bpmIdx] = bpm;
            m_bpmIdx = (m_bpmIdx + 1) % kBPMHistLen;

            float bpmSum = 0.f;
            for (float v : m_beatIntervals) bpmSum += v;
            float meanBPM = bpmSum / float(kBPMHistLen);

            // Smooth BPM estimate (slow — tempo should drift, not jump)
            m_smoothedBPM = 0.85f * m_smoothedBPM + 0.15f * meanBPM;
        }
    }
    // Refine the tempo with the autocorrelation estimate when it is confident
    // (robust for tracks where the kick-based inter-beat estimate is noisy).
    if (m_acConf > 0.35f && m_acBPM > 1.f) {
        if (m_smoothedBPM < 1.f) m_smoothedBPM = m_acBPM;
        else                     m_smoothedBPM = 0.97f * m_smoothedBPM + 0.03f * m_acBPM;
    }

    // Normalise BPM to [0,1] over 40..200 BPM — every frame, not only on beats.
    estimatedBPM = std::max(0.f, std::min((m_smoothedBPM - 40.f) / 160.f, 1.f));

    // ---- Rhythm strength: beat-interval (tempo) consistency × recency ----
    // Regular, recent beats → ~1; irregular / no recent beats / speech → ~0.
    float framesSinceBeat = m_frameCounter - m_lastBeatFrame;
    float recency = std::exp(-framesSinceBeat / (2.0f * float(sampleRate)));  // ~2 s
    float ibMean = 0.f;
    for (float v : m_beatIntervals) ibMean += v;
    ibMean /= float(kBPMHistLen);
    float ibVar = 0.f;
    for (float v : m_beatIntervals) { float d = v - ibMean; ibVar += d * d; }
    ibVar /= float(kBPMHistLen);
    float ibCV   = (ibMean > 1e-3f) ? std::sqrt(ibVar) / ibMean : 1.f;
    float rhythm = std::max(0.f, 1.f - ibCV) * recency;
    m_sRhythm = 0.92f * m_sRhythm + 0.08f * rhythm;

    // ---- Continuous beat phase 0..1 (wraps every beat) from the tempo ----
    float beatPhase = 0.f;
    if (m_smoothedBPM > 1.f) {
        float beatPeriodFrames = float(sampleRate) * 60.f / m_smoothedBPM;
        if (beatPeriodFrames > 1.f) {
            float ph = framesSinceBeat / beatPeriodFrames;
            beatPhase = ph - std::floor(ph);
        }
    }

    // ---- Arousal & Valence proxies (after Thayer's model) ----
    // Arousal: combination of energy, rhythm presence, and spectral activity.
    //   High in energetic beat music, low in still ambient/drone.
    float arousal = nLevel * 0.34f             // volume-independent (AGC-normalised)
                  + (1.f - m_ambientFactor) * estimatedBPM * 0.30f
                  + spectralFlux * 0.21f
                  + m_sSharpness * 0.15f;     // bright/incisive timbre = energetic
    arousal = std::min(arousal * 1.5f, 1.f);  // scale up (most music sits low)

    // Valence: mode (major/minor) + clear tonality + consonance + brightness.
    //   High for bright, major, tonal, consonant music; low for dark, minor, rough.
    float valence = m_sMode            * 0.28f   // major = pleasant, minor = tense
                  + m_sKeyClarity      * 0.17f   // a clearly implied key reads pleasant
                  + smoothedCentroid   * 0.20f
                  + (1.f - m_sSFM)     * 0.10f   // tonal (not noisy) = more pleasant
                  + (1.f - m_sRoughness) * 0.25f; // consonant (not beating) = pleasant

    // ---- Dynamic timing scale (for filterShader / EffectShader) ----
    // Drives how fast scenes/shaders cycle:
    //   timingScale < 1 → ALL times scaled longer (longer solos, slower cross-fades)
    //   timingScale > 1 → times shortened (quicker cuts)
    // The beat-mode end now tracks arousal, so a calm song cycles gently while an
    // energetic track cuts fast; ambient/drone collapses to very long holds.
    // Range: ~0.10 (pure drone) .. ~2.6 (fast, high-arousal beat music).
    float beatScale   = 0.8f + 1.8f * arousal;             // 0.8 .. 2.6
    float timingScale = beatScale * (1.f - m_ambientFactor)
                      + 0.10f * m_ambientFactor;             // ambient: down to 0.10×
    // Smooth slowly so transitions aren't abrupt
    float prevTimingScale = m_features.timingScale;
    timingScale = 0.998f * prevTimingScale + 0.002f * timingScale;

    // ---- Beat-triggered discrete changes (sub-sampled to avoid restlessness) ----
    // FIX for "too restless": sides change only every 4 beats, flip every 8.
    // In ambient mode (few/no beats) these rarely trigger anyway.
    int   beatSidesHint = m_currentSides;
    float audioFlip     = m_flipDir;

    // Discrete visual changes are gated by ambientFactor.
    // In ambient / drone mode (ambientFactor > 0.4) these changes are suppressed
    // entirely — a static drone like Köner's Daikan should produce a single,
    // slowly evolving geometry that holds for minutes, not one that flips every
    // few seconds due to false beats.
    if (isBeat && m_ambientFactor < 0.4f) {
        m_beatCount++;

        // Change kaleidoscope symmetry only every 16 beats (≈ every 4 bars) so it
        // is a rare, deliberate event rather than a constant churn.
        if (m_beatCount % 16 == 0) {
            static const int kSidesSet[]  = { 3, 4, 6, 8, 10, 12 };
            static const int kSidesCount  = 6;
            int idx;
            do { idx = rand() % kSidesCount; } while (kSidesSet[idx] == m_currentSides);
            m_currentSides = kSidesSet[idx];
            beatSidesHint  = m_currentSides;
        }

        // Flip rotation only every 8 beats, only on very strong beats (strength > 0.6)
        if (m_beatCount % 8 == 0 && beatStr > 0.6f && (rand() % 10) < 4) {
            m_flipDir = -m_flipDir;
            audioFlip = m_flipDir;
        }
    }

    // ========================================================================
    // FFT-based spectral analysis
    // ========================================================================
    // Linearise ring buffer: oldest sample first → in-place FFT input.
    // After the per-sample loop above, m_ringWrite points to the slot that
    // will be overwritten NEXT, so (m_ringWrite + i) % kFFTSize gives sample i
    // in chronological order (oldest i=0, newest i=kFFTSize-1).
    for (int i = 0; i < kFFTSize; ++i) {
        int src    = (m_ringWrite + i) % kFFTSize;
        m_fftRe[i] = m_ringBuf[src] * m_fftWin[i];  // apply Hann window
        m_fftIm[i] = 0.f;
    }
    radix2fft(m_fftRe, m_fftIm, kFFTSize);

    // Compute magnitude spectrum for k = 0 .. kFFTHalf-1.
    // (The upper half k > kFFTHalf is conjugate-symmetric; discard it.)
    float mags[kFFTHalf];
    float totalMagSq = 1e-10f;
    for (int k = 0; k < kFFTHalf; ++k) {
        float mag  = std::sqrt(m_fftRe[k]*m_fftRe[k] + m_fftIm[k]*m_fftIm[k]);
        mags[k]    = mag;
        totalMagSq += mag * mag;
    }

    // ---- Spectral Rolloff ----
    // Find the bin below which 85% of total spectral energy lies.
    // Low rolloff: dark sub-bass drone.  High rolloff: cymbals / bright pads.
    {
        float cumMagSq = 0.f;
        int   rBin     = kFFTHalf - 1;
        for (int k = 1; k < kFFTHalf; ++k) {
            cumMagSq += mags[k] * mags[k];
            if (cumMagSq >= 0.85f * totalMagSq) { rBin = k; break; }
        }
        float rollHz   = float(rBin) * float(sampleRate) / float(kFFTSize);
        float rollNorm = std::min(rollHz / (float(sampleRate) * 0.5f), 1.f);
        m_sRolloff = 0.95f * m_sRolloff + 0.05f * rollNorm;
    }

    // ---- Spectral Spread (standard deviation around FFT centroid) ----
    // Narrow spread: pure sine / single drone tone.  Wide: full-band noise.
    {
        float wSum = 0.f, mSum = 1e-6f;
        for (int k = 1; k < kFFTHalf; ++k) {
            float f = float(k) * float(sampleRate) / float(kFFTSize);
            wSum += f * mags[k];
            mSum += mags[k];
        }
        float centHz = wSum / mSum;

        float varSum = 0.f;
        for (int k = 1; k < kFFTHalf; ++k) {
            float f = float(k) * float(sampleRate) / float(kFFTSize);
            float d = f - centHz;
            varSum += d * d * mags[k];
        }
        float spreadNorm = std::min(std::sqrt(varSum / mSum) / 5000.f, 1.f);
        m_sSpread = 0.95f * m_sSpread + 0.05f * spreadNorm;
    }

    // ---- Roughness (sensory dissonance, Plomp-Levelt / Sethares) ----
    // Beating between nearby partials creates roughness.  For each bin we sum the
    // dissonance contribution of a few higher neighbours, weighted by the
    // amplitude product and the Plomp-Levelt curve.  Restricted to the musical
    // band and a small window so it stays real-time.
    {
        const int rLo  = std::max(2, int(50.f   * float(kFFTSize) / float(sampleRate)));
        const int rHi  = std::min(kFFTHalf - 1, int(5000.f * float(kFFTSize) / float(sampleRate)));
        const int rWin = 10;
        float rough = 0.f;
        for (int k = rLo; k < rHi; ++k) {
            float ak = mags[k];
            if (ak < 1e-6f) continue;
            float fk = float(k) * float(sampleRate) / float(kFFTSize);
            float s  = 0.24f / (0.0207f * fk + 18.96f);   // critical-band scaling
            int   jHi = std::min(k + rWin, rHi - 1);
            for (int j = k + 1; j <= jHi; ++j) {
                float fj = float(j) * float(sampleRate) / float(kFFTSize);
                float x  = s * (fj - fk);
                float d  = std::exp(-3.5f * x) - std::exp(-5.75f * x);  // dissonance
                rough += ak * mags[j] * d;
            }
        }
        float rawRough = std::min(rough / (totalMagSq + 1e-6f) * 4.f, 1.f);
        m_sRoughness = 0.93f * m_sRoughness + 0.07f * rawRough;
    }

    // ---- Chroma vector + Key/Mode (Krumhansl-Kessler 1982 profiles) ----
    // Each FFT bin is mapped to one of 12 pitch classes (C=0 .. B=11)
    // using MIDI note arithmetic.  Energy is accumulated per pitch class,
    // then compared against the KK major and minor profiles.
    // Best-matching profile family (major vs. minor) across all 12 key
    // transpositions determines musicalMode (0=minor, 1=major).
    {
        float chroma[12] = {};
        for (int k = 3; k < kFFTHalf; ++k) {
            float f = float(k) * float(sampleRate) / float(kFFTSize);
            if (f < 60.f || f > 5000.f) continue;  // musical pitch range only
            // MIDI note: 69 + 12 * log2(f / 440)  → pitch class 0..11
            float midi       = 69.f + 12.f * std::log2(f / 440.f);
            int   pitchClass = int(std::round(midi)) % 12;
            if (pitchClass < 0) pitchClass += 12;
            chroma[pitchClass] += mags[k];
        }
        // L1-normalise then blend into slow-moving smoothed chroma
        float cSum = 1e-6f;
        for (int i = 0; i < 12; ++i) cSum += chroma[i];
        for (int i = 0; i < 12; ++i) {
            chroma[i] /= cSum;
            m_smoothedChroma[i] = 0.92f * m_smoothedChroma[i] + 0.08f * chroma[i];
        }

        // Krumhansl-Kessler key profiles (original 1982 tonal hierarchy ratings)
        static const float kMajorKK[12] = {
            6.35f, 2.23f, 3.48f, 2.33f, 4.38f, 4.09f,
            2.52f, 5.19f, 2.39f, 3.66f, 2.29f, 2.88f };
        static const float kMinorKK[12] = {
            6.33f, 2.68f, 3.52f, 5.38f, 2.60f, 3.53f,
            2.54f, 4.75f, 3.98f, 2.69f, 3.34f, 3.17f };

        float bestMajor = -1e9f, bestMinor = -1e9f;
        float corrSum = 0.f, bestAny = -1e9f;
        for (int t = 0; t < 12; ++t) {
            float majCorr = 0.f, minCorr = 0.f;
            for (int i = 0; i < 12; ++i) {
                majCorr += m_smoothedChroma[i] * kMajorKK[(i - t + 12) % 12];
                minCorr += m_smoothedChroma[i] * kMinorKK[(i - t + 12) % 12];
            }
            if (majCorr > bestMajor) bestMajor = majCorr;
            if (minCorr > bestMinor) bestMinor = minCorr;
            corrSum += majCorr + minCorr;
            bestAny  = std::max(bestAny, std::max(majCorr, minCorr));
        }
        // Ratio: 0 = purely minor, 1 = purely major.
        // Very slow smoothing (~3 s) so mode reflects atmosphere, not noise.
        float rawMode = bestMajor / (bestMajor + bestMinor + 1e-6f);
        m_sMode = 0.97f * m_sMode + 0.03f * rawMode;

        // Key clarity: how far the best-matching key stands above the average of
        // all 24 key correlations.  Peaked → one clear key; flat → atonal/noise.
        float meanCorr   = corrSum / 24.f;
        float rawClarity = (bestAny > 1e-6f)
                         ? std::min(2.5f * (bestAny - meanCorr) / bestAny, 1.f) : 0.f;
        rawClarity   = std::max(0.f, rawClarity);
        m_sKeyClarity = 0.97f * m_sKeyClarity + 0.03f * rawClarity;

        // ---- Harmonic Change (HCDF, Harte 2006) ----
        // Project the 12-bin chroma onto the 6-D tonal centroid (three circles:
        // fifths, minor thirds, major thirds), then measure how fast that point
        // moves frame-to-frame.  Spikes on chord/key changes, ~0 on held harmony.
        const float P = 3.14159265358979f;
        float tc[6] = {0,0,0,0,0,0};
        for (int n = 0; n < 12; ++n) {
            float c = m_smoothedChroma[n];
            tc[0] += c * std::sin(float(n) * 7.f * P / 6.f);
            tc[1] += c * std::cos(float(n) * 7.f * P / 6.f);
            tc[2] += c * std::sin(float(n) * 3.f * P / 2.f);
            tc[3] += c * std::cos(float(n) * 3.f * P / 2.f);
            tc[4] += 0.5f * c * std::sin(float(n) * 2.f * P / 3.f);
            tc[5] += 0.5f * c * std::cos(float(n) * 2.f * P / 3.f);
        }
        float hcdf = 0.f;
        for (int i = 0; i < 6; ++i) {
            float d = tc[i] - m_tonalCentroid[i];
            hcdf += d * d;
            m_tonalCentroid[i] = tc[i];
        }
        hcdf = std::min(std::sqrt(hcdf) * 4.f, 1.f);   // normalise to ~[0,1]
        m_sHCDF = 0.85f * m_sHCDF + 0.15f * hcdf;
    }

    // ---- Chroma hue: harmonic "colour" = circular mean of the chroma on the wheel ----
    // Maps the music's harmonic centre onto the colour wheel (0..1), so the key /
    // harmony drives a consistent global hue shift.  Uses the slow smoothed chroma.
    float chSin = 0.f, chCos = 0.f;
    for (int i = 0; i < 12; ++i) {
        float ang = 6.28318530718f * float(i) / 12.f;
        chSin += m_smoothedChroma[i] * std::sin(ang);
        chCos += m_smoothedChroma[i] * std::cos(ang);
    }
    // Smooth the hue VECTOR (not the angle) — this drifts the colour slowly and
    // continuously, even through the wheel's wrap-around, instead of jumping.
    m_hueCos = 0.99f * m_hueCos + 0.01f * chCos;
    m_hueSin = 0.99f * m_hueSin + 0.01f * chSin;
    float chromaHue = std::atan2(m_hueSin, m_hueCos) * 0.15915494f;  // /(2π) → -0.5..0.5
    if (chromaHue < 0.f) chromaHue += 1.f;                            // → 0..1

    // ---- Dominant Pitch – Harmonic Product Spectrum (HPS) ----
    // Multiply the magnitude spectrum by downsampled-by-2, -3, -4 copies.
    // The fundamental frequency of a harmonic tone produces the highest product
    // because all its harmonics reinforce at the same point.
    // Search range: 60..1200 Hz (covers bass drone through soprano melody).
    {
        const int binLo = std::max(3,
                            int(60.f  * float(kFFTSize) / float(sampleRate)));
        const int binHi = std::min(kFFTHalf / 4 - 1,
                            int(1200.f * float(kFFTSize) / float(sampleRate)) + 1);
        float maxHPS   = -1.f;
        int   pitchBin = binLo;
        for (int k = binLo; k < binHi; ++k) {
            if (k*4 >= kFFTHalf) break;
            float hps = mags[k] * mags[k*2] * mags[k*3] * mags[k*4];
            if (hps > maxHPS) { maxHPS = hps; pitchBin = k; }
        }
        float pitchHz = float(pitchBin) * float(sampleRate) / float(kFFTSize);
        // Log-normalise 60..1200 Hz → 0..1
        float pitchNorm = (std::log2(pitchHz + 1.f) - std::log2(61.f))
                        / (std::log2(1201.f) - std::log2(61.f));
        pitchNorm = std::max(0.f, std::min(pitchNorm, 1.f));
        // Suppress output when there is no signal
        float maxMag    = 0.f;
        for (int k = 1; k < kFFTHalf; ++k) maxMag = std::max(maxMag, mags[k]);
        float confidence = (maxMag > 1e-5f) ? 1.f : 0.f;
        // Slow smoothing — HPS can octave-jump frame to frame, and several shaders
        // use the pitch for hue/scale; this keeps those colour/size changes gradual.
        m_sPitch = 0.97f * m_sPitch + 0.03f * pitchNorm * confidence;
    }

    // ---- Delta-pitch: melodic activity (rate of dominant-pitch change) ----
    float dPitch = std::fabs(m_sPitch - m_prevPitch);
    m_prevPitch = m_sPitch;
    m_sDeltaPitch = 0.85f * m_sDeltaPitch + 0.15f * std::min(dPitch * 25.f, 1.f);

    // ========================================================================
    // Music vs. speech / silence classifier  ->  musicPresence (master gate)
    // ========================================================================
    // Speech (e.g. a talking video in the background) is: mid-band dominant
    // (~300-3400 Hz), lacking sustained bass, non-rhythmic, and choppy (pauses
    // between words).  Music — whether beat-driven OR a sustained ambient drone —
    // has at least one of: bass weight, a steady beat, or sustained continuity.
    // We therefore build a "speechiness" score that several music traits VETO,
    // so a bass drone or a beat track is never mistaken for speech.
    float continuity   = 0.f;
    for (float v : m_levelHistory) if (v > 0.04f) continuity += 1.f;
    continuity /= float(kAmbientHistLen);                 // 1 = no gaps (music/drone)
    float gappiness    = 1.f - continuity;                // speech: some gaps
    float midDom       = (lowMid + mid) / sharpDen;       // speech: mid-dominant
    float bassPresence = std::min((subBass + bass) * 2.0f, 1.f);   // music veto
    float sustain      = continuity * (1.f - m_sFluxVar); // steady drone/pad = music

    float speechiness = midDom
                      * (1.f - bassPresence)              // bass  -> not speech
                      * (1.f - m_sRhythm)                 // beat  -> not speech
                      * (1.f - 0.6f * sustain)            // drone -> not speech
                      * (0.4f + 0.6f * gappiness);        // pauses -> more speech
    speechiness = std::max(0.f, std::min(speechiness * 1.4f, 1.f));
    float musicConf = 1.f - speechiness;

    // Smooth with mild hysteresis: ease toward music a bit faster than toward
    // speech, so brief vocal samples in a song don't drop reactivity, while a
    // genuine switch to dialogue settles within a few seconds.
    float mpSpeed = (musicConf > m_sMusicPresence) ? 0.020f : 0.012f;
    m_sMusicPresence += mpSpeed * (musicConf - m_sMusicPresence);
    m_sMusicPresence = std::max(0.f, std::min(m_sMusicPresence, 1.f));

    // ---- Publish (mutex-protected) ----
    QMutexLocker lk(&m_mutex);
    // Publish the AGC-normalised levels so the visuals are volume-independent.
    m_features.subBassLevel   = nSubBass;
    m_features.bassLevel      = nBass;
    m_features.lowMidLevel    = nLowMid;
    m_features.midLevel       = nMid;
    m_features.upperMidLevel  = nUpperMid;
    m_features.highLevel      = nHigh;
    m_features.overallLevel   = nLevel;
    m_features.isBeat         = isBeat;
    m_features.onsetStrength   = onsetStrength;
    m_features.downbeat        = downbeat;
    m_features.trackChange     = trackChange;
    m_features.beatStrength   = beatStr;
    m_features.beatDecay      = beatDecay;
    m_features.ambientFactor  = m_ambientFactor;
    m_features.speedScale     = speedScale;
    m_features.powerScale     = powerScale;
    m_features.beatSidesHint  = beatSidesHint;
    m_features.audioFlip      = audioFlip;
    m_features.spectralFlux   = spectralFlux;
    m_features.spectralCentroid = smoothedCentroid;
    // Paper-inspired timbral features
    m_features.zeroCrossingRate = m_sZCR;
    m_features.spectralFlatness = m_sSFM;
    m_features.logAttackTime    = m_attackAccum;
    m_features.estimatedBPM     = estimatedBPM;
    m_features.arousal          = arousal;
    m_features.valence          = valence;
    m_features.keyClarity       = m_sKeyClarity;
    m_features.sharpness        = m_sSharpness;
    m_features.harmonicChange   = m_sHCDF;
    m_features.roughness        = m_sRoughness;
    m_features.rhythmStrength    = m_sRhythm;
    m_features.beatPhase         = beatPhase;
    m_features.fluxVariance      = m_sFluxVar;
    m_features.stereoWidth       = m_sStereoWidth;
    m_features.stereoLowL         = m_sStBand[0][0];
    m_features.stereoMidL         = m_sStBand[0][1];
    m_features.stereoHighL        = m_sStBand[0][2];
    m_features.stereoLowR         = m_sStBand[1][0];
    m_features.stereoMidR         = m_sStBand[1][1];
    m_features.stereoHighR        = m_sStBand[1][2];
    m_features.deltaPitch        = m_sDeltaPitch;
    m_features.musicPresence     = m_sMusicPresence;
    m_features.timingScale      = timingScale;
    // FFT-derived features
    m_features.spectralRolloff  = m_sRolloff;
    m_features.spectralSpread   = m_sSpread;
    m_features.musicalMode      = m_sMode;
    m_features.dominantPitch    = m_sPitch;
    m_features.chromaHue        = chromaHue;
}
