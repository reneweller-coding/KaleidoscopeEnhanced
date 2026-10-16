# -*- coding: utf-8 -*-
"""A private copy of the settings file for the app instances a tool starts (KALEIDO_SETTINGS).

The app reads and writes the file KALEIDO_SETTINGS names instead of the repository's kaleidoscope_settings.ini.
A tool gives every instance it starts a fresh copy of the user's file: the user's file stays exactly as it is, even
when the run is stopped half-way; a show running on the same file meanwhile keeps what it wrote; and instances
running side by side (--jobs) no longer write one file.  Until 16.10.2026 the tools backed the file up and copied it
back afterwards -- which overwrote whatever a show wrote in between, and left the scratch preset behind as the
start preset when a run was aborted.

    with PrivateSettings("perf") as ps:
        subprocess.run([exe, ...], env=ps.env(os.environ))
"""
import os
import shutil
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INI = os.path.join(ROOT, "kaleidoscope_settings.ini")


class PrivateSettings:
    """A temporary folder with one settings copy per instance slot; removed again on close()."""

    def __init__(self, tag="tool"):
        self.dir = tempfile.mkdtemp(prefix="kaleido_%s_" % tag)

    def path(self, slot=0):
        """A fresh copy of the user's settings for the instance in this slot (an empty file if there is none)."""
        p = os.path.join(self.dir, "settings_%d.ini" % slot)
        if os.path.exists(INI):
            shutil.copy(INI, p)
        else:
            open(p, "w").close()
        return p

    def env(self, base, slot=0):
        """base (an environment mapping) plus KALEIDO_SETTINGS on a fresh copy for this slot."""
        e = dict(base)
        e["KALEIDO_SETTINGS"] = self.path(slot)
        return e

    def close(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
        return False
