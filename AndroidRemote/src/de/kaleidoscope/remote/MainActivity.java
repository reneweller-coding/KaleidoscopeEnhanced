// MainActivity.java — Kaleidoscope Remote.
// ---------------------------------------------------------------------------
// A deliberately thin app: one fullscreen WebView showing the visualizer's
// embedded web remote. The PC's address is no longer typed by hand in the
// common case: on start (and on BACK), the app broadcasts a UDP discovery
// packet on the LAN and the running Kaleidoscope instance(s) answer with
// their name/port/active-preset. Exactly one instance found -> connect
// straight away. Several found (multiple PCs, or several instances on one
// PC) -> a picker lists them. None found -> fall back to the last known
// address, or to manual entry. The last CHOSEN instance is remembered by
// identity (host+pid, not just IP) so a DHCP lease renewal doesn't break
// auto-reconnect on the next launch.
//
// No external libraries (androidx etc.) on purpose — the whole app is plain
// framework API (org.json is part of the platform, not a dependency), which
// keeps the no-Gradle build (see build-apk.ps1) trivial.
// ---------------------------------------------------------------------------
package de.kaleidoscope.remote;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.DhcpInfo;
import android.net.wifi.WifiManager;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.SocketTimeoutException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class MainActivity extends Activity
{
    private static final int    DISCOVERY_PORT       = 45677;
    private static final String DISCOVERY_MAGIC       = "KALEIDO_DISCOVER_V1";
    private static final int    DISCOVERY_WINDOW_MS   = 1300;
    private static final int    DISCOVERY_SEND_COUNT  = 3;

    private WebView           m_web;
    private TextView          m_status;
    private SharedPreferences m_prefs;
    private boolean           m_failed = false;   // one dialog/rescan per failure

    /** One PC found by a discovery scan. */
    private static class Instance
    {
        String ip; int port; String name, config, pid;
        String key()      { return ip + ":" + port; }
        String identity() { return name + "#" + pid; }        // survives an IP change (DHCP)
        String label()
        {
            String c = (config == null || config.isEmpty()) ? "" : "  — " + config;
            return name + c + "   (" + ip + ")";
        }
    }

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
                    m_status.setText("Verbindung verloren — suche erneut …");
                    startDiscoveryAndConnect(false);
                }
            }
        });

        // A FrameLayout so a "searching..." status can sit on top of the WebView
        // while a discovery scan is in flight, instead of a blank white flash.
        FrameLayout root = new FrameLayout(this);
        root.addView(m_web, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        m_status = new TextView(this);
        m_status.setTextColor(Color.parseColor("#8899bb"));
        m_status.setTextSize(16);
        m_status.setGravity(Gravity.CENTER);
        m_status.setBackgroundColor(Color.parseColor("#101018"));
        root.addView(m_status, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        setContentView(root);

        startDiscoveryAndConnect(false);
    }

    // BACK = re-scan and let the user pick a (possibly different) instance,
    // instead of jumping straight to manual address entry as before.
    @Override public void onBackPressed()
    {
        startDiscoveryAndConnect(true);
    }

    private void connect(String addr)
    {
        m_failed = false;
        m_status.setVisibility(View.GONE);
        if (!addr.contains(":"))
            addr = addr + ":8080";           // bare IP -> Kaleidoscope's default remote port
        m_web.loadUrl("http://" + addr + "/");
    }

    private void pick(Instance i)
    {
        m_prefs.edit().putString("lastId", i.identity())
                      .putString("addr", i.ip + ":" + i.port).apply();
        connect(i.ip + ":" + i.port);
    }

    private void askAddress(String hint)
    {
        m_status.setVisibility(View.GONE);
        final EditText in = new EditText(this);
        in.setInputType(InputType.TYPE_CLASS_TEXT
                      | InputType.TYPE_TEXT_VARIATION_URI);
        in.setText(m_prefs.getString("addr", ""));
        in.setHint("192.168.1.20:8080");
        new AlertDialog.Builder(this)
            .setTitle("Kaleidoscope-PC")
            .setMessage(hint != null ? hint
                : "Adresse[:Port] des PCs (Kaleidoscope läuft dort standardmäßig auf Port 8080):")
            .setView(in)
            .setCancelable(false)
            .setPositiveButton("Verbinden", (d, w) -> {
                String a = in.getText().toString().trim();
                m_prefs.edit().putString("addr", a).remove("lastId").apply();
                connect(a);
            })
            .setNegativeButton("Beenden", (d, w) -> finish())
            .show();
    }

    // ---- LAN auto-discovery -------------------------------------------------

    /**
     * Scans the LAN for running Kaleidoscope instances, then either connects
     * straight away (remembered instance still present, or exactly one found),
     * shows a picker (several found), or falls back to a saved/manual address
     * (none found). @param forcePicker skip the "auto-pick" shortcuts (used
     * after a failed connection, and from the BACK button) so the user always
     * gets to choose explicitly.
     */
    private void startDiscoveryAndConnect(final boolean forcePicker)
    {
        m_status.setVisibility(View.VISIBLE);
        m_status.setText("Suche Kaleidoscope im Netzwerk …");
        new Thread(() -> {
            final List<Instance> found = discover();
            runOnUiThread(() -> onDiscoveryDone(found, forcePicker));
        }).start();
    }

    private void onDiscoveryDone(List<Instance> found, boolean forcePicker)
    {
        if (!forcePicker)
        {
            final String lastId = m_prefs.getString("lastId", "");
            if (!lastId.isEmpty())
                for (Instance i : found)
                    if (i.identity().equals(lastId)) { pick(i); return; }

            if (found.size() == 1) { pick(found.get(0)); return; }
        }

        if (found.isEmpty())
        {
            final String addr = m_prefs.getString("addr", "");
            if (!addr.isEmpty() && !forcePicker) { connect(addr); return; }
            askAddress(forcePicker ? null
                : "Keine Kaleidoscope-Instanz im Netzwerk gefunden. Läuft die App " +
                  "(sie startet den Fernzugriff seit Version 2 automatisch)? " +
                  "Adresse notfalls manuell eingeben:");
            return;
        }

        showPicker(found);
    }

    private void showPicker(final List<Instance> found)
    {
        final String[] labels = new String[found.size() + 1];
        for (int k = 0; k < found.size(); k++) labels[k] = found.get(k).label();
        labels[found.size()] = "Manuelle Eingabe …";

        m_status.setVisibility(View.GONE);
        new AlertDialog.Builder(this)
            .setTitle("Welches Kaleidoscope?")
            .setCancelable(false)
            .setItems(labels, (d, which) -> {
                if (which == found.size()) askAddress(null);
                else                        pick(found.get(which));
            })
            .show();
    }

    /** Broadcasts the discovery request a few times and collects replies until the window elapses. */
    private List<Instance> discover()
    {
        final Map<String, Instance> byKey = new LinkedHashMap<>();
        DatagramSocket sock = null;
        try
        {
            sock = new DatagramSocket();
            sock.setBroadcast(true);
            sock.setSoTimeout(200);

            final List<InetAddress> targets = new ArrayList<>();
            targets.add(InetAddress.getByName("255.255.255.255"));
            final InetAddress subnet = wifiBroadcastAddress();
            if (subnet != null) targets.add(subnet);

            final byte[] req = DISCOVERY_MAGIC.getBytes("UTF-8");
            final byte[] buf = new byte[512];
            final long deadline = System.currentTimeMillis() + DISCOVERY_WINDOW_MS;
            int sent = 0;

            while (System.currentTimeMillis() < deadline)
            {
                if (sent < DISCOVERY_SEND_COUNT)
                {
                    for (InetAddress a : targets)
                        sock.send(new DatagramPacket(req, req.length, a, DISCOVERY_PORT));
                    sent++;
                }
                try
                {
                    final DatagramPacket resp = new DatagramPacket(buf, buf.length);
                    sock.receive(resp);
                    final JSONObject j = new JSONObject(
                        new String(resp.getData(), 0, resp.getLength(), "UTF-8"));
                    final Instance inst = new Instance();
                    inst.ip     = resp.getAddress().getHostAddress();
                    inst.port   = j.optInt("port", 8080);
                    inst.name   = j.optString("name", inst.ip);
                    inst.config = j.optString("config", "");
                    inst.pid    = j.optString("pid", "");
                    byKey.put(inst.key(), inst);
                }
                catch (SocketTimeoutException ste) { /* nothing yet - keep going until the deadline */ }
                catch (Exception parseErr) { /* malformed/foreign reply on this port - ignore it */ }
            }
        }
        catch (Exception e) { /* no network, permission denied, ... - return whatever was found */ }
        finally { if (sock != null) sock.close(); }
        return new ArrayList<>(byKey.values());
    }

    /** The WiFi subnet's directed broadcast address (ip | ~netmask), or null if unavailable. */
    private InetAddress wifiBroadcastAddress()
    {
        try
        {
            final WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm == null) return null;
            final DhcpInfo d = wm.getDhcpInfo();
            if (d == null || d.netmask == 0) return null;
            final int bcast = (d.ipAddress & d.netmask) | ~d.netmask;
            final byte[] q = new byte[4];
            for (int k = 0; k < 4; k++) q[k] = (byte) ((bcast >> (k * 8)) & 0xFF);
            return InetAddress.getByAddress(q);
        }
        catch (Exception e) { return null; }
    }
}
