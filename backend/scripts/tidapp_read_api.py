"""Read-only export of active TidApp projects.

The integration key is read directly from the named Windows Credential Manager
entry and is never printed, written to disk, or accepted as a command argument.
This client only supports GET requests to the narrow project-list integration
route.
"""

from __future__ import annotations

import argparse
import ctypes
import json
import os
import site
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from ctypes import wintypes


API_BASE_URL = "https://api-tid.anderssonsisolering.se/api"
CREDENTIAL_TARGET = "anderssons-isolering/tidapp-read-api"
PROJECT_LIST_PATH = "/integrations/projects/list"


@dataclass
class TidAppReadError(Exception):
    code: str
    message: str

    def __str__(self) -> str:
        return f"{self.code}: {self.message}"


_DLL_DIRECTORY_HANDLES: list[Any] = []


def _prepare_pywin32_dll_path() -> None:
    """Make pywin32's DLL folder available without changing the environment."""
    for package_dir in site.getsitepackages():
        dll_dir = Path(package_dir) / "pywin32_system32"
        if dll_dir.is_dir() and hasattr(os, "add_dll_directory"):
            _DLL_DIRECTORY_HANDLES.append(os.add_dll_directory(str(dll_dir)))


def _read_windows_credential() -> str:
    """Read the key internally. The value must never be logged or returned to UI."""
    _prepare_pywin32_dll_path()
    try:
        import win32cred  # type: ignore[import-not-found]
    except ImportError:
        return _read_windows_credential_native()

    try:
        credential = win32cred.CredRead(CREDENTIAL_TARGET, win32cred.CRED_TYPE_GENERIC)
    except Exception as error:
        raise TidAppReadError(
            "CREDENTIAL_NOT_FOUND",
            f"Ingen läsnyckel hittades i Windows Credential Manager för {CREDENTIAL_TARGET}.",
        ) from error

    blob = credential.get("CredentialBlob", b"")
    if not isinstance(blob, bytes) or not blob:
        raise TidAppReadError("CREDENTIAL_INVALID", "Den sparade läsnyckeln är tom eller ogiltig.")
    try:
        return blob.decode("utf-16-le").rstrip("\x00")
    except UnicodeDecodeError as error:
        raise TidAppReadError("CREDENTIAL_INVALID", "Den sparade läsnyckeln kan inte läsas.") from error


def _read_windows_credential_native() -> str:
    """Credential Manager fallback using Windows' built-in CredReadW API."""
    class FileTime(ctypes.Structure):
        _fields_ = [("low", wintypes.DWORD), ("high", wintypes.DWORD)]

    class Credential(ctypes.Structure):
        _fields_ = [
            ("flags", wintypes.DWORD),
            ("type", wintypes.DWORD),
            ("target_name", wintypes.LPWSTR),
            ("comment", wintypes.LPWSTR),
            ("last_written", FileTime),
            ("credential_blob_size", wintypes.DWORD),
            ("credential_blob", ctypes.POINTER(ctypes.c_byte)),
            ("persist", wintypes.DWORD),
            ("attribute_count", wintypes.DWORD),
            ("attributes", ctypes.c_void_p),
            ("target_alias", wintypes.LPWSTR),
            ("user_name", wintypes.LPWSTR),
        ]

    pointer = ctypes.POINTER(Credential)()
    advapi32 = ctypes.WinDLL("Advapi32", use_last_error=True)
    advapi32.CredReadW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.POINTER(ctypes.POINTER(Credential))]
    advapi32.CredReadW.restype = wintypes.BOOL
    advapi32.CredFree.argtypes = [ctypes.c_void_p]
    advapi32.CredFree.restype = None

    if not advapi32.CredReadW(CREDENTIAL_TARGET, 1, 0, ctypes.byref(pointer)):
        raise TidAppReadError(
            "CREDENTIAL_NOT_FOUND",
            f"Ingen läsnyckel hittades i Windows Credential Manager för {CREDENTIAL_TARGET}.",
        )
    try:
        blob = ctypes.string_at(pointer.contents.credential_blob, pointer.contents.credential_blob_size)
    finally:
        advapi32.CredFree(pointer)
    try:
        return blob.decode("utf-16-le").rstrip("\x00")
    except UnicodeDecodeError as error:
        raise TidAppReadError("CREDENTIAL_INVALID", "Den sparade läsnyckeln kan inte läsas.") from error


class TidAppReadClient:
    """Client deliberately restricted to the one read-only project endpoint."""

    def __init__(
        self,
        api_key: str,
        api_base_url: str = API_BASE_URL,
        opener: Callable[..., Any] = urlopen,
    ) -> None:
        if not api_key.strip():
            raise TidAppReadError("CREDENTIAL_INVALID", "Den sparade läsnyckeln är tom eller ogiltig.")
        self._api_key = api_key
        self._api_base_url = api_base_url.rstrip("/")
        self._opener = opener

    def list_active_projects(self) -> list[dict[str, Any]]:
        request = Request(
            f"{self._api_base_url}{PROJECT_LIST_PATH}",
            headers={
                "Accept": "application/json",
                "X-tidapp-integration-key": self._api_key,
            },
            method="GET",
        )
        try:
            with self._opener(request, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            if error.code in (401, 403):
                raise TidAppReadError("INTEGRATION_AUTH_REQUIRED", "Läsnyckeln nekades av TidApp.") from error
            raise TidAppReadError("API_HTTP_ERROR", f"TidApp svarade HTTP {error.code}.") from error
        except URLError as error:
            raise TidAppReadError("API_UNAVAILABLE", f"TidApp kunde inte nås: {error.reason}") from error
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise TidAppReadError("API_INVALID_RESPONSE", "TidApp lämnade ett ogiltigt svar.") from error

        items = payload.get("items") if isinstance(payload, dict) else None
        if not isinstance(items, list):
            raise TidAppReadError("API_INVALID_RESPONSE", "TidApp-svaret saknar en giltig projektlista.")
        return items


def main() -> int:
    parser = argparse.ArgumentParser(description="Hämta aktiva TidApp-projekt (endast läsning).")
    parser.add_argument("command", choices=["list-projects"], help="Enda tillåtna läskommandot")
    args = parser.parse_args()

    if args.command != "list-projects":  # Defensive: argparse limits this already.
        raise TidAppReadError("COMMAND_NOT_ALLOWED", "Endast list-projects är tillåtet.")

    client = TidAppReadClient(_read_windows_credential())
    print(json.dumps({"items": client.list_active_projects()}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except TidAppReadError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
