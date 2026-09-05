#!/usr/bin/env python3
"""One-off recovery tool for the 2026-07-25 Supabase wipe. See RECOVERY.md.

The certificate rows in `eccia_masterclass_certificados` were destroyed by
`DROP SCHEMA public CASCADE`, but the PDFs themselves survived in Nextcloud.
This script rebuilds the rows from those PDFs so already-issued QR codes
validate again.

It runs in two phases, deliberately separated by a human review step:

    extract  Nextcloud -> certificates.csv   (read-only, safe to re-run)
    load     certificates.csv -> Supabase    (writes rows)

Never run `load` against a CSV nobody has read. These rows are people's
credentials; a wrong name is worse than a missing one.

    python scripts/recover-certificates.py extract --out certificates.csv
    # ...review certificates.csv by hand, fill in the `correo` column...
    python scripts/recover-certificates.py load --csv certificates.csv --dry-run
    python scripts/recover-certificates.py load --csv certificates.csv

Requires `pdfminer.six` (pure Python, no binary wheels). Everything else is
stdlib. This is intentionally NOT wired into the repo's toolchain: it is a
recovery tool, not part of the site.

    python -m venv .recovery-venv
    .recovery-venv/Scripts/python -m pip install pdfminer.six   # Windows
    .recovery-venv/bin/python -m pip install pdfminer.six       # POSIX

Environment:
    NEXTCLOUD_WEBDAV_URL          extract
    NEXTCLOUD_USERNAME            extract
    NEXTCLOUD_APP_PASSWORD        extract
    SUPABASE_URL                  load
    SUPABASE_SERVICE_ROLE_KEY           load   (service role — never a publishable key)
    CERTIFICATE_PUBLIC_BASE_URL   load   (origin used to rebuild validation URLs)
"""

from __future__ import annotations

import argparse
import base64
import csv
import io
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from xml.etree import ElementTree

# Mirrors issue-certificate/index.ts:772. The filename IS the certificate code,
# which is the only reason this recovery is possible at all.
REMOTE_DIR = "masterclass-ultrasonido-nivel-i/2026"
CODE_PATTERN = re.compile(r"^ECCIA-UT1-[0-9A-F]{8}$")
CODE_IN_PDF_PATTERN = re.compile(r"C[oó]digo:\s*(ECCIA-UT1-[0-9A-F]{8})", re.IGNORECASE)

MASTERCLASS_CODE = "ultrasonido-industrial-scan-a"

# Derived from buildLayout() + stampCertificate() in issue-certificate/index.ts.
# stampCertificate draws exactly three things onto the prebuilt template: the
# name, the QR image, and the code caption. The name sits on a fixed baseline,
# so we can select it by coordinate instead of guessing with a regex.
#
#   MM_TO_PT   = 72 / 25.4
#   contentX   = 22mm                      -> name x
#   mainTop    = 184 - 12.5mm
#   eyebrowY   = pageHeight(595) - mainTop
#   name y     = eyebrowY - 163
MM_TO_PT = 72 / 25.4
NAME_X = 22 * MM_TO_PT
NAME_BASELINE_Y = 595 - (184 - 12.5 * MM_TO_PT) - 163
BASELINE_TOLERANCE = 4.0

# Certificates recovered without a known email get a clearly-fake address in a
# dedicated subdomain, so they are trivially greppable later. Opt-in only.
PLACEHOLDER_EMAIL_DOMAIN = "recuperacion.littusgroup.com"


@dataclass
class Certificate:
    code_from_filename: str
    nextcloud_path: str
    full_name: str = ""
    code_from_pdf: str = ""
    email: str = ""
    notes: list[str] = field(default_factory=list)

    @property
    def needs_review(self) -> bool:
        return bool(self.notes)


