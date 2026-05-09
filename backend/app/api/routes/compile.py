import asyncio
import logging
import time
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user
from app.database.session import AsyncSessionLocal, get_db
from app.models.user import User
from app.services.arduino_cli import ArduinoCLIService
from app.services.metrics import record_compile
from app.services.espidf_compiler import espidf_compiler

logger = logging.getLogger(__name__)

router = APIRouter()
arduino_cli = ArduinoCLIService()

# ── Async compile job registry ───────────────────────────────────────────────
# In-process job dict for /compile/start + /compile/status/{job_id}. Cold ESP-IDF
# builds can take 5-7 minutes — far longer than Cloudflare's 100s edge timeout
# that hits any single HTTP request. The async path lets the client poll a
# short-lived status endpoint instead of holding one long-lived POST open.
#
# Single-instance only: if velxio ever scales to multiple FastAPI workers, this
# needs to move to Redis or the sqlite database. For now one process is fine.
COMPILE_JOBS: dict[str, dict[str, Any]] = {}
JOB_TTL_S = 1800  # purge results 30 min after completion


def _purge_expired_jobs() -> None:
    """Drop completed jobs older than JOB_TTL_S so the dict doesn't grow forever."""
    now = time.time()
    stale = [
        jid for jid, job in COMPILE_JOBS.items()
        if job.get("state") in ("done", "error")
        and now - job.get("finished_at", now) > JOB_TTL_S
    ]
    for jid in stale:
        COMPILE_JOBS.pop(jid, None)


class SketchFile(BaseModel):
    name: str
    content: str


class CompileRequest(BaseModel):
    # New multi-file API
    files: list[SketchFile] | None = None
    # Legacy single-file API (kept for backward compat)
    code: str | None = None
    board_fqbn: str = "arduino:avr:uno"
    # Optional: associate this compile with a project for analytics
    project_id: str | None = None


class CompileResponse(BaseModel):
    success: bool
    hex_content: str | None = None
    binary_content: str | None = None  # base64-encoded .bin for RP2040
    binary_type: str | None = None     # 'bin' or 'uf2'
    has_wifi: bool = False             # True when sketch uses WiFi (ESP32 only)
    stdout: str
    stderr: str
    error: str | None = None
    core_install_log: str | None = None


def _classify_compile_error(stderr: str, error: str | None) -> str:
    """Map raw compiler output to a stable error_kind for analytics."""
    haystack = f"{error or ''}\n{stderr or ''}".lower()
    if "no such file or directory" in haystack or "fatal error:" in haystack:
        return "missing_library"
    if "core install" in haystack or "failed to install" in haystack:
        return "core_install_failed"
    if "undefined reference" in haystack:
        return "linker_error"
    if "expected" in haystack and "before" in haystack:
        return "syntax_error"
    if "error:" in haystack:
        return "compile_error"
    return "unknown"


def _resolve_files(request: CompileRequest) -> list[dict[str, str]]:
    """Normalise the multi-file vs legacy single-file request bodies."""
    if request.files:
        return [{"name": f.name, "content": f.content} for f in request.files]
    if request.code is not None:
        return [{"name": "sketch.ino", "content": request.code}]
    raise HTTPException(
        status_code=422,
        detail="Provide either 'files' or 'code' in the request body.",
    )


async def _run_compile(
    request: CompileRequest,
    files: list[dict[str, str]],
) -> CompileResponse:
    """Do the actual compile (ESP-IDF for esp32:*, arduino-cli otherwise)."""
    if request.board_fqbn.startswith("esp32:") and espidf_compiler.available:
        logger.info(f"[compile] Using ESP-IDF for {request.board_fqbn}")
        result = await espidf_compiler.compile(files, request.board_fqbn)
        return CompileResponse(
            success=result["success"],
            hex_content=result.get("hex_content"),
            binary_content=result.get("binary_content"),
            binary_type=result.get("binary_type"),
            has_wifi=result.get("has_wifi", False),
            stdout=result.get("stdout", ""),
            stderr=result.get("stderr", ""),
            error=result.get("error"),
        )

    # AVR, RP2040, and ESP32 fallback: use arduino-cli
    core_status = await arduino_cli.ensure_core_for_board(request.board_fqbn)
    core_log = core_status.get("log", "")
    if core_status.get("needed") and not core_status.get("installed"):
        return CompileResponse(
            success=False,
            stdout="",
            stderr=core_log,
            error=f"Failed to install required core: {core_status.get('core_id')}",
        )

    result = await arduino_cli.compile(files, request.board_fqbn)
    return CompileResponse(
        success=result["success"],
        hex_content=result.get("hex_content"),
        binary_content=result.get("binary_content"),
        binary_type=result.get("binary_type"),
        stdout=result.get("stdout", ""),
        stderr=result.get("stderr", ""),
        error=result.get("error"),
        core_install_log=core_log if core_log else None,
    )


async def _record_async_metric(
    *,
    user_id: int | None,
    project_id: str | None,
    board_fqbn: str,
    success: bool,
    duration_ms: int,
    error_kind: str | None,
    extra: dict[str, Any],
) -> None:
    """Open a fresh DB session and record one compile metric.

    Used by the async path: the request-scoped session is gone by the time
    the background task finishes, so we open our own short-lived one.
    Country/IP tagging is dropped on this path (the original Request is no
    longer alive); user_id and success/duration still flow through.
    """
    try:
        async with AsyncSessionLocal() as session:
            user = None
            if user_id is not None:
                user = await session.get(User, user_id)
            await record_compile(
                session,
                user=user,
                project_id=project_id,
                board_fqbn=board_fqbn,
                success=success,
                duration_ms=duration_ms,
                error_kind=error_kind,
                extra=extra,
                request=None,
            )
    except Exception as exc:
        logger.warning(f"[compile] async metric record failed: {exc}")


