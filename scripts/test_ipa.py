"""Fixture tests catch malformed IPA layouts without pretending to compile iOS on Windows."""
import importlib.util
from pathlib import Path
import plistlib
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("package_ipa", Path(__file__).with_name("package-ipa.py"))
ipa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ipa)


class IpaValidationTests(unittest.TestCase):
    def fixture(self, root="Payload/RideSpeed.app", platform="iPhoneOS", bundle=True, provision=False):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        path = Path(temporary.name) / "fixture.ipa"
        info = {
            "CFBundleIdentifier": "com.arnalxz.ridespeed", "CFBundleShortVersionString": "0.1.0",
            "CFBundleVersion": "2.1.0", "MinimumOSVersion": "17.0", "CFBundleExecutable": "RideSpeed",
            "CFBundleSupportedPlatforms": [platform], "NSLocationWhenInUseUsageDescription": "Fixture permission",
        }
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr(f"{root}/Info.plist", plistlib.dumps(info))
            archive.writestr(f"{root}/RideSpeed", b"fixture: NOT a real Mach-O")
            if bundle:
                archive.writestr(f"{root}/main.jsbundle", b"fixture JS")
            if provision:
                archive.writestr(f"{root}/embedded.mobileprovision", b"must not publish")
        return path

    def check(self, path):
        return ipa.validate_zip(path, "release", "0.1.0", "2.1.0")

    def test_expected_layout(self):
        self.assertEqual(self.check(self.fixture())["MinimumOSVersion"], "17.0")

    def test_rejects_missing_payload(self):
        with self.assertRaises(ValueError):
            self.check(self.fixture(root="RideSpeed.app"))

    def test_rejects_simulator(self):
        with self.assertRaises(ValueError):
            self.check(self.fixture(platform="iPhoneSimulator"))

    def test_requires_release_bundle(self):
        with self.assertRaises(KeyError):
            self.check(self.fixture(bundle=False))

    def test_rejects_provisioning(self):
        with self.assertRaises(ValueError):
            self.check(self.fixture(provision=True))

    def test_rejects_wrong_identity(self):
        with self.assertRaises(ValueError):
            ipa.validate_zip(self.fixture(), "development", "0.1.0", "2.1.0")


if __name__ == "__main__":
    unittest.main()
