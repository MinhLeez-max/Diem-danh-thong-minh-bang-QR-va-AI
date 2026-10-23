import type { Generated, Selectable } from "kysely";

export interface ClassroomTable {
  id: Generated<number>;
  name: string;
  subject: string;
  room: string;
}
export interface StudentTable {
  id: Generated<number>;
  classId: number;
  fullName: string;
  studentCode: string;
}
export interface AttendanceSessionTable {
  id: Generated<number>;
  classId: number;
  status: Generated<string>;
  startedAt: Generated<Date>;
  endedAt: Generated<Date | null>;
  qrToken: string;
  qrExpiresAt: Date;
}
export interface AttendanceRecordTable {
  id: Generated<number>;
  sessionId: number;
  studentId: number;
  status: Generated<string>;
  checkedInAt: Generated<Date | null>;
  note: Generated<string | null>;
  updatedAt: Generated<Date>;
}
export interface CountSnapshotTable {
  id: Generated<number>;
  sessionId: number;
  estimatedCount: number;
  confidence: number;
  source: string;
  capturedAt: Generated<Date>;
}
export interface SchoolUserTable {
  id: Generated<number>;
  clerkUserId: string;
  email: Generated<string>;
  displayName: Generated<string>;
  role: Generated<string>;
  studentId: Generated<number | null>;
  createdAt: Generated<Date>;
}
export interface TeacherClassAssignmentTable {
  id: Generated<number>;
  schoolUserId: number;
  classId: number;
  createdAt: Generated<Date>;
}
export interface Database {
  classrooms: ClassroomTable;
  students: StudentTable;
  attendanceSessions: AttendanceSessionTable;
  attendanceRecords: AttendanceRecordTable;
  countSnapshots: CountSnapshotTable;
  schoolUsers: SchoolUserTable;
  teacherClassAssignments: TeacherClassAssignmentTable;
}
export type Classroom = Selectable<ClassroomTable>;
export type Student = Selectable<StudentTable>;
export type AttendanceSession = Selectable<AttendanceSessionTable>;
export type AttendanceRecord = Selectable<AttendanceRecordTable>;
export type SchoolUser = Selectable<SchoolUserTable>;
