#!/usr/bin/env python3
"""Verify v0.14 through real Android taps, screenshots and accessibility only."""
import importlib.util
import json
import pathlib
import re
import struct
import time
import zlib

helper_path = pathlib.Path(__file__).with_name("android-learning-smoke.py")
spec = importlib.util.spec_from_file_location("usspace_v014_android_ui", helper_path)
ui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ui)
output = ui.output
report = {
    "status": "failed",
    "package": ui.PACKAGE,
    "scope": "actual anonymous Android UI; no fabricated account, rota or push messages",
    "authenticated_account_success_verified": False,
    "background_fcm_delivery_verified": False,
    "live_microsoft_graph_access_verified": False,
    "user_data_cleared": False,
    "steps": ui.steps,
}
original_dump = ui.dump


def dump(label, prefix="v014"):
    return original_dump(label, prefix=prefix)


ui.dump = dump


def visible_text(root, safe=True):
    return "\n".join(ui.text_of(node) for node in root.iter("node")
                     if (ui.usable_bounds(node, root) if safe else ui.visible_bounds(node)))


def screenshot(label):
    png = ui.adb("exec-out", "screencap", "-p", binary=True)
    if png[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError("Android screenshot is not a PNG")
    (output / f"UsSpace-v014-{label}.png").write_bytes(png)
    return png


def passed(label, **details):
    ui.steps.append({"assertion": label, "status": "passed", **details})


def align(node, root):
    bounds = ui.visible_bounds(node)
    if not bounds:
        return False
    top, bottom = ui.safe_region(root)
    if bounds[3] - bounds[1] > bottom - top:
        return False
    if bounds[1] < top:
        down, needed = False, top - bounds[1]
    elif bounds[3] > bottom:
        down, needed = True, bounds[3] - bottom
    else:
        return False
    distance = min(160, max(48, needed + 24), (bottom - top) // 2)
    if distance < 20:
        raise RuntimeError("No safe content area for partial-control alignment")
    middle = (top + bottom) // 2
    start, end = middle + distance // 2, middle - distance // 2
    if not down:
        start, end = end, start
    ui.adb("shell", "input", "swipe", str(ui.width // 2), str(start),
           str(ui.width // 2), str(end), "650")
    time.sleep(0.3)
    return True


def find(label, pattern, class_name=None, interactive=False, enabled=None, direction=True):
    """Require the complete real control inside the protected content viewport."""
    for attempt in range(12):
        root = dump(f"{label}-{attempt}")
        candidates = [node for node in root.iter("node") if ui.matches(node, pattern)
                      and (class_name is None or node.get("class") in
                           (class_name if isinstance(class_name, tuple) else (class_name,)))
                      and (not interactive or node.get("clickable") == "true")
                      and (enabled is None or node.get("enabled", "true") == str(enabled).lower())]
        for node in candidates:
            if ui.usable_bounds(node, root):
                return root, node
        if any(align(node, root) for node in candidates):
            continue
        top, _ = ui.safe_region(root)
        above = any(ui.visible_bounds(node) and ui.visible_bounds(node)[1] < top
                    for node in candidates)
        ui.swipe(False if above else direction, root=root)
    raise RuntimeError("v0.14 visible element not found: " + label)


def tap(label, pattern, class_name="android.widget.Button"):
    root, node = find(label, pattern, class_name=class_name, interactive=True, enabled=True)
    left, top, right, bottom = ui.usable_bounds(node, root)
    ui.adb("shell", "input", "tap", str((left + right) // 2), str((top + bottom) // 2))
    ui.steps.append({"action": label, "matched": ui.text_of(node),
                     "bounds": [left, top, right, bottom]})
    time.sleep(0.5)


def verify(label, pattern):
    root, node = find(label, pattern)
    (output / f"v014-{label}.txt").write_text(visible_text(root))
    screenshot(label)
    passed(label, matched=ui.text_of(node), bounds=ui.usable_bounds(node, root))
    return root


def absent(root, label, pattern, no_editors=False):
    # Include offscreen accessibility nodes: a signed-out setup form must not
    # merely be hidden below the fold.
    all_text = "\n".join(ui.text_of(node) for node in root.iter("node"))
    if re.search(pattern, all_text, re.IGNORECASE | re.MULTILINE):
        raise RuntimeError("v0.14 exposed forbidden content: " + label)
    if no_editors and any(node.get("class", "").endswith("EditText")
                          for node in root.iter("node")):
        raise RuntimeError("v0.14 exposed an authenticated editor while signed out")
    passed(label)


def open_settings(label):
    root = dump(label + "-header")
    for node in root.iter("node"):
        bounds = ui.visible_bounds(node)
        if (bounds and ui.matches(node, r"^⚙️?$")
                and node.get("class") == "android.widget.Button"
                and node.get("clickable") == "true" and node.get("enabled", "true") == "true"
                and bounds[3] < ui.height / 3):
            # The existing settings gear is intentionally in the fixed header.
            # This narrow exception never permits an offscreen content tap.
            left, top, right, bottom = bounds
            ui.adb("shell", "input", "tap", str((left + right) // 2), str((top + bottom) // 2))
            ui.steps.append({"action": label, "matched": ui.text_of(node), "bounds": bounds,
                             "legitimate_fixed_header_control": True})
            time.sleep(0.5)
            sheet = dump(label + "-sheet")
            if not any(ui.matches(item, r"^Our space$") and ui.visible_bounds(item)
                       and item.get("class") == "android.widget.TextView"
                       for item in sheet.iter("node")):
                raise RuntimeError("The settings gear did not open the Our space sheet")
            passed(label + "-sheet-visible")
            return
    raise RuntimeError("The actual fixed-header settings gear is not available")


def close_settings():
    for attempt in range(12):
        root = dump(f"settings-return-to-header-{attempt}")
        headings = [ui.visible_bounds(node) for node in root.iter("node")
                    if ui.matches(node, r"^Our space$") and ui.visible_bounds(node)
                    and node.get("class") == "android.widget.TextView"]
        if headings:
            heading = headings[0]
            for node in root.iter("node"):
                bounds = ui.visible_bounds(node)
                if (bounds and ui.matches(node, r"^×$")
                        and node.get("class") == "android.widget.Button"
                        and node.get("clickable") == "true" and node.get("enabled", "true") == "true"
                        and abs((bounds[1] + bounds[3]) / 2 - (heading[1] + heading[3]) / 2) < 35):
                    left, top, right, bottom = bounds
                    ui.adb("shell", "input", "tap", str((left + right) // 2), str((top + bottom) // 2))
                    time.sleep(0.5)
                    closed = dump("settings-closed")
                    if any(ui.matches(item, r"^Appearance$|^Allow notifications$")
                           and ui.visible_bounds(item) for item in closed.iter("node")):
                        raise RuntimeError("The settings sheet did not close")
                    passed("settings-closed-through-real-modal-control", bounds=bounds)
                    return
        ui.swipe(False, root=root)
    raise RuntimeError("Our space modal header could not be revealed for closing")


def decode_png(png):
    """Decode actual 8-bit Android screencap pixels using the Python standard library."""
    if png[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("PNG signature is invalid")
    position, chunks, header = 8, [], None
    while position < len(png):
        if position + 12 > len(png):
            raise ValueError("PNG chunk is truncated")
        length = struct.unpack_from(">I", png, position)[0]
        kind = png[position + 4:position + 8]
        end = position + length + 12
        if end > len(png):
            raise ValueError("PNG payload is truncated")
        payload = png[position + 8:position + 8 + length]
        crc = struct.unpack_from(">I", png, position + length + 8)[0]
        if zlib.crc32(kind + payload) & 0xffffffff != crc:
            raise ValueError("PNG checksum is invalid")
        if kind == b"IHDR":
            header = struct.unpack(">IIBBBBB", payload)
        elif kind == b"IDAT":
            chunks.append(payload)
        position = end
        if kind == b"IEND":
            break
    if not header:
        raise ValueError("PNG dimensions are missing")
    width, height, depth, color, compression, filtering, interlace = header
    if depth != 8 or color not in (2, 6) or compression or filtering or interlace:
        raise ValueError("Expected a non-interlaced 8-bit RGB/RGBA Android screenshot")
    channels = 4 if color == 6 else 3
    stride = width * channels
    raw = zlib.decompress(b"".join(chunks))
    if len(raw) != (stride + 1) * height:
        raise ValueError("PNG scanline size does not match its dimensions")
    previous, rows, offset = bytearray(stride), [], 0
    for _ in range(height):
        filter_type = raw[offset]
        row = bytearray(raw[offset + 1:offset + stride + 1])
        offset += stride + 1
        if filter_type not in range(5):
            raise ValueError("Unknown PNG row filter")
        for index in range(stride):
            left = row[index - channels] if index >= channels else 0
            up = previous[index]
            upper_left = previous[index - channels] if index >= channels else 0
            if filter_type == 1:
                predictor = left
            elif filter_type == 2:
                predictor = up
            elif filter_type == 3:
                predictor = (left + up) // 2
            elif filter_type == 4:
                prediction = left + up - upper_left
                distances = (abs(prediction - left), abs(prediction - up), abs(prediction - upper_left))
                predictor = (left, up, upper_left)[distances.index(min(distances))]
            else:
                predictor = 0
            row[index] = (row[index] + predictor) & 255
        rows.append(row)
        previous = row
    return width, height, channels, rows


def brightness(png):
    width, height, channels, rows = decode_png(png)
    if (width, height) != (ui.width, ui.height):
        raise RuntimeError("Screenshot dimensions differ from the real Android viewport")
    crop = [int(width * .06), int(height * .20), int(width * .94), int(height * .78)]
    total, pixels = 0.0, 0
    for y in range(crop[1], crop[3], 3):
        row = rows[y]
        for x in range(crop[0], crop[2], 3):
            index = x * channels
            total += .2126 * row[index] + .7152 * row[index + 1] + .0722 * row[index + 2]
            pixels += 1
    return total / pixels, crop


def verify_theme(label, dark):
    for attempt in range(4):
        root = dump(f"{label}-pixels-{attempt}")
        png = screenshot(label + f"-probe-{attempt}")
        mean, crop = brightness(png)
        rendered_app = any(ui.visible_bounds(node) and ui.matches(node,
                           r"^UsSpace\s*♥$|^Appearance$|^Our space$")
                           for node in root.iter("node"))
        if rendered_app and (mean < 130 if dark else mean > 170):
            (output / f"UsSpace-v014-{label}.png").write_bytes(png)
            passed(label, pixel_mean_luminance=round(mean, 3), pixel_crop=crop,
                   expected="dark < 130" if dark else "light > 170")
            return root
        time.sleep(0.8)
    raise RuntimeError(f"Actual {label} pixels did not match the chosen theme; mean luminance {mean:.2f}")


def restart(label):
    ui.adb("shell", "am", "force-stop", ui.PACKAGE)
    result = ui.adb("shell", "am", "start", "-W", "-n", ui.PACKAGE + "/.MainActivity")
    (output / f"v014-{label}-launch.txt").write_text(result)
    time.sleep(1.2)
    activity = ui.adb("shell", "dumpsys", "activity", "activities")
    (output / f"v014-{label}-activity.txt").write_text(activity)
    component = ui.resumed_component(activity)
    if not component.startswith(ui.PACKAGE + "/") or not component.endswith(".MainActivity"):
        raise RuntimeError("MainActivity did not resume after force-stop: " + component)
    if not ui.adb("shell", "pidof", ui.PACKAGE).strip():
        raise RuntimeError("The app exited after its appearance persistence relaunch")
    passed(label, component=component, force_stopped=True, user_data_cleared=False)


def set_system_night(label, enabled):
    result = ui.adb("shell", "cmd", "uimode", "night", "yes" if enabled else "no")
    (output / f"v014-{label}-uimode.txt").write_text(result)
    # Configuration changes can recreate Android's real Activity. A normal
    # force-stop/relaunch reads the actual new system mode without clearing data.
    restart(label + "-relaunch")


def checkbox(label, pattern, expected=None, enabled=None):
    root, node = find(label, pattern, class_name="android.widget.CheckBox", enabled=enabled)
    checked = node.get("checked")
    if checked not in ("true", "false"):
        raise RuntimeError("The actual Android checkbox has no checked state: " + label)
    if expected is not None and checked != str(expected).lower():
        raise RuntimeError("The actual Android checkbox state did not change: " + label)
    screenshot(label)
    passed(label, checked=checked == "true", enabled=node.get("enabled", "true") == "true",
           matched=ui.text_of(node), bounds=ui.usable_bounds(node, root))
    return checked == "true"


def toggle_and_restore(label, pattern):
    original = checkbox(label + "-before", pattern, enabled=True)
    tap(label + "-toggle", pattern, class_name="android.widget.CheckBox")
    checkbox(label + "-changed", pattern, expected=not original, enabled=True)
    tap(label + "-restore", pattern, class_name="android.widget.CheckBox")
    checkbox(label + "-restored", pattern, expected=original, enabled=True)


def run():
    open_settings("open-appearance-settings")
    verify("appearance-section", r"^Appearance$")
    # Both choices are actual accessible buttons, and rendered pixels are
    # checked independently of accessibility labels or JS implementation state.
    theme_classes = ("android.widget.Button", "android.widget.ToggleButton")
    tap("choose-light", r"^Light$", class_name=theme_classes)
    verify_theme("light-theme-rendered", dark=False)
    tap("choose-dark", r"^Dark$", class_name=theme_classes)
    verify_theme("dark-theme-rendered", dark=True)
    restart("dark-choice-force-stop")
    verify_theme("dark-choice-persists-after-force-stop", dark=True)

    open_settings("open-system-appearance-settings")
    tap("choose-system", r"^System$", class_name=theme_classes)
    close_settings()
    set_system_night("system-dark", enabled=True)
    verify_theme("system-theme-follows-android-dark", dark=True)
    set_system_night("system-light", enabled=False)
    verify_theme("system-theme-follows-android-light", dark=False)

    open_settings("open-notification-settings")
    verify("notifications-section", r"^Notifications$")
    checkbox("notifications-off-and-disabled-when-signed-out", r"^Allow notifications(?:\s|$)",
             expected=False, enabled=False)
    categories = (
        ("pings", r"^Pings & little love$"),
        ("notes", r"^Notes & appreciation$"),
        ("status", r"^Status changes$"),
        ("goals", r"^Shared goals$"),
        ("bucket", r"^Bucket List updates$"),
        ("memories", r"^New memories$"),
        ("calendar", r"^Calendar changes$"),
    )
    for name, pattern in categories:
        checkbox("notification-category-" + name, pattern, enabled=True)
    passed("all-seven-real-notification-category-controls", categories=[name for name, _ in categories])
    # Return to the sheet's top before locating a control whose offscreen
    # accessibility bounds can be zero. This avoids guessing its scroll direction.
    close_settings()
    open_settings("open-notification-toggle-settings")
    toggle_and_restore("new-memories-setting", r"^New memories$")
    toggle_and_restore("quiet-hours-setting", r"^Quiet hours(?:\s|$)")
    verify("notification-private-health-cycle-moods", r"Health, Cycle, private goals, and private comfort moods never generate partner notifications")
    close_settings()

    ui.click("life-tab", r"(?:^| )Life$", allow_nav=True)
    tap("work-schedule-entry", r"\bWork Schedule\b.*See my shifts\s*→")
    verify("work-schedule-real-route", r"^Work Schedule$")
    verify("work-schedule-signed-out-guidance", r"Sign in with Google first, then connect Microsoft")
    locked = verify("work-schedule-private-work-day", r"^Your private work day$")
    absent(locked, "work-schedule-no-anonymous-account-form-or-fake-shifts",
           r"^Connect Microsoft$|Save connection settings|Refresh rota|Kuttu starts at|Kuttu is working until",
           no_editors=True)
    tap("work-schedule-open-readonly-instructions", r"^Microsoft setup instructions$")
    verify("microsoft-real-mobile-redirect", r"app\.usspace\.couple\.v012://oauth2redirect")
    verify("microsoft-readonly-files-permission", r"Files\.Read\.All")
    instructions = verify("microsoft-profile-permission", r"User\.Read")
    absent(instructions, "microsoft-instructions-do-not-unlock-authenticated-configuration",
           r"^Connect Microsoft$|Save connection settings|Refresh rota", no_editors=True)
    tap("work-schedule-close-instructions", r"^Close instructions$")
    closed = dump("work-schedule-instructions-closed")
    absent(closed, "work-schedule-instructions-close",
           r"app\.usspace\.couple\.v012://oauth2redirect|Files\.Read\.All")
    screenshot("work-schedule-final-private-state")
    report["status"] = "passed"
    print("ANDROID_V014_UI_TEST_PASSED: actual themes, force-stop persistence, System mode, notification controls and private Microsoft setup boundary")


if __name__ == "__main__":
    try:
        run()
    except Exception as error:
        report["error"] = str(error)
        try:
            screenshot("failure")
            dump("failure")
            (output / "v014-failure-activity.txt").write_text(ui.adb("shell", "dumpsys", "activity", "activities"))
        except Exception:
            pass
        raise
    finally:
        # Leave the emulator in its normal Light system mode even after failure.
        try:
            ui.adb("shell", "cmd", "uimode", "night", "no")
        except Exception as cleanup_error:
            report["system_mode_cleanup_error"] = str(cleanup_error)
        (output / "v014-ui-result.json").write_text(json.dumps(report, indent=2) + "\n")
