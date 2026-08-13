import importlib.util
import json
import sys
import unittest
from pathlib import Path
from urllib.error import HTTPError


MODULE_PATH = Path(__file__).with_name("tidapp_read_api.py")
SPEC = importlib.util.spec_from_file_location("tidapp_read_api", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def read(self):
        return json.dumps(self._payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class TidAppReadClientTests(unittest.TestCase):
    def test_list_projects_is_get_only_and_returns_items(self):
        requests = []

        def opener(request, timeout):
            requests.append((request, timeout))
            return FakeResponse({"items": [{"id": "p1", "code": "101", "name": "Test"}]})

        items = MODULE.TidAppReadClient("secret", api_base_url="https://example.test/api", opener=opener).list_active_projects()

        self.assertEqual(items[0]["code"], "101")
        self.assertEqual(requests[0][0].method, "GET")
        self.assertEqual(requests[0][0].full_url, "https://example.test/api/integrations/projects/list")
        self.assertEqual(requests[0][0].get_header("X-tidapp-integration-key"), "secret")

    def test_rejected_key_is_reported_without_exposing_key(self):
        def opener(request, timeout):
            raise HTTPError(request.full_url, 401, "Unauthorized", hdrs=None, fp=None)

        with self.assertRaises(MODULE.TidAppReadError) as caught:
            MODULE.TidAppReadClient("do-not-print", opener=opener).list_active_projects()

        self.assertEqual(caught.exception.code, "INTEGRATION_AUTH_REQUIRED")
        self.assertNotIn("do-not-print", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
