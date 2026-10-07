#!/usr/bin/env python3
"""Exercise the real, signed WebView UI without accounts, fake records or a backdoor."""
import importlib.util
import json
import pathlib
import re
import time


# Both scripts accept the same --adb/--serial/--output arguments. Import only the
# guarded helpers so all taps use the same fixed-header/footer geometry checks.
helper_path = pathlib.Path(__file__).with_name("android-learning-smoke.py")
spec = importlib.util.spec_from_file_location("usspace_android_ui", helper_path)
ui = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ui)
output = ui.output
report = {
    "status": "failed",
    "package": ui.PACKAGE,
    "scope": "actual anonymous Android UI; authenticated CRUD is tested separately",
    "authenticated_account_success_verified": False,
    "shared_records_created": False,
    "steps": ui.steps,
}

original_dump = ui.dump
original_safe_region = ui.safe_region


def dump(label, prefix="us-features"):
    return original_dump(label, prefix=prefix)


# The imported click/swipe functions resolve dump from their own module.
ui.dump = dump


def safe_region(root, allow_tabs=False):
    top, bottom = original_safe_region(root, allow_tabs=allow_tabs)
    # Need Me keeps the safety action above the bottom navigation. Content
    # underneath this real control must not be accepted as visible/tappable.
    overlays = [ui.visible_bounds(node) for node in root.iter("node")
                if ui.visible_bounds(node) and ui.matches(node, r"^I don[’']t feel safe$")
                and ui.visible_bounds(node)[1] > ui.height / 2]
    if overlays:
        bottom = min(bottom, min(bounds[1] for bounds in overlays) - 8)
    return top, bottom


ui.safe_region = safe_region


def text(root, safe=True):
    return "\n".join(ui.text_of(node) for node in root.iter("node")
                     if (ui.usable_bounds(node, root) if safe else ui.visible_bounds(node)))


