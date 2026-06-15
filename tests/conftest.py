import sys
import types


def _install_torch_stub_when_unavailable():
    try:
        import torch  # noqa: F401
        import torch.nn.functional  # noqa: F401
        return
    except Exception:
        pass

    torch_stub = types.ModuleType("torch")
    nn_module = types.ModuleType("torch.nn")
    functional_module = types.ModuleType("torch.nn.functional")

    functional_module.pad = lambda *args, **kwargs: None
    functional_module.interpolate = lambda *args, **kwargs: None
    nn_module.functional = functional_module
    torch_stub.nn = nn_module
    torch_stub.float32 = "float32"
    torch_stub.Tensor = object

    sys.modules["torch"] = torch_stub
    sys.modules["torch.nn"] = nn_module
    sys.modules["torch.nn.functional"] = functional_module


_install_torch_stub_when_unavailable()
