"""Install a Windows NSIS build, draw a slab and measure the IFC from its native Save dialog.

python tests/verify-installed.py path/to/setup.exe [--upgrade-from path/to/earlier-setup.exe] [--output evidence-directory]
Requires Python 3.12, playwright, pywin32, pypdf and ifcopenshell, plus the WebView2 runtime.
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
from pypdf import PdfReader
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
                entry = winreg.OpenKey(hive, key, access=winreg.KEY_READ | view)
            except FileNotFoundError:
                continue
            with entry:
                yield (Path(winreg.QueryValueEx(entry, "InstallLocation")[0].strip('"')),
                       winreg.QueryValueEx(entry, "DisplayVersion")[0])


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


def draw_and_save(page, pid, folder, phase):
    def field(name):
        return page.locator("#" + name)

    field("iso-view").locator("polygon").first.wait_for()
    if phase == "upgraded":
        assert field("mark").input_value() == MARK and field("storey").input_value() == "02 Testverdieping"
        assert [field(key).input_value() for key in ("length", "depth", "thickness", "freeThickness")] == [
            "3000", "1500", "180", "100"]
        assert field("channelProfile").input_value() == "none" and not field("dripGroove").is_checked()
        assert field("drainPosition").input_value() == "66"
        assert "hersteld" in field("status").inner_text().lower()
    else:
        assert field("status").inner_text() == "Nieuw element", "Expected a new isolated test profile"
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
    assert field("volume-value").inner_text() == "0,649 m³"
    if phase != "baseline":
        field("channelProfile").select_option("rect")
        field("channelWidth").fill("100")
        field("channelDepth").fill("15")
        field("channelInset").fill("50")
        field("dripGroove").check()
        field("dripWidth").fill("15")
        field("dripDepth").fill("8")
        field("dripInset").fill("25")
        field("drainPosition").fill("30")
        assert field("volume-value").inner_text() == "0,644 m³"
    page.locator('[data-view="plan"]').click()
    field("plan-view").locator("polygon").first.wait_for()
    page.locator('[data-view="section"]').click()
    field("section-view").locator('polygon[data-section="whole"]').wait_for()
    assert field("end-values").inner_text() == "180,0 / 150,0 mm"
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


def check_sheet_pdf(page, pid, folder, expected_volume):
    mark = page.locator("#mark").input_value()
    target = folder / (mark + ".pdf")
    page.locator("#print-drawing").click()
    save_dialog(pid, target)
    page.get_by_text("Elementblad als PDF opgeslagen", exact=True).wait_for()
    sheet, = PdfReader(target).pages
    assert abs(float(sheet.mediabox.width) * 25.4 / 72 - 297) < 1
    assert abs(float(sheet.mediabox.height) * 25.4 / 72 - 210) < 1
    contents = sheet.extract_text()
    printed_volume = f"{expected_volume:.4f}".rstrip("0").rstrip(".").replace(".", ",") + " m³"
    for value in [mark, "Bovenaanzicht", "Doorsnede", printed_volume]:
        assert value in contents, (value, contents)
    print("Windows PDF verifies as one landscape A4 with this slab, both views and its volume", flush=True)


def check_feedback(page, pid, folder):
    # Exercise the compiled WebView's real CSP and Fetch implementation. Only
    # local app resources may go to the network during this dialog test.
    endpoint = "https://open-feedback-studio.pages.dev/api/feedback"
    canary = "https://opcs-csp-test.invalid/blocked"
    config = page.evaluate("window.PrecastFeedbackConfig")
    origin = page.evaluate("location.origin")
    issue = "https://github.com/OpenAEC-Foundation/open-precast-concrete-studio/issues/999999999"
    note = "Geïsoleerde Windows-proef van de feedbackdialoog."
    captured, unexpected = [], []

    def intercept(route):
        request = route.request
        if request.url == endpoint and request.method in ("OPTIONS", "POST"):
            headers = {"Access-Control-Allow-Origin":origin, "Access-Control-Allow-Methods":"POST, OPTIONS",
                       "Access-Control-Allow-Headers":"Content-Type"}
            if request.method == "OPTIONS":
                route.fulfill(status=204, headers=headers)
            else:
                captured.append(request.post_data_json)
                route.fulfill(status=200, headers=headers, json={"success":True, "githubIssueUrl":issue})
        elif urlsplit(request.url).hostname in ("tauri.localhost", "ipc.localhost"):
            route.continue_()
        else:
            unexpected.append(request.url)
            route.abort()

    page.context.route("**/*", intercept)
    try:
        # If the actual CSP is absent or too permissive, the mock route aborts
        # the canary and the expected securitypolicyviolation never appears.
        directive = page.evaluate("""url => new Promise(resolve => {
            const timeout = setTimeout(() => resolve(null), 2500);
            document.addEventListener('securitypolicyviolation', event => {
                if (event.blockedURI.startsWith(new URL(url).origin)) {
                    clearTimeout(timeout);
                    resolve(event.effectiveDirective);
                }
            }, {once:true});
            fetch(url).catch(() => {});
        })""", canary)
        assert directive == "connect-src" and not unexpected, (directive, unexpected)
        if not config.get("app"):
            page.locator("#open-feedback").click()
            assert page.locator("#feedback-registration").is_visible()
            assert page.locator("#feedback-submit").is_disabled()
            page.locator("#feedback-message").fill(note)
            page.get_by_role("button", name="Concept opslaan").click()
            target = folder / "feedbackconcept.txt"
            save_dialog(pid, target)
            page.get_by_text("Feedbackconcept opgeslagen.", exact=True).wait_for()
            contents = target.read_text(encoding="utf-8")
            assert note in contents and config["version"] in contents and MARK not in contents
            assert not captured and not unexpected
            page.locator("#feedback-close").click()
        page.evaluate("version => { window.PrecastFeedbackConfig = Object.freeze({app:'opcs-desktop-test', version}); }",
                      config["version"])
        page.locator("#open-feedback").click()
        page.locator("#feedback-category").select_option("feature")
        page.locator("#feedback-message").fill(note)
        page.locator("#feedback-submit").click()
        page.locator("#feedback-receipt").wait_for()
        assert page.locator("#feedback-issue").get_attribute("href") == issue
        assert captured == [{"app":"opcs-desktop-test", "appVersion":config["version"], "category":"feature", "message":note}]
        assert not unexpected, unexpected
        page.locator("#feedback-close").click()
        print("Feedback dialog validated using real desktop CSP and one intercepted POST", flush=True)
    finally:
        page.evaluate("config => { window.PrecastFeedbackConfig = Object.freeze(config); }", config)
        page.context.unroute("**/*", intercept)


def check_design_controls(page, pid, folder):
    def button(name):
        return page.locator("#" + name)

    button("new-project").click()
    button("cancel-element").click()
    assert not button("new-element-dialog").is_visible() and button("mark").input_value() == "BP-01"
    button("new-project").click()
    page.get_by_role("radio", name="Balkon met gevelsponning", exact=False).check()
    button("create-element").click()
    mark = "BP-S01"
    assert button("mark").input_value() == mark and button("facadeRebate").is_checked()
    button("rebateDepth").fill("45")
    button("undo-edit").click()
    assert button("rebateDepth").input_value() == "30"
    button("redo-edit").click()
    assert button("rebateDepth").input_value() == "45"
    button("undo-edit").click()
    assert button("volume-value").inner_text() == "0,900 m³"

    for view in ["plan", "section", "iso"]:
        page.locator(f'[data-view="{view}"]').click()
        svg = button(view + "-view")
        original = svg.get_attribute("viewBox")
        button("zoom-in").click()
        assert svg.get_attribute("viewBox") != original
        button("zoom-out").click()
        assert button("view-scale").inner_text() == "100%"
        button("zoom-in").click()
        button("fit-view").click()
        assert svg.get_attribute("viewBox") == original
    page.locator(".bim-info + details summary").click()
    assert page.locator(".bim-info + details p").is_visible()
    check_sheet_pdf(page, pid, folder, .90048)

    project = folder / (mark + ".opc.json")
    button("save-project").click()
    save_dialog(pid, project)
    page.get_by_text("Ontwerp opgeslagen", exact=True).wait_for()
    page.locator("#drafts summary").click()
    drafts = button("draft-list")
    old = drafts.locator("option").filter(has_text="BP-01").first
    drafts.select_option(value=old.get_attribute("value"))
    button("export-draft").click()
    backup = folder / "werkversie.opc.json"
    save_dialog(pid, backup)
    page.get_by_text("Kopie van werkversie opgeslagen", exact=True).wait_for()
    assert json.loads(backup.read_text(encoding="utf-8"))["element"]["mark"] == "BP-01"
    button("restore-draft").click()
    assert button("mark").input_value() == "BP-01"
    with page.expect_file_chooser() as chooser:
        button("open-project").click()
    chooser.value.set_files(project)
    page.get_by_text("Geopend · " + project.name, exact=True).wait_for()
    assert button("mark").input_value() == mark and button("rebateDepth").input_value() == "30"

    target = folder / (mark + ".ifc")
    button("export-ifc").click()
    save_dialog(pid, target)
    page.get_by_text("IFC-bestand opgeslagen", exact=True).wait_for()
    model = ifcopenshell.open(str(target))
    slab, = model.by_type("IfcSlab")
    identity = json.loads(project.read_text(encoding="utf-8"))["identity"]
    assert model.schema == "IFC4" and slab.Tag == mark
    assert slab.GlobalId == ifcopenshell.guid.compress(identity.replace("-", ""))
    geometry = ifcopenshell.geom.create_shape(ifcopenshell.geom.settings(), slab)
    volume = shape.get_volume(geometry.geometry)
    assert math.isclose(volume, .90048, abs_tol=1e-9), volume
    assert math.isclose(element.get_pset(slab, "Qto_SlabBaseQuantities")["NetVolume"], volume, abs_tol=1e-9)
    print(f"Windows template {mark}: reopened design, measured IFC solid and quantity {volume:.6f} m3", flush=True)


def exercise_older_version(page):
    page.locator("#mark").fill("BP-OUD")
    page.locator("#length").fill("4250")
    assert "lokaal bewaard" in page.locator("#status").inner_text()


def export_restored_revision(page, pid, folder):
    assert page.locator("#mark").input_value() == "BP-LOKAAL"
    with page.expect_file_chooser() as chooser:
        page.locator("#open-project").click()
    chooser.value.set_files(folder / (MARK + ".opc.json"))
    page.get_by_text(f"Geopend · {MARK}.opc.json", exact=True).wait_for()
    assert page.locator("#mark").input_value() == MARK

    page.locator("#drafts summary").click()
    drafts = page.locator("#draft-list")
    for mark, length in [("BP-OUD", "4250"), ("BP-LOKAAL", "3140")]:
        option = drafts.locator("option").filter(has_text=mark).first
        drafts.select_option(value=option.get_attribute("value"))
        page.locator("#restore-draft").click()
        assert page.locator("#mark").input_value() == mark
        assert page.locator("#length").input_value() == length
    assert page.locator("#channelProfile").input_value() == "rect"
    assert page.locator("#dripGroove").is_checked()
    target = folder / "BP-LOKAAL.ifc"
    page.locator("#export-ifc").click()
    save_dialog(pid, target)
    page.get_by_text("IFC-bestand opgeslagen", exact=True).wait_for()


def exercise(executable, folder, profile, phase):
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    env = dict(os.environ, WEBVIEW2_USER_DATA_FOLDER=str(profile),
               WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=
               f'--remote-debugging-port={port} --remote-debugging-address=127.0.0.1 '
               '--host-resolver-rules="MAP open-feedback-studio.pages.dev ~NOTFOUND"')
    process = subprocess.Popen([str(executable)], cwd=executable.parent, env=env)
    try:
        url = wait_for_webview(port, process, profile)
        with sync_playwright() as driver:
            browser = driver.chromium.connect_over_cdp(url)
            # CDP can announce the WebView before Playwright has received its first navigation.
            context, = browser.contexts
            pages = context.pages
            page = next((p for p in pages if urlsplit(p.url).hostname == "tauri.localhost"), None)
            if page is None:
                page = pages[0] if pages else context.wait_for_event("page", timeout=30000)
                page.wait_for_url(lambda url: urlsplit(url).hostname == "tauri.localhost",
                                  wait_until="commit", timeout=30000)
            audit_buttons = phase in ("fresh", "upgraded", "controls")
            if audit_buttons:
                page.locator("#iso-view polygon").first.wait_for()
                page.evaluate("""() => {
                    const key = button => button.id || (button.dataset.view && 'view-' + button.dataset.view);
                    const buttons = Array.from(document.querySelectorAll('button'), key);
                    if (buttons.some(id => !id) || new Set(buttons).size !== buttons.length)
                        throw new Error('Each button needs a distinct ID or view name for the Windows interaction test.');
                    const clicked = new Set();
                    document.addEventListener('click', event => {
                        const button = event.target.closest('button');
                        if (button && event.isTrusted) clicked.add(key(button));
                    }, true);
                    window.buttonCoverage = () => ({buttons, clicked:[...clicked]});
                }""")
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            if phase == "controls":
                check_design_controls(page, process.pid, folder)
            elif phase == "rollback":
                exercise_older_version(page)
            elif phase == "restored":
                export_restored_revision(page, process.pid, folder)
            else:
                draw_and_save(page, process.pid, folder, phase)
                if phase != "baseline":
                    check_sheet_pdf(page, process.pid, folder, .64407)
                    check_feedback(page, process.pid, folder)
                if phase == "upgraded":
                    # These edits exist only in the current app's working copy.
                    page.locator("#mark").fill("BP-LOKAAL")
                    page.locator("#length").fill("3140")
                    assert page.locator("#volume-value").inner_text() == "0,674 m³"
            assert not errors, errors
            if audit_buttons:
                return page.evaluate("window.buttonCoverage()")
    finally:
        if process.poll() is None:
            def close_app(hwnd, _):
                if win32process.GetWindowThreadProcessId(hwnd)[1] == process.pid and win32gui.GetWindowText(hwnd) == PRODUCT:
                    win32gui.PostMessage(hwnd, win32con.WM_CLOSE, 0, 0)
                return True
            win32gui.EnumWindows(close_app, None)
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.terminate()
                process.wait(timeout=10)
                raise RuntimeError("The test application did not close after WM_CLOSE")


def measure(folder, with_drainage, previous_identity=None):
    project = json.loads((folder / (MARK + ".opc.json")).read_text(encoding="utf-8"))
    assert project["element"]["mark"] == MARK
    assert project["element"]["thicknessMode"] == "linear"
    if previous_identity:
        assert project["identity"] == previous_identity, "The Windows upgrade changed the element identity"
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
    design = element.get_pset(slab, "OpenPrecast_Ontwerp")
    if with_drainage:
        assert project["element"]["channelProfile"] == "rect" and project["element"]["dripGroove"] is True
        assert project["element"]["drainPosition"] == 30
        channel, drip = 3 * .100 * .015, 3 * .015 * .008 / 2
        expected -= channel + drip
        assert math.isclose(design["Uitsparingsvolume langsgoot"], channel, abs_tol=1e-10)
        assert math.isclose(design["Uitsparingsvolume waterhol"], drip, abs_tol=1e-10)
        assert math.isclose(design["HWA-positie vanaf links"], .3, abs_tol=1e-10)
        hwa = [.900, 1.400, -.036]
    else:
        hwa = [1.980, 1.500, -.0225]
    for actual, correct in zip(design["Positie HWA-reservering"], hwa, strict=True):
        assert math.isclose(actual, correct, abs_tol=1e-9), (actual, correct)
    quantity = element.get_pset(slab, "Qto_SlabBaseQuantities")["NetVolume"]
    assert math.isclose(volume, expected, abs_tol=1e-9) and math.isclose(quantity, expected, abs_tol=1e-9)
    print(f"IFC4 {slab.Name} {slab.Tag}, 3000 x 1500 mm, ends 180 / 150 mm, {volume:.6f} m3, HWA {hwa} m", flush=True)
    return project["identity"]


def install(installer, destination, version=None):
    run_nsis(installer, ["/S", "/NS"], "/D=" + str(destination))
    registrations = set(registered_installations())
    assert len(registrations) == 1, f"Unexpected installation registrations: {registrations}"
    [(location, installed_version)] = registrations
    assert location == destination and (not version or installed_version == version), registrations
    assert (destination / "uninstall.exe").is_file()
    executable = (destination / BINARY).resolve(strict=True)
    assert_x64(executable)
    print(f"Installed {PRODUCT} {installed_version} at {destination}", flush=True)
    return executable, installed_version


def verify_restored_export(folder, original_id):
    model = ifcopenshell.open(str(folder / "BP-LOKAAL.ifc"))
    slab, = model.by_type("IfcSlab")
    assert slab.Tag == "BP-LOKAAL"
    assert slab.GlobalId == ifcopenshell.guid.compress(original_id.replace("-", ""))
    expected = .644070 * 3140 / 3000
    geometry = ifcopenshell.geom.create_shape(ifcopenshell.geom.settings(), slab)
    assert math.isclose(shape.get_volume(geometry.geometry), expected, abs_tol=1e-9)
    assert math.isclose(element.get_pset(slab, "Qto_SlabBaseQuantities")["NetVolume"], expected, abs_tol=1e-9)
    print(f"Restored unsaved BP-LOKAAL with its original identity and {expected:.9f} m3", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("installer", type=Path)
    parser.add_argument("--upgrade-from", type=Path, help="Install an earlier release and edit its restored local drawing")
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
        profile = folder / "webview"
        try:
            original_id = None
            if args.upgrade_from:
                baseline = folder / "before-upgrade"
                baseline.mkdir()
                executable, old_version = install(args.upgrade_from.resolve(strict=True), destination)
                assert old_version != version, f"The baseline installer also has version {version}"
                previous_build = folder / "previous-version"
                previous_build.mkdir()
                previous_executable = previous_build / BINARY
                shutil.copy2(executable, previous_executable)
                exercise(executable, baseline, profile, "baseline")
                original_id = measure(baseline, False)
            executable, _ = install(installer, destination, version)
            drawing_test = exercise(executable, folder, profile, "upgraded" if original_id else "fresh")
            measure(folder, True, original_id)
            controls = folder / "knopproef"
            controls.mkdir()
            design_test = exercise(executable, controls, folder / "controls-profile", "controls")
            buttons = set(drawing_test["buttons"])
            assert buttons == set(design_test["buttons"])
            clicked = set(drawing_test["clicked"]) | set(design_test["clicked"])
            assert buttons == clicked, f"Buttons missing from the installed app test: {sorted(buttons - clicked)}"
            (controls / "knoppen.json").write_text(json.dumps(
                {"knoppen":sorted(buttons), "aangeklikt":sorted(clicked)}, indent=2), encoding="utf-8")
            print(f"All {len(buttons)} installed app buttons exercised", flush=True)
            if args.upgrade_from:
                exercise(previous_executable, folder, profile, "rollback")
                exercise(executable, folder, profile, "restored")
                verify_restored_export(folder, original_id)
            if args.output:
                args.output.mkdir(exist_ok=True, parents=True)
                for extension in (".ifc", ".opc.json", ".png", ".pdf"):
                    shutil.copy2(folder / (MARK + extension), args.output)
                shutil.copytree(controls, args.output / controls.name, dirs_exist_ok=True)
                if args.upgrade_from:
                    shutil.copytree(baseline, args.output / "before-upgrade", dirs_exist_ok=True)
                    shutil.copy2(folder / "BP-LOKAAL.ifc", args.output)
        finally:
            if uninstaller.is_file():
                run_nsis(uninstaller, ["/S"], "_?=" + str(destination))
        assert not list(registered_installations()) and not (destination / BINARY).exists()
        print("Test installation uninstalled", flush=True)


if __name__ == "__main__":
    main()
