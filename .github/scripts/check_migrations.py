from pathlib import Path

from pglast import parse_sql


migrations_dir = Path("supabase/migrations")
migrations = sorted(migrations_dir.glob("*.sql"))
if not migrations:
    raise SystemExit(f"No SQL migrations found in {migrations_dir}")

errors = []
for migration in migrations:
    try:
        parse_sql(migration.read_text(encoding="utf-8"))
    except Exception as error:
        errors.append(f"{migration}: {error}")

if errors:
    raise SystemExit("Migration syntax errors:\n" + "\n".join(errors))

print(f"Parsed {len(migrations)} migration(s) successfully.")
