export const TOPICS = {
  RIDE_REQUESTED: 'taxi.ride.requested',
  DRIVER_ASSIGNED: 'taxi.driver.assigned',
  RIDE_COMPLETED: 'taxi.ride.completed',
} as const;

export interface RideRequestedEvent {
  rideId: string;
  userId: string;
  pickup: string;
  dropoff: string;
}
export interface DriverAssignedEvent {
  rideId: string;
  driverId: string;
  eta: number;
}
export interface RideCompletedEvent {
  rideId: string;
  fare: number;
  duration: number;
}
