#!/usr/bin/env python3
"""Navigate the shipped WebView through Android accessibility, without a test backdoor."""
import argparse
import json
import pathlib
import re
import subprocess
import time
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser()
parser.add_argument("--adb", required=True)
parser.add_argument("--serial", required=True)
parser.add_argument("--output", required=True)
args = parser.parse_args()
output = pathlib.Path(args.output)
output.mkdir(parents=True, exist_ok=True)
steps = []
PACKAGE = "app.usspace.couple.v012"


def adb(*arguments, binary=False):
    return subprocess.run([args.adb, "-s", args.serial, *arguments], check=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          timeout=35, text=not binary).stdout


size = re.findall(r"(\d+)x(\d+)", adb("shell", "wm", "size"))[-1]
width, height = map(int, size)


def dump(label, prefix="learning"):
    adb("shell", "rm", "-f", "/sdcard/usspace-window.xml")
    adb("shell", "uiautomator", "dump", "/sdcard/usspace-window.xml")
    xml = adb("shell", "cat", "/sdcard/usspace-window.xml")
    (output / f"{prefix}-{label}.xml").write_text(xml)
    return ET.fromstring(xml)


def text_of(node):
    return " ".join((node.get("text", "") + " " + node.get("content-desc", "")).split())


def visible_bounds(node):
    bounds = list(map(int, re.findall(r"-?\d+", node.get("bounds", ""))))
    if len(bounds) != 4:
        return None
    left, top, right, bottom = bounds
    if right <= left or bottom <= top or left < 0 or right > width or top < 0 or bottom > height:
        return None
    return bounds


def matches(node, pattern):
    return any(re.search(pattern, value, re.IGNORECASE) for value in
               (text_of(node), node.get("text", ""), node.get("content-desc", "")))


def footer_nodes(root):
    # Today is also a learning tab; identify the footer with its three unique icons.
    landmarks = [node for node in root.iter("node") if visible_bounds(node)
                 and matches(node, r"^(?:⌂\s*Home|♥\s*Us|◫\s*Life)$")
                 and visible_bounds(node)[1] > height / 2]
    if len(landmarks) < 2:
        return []
    top = min(visible_bounds(node)[1] for node in landmarks)
    bottom = max(visible_bounds(node)[3] for node in landmarks)
    return [node for node in root.iter("node") if visible_bounds(node)
            and matches(node, r"^(?:⌂\s*Home|☀\s*Today|♥\s*Us|◫\s*Life)$")
            and visible_bounds(node)[1] >= top and visible_bounds(node)[3] <= bottom]


def safe_region(root, allow_tabs=False):
    footer = footer_nodes(root)
    bottom = min(visible_bounds(node)[1] for node in footer) - 8 if footer else height
    header = [visible_bounds(node)[3] for node in root.iter("node") if visible_bounds(node)
              and matches(node, r"^(?:Our icon|UsSpace\s*♥|a little home for)$")
              and visible_bounds(node)[3] < height / 3]
    top = max(header, default=0) + 8
    if not allow_tabs:
        tabs = [visible_bounds(node) for node in root.iter("node") if visible_bounds(node)
                and matches(node, r"^(?:☀\s*Today|Course|Script|💬\s*Phrase book|🧠\s*Practice|"
                            r"↻\s*Review|♥\s*Together|🔥\s*Progress)$")
                and visible_bounds(node)[1] >= top and visible_bounds(node)[3] <= bottom]
        footer_height = max((visible_bounds(node)[3] - visible_bounds(node)[1]
                             for node in footer), default=height * 0.08)
        if tabs and min(bounds[1] for bounds in tabs) <= top + footer_height + 8:
            top = max(top, max(bounds[3] for bounds in tabs) + 8)
    return top, bottom


def usable_bounds(node, root, allow_nav=False, allow_tabs=False):
    bounds = visible_bounds(node)
    if not bounds:
        return None
    if allow_nav:
        return bounds if node in footer_nodes(root) else None
    top, bottom = safe_region(root, allow_tabs=allow_tabs)
    return bounds if bounds[1] >= top and bounds[3] <= bottom else None


def resumed_component(activity):
    for marker in ("topResumedActivity", "mResumedActivity"):
        matches = re.findall(marker + r"[^\n]*?\s([\w.]+/[\w.$]+)", activity)
        if matches:
            return matches[-1]
    return ""


