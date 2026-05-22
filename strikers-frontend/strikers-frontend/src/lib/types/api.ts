// =====================================================================
// API Contract Types — aligned with backend Notion docs (V1)
// =====================================================================

// ---------- Common ----------
export type ApiResponse<T = unknown> = {
	success: boolean;
	message?: string;
	data?: T;
};

export type ApiError = {
	success: false;
	message: string;
	error?: string;
	statusCode?: number;
};

// ---------- Auth / User ----------
export type UserRole = 'super_admin' | 'operator';

export type User = {
	_id: string;
	name: string;
	email: string;
	role: UserRole;
	organisation?: string;
	avatarUrl?: string;
	createdAt: string;
	updatedAt: string;
};

export type LoginRequest = {
	email: string;
	password: string;
};

export type LoginResponse = {
	user: User;
	accessToken: string;
};

export type RegisterRequest = {
	name: string;
	email: string;
	password: string;
	organisation?: string;
};

export type ChangePasswordRequest = {
	currentPassword: string;
	newPassword: string;
};

// ---------- Drone ----------
export type FrameType =
	| 'quadcopter'
	| 'hexacopter'
	| 'octocopter'
	| 'fixed_wing'
	| 'vtol'
	| 'tricopter'
	| 'fpv_quadcopter'
	| 'trg'
	| 'other';

export type FlightController = 'ardupilot' | 'px4' | 'dji' | 'betaflight' | 'other';

export type Drone = {
	_id: string;
	name: string;
	frameType: FrameType;
	flightController?: string;
	manufacturer?: string;
	model?: string;
	serialNumber?: string;
	maxTakeoffWeight?: number;
	payloadCapacity?: number; // kilograms
	propSize?: string;
	nightCapability?: string;
	range?: number; // km
	ewCompliance?: string;
	remarks?: string;
	registrationNumber?: string;
	tags?: string[];
	owner: string;
	totalFlightTime?: number; // seconds
	totalFlights?: number;
	status?: 'active' | 'inactive';
	createdAt: string;
	updatedAt: string;
};

export type CreateDroneRequest = Omit<
	Drone,
	'_id' | 'owner' | 'totalFlightTime' | 'totalFlights' | 'status' | 'createdAt' | 'updatedAt'
>;

// ---------- Operator (DGCA license records, separate from User accounts) ----------
export type Operator = {
	_id: string;
	name: string;
	email: string;
	licenseNumber: string;
	licenseExpiry: string;
	owner: string;
	createdAt: string;
	updatedAt: string;
};

export type CreateOperatorRequest = Omit<Operator, '_id' | 'owner' | 'createdAt' | 'updatedAt'>;

// ---------- Battery ----------
export type BatteryChemistry = 'lipo' | 'lion' | 'lifepo4' | 'nimh' | 'other';

export type Battery = {
	_id: string;
	name: string;
	chemistry: BatteryChemistry;
	cellCount: number;
	capacity: number;
	maxCycles: number;
	cyclesUsed?: number;
	healthPercent?: number;
	owner: string;
	createdAt: string;
	updatedAt: string;
};

export type CreateBatteryRequest = Omit<
	Battery,
	'_id' | 'owner' | 'cyclesUsed' | 'healthPercent' | 'createdAt' | 'updatedAt'
>;

// ---------- Mission ----------
export type MissionType =
	| 'survey'
	| 'inspection'
	| 'mapping'
	| 'delivery'
	| 'photography'
	| 'videography'
	| 'search_rescue'
	| 'training'
	| 'test_flight'
	| 'fpv'
	| 'other';

export type MissionStatus = 'draft' | 'pending_verification' | 'verified' | 'archived';

export type Mission = {
	_id: string;
	name: string;
	missionType: MissionType;
	status: MissionStatus;
	drone: string | Drone;
	operator: string | Operator;
	batteries: string[] | Battery[];
	notes?: string;
	owner: string;
	createdAt: string;
	updatedAt: string;
};

export type CreateMissionRequest = {
	name: string;
	missionType: MissionType;
	drone: string;
	operator: string;
	batteries: string[];
	notes?: string;
};

// ---------- Flight Log ----------
export type ParseStatus = 'queued' | 'parsing' | 'parsed' | 'failed';

export type FlightLog = {
	_id: string;
	originalFilename: string;
	storedPath: string;
	fileSize: number;
	fileExtension: string;
	parseStatus: ParseStatus;
	parseError?: string;

	// Populated after parse
	startTime?: string;
	endTime?: string;
	durationSeconds?: number;
	maxAltitudeMeters?: number;
	maxSpeedMps?: number;
	totalDistanceKm?: number;
	anomalyScore?: number;
	alertCount?: number;

	mission?: string | Mission; // optional — nullable per #002
	drone?: string | Drone;
	owner: string;

	telemetry?: TelemetryPoint[];
	events?: FlightEvent[];
	alerts?: FlightAlert[];

	createdAt: string;
	updatedAt: string;
};

export type TelemetryPoint = {
	t: number; // seconds from start
	lat?: number;
	lon?: number;
	alt?: number; // meters AGL
	speed?: number; // m/s
	voltage?: number;
	current?: number;
	hdop?: number;
	mode?: string;
};

export type FlightEvent = {
	t: number;
	type: string;
	message: string;
	severity?: 'info' | 'warn' | 'critical';
};

export type FlightAlert = {
	t: number;
	type: 'ekf_variance' | 'battery_sag' | 'gps_glitch' | 'vibration' | 'other';
	severity: 'warn' | 'critical';
	message: string;
};

export type FlightLogUploadResponse = {
	flightLog: FlightLog;
	mission?: Mission | null; // optional — backend no longer returns this per #003
};

// ---------- List query params ----------
export type ListParams = {
	page?: number;
	limit?: number;
	sort?: string;
	search?: string;
	owner?: string;
};