def fail(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


def load_dotenv(path: Path) -> int:
    """Populate os.environ from a .env file, without adding a dependency.

    A real environment variable always wins over the file, so an explicit
    `NEXTCLOUD_APP_PASSWORD=... python scripts/...` still overrides .env.
    """
    if not path.is_file():
        return 0

    loaded = 0
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].lstrip()

        key, separator, value = line.partition("=")
        if not separator:
            continue

        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]

        if key and key not in os.environ:
            os.environ[key] = value
            loaded += 1

    return loaded


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        fail(
            f"missing required environment variable {name}\n"
            f"       copy .env.example to .env and fill it in, or export the variable"
        )
    return value


# --------------------------------------------------------------------------
# Nextcloud (WebDAV)
# --------------------------------------------------------------------------


def webdav_request(url: str, method: str, auth_header: str, headers: dict[str, str] | None = None) -> bytes:
    request = urllib.request.Request(url, method=method)
    request.add_header("Authorization", auth_header)
    for key, value in (headers or {}).items():
        request.add_header(key, value)

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.read()
    except urllib.error.HTTPError as error:
        fail(f"{method} {url} failed ({error.code} {error.reason})")
    except urllib.error.URLError as error:
        fail(f"{method} {url} failed ({error.reason})")
    raise AssertionError("unreachable")


def build_auth_header(username: str, password: str) -> str:
    token = base64.b64encode(f"{username}:{password}".encode()).decode()
    return f"Basic {token}"


def build_webdav_url(base_url: str, *segments: str, trailing_slash: bool = False) -> str:
    """Join a WebDAV base URL with path segments, percent-encoding exactly once.

    ECCIA's certificates live under folders with spaces and dots
    ("1000 ECCIA/04. CERTIFICADOS EVENTOS/..."), so the base URL arrives either
    already percent-encoded (copied from the Nextcloud web UI) or raw (typed by
    hand). Quoting without unquoting first turns %20 into %2520 and every
    request 404s. Unquote-then-quote makes both input forms converge.

    Caveat: a folder name containing a literal '%' would be corrupted by the
    unquote step. None of ECCIA's do.
    """
    parsed = urllib.parse.urlsplit(base_url)
    parts = [urllib.parse.unquote(parsed.path)]
    parts.extend(urllib.parse.unquote(segment) for segment in segments)

    path = "/".join(part.strip("/") for part in parts if part.strip("/"))
    encoded = urllib.parse.quote(path)
    suffix = "/" if trailing_slash else ""

    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, f"/{encoded}{suffix}", "", ""))


def list_certificate_pdfs(base_url: str, auth_header: str, remote_dir: str) -> list[str]:
    """PROPFIND the certificate directory and return the .pdf hrefs it holds."""
    directory_url = build_webdav_url(base_url, remote_dir, trailing_slash=True)
    body = webdav_request(directory_url, "PROPFIND", auth_header, {"Depth": "1"})

    try:
        tree = ElementTree.fromstring(body)
    except ElementTree.ParseError as error:
        fail(f"could not parse the PROPFIND response as XML: {error}")

    hrefs: list[str] = []
    for href_element in tree.iter("{DAV:}href"):
        href = (href_element.text or "").strip()
        if href.lower().endswith(".pdf"):
            hrefs.append(urllib.parse.unquote(href))

    return sorted(set(hrefs))


def download_pdf(base_url: str, auth_header: str, code: str, remote_dir: str) -> bytes:
    url = build_webdav_url(base_url, remote_dir, f"{code}.pdf")
    return webdav_request(url, "GET", auth_header)


# --------------------------------------------------------------------------
# PDF text extraction
# --------------------------------------------------------------------------


