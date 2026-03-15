-- Add foreign key constraints for report_access table
-- Cascade delete: if a user deletes their account, remove their access grants

ALTER TABLE report_access
ADD CONSTRAINT fk_report_access_viewerid 
  FOREIGN KEY (viewerId) REFERENCES users(userid) ON DELETE CASCADE;

ALTER TABLE report_access
ADD CONSTRAINT fk_report_access_reporterid 
  FOREIGN KEY (reporterId) REFERENCES users(userid) ON DELETE CASCADE;
