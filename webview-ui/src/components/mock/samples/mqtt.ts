/**
 * MQTT mock broker sample topic configurations.
 * Each sample provides a set of topics with auto-publish payloads for testing.
 */

export interface MQTTSample {
  id: string;
  label: string;
  description: string;
  topics: Array<{
    topic: string;
    qos: 0 | 1 | 2;
    retain: boolean;
    payload: string;
    intervalMs: number;
  }>;
}

export const MQTT_SAMPLES: MQTTSample[] = [
  {
    id: 'iot-sensors',
    label: 'IoT Sensor Network',
    description: 'Temperature, humidity, and pressure sensors publishing periodic readings',
    topics: [
      { topic: 'sensors/livingroom/temperature', qos: 0, retain: true, payload: '{"value": 22.5, "unit": "°C", "battery": 85, "deviceId": "sensor-001"}', intervalMs: 5000 },
      { topic: 'sensors/livingroom/humidity', qos: 0, retain: true, payload: '{"value": 45.2, "unit": "%", "battery": 85, "deviceId": "sensor-001"}', intervalMs: 5000 },
      { topic: 'sensors/outdoor/temperature', qos: 1, retain: true, payload: '{"value": 18.3, "unit": "°C", "battery": 72, "deviceId": "sensor-002"}', intervalMs: 10000 },
      { topic: 'sensors/outdoor/pressure', qos: 1, retain: true, payload: '{"value": 1013.25, "unit": "hPa", "trend": "rising", "deviceId": "sensor-002"}', intervalMs: 15000 },
    ],
  },
  {
    id: 'smart-home',
    label: 'Smart Home Hub',
    description: 'Home automation with lights, thermostat, locks, and motion detection',
    topics: [
      { topic: 'home/lights/livingroom/state', qos: 1, retain: true, payload: '{"on": true, "brightness": 80, "color": "#fff4e0", "mode": "warm"}', intervalMs: 0 },
      { topic: 'home/thermostat/state', qos: 1, retain: true, payload: '{"current": 21.5, "target": 22.0, "mode": "heating", "humidity": 42}', intervalMs: 10000 },
      { topic: 'home/lock/front/state', qos: 2, retain: true, payload: '{"locked": true, "battery": 90, "lastActivity": "2026-05-24T09:00:00Z", "method": "auto"}', intervalMs: 0 },
      { topic: 'home/motion/hallway', qos: 0, retain: false, payload: '{"detected": true, "confidence": 0.95, "timestamp": "2026-05-24T10:30:15Z"}', intervalMs: 8000 },
    ],
  },
  {
    id: 'vehicle-telemetry',
    label: 'Vehicle Telemetry',
    description: 'Connected vehicle sending GPS, speed, engine, and diagnostic data',
    topics: [
      { topic: 'vehicles/truck-001/gps', qos: 1, retain: false, payload: '{"lat": 40.7128, "lng": -74.0060, "speed": 55, "heading": 270, "altitude": 15}', intervalMs: 3000 },
      { topic: 'vehicles/truck-001/engine', qos: 0, retain: false, payload: '{"rpm": 2400, "fuelLevel": 65, "oilTemp": 95, "coolantTemp": 88, "load": 42}', intervalMs: 5000 },
      { topic: 'vehicles/truck-001/diagnostics', qos: 2, retain: true, payload: '{"dtcCodes": [], "batteryVoltage": 12.6, "odometer": 45230, "serviceIn": 5000}', intervalMs: 30000 },
      { topic: 'vehicles/truck-001/alerts', qos: 2, retain: false, payload: '{"type": "geofence_exit", "zone": "warehouse-district", "severity": "warning"}', intervalMs: 20000 },
    ],
  },
  {
    id: 'industrial-plc',
    label: 'Industrial PLC / SCADA',
    description: 'Factory floor with conveyor belt speed, tank levels, and alarm states',
    topics: [
      { topic: 'factory/line1/conveyor/speed', qos: 1, retain: true, payload: '{"metersPerMin": 12.5, "status": "running", "itemCount": 4521, "efficiency": 94.2}', intervalMs: 2000 },
      { topic: 'factory/line1/tank/level', qos: 1, retain: true, payload: '{"percent": 72, "liters": 3600, "flowRate": 2.5, "temperature": 25.3}', intervalMs: 5000 },
      { topic: 'factory/line1/alarms', qos: 2, retain: true, payload: '{"active": [], "lastCleared": "2026-05-24T08:00:00Z", "totalToday": 2}', intervalMs: 0 },
      { topic: 'factory/line1/energy', qos: 0, retain: false, payload: '{"kW": 145.8, "kWh_today": 1230, "powerFactor": 0.95, "phase": "balanced"}', intervalMs: 10000 },
    ],
  },
  {
    id: 'chat-presence',
    label: 'Chat / Presence System',
    description: 'User presence, typing indicators, and message delivery confirmations',
    topics: [
      { topic: 'chat/room/general/messages', qos: 1, retain: false, payload: '{"id": "msg-001", "from": "alice", "text": "Hey everyone!", "timestamp": "2026-05-24T10:30:00Z"}', intervalMs: 8000 },
      { topic: 'chat/users/alice/presence', qos: 1, retain: true, payload: '{"status": "online", "lastSeen": "2026-05-24T10:30:00Z", "device": "desktop"}', intervalMs: 0 },
      { topic: 'chat/room/general/typing', qos: 0, retain: false, payload: '{"user": "bob", "isTyping": true}', intervalMs: 6000 },
      { topic: 'chat/users/bob/presence', qos: 1, retain: true, payload: '{"status": "away", "lastSeen": "2026-05-24T10:25:00Z", "device": "mobile"}', intervalMs: 0 },
    ],
  },
  {
    id: 'weather-station',
    label: 'Weather Station Network',
    description: 'Multi-station weather monitoring with forecasts and alerts',
    topics: [
      { topic: 'weather/station-01/current', qos: 0, retain: true, payload: '{"temp": 24.5, "humidity": 55, "windSpeed": 12, "windDir": "NW", "pressure": 1015, "visibility": 10}', intervalMs: 10000 },
      { topic: 'weather/station-01/rain', qos: 1, retain: true, payload: '{"rate": 0, "today": 2.5, "probability": 30, "forecast": "partly_cloudy"}', intervalMs: 30000 },
      { topic: 'weather/alerts/region-east', qos: 2, retain: true, payload: '{"type": "none", "severity": "info", "message": "Clear conditions expected", "validUntil": "2026-05-25T06:00:00Z"}', intervalMs: 0 },
      { topic: 'weather/station-01/uv', qos: 0, retain: false, payload: '{"index": 6, "level": "high", "burnTime": 25, "recommendation": "sunscreen"}', intervalMs: 15000 },
    ],
  },
  {
    id: 'energy-grid',
    label: 'Smart Energy Grid',
    description: 'Solar panels, battery storage, grid import/export, and consumption',
    topics: [
      { topic: 'energy/solar/production', qos: 1, retain: true, payload: '{"watts": 3500, "today_kWh": 18.5, "efficiency": 92, "panels_active": 12}', intervalMs: 5000 },
      { topic: 'energy/battery/state', qos: 1, retain: true, payload: '{"soc": 75, "power": -1500, "voltage": 48.2, "temperature": 28, "health": 98}', intervalMs: 10000 },
      { topic: 'energy/grid/exchange', qos: 0, retain: false, payload: '{"importing": false, "watts": -500, "today_export_kWh": 4.2, "tariff": "off-peak"}', intervalMs: 5000 },
      { topic: 'energy/consumption/total', qos: 0, retain: false, payload: '{"watts": 2500, "today_kWh": 12.3, "topDevice": "HVAC", "topDeviceWatts": 1200}', intervalMs: 3000 },
    ],
  },
  {
    id: 'fleet-tracking',
    label: 'Delivery Fleet Tracking',
    description: 'Delivery vehicles with real-time position, ETAs, and package status',
    topics: [
      { topic: 'fleet/van-101/position', qos: 0, retain: false, payload: '{"lat": 51.5074, "lng": -0.1278, "speed": 35, "heading": 90, "accuracy": 5}', intervalMs: 3000 },
      { topic: 'fleet/van-101/delivery', qos: 2, retain: true, payload: '{"current": "PKG-445", "status": "in_transit", "eta": "2026-05-24T11:15:00Z", "remaining": 8}', intervalMs: 15000 },
      { topic: 'fleet/van-101/status', qos: 1, retain: true, payload: '{"driver": "John D.", "shift": "morning", "fuelPercent": 55, "nextStop": "123 Main St"}', intervalMs: 0 },
      { topic: 'fleet/dispatch/assignments', qos: 2, retain: true, payload: '{"van-101": 8, "van-102": 12, "van-103": 5, "unassigned": 3, "total": 28}', intervalMs: 30000 },
    ],
  },
  {
    id: 'health-monitor',
    label: 'Health / Wearable Monitor',
    description: 'Wearable device streaming heart rate, steps, sleep, and alerts',
    topics: [
      { topic: 'health/user-42/heartrate', qos: 0, retain: false, payload: '{"bpm": 72, "zone": "resting", "variability": 45, "timestamp": "2026-05-24T10:30:00Z"}', intervalMs: 3000 },
      { topic: 'health/user-42/activity', qos: 1, retain: true, payload: '{"steps": 4520, "calories": 180, "distance": 3.2, "activeMinutes": 35, "goal": 10000}', intervalMs: 10000 },
      { topic: 'health/user-42/sleep', qos: 1, retain: true, payload: '{"duration": 7.5, "quality": 82, "deepSleep": 1.8, "remSleep": 2.1, "awakenings": 2}', intervalMs: 0 },
      { topic: 'health/user-42/alerts', qos: 2, retain: false, payload: '{"type": "hydration_reminder", "message": "Time to drink water!", "priority": "low"}', intervalMs: 20000 },
    ],
  },
  {
    id: 'gaming-leaderboard',
    label: 'Game Leaderboard / Events',
    description: 'Multiplayer game with live scores, player events, and match updates',
    topics: [
      { topic: 'game/match-77/scores', qos: 1, retain: true, payload: '{"team_red": 15, "team_blue": 12, "round": 3, "timeLeft": 120, "status": "in_progress"}', intervalMs: 5000 },
      { topic: 'game/match-77/events', qos: 0, retain: false, payload: '{"player": "xNinja42", "action": "elimination", "target": "ProGamer99", "weapon": "sniper", "streak": 5}', intervalMs: 4000 },
      { topic: 'game/leaderboard/top10', qos: 1, retain: true, payload: '{"1": {"name": "xNinja42", "score": 2850}, "2": {"name": "ProGamer99", "score": 2720}, "3": {"name": "SpeedDemon", "score": 2680}}', intervalMs: 15000 },
      { topic: 'game/server/status', qos: 0, retain: true, payload: '{"players_online": 1250, "matches_active": 48, "avg_latency": 25, "region": "us-east"}', intervalMs: 30000 },
    ],
  },
];