def extract_fields_from_pdf(pdf_bytes: bytes) -> tuple[str, str, list[str]]:
    """Return (full_name, code_found_in_pdf, notes).

    The name is selected by its baseline coordinate rather than by pattern
    matching, because stampCertificate draws it at a known fixed position.
    """
    try:
        from pdfminer.high_level import extract_pages
        from pdfminer.layout import LTChar
    except ImportError:
        fail("pdfminer.six is not installed — see the module docstring")

    notes: list[str] = []

    try:
        pages = list(extract_pages(io.BytesIO(pdf_bytes), maxpages=1))
    except Exception as error:  # pdfminer raises a wide variety of errors
        return "", "", [f"could not parse PDF: {error}"]

    # Collect every glyph with its position, whatever depth pdfminer nested it
    # at, then rebuild visual lines by grouping on the baseline. Working from
    # coordinates rather than pdfminer's text-flow heuristics is what lets us
    # target the name precisely and keeps the code caption on one line.
    #
    # Use matrix[5] (the text-matrix translation, i.e. the true baseline), NOT
    # y0. y0 is the glyph bounding box bottom, which sits below the baseline by
    # the font's descent — measured at 5.59pt for 27pt text. That offset scales
    # with font size, and stampCertificate picks the name's size from its
    # length (27 / 25 / 22), so matching on y0 would drift precisely for the
    # longest names and mis-extract them without any error.
    chars: list[tuple[float, float, str]] = []

    def walk(element) -> None:
        if isinstance(element, LTChar):
            chars.append((element.matrix[5], element.x0, element.get_text()))
            return
        try:
            children = iter(element)
        except TypeError:
            return
        for child in children:
            walk(child)

    for page_layout in pages:
        walk(page_layout)

    if not chars:
        return "", "", ["PDF contains no extractable text (scanned image, or broken font encoding)"]

    lines: dict[int, list[tuple[float, str]]] = {}
    for baseline_y, x, text in chars:
        lines.setdefault(round(baseline_y), []).append((x, text))

    def render_line(baseline_key: int) -> str:
        glyphs = sorted(lines[baseline_key], key=lambda item: item[0])
        return re.sub(r"\s+", " ", "".join(text for _, text in glyphs)).strip()

    code_from_pdf = ""
    for baseline_key in lines:
        match = CODE_IN_PDF_PATTERN.search(render_line(baseline_key))
        if match:
            code_from_pdf = match.group(1).upper()
            break
    if not code_from_pdf:
        notes.append("no certificate code found inside the PDF")

    name_glyphs: list[tuple[float, str]] = []
    for baseline_key, glyphs in lines.items():
        if abs(baseline_key - NAME_BASELINE_Y) <= BASELINE_TOLERANCE:
            name_glyphs.extend(glyphs)

    name_glyphs.sort(key=lambda item: item[0])
    full_name = re.sub(r"\s+", " ", "".join(text for _, text in name_glyphs)).strip()

    if not full_name:
        notes.append(
            "no text found on the expected name baseline "
            f"(y~{NAME_BASELINE_Y:.1f}); the PDF layout may have changed"
        )
    elif len(full_name) < 5 or " " not in full_name:
        # Same shape check the original table enforced on nombre_completo.
        notes.append(f"extracted name looks implausible: {full_name!r}")

    return full_name, code_from_pdf, notes


# --------------------------------------------------------------------------
# extract
# --------------------------------------------------------------------------


