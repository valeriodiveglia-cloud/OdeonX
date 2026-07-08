import os
import sys
import re
import subprocess

DB_HOST = "aws-0-ap-southeast-1.pooler.supabase.com"
DB_USER = "postgres.hgcxnkkvpnjhkpchgbuz"
DB_PORT = "5432"
DB_NAME = "postgres"
DB_PASS = "vTR$ZBLy3H.wKt7"

MIGRATIONS_DIR = "supabase/migrations"

# Error messages to ignore (indicating the migration has already been applied)
ALREADY_EXISTS_KEYWORDS = [
    "already exists",
    "duplicate key value violates unique constraint",
    "column \"failed_login_attempts\" of relation \"hr_staff\" already exists",
    "column \"portal_password_hash\" of relation \"hr_staff\" already exists",
    "column \"locked_until\" of relation \"hr_staff\" already exists",
]

def run_psql(query_or_file, is_file=False):
    """Runs psql inside docker container. Returns stdout and stderr."""
    docker_cmd = [
        "docker", "run", "--rm",
        "-e", f"PGPASSWORD={DB_PASS}",
    ]
    
    if is_file:
        # We need to mount the directory to read the file inside container
        abs_path = os.path.abspath(query_or_file)
        file_dir = os.path.dirname(abs_path)
        file_name = os.path.basename(abs_path)
        docker_cmd.extend([
            "-v", f"{file_dir}:/migration_dir",
            "postgres:17.4-alpine",
            "psql", "-h", DB_HOST, "-U", DB_USER, "-p", DB_PORT, "-d", DB_NAME,
            "-f", f"/migration_dir/{file_name}"
        ])
    else:
        docker_cmd.extend([
            "postgres:17.4-alpine",
            "psql", "-h", DB_HOST, "-U", DB_USER, "-p", DB_PORT, "-d", DB_NAME,
            "-A", "-t", "-c", query_or_file
        ])

    proc = subprocess.run(docker_cmd, capture_output=True, text=True)
    return proc.returncode, proc.stdout, proc.stderr

def get_applied_versions():
    code, stdout, stderr = run_psql("SELECT version FROM supabase_migrations.schema_migrations ORDER BY version ASC;")
    if code != 0:
        print(f"Error fetching applied migrations: {stderr}", file=sys.stderr)
        sys.exit(1)
    
    versions = [line.strip() for line in stdout.strip().split('\n') if line.strip()]
    return set(versions)

def get_local_migrations():
    if not os.path.exists(MIGRATIONS_DIR):
        print(f"Migrations directory '{MIGRATIONS_DIR}' not found.", file=sys.stderr)
        sys.exit(1)
    
    files = os.listdir(MIGRATIONS_DIR)
    migrations = []
    
    # Matches <timestamp>_<name>.sql or <numeric>_<name>.sql
    pattern = re.compile(r"^(\d+)(?:_(.+))?\.sql$")
    for f in files:
        m = pattern.match(f)
        if m:
            version = m.group(1)
            name = m.group(2) or ""
            # Only consider migrations starting from 2026-07-01
            if int(version) >= 20260701000000:
                migrations.append({
                    "version": version,
                    "name": name,
                    "filename": f,
                    "filepath": os.path.join(MIGRATIONS_DIR, f)
                })
            
    # Sort migrations by version (numeric value)
    migrations.sort(key=lambda x: int(x["version"]))
    return migrations

def is_already_applied_error(stderr_text):
    for kw in ALREADY_EXISTS_KEYWORDS:
        if kw.lower() in stderr_text.lower():
            return True
    return False

def main():
    dry_run = "--apply" not in sys.argv
    
    print("Fetching applied migrations from production database...")
    applied = get_applied_versions()
    print(f"Found {len(applied)} migrations applied on production.")
    
    local_migrations = get_local_migrations()
    print(f"Found {len(local_migrations)} local migration files starting from 2026-07-01.")
    
    pending = []
    for m in local_migrations:
        v = m["version"]
        # Special case: 20260705190000 is already applied in prod under the version 20260705105102
        if v == "20260705190000" and "20260705105102" in applied:
            if "20260705190000" not in applied:
                pending.append((m, True)) # Register only
            continue
            
        if v not in applied:
            pending.append((m, False))
            
    if not pending:
        print("\nAll local migrations (from 2026-07-01 onwards) are already applied to production database. Nothing to do!")
        return
        
    print(f"\nFound {len(pending)} pending migrations to deploy:")
    for m, register_only in pending:
        status = "[REGISTER ONLY (ALREADY IN PROD)]" if register_only else "[SQL + REGISTER]"
        print(f" - {m['version']} - {m['name']} {status}")
        
    if dry_run:
        print("\n*** DRY RUN MODE ***")
        print("To apply these migrations, run this script with --apply:")
        print("python3 scratch/apply_migrations.py --apply")
        return
        
    print("\nStarting migration execution...")
    for m, register_only in pending:
        v = m["version"]
        name = m["name"]
        
        if register_only:
            print(f"Registering version {v} ({name}) (SQL skipped as it is already in prod)...")
            register_query = f"INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('{v}');"
            code, stdout, stderr = run_psql(register_query)
            if code != 0:
                print(f"Failed to register version {v}: {stderr}", file=sys.stderr)
                sys.exit(1)
            print(f"Version {v} registered successfully.")
        else:
            print(f"Executing SQL migration {v} ({name})...")
            code, stdout, stderr = run_psql(m["filepath"], is_file=True)
            if code != 0:
                if is_already_applied_error(stderr):
                    print(f"WARNING: SQL Migration {v} returned an 'already exists' error. Assuming it was already applied manually.")
                else:
                    print(f"SQL Migration {v} failed: {stderr}", file=sys.stderr)
                    sys.exit(1)
            else:
                print(f"Migration {v} executed successfully.")
                
            print(f"Registering version {v} in schema_migrations...")
            register_query = f"INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('{v}') ON CONFLICT (version) DO NOTHING;"
            code, stdout, stderr = run_psql(register_query)
            if code != 0:
                print(f"Failed to register version {v}: {stderr}", file=sys.stderr)
                sys.exit(1)
            print(f"Version {v} registered successfully.")
            
    print("\nAll migrations applied successfully! Refreshing PostgREST schema cache...")
    code, stdout, stderr = run_psql("NOTIFY pgrst, 'reload schema';")
    if code != 0:
        print(f"Failed to reload PostgREST schema cache: {stderr}", file=sys.stderr)
    else:
        print("PostgREST schema cache reloaded successfully.")

if __name__ == "__main__":
    main()
