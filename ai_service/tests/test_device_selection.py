import types
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from device_runtime import capability_report, resolve_device


def fake_torch(cuda_available=False, mps_available=False, version='test-torch'):
    return types.SimpleNamespace(
        cuda=types.SimpleNamespace(is_available=lambda: cuda_available),
        backends=types.SimpleNamespace(mps=types.SimpleNamespace(is_available=lambda: mps_available)),
        __version__=version,
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
        report = capability_report(torch_module=fake_torch(mps_available=True, version='2.4.0'))
        self.assertEqual(report['selectedDevice'], 'mps')
        self.assertFalse(report['cudaAvailable'])
        self.assertTrue(report['mpsAvailable'])
        self.assertEqual(report['torchVersion'], '2.4.0')

    def test_capability_report_returns_none_when_torch_unavailable(self):
        report = capability_report(torch_module=None)
        self.assertEqual(report['selectedDevice'], 'cpu')
        self.assertFalse(report['cudaAvailable'])
        self.assertFalse(report['mpsAvailable'])
        self.assertIsNone(report['torchVersion'])

    def test_capability_report_default_reads_actual_torch(self):
        try:
            import torch
            expected_version = torch.__version__
        except ImportError:
            expected_version = None
        report = capability_report()
        self.assertEqual(report['torchVersion'], expected_version)


if __name__ == '__main__':
    unittest.main()
