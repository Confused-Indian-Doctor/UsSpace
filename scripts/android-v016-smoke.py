#!/usr/bin/env python3
"""Exercise v0.16 recovery controls through real Android input and accessibility.

The disposable Google APIs emulator has no Galaxy Watch or Samsung export. This
suite checks actual permission/settings handoffs and honest empty/signed-out
states. It never grants health access, fabricates records, signs in, reads app
private storage, evaluates JavaScript, or claims partner push delivery.
"""
import importlib.util
import json
import pathlib
import re
import time

helper_path = pathlib.Path(__file__).with_name("android-v015-smoke.py")
spec = importlib.util.spec_from_file_location("usspace_v016_android_helpers", helper_path)
previous = importlib.util.module_from_spec(spec)
spec.loader.exec_module(previous)
ui = previous.ui
output = ui.output
original_dump = previous.dump
report = {
    "status": "failed",
    "package": ui.PACKAGE,
    "scope": "actual anonymous Android UI and native settings/permission handoffs",
    "authenticated_account_success_verified": False,
    "background_fcm_delivery_verified": False,
    "paired_notification_delivery_verified": False,
    "galaxy_watch_export_verified": False,
    "samsung_health_record_import_verified": False,
    "health_permission_granted_by_test": False,
    "application_private_data_read": False,
    "javascript_injected": False,
    "fabricated_health_records": False,
    "user_data_cleared": False,
    "steps": ui.steps,
}


def dump(label, prefix="v016"):
    root = original_dump(label, prefix=prefix)
    dump.last_path = output / f"{prefix}-{label}.xml"
    return root


# Existing viewport helpers correctly protect sticky app headers, bottom tabs
# and the scrollable Settings sheet. Native screens use their own real bounds.
previous.dump = dump
ui.dump = dump


def passed(label, **details):
    ui.steps.append({"assertion": label, "status": "passed", **details})


