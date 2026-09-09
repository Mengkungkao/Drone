CREATE TABLE safety_status (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    state TEXT NOT NULL CHECK (state IN ('DISCONNECTED', 'FAULT', 'EMERGENCY_STOP')),
    reason TEXT NOT NULL
);
INSERT INTO safety_status(singleton, state, reason)
VALUES (1, 'DISCONNECTED', 'Phase 0: no hardware connection or simulator transport is available.');

