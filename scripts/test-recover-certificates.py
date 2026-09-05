"""Exercise extract_fields_from_pdf against synthetic certificates.

Builds minimal PDFs that place text exactly where issue-certificate's
stampCertificate() places it, then checks the recovery script finds it.
"""

import importlib.util
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("recover", REPO / "scripts" / "recover-certificates.py")
recover = importlib.util.module_from_spec(spec)
sys.modules["recover"] = recover  # @dataclass resolves annotations via sys.modules
spec.loader.exec_module(recover)


def build_pdf(lines):
    """lines: list of (x, y, size, text). Returns bytes of a valid 842x595 PDF."""
    content = ""
    for x, y, size, text in lines:
        escaped = text.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")
        content += f"BT /F1 {size} Tf {x} {y} Td ({escaped}) Tj ET\n"
    stream = content.encode("latin-1")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for index, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{index} 0 obj\n".encode() + body + b"\nendobj\n"

    xref_at = len(out)
    out += f"xref\n0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for offset in offsets:
        out += f"{offset:010d} 00000 n \n".encode()
    out += (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_at}\n%%EOF\n"
    ).encode()
    return bytes(out)


NAME_Y = recover.NAME_BASELINE_Y
NAME_X = recover.NAME_X
print(f"script expects the name at x~{NAME_X:.2f}, baseline y~{NAME_Y:.2f}\n")

failures = 0


def check(label, condition, detail=""):
    global failures
    if condition:
        print(f"  PASS  {label}")
    else:
        failures += 1
        print(f"  FAIL  {label}  {detail}")


# --- 1. happy path: name on the real baseline, code caption elsewhere --------
print("1. well-formed certificate")
pdf = build_pdf([
    (NAME_X, NAME_Y, 27, "JUAN DAVID AGUILAR COLQUEHUANCA"),
    (600, 120, 6, "Codigo: ECCIA-UT1-DEADBEEF"),
    (NAME_X, NAME_Y + 36, 11, "otorgado a"),
    (NAME_X, NAME_Y - 49, 11, "Por su participacion en el seminario."),
])
name, code, notes = recover.extract_fields_from_pdf(pdf)
check("name extracted", name == "JUAN DAVID AGUILAR COLQUEHUANCA", f"got {name!r}")
check("code extracted", code == "ECCIA-UT1-DEADBEEF", f"got {code!r}")
check("no warnings", notes == [], f"got {notes}")

# --- 2. accented name, real-world shape -------------------------------------
print("\n2. accented name")
pdf = build_pdf([
    (NAME_X, NAME_Y, 25, "MARIA JOSE PENA GOMEZ"),
    (600, 120, 6, "Codigo: ECCIA-UT1-0A1B2C3D"),
])
name, code, notes = recover.extract_fields_from_pdf(pdf)
check("name extracted", name == "MARIA JOSE PENA GOMEZ", f"got {name!r}")
check("code extracted", code == "ECCIA-UT1-0A1B2C3D", f"got {code!r}")

# --- 3. name slightly off baseline, still within tolerance ------------------
print("\n3. baseline drift within tolerance")
pdf = build_pdf([
    (NAME_X, NAME_Y + 3, 27, "CARLOS ANDRES RUIZ"),
    (600, 120, 6, "Codigo: ECCIA-UT1-11223344"),
])
name, _, _ = recover.extract_fields_from_pdf(pdf)
check("name still found", name == "CARLOS ANDRES RUIZ", f"got {name!r}")

# --- 4. nothing on the baseline: must warn, not silently return junk --------
print("\n4. layout changed / nothing on the name baseline")
pdf = build_pdf([
    (NAME_X, 500, 27, "SOMETHING ELSE ENTIRELY"),
    (600, 120, 6, "Codigo: ECCIA-UT1-99887766"),
])
name, code, notes = recover.extract_fields_from_pdf(pdf)
check("name empty", name == "", f"got {name!r}")
check("warned about baseline", any("baseline" in note for note in notes), f"got {notes}")
check("code still extracted", code == "ECCIA-UT1-99887766", f"got {code!r}")

# --- 5. missing code caption ------------------------------------------------
print("\n5. no code caption in the PDF")
pdf = build_pdf([(NAME_X, NAME_Y, 27, "ANA LUCIA TORRES")])
name, code, notes = recover.extract_fields_from_pdf(pdf)
check("name extracted", name == "ANA LUCIA TORRES", f"got {name!r}")
check("code empty", code == "", f"got {code!r}")
check("warned about code", any("code" in note for note in notes), f"got {notes}")

