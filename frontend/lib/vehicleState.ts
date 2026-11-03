// Vehicle state as returned by GET /vehicle/state (backend/models.py VehicleState)
export interface VehicleState {
  is_locked: boolean;
  child_lock_on?: boolean;
  climate_on: boolean;
  climate_temp: number;
  battery_level: number;
  is_preconditioning: boolean;
  vehicle_mode: string;
  frunk_open: boolean;
  trunk_open: boolean;
  suspension_level: string;
  connectivity_mode?: string;
  camp_mode?: boolean;
  seat_heating_driver: number;
  seat_heating_passenger: number;
  seat_ventilation_driver: number;
  seat_ventilation_passenger: number;
  air_purification_on: boolean;
  recirculation_on: boolean;
  aqi: number | null;
}
