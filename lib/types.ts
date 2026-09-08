export type Role = 'admin' | 'driver' | 'family';
export type RideStatus =
  | 'pending'
  | 'accepted'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled';
export type DriverStatus = 'review' | 'approved' | 'suspended';
export interface Slot {
  day: number;
  enabled: boolean;
  start: string;
  end: string;
}
export interface Driver {
  id: string;
  name: string;
  email: string;
  phone: string;
  smsConsent?: boolean;
  school: string;
  dob: string;
  vehicle: string;
  plate: string;
  licenseExpiry: string;
  insuranceExpiry: string;
  status: DriverStatus;
  licenseChecked: boolean;
  insuranceChecked: boolean;
  guardianConsent: boolean;
  screeningChecked: boolean;
  notes: string;
  availability: Slot[];
  createdAt: string;
  hours: number;
  rides: number;
  rating: number;
}
export interface Family {
  id: string;
  guardian: string;
  email: string;
  phone: string;
  smsConsent?: boolean;
  student: string;
  school: string;
  consent: boolean;
  emergency: string;
  notes: string;
  createdAt: string;
}
export interface Anchor {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
  notes: string;
  active: boolean;
}
export interface Ride {
  id: string;
  familyId: string;
  driverId: string | null;
  pickupId: string;
  dropoffId: string;
  scheduledAt: string;
  status: RideStatus;
  activity: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  otp: string | null;
  otpExpiresAt: string | null;
  otpAttempts: number;
  lat: number | null;
  lng: number | null;
  locationAt: string | null;
  locationReceivedAt?: string | null;
  pickupSnapshot?: Anchor;
  dropoffSnapshot?: Anchor;
  accuracy: number | null;
  locationSource?: 'device' | 'simulation' | null;
  rating: number | null;
  feedback: string;
  cancelReason: string;
}
export interface Activity {
  id: string;
  rideId: string | null;
  message: string;
  createdAt: string;
  kind: string;
  resolved: boolean;
  note: string;
}
export interface Member {
  email: string;
  role: Role;
  recordId: string | null;
  name: string;
}
export interface Settings {
  coordinator: string;
  contactPhone: string;
  pilotName: string;
  smsConsent?: boolean;
}
export interface State {
  demo: boolean;
  role: Role;
  recordId: string | null;
  name: string;
  email: string;
  drivers: Driver[];
  families: Family[];
  anchors: Anchor[];
  rides: Ride[];
  events: Activity[];
  members: Member[];
  settings: Settings;
  serverTime: string;
}
export const DEFAULT_SLOTS: Slot[] = Array.from({ length: 7 }, (_, day) => ({
  day,
  enabled: day > 0 && day < 6,
  start: '15:00',
  end: '18:30',
}));
export const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
export const time = (v: string) =>
  new Date(v).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
  });
export const date = (v: string) =>
  new Date(v).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Chicago',
  });
export const dateKey = (v: string) =>
  new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/Chicago',
  }).format(new Date(v));
export const active = (s: RideStatus) =>
  ['accepted', 'arrived', 'in_progress'].includes(s);
export const DRIVER_CHECKS = [
  ['licenseChecked', 'Driver’s license & passenger restrictions reviewed'],
  ['insuranceChecked', 'Insurance coverage reviewed'],
  ['guardianConsent', 'Driver / guardian consent on file'],
  ['screeningChecked', 'Screening & orientation completed'],
] as const;
