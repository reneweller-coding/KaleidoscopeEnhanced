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
import android.os.Handler;
import android.os.Looper;
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
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class MainActivity extends Activity
{
    private static final int    DISCOVERY_PORT       = 45677;
    private static final String DISCOVERY_MAGIC       = "KALEIDO_DISCOVER_V1";
    private static final int    DISCOVERY_WINDOW_MS   = 1300;
    private static final int    DISCOVERY_SEND_COUNT  = 3;

    private static final int  MAX_AUTO_RETRIES  = 2;      // consecutive failures before we stop auto-redialling
    private static final long PICKER_REFRESH_MS = 4000;   // background re-scan cadence while the picker is open

    private WebView           m_web;
    private TextView          m_status;
    private SharedPreferences m_prefs;
    private boolean           m_failed     = false;   // one dialog/rescan per failure
    private int               m_failStreak = 0;       // consecutive connect failures with no successful load in between

    private final Handler  m_handler = new Handler(Looper.getMainLooper());
    private AlertDialog    m_pickerDialog;             // currently-shown instance picker, if any
    private List<Instance> m_pickerShown = new ArrayList<>();   // the set it's currently listing
    private final Runnable m_pickerRefreshTick = () ->
        new Thread(() -> {
            final List<Instance> found = discover();
            runOnUiThread(() -> refreshPickerIfChanged(found));
        }).start();

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
                if (!r.isForMainFrame() || m_failed) return;
                m_failed = true;
                m_failStreak++;

                // A discovered/remembered instance that keeps failing to
                // connect (its HTTP bind failed but it still answers
                // discovery, its process died mid-session, ...) must not
                // redial itself forever: past MAX_AUTO_RETRIES, drop it as
                // the remembered choice and force the picker/manual-entry
                // path instead of silently re-picking the same target.
                if (m_failStreak > MAX_AUTO_RETRIES)
                {
                    m_prefs.edit().remove("lastId").apply();
                    m_status.setText(R.string.status_connection_failed_repeatedly);
                    startDiscoveryAndConnect(true);
                }
                else
                {
                    m_status.setText(R.string.status_connection_lost_retrying);
                    startDiscoveryAndConnect(false);
                }
            }

            @Override public void onPageFinished(WebView v, String url)
            {
                m_failStreak = 0;   // a real page loaded - this target is good again
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
        in.setHint(R.string.hint_address);
        new AlertDialog.Builder(this)
            .setTitle(R.string.dialog_pc_title)
            .setMessage(hint != null ? hint : getString(R.string.dialog_pc_message))
            .setView(in)
            .setCancelable(false)
            .setPositiveButton(R.string.btn_connect, (d, w) -> {
                String a = in.getText().toString().trim();
                m_prefs.edit().putString("addr", a).remove("lastId").apply();
                connect(a);
            })
            .setNegativeButton(R.string.btn_quit, (d, w) -> finish())
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
        m_status.setText(R.string.status_searching);
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
            askAddress(forcePicker ? null : getString(R.string.dialog_pc_message_none_found));
            return;
        }

        showPicker(found);
    }

    private void showPicker(final List<Instance> found)
    {
        m_pickerShown = found;
        final String[] labels = new String[found.size() + 1];
        for (int k = 0; k < found.size(); k++) labels[k] = found.get(k).label();
        labels[found.size()] = getString(R.string.btn_manual_entry);

        m_status.setVisibility(View.GONE);
        if (m_pickerDialog != null && m_pickerDialog.isShowing())
            m_pickerDialog.dismiss();
        m_pickerDialog = new AlertDialog.Builder(this)
            .setTitle(R.string.dialog_picker_title)
            .setCancelable(false)
            .setItems(labels, (d, which) -> {
                if (which == found.size()) askAddress(null);
                else                        pick(found.get(which));
            })
            .show();

        // Keep discovering in the background while the user is deciding, so
        // an instance started just after this dialog opened still shows up
        // without them having to back out and hit BACK to re-scan.
        m_handler.postDelayed(m_pickerRefreshTick, PICKER_REFRESH_MS);
    }

    /**
     * Re-scans while the picker is open and rebuilds it if the result set
     * actually changed. Never acts on an EMPTY scan (a single dropped
     * broadcast/reply is common and must not collapse an already-good list
     * down to the manual-entry dialog), and stops rescheduling itself as
     * soon as the picker is no longer showing (picked, or replaced by
     * another dialog).
     */
    private void refreshPickerIfChanged(List<Instance> found)
    {
        if (m_pickerDialog == null || !m_pickerDialog.isShowing()) return;
        if (found.isEmpty()) { m_handler.postDelayed(m_pickerRefreshTick, PICKER_REFRESH_MS); return; }

        final Set<String> shownKeys = new HashSet<>();
        for (Instance i : m_pickerShown) shownKeys.add(i.key());
        final Set<String> foundKeys = new HashSet<>();
        for (Instance i : found) foundKeys.add(i.key());

        if (!shownKeys.equals(foundKeys))
            showPicker(found);   // rebuilds the dialog and reschedules itself
        else
            m_handler.postDelayed(m_pickerRefreshTick, PICKER_REFRESH_MS);
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
                    // port<=0 means that instance's HTTP server never
                    // actually bound (the PC side now suppresses this reply
                    // entirely, but stay defensive against an older PC
                    // build or a malformed packet) -- connecting there
                    // would just fail immediately, so drop it here rather
                    // than surfacing an unusable target to auto-pick/pick().
                    final int port = j.optInt("port", 8080);
                    if (port <= 0) continue;

                    final Instance inst = new Instance();
                    inst.ip     = resp.getAddress().getHostAddress();
                    inst.port   = port;
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