async def _compile_job(
    job_id: str,
    request: CompileRequest,
    files: list[dict[str, str]],
    user_id: int | None,
) -> None:
    """Background worker: run the compile, store result in COMPILE_JOBS."""
    started = time.monotonic()
    try:
        COMPILE_JOBS[job_id]["state"] = "running"
        response = await _run_compile(request, files)
        COMPILE_JOBS[job_id] = {
            "state": "done",
            "started_at": COMPILE_JOBS[job_id]["started_at"],
            "finished_at": time.time(),
            "result": response.model_dump(),
        }
        error_kind = (
            None if response.success
            else _classify_compile_error(response.stderr, response.error)
        )
        await _record_async_metric(
            user_id=user_id,
            project_id=request.project_id,
            board_fqbn=request.board_fqbn,
            success=response.success,
            duration_ms=int((time.monotonic() - started) * 1000),
            error_kind=error_kind,
            extra={"file_count": len(files), "has_wifi": response.has_wifi, "async": True},
        )
    except Exception as exc:
        logger.exception(f"[compile] async job {job_id} failed")
        COMPILE_JOBS[job_id] = {
            "state": "error",
            "started_at": COMPILE_JOBS[job_id]["started_at"],
            "finished_at": time.time(),
            "error": str(exc)[:500],
        }
        await _record_async_metric(
            user_id=user_id,
            project_id=request.project_id,
            board_fqbn=request.board_fqbn,
            success=False,
            duration_ms=int((time.monotonic() - started) * 1000),
            error_kind="exception",
            extra={"file_count": len(files), "exception": str(exc)[:200], "async": True},
        )


@router.post("/", response_model=CompileResponse)
async def compile_sketch(
    request: CompileRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
):
    """
    Compile Arduino sketch and return hex/binary in a single response.

    Synchronous path: held open until the build finishes. Works for AVR /
    RP2040 builds (seconds), but ESP-IDF cold builds can run 5-7 minutes
    and will hit Cloudflare's 100s edge timeout (HTTP 524). Use the async
    path (`/compile/start` + `/compile/status/{job_id}`) for those.

    Accepts either `files` (multi-file) or legacy `code` (single file).
    Auto-installs the required board core if not present.
    """
    files = _resolve_files(request)
    started = time.monotonic()
    try:
        response = await _run_compile(request, files)
    except Exception as e:
        await record_compile(
            db,
            user=current_user,
            project_id=request.project_id,
            board_fqbn=request.board_fqbn,
            success=False,
            duration_ms=int((time.monotonic() - started) * 1000),
            error_kind="exception",
            extra={"file_count": len(files), "exception": str(e)[:200]},
            request=http_request,
        )
        raise HTTPException(status_code=500, detail=str(e))

    duration_ms = int((time.monotonic() - started) * 1000)
    await record_compile(
        db,
        user=current_user,
        project_id=request.project_id,
        board_fqbn=request.board_fqbn,
        success=response.success,
        duration_ms=duration_ms,
        error_kind=None if response.success else _classify_compile_error(response.stderr, response.error),
        extra={"file_count": len(files), "has_wifi": response.has_wifi},
        request=http_request,
    )
    return response


class CompileStartResponse(BaseModel):
    job_id: str


class CompileStatusResponse(BaseModel):
    state: str  # 'pending' | 'running' | 'done' | 'error'
    started_at: float
    finished_at: float | None = None
    result: CompileResponse | None = None
    error: str | None = None


@router.post("/start", response_model=CompileStartResponse)
async def compile_start(
    request: CompileRequest,
    current_user: User | None = Depends(get_current_user),
):
    """
    Queue a compile and return a `job_id` immediately.

    The actual compile runs in a background task; clients then poll
    `GET /compile/status/{job_id}` every couple of seconds until state is
    `done` or `error`. This sidesteps Cloudflare's 100s HTTP edge timeout —
    each individual request returns in milliseconds.
    """
    files = _resolve_files(request)
    _purge_expired_jobs()

    job_id = uuid.uuid4().hex
    COMPILE_JOBS[job_id] = {"state": "pending", "started_at": time.time()}

    asyncio.create_task(
        _compile_job(
            job_id=job_id,
            request=request,
            files=files,
            user_id=current_user.id if current_user else None,
        ),
    )
    return CompileStartResponse(job_id=job_id)


@router.get("/status/{job_id}", response_model=CompileStatusResponse)
async def compile_status(job_id: str):
    """Poll the status of an async compile job submitted via /compile/start."""
    job = COMPILE_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found or expired")
    return CompileStatusResponse(
        state=job["state"],
        started_at=job["started_at"],
        finished_at=job.get("finished_at"),
        result=job.get("result"),
        error=job.get("error"),
    )


@router.get("/setup-status")
async def setup_status():
    return await arduino_cli.get_setup_status()


@router.post("/ensure-core")
async def ensure_core(request: CompileRequest):
    fqbn = request.board_fqbn
    result = await arduino_cli.ensure_core_for_board(fqbn)
    return result


@router.get("/boards")
async def list_boards():
    boards = await arduino_cli.list_boards()
    return {"boards": boards}
