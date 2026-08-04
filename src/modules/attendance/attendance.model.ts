import { Schema, model, Types, type Model, type HydratedDocument } from 'mongoose';
import { ATTENDANCE_STATUS, type AttendanceStatus } from '../../config/constants';

export type AttendanceSource = 'self' | 'staff' | 'qr';

export interface IAttendance {
  gym: Types.ObjectId;
  member: Types.ObjectId;
  checkInAt: Date;
  checkOutAt: Date | null;
  status: AttendanceStatus;
  source: AttendanceSource;
  recordedBy?: Types.ObjectId;
  durationMinutes: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AttendanceModel = Model<IAttendance>;
export type AttendanceDocument = HydratedDocument<IAttendance>;

const attendanceSchema = new Schema<IAttendance, AttendanceModel>(
  {
    gym: { type: Schema.Types.ObjectId, ref: 'Gym', required: true, index: true },
    member: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    checkInAt: { type: Date, required: true, default: Date.now },
    checkOutAt: { type: Date, default: null },
    status: {
      type: String,
      enum: Object.values(ATTENDANCE_STATUS),
      default: ATTENDANCE_STATUS.CHECKED_IN,
      index: true,
    },
    source: { type: String, enum: ['self', 'staff', 'qr'], default: 'self' },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    durationMinutes: { type: Number, default: null },
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

attendanceSchema.index({ member: 1, checkInAt: -1 });
// Speeds up the "open check-in" lookup (unique-ish per member while checked in).
attendanceSchema.index({ gym: 1, member: 1, status: 1 });

export const Attendance = model<IAttendance, AttendanceModel>('Attendance', attendanceSchema);
export default Attendance;
