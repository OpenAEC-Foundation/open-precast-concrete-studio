"""Install a Windows NSIS build, draw a slab and measure the IFC from its native Save dialog.

python tests/verify-installed.py path/to/setup.exe [--output evidence-directory]
Requires Python 3.12, playwright, pywin32 and ifcopenshell, plus the WebView2 runtime.
"""
import argparse
import json
import math
import os
from pathlib import Path
import shutil
import socket
import struct
import subprocess
import tempfile
import time
from urllib.parse import urlsplit
import urllib.request
import winreg

import ifcopenshell
import ifcopenshell.geom
from ifcopenshell.util import element, shape
from playwright.sync_api import sync_playwright
import win32api
import win32con
import win32gui
import win32process
import win32security


PRODUCT = "Open Precast Concrete Studio"
BINARY = "open-precast-concrete-studio.exe"
MARK = "BP-WIN-01"
ROOT = Path(__file__).resolve().parents[1]


def registered_installations():
    key = rf"Software\Microsoft\Windows\CurrentVersion\Uninstall\{PRODUCT}"
    for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        for view in (winreg.KEY_WOW64_32KEY, winreg.KEY_WOW64_64KEY):
            try:
                with winreg.OpenKey(hive, key, access=winreg.KEY_READ | view) as entry:
                    yield (Path(winreg.QueryValueEx(entry, "InstallLocation")[0].strip('"')),
                           winreg.QueryValueEx(entry, "DisplayVersion")[0])
            except FileNotFoundError:
                continue


def run_nsis(executable, switches, directory):
    # NSIS requires /D= and _?= as the final, unquoted argument, even with spaces.
    cmd = subprocess.list2cmdline([str(executable), *switches]) + " " + directory
    subprocess.run(cmd, check=True, timeout=240)


def assert_x64(executable):
    with executable.open("rb") as binary:
        assert binary.read(2) == b"MZ"
        binary.seek(0x3C)
        binary.seek(struct.unpack("<I", binary.read(4))[0])
        assert binary.read(6) == b"PE\0\0\x64\x86", "Expected an AMD64 Windows executable"


def wait_for_webview(port, process, profile):
    url = f"http://127.0.0.1:{port}"
    loopback = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    runtimes = set()
    for location in ("ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"):
        if location in os.environ:
            application = Path(os.environ[location]) / "Microsoft/EdgeWebView/Application"
            runtimes.update(file.parent.name for file in application.glob("*/msedgewebview2.exe"))
    token = win32security.OpenProcessToken(win32api.GetCurrentProcess(), win32con.TOKEN_QUERY)
    try:
        sid, _ = win32security.GetTokenInformation(token, win32security.TokenIntegrityLevel)
        integrity = win32security.ConvertSidToStringSid(sid)
    finally:
        token.Close()
    print(f"WebView2 {sorted(runtimes)}, test integrity {integrity}, app PID {process.pid}", flush=True)
    targets = []
    connection = "pending"
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        if process.poll() is not None:
            break
        try:
            with loopback.open(url + "/json/list", timeout=1) as response:
                targets = [urlsplit(target["url"]).hostname for target in json.load(response)]
                connection = f"HTTP {response.status}"
                if "tauri.localhost" in targets:
                    return url
        except OSError as exc:
            connection = str(exc)
        time.sleep(.2)
    windows = []
    def app_window(hwnd, _):
        if win32process.GetWindowThreadProcessId(hwnd)[1] == process.pid:
            windows.append((win32gui.GetClassName(hwnd), win32gui.GetWindowText(hwnd)))
        return True
    win32gui.EnumWindows(app_window, None)
    profile_entries = sorted(entry.name for entry in profile.glob("*"))
    raise RuntimeError(f"Packaged WebView2 did not start. App exit={process.returncode}, windows={windows}, "
                       f"loopback={connection}, CDP hosts={targets}, profile entries={profile_entries}")


def save_dialog(pid, target):
    # Use only the native common dialog in our own installed process. The Win32
    # The modern file dialog uses filename edit 1001, the classic one cmb13 (1148).
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        dialogs = []

        def collect(hwnd, _):
            if (win32process.GetWindowThreadProcessId(hwnd)[1] == pid
                    and win32gui.GetClassName(hwnd) == "#32770" and win32gui.IsWindowVisible(hwnd)):
                dialogs.append(hwnd)
            return True

        win32gui.EnumWindows(collect, None)
        for dialog in dialogs:
            children = []
            win32gui.EnumChildWindows(dialog, lambda h, _: children.append(h) or True, None)
            for edit in children:
                if win32gui.GetClassName(edit) != "Edit":
                    continue
                parent = win32gui.GetParent(edit)
                if (win32gui.GetDlgCtrlID(edit) not in (1001, 1148)
                        and win32gui.GetDlgCtrlID(parent) != 1148):
                    continue
                button = next((h for h in children if win32gui.GetClassName(h) == "Button"
                               and win32gui.GetDlgCtrlID(h) == win32con.IDOK), None)
                if button and win32gui.IsWindowEnabled(button):
                    win32gui.SendMessage(edit, win32con.EM_SETSEL, 0, -1)
                    win32gui.SendMessage(edit, win32con.EM_REPLACESEL, 1, str(target))
                    win32gui.PostMessage(button, win32con.BM_CLICK, 0, 0)
                    return
        time.sleep(.1)
    raise TimeoutError(f"Windows Save dialog did not offer a filename control for {target.name}")


