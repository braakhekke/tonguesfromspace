"""Regression: execute page startup, then click the actual bound preview controls."""
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'scripts/tools/onboard-scenes.html'


@unittest.skipUnless(PAGE.is_file() and shutil.which('node'), 'Local onboarding viewer and Node required')
class TestTimelapseControls(unittest.TestCase):
    def test_bootstrap_binds_header_button_and_playback_controls(self):
        result = subprocess.run(
            ['node', str(ROOT / 'tests/onboard_timelapse.cjs'), str(PAGE)],
            capture_output=True, text=True, timeout=20,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
