from pymongo import MongoClient
from bson import ObjectId
from datetime import datetime, timezone


def get_db(mongo_uri: str):
    client = MongoClient(mongo_uri, serverSelectionTimeoutMS=10000)
    db_name = MongoClient(mongo_uri).get_default_database().name if '/' in mongo_uri.split('?')[0] else 'drone_debrief'
    return client[db_name]


def get_db(mongo_uri: str):
    client = MongoClient(mongo_uri, serverSelectionTimeoutMS=10000)
    # Extract DB name from URI, fallback to drone_debrief
    path = mongo_uri.split('?')[0]
    parts = path.split('/')
    db_name = parts[-1] if len(parts) > 1 and parts[-1] else 'drone_debrief'
    return client[db_name], client


def mark_processing(db, log_id: str):
    db.flightlogs.update_one(
        {'_id': ObjectId(log_id)},
        {'$set': {
            'parseStatus': 'processing',
            'parseStartedAt': datetime.now(timezone.utc)
        }}
    )


def mark_completed(db, log_id: str, parsed_data_id):
    db.flightlogs.update_one(
        {'_id': ObjectId(log_id)},
        {'$set': {
            'parseStatus': 'completed',
            'parseCompletedAt': datetime.now(timezone.utc),
            'parsedData': parsed_data_id
        }}
    )


def mark_failed(db, log_id: str, error_message: str):
    db.flightlogs.update_one(
        {'_id': ObjectId(log_id)},
        {'$set': {
            'parseStatus': 'failed',
            'parseCompletedAt': datetime.now(timezone.utc),
            'parseError': {
                'message': error_message,
                'code': 'PARSE_ERROR'
            }
        }}
    )


def write_parsed_data(db, log_id: str, mission_id, owner_id, data: dict):
    doc = {
        'flightLog': ObjectId(log_id),
        'mission': ObjectId(mission_id) if mission_id else None,
        'owner': ObjectId(owner_id) if owner_id else None,
        'createdAt': datetime.now(timezone.utc),
        'updatedAt': datetime.now(timezone.utc),
        **data
    }
    result = db.parsedflightdatas.insert_one(doc)
    return result.inserted_id


def update_mission_stats(db, mission_id: str, summary: dict):
    if not mission_id:
        return
    update = {}
    if summary.get('flightDuration'):
        update['flightDuration'] = summary['flightDuration']
    if summary.get('maxAltitude'):
        update['maxAltitude'] = summary['maxAltitude']
    if summary.get('maxSpeed'):
        update['maxSpeed'] = summary['maxSpeed']
    if summary.get('totalDistance'):
        update['totalDistance'] = summary['totalDistance']
    if summary.get('actualStart'):
        update['actualStart'] = summary['actualStart']
    if summary.get('actualEnd'):
        update['actualEnd'] = summary['actualEnd']
    if update:
        db.missions.update_one(
            {'_id': ObjectId(mission_id)},
            {'$set': update}
        )
