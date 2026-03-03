import subprocess
import tempfile
import asyncio
from pathlib import Path


class ArduinoCLIService:
    def __init__(self, cli_path: str = "arduino-cli"):
        self.cli_path = cli_path
        self._ensure_core_installed()

    def _ensure_core_installed(self):
        """
        Ensure Arduino AVR core is installed
        """
        try:
            # Check if core is installed
            result = subprocess.run(
                [self.cli_path, "core", "list"],
                capture_output=True,
                text=True
            )

            if "arduino:avr" not in result.stdout:
                print("Arduino AVR core not installed. Installing...")
                # Install AVR core
                subprocess.run(
                    [self.cli_path, "core", "install", "arduino:avr"],
                    check=True
                )
                print("Arduino AVR core installed successfully")
        except Exception as e:
            print(f"Warning: Could not verify arduino:avr core: {e}")
            print("Please ensure arduino-cli is installed and in PATH")

    async def compile(self, code: str, board_fqbn: str = "arduino:avr:uno") -> dict:
        """
        Compile Arduino sketch using arduino-cli

        Returns:
            dict with keys: success, hex_content, stdout, stderr, error
        """
        print(f"\n=== Starting compilation ===")
        print(f"Board: {board_fqbn}")
        print(f"Code length: {len(code)} chars")
        print(f"Code:\n{code}")

        # Create temporary directory for sketch
        with tempfile.TemporaryDirectory() as temp_dir:
            sketch_dir = Path(temp_dir) / "sketch"
            sketch_dir.mkdir()

            # arduino-cli requires sketch name to match directory name
            sketch_file = sketch_dir / "sketch.ino"
            sketch_file.write_text(code)
            print(f"Created sketch file: {sketch_file}")

            build_dir = sketch_dir / "build"
            build_dir.mkdir()
            print(f"Build directory: {build_dir}")

            try:
                # Run compilation using subprocess.run in a thread (Windows compatible)
                cmd = [
                    self.cli_path,
                    "compile",
                    "--fqbn", board_fqbn,
                    "--output-dir", str(build_dir),
                    str(sketch_dir)
                ]
                print(f"Running command: {' '.join(cmd)}")

                # Use subprocess.run in a thread for Windows compatibility
                def run_compile():
                    return subprocess.run(
                        cmd,
                        capture_output=True,
                        text=True
                    )

                result = await asyncio.to_thread(run_compile)

                print(f"Process return code: {result.returncode}")
                print(f"Stdout: {result.stdout}")
                print(f"Stderr: {result.stderr}")

                if result.returncode == 0:
                    # Read compiled hex file
                    hex_file = build_dir / "sketch.ino.hex"
                    print(f"Looking for hex file at: {hex_file}")
                    print(f"Hex file exists: {hex_file.exists()}")

                    if hex_file.exists():
                        hex_content = hex_file.read_text()
                        print(f"Hex file size: {len(hex_content)} bytes")
                        print("=== Compilation successful ===\n")
                        return {
                            "success": True,
                            "hex_content": hex_content,
                            "stdout": result.stdout,
                            "stderr": result.stderr
                        }
                    else:
                        # List files in build directory
                        print(f"Files in build dir: {list(build_dir.iterdir())}")
                        print("=== Compilation failed: hex file not found ===\n")
                        return {
                            "success": False,
                            "error": "Hex file not found after compilation",
                            "stdout": result.stdout,
                            "stderr": result.stderr
                        }
                else:
                    print("=== Compilation failed ===\n")
                    return {
                        "success": False,
                        "error": "Compilation failed",
                        "stdout": result.stdout,
                        "stderr": result.stderr
                    }

            except Exception as e:
                print(f"=== Exception during compilation: {e} ===\n")
                import traceback
                traceback.print_exc()
                return {
                    "success": False,
                    "error": str(e),
                    "stdout": "",
                    "stderr": ""
                }

    async def list_boards(self) -> list:
        """
        List available Arduino boards
        """
        try:
            process = await asyncio.create_subprocess_exec(
                self.cli_path,
                "board",
                "listall",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout, _ = await process.communicate()

            # Parse output (format: "Board Name    FQBN")
            boards = []
            for line in stdout.decode().splitlines()[1:]:  # Skip header
                if line.strip():
                    parts = line.split()
                    if len(parts) >= 2:
                        name = " ".join(parts[:-1])
                        fqbn = parts[-1]
                        boards.append({"name": name, "fqbn": fqbn})

            return boards

        except Exception as e:
            print(f"Error listing boards: {e}")
            return []