def screenshot(label):
    png = ui.adb("exec-out", "screencap", "-p", binary=True)
    if png[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError("Android evidence screenshot is not a PNG")
    name = f"UsSpace-v016-{label}.png"
    (output / name).write_bytes(png)
    return name


previous.screenshot = screenshot


def verify(label, pattern, capture=False, direction=True):
    root, node = previous.find(label, pattern, direction=direction)
    (output / f"v016-{label}.txt").write_text(previous.visible_text(root))
    passed(label, matched=ui.text_of(node), bounds=ui.usable_bounds(node, root),
           accessibility_evidence_file=dump.last_path.name,
           screenshot_evidence_file=screenshot(label) if capture else None)
    return root


def activity(label):
    text = ui.adb("shell", "dumpsys", "activity", "activities")
    name = f"v016-{label}-activity.txt"
    (output / name).write_text(text)
    return ui.resumed_component(text), name


def native_snapshot(label):
    root = dump(label)
    component, evidence = activity(label)
    return root, component, evidence


def native_text(root):
    return "\n".join(ui.text_of(node) for node in root.iter("node")
                     if ui.visible_bounds(node))


def is_app(component):
    return component.startswith(ui.PACKAGE + "/") and component.endswith(".MainActivity")


def return_from_native(label):
    # Pop the actual Android settings stack; relaunching MainActivity would hide
    # failures in return/resume behavior, so no am-start fallback is used here.
    for attempt in range(7):
        component, evidence = activity(f"{label}-{attempt}")
        if is_app(component):
            root = dump(label + "-app")
            packages = {node.get("package", "") for node in root.iter("node")}
            if ui.PACKAGE in packages and not packages & (HEALTH_SYSTEM | ANDROID_SETTINGS):
                passed(label + "-main-activity-resumed", component=component,
                       activity_evidence_file=evidence, back_presses=attempt)
                return root
        if attempt == 6:
            break
        previous.back(f"{label}-native-back-{attempt}")
    raise RuntimeError("Native settings did not return to UsSpace: " + label)


HEALTH_SYSTEM = {
    "com.android.healthconnect.controller", "com.google.android.healthconnect.controller",
    "com.android.permissioncontroller", "com.google.android.permissioncontroller",
}
ANDROID_SETTINGS = {"com.android.settings", "com.google.android.settings"}


def permission_handoff():
    previous.tap("health-explicit-allow-read", r"^Allow read access$")
    root, component, activity_file = native_snapshot("health-permission-response")
    packages = {node.get("package", "") for node in root.iter("node")}
    text = native_text(root)
    system = bool(packages & HEALTH_SYSTEM or component.split("/", 1)[0] in HEALTH_SYSTEM)
    if system and re.search(r"Health Connect|health data|steps|sleep|heart rate|calories|exercise|oxygen|weight", text, re.I):
        report["health_permission_handoff"] = "system_permission_ui"
        passed("health-real-system-permission-ui", component=component,
               activity_evidence_file=activity_file,
               accessibility_evidence_file=dump.last_path.name,
               screenshot_evidence_file=screenshot("health-system-permission"))
        # Only decline/cancel controls qualify. Never click Allow, Get started,
        # or a data-type toggle, even if permission onboarding varies by image.
        decline = next((node for node in root.iter("node")
                        if node.get("package") in HEALTH_SYSTEM
                        and node.get("clickable") == "true"
                        and node.get("enabled", "true") == "true"
                        and ui.visible_bounds(node)
                        and ui.matches(node, r"^(?:Don[’']?t allow|Deny|Cancel|Not now)$")), None)
        if decline is not None:
            left, top, right, bottom = ui.visible_bounds(decline)
            ui.adb("shell", "input", "tap", str((left + right) // 2), str((top + bottom) // 2))
            ui.steps.append({"action": "health-decline-real-permission-control",
                             "matched": ui.text_of(decline), "bounds": [left, top, right, bottom]})
            time.sleep(0.6)
        else:
            previous.back("health-cancel-permission-with-android-back")
        return_from_native("health-permission-return")
        passed("health-permission-flow-cancelled-without-grant")
        return
    if is_app(component) and re.search(
            r"Open Health Connect settings to grant read access|Health Connect is not available|"
            r"Samsung Health sync requires Android 14 or newer|"
            r"Open Samsung Health or Health Connect from Android Settings", text, re.I):
        report["health_permission_handoff"] = "actionable_platform_error"
        passed("health-platform-unavailable-has-actionable-error", component=component,
               activity_evidence_file=activity_file,
               accessibility_evidence_file=dump.last_path.name,
               screenshot_evidence_file=screenshot("health-platform-error"))
        return
    raise RuntimeError("Health permission request showed neither real system health UI nor an actionable platform error")


def settings_handoff(label, button, accepted_packages, expected_copy, direction=True):
    previous.find(label + "-control", button, class_name="android.widget.Button",
                  interactive=True, enabled=True, direction=direction)
    previous.tap(label + "-open", button)
    root, component, activity_file = native_snapshot(label + "-response")
    text = native_text(root)
    packages = {node.get("package", "") for node in root.iter("node")}
    if (component.split("/", 1)[0] not in accepted_packages and not packages & accepted_packages
            or not re.search(expected_copy, text, re.I)):
        raise RuntimeError("The actual Android settings screen was not observed: " + label)
    passed(label + "-real-native-screen", component=component,
           activity_evidence_file=activity_file,
           accessibility_evidence_file=dump.last_path.name,
           screenshot_evidence_file=screenshot(label + "-native"))
    report[label + "_native_component"] = component
    return_from_native(label + "-return")


def disabled_control(label, title):
    root, node = previous.find(label, title, class_name="android.widget.Button",
                               enabled=False, direction=True)
    if node.get("enabled", "true") != "false":
        raise RuntimeError("A signed-out notification action is enabled: " + label)
    passed(label, matched=ui.text_of(node), enabled=False,
           bounds=ui.usable_bounds(node, root),
           accessibility_evidence_file=dump.last_path.name)


def health_checks():
    previous.home("v016-health-start-home")
    previous.section("v016-health", "Life", r"\bHealth\b.*Steps, sleep", r"^My wellness$")
    verify("health-private-by-default", r"^Private by default$", capture=True)
    verify("health-read-only-samsung-pipeline", r"Read-only sync for steps, sleep, recent heart rate")
    verify("health-no-import-in-anonymous-emulator", r"No readings imported\. Saved data is never replaced by missing readings")
    verify("health-no-invented-record-history", r"No health snapshots yet\. Allow Samsung Health to write to Health Connect")
    verify("health-common-cloud-excludes-health-and-cycle", r"The common cloud sync bridge rejects Health and Cycle fields", direction=False)
    verify("health-selected-summaries-need-separate-consent", r"Selected summaries use separate consent below")
    verify("health-optional-partner-sharing-explicit", r"^Optional partner sharing$", capture=True)
    verify("health-pairing-does-not-grant-access", r"Only you control your sharing\. Pairing does not grant access")
    root, node = previous.find("health-sharing-disabled-before-confirmed-account", r"^Enable sharing$",
                               class_name="android.widget.Button", enabled=False)
    passed("health-sharing-disabled-before-confirmed-account", enabled=False,
           bounds=ui.usable_bounds(node, root), accessibility_evidence_file=dump.last_path.name)
    verify("health-revocation-and-cache-limit-explained", r"Already viewed or independently saved information cannot be recalled")
    verify("health-no-sensitive-notification-preview-or-travel-ai", r"No health details in notification previews; none goes to travel AI or analytics")
    # Going toward the top matters: previous checks intentionally inspect the
    # real empty history below the controls, without an offscreen tap.
    root, node = previous.find("health-read-control", r"^Allow read access$",
                               class_name="android.widget.Button", enabled=True,
                               interactive=True, direction=False)
    passed("health-read-control-available-to-guest", bounds=ui.usable_bounds(node, root),
           accessibility_evidence_file=dump.last_path.name)
    permission_handoff()
    verify("health-return-keeps-private-section", r"^My wellness$", direction=False)
    verify("health-no-read-permissions-after-decline", r"0 of 9 read permissions allowed")
    settings_handoff("health-connect-settings", r"^Health Connect settings$",
                     HEALTH_SYSTEM | ANDROID_SETTINGS, r"Health Connect|UsSpace|App permissions|Settings")
    verify("health-settings-return-refreshes-status", r"0 of 9 read permissions allowed", direction=False)
    verify("health-settings-return-does-not-fabricate-import", r"No readings imported\. Saved data is never replaced by missing readings")
    previous.back_parent_home("v016-health-parent-back", "Life")


def notification_checks():
    previous.open_settings("v016-notifications-settings")
    verify("notification-signed-out-guidance", r"Sign in first to receive updates from your paired space")
    disabled_control("notification-permission-disabled-before-signin", r"^Allow on this phone$")
    disabled_control("notification-registration-disabled-before-signin", r"^Retry registration$")
    disabled_control("notification-local-test-disabled-before-signin", r"^Test on this phone$")
    verify("notification-local-test-is-honest", r"The phone test checks Android only; it does not send a message to your partner")
    # A service handshake is distinct from end-to-end delivery. Preserve the
    # actual status as evidence without treating any fixed status as FCM proof.
    root = verify("notification-service-status-explicit", r"Notification service|Awaiting secure notification service setup",
                  capture=True)
    report["notification_service_visible_status"] = [ui.text_of(node) for node in root.iter("node")
                                                     if ui.visible_bounds(node) and ui.matches(node,
                                                         r"Notification service|Awaiting secure notification service setup")]
    settings_handoff("android-notification-settings", r"^Android notification settings$",
                     ANDROID_SETTINGS, r"UsSpace|Notifications", direction=False)
    verify("notification-return-preserves-settings", r"^Notifications$", direction=False)
    disabled_control("notification-return-keeps-test-disabled", r"^Test on this phone$")
    verify("notification-sensitive-data-excluded", r"Health, Cycle, private goals, and private comfort moods never generate partner notifications")
    previous.back("v016-notification-modal-close-first")
    verify("notification-modal-back-preserves-home", r"\bTogether for\b", direction=False)


def run():
    api = ui.adb("shell", "getprop", "ro.build.version.sdk").strip()
    if not api.isdecimal() or int(api) < 34:
        raise RuntimeError("Health Connect recovery verification needs Android 14 or newer")
    report["android_api"] = int(api)
    passed("native-android-health-platform-supported", android_api=int(api))
    samsung = ui.adb("shell", "pm", "list", "packages", "--user", "0", "com.sec.android.app.shealth").strip()
    report["samsung_health_installed"] = "package:com.sec.android.app.shealth" in samsung.splitlines()
    (output / "v016-samsung-package-presence.txt").write_text(samsung + "\n")
    # The CI image intentionally contains no Samsung Health. An unexpected
    # installed source could hold real data and invalidates this empty-data test.
    if report["samsung_health_installed"]:
        raise RuntimeError("This empty-data CI test requires an emulator without Samsung Health")
    passed("emulator-has-no-samsung-source-record-provider", installed=False)
    health_checks()
    notification_checks()
    component, evidence = activity("final-main")
    if not is_app(component):
        raise RuntimeError("MainActivity is not resumed after recovery UI checks")
    passed("recovery-ui-finishes-in-main-activity", component=component,
           activity_evidence_file=evidence, screenshot_evidence_file=screenshot("final-home"))
    report["status"] = "passed"
    print("ANDROID_V016_UI_TEST_PASSED: private Health Connect permission/settings recovery, "
          "honest no-Samsung-data state, signed-out notification controls and Android settings; "
          "Galaxy Watch import and authenticated FCM delivery were not tested")


if __name__ == "__main__":
    try:
        run()
    except Exception as error:
        report["error"] = str(error)
        try:
            screenshot("failure")
            dump("failure")
            activity("failure")
        except Exception as capture_error:
            report["failure_capture_error"] = str(capture_error)
        raise
    finally:
        (output / "v016-ui-result.json").write_text(json.dumps(report, indent=2) + "\n")