def command_extract(args: argparse.Namespace) -> int:
    base_url = required_env("NEXTCLOUD_WEBDAV_URL").rstrip("/")
    auth_header = build_auth_header(
        required_env("NEXTCLOUD_USERNAME"), required_env("NEXTCLOUD_APP_PASSWORD")
    )

    remote_dir = args.remote_dir.strip("/")
    print(f"listing {build_webdav_url(base_url, remote_dir, trailing_slash=True)} ...")
    hrefs = list_certificate_pdfs(base_url, auth_header, remote_dir)
    codes = []
    for href in hrefs:
        stem = href.rstrip("/").rsplit("/", 1)[-1][: -len(".pdf")]
        if CODE_PATTERN.match(stem.upper()):
            codes.append(stem.upper())
        else:
            print(f"  skipping unrecognised filename: {stem}.pdf")

    if not codes:
        fail(
            "no certificate PDFs found.\n"
            f"       looked in: {build_webdav_url(base_url, remote_dir, trailing_slash=True)}\n"
            "       check NEXTCLOUD_WEBDAV_URL points at the WebDAV root, and pass\n"
            "       --remote-dir if the certificates live somewhere else"
        )

    print(f"found {len(codes)} certificate PDF(s)\n")

    results: list[Certificate] = []
    for index, code in enumerate(sorted(codes), start=1):
        print(f"[{index}/{len(codes)}] {code} ... ", end="", flush=True)
        certificate = Certificate(
            code_from_filename=code,
            nextcloud_path=f"{remote_dir}/{code}.pdf",
        )

        pdf_bytes = download_pdf(base_url, auth_header, code, remote_dir)
        full_name, code_from_pdf, notes = extract_fields_from_pdf(pdf_bytes)
        certificate.full_name = full_name
        certificate.code_from_pdf = code_from_pdf
        certificate.notes.extend(notes)

        # The strongest integrity check available: the code stamped inside the
        # PDF must match the filename it was stored under.
        if code_from_pdf and code_from_pdf != code:
            certificate.notes.append(
                f"code mismatch: filename says {code}, PDF says {code_from_pdf}"
            )

        results.append(certificate)
        print(f"{full_name or '<no name>'}{'  [REVIEW]' if certificate.needs_review else ''}")

    with open(args.out, "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "codigo_certificado",
                "nombre_completo",
                "correo",
                "nextcloud_path",
                "codigo_en_pdf",
                "revisar",
                "notas",
            ]
        )
        for certificate in results:
            writer.writerow(
                [
                    certificate.code_from_filename,
                    certificate.full_name,
                    certificate.email,
                    certificate.nextcloud_path,
                    certificate.code_from_pdf,
                    "SI" if certificate.needs_review else "",
                    " | ".join(certificate.notes),
                ]
            )

    flagged = sum(1 for certificate in results if certificate.needs_review)
    print(f"\nwrote {len(results)} row(s) to {args.out}")
    if flagged:
        print(f"{flagged} row(s) flagged for review — see the `revisar` column")
    print(
        "\nNext: open the CSV, verify every name, and fill in the `correo` column.\n"
        "The PDFs do not contain the participant's email; recover it from Resend."
    )
    return 0


# --------------------------------------------------------------------------
# load
# --------------------------------------------------------------------------


def postgrest_insert(supabase_url: str, secret_key: str, rows: list[dict]) -> None:
    endpoint = f"{supabase_url.rstrip('/')}/rest/v1/eccia_masterclass_certificados"
    payload = json.dumps(rows).encode("utf-8")
    request = urllib.request.Request(endpoint, data=payload, method="POST")
    request.add_header("apikey", secret_key)
    request.add_header("Authorization", f"Bearer {secret_key}")
    request.add_header("Content-Type", "application/json")
    request.add_header("Prefer", "return=representation")

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            inserted = json.loads(response.read() or b"[]")
            print(f"inserted {len(inserted)} row(s)")
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        fail(f"insert failed ({error.code}): {detail}")
    except urllib.error.URLError as error:
        fail(f"insert failed: {error.reason}")


