"""
main.py
Drone Debrief — Python Parser Service (FastAPI)

Endpoints:
    POST /parse   — accepts a parse job, processes async, returns immediately
    GET  /health  — health check

Called by Node.js parserWorker.js via HTTP POST:
    {
        "log_id":    "<MongoDB FlightLog _id>",
        "file_url":  "<R2 file URL>",
        "log_type":  "ardupilot_bin | ardupilot_tlog | px4_ulg | csv | kml | skydroid",
        "mongo_uri": "<MongoDB connection string>"
    }
"""

import os
import sys
import tempfile
import traceback
import importlib
import httpx

from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel

from utils.db import get_db, mark_processing, mark_completed, mark_failed, write_parsed_data, update_mission_stats

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


@app.post('/parse')
async def parse(job: ParseJob, background_tasks: BackgroundTasks):
    """
    Accepts a parse job and processes it in the background.
    Returns immediately with 202 Accepted.
    """
    if job.log_type not in LOG_TYPE_PARSERS:
        raise HTTPException(status_code=400, detail=f'Unsupported log type: {job.log_type}')

    background_tasks.add_task(run_parse_job, job)
    return {'status': 'accepted', 'log_id': job.log_id}


async def run_parse_job(job: ParseJob):
    """Background task — downloads file, parses it, writes to MongoDB."""
    print(f'[parser] Starting job — logId={job.log_id} type={job.log_type}', flush=True)

    # DB connection
    try:
        db, client = get_db(job.mongo_uri)
    except Exception as e:
        print(f'[parser] DB connection failed: {e}', file=sys.stderr)
        return

    try:
        mark_processing(db, job.log_id)
    except Exception as e:
        print(f'[parser] Failed to mark processing: {e}', file=sys.stderr)
        client.close()
        return

    # Download file from R2 to a temp file
    ext = LOG_TYPE_EXTENSIONS.get(job.log_type, '.bin')
    tmp_path = None

    try:
        with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as tmp:
            tmp_path = tmp.name
            async with httpx.AsyncClient(timeout=120) as http:
                async with http.stream('GET', job.file_url) as response:
                    response.raise_for_status()
                    async for chunk in response.aiter_bytes(chunk_size=1024 * 1024):
                        tmp.write(chunk)

        print(f'[parser] Downloaded to {tmp_path}', flush=True)

    except Exception as e:
        msg = f'File download failed: {str(e)}'
        print(f'[parser] ERROR: {msg}', file=sys.stderr)
        mark_failed(db, job.log_id, msg)
        client.close()
        _cleanup(tmp_path)
        return

    # Run parser
    try:
        parser_module = importlib.import_module(LOG_TYPE_PARSERS[job.log_type])
        print(f'[parser] Running {LOG_TYPE_PARSERS[job.log_type]}...', flush=True)
        parsed_data = parser_module.parse(tmp_path)

    except Exception as e:
        msg = f'Parse failed: {str(e)}'
        print(f'[parser] ERROR: {msg}', file=sys.stderr)
        traceback.print_exc()
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
    except Exception as e:
        print(f'[parser] WARNING: Could not fetch FlightLog refs: {e}', file=sys.stderr)
        mission_id = None
        owner_id   = None

    # Write ParsedFlightData
    try:
        parsed_data_id = write_parsed_data(db, job.log_id, mission_id, owner_id, parsed_data)
        print(f'[parser] ParsedFlightData written: {parsed_data_id}', flush=True)
    except Exception as e:
        msg = f'DB write failed: {str(e)}'
        print(f'[parser] ERROR: {msg}', file=sys.stderr)
        mark_failed(db, job.log_id, msg)
        client.close()
        return

    # Update Mission stats
    try:
        if mission_id:
            update_mission_stats(db, mission_id, parsed_data.get('summary', {}))
    except Exception as e:
        print(f'[parser] WARNING: Mission stats update failed: {e}', file=sys.stderr)

    # Mark completed
    try:
        mark_completed(db, job.log_id, parsed_data_id)
        print(f'[parser] Done — logId={job.log_id}', flush=True)
    except Exception as e:
        print(f'[parser] WARNING: Failed to mark completed: {e}', file=sys.stderr)

    client.close()


def _cleanup(path):
    if path:
        try:
            os.unlink(path)
        except Exception:
            pass
