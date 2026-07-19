// MainActivity.java — Kaleidoscope Remote.
// ---------------------------------------------------------------------------
// A deliberately thin app: one fullscreen WebView showing the visualizer's
// embedded web remote (start the PC app with  -t 8080).  The address is asked
// once and remembered; BACK reopens the address dialog.  The screen stays on
// while the remote is visible (it is a live control surface).
//
// No external libraries (androidx etc.) on purpose — the whole app is plain
// framework API, which keeps the no-Gradle build (see build-apk.ps1) trivial.
// ---------------------------------------------------------------------------
package de.kaleidoscope.remote;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.view.WindowManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;

public class MainActivity extends Activity
{
    private WebView           m_web;
    private SharedPreferences m_prefs;
    private boolean           m_failed = false;   // one dialog per failure

    @Override protected void onCreate(Bundle savedInstanceState)
    {
        super.onCreate(savedInstanceState);
        // A live control surface: never let the screen time out over it.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        m_prefs = getSharedPreferences("remote", MODE_PRIVATE);

        m_web = new WebView(this);
        m_web.setBackgroundColor(Color.parseColor("#101018"));  // page colour
        WebSettings s = m_web.getSettings();
        s.setJavaScriptEnabled(true);        // the page is fetch()-driven
        s.setDomStorageEnabled(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        m_web.setWebViewClient(new WebViewClient()
        {
            @Override public void onReceivedError(WebView v, WebResourceRequest r,
                                                  WebResourceError e)
            {
                if (r.isForMainFrame() && !m_failed)
                {
                    m_failed = true;
                    askAddress("Keine Verbindung. Läuft das Kaleidoscope mit -t <Port>? Adresse prüfen:");
                }
            }
        });
        setContentView(m_web);

        String addr = m_prefs.getString("addr", "");
        if (addr.isEmpty()) askAddress(null);
        else                connect(addr);
    }

    private void connect(String addr)
    {
        m_failed = false;
        if (!addr.contains(":"))
            addr = addr + ":8080";           // bare IP -> the suggested port
        m_web.loadUrl("http://" + addr + "/");
    }

    private void askAddress(String hint)
    {
        final EditText in = new EditText(this);
        in.setInputType(InputType.TYPE_CLASS_TEXT
                      | InputType.TYPE_TEXT_VARIATION_URI);
        in.setText(m_prefs.getString("addr", ""));
        in.setHint("192.168.1.20:8080");
        new AlertDialog.Builder(this)
            .setTitle("Kaleidoscope-PC")
            .setMessage(hint != null ? hint
                : "Adresse[:Port] des PCs (Kaleidoscope dort mit  -t 8080  starten):")
            .setView(in)
            .setCancelable(false)
            .setPositiveButton("Verbinden", (d, w) -> {
                String a = in.getText().toString().trim();
                m_prefs.edit().putString("addr", a).apply();
                connect(a);
            })
            .setNegativeButton("Beenden", (d, w) -> finish())
            .show();
    }

    // BACK = change the address (the remote page itself has no navigation).
    @Override public void onBackPressed()
    {
        askAddress(null);
    }
}