def draw_and_save(page, pid, folder):
    def field(name):
        return page.locator("#" + name)

    field("element-type").select_option("balcony")
    field("mark").fill(MARK)
    field("storey").fill("02 Testverdieping")
    field("length").fill("3000")
    field("depth").fill("1500")
    field("thicknessMode").select_option("linear")
    field("thickness").fill("180")
    field("freeThickness").fill("100")
    field("edgeProfile").select_option("step")
    field("edgeSide").select_option("free")
    field("edgeWidth").fill("125")
    field("edgeDrop").fill("50")
    page.locator('[data-view="plan"]').click()
    field("plan-view").locator("polygon").first.wait_for()
    page.locator('[data-view="section"]').click()
    field("section-view").locator('polygon[data-section="whole"]').wait_for()
    assert field("end-values").inner_text() == "180,0 / 150,0 mm"
    assert field("volume-value").inner_text() == "0,649 m³"
    page.screenshot(path=folder / (MARK + ".png"))
    for button, extension in [("save-project", ".opc.json"), ("export-ifc", ".ifc")]:
        target = folder / (MARK + extension)
        field(button).click()
        save_dialog(pid, target)
        deadline = time.monotonic() + 30
        while not (target.is_file() and target.stat().st_size):
            if time.monotonic() > deadline:
                raise TimeoutError(f"Installed app did not write {target.name}. {field('status').inner_text()}")
            time.sleep(.1)
        print(f"Windows Save dialog wrote {target.name}", flush=True)


def exercise(executable, folder):
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    profile = folder / "webview"
    env = dict(os.environ, WEBVIEW2_USER_DATA_FOLDER=str(profile),
               WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=
               f"--remote-debugging-port={port} --remote-debugging-address=127.0.0.1")
    process = subprocess.Popen([str(executable)], cwd=executable.parent, env=env)
    try:
        url = wait_for_webview(port, process, profile)
        with sync_playwright() as driver:
            browser = driver.chromium.connect_over_cdp(url)
            page, = [p for context in browser.contexts for p in context.pages if "tauri.localhost" in p.url]
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            draw_and_save(page, process.pid, folder)
            assert not errors, errors
    finally:
        if process.poll() is None:
            process.terminate()
        process.wait(timeout=20)


def measure(folder):
    project = json.loads((folder / (MARK + ".opc.json")).read_text(encoding="utf-8"))
    assert project["element"]["mark"] == MARK
    assert project["element"]["thicknessMode"] == "linear"
    model = ifcopenshell.open(str(folder / (MARK + ".ifc")))
    assert model.schema == "IFC4"
    slab, = model.by_type("IfcSlab")
    assert (slab.Name, slab.Tag, slab.PredefinedType) == ("Balkonplaat", MARK, "FLOOR")
    assert slab.GlobalId == ifcopenshell.guid.compress(project["identity"].replace("-", ""))
    assert element.get_container(slab).Name == "02 Testverdieping"
    geometry = ifcopenshell.geom.create_shape(ifcopenshell.geom.settings(), slab)
    vertices = shape.get_vertices(geometry.geometry)
    extents = vertices.max(axis=0) - vertices.min(axis=0)
    assert math.isclose(extents[0], 3) and math.isclose(extents[1], 1.5), extents
    for ordinate, expected in [(0, .180), (1.5, .150)]:
        z = vertices[abs(vertices[:, 1] - ordinate) < 1e-7, 2]
        assert math.isclose(max(z) - min(z), expected, abs_tol=1e-8)
    volume = shape.get_volume(geometry.geometry)
    expected = 3 * 1.5 * (.180 + .100) / 2 + 3 * .125 * .050
    quantity = element.get_pset(slab, "Qto_SlabBaseQuantities")["NetVolume"]
    assert math.isclose(volume, expected, abs_tol=1e-9) and math.isclose(quantity, expected, abs_tol=1e-9)
    print(f"IFC4 {slab.Name} {slab.Tag}, 3000 x 1500 mm, ends 180 / 150 mm, {volume:.6f} m3", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("installer", type=Path)
    parser.add_argument("--output", type=Path, help="Keep the measured IFC, project and section screenshot")
    args = parser.parse_args()
    installer = args.installer.resolve(strict=True)
    previous = list(registered_installations())
    if previous:
        raise RuntimeError(f"Use a clean Windows test account to keep this existing installation intact: {previous}")
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    with tempfile.TemporaryDirectory(prefix="opcs-windows-", ignore_cleanup_errors=True) as tmp:
        folder = Path(tmp)
        destination = folder / "Installed application"
        uninstaller = destination / "uninstall.exe"
        try:
            run_nsis(installer, ["/S", "/NS"], "/D=" + str(destination))
            assert (destination, version) in list(registered_installations()), "Missing Windows install registration"
            assert uninstaller.is_file()
            print(f"Installed {PRODUCT} {version} at {destination}", flush=True)
            executable = (destination / BINARY).resolve(strict=True)
            assert_x64(executable)
            exercise(executable, folder)
            measure(folder)
            if args.output:
                args.output.mkdir(exist_ok=True, parents=True)
                for extension in (".ifc", ".opc.json", ".png"):
                    shutil.copy2(folder / (MARK + extension), args.output)
        finally:
            if uninstaller.is_file():
                run_nsis(uninstaller, ["/S"], "_?=" + str(destination))
        assert not list(registered_installations()) and not (destination / BINARY).exists()
        print("Test installation uninstalled", flush=True)


if __name__ == "__main__":
    main()
