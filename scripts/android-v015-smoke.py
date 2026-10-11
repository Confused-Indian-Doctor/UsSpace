#!/usr/bin/env python3
"""Verify v0.15 using real Android input, accessibility and screenshot pixels.

No JavaScript evaluation, application-private file access, fabricated identities,
clock injection or debug navigation is used. Test dates are edited in the same
Relationship settings control available to users and restored before finishing.
"""
import calendar
import datetime as dt
import importlib.util
import json
import pathlib
import re
import time

# Import guarded existing helpers; they parse the same required device CLI flags.
# The PNG decoder reads actual screencap pixels, not implementation state.
helper_path = pathlib.Path(__file__).with_name("android-v014-smoke.py")
spec = importlib.util.spec_from_file_location("usspace_v015_android_helpers", helper_path)
v014 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v014)
ui = v014.ui
output = ui.output
original_dump = v014.original_dump
original_safe_region = ui.safe_region
OFFICIAL_DATE = dt.date(2023, 3, 25)
report = {
    "status": "failed",
    "package": ui.PACKAGE,
    "scope": "actual anonymous Android UI, device-local calendar date and rendered pixels",
    "authenticated_account_success_verified": False,
    "paired_relationship_sync_verified_on_two_accounts": False,
    "application_private_data_read": False,
    "user_data_cleared": False,
    "test_clock_injected": False,
    "steps": ui.steps,
}


def dump(label, prefix="v015"):
    # Activity recreation may briefly leave no idle accessibility window. The
    # original helper removes old XML before EVERY attempt; no stale dump passes.
    for attempt in range(3):
        try:
            root = original_dump(label, prefix=prefix)
            dump.last_path = output / f"{prefix}-{label}.xml"
            return root
        except (ui.subprocess.CalledProcessError, ui.subprocess.TimeoutExpired,
                ui.ET.ParseError) as error:
            command = getattr(error, "cmd", [])
            if not isinstance(error, ui.ET.ParseError) and not (
                    "uiautomator" in command or
                    ("cat" in command and "/sdcard/usspace-window.xml" in command)):
                raise
            report.setdefault("accessibility_dump_retries", []).append({
                "label": label, "attempt": attempt + 1, "error": str(error)[:500],
                "fresh_xml_required": True,
            })
            if attempt == 2:
                raise
            time.sleep(0.8 + 0.4 * attempt)


ui.dump = dump


def safe_region(root, allow_tabs=False):
    top, bottom = original_safe_region(root, allow_tabs=allow_tabs)
    # The sheet sits above the sticky header/footer. WebView still exposes those
    # background landmarks in accessibility XML; they do not obscure the modal.
    # Bind the exception to the actual bounded sheet ancestor, not a guessed tap.
    parents = {child: parent for parent in root.iter() for child in parent}
    for title in root.iter("node"):
        if not ui.matches(title, r"^(?:Our space|Leave a note\s*💌|Add a memory)$"):
            continue
        parent = parents.get(title)
        while parent is not None:
            bounds = ui.visible_bounds(parent)
            if (bounds and parent.get("class") == "android.view.View"
                    and bounds[2] - bounds[0] >= ui.width * .9
                    and ui.height * .15 < bounds[3] - bounds[1] < ui.height * .97):
                return bounds[1] + 8, bounds[3] - 8
            parent = parents.get(parent)
    # Need Me's real fixed safety action obscures content above the footer.
    overlays = [ui.visible_bounds(node) for node in root.iter("node")
                if ui.visible_bounds(node) and ui.matches(node, r"^I don[’']t feel safe$")
                and ui.visible_bounds(node)[1] > ui.height / 2]
    if overlays:
        bottom = min(bottom, min(bounds[1] for bounds in overlays) - 8)
    return top, bottom


ui.safe_region = safe_region


def visible_text(root, safe=True):
    return "\n".join(ui.text_of(node) for node in root.iter("node")
                     if (ui.usable_bounds(node, root) if safe else ui.visible_bounds(node)))


def passed(label, **details):
    ui.steps.append({"assertion": label, "status": "passed", **details})


