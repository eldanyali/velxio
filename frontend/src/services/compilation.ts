import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

export interface SketchFile {
  name: string;
  content: string;
}

export interface CompileResult {
  success: boolean;
  hex_content?: string;
  binary_content?: string; // base64-encoded .bin for RP2040
  binary_type?: 'bin' | 'uf2';
  has_wifi?: boolean; // True when sketch uses WiFi (ESP32 only)
  stdout: string;
  stderr: string;
  error?: string;
  core_install_log?: string;
}

interface CompileStartResponse {
  job_id: string;
}

interface CompileStatusResponse {
  state: 'pending' | 'running' | 'done' | 'error';
  started_at: number;
  finished_at: number | null;
  result: CompileResult | null;
  error: string | null;
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_DURATION_MS = 15 * 60 * 1000; // 15 minutes — covers cold ESP-IDF builds

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Compile a sketch via the async job pipeline.
 *
 *   POST /compile/start                  → { job_id }
 *   GET  /compile/status/<job_id>  (×N)  → { state, result?, error? }
 *
 * Each individual request returns in milliseconds, so Cloudflare's 100s edge
 * timeout never kicks in — even when the underlying ESP-IDF cold build runs
 * for 5-7 minutes. Falls back to throwing an Error after MAX_POLL_DURATION_MS.
 */
export async function compileCode(
  files: SketchFile[],
  board: string = 'arduino:avr:uno',
  projectId?: string | null,
): Promise<CompileResult> {
  console.log('Sending compilation request to:', `${API_BASE}/compile/start`);
  console.log('Board:', board);
  console.log(
    'Files:',
    files.map((f) => f.name),
  );

  let jobId: string;
  try {
    const startResp = await axios.post<CompileStartResponse>(
      `${API_BASE}/compile/start`,
      { files, board_fqbn: board, project_id: projectId ?? null },
      { withCredentials: true, timeout: 30000 },
    );
    jobId = startResp.data.job_id;
    console.log('[compile] queued job', jobId);
  } catch (error) {
    console.error('Compilation request failed:', error);
    if (axios.isAxiosError(error) && error.response) {
      // Server returned a structured error (422, 500, etc.) — surface as a
      // failed CompileResult so the editor can show stderr/error.
      return error.response.data as CompileResult;
    }
    throw error instanceof Error
      ? error
      : new Error('No response from server. Is the backend running?');
  }

  const startedAt = Date.now();
  // Initial small delay so we don't hit /status before the background task
  // has even moved past 'pending'.
  await sleep(500);

  while (true) {
    if (Date.now() - startedAt > MAX_POLL_DURATION_MS) {
      throw new Error(
        `Compile timed out client-side after ${Math.round(MAX_POLL_DURATION_MS / 1000)}s`,
      );
    }

    let status: CompileStatusResponse;
    try {
      const resp = await axios.get<CompileStatusResponse>(
        `${API_BASE}/compile/status/${jobId}`,
        { withCredentials: true, timeout: 30000 },
      );
      status = resp.data;
    } catch (error) {
      // Transient poll error — log, wait, retry. Only abort on 404 (job
      // expired or never existed).
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new Error(`Compile job ${jobId} not found (server may have restarted)`);
      }
      console.warn('[compile] status poll error, retrying:', error);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (status.state === 'done' && status.result) {
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      console.log(`[compile] job ${jobId} done in ${elapsed}s`);
      return status.result;
    }

    if (status.state === 'error') {
      console.error(`[compile] job ${jobId} errored:`, status.error);
      return {
        success: false,
        stdout: '',
        stderr: '',
        error: status.error || 'Compile failed',
      };
    }

    await sleep(POLL_INTERVAL_MS);
  }
}
