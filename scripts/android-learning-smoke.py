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


def adb(*arguments, binary=False):
    return subprocess.run([args.adb, "-s", args.serial, *arguments], check=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          timeout=35, text=not binary).stdout


size = re.findall(r"(\d+)x(\d+)", adb("shell", "wm", "size"))[-1]
width, height = map(int, size)


def dump(label):
    adb("shell", "uiautomator", "dump", "/sdcard/usspace-window.xml")
    xml = adb("shell", "cat", "/sdcard/usspace-window.xml")
    (output / f"learning-{label}.xml").write_text(xml)
    return ET.fromstring(xml)


def text_of(node):
    return " ".join((node.get("text", "") + " " + node.get("content-desc", "")).split())


def swipe(down):
    start, end = (0.78, 0.30) if down else (0.30, 0.78)
    adb("shell", "input", "swipe", str(width // 2), str(int(height * start)),
        str(width // 2), str(int(height * end)), "350")
    time.sleep(0.4)


def click(label, pattern, direction=True):
    for attempt in range(12):
        root = dump(f"{label}-{attempt}")
        for node in root.iter("node"):
            if not re.search(pattern, text_of(node), re.IGNORECASE):
                continue
            bounds = list(map(int, re.findall(r"\d+", node.get("bounds", ""))))
            if len(bounds) != 4:
                continue
            left, top, right, bottom = bounds
            if right <= left or bottom <= top or top < 0 or bottom > height:
                continue
            adb("shell", "input", "tap", str((left + right) // 2), str((top + bottom) // 2))
            time.sleep(0.6)
            steps.append({"action": label, "matched": text_of(node)})
            return
        swipe(direction)
    raise RuntimeError(f"Learning UI element not found: {label}")


def verify(label, pattern):
    for attempt in range(6):
        root = dump(f"{label}-verify-{attempt}")
        text = "\n".join(text_of(node) for node in root.iter("node"))
        if re.search(pattern, text, re.IGNORECASE):
            break
        swipe(True)
    else:
        raise RuntimeError(f"Learning UI did not render expected content: {label}")
    (output / f"learning-{label}.txt").write_text(text)
    (output / f"UsSpace-learning-{label}.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
    steps.append({"assertion": label, "status": "passed"})


try:
    click("open", r"Open Learn Together")
    verify("today", r"Our language corner|Learn Together")
    click("kannada-course", r"(?:^| )Course$")
    verify("kannada-course", r"Kannada beginner course")
    click("script", r"(?:^| )Script$")
    verify("kannada-script", r"ಅ|ಆ|Kannada script|Vowels")
    click("malayalam-learner", r"Yashika learns Malayalam", direction=False)
    click("malayalam-course", r"(?:^| )Course$")
    verify("malayalam-course", r"Malayalam beginner course")
    click("malayalam-script", r"(?:^| )Script$")
    verify("malayalam-script", r"അ|ആ|Malayalam script|Vowels")
    (output / "learning-ui-result.json").write_text(json.dumps({"status": "passed", "steps": steps}, indent=2) + "\n")
    print("ANDROID_LEARNING_UI_TEST_PASSED: both bundled courses and scripts rendered in the signed APK")
except Exception:
    (output / "learning-ui-result.json").write_text(json.dumps({"status": "failed", "steps": steps}, indent=2) + "\n")
    raise