def screenshot(label):
    png = ui.adb("exec-out", "screencap", "-p", binary=True)
    if png[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError("Android evidence screenshot is not a PNG")
    (output / f"UsSpace-v015-{label}.png").write_bytes(png)
    return png


def align(node, root, allow_tabs=False):
    bounds = ui.visible_bounds(node)
    if not bounds:
        return False
    top, bottom = ui.safe_region(root, allow_tabs=allow_tabs)
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


def find(label, pattern, class_name=None, interactive=False, enabled=None,
         direction=True, allow_tabs=False):
    classes = ((class_name,) if isinstance(class_name, str) else class_name)
    for attempt in range(12):
        root = dump(f"{label}-{attempt}")
        candidates = [node for node in root.iter("node") if ui.matches(node, pattern)
                      and (classes is None or node.get("class") in classes)
                      and (not interactive or node.get("clickable") == "true")
                      and (enabled is None or node.get("enabled", "true") == str(enabled).lower())]
        for node in candidates:
            if ui.usable_bounds(node, root, allow_tabs=allow_tabs):
                return root, node
        if any(align(node, root, allow_tabs=allow_tabs) for node in candidates):
            continue
        top, _ = ui.safe_region(root, allow_tabs=allow_tabs)
        above = any(ui.visible_bounds(node) and ui.visible_bounds(node)[1] < top
                    for node in candidates)
        ui.swipe(False if above else direction, root=root)
    raise RuntimeError("v0.15 actual visible element not found: " + label)


def tap(label, pattern, class_name=None, allow_tabs=False):
    root, node = find(label, pattern, class_name=class_name, interactive=True,
                      enabled=True, allow_tabs=allow_tabs)
    bounds = ui.usable_bounds(node, root, allow_tabs=allow_tabs)
    left, top, right, bottom = bounds
    ui.adb("shell", "input", "tap", str((left + right) // 2), str((top + bottom) // 2))
    ui.steps.append({"action": label, "matched": ui.text_of(node), "bounds": bounds})
    time.sleep(0.45)


def verify(label, pattern, capture=True):
    root, node = find(label, pattern, direction=False if "Together for" in pattern else True)
    (output / f"v015-{label}.txt").write_text(visible_text(root))
    if capture:
        screenshot(label)
    passed(label, matched=ui.text_of(node), bounds=ui.usable_bounds(node, root),
           accessibility_evidence_file=dump.last_path.name,
           screenshot_evidence_file=f"UsSpace-v015-{label}.png" if capture else None)
    return root


def absent(root, label, pattern):
    if re.search(pattern, visible_text(root, safe=False), re.IGNORECASE | re.MULTILINE):
        raise RuntimeError("v0.15 unexpected visible state: " + label)
    passed(label)


def back(label):
    ui.adb("shell", "input", "keyevent", "KEYCODE_BACK")
    ui.steps.append({"action": label, "input": "Android KEYCODE_BACK"})
    time.sleep(0.45)


def home(label="go-home"):
    ui.click(label, r"(?:^| )Home$", allow_nav=True)
    return verify(label + "-together-visible", r"\bTogether for\b", capture=False)


def open_settings(label):
    root = dump(label + "-header")
    for node in root.iter("node"):
        bounds = ui.visible_bounds(node)
        if (bounds and ui.matches(node, r"^(?:⚙️?|Settings)$")
                and node.get("class") == "android.widget.Button"
                and node.get("clickable") == "true"
                and node.get("enabled", "true") == "true"
                and bounds[3] < ui.height / 3):
            left, top, right, bottom = bounds
            ui.adb("shell", "input", "tap", str((left + right) // 2), str((top + bottom) // 2))
            ui.steps.append({"action": label, "matched": ui.text_of(node), "bounds": bounds,
                             "legitimate_fixed_header_control": True})
            time.sleep(0.45)
            # Modal scroll position survives closing. A later date edit can
            # reopen midway down the sheet, so seek its title upward first.
            sheet, title = find(label + "-sheet", r"^Our space$", direction=False)
            passed(label + "-sheet", matched=ui.text_of(title),
                   bounds=ui.usable_bounds(title, sheet),
                   accessibility_evidence_file=dump.last_path.name)
            return
    raise RuntimeError("The actual fixed-header settings gear is not available")


def local_date():
    raw = ui.adb("shell", "date", "+%Y-%m-%d").strip()
    current = dt.date.fromisoformat(raw)
    zone = ui.adb("shell", "getprop", "persist.sys.timezone").strip()
    sequence = len(report.get("device_local_dates", []))
    date_file = f"v015-device-local-date-{sequence}.txt"
    zone_file = f"v015-device-time-zone-{sequence}.txt"
    (output / date_file).write_text(raw + "\n")
    (output / zone_file).write_text(zone + "\n")
    report.setdefault("device_local_dates", []).append({
        "date": raw, "time_zone": zone,
        "date_evidence_file": date_file, "time_zone_evidence_file": zone_file,
        "source": "Android shell date; device clock not changed",
    })
    return current


def breakdown(start, today):
    """Independent Gregorian anniversary/month-anchor calculation for evidence."""
    if today < start:
        return 0, 0, 0
    years = today.year - start.year
    anniversary = dt.date(today.year, start.month,
                          min(start.day, calendar.monthrange(today.year, start.month)[1]))
    if anniversary > today:
        years -= 1
    anchor_year = start.year + years
    annual = dt.date(anchor_year, start.month,
                     min(start.day, calendar.monthrange(anchor_year, start.month)[1]))
    months = (today.year - annual.year) * 12 + today.month - annual.month
    def month_anchor(count):
        year, month0 = divmod(annual.year * 12 + annual.month - 1 + count, 12)
        return dt.date(year, month0 + 1,
                       min(annual.day, calendar.monthrange(year, month0 + 1)[1]))
    if month_anchor(months) > today:
        months -= 1
    return years, months, (today - month_anchor(months)).days


def counter(label, start=OFFICIAL_DATE, expected_total=None, check_breakdown=False):
    today = local_date()
    expected = max(0, (today - start).days) if expected_total is None else expected_total
    root, card = find(label, r"\bTogether for\b", class_name="android.widget.Button",
                      interactive=True, enabled=True, direction=False)
    value = ui.text_of(card)
    match = re.search(r"\bTogether for\s+([\d][\d,\s\u00a0\u202f]*)\s+days?\b", value, re.IGNORECASE)
    total = int(re.sub(r"\D", "", match.group(1))) if match else None
    if total != expected:
        raise RuntimeError(f"Together card total differs from actual device date: expected {expected}, text={value!r}")
    month_name = calendar.month_name[start.month]
    expected_since = f"Since {start.day} {month_name} {start.year}"
    if expected_since.lower() not in visible_text(root, safe=False).lower():
        raise RuntimeError("Together card did not display its actual saved start date: " + expected_since)
    details = {"actual_total_days": total, "expected_total_days": expected,
               "device_date": today.isoformat(), "relationship_date": start.isoformat(),
               "matched": value, "bounds": ui.usable_bounds(card, root),
               "accessibility_evidence_file": dump.last_path.name,
               "screenshot_evidence_file": f"UsSpace-v015-{label}.png",
               "date_evidence_file": report["device_local_dates"][-1]["date_evidence_file"]}
    if check_breakdown:
        years, months, days = breakdown(start, today)
        pattern = rf"\b{years}\s+years?\s*·\s*{months}\s+months?\s*·\s*{days}\s+days?\b"
        if not re.search(pattern, visible_text(root, safe=False), re.IGNORECASE):
            raise RuntimeError("Together card calendar breakdown does not match: " + pattern)
        details["calendar_breakdown"] = {"years": years, "months": months, "days": days}
    screenshot(label)
    (output / f"v015-{label}.txt").write_text(visible_text(root))
    passed(label, **details)
    return root, card


def open_timeline(label):
    tap(label, r"\bTogether for\b", class_name="android.widget.Button")
    return verify(label + "-timeline", r"^(?:Our relationship timeline|Relationship timeline)$")


def restart(label, force_stop=True):
    if force_stop:
        ui.adb("shell", "am", "force-stop", ui.PACKAGE)
    result = ui.adb("shell", "am", "start", "-W", "-n", ui.PACKAGE + "/.MainActivity")
    (output / f"v015-{label}-launch.txt").write_text(result)
    time.sleep(1.2)
    activity = ui.adb("shell", "dumpsys", "activity", "activities")
    (output / f"v015-{label}-activity.txt").write_text(activity)
    component = ui.resumed_component(activity)
    if not component.startswith(ui.PACKAGE + "/") or not component.endswith(".MainActivity"):
        raise RuntimeError("MainActivity did not resume after normal relaunch: " + component)
    if not ui.adb("shell", "pidof", ui.PACKAGE).strip():
        raise RuntimeError("The app exited after relaunch")
    passed(label, component=component, force_stopped=force_stop, user_data_cleared=False)
    verify(label + "-returns-home", r"\bTogether for\b", capture=False)


def enter_relationship_date(label, date_text):
    root, editor = find(label + "-editor", r"Relationship start date|DD/MM/YYYY|\b\d{2}/\d{2}/\d{4}\b",
                        class_name="android.widget.EditText", interactive=True, enabled=True)
    left, top, right, bottom = ui.usable_bounds(editor, root)
    ui.adb("shell", "input", "tap", str((left + right) // 2), str((top + bottom) // 2))
    time.sleep(0.25)
    # Real key events clear this ten-character field. No private storage or
    # JavaScript state is written, and shell interpolation is never used.
    ui.adb("shell", "input", "keyevent", "KEYCODE_MOVE_END")
    ui.adb("shell", "input", "keyevent", *(["KEYCODE_DEL"] * 20))
    ui.adb("shell", "input", "text", date_text)
    time.sleep(0.35)
    edited = dump(label + "-typed")
    fields = [node for node in edited.iter("node") if node.get("class") == "android.widget.EditText"
              and date_text in ui.text_of(node)]
    if not fields:
        raise RuntimeError("Actual Android relationship input did not contain the typed date")
    passed(label + "-real-input", typed_date=date_text, source="Android input key events")
    ime = ui.adb("shell", "dumpsys", "input_method")
    (output / f"v015-{label}-input-method.txt").write_text(ime)
    if re.search(r"(?:mInputShown|isInputViewShown|mIsInputViewShown)\s*[=:]\s*true", ime):
        back(label + "-close-keyboard-first")
        still_open = dump(label + "-after-keyboard-back")
        if not any(node.get("class") == "android.widget.EditText" and date_text in ui.text_of(node)
                   for node in still_open.iter("node")):
            raise RuntimeError("Keyboard Back closed the relationship settings prematurely")
        passed(label + "-keyboard-back-preserves-settings")


def edit_date(label, value, valid=True):
    open_settings(label + "-settings")
    verify(label + "-relationship-section", r"^Relationship$", capture=False)
    enter_relationship_date(label, value)
    tap(label + "-save", r"^Save relationship date$", class_name="android.widget.Button")
    time.sleep(0.6)
    if valid:
        # The relationship save is independent of the legacy Save for other
        # settings. It must persist before closing or restarting the activity.
        passed(label + "-save-pressed", value=value)
    else:
        verify(label + "-invalid-feedback", r"Enter a real date as DD/MM/YYYY, between 1900 and 2200")
    back(label + "-close-settings")
    closed = dump(label + "-closed")
    absent(closed, label + "-settings-closed", r"^Save relationship date$|^Appearance$")


def theme_pixels(label, dark, landmark):
    for attempt in range(4):
        root = dump(f"{label}-pixels-{attempt}")
        accessibility_file = dump.last_path.name
        png = screenshot(label + f"-probe-{attempt}")
        mean, crop = v014.brightness(png)
        cards = []
        if re.search(r"Together for", landmark, re.IGNORECASE):
            cards = [node for node in root.iter("node")
                     if node.get("class") == "android.widget.Button"
                     and ui.matches(node, r"\bTogether for\b")
                     and ui.usable_bounds(node, root)]
            if not cards:
                time.sleep(0.6)
                continue
            left, top, right, bottom = ui.usable_bounds(cards[0], root)
            margin_x = max(3, (right - left) // 25)
            margin_y = max(3, (bottom - top) // 25)
            crop = [left + margin_x, top + margin_y, right - margin_x, bottom - margin_y]
            width, height, channels, rows = v014.decode_png(png)
            if (width, height) != (ui.width, ui.height):
                raise RuntimeError("Theme screenshot dimensions differ from Android viewport")
            values = []
            for y in range(crop[1], crop[3], 3):
                for x in range(crop[0], crop[2], 3):
                    pixel = x * channels
                    values.append(.2126 * rows[y][pixel] + .7152 * rows[y][pixel + 1]
                                  + .0722 * rows[y][pixel + 2])
            if not values:
                raise RuntimeError("Actual Together card crop contains no screenshot pixels")
            mean = sum(values) / len(values)
        landmarks = [node for node in root.iter("node")
                     if ui.visible_bounds(node) and ui.matches(node, landmark)]
        rendered = bool(landmarks)
        if rendered and (mean < 130 if dark else mean > 170):
            (output / f"UsSpace-v015-{label}.png").write_bytes(png)
            passed(label, pixel_mean_luminance=round(mean, 3), pixel_crop=crop,
                   expected="dark < 130" if dark else "light > 170",
                   actual_app_landmark_required=True,
                   crop_source="actual accessible Together card bounds" if cards
                   else "actual viewport content region",
                   accessible_card_bounds=ui.usable_bounds(cards[0], root) if cards else None,
                   landmark_matched=ui.text_of(landmarks[0]),
                   landmark_bounds=ui.visible_bounds(landmarks[0]),
                   accessibility_evidence_file=accessibility_file,
                   screenshot_evidence_file=f"UsSpace-v015-{label}.png")
            return
        time.sleep(0.6)
    raise RuntimeError(f"Actual {label} pixels did not match chosen theme; mean luminance {mean:.2f}")


def choose_theme(label, choice):
    open_settings(label + "-settings")
    tap(label + "-choice", "^" + re.escape(choice) + "$",
        class_name=("android.widget.Button", "android.widget.ToggleButton"))
    back(label + "-close-settings")


def set_system_night(label, enabled):
    result = ui.adb("shell", "cmd", "uimode", "night", "yes" if enabled else "no")
    (output / f"v015-{label}-uimode.txt").write_text(result)
    restart(label + "-relaunch")


def section(label, parent, entry, heading):
    ui.click(label + "-parent", r"(?:^| )" + re.escape(parent) + "$", allow_nav=True)
    tap(label + "-open", entry)
    verify(label + "-real-section", heading)


def back_home(label):
    back(label + "-android-back")
    verify(label + "-returned-home", r"\bTogether for\b", capture=False)
    # A second dump verifies that one Back settled on Home rather than briefly
    # appearing there before a duplicate navigation to another page.
    time.sleep(0.3)
    root = dump(label + "-settled-home")
    if not any(ui.usable_bounds(node, root) and ui.matches(node, r"\bTogether for\b")
               for node in root.iter("node")):
        raise RuntimeError("Back did not settle on Home: " + label)
    passed(label + "-no-double-navigation")


def test_major_back_routes():
    for tab, heading in (("Today", r"^Daily check-in$"), ("Us", r"^The two of you$"),
                         ("Life", r"^The practical side$")):
        ui.click("back-" + tab.lower() + "-tab", r"(?:^| )" + tab + "$", allow_nav=True)
        verify("back-" + tab.lower() + "-section", heading)
        back_home("back-" + tab.lower())
    routes = (
        ("comfort", "Us", r"\bNeed Me\?.*Come sit with me\s*→", r"A little space from Al, whenever you need it"),
        ("letters", "Us", r"\bOpen When(?:…|\.\.\.).*Find your envelope\s*→", r"Pair your two accounts first"),
        ("jar", "Us", r"\bAppreciation Jar\b.*Open our jar\s*→", r"Leave a little appreciation"),
        ("bucket", "Us", r"\bBucket List\b.*Our next little adventure\s*→", r"Our someday starts here"),
        ("goals", "Us", r"\bGoals\b.*Keep each other accountable", r"^Our goals$"),
        ("notes", "Us", r"\bLove notes\b.*Small messages", r"^＋ Note$"),
        ("memories", "Us", r"\bMemories\b.*Trips, dates", r"^Our memories$"),
        ("calendar", "Life", r"\bCalendar & duty\b.*Work, teaching", r"^Shared month$"),
        ("health", "Life", r"\bHealth\b.*Steps, sleep", r"^My wellness$"),
        ("cycle", "Life", r"\bCycle\b.*Private cycle notes", r"^Cycle estimate$"),
        ("work", "Life", r"\bWork Schedule\b.*See my shifts\s*→", r"^Your private work day$"),
    )
    for label, parent, entry, heading in routes:
        section("back-" + label, parent, entry, heading)
        back_home("back-" + label)
    # The previous learning smoke leaves Script selected. Choosing Today gives
    # a meaningful main-section state, rather than masking a retained unit page.
    section("back-learn", "Us", r"\bLearn together\b.*Open offline lessons\s*→", r"^Learn Together$")
    tap("back-learn-main-today", r"^☀\s*Today$", allow_tabs=True)
    verify("back-learn-main-section", r"^Your daily practice$")
    back_home("back-learn")
    open_timeline("back-relationship-timeline")
    back_home("back-relationship-timeline")


def test_overlays_and_nested_pages():
    ui.click("settings-overlay-today-tab", r"(?:^| )Today$", allow_nav=True)
    verify("settings-overlay-today-before", r"^Daily check-in$", capture=False)
    open_settings("settings-overlay-open-from-today")
    back("settings-overlay-first-back")
    root = verify("settings-overlay-keeps-today", r"^Daily check-in$")
    absent(root, "settings-overlay-first-back-does-not-jump-home", r"\bTogether for\b|^Our space$")
    back_home("settings-overlay-second-back")

    section("note-overlay", "Us", r"\bLove notes\b.*Small messages", r"^＋ Note$")
    tap("note-overlay-open", r"^＋ Note$")
    verify("note-overlay-visible", r"^Leave a note\s*💌$")
    back("note-overlay-first-back")
    root = verify("note-overlay-keeps-notes", r"^＋ Note$", capture=False)
    absent(root, "note-overlay-closed-before-route-change", r"^Leave a note\s*💌$|\bTogether for\b")
    back_home("note-overlay-second-back")

    section("memory-overlay", "Us", r"\bMemories\b.*Trips, dates", r"^Our memories$")
    tap("memory-overlay-open", r"^＋ Memory$")
    verify("memory-overlay-visible", r"^Add a memory$")
    back("memory-overlay-first-back")
    root = verify("memory-overlay-keeps-memories", r"^Our memories$", capture=False)
    absent(root, "memory-overlay-closed-before-route-change", r"^Add a memory$|\bTogether for\b")
    back_home("memory-overlay-second-back")

    section("bucket-nested", "Us", r"\bBucket List\b.*Our next little adventure\s*→", r"Our someday starts here")
    tap("bucket-nested-editor-open", r"Add a dream$")
    verify("bucket-nested-editor-visible", r"What shall we dream of")
    back("bucket-nested-first-back")
    root = verify("bucket-nested-keeps-bucket", r"Add a dream$", capture=False)
    absent(root, "bucket-nested-editor-closed-before-home", r"What shall we dream of|\bTogether for\b")
    back_home("bucket-nested-second-back")

    section("work-nested", "Life", r"\bWork Schedule\b.*See my shifts\s*→", r"^Your private work day$")
    tap("work-nested-instructions-open", r"^Microsoft setup instructions$")
    verify("work-nested-instructions-visible", r"app\.usspace\.couple\.v012://oauth2redirect")
    back("work-nested-first-back")
    root = verify("work-nested-keeps-work", r"^Your private work day$", capture=False)
    absent(root, "work-nested-instructions-closed-before-home", r"app\.usspace\.couple\.v012://oauth2redirect|\bTogether for\b")
    back_home("work-nested-second-back")

    section("learn-nested", "Us", r"\bLearn together\b.*Open offline lessons\s*→", r"^Learn Together$")
    tap("learn-nested-today", r"^☀\s*Today$", allow_tabs=True)
    tap("learn-nested-continue-unit", r"^Continue lesson\s*→$")
    verify("learn-nested-unit-visible", r"^← All units$")
    tap("learn-nested-open-checkpoint", r"^Start checkpoint\s*→$")
    verify("learn-nested-checkpoint-visible", r"^Unit checkpoint$")
    back("learn-nested-checkpoint-back")
    root = verify("learn-nested-checkpoint-keeps-unit", r"^← All units$", capture=False)
    absent(root, "learn-nested-checkpoint-popped-only-one-page", r"^Unit checkpoint$|\bTogether for\b")
    back("learn-nested-first-back")
    root = verify("learn-nested-keeps-course-list", r"(?:Kannada|Malayalam) beginner course", capture=False)
    absent(root, "learn-nested-unit-closed-before-home", r"^← All units$|\bTogether for\b")
    back_home("learn-nested-second-back")


def test_home_exit():
    home("exit-home-tab")
    back("home-back-normal-exit")
    component = ""
    for attempt in range(6):
        activity = ui.adb("shell", "dumpsys", "activity", "activities")
        (output / f"v015-home-exit-activity-{attempt}.txt").write_text(activity)
        component = ui.resumed_component(activity)
        if component and not component.startswith(ui.PACKAGE + "/"):
            break
        time.sleep(0.5)
    else:
        raise RuntimeError("Android Back from Home did not exit the foreground app: " + component)
    screenshot("home-back-exited")
    passed("home-back-exits-normally", resumed_component=component,
           process_death_required=False, native_activity_no_longer_foreground=True)
    restart("home-normal-reopen-after-back", force_stop=False)
    counter("official-date-persists-after-home-exit", check_breakdown=True)


def test_home_quick_actions():
    home("home-actions-start")
    verify("home-next-visit-preserved", r"^Next visit$")
    tap("home-quick-ping", r"^(?:♥\s*)?Ping$", class_name="android.widget.Button")
    # This creates a real local note in the anonymous app. No partner delivery
    # or background push is claimed; that requires two authenticated accounts.
    verify("home-ping-stays-on-home", r"\bTogether for\b", capture=False)
    passed("home-ping-no-fabricated-delivery", authenticated_delivery_verified=False)

    tap("home-quick-send-note", r"^(?:✉\s*)?Send note$", class_name="android.widget.Button")
    verify("home-send-note-real-dialog", r"^Leave a note\s*💌$")
    back("home-send-note-dialog-back")
    root = verify("home-send-note-dialog-preserves-home", r"\bTogether for\b", capture=False)
    absent(root, "home-send-note-dialog-closed", r"^Leave a note\s*💌$")

    tap("home-quick-add-memory", r"^(?:✧\s*)?Add memory$", class_name="android.widget.Button")
    verify("home-add-memory-real-dialog", r"^Add a memory$")
    back("home-add-memory-dialog-back")
    root = verify("home-add-memory-dialog-preserves-home", r"\bTogether for\b", capture=False)
    absent(root, "home-add-memory-dialog-closed", r"^Add a memory$")

    tap("home-quick-date-idea", r"^(?:☾\s*)?Date idea$", class_name="android.widget.Button")
    verify("home-date-idea-reveals-real-card", r"^Remote date jar$")
    home("home-return-from-date-idea")

    tap("home-quick-need-me", r"^(?:♡\s*)?Need Me\?$", class_name="android.widget.Button")
    verify("home-need-me-opens-comfort", r"A little space from Al, whenever you need it")
    back_home("home-need-me-back")

    tap("home-quick-call", r"^(?:☎\s*)?Call$", class_name="android.widget.Button")
    verify("home-call-honest-contact-setup", r"Al’s phone number")
    verify("home-call-contacts-private", r"Saved on this phone for this account\. Never shared with your partner")
    activity = ui.adb("shell", "dumpsys", "activity", "activities")
    (output / "v015-home-call-activity.txt").write_text(activity)
    component = ui.resumed_component(activity)
    if not component.startswith(ui.PACKAGE + "/"):
        raise RuntimeError("Call launched an external app without a configured real contact")
    passed("home-call-does-not-fake-contact-or-place-call", component=component)
    back_home("home-call-back")


def run():
    home("initial-home")
    root, card = counter("official-live-counter", check_breakdown=True)
    bounds = ui.usable_bounds(card, root)
    if bounds[1] > ui.height / 2:
        raise RuntimeError("Together card is not prominent in the initial Home viewport")
    passed("together-card-prominent-near-top", bounds=bounds, viewport=[ui.width, ui.height])
    open_timeline("together-card-opens-timeline")
    verify("timeline-default-relationship-date", r"25 March 2023")
    back_home("timeline-to-home")

    edit_date("relationship-edit", "24/03/2023")
    counter("edited-date-live-counter", start=dt.date(2023, 3, 24), check_breakdown=True)
    restart("relationship-edit-force-stop")
    counter("edited-date-persists-after-restart", start=dt.date(2023, 3, 24), check_breakdown=True)
    edit_date("relationship-restore-before-milestones", "25/03/2023")
    counter("relationship-official-date-restored", check_breakdown=True)

    today = local_date()
    milestone_start = today - dt.timedelta(days=1000)
    edit_date("relationship-1000-day-milestone", milestone_start.strftime("%d/%m/%Y"))
    counter("1000-day-live-total", start=milestone_start, expected_total=1000)
    verify("1000-day-celebratory-state", r"1[,.\s]?000 days together\s*❤️")
    anniversary_start = dt.date(today.year - 1, today.month,
                                min(today.day, calendar.monthrange(today.year - 1, today.month)[1]))
    edit_date("relationship-anniversary", anniversary_start.strftime("%d/%m/%Y"))
    counter("anniversary-live-total", start=anniversary_start)
    verify("anniversary-celebratory-state", r"Another year of us\s*❤️")
    future = today + dt.timedelta(days=1)
    edit_date("relationship-future-date", future.strftime("%d/%m/%Y"))
    counter("future-date-no-negative-count", start=future, expected_total=0)
    verify("future-date-honest-state", r"Starts soon")
    edit_date("relationship-invalid-date", "31/02/2023", valid=False)
    counter("invalid-date-does-not-change-saved-date", start=future, expected_total=0)
    edit_date("relationship-restore-official-date", "25/03/2023")
    counter("official-date-restored-after-date-tests", check_breakdown=True)
    report["official_relationship_date_restored"] = True

    choose_theme("relationship-light", "Light")
    theme_pixels("together-light", False, r"\bTogether for\b")
    open_timeline("timeline-light-open")
    theme_pixels("timeline-light", False, r"^(?:Our relationship timeline|Relationship timeline)$")
    back_home("timeline-light-back")
    choose_theme("relationship-dark", "Dark")
    theme_pixels("together-dark", True, r"\bTogether for\b")
    open_timeline("timeline-dark-open")
    theme_pixels("timeline-dark", True, r"^(?:Our relationship timeline|Relationship timeline)$")
    back_home("timeline-dark-back")
    restart("relationship-dark-and-date-restart")
    theme_pixels("together-dark-persists", True, r"\bTogether for\b")
    counter("official-date-and-dark-survive-restart", check_breakdown=True)
    choose_theme("relationship-system", "System")
    set_system_night("relationship-system-dark", True)
    theme_pixels("together-system-dark", True, r"\bTogether for\b")
    open_timeline("timeline-system-dark-open")
    theme_pixels("timeline-system-dark", True, r"^(?:Our relationship timeline|Relationship timeline)$")
    back_home("timeline-system-dark-back")
    set_system_night("relationship-system-light", False)
    theme_pixels("together-system-light", False, r"\bTogether for\b")
    open_timeline("timeline-system-light-open")
    theme_pixels("timeline-system-light", False, r"^(?:Our relationship timeline|Relationship timeline)$")
    back_home("timeline-system-light-back")

    test_home_quick_actions()
    test_major_back_routes()
    test_overlays_and_nested_pages()
    test_home_exit()
    report["status"] = "passed"
    print("ANDROID_V015_UI_TEST_PASSED: live relationship counter, real edits/restart, milestones, rendered themes, section/modal/nested Back and Home exit")


if __name__ == "__main__":
    try:
        run()
    except Exception as error:
        report["error"] = str(error)
        try:
            screenshot("failure")
            dump("failure")
            (output / "v015-failure-activity.txt").write_text(
                ui.adb("shell", "dumpsys", "activity", "activities"))
        except Exception as capture_error:
            report["failure_capture_error"] = str(capture_error)
        raise
    finally:
        try:
            ui.adb("shell", "cmd", "uimode", "night", "no")
        except Exception as cleanup_error:
            report["system_mode_cleanup_error"] = str(cleanup_error)
        (output / "v015-ui-result.json").write_text(json.dumps(report, indent=2) + "\n")
