import os
import sys

OUTPUT_FILE = 'system_architecture.txt'

# 1. Essential Source, Config, and Manifest Extensions
VALID_EXTENSIONS = (
    '.py', '.jsx', '.js', '.ts', '.tsx', '.json',
    '.env', '.ini', '.toml', '.yaml', '.yml',
    '.sql', '.html', '.css', '.md', '.sh', '.ps1'
)

# Exact filenames to always include even if they have no standard extension
ALWAYS_INCLUDE_FILES = {
    'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
    '.dockerignore', 'requirements.txt', 'alembic.ini',
    'package.json', '.env', '.env.example', '.env.production'
}

# 2. Heavy dependency, build, and internal tracking folders to ignore
GLOBAL_IGNORE_DIRS = {
    'node_modules', 'venv', '.venv', 'env', '__pycache__',
    '.git', '.github', '.vscode', '.idea',
    '.pytest_cache', 'coverage', '.nyc_output',
    'dist', 'build', 'out', '.next', '.nuxt', '.cache'
}

# 3. Exact lockfiles and generated output to skip
IGNORE_EXACT_FILES = {
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'poetry.lock',
    'Pipfile.lock',
    OUTPUT_FILE
}

# 4. Skip tests, minified builds, and map files
IGNORE_NAME_CONTAINS = (
    '.min.', '.bundle.', '.map', '.test.', '.spec.',
    '_test.py', 'test_'
)

# Binary extensions to note by name and size (without dumping binary text)
BINARY_EXTENSIONS = (
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
    '.pdf', '.docx', '.xlsx', '.zip', '.tar', '.gz',
    '.sqlite', '.sqlite3', '.db', '.pyc'
)

MAX_FILE_SIZE_KB = 500  # 500 KB limit per file


def is_binary_or_asset(filename):
    return filename.lower().endswith(BINARY_EXTENSIONS)


def should_skip_file(filename, file_path):
    if filename in IGNORE_EXACT_FILES:
        return True
    if any(pattern in filename for pattern in IGNORE_NAME_CONTAINS):
        return True
    
    # Check if recognized source or config file
    has_valid_ext = filename.endswith(VALID_EXTENSIONS) or filename.startswith('.env')
    is_exact_match = filename in ALWAYS_INCLUDE_FILES
    
    if not (has_valid_ext or is_exact_match or is_binary_or_asset(filename)):
        return True

    return False


def build_directory_tree(start_path):
    """Builds a comprehensive visual ASCII tree of the entire project."""
    tree_lines = []
    tree_lines.append("=" * 70)
    tree_lines.append("COMPLETE SYSTEM DIRECTORY TREE MAP")
    tree_lines.append("=" * 70)
    
    for root, dirs, files in os.walk(start_path):
        dirs[:] = [d for d in dirs if d not in GLOBAL_IGNORE_DIRS and not d.startswith('.')]
        dirs.sort()
        files.sort()

        rel_path = os.path.relpath(root, start_path)
        if rel_path == '.':
            level = 0
            tree_lines.append("📁 [PROJECT ROOT]")
        else:
            level = rel_path.count(os.sep) + 1
            indent = "    " * (level - 1)
            tree_lines.append(f"{indent}📁 {os.path.basename(root)}/")

        sub_indent = "    " * level
        for f in files:
            if f in IGNORE_EXACT_FILES:
                continue
            tree_lines.append(f"{sub_indent}📄 {f}")

    tree_lines.append("\n" + "=" * 70 + "\n")
    return "\n".join(tree_lines)


print(f"Scanning and bundling system architecture into '{OUTPUT_FILE}'...")

with open(OUTPUT_FILE, 'w', encoding='utf-8', errors='replace') as outfile:
    # 1. Write the full project directory map first
    outfile.write(build_directory_tree('.'))

    # 2. Dump file contents
    file_count = 0
    binary_count = 0

    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in GLOBAL_IGNORE_DIRS and not d.startswith('.')]
        dirs.sort()
        files.sort()

        for file in files:
            file_path = os.path.join(root, file)

            if should_skip_file(file, file_path):
                continue

            clean_display_path = file_path.replace('\\', '/')
            file_size_kb = os.path.getsize(file_path) / 1024

            outfile.write(f"\n=========================================\n")
            outfile.write(f"CORE SYSTEM FILE: {clean_display_path}\n")
            outfile.write(f"=========================================\n\n")

            # Check if it's a binary asset/image
            if is_binary_or_asset(file):
                outfile.write(f"[Binary Asset File: {file} | Size: {file_size_kb:.1f} KB]\n")
                binary_count += 1
                continue

            # Check file size cap
            if file_size_kb > MAX_FILE_SIZE_KB:
                outfile.write(f"[File skipped: Exceeds size limit ({file_size_kb:.1f} KB > {MAX_FILE_SIZE_KB} KB)]\n")
                continue

            # Read text file content
            try:
                with open(file_path, 'r', encoding='utf-8', errors='replace') as infile:
                    outfile.write(infile.read())
                    file_count += 1
            except Exception as e:
                outfile.write(f"[Could not read file: {e}]\n")

print(f"Done! Successfully generated '{OUTPUT_FILE}'.")
print(f"Captured: {file_count} text files, {binary_count} binary assets.")