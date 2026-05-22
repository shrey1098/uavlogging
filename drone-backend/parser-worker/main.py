"""
main.py
Drone Debrief — Python Parser Service (FastAPI)

Endpoints:
    POST /parse   — accepts a parse job, processes async, returns immediately
    GET  /health  — health check

Called by Node.js parserWorker.js via HTTP POST:
    {
        "log_id":    "<MongoDB FlightLog _id>",
        "file_url":  "<R2 public/presigned URL>",
        "log_type":  "ardupilot_bin | ardupilot_tlog | px4_ulg | csv | kml | skydroid",
        "mongo_uri": "<MongoDB connection string>"
    }
"""

import os
import sys
import logging
import tempfile
import traceback
import importlib
import httpx

from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel

from utils.db import get_db, mark_processing, mark_completed, mark_failed, write_parsed_data, update_mission_stats

# ── Logging setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    stream=sys.stdout,
    force=True,
)
log = logging.getLogger('parser')

app = FastAPI(title='Drone Debrief Parser Service', version='1.0.0')

LOG_TYPE_PARSERS = {
    'ardupilot_bin':  'parsers.ardupilot_bin',
    'ardupilot_tlog': 'parsers.ardupilot_tlog',
    'px4_ulg':        'parsers.px4_ulg',
    'csv':            'parsers.csv_parser',
    'kml':            'parsers.kml_parser',
    'skydroid':       'parsers.skydroid',
}

LOG_TYPE_EXTENSIONS = {
    'ardupilot_bin':  '.bin',
    'ardupilot_tlog': '.tlog',
    'px4_ulg':        '.ulg',
    'csv':            '.csv',
    'kml':            '.kml',
    'skydroid':       '.log',
}


class ParseJob(BaseModel):
    log_id:    str
    file_url:  str
    log_type:  str
    mongo_uri: str


@app.get('/health')
def health():
    return {'status': 'ok', 'service': 'drone-debrief-parser'}


# #004 portability: this is the cross-host entrypoint. File transfer
# is by R2 URL (file_url), already host-independent. No structural
# change required when parser moves to its own host.
@app.post('/parse', status_code=202)
async def parse(job: ParseJob, background_tasks: BackgroundTasks):
    """Accepts a parse job and processes it in the background. Returns 202 immediately."""
    if job.log_type not in LOG_TYPE_PARSERS:
        raise HTTPException(status_code=400, detail=f'Unsupported log type: {job.log_type}')

    log.info(f'Job accepted — logId={job.log_id} type={job.log_type}')
    background_tasks.add_task(run_parse_job, job)
    return {'status': 'accepted', 'log_id': job.log_id}


async def run_parse_job(job: ParseJob):
    """Background task — downloads file from R2, parses it, writes to MongoDB."""
    log.info(f'Starting — logId={job.log_id} type={job.log_type}')

    # DB connection
    try:
        db, client = get_db(job.mongo_uri)
    except Exception as e:
        log.error(f'DB connection failed: {e}')
        return

    try:
        mark_processing(db, job.log_id)
        log.info(f'Marked processing — logId={job.log_id}')
    except Exception as e:
        log.error(f'Failed to mark processing: {e}')
        client.close()
        return

    # Download file from R2 to a temp file
    ext = LOG_TYPE_EXTENSIONS.get(job.log_type, '.bin')
    tmp_path = None

    try:
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp_path = tmp.name
            log.info(f'Downloading {job.file_url} → {tmp_path}')
            async with httpx.AsyncClient(timeout=120) as http:
                async with http.stream('GET', job.file_url) as response:
                    response.raise_for_status()
                    async for chunk in response.aiter_bytes(chunk_size=1024 * 1024):
                        tmp.write(chunk)
        log.info(f'Download complete — {os.path.getsize(tmp_path)} bytes')

    except Exception as e:
        msg = f'File download failed: {str(e)}'
        log.error(msg)
        mark_failed(db, job.log_id, msg)
        client.close()
        _cleanup(tmp_path)
        return

    # Run parser
    try:
        module_name = LOG_TYPE_PARSERS[job.log_type]
        log.info(f'Running {module_name}')
        parser_module = importlib.import_module(module_name)
        parsed_data = parser_module.parse(tmp_path)
        log.info(f'Parse complete — anomalyScore={parsed_data.get("anomalyScore")}')

    except Exception as e:
        msg = f'Parse failed: {str(e)}'
        log.error(msg)
        log.error(traceback.format_exc())
        mark_failed(db, job.log_id, msg)
        client.close()
        _cleanup(tmp_path)
        return

    finally:
        _cleanup(tmp_path)

    # Fetch FlightLog refs
    try:
        from bson import ObjectId
        flight_log = db.flightlogs.find_one({'_id': ObjectId(job.log_id)})
        mission_id = str(flight_log['mission']) if flight_log and flight_log.get('mission') else None
        owner_id   = str(flight_log['owner'])   if flight_log and flight_log.get('owner')   else None
        log.info(f'FlightLog refs — mission={mission_id} owner={owner_id}')
    except Exception as e:
        log.warning(f'Could not fetch FlightLog refs: {e}')
        mission_id = None
        owner_id   = None

    # Write ParsedFlightData
    try:
        parsed_data_id = write_parsed_data(db, job.log_id, mission_id, owner_id, parsed_data)
        log.info(f'ParsedFlightData written — id={parsed_data_id}')
    except Exception as e:
        msg = f'DB write failed: {str(e)}'
        log.error(msg)
        mark_failed(db, job.log_id, msg)
        client.close()
        return

    # Update Mission stats
    try:
        if mission_id:
            update_mission_stats(db, mission_id, parsed_data.get('summary', {}))
            log.info(f'Mission stats updated — missionId={mission_id}')
    except Exception as e:
        log.warning(f'Mission stats update failed: {e}')

    # Mark completed
    try:
        mark_completed(db, job.log_id, parsed_data_id)
        log.info(f'DONE — logId={job.log_id}')
    except Exception as e:
        log.warning(f'Failed to mark completed: {e}')

    client.close()


def _cleanup(path):
    if path:
        try:
            os.unlink(path)
        except Exception:
            pass