def command_load(args: argparse.Namespace) -> int:
    supabase_url = required_env("SUPABASE_URL")
    secret_key = required_env("SUPABASE_SERVICE_ROLE_KEY")
    public_base_url = required_env("CERTIFICATE_PUBLIC_BASE_URL").rstrip("/")

    if secret_key.startswith("sb_publishable_"):
        fail("SUPABASE_SERVICE_ROLE_KEY holds a publishable key; this needs the service role key")

    with open(args.csv, newline="", encoding="utf-8") as handle:
        raw_rows = list(csv.DictReader(handle))

    if not raw_rows:
        fail(f"{args.csv} has no data rows")

    rows: list[dict] = []
    skipped: list[str] = []

    for raw in raw_rows:
        code = (raw.get("codigo_certificado") or "").strip().upper()
        name = re.sub(r"\s+", " ", (raw.get("nombre_completo") or "").strip())
        email = (raw.get("correo") or "").strip().lower()
        path = (raw.get("nextcloud_path") or "").strip()

        if not CODE_PATTERN.match(code):
            skipped.append(f"{code or '<blank>'}: invalid certificate code")
            continue

        if (raw.get("revisar") or "").strip().upper() == "SI" and not args.include_flagged:
            skipped.append(f"{code}: flagged for review (pass --include-flagged to load anyway)")
            continue

        # Matches the CHECK constraint the table enforces on nombre_completo.
        if len(name) < 5 or " " not in name:
            skipped.append(f"{code}: name is missing or implausible ({name!r})")
            continue

        if not email:
            if not args.allow_placeholder_email:
                skipped.append(f"{code}: no email (pass --allow-placeholder-email to synthesise one)")
                continue
            email = f"recuperado.{code.lower()}@{PLACEHOLDER_EMAIL_DOMAIN}"

        rows.append(
            {
                "nombre_completo": name,
                "correo": email,
                "masterclass_codigo": MASTERCLASS_CODE,
                "codigo_certificado": code,
                "validation_url": f"{public_base_url}/validar-certificado.html?code={code}",
                "nextcloud_path": path or f"{REMOTE_DIR}/{code}.pdf",
                # The PDF exists and was mailed at the time, so this is the
                # honest terminal state. Timestamps are left NULL rather than
                # invented: validate-certificate falls back through
                # emailed_at -> uploaded_at -> generated_at and simply reports
                # no issue date, which beats a fabricated one.
                "certificate_status": "emailed",
                "certificate_attempts": 1,
            }
        )

    for message in skipped:
        print(f"skipped {message}")

    print(f"\n{len(rows)} row(s) ready, {len(skipped)} skipped")

    if not rows:
        return 1

    if args.dry_run:
        print("\n--dry-run: nothing was written. Sample payload:")
        print(json.dumps(rows[0], indent=2, ensure_ascii=False))
        return 0

    postgrest_insert(supabase_url, secret_key, rows)
    print("\nVerify by scanning a real printed certificate before closing this out.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--env-file",
        default=str(Path(__file__).resolve().parent.parent / ".env"),
        help="path to the .env file to load (default: the repository root .env)",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    extract_parser = subparsers.add_parser("extract", help="Nextcloud -> CSV (read-only)")
    extract_parser.add_argument("--out", default="certificates.csv", help="output CSV path")
    extract_parser.add_argument(
        "--remote-dir",
        default=REMOTE_DIR,
        help=f"certificate directory relative to NEXTCLOUD_WEBDAV_URL (default: {REMOTE_DIR})",
    )
    extract_parser.set_defaults(func=command_extract)

    load_parser = subparsers.add_parser("load", help="CSV -> Supabase (writes rows)")
    load_parser.add_argument("--csv", default="certificates.csv", help="reviewed CSV path")
    load_parser.add_argument("--dry-run", action="store_true", help="validate and print, write nothing")
    load_parser.add_argument("--include-flagged", action="store_true", help="also load rows marked revisar=SI")
    load_parser.add_argument(
        "--allow-placeholder-email",
        action="store_true",
        help=f"synthesise recuperado.<code>@{PLACEHOLDER_EMAIL_DOMAIN} when the email is unknown",
    )
    load_parser.set_defaults(func=command_load)

    args = parser.parse_args()

    env_path = Path(args.env_file)
    loaded = load_dotenv(env_path)
    if loaded:
        print(f"loaded {loaded} variable(s) from {env_path}")
    elif not env_path.is_file():
        # Plain ASCII: the Windows console default codepage mangles em dashes.
        print(f"note: {env_path} not found, relying on the current environment")

    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
