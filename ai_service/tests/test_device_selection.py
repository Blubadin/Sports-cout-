import types
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from device_runtime import capability_report, resolve_device


def fake_torch(cuda_available=False, mps_available=False):
    return types.SimpleNamespace(
        cuda=types.SimpleNamespace(is_available=lambda: cuda_available),
        backends=types.SimpleNamespace(mps=types.SimpleNamespace(is_available=lambda: mps_available)),
        version=types.SimpleNamespace(__version__='test-torch'),
    )


class TestDeviceSelection(unittest.TestCase):
    def test_auto_prefers_cuda_then_mps_then_cpu(self):
        self.assertEqual(resolve_device(torch_module=fake_torch(cuda_available=True)), 'cuda')
        self.assertEqual(resolve_device(torch_module=fake_torch(mps_available=True)), 'mps')
        self.assertEqual(resolve_device(torch_module=fake_torch()), 'cpu')

    def test_explicit_unavailable_device_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'cuda'):
            resolve_device('cuda', torch_module=fake_torch())

    def test_capability_report_names_selected_device(self):
        report = capability_report(torch_module=fake_torch(mps_available=True))
        self.assertEqual(report['selectedDevice'], 'mps')
        self.assertFalse(report['cudaAvailable'])
        self.assertTrue(report['mpsAvailable'])


if __name__ == '__main__':
    unittest.main()