def sign_in_response(root, activity):
    """Accept visible Google account UI or an actionable app error, never just a busy label."""
    nodes = [node for node in root.iter("node") if visible_bounds(node)]
    text = "\n".join(text_of(node) for node in nodes)
    component = resumed_component(activity)
    foreground_package = component.split("/", 1)[0]
    providers = {
        "com.google.android.gms", "com.google.android.gsf.login", "com.android.credentialmanager",
        "com.android.permissioncontroller", "com.google.android.permissioncontroller",
        "com.android.settings", "com.google.android.settings", "android",
    }
    if foreground_package in providers and re.search(
            r"choose (?:an?|your) account|add (?:an? |Google )?account|Google account|"
            r"sign in (?:to|with) Google|email or phone|use your Google|create account",
            text, re.IGNORECASE):
        return {"outcome": "provider_account_ui", "component": component}

    # HiddenActivity is an internal bridge and must not count as a Google account chooser.
    if foreground_package != PACKAGE or not component.endswith(".MainActivity"):
        return None
    nodes = [node for node in nodes if usable_bounds(node, root)]
    retry = any(any(re.fullmatch(r"\s*Try Google Sign-In again\s*", label, re.IGNORECASE)
                    for label in (node.get("text", ""), node.get("content-desc", "")))
                and node.get("enabled", "true") == "true" for node in nodes)
    error_prefix = r"\b(?:No Google account is available|Google sign-in (?:was cancelled|was interrupted|"
    error_prefix += r"could not open|is unavailable|is disabled|was rejected)|Could not open Google sign-in|"
    error_prefix += r"Firebase (?:could not be reached|Google sign-in failed)|Too many sign-in attempts|"
    error_prefix += r"This account is disabled|This email already uses)\b"
    for node in nodes:
        message = text_of(node)
        if retry and re.search(error_prefix, message, re.IGNORECASE) and re.search(
                r"\b(?:add|install|update|check|tap|try|wait|enable|re-enable|use)\b",
                message, re.IGNORECASE):
            return {"outcome": "actionable_error", "component": component, "message": message}
    return None