# --- 6. single-word name must be flagged as implausible ---------------------
print("\n6. implausible single-word name")
pdf = build_pdf([
    (NAME_X, NAME_Y, 27, "JUAN"),
    (600, 120, 6, "Codigo: ECCIA-UT1-AABBCCDD"),
])
name, _, notes = recover.extract_fields_from_pdf(pdf)
check("flagged implausible", any("implausible" in note for note in notes), f"got {notes}")

# --- 7. unparseable input ---------------------------------------------------
print("\n7. garbage input")
name, code, notes = recover.extract_fields_from_pdf(b"this is not a pdf")
check("returns empty", name == "" and code == "", f"got {name!r}/{code!r}")
check("warns", notes != [], "expected a note")

# --- 8. REGRESSION: every font size stampCertificate can pick ---------------
# nameSize = len > 34 ? 22 : len > 26 ? 25 : 27. Matching on LTChar.y0 instead
# of the text-matrix baseline drifts with font size and silently loses the
# longest names, which are exactly the ones rendered at 22pt.
print("\n8. regression: all three name font sizes")
for size, sample in ((27, "ANA TORRES"), (25, "MARIA JOSE PENA GOMEZ RUIZ"), (22, "JUAN DAVID AGUILAR COLQUEHUANCA DE LA CRUZ")):
    pdf = build_pdf([
        (NAME_X, NAME_Y, size, sample),
        (600, 120, 6, "Codigo: ECCIA-UT1-5566AABB"),
    ])
    name, _, notes = recover.extract_fields_from_pdf(pdf)
    check(f"size {size}pt ({len(sample)} chars)", name == sample, f"got {name!r} notes={notes}")

# --- 9. WebDAV URL building over ECCIA's real folder layout -----------------
# The certificates live under "1000 ECCIA/04. CERTIFICADOS EVENTOS/...", so the
# base URL carries spaces and dots. Quoting an already-encoded base turns %20
# into %2520 and every download 404s.
print("\n9. WebDAV URL encoding (real ECCIA folder layout)")
HOST = "https://drive.littusgroup.com"
ROOT = f"{HOST}/remote.php/dav/files/USUARIO"
EXPECTED = (
    "/remote.php/dav/files/USUARIO/1000%20ECCIA/04.%20CERTIFICADOS%20EVENTOS"
    "/20260703_MASTERCLASS_UT/masterclass-ultrasonido-nivel-i/2026"
)

encoded_base = f"{ROOT}/1000%20ECCIA/04.%20CERTIFICADOS%20EVENTOS/20260703_MASTERCLASS_UT"
raw_base = f"{ROOT}/1000 ECCIA/04. CERTIFICADOS EVENTOS/20260703_MASTERCLASS_UT"

url = recover.build_webdav_url(encoded_base, "masterclass-ultrasonido-nivel-i/2026")
check("pre-encoded base is not double-encoded", "%2520" not in url, f"got {url}")
check("pre-encoded base builds the right path", url == HOST + EXPECTED, f"got {url}")

url = recover.build_webdav_url(raw_base, "masterclass-ultrasonido-nivel-i/2026")
check("raw base encodes to the same URL", url == HOST + EXPECTED, f"got {url}")

url = recover.build_webdav_url(encoded_base, "masterclass-ultrasonido-nivel-i/2026", trailing_slash=True)
check("trailing slash for PROPFIND", url == HOST + EXPECTED + "/", f"got {url}")

url = recover.build_webdav_url(encoded_base, "masterclass-ultrasonido-nivel-i/2026", "ECCIA-UT1-DEADBEEF.pdf")
check("file URL", url == HOST + EXPECTED + "/ECCIA-UT1-DEADBEEF.pdf", f"got {url}")

url = recover.build_webdav_url(ROOT + "/", "/masterclass-ultrasonido-nivel-i/2026/")
check(
    "stray slashes collapse",
    url == f"{HOST}/remote.php/dav/files/USUARIO/masterclass-ultrasonido-nivel-i/2026",
    f"got {url}",
)

print(f"\n{'ALL CHECKS PASSED' if failures == 0 else f'{failures} CHECK(S) FAILED'}")
sys.exit(1 if failures else 0)