def screenshot(label):
    png = ui.adb("exec-out", "screencap", "-p", binary=True)
    if png[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError("Android evidence screenshot is not a PNG")
    (output / f"UsSpace-us-{label}.png").write_bytes(png)


def verify(label, pattern):
    for attempt in range(8):
        root = dump(f"{label}-verify-{attempt}")
        visible = text(root)
        if re.search(pattern, visible, re.IGNORECASE | re.MULTILINE):
            (output / f"us-features-{label}.txt").write_text(visible)
            screenshot(label)
            ui.steps.append({"assertion": label, "status": "passed"})
            return root
        top, _ = ui.safe_region(root)
        above = any(ui.matches(node, pattern) and ui.visible_bounds(node)
                    and ui.visible_bounds(node)[1] < top for node in root.iter("node"))
        ui.swipe(not above, root=root)
    raise RuntimeError(f"Us feature did not render expected visible content: {label}")


def absent(root, label, pattern):
    # Check the whole accessibility viewport, including text near the footer.
    if re.search(pattern, text(root, safe=False), re.IGNORECASE):
        raise RuntimeError(f"Us feature exposed forbidden content: {label}")
    ui.steps.append({"assertion": label, "status": "passed"})


def align_partly_visible(node, root):
    bounds = ui.visible_bounds(node)
    if not bounds:
        return False
    top, bottom = ui.safe_region(root)
    if bounds[1] < top:
        down, needed = False, top - bounds[1]
    elif bounds[3] > bottom:
        down, needed = True, bounds[3] - bottom
    else:
        return False
    # A large swipe can move a tall card from behind the footer to behind the
    # sticky header, then back again forever. Align it with a short, slow swipe
    # wholly inside the safe region; still require its entire bounds before tap.
    distance = min(160, max(48, needed + 24), (bottom - top) // 2)
    if distance < 20:
        raise RuntimeError("No safe content area to align a partly visible control")
    center = (top + bottom) // 2
    start, end = center + distance // 2, center - distance // 2
    if not down:
        start, end = end, start
    ui.adb("shell", "input", "swipe", str(ui.width // 2), str(start),
           str(ui.width // 2), str(end), "650")
    time.sleep(0.4)
    return True


def open_from_us(label, pattern):
    ui.click(label + "-hub", r"(?:^| )Us$", allow_nav=True)
    for attempt in range(12):
        root = dump(f"{label}-open-{attempt}")
        cards = [node for node in root.iter("node") if ui.matches(node, pattern)
                 and node.get("class") == "android.widget.Button"
                 and node.get("clickable") == "true" and node.get("enabled", "true") == "true"]
        for node in cards:
            bounds = ui.usable_bounds(node, root)
            if bounds:
                left, top, right, bottom = bounds
                ui.adb("shell", "input", "tap", str((left + right) // 2), str((top + bottom) // 2))
                time.sleep(0.6)
                ui.steps.append({"action": label + "-open", "matched": ui.text_of(node), "bounds": bounds})
                return
        if not any(align_partly_visible(node, root) for node in cards):
            ui.swipe(True, root=root)
    raise RuntimeError("Us hub button could not be revealed safely: " + label)


def click_control(label, pattern):
    """Tap the associated interactive field, never its separate text label."""
    original_matches = ui.matches

    def matches_control(node, candidate):
        return (original_matches(node, candidate)
                and (candidate != pattern or node.get("clickable") == "true"))

    ui.matches = matches_control
    try:
        ui.click(label, pattern)
    finally:
        ui.matches = original_matches


def scroll_to_heading(label, pattern):
    # Android reports wholly offscreen WebView nodes as [0,0][0,0], so their
    # location cannot establish an upward direction. Deliberately reveal the
    # real page heading before looking for a status or control near its top.
    for attempt in range(10):
        root = dump(f"{label}-{attempt}")
        if any(node.get("class") == "android.widget.TextView" and ui.matches(node, pattern)
               and ui.usable_bounds(node, root) for node in root.iter("node")):
            ui.steps.append({"assertion": label, "status": "passed"})
            return
        ui.swipe(False, root=root)
    raise RuntimeError("Page heading could not be revealed: " + label)


def choose_country_india():
    click_control("safety-country", r"^Crisis and emergency help in$")
    for attempt in range(4):
        choices = dump(f"safety-native-country-options-{attempt}")
        if any(node.get("class") in {
                "android.widget.CheckedTextView", "android.widget.RadioButton", "android.widget.TextView"
        } and ui.matches(node, r"^India$") and ui.usable_bounds(node, choices)
                   for node in choices.iter("node")):
            break
        time.sleep(0.4)
    else:
        raise RuntimeError("The native country selector did not expose its India option")
    screenshot("safety-native-country-options")
    ui.steps.append({"assertion": "safety-native-country-options", "status": "passed"})
    ui.click("safety-country-india", r"^India$")


def activate_safety():
    root = dump("comfort-fixed-safety-action")
    footer = ui.footer_nodes(root)
    footer_top = min((ui.visible_bounds(node)[1] for node in footer), default=ui.height)
    for node in root.iter("node"):
        bounds = ui.visible_bounds(node)
        if (bounds and ui.matches(node, r"^I don[’']t feel safe$")
                and bounds[3] < footer_top and node.get("enabled", "true") == "true"):
            left, top, right, bottom = bounds
            ui.adb("shell", "input", "tap", str((left + right) // 2), str((top + bottom) // 2))
            ui.steps.append({"action": "comfort-fixed-safety-action", "bounds": bounds})
            time.sleep(0.6)
            return
    raise RuntimeError("The fixed safety action is not reachable above the navigation")


def verify_photo_preview():
    for attempt in range(10):
        root = dump(f"bucket-photo-preview-{attempt}")
        candidates = [node for node in root.iter("node")
                      if re.fullmatch(r"android\.widget\.Image(?:View)?", node.get("class", ""))
                      and ui.matches(node, r"^Dream photo \(optional\)$")]
        for node in candidates:
            if ui.usable_bounds(node, root):
                screenshot("bucket-real-photo-preview")
                ui.steps.append({"assertion": "bucket-real-photo-preview", "status": "passed",
                                 "class": node.get("class"), "bounds": ui.visible_bounds(node)})
                return
        if not any(align_partly_visible(node, root) for node in candidates):
            ui.swipe(True, root=root)
    raise RuntimeError("The chosen photo did not render as an actual image preview")


def exercise_photo_picker():
    source = output / "UsSpace-v0.12-launch.png"
    if not source.is_file() or source.read_bytes()[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError("Captured launch screenshot is unavailable for the real picker test")
    destination = "/sdcard/Download/UsSpace-photo-test.png"
    ui.adb("shell", "mkdir", "-p", "/sdcard/Download")
    pushed = ui.adb("push", str(source), destination)
    (output / "us-features-photo-push.txt").write_text(pushed)
    scan = ui.adb("shell", "am", "broadcast", "-a", "android.intent.action.MEDIA_SCANNER_SCAN_FILE",
                  "-d", "file://" + destination)
    (output / "us-features-photo-media-scan.txt").write_text(scan)
    click_control("bucket-open-photo-picker", r"^Dream photo \(optional\)$|Choose (?:a )?file|No file chosen")
    deadline = time.monotonic() + 5
    attempt = 0
    while True:
        activity = ui.adb("shell", "dumpsys", "activity", "activities")
        (output / f"us-features-photo-picker-activity-{attempt}.txt").write_text(activity)
        component = ui.resumed_component(activity)
        foreground = component.split("/", 1)[0]
        if foreground.endswith("documentsui"):
            (output / "us-features-photo-picker-activity.txt").write_text(activity)
            break
        if component and (foreground != ui.PACKAGE or not component.endswith(".MainActivity")):
            raise RuntimeError("Unexpected activity while opening the photo picker: " + component)
        if time.monotonic() >= deadline:
            raise RuntimeError("The real Android document picker did not become foreground within five seconds")
        attempt += 1
        time.sleep(0.4)
    screenshot("bucket-system-photo-picker")
    # ACTION_OPEN_DOCUMENT starts at Recents on a fresh emulator. Use the
    # standard DocumentsUI drawer to select Downloads, then the actual file.
    ui.click("bucket-photo-picker-roots", r"^Show roots$")
    ui.click("bucket-photo-picker-downloads", r"^Downloads$")
    verify("bucket-photo-picker-file", r"UsSpace-photo-test\.png")
    ui.click("bucket-photo-picker-select-file", r"^UsSpace-photo-test\.png$")
    # This production notice is set only after WebView decodes the selected PNG
    # and its real canvas JPEG result passes the attachment format/size checks.
    scroll_to_heading("bucket-after-photo-heading", r"^Our Bucket List$")
    verify("bucket-jpeg-compression-completed", r"Photo ready on this phone")
    verify_photo_preview()
    verify("bucket-photo-kept-local-until-save", r"Remove photo")
    ui.steps.append({"assertion": "bucket-picked-photo-without-saving-or-uploading", "status": "passed"})
    report["real_photo_picker"] = "passed"


def return_from_sign_in():
    launch = ui.adb("shell", "am", "start", "-W", "-n", ui.PACKAGE + "/.MainActivity")
    (output / "us-features-return-to-app.txt").write_text(launch)
    time.sleep(0.8)
    providers = {
        "com.google.android.gms", "com.google.android.gsf.login", "com.android.credentialmanager",
        "com.android.permissioncontroller", "com.google.android.permissioncontroller",
        "com.android.settings", "com.google.android.settings", "android",
    }
    for attempt in range(5):
        activity = ui.adb("shell", "dumpsys", "activity", "activities")
        (output / f"us-features-return-activity-{attempt}.txt").write_text(activity)
        component = ui.resumed_component(activity)
        if component.startswith(ui.PACKAGE + "/") and component.endswith(".MainActivity"):
            (output / "us-features-start-activity.txt").write_text(activity)
            ui.steps.append({"assertion": "return-from-sign-in", "status": "passed",
                             "provider_back_presses": attempt, "component": component})
            return
        foreground = component.split("/", 1)[0]
        if foreground not in providers:
            raise RuntimeError("Unexpected activity while returning from sign-in: " + component)
        if attempt == 4:
            break
        # am start can leave Google's MinuteMaidActivity at the top of the same
        # task. Cancel only the known provider flow; never authenticate or clear
        # app data. The following probe must see the actual MainActivity.
        dump(f"provider-cancel-{attempt}")
        ui.adb("shell", "input", "keyevent", "4")
        time.sleep(1)
    raise RuntimeError("MainActivity did not resume after four provider cancellation attempts")


SAD_PHRASES = (
    "Hey love, you don’t have to be okay all the time.",
    "If I were there, I’d just hold you quietly.",
    "This day is heavy, but it won’t stay this heavy forever.",
    "Rest first; we can figure the rest out later.",
    "You are still deeply loved on your low days.",
    "You don’t need to explain everything right now. I’m here.",
    "Be gentle with yourself today, please.",
    "You’re allowed to have a difficult day without calling it a bad life.",
)
sad_pattern = "|".join(re.escape(value) for value in SAD_PHRASES)


def run():
    # The prior sign-in smoke intentionally leaves Google's account UI open.
    # Return to MainActivity; never authenticate or send a message in this test.
    return_from_sign_in()

    # WebView exposes each hub button as one accessibility node containing its
    # title, subtitle and action. Match the unique title/action together.
    open_from_us("comfort", r"\bNeed Me\?.*Come sit with me\s*→")
    verify("comfort-title", r"A little space from Al, whenever you need it")
    ui.click("comfort-sad", r"^Sad$")
    verify("comfort-from-al", r"From Al\s*❤️")
    phrase_root = verify("comfort-sad-phrase", sad_pattern)
    first_phrase = next(value for value in SAD_PHRASES if value in text(phrase_root))
    ui.click("comfort-another", r"^Another little word$")
    another_root = verify("comfort-another-phrase", sad_pattern)
    second_phrase = next(value for value in SAD_PHRASES if value in text(another_root))
    if first_phrase == second_phrase:
        raise RuntimeError("The actual comfort UI immediately repeated its phrase")
    ui.steps.append({"assertion": "comfort-avoids-immediate-repeat", "status": "passed"})

    ui.click("comfort-voice", r"^Play voice note$")
    verify("comfort-real-voice-placeholder", r"No recording has been added yet")
    ui.click("comfort-ground", r"^Ground me$")
    verify("ground-jaw-shoulders", r"Unclench your jaw\. Let your shoulders drop")
    ui.click("ground-start-breathing", r"^Start slow breathing$")
    verify("ground-breathing-started", r"Breathe in gently|Slowly breathe out")
    ui.click("ground-pause-breathing", r"^Pause breathing$")
    verify("ground-breathing-paused", r"Unclench your jaw\. Let your shoulders drop")
    for index, prompt in enumerate((
        r"things you can see", r"things you can feel", r"things you can hear",
        r"things you can smell", r"thing you can taste",
    )):
        if index:
            ui.click(f"ground-next-{index}", r"^Next\s*→$")
        verify(f"ground-sense-{5-index}", prompt)

    activate_safety()
    safety = verify("safety-replaces-comfort", r"Your safety comes first")
    absent(safety, "safety-no-persona-card", r"From Al\s*❤️|Play voice note|" + sad_pattern)
    verify("safety-contact-al", r"^Contact Al$")
    verify("safety-contact-trusted", r"Contact a trusted person")
    choose_country_india()
    verify("safety-local-emergency", r"Call emergency services\s*·\s*112")
    verify("safety-local-crisis", r"Call Tele-MANAS\s*·\s*14416")
    verify("safety-global-crisis-directory", r"Find local crisis support")
    # Verify contact setup without dialing anyone or opening an external site.
    scroll_to_heading("safety-contact-return-to-top", r"^Your safety comes first$")
    ui.click("safety-trusted-person", r"^Contact a trusted person$")
    verify("safety-local-contact-setup", r"Trusted person[’']s phone number")
    ui.click("safety-explicit-safe-return", r"^I[’']m somewhere safe now\s*·\s*return$")

    open_from_us("letters", r"\bOpen When(?:…|\.\.\.).*Find your envelope\s*→")
    locked = verify("letters-anonymous-locked", r"Pair your two accounts first")
    verify("letters-pairing-action", r"Open pairing on Home")
    absent(locked, "letters-no-drafts-or-recipients", r"Save private draft|Publish (?:this )?letter|"
           r"This is Al[’']s account|This is Yashika[’']s account|Dear Yashika")
    if any(node.get("class", "").endswith("EditText") and ui.visible_bounds(node)
           for node in locked.iter("node")):
        raise RuntimeError("The logged-out letters screen exposed an editor")
    ui.steps.append({"assertion": "letters-no-anonymous-editor", "status": "passed"})

    open_from_us("bucket", r"\bBucket List\b.*Our next little adventure\s*→")
    verify("bucket-pairing-guidance", r"Pair your two phones to add and share here")
    verify("bucket-real-empty-state", r"Our someday starts here")
    ui.click("bucket-editor", r"Add a dream$")
    verify("bucket-new-form", r"What shall we dream of")
    verify("bucket-state-category-fields", r"Category")
    verify("bucket-date-location-fields", r"Location")
    verify("bucket-photo-field", r"Dream photo")
    exercise_photo_picker()
    verify("bucket-save-action", r"Save to our bucket list")
    ui.click("bucket-cancel-local-form", r"^Cancel$")

    open_from_us("jar", r"\bAppreciation Jar\b.*Open our jar\s*→")
    verify("jar-pairing-guidance", r"Pair your two phones to add and share here")
    verify("jar-editor", r"Leave a little appreciation")
    verify("jar-add-action", r"Add to our jar")
    verify("jar-real-empty-state", r"A jar for our little joys")
    report["status"] = "passed"
    print("ANDROID_US_FEATURES_TEST_PASSED: comfort, voice placeholder, breathing, five senses, "
          "safety contacts/crisis options, private letters lock, bucket editor, real photo picker "
          "and JPEG preview, and appreciation jar")


try:
    run()
except Exception as error:
    report["error"] = str(error)
    try:
        dump("failure")
        screenshot("failure")
        (output / "us-features-failure-activity.txt").write_text(
            ui.adb("shell", "dumpsys", "activity", "activities"))
    except Exception as evidence_error:
        report["evidence_error"] = str(evidence_error)
    raise
finally:
    (output / "us-features-ui-result.json").write_text(json.dumps(report, indent=2) + "\n")