def sign_in_smoke():
    report = {"status": "failed", "authenticated_success_verified": False,
              "busy_feedback_observed": False, "steps": []}
    try:
        click("signin-home", r"(?:^| )Home$", direction=False, allow_nav=True)
        click("signin-google", r"(?:^| )Sign in with Google$", direction=True)
        report["steps"] = [step for step in steps if step.get("action", "").startswith("signin-")]
        deadline = time.monotonic() + 60
        attempt = 0
        scrolled_error = False
        while time.monotonic() < deadline:
            if not adb("shell", "pidof", PACKAGE).strip():
                raise RuntimeError("App process exited after tapping Sign in with Google")
            activity = adb("shell", "dumpsys", "activity", "activities")
            (output / f"signin-activity-{attempt}.txt").write_text(activity)
            try:
                root = dump(f"response-{attempt}", prefix="signin")
            except (subprocess.SubprocessError, ET.ParseError) as error:
                # Provider transitions may briefly prevent an accessibility dump.
                (output / f"signin-probe-{attempt}.txt").write_text(str(error))
                attempt += 1
                time.sleep(1)
                continue
            visible = "\n".join(text_of(node) for node in root.iter("node") if visible_bounds(node))
            report["busy_feedback_observed"] |= bool(re.search(
                r"Opening Google Sign-In|Opening the Google account chooser", visible, re.IGNORECASE))
            response = sign_in_response(root, activity)
            if response:
                report.update(response)
                report["status"] = "passed"
                (output / "signin-visible-response.txt").write_text(visible)
                (output / "signin-response-activity.txt").write_text(activity)
                (output / "UsSpace-signin-response.png").write_bytes(
                    adb("exec-out", "screencap", "-p", binary=True))
                print("ANDROID_SIGNIN_HANDOFF_TEST_PASSED: " + response["outcome"]
                      + "; authenticated account success was not tested")
                return
            if (not scrolled_error and resumed_component(activity).startswith(PACKAGE + "/")
                    and re.search(r"Try Google Sign-In again", visible, re.IGNORECASE)):
                # The inline error is below the button; reveal it if the card is near the fold.
                swipe(True, root=root)
                scrolled_error = True
            attempt += 1
            time.sleep(1)
        raise RuntimeError("Sign in with Google produced neither visible account UI nor an actionable retry error within 60 seconds")
    except Exception as error:
        report["error"] = str(error)
        try:
            (output / "UsSpace-signin-failure.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
            (output / "signin-failure-activity.txt").write_text(adb("shell", "dumpsys", "activity", "activities"))
        except subprocess.SubprocessError:
            pass
        raise
    finally:
        (output / "signin-ui-result.json").write_text(json.dumps(report, indent=2) + "\n")
        try:
            (output / "signin-logcat.txt").write_text(adb("logcat", "-b", "all", "-d", "-v", "threadtime"))
        except subprocess.SubprocessError:
            pass


def swipe(down, root=None):
    root = root if root is not None else dump("scroll-region")
    top, bottom = safe_region(root)
    if bottom - top < 50:
        raise RuntimeError("No safe content area for a swipe")
    start, end = (0.80, 0.20) if down else (0.20, 0.80)
    adb("shell", "input", "swipe", str(width // 2), str(int(top + (bottom - top) * start)),
        str(width // 2), str(int(top + (bottom - top) * end)), "350")
    time.sleep(0.4)


def click(label, pattern, direction=True, allow_nav=False, allow_tabs=False):
    for attempt in range(12):
        root = dump(f"{label}-{attempt}")
        for node in root.iter("node"):
            if not matches(node, pattern):
                continue
            bounds = usable_bounds(node, root, allow_nav=allow_nav, allow_tabs=allow_tabs)
            if not bounds or node.get("enabled", "true") != "true":
                continue
            left, top, right, bottom = bounds
            if label == "signin-google":
                (output / "signin-before.xml").write_text(ET.tostring(root, encoding="unicode"))
                (output / "UsSpace-signin-before.png").write_bytes(
                    adb("exec-out", "screencap", "-p", binary=True))
            adb("shell", "input", "tap", str((left + right) // 2), str((top + bottom) // 2))
            time.sleep(0.6)
            steps.append({"action": label, "matched": text_of(node), "bounds": bounds})
            return
        top, _ = safe_region(root, allow_tabs=allow_tabs)
        above = any(matches(node, pattern) and visible_bounds(node)
                    and visible_bounds(node)[1] < top for node in root.iter("node"))
        swipe(False if above else direction, root=root)
    raise RuntimeError(f"Learning UI element not found: {label}")


def verify(label, pattern):
    for attempt in range(6):
        root = dump(f"{label}-verify-{attempt}")
        text = "\n".join(text_of(node) for node in root.iter("node") if usable_bounds(node, root))
        if re.search(pattern, text, re.IGNORECASE):
            break
        top, _ = safe_region(root)
        above = any(matches(node, pattern) and visible_bounds(node)
                    and visible_bounds(node)[1] < top for node in root.iter("node"))
        swipe(not above, root=root)
    else:
        raise RuntimeError(f"Learning UI did not render expected content: {label}")
    (output / f"learning-{label}.txt").write_text(text)
    (output / f"UsSpace-learning-{label}.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
    steps.append({"assertion": label, "status": "passed"})


try:
    click("open-us", r"(?:^| )Us$", allow_nav=True)
    click("open", r"Open offline lessons")
    verify("today", r"Our language corner|Learn Together")
    click("kannada-course", r"(?:^| )Course$", allow_tabs=True)
    verify("kannada-course", r"Kannada beginner course")
    click("script", r"(?:^| )Script$", allow_tabs=True)
    verify("kannada-script", r"ಅ|ಆ|Kannada script|Vowels")
    click("malayalam-learner", r"Yashika learns Malayalam", direction=False)
    click("malayalam-course", r"(?:^| )Course$", allow_tabs=True)
    verify("malayalam-course", r"Malayalam beginner course")
    click("malayalam-script", r"(?:^| )Script$", allow_tabs=True)
    verify("malayalam-script", r"അ|ആ|Malayalam script|Vowels")
    (output / "learning-ui-result.json").write_text(json.dumps({"status": "passed", "steps": steps}, indent=2) + "\n")
    print("ANDROID_LEARNING_UI_TEST_PASSED: both bundled courses and scripts rendered in the signed APK")
except Exception:
    (output / "learning-ui-result.json").write_text(json.dumps({"status": "failed", "steps": steps}, indent=2) + "\n")
    raise

sign_in_smoke()
