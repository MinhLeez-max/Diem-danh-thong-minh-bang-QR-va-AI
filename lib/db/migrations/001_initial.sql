CREATE TABLE dbo.classrooms (
  id int IDENTITY(1,1) PRIMARY KEY,
  name nvarchar(120) NOT NULL, subject nvarchar(120) NOT NULL, room nvarchar(120) NOT NULL
);
CREATE TABLE dbo.students (
  id int IDENTITY(1,1) PRIMARY KEY,
  class_id int NOT NULL REFERENCES dbo.classrooms(id),
  full_name nvarchar(120) NOT NULL,
  student_code nvarchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL UNIQUE
);
CREATE INDEX students_class_idx ON dbo.students(class_id);
CREATE TABLE dbo.attendance_sessions (
  id int IDENTITY(1,1) PRIMARY KEY,
  class_id int NOT NULL REFERENCES dbo.classrooms(id),
  status nvarchar(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed')),
  started_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(), ended_at datetime2(3) NULL,
  qr_token nvarchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL UNIQUE,
  qr_expires_at datetime2(3) NOT NULL
);
CREATE UNIQUE INDEX one_active_session_per_class ON dbo.attendance_sessions(class_id) WHERE status = 'active';
CREATE TABLE dbo.attendance_records (
  id int IDENTITY(1,1) PRIMARY KEY,
  session_id int NOT NULL REFERENCES dbo.attendance_sessions(id),
  student_id int NOT NULL REFERENCES dbo.students(id),
  status nvarchar(16) NOT NULL DEFAULT 'present' CHECK(status IN ('present','late','absent')),
  checked_in_at datetime2(3) NULL, note nvarchar(2000) NULL,
  updated_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT attendance_session_student_unique UNIQUE(session_id,student_id)
);
CREATE TABLE dbo.count_snapshots (
  id int IDENTITY(1,1) PRIMARY KEY,
  session_id int NOT NULL REFERENCES dbo.attendance_sessions(id),
  estimated_count int NOT NULL CHECK(estimated_count >= 0),
  confidence float NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  source nvarchar(32) NOT NULL, captured_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX count_snapshots_session_idx ON dbo.count_snapshots(session_id, captured_at DESC);
CREATE TABLE dbo.school_users (
  id int IDENTITY(1,1) PRIMARY KEY,
  clerk_user_id nvarchar(128) COLLATE Latin1_General_100_BIN2 NOT NULL UNIQUE,
  email nvarchar(320) NOT NULL DEFAULT '', display_name nvarchar(120) NOT NULL DEFAULT N'Tài khoản mới',
  role nvarchar(16) NOT NULL DEFAULT 'pending' CHECK(role IN ('admin','teacher','student','pending')),
  student_id int NULL REFERENCES dbo.students(id), created_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME()
);
-- SQL Server's ordinary UNIQUE constraint permits only one NULL. This filtered
-- index permits many unlinked accounts while preserving one account per pupil.
CREATE UNIQUE INDEX school_users_student_id_unique ON dbo.school_users(student_id) WHERE student_id IS NOT NULL;
CREATE TABLE dbo.teacher_class_assignments (
  id int IDENTITY(1,1) PRIMARY KEY,
  school_user_id int NOT NULL REFERENCES dbo.school_users(id),
  class_id int NOT NULL REFERENCES dbo.classrooms(id), created_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT teacher_class_assignment_unique UNIQUE(school_user_id,class_id)
);
